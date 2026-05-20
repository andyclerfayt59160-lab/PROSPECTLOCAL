"""
Deduplication service.

Responsabilités:
- identifier les doublons exacts d'une même entreprise
- lier les fiches partageant un même téléphone
- créer une alerte quand un même téléphone apparaît sur plusieurs entités distinctes
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Optional
import uuid

from models import NotificationType
from utils.helpers import normalize_french_phone_full


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(value.lower().strip().split())


def build_identity_key(business: dict) -> Optional[str]:
    """
    Clé d'identité stricte pour dédoublonner une même entreprise.
    Ordre de priorité:
    - pl_reference
    - siret
    - siren
    - nom + adresse + ville
    """
    pl_reference = _normalize_text(business.get("pl_reference"))
    if pl_reference:
        return f"pl:{pl_reference}"

    siret = _normalize_text(business.get("siret"))
    if siret:
        return f"siret:{siret}"

    siren = _normalize_text(business.get("siren"))
    if siren:
        return f"siren:{siren}"

    name = _normalize_text(business.get("name"))
    address = _normalize_text(business.get("address"))
    city = _normalize_text(business.get("city"))
    if name and (address or city):
        return f"identity:{name}|{address}|{city}"

    return None


def choose_primary_business(group: list[dict]) -> dict:
    """
    Garde la fiche la plus stable comme primaire.
    """
    def sort_key(item: dict):
        created_at = item.get("created_at") or datetime.max
        rejected_phone = 1 if item.get("phone_source") in {"rejet_homonyme", "rejet_annuaire"} else 0
        has_phone = 0 if item.get("phone") and not rejected_phone else 1
        has_siret = 0 if item.get("siret") else 1
        return (rejected_phone, has_siret, has_phone, created_at, item.get("id", ""))

    return sorted(group, key=sort_key)[0]


async def reconcile_business_duplicates(db, user_id: str, scan_id: Optional[str] = None) -> dict:
    """
    Marque comme doublons les fiches exactes détectées plusieurs fois.
    """
    businesses = await db.businesses.find({}).to_list(length=10000)
    groups: dict[str, list[dict]] = defaultdict(list)
    reusable_scan_snapshot_ids: set[str] = set()

    if scan_id:
        scan_snapshots = await db.businesses.find(
            {
                "scan_id": scan_id,
                "is_new_in_scan": False,
            },
            {"_id": 0, "id": 1},
        ).to_list(length=5000)
        reusable_scan_snapshot_ids = {
            item["id"] for item in scan_snapshots if item.get("id")
        }

        # Scan snapshots are intentional "instances" reused in a new scan so
        # they must stay visible in the scan results even if the canonical
        # business already exists elsewhere in the database.
        if reusable_scan_snapshot_ids:
            await db.businesses.update_many(
                {"id": {"$in": list(reusable_scan_snapshot_ids)}},
                {
                    "$set": {
                        "is_duplicate": False,
                        "merged_into": None,
                        "status": "active",
                        "updated_at": datetime.utcnow(),
                    },
                    "$unset": {
                        "duplicate_reason": "",
                    },
                },
            )

    for business in businesses:
        if business.get("id") in reusable_scan_snapshot_ids:
            continue
        identity_key = build_identity_key(business)
        if identity_key:
            owner_scope = business.get("user_id") or "__global__"
            groups[f"{owner_scope}:{identity_key}"].append(business)

    duplicate_ids: list[str] = []
    primary_updates = 0

    for group in groups.values():
        if len(group) < 2:
            continue

        primary = choose_primary_business(group)
        duplicates = [item for item in group if item.get("id") != primary.get("id")]
        duplicate_ids.extend(item["id"] for item in duplicates if item.get("id"))

        linked_ids = sorted(
            {
                *(primary.get("linked_business_ids") or []),
                *(item.get("id") for item in duplicates if item.get("id")),
            }
        )

        result = await db.businesses.update_one(
            {"id": primary["id"]},
            {
                "$set": {
                    "is_duplicate": False,
                    "merged_into": None,
                    "status": "active",
                    "linked_business_ids": linked_ids,
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        primary_updates += result.modified_count

    duplicate_updates = 0
    if duplicate_ids:
        duplicate_updates = (
            await db.businesses.update_many(
                {"id": {"$in": duplicate_ids}},
                {
                    "$set": {
                        "is_duplicate": True,
                        "status": "duplicate",
                        "duplicate_reason": "exact_identity",
                        "updated_at": datetime.utcnow(),
                    }
                },
            )
        ).modified_count

        for identity_key, group in groups.items():
            if len(group) < 2:
                continue
            primary = choose_primary_business(group)
            primary_id = primary.get("id")
            if not primary_id:
                continue
            group_duplicate_ids = [item["id"] for item in group if item.get("id") and item.get("id") != primary_id]
            if not group_duplicate_ids:
                continue
            await db.businesses.update_many(
                {"id": {"$in": group_duplicate_ids}},
                {
                    "$set": {
                        "merged_into": primary_id,
                    }
                },
            )

    return {
        "duplicate_groups": sum(1 for group in groups.values() if len(group) > 1),
        "duplicate_marked": duplicate_updates,
        "primary_updated": primary_updates,
    }


async def reconcile_phone_conflicts(db, user_id: str, scan_id: Optional[str] = None) -> dict:
    """
    Signale les téléphones partagés entre plusieurs entités distinctes.
    Un conflit téléphone ne veut pas forcément dire doublon exact.
    """
    businesses = await db.businesses.find({
        "is_duplicate": {"$ne": True},
        "phone": {"$nin": ["", None]},
    }).to_list(length=10000)
    by_phone: dict[str, list[dict]] = defaultdict(list)

    for business in businesses:
        normalized_phone = normalize_french_phone_full(business.get("phone", ""))
        if normalized_phone:
            by_phone[normalized_phone].append(business)

    conflicts = []

    for normalized_phone, group in by_phone.items():
        if len(group) < 2:
            continue

        identity_keys = {build_identity_key(item) or item.get("id") for item in group}
        if len(identity_keys) < 2:
            continue

        business_ids = [item["id"] for item in group if item.get("id")]
        business_names = sorted({item.get("name", "Entreprise inconnue") for item in group})
        conflicts.append(
            {
                "phone": normalized_phone,
                "business_ids": business_ids,
                "business_names": business_names,
                "count": len(business_ids),
            }
        )

        await db.businesses.update_many(
            {"id": {"$in": business_ids}},
            {
                "$set": {
                    "linked_business_ids": [bid for bid in business_ids if bid],
                    "phone_conflict": True,
                    "phone_conflict_count": len(business_ids),
                    "phone_conflict_ids": business_ids,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        alert_key = f"phone_conflict:{normalized_phone}"
        if user_id:
            existing = await db.notifications.find_one(
                {
                    "user_id": user_id,
                    "type": NotificationType.SYSTEM.value,
                    "data.alert_key": alert_key,
                }
            )
            payload = {
                "title": "Conflit téléphone détecté",
                "message": f"Le numéro {normalized_phone} apparaît sur {len(business_ids)} fiches différentes.",
                "data": {
                    "alert_key": alert_key,
                    "phone": normalized_phone,
                    "business_ids": business_ids,
                    "business_names": business_names,
                    "count": len(business_ids),
                },
                "is_read": False,
                "created_at": datetime.utcnow(),
            }
            if existing:
                await db.notifications.update_one({"id": existing["id"]}, {"$set": payload})
            else:
                await db.notifications.insert_one(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "type": NotificationType.SYSTEM.value,
                        **payload,
                    }
                )

    return {
        "phone_conflicts": len(conflicts),
        "conflicts": conflicts,
    }


async def reconcile_detected_businesses(db, user_id: str, scan_id: Optional[str] = None) -> dict:
    """
    Point d'entrée unique:
    - dédoublonne les entreprises exactes
    - signale les conflits de téléphone sur les fiches restantes
    """
    duplicate_result = await reconcile_business_duplicates(db, user_id, scan_id=scan_id)
    phone_result = await reconcile_phone_conflicts(db, user_id, scan_id=scan_id)
    return {
        **duplicate_result,
        **phone_result,
    }
