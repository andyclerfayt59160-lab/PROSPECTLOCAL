"""
Statistics & Export Router

Gère les endpoints de statistiques et d'export :
- GET /stats - Statistiques générales
- GET /stats/trends - Tendances
- GET /export/leads - Export intelligent
- GET /export/presets - Presets d'export
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from datetime import datetime, timedelta
from typing import Optional, List
import csv
import io
import logging

from auth import get_current_user
from utils.dependencies import get_database

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["Statistics & Export"])


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get user statistics"""
    db = get_database()
    user_id = current_user["sub"]
    
    # Get user's scans
    scans = await db.scans.find({"user_id": user_id}).to_list(1000)
    scan_ids = [s["id"] for s in scans]
    
    # Count businesses
    total_businesses = await db.businesses.count_documents({"scan_id": {"$in": scan_ids}})
    
    # Count with phone
    with_phone = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "phone": {"$nin": [None, ""]}
    })
    
    # Count by source
    google_count = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "source": "google"
    })
    pappers_count = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "source": "pappers"
    })
    
    # Surveillance stats
    surveillances = await db.surveillance_zones.count_documents({"user_id": user_id, "is_active": True})
    alerts = await db.surveillance_alerts.count_documents({"user_id": user_id})
    
    return {
        "total_scans": len(scans),
        "total_businesses": total_businesses,
        "with_phone": with_phone,
        "phone_rate": round(with_phone / total_businesses * 100, 1) if total_businesses > 0 else 0,
        "google_count": google_count,
        "pappers_count": pappers_count,
        "active_surveillances": surveillances,
        "total_alerts": alerts
    }


@router.get("/stats/trends")
async def get_stats_trends(
    current_user: dict = Depends(get_current_user),
    days: int = Query(30, ge=7, le=90)
):
    """Get statistics trends over time"""
    db = get_database()
    user_id = current_user["sub"]
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get scans by date
    pipeline = [
        {"$match": {"user_id": user_id, "created_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    scans_by_date = await db.scans.aggregate(pipeline).to_list(100)
    
    # Get businesses by date
    scan_ids = [s["id"] for s in await db.scans.find({"user_id": user_id}).to_list(1000)]
    
    pipeline = [
        {"$match": {"scan_id": {"$in": scan_ids}, "created_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "total": {"$sum": 1},
            "with_phone": {"$sum": {"$cond": [{"$and": [
                {"$ne": ["$phone", None]},
                {"$ne": ["$phone", ""]}
            ]}, 1, 0]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    businesses_by_date = await db.businesses.aggregate(pipeline).to_list(100)
    
    # Get alerts by date
    pipeline = [
        {"$match": {"user_id": user_id, "created_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    alerts_by_date = await db.surveillance_alerts.aggregate(pipeline).to_list(100)
    
    return {
        "period_days": days,
        "scans": scans_by_date,
        "businesses": businesses_by_date,
        "alerts": alerts_by_date
    }


@router.get("/export/leads")
async def export_leads_intelligent(
    current_user: dict = Depends(get_current_user),
    has_phone: Optional[bool] = Query(None),
    has_email: Optional[bool] = Query(None),
    has_siret: Optional[bool] = Query(None),
    source: Optional[str] = Query(None),
    min_score: Optional[int] = Query(None, ge=0, le=100),
    max_age_days: Optional[int] = Query(None, ge=1, le=730),
    sales_status: Optional[str] = Query(None),
    scan_id: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    format: str = Query("csv"),
    columns: Optional[str] = Query(None)
):
    """Export leads with intelligent filters"""
    db = get_database()
    user_id = current_user["sub"]
    
    # Get user's scans
    user_scans = await db.scans.find({"user_id": user_id}).to_list(1000)
    scan_ids = [s["id"] for s in user_scans]
    
    if scan_id:
        if scan_id not in scan_ids:
            raise HTTPException(status_code=403, detail="Scan non autorisé")
        scan_ids = [scan_id]
    
    # Build query
    query = {"scan_id": {"$in": scan_ids}}
    
    if has_phone is True:
        query["phone"] = {"$nin": [None, ""]}
    elif has_phone is False:
        query["$or"] = [{"phone": None}, {"phone": ""}]
    
    if has_email is True:
        query["email"] = {"$nin": [None, ""]}
    
    if has_siret is True:
        query["siret"] = {"$nin": [None, ""]}
    
    if source:
        query["source"] = source
    
    if min_score is not None:
        query["score"] = {"$gte": min_score}
    
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    
    if domain:
        domain_scans = [s["id"] for s in user_scans if domain.lower() in (s.get("activity_id", "") or "").lower()]
        query["scan_id"] = {"$in": domain_scans}
    
    # Fetch businesses
    businesses = await db.businesses.find(query).to_list(5000)
    
    # Post-filter by age
    if max_age_days:
        cutoff_date = datetime.utcnow() - timedelta(days=max_age_days)
        filtered = []
        for b in businesses:
            date_creation = b.get("date_creation")
            if date_creation:
                if isinstance(date_creation, str):
                    try:
                        date_creation = datetime.fromisoformat(date_creation.replace("Z", "+00:00"))
                    except:
                        try:
                            date_creation = datetime.strptime(date_creation[:10], "%Y-%m-%d")
                        except:
                            continue
                if date_creation and date_creation >= cutoff_date:
                    filtered.append(b)
        businesses = filtered
    
    # Filter by sales status
    if sales_status:
        business_ids = [b["id"] for b in businesses]
        statuses = await db.user_business_status.find({
            "user_id": user_id,
            "business_id": {"$in": business_ids},
            "sales_status": sales_status
        }).to_list(5000)
        status_business_ids = {s["business_id"] for s in statuses}
        businesses = [b for b in businesses if b["id"] in status_business_ids]
    
    # Enrich with status data
    business_ids = [b["id"] for b in businesses]
    statuses = await db.user_business_status.find({
        "user_id": user_id,
        "business_id": {"$in": business_ids}
    }).to_list(5000)
    status_map = {s["business_id"]: s for s in statuses}
    
    # Get scan labels
    scan_labels = {s["id"]: s.get("query_label", s.get("activity_id", "")) for s in user_scans}
    
    # Define columns
    all_columns = [
        "pl_reference", "name", "address", "postal_code", "city",
        "phone", "email", "website", "siret", "siren",
        "source", "score", "date_creation", "sales_status", "notes",
        "google_rating", "google_reviews_count", "scan_label"
    ]
    
    if columns:
        requested_cols = [c.strip() for c in columns.split(",")]
        export_columns = [c for c in requested_cols if c in all_columns]
    else:
        export_columns = all_columns
    
    # Prepare data
    export_data = []
    for b in businesses:
        status = status_map.get(b["id"], {})
        row = {
            "pl_reference": b.get("pl_reference", ""),
            "name": b.get("name", ""),
            "address": b.get("address", ""),
            "postal_code": b.get("postal_code", ""),
            "city": b.get("city", ""),
            "phone": b.get("phone", ""),
            "email": b.get("email", ""),
            "website": b.get("website", ""),
            "siret": b.get("siret", ""),
            "siren": b.get("siren", ""),
            "source": b.get("source", ""),
            "score": b.get("score", 0),
            "date_creation": b.get("date_creation", ""),
            "sales_status": status.get("sales_status", "new"),
            "notes": status.get("notes", ""),
            "google_rating": b.get("google_rating", ""),
            "google_reviews_count": b.get("google_reviews_count", ""),
            "scan_label": scan_labels.get(b.get("scan_id"), "")
        }
        export_data.append({k: row[k] for k in export_columns})
    
    if format == "json":
        return {
            "total": len(export_data),
            "filters_applied": {
                "has_phone": has_phone,
                "has_email": has_email,
                "has_siret": has_siret,
                "source": source,
                "min_score": min_score,
                "max_age_days": max_age_days,
                "sales_status": sales_status,
                "domain": domain,
                "city": city
            },
            "data": export_data
        }
    
    # CSV export
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=export_columns, delimiter=';', quotechar='"')
    writer.writeheader()
    writer.writerows(export_data)
    
    # Build filename
    filters_str = []
    if has_phone: filters_str.append("tel")
    if has_email: filters_str.append("email")
    if source: filters_str.append(source)
    if min_score: filters_str.append(f"score{min_score}")
    if sales_status: filters_str.append(sales_status)
    
    filename = f"export_{'_'.join(filters_str) if filters_str else 'all'}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/export/presets")
async def get_export_presets(current_user: dict = Depends(get_current_user)):
    """Get predefined export presets"""
    return {
        "presets": [
            {
                "id": "phone_ready",
                "name": "Prêts à appeler",
                "description": "Leads avec téléphone, prêts pour la prospection",
                "params": {"has_phone": True, "sales_status": "to_call"}
            },
            {
                "id": "high_potential",
                "name": "Haut potentiel",
                "description": "Score élevé (70+) avec téléphone",
                "params": {"has_phone": True, "min_score": 70}
            },
            {
                "id": "recent_pappers",
                "name": "Créations récentes",
                "description": "Entreprises Pappers créées dans les 30 derniers jours",
                "params": {"source": "pappers", "max_age_days": 30}
            },
            {
                "id": "visite_terrain",
                "name": "Visite terrain",
                "description": "Leads sans téléphone avec adresse",
                "params": {"has_phone": False}
            },
            {
                "id": "complete_data",
                "name": "Données complètes",
                "description": "Leads avec téléphone, email et SIRET",
                "params": {"has_phone": True, "has_email": True, "has_siret": True}
            }
        ]
    }
