import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from utils.helpers import is_directory_listing_url

logger = logging.getLogger(__name__)


SOLOCAL_SIGNATURES = [
    "solocal",
    "pagesjaunes",
    "site internet solocal",
    "powered by solocal",
    "agence.solocal",
]

PROVIDER_SIGNATURES = [
    ("Wix", ["wix.com", "wixstatic.com", "wixsite"]),
    ("WordPress", ["wp-content", "wp-includes", "wordpress"]),
    ("Squarespace", ["squarespace.com", "static.squarespace.com"]),
    ("Webflow", ["webflow.io", "webflow.com"]),
    ("Shopify", ["shopify.com", "cdn.shopify.com"]),
    ("Jimdo", ["jimdo.com", "jimdosite.com"]),
    ("Ionos", ["ionos.", "mywebsite-editor.com"]),
    ("OVH", ["ovh", "cdn.ovh"]),
    ("Amenitiz", ["amenitiz", "amenitiz.io"]),
    ("Simplebo", ["simplebo", "simpl.site"]),
    ("Orson", ["orson.io", "orson.website"]),
]


def _normalize_website_url(url: str) -> str:
    candidate = (url or "").strip()
    if not candidate:
        return ""
    if not candidate.startswith(("http://", "https://")):
        candidate = f"https://{candidate}"
    return candidate


def _extract_generator_signature(soup: BeautifulSoup) -> str:
    generator = soup.find("meta", attrs={"name": re.compile(r"generator", re.I)})
    if generator and generator.get("content"):
        return str(generator.get("content"))
    return ""


async def detect_website_provider(url: str) -> Dict[str, Any]:
    """
    Qualify a website provider to distinguish Solocal-managed websites from
    external providers.
    """
    normalized_url = _normalize_website_url(url)
    result: Dict[str, Any] = {
        "status": "unknown",
        "provider_name": None,
        "provider_confidence": "low",
        "provider_reason": "Aucune signature prestataire detectee.",
        "website_url": normalized_url,
        "final_url": normalized_url,
        "website_host": "",
        "domain_registered_at": None,
        "site_age_days": None,
        "site_age_label": None,
    }

    if not normalized_url:
        result.update(
            {
                "status": "missing",
                "provider_reason": "Aucun site web exploitable sur cette fiche.",
            }
        )
        return result

    if is_directory_listing_url(normalized_url):
        result.update(
            {
                "status": "directory",
                "provider_reason": "Le lien pointe vers un annuaire ou une marketplace.",
            }
        )
        return result

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(normalized_url, headers=headers)
    except Exception as exc:
        logger.debug("Website provider detection failed for %s: %s", normalized_url, exc)
        result.update(
            {
                "status": "unreachable",
                "provider_reason": "Le site n'a pas pu etre charge pour analyse.",
            }
        )
        return result

    if response.status_code >= 400:
        result.update(
            {
                "status": "unreachable",
                "provider_reason": f"Le site a repondu avec le code HTTP {response.status_code}.",
            }
        )
        return result

    final_url = str(response.url)
    html = response.text or ""
    soup = BeautifulSoup(html, "lxml")
    generator = _extract_generator_signature(soup)
    visible_text = soup.get_text(" ", strip=True)[:50000]
    combined = " ".join([final_url, html[:250000], generator, visible_text]).lower()

    try:
        host = urlparse(final_url).netloc.lower()
    except Exception:
        host = ""

    result["final_url"] = final_url
    result["website_host"] = host[4:] if host.startswith("www.") else host
    age_data = await lookup_domain_age(result["website_host"])
    if age_data:
        result.update(age_data)

    for token in SOLOCAL_SIGNATURES:
        if token in combined:
            result.update(
                {
                    "status": "solocal",
                    "provider_name": "Solocal",
                    "provider_confidence": "high",
                    "provider_reason": f"Signature '{token}' detectee sur le site.",
                }
            )
            return result

    for provider_name, tokens in PROVIDER_SIGNATURES:
        matched = next((token for token in tokens if token in combined), None)
        if matched:
            result.update(
                {
                    "status": "external",
                    "provider_name": provider_name,
                    "provider_confidence": "high",
                    "provider_reason": f"Signature '{matched}' detectee sur le site.",
                }
            )
            return result

    if generator:
        result.update(
            {
                "status": "external",
                "provider_name": generator[:80],
                "provider_confidence": "medium",
                "provider_reason": "Balise generator detectee sur le site.",
            }
        )
        return result

    result.update(
        {
            "status": "external",
            "provider_name": "Prestataire externe non identifie",
            "provider_confidence": "low",
            "provider_reason": "Site reel detecte sans signature Solocal.",
        }
    )
    return result


async def lookup_domain_age(host: str) -> Optional[Dict[str, Any]]:
    normalized_host = (host or "").strip().lower()
    if not normalized_host:
        return None

    if normalized_host.startswith("www."):
        normalized_host = normalized_host[4:]

    url = f"https://rdap.org/domain/{normalized_host}"

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            response = await client.get(url, headers={"Accept": "application/rdap+json, application/json"})
    except Exception as exc:
        logger.debug("RDAP lookup failed for %s: %s", normalized_host, exc)
        return None

    if response.status_code >= 400:
        return None

    try:
        data = response.json()
    except Exception:
        return None

    created_at: Optional[datetime] = None
    for event in data.get("events", []):
        action = str(event.get("eventAction") or "").lower()
        date_value = event.get("eventDate")
        if not date_value:
            continue
        if action not in {"registration", "registered", "creation"}:
            continue
        try:
            created_at = datetime.fromisoformat(str(date_value).replace("Z", "+00:00"))
            break
        except Exception:
            continue

    if not created_at:
        return None

    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    age_days = max(0, (datetime.now(timezone.utc) - created_at).days)

    if age_days < 365:
        age_label = f"{age_days} j"
    else:
        age_years = round(age_days / 365.25, 1)
        age_label = f"{age_years} an(s)"

    return {
        "domain_registered_at": created_at.isoformat(),
        "site_age_days": age_days,
        "site_age_label": age_label,
    }
