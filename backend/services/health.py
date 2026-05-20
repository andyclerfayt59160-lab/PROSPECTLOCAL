"""
System Health Service
Checks the health status of all external APIs
"""
import httpx
from datetime import datetime, timedelta
import asyncio
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

# Import email service
try:
    from services.email import send_api_alert_email, get_user_email_preferences
    EMAIL_SERVICE_AVAILABLE = True
except ImportError:
    EMAIL_SERVICE_AVAILABLE = False
    logger.warning("Email service not available for health alerts")


async def check_google_api(google_key: str) -> Dict[str, Any]:
    """Test Google Places API"""
    if not google_key:
        return {
            "name": "Google Places",
            "status": "not_configured",
            "message": "Clé API non configurée",
            "latency_ms": None,
            "has_key": False
        }
    
    try:
        start = datetime.utcnow()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params={"location": "48.8566,2.3522", "radius": 100, "key": google_key}
            )
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "OK" or data.get("status") == "ZERO_RESULTS":
                return {
                    "name": "Google Places",
                    "status": "healthy",
                    "message": "API opérationnelle",
                    "latency_ms": round(latency, 1),
                    "has_key": True
                }
            elif data.get("status") == "REQUEST_DENIED":
                return {
                    "name": "Google Places",
                    "status": "error",
                    "message": "Clé API invalide ou restrictions",
                    "latency_ms": round(latency, 1),
                    "has_key": True
                }
            else:
                return {
                    "name": "Google Places",
                    "status": "warning",
                    "message": f"Status: {data.get('status')}",
                    "latency_ms": round(latency, 1),
                    "has_key": True
                }
        else:
            return {
                "name": "Google Places",
                "status": "error",
                "message": f"HTTP {response.status_code}",
                "latency_ms": round(latency, 1),
                "has_key": True
            }
    except Exception as e:
        return {
            "name": "Google Places",
            "status": "error",
            "message": str(e)[:100],
            "latency_ms": None,
            "has_key": True
        }


async def check_serper_api(serper_key: str) -> Dict[str, Any]:
    """Test Serper.dev API"""
    if not serper_key:
        return {
            "name": "Serper (Web Search)",
            "status": "not_configured",
            "message": "Clé API non configurée",
            "latency_ms": None,
            "has_key": False
        }
    
    try:
        start = datetime.utcnow()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": serper_key, "Content-Type": "application/json"},
                json={"q": "test", "num": 1}
            )
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        if response.status_code == 200:
            return {
                "name": "Serper (Web Search)",
                "status": "healthy",
                "message": "API opérationnelle",
                "latency_ms": round(latency, 1),
                "has_key": True
            }
        elif response.status_code == 401:
            return {
                "name": "Serper (Web Search)",
                "status": "error",
                "message": "Clé API invalide",
                "latency_ms": round(latency, 1),
                "has_key": True
            }
        elif response.status_code == 429:
            return {
                "name": "Serper (Web Search)",
                "status": "warning",
                "message": "Quota dépassé",
                "latency_ms": round(latency, 1),
                "has_key": True
            }
        else:
            return {
                "name": "Serper (Web Search)",
                "status": "error",
                "message": f"HTTP {response.status_code}",
                "latency_ms": round(latency, 1),
                "has_key": True
            }
    except Exception as e:
        return {
            "name": "Serper (Web Search)",
            "status": "error",
            "message": str(e)[:100],
            "latency_ms": None,
            "has_key": True
        }


async def check_pappers_api(pappers_key: str) -> Dict[str, Any]:
    """Test Pappers API"""
    if not pappers_key:
        return {
            "name": "Pappers",
            "status": "not_configured",
            "message": "Clé API non configurée",
            "latency_ms": None,
            "has_key": False,
            "credits_remaining": None
        }
    
    try:
        start = datetime.utcnow()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://api.pappers.fr/v2/recherche",
                params={"api_token": pappers_key, "q": "test", "par_page": 1}
            )
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        if response.status_code == 200:
            credits_remaining = response.headers.get("X-RateLimit-Remaining")
            return {
                "name": "Pappers",
                "status": "healthy",
                "message": "API opérationnelle",
                "latency_ms": round(latency, 1),
                "has_key": True,
                "credits_remaining": int(credits_remaining) if credits_remaining else None
            }
        elif response.status_code == 401:
            return {
                "name": "Pappers",
                "status": "error",
                "message": "Clé API invalide ou expirée",
                "latency_ms": round(latency, 1),
                "has_key": True,
                "credits_remaining": 0
            }
        elif response.status_code == 429:
            return {
                "name": "Pappers",
                "status": "warning",
                "message": "Quota mensuel épuisé",
                "latency_ms": round(latency, 1),
                "has_key": True,
                "credits_remaining": 0
            }
        else:
            return {
                "name": "Pappers",
                "status": "error",
                "message": f"HTTP {response.status_code}",
                "latency_ms": round(latency, 1),
                "has_key": True,
                "credits_remaining": None
            }
    except Exception as e:
        return {
            "name": "Pappers",
            "status": "error",
            "message": str(e)[:100],
            "latency_ms": None,
            "has_key": True,
            "credits_remaining": None
        }


async def check_public_apis() -> List[Dict[str, Any]]:
    """Test public government APIs"""
    results = []
    
    # Test API Geo Gouv
    try:
        start = datetime.utcnow()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://geo.api.gouv.fr/communes",
                params={"nom": "Paris", "limit": 1}
            )
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        results.append({
            "name": "API Géo Gouv",
            "status": "healthy" if response.status_code == 200 else "error",
            "message": "API publique opérationnelle" if response.status_code == 200 else f"HTTP {response.status_code}",
            "latency_ms": round(latency, 1),
            "has_key": True,
            "is_public": True
        })
    except Exception as e:
        results.append({
            "name": "API Géo Gouv",
            "status": "error",
            "message": str(e)[:100],
            "latency_ms": None,
            "has_key": True,
            "is_public": True
        })
    
    # Test API Recherche Entreprises
    try:
        start = datetime.utcnow()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://recherche-entreprises.api.gouv.fr/search",
                params={"q": "test", "per_page": 1}
            )
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        results.append({
            "name": "API Entreprises (SIRENE)",
            "status": "healthy" if response.status_code == 200 else "error",
            "message": "API publique opérationnelle" if response.status_code == 200 else f"HTTP {response.status_code}",
            "latency_ms": round(latency, 1),
            "has_key": True,
            "is_public": True
        })
    except Exception as e:
        results.append({
            "name": "API Entreprises (SIRENE)",
            "status": "error",
            "message": str(e)[:100],
            "latency_ms": None,
            "has_key": True,
            "is_public": True
        })
    
    return results


async def get_full_health_status(
    google_key: str,
    serper_key: str,
    pappers_key: str
) -> Dict[str, Any]:
    """
    Run all health checks in parallel and return full status.
    """
    # Run all checks in parallel
    google_result, serper_result, pappers_result, public_results = await asyncio.gather(
        check_google_api(google_key),
        check_serper_api(serper_key),
        check_pappers_api(pappers_key),
        check_public_apis()
    )
    
    apis = [google_result, serper_result, pappers_result] + public_results
    
    # Determine overall status
    statuses = [api["status"] for api in apis]
    if "error" in statuses:
        overall_status = "degraded"
    elif "warning" in statuses or "not_configured" in statuses:
        overall_status = "warning"
    else:
        overall_status = "healthy"
    
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "overall_status": overall_status,
        "apis": apis
    }


async def get_error_rates(db, user_id: str) -> Dict[str, float]:
    """Get error rates for the last 24 hours"""
    yesterday = datetime.utcnow() - timedelta(hours=24)
    
    pipeline = [
        {"$match": {"user_id": user_id, "created_at": {"$gte": yesterday}}},
        {"$group": {
            "_id": "$api_type",
            "total": {"$sum": 1},
            "errors": {"$sum": {"$cond": ["$success", 0, 1]}}
        }}
    ]
    
    error_stats = await db.api_usage_logs.aggregate(pipeline).to_list(10)
    
    return {
        stat["_id"]: round(stat["errors"] / stat["total"] * 100, 1) if stat["total"] > 0 else 0
        for stat in error_stats
    }


# ========== API HEALTH MONITORING & ALERTS ==========

# In-memory cache for tracking API downtime
_api_status_cache = {}

async def check_and_alert_api_health(
    db,
    user_id: str,
    google_key: str,
    serper_key: str, 
    pappers_key: str,
    user_email: Optional[str] = None
) -> Dict[str, Any]:
    """
    Check API health and create alerts if APIs are down.
    Uses a cache to track consecutive failures and avoid duplicate alerts.
    
    Args:
        db: MongoDB database instance
        user_id: User ID
        google_key: Google API key
        serper_key: Serper API key
        pappers_key: Pappers API key
        user_email: User's email for sending alerts
    """
    global _api_status_cache
    
    # Get current health status
    health = await get_full_health_status(google_key, serper_key, pappers_key)
    
    alerts_created = []
    emails_sent = []
    now = datetime.utcnow()
    
    for api in health.get("apis", []):
        api_name = api["name"]
        status = api["status"]
        cache_key = f"{user_id}:{api_name}"
        
        # Skip public APIs and not_configured
        if api.get("is_public") or status == "not_configured":
            continue
        
        if status == "error":
            # API is down
            if cache_key not in _api_status_cache:
                # First failure - start tracking
                _api_status_cache[cache_key] = {
                    "first_failure": now,
                    "consecutive_failures": 1,
                    "alert_sent": False
                }
            else:
                # Increment failures
                _api_status_cache[cache_key]["consecutive_failures"] += 1
            
            cache_entry = _api_status_cache[cache_key]
            downtime_minutes = (now - cache_entry["first_failure"]).total_seconds() / 60
            
            # Send alert after 5 minutes of downtime (or 3 consecutive failures)
            if (downtime_minutes >= 5 or cache_entry["consecutive_failures"] >= 3) and not cache_entry["alert_sent"]:
                # Create notification and send email
                alert = await create_api_down_alert(
                    db, user_id, api_name, api["message"], downtime_minutes, user_email
                )
                if alert:
                    alerts_created.append(api_name)
                    if user_email:
                        emails_sent.append(api_name)
                    _api_status_cache[cache_key]["alert_sent"] = True
                    
        elif status == "healthy":
            # API is back up
            if cache_key in _api_status_cache and _api_status_cache[cache_key].get("alert_sent"):
                # Send recovery notification and email
                await create_api_recovery_alert(db, user_id, api_name, user_email)
                alerts_created.append(f"{api_name} (recovered)")
                if user_email:
                    emails_sent.append(f"{api_name} (recovery)")
            
            # Clear cache
            if cache_key in _api_status_cache:
                del _api_status_cache[cache_key]
    
    return {
        "health": health,
        "alerts_created": alerts_created,
        "emails_sent": emails_sent
    }


async def create_api_down_alert(db, user_id: str, api_name: str, error_message: str, downtime_minutes: float, user_email: Optional[str] = None) -> bool:
    """Create a notification for API downtime and optionally send email"""
    try:
        # Check if alert already exists in last hour
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        existing = await db.notifications.find_one({
            "user_id": user_id,
            "type": "api_alert",
            "metadata.api_name": api_name,
            "metadata.alert_type": "down",
            "created_at": {"$gte": one_hour_ago}
        })
        
        if existing:
            return False
        
        notification = {
            "user_id": user_id,
            "type": "api_alert",
            "message": f"⚠️ ALERTE: {api_name} est indisponible depuis {int(downtime_minutes)} minutes. Erreur: {error_message}",
            "read": False,
            "created_at": datetime.utcnow(),
            "metadata": {
                "api_name": api_name,
                "alert_type": "down",
                "error_message": error_message,
                "downtime_minutes": round(downtime_minutes, 1)
            }
        }
        
        await db.notifications.insert_one(notification)
        logger.warning(f"API Alert: {api_name} down for {downtime_minutes:.1f} minutes - {error_message}")
        
        # Send email alert if email service is available and user has email
        if EMAIL_SERVICE_AVAILABLE and user_email:
            try:
                # Check user preferences
                preferences = await get_user_email_preferences(db, user_id)
                if preferences.get("api_alerts", True):
                    await send_api_alert_email(
                        db=db,
                        user_email=user_email,
                        api_name=api_name,
                        alert_type="down",
                        error_message=error_message,
                        downtime_minutes=downtime_minutes
                    )
                    logger.info(f"Email alert sent to {user_email} for {api_name} down")
            except Exception as email_error:
                logger.error(f"Failed to send email alert: {email_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating API down alert: {e}")
        return False


async def create_api_recovery_alert(db, user_id: str, api_name: str, user_email: Optional[str] = None) -> bool:
    """Create a notification when API recovers and optionally send email"""
    try:
        notification = {
            "user_id": user_id,
            "type": "api_alert",
            "message": f"✅ {api_name} est de nouveau opérationnel !",
            "read": False,
            "created_at": datetime.utcnow(),
            "metadata": {
                "api_name": api_name,
                "alert_type": "recovery"
            }
        }
        
        await db.notifications.insert_one(notification)
        logger.info(f"API Recovery: {api_name} is back online")
        
        # Send email alert if email service is available and user has email
        if EMAIL_SERVICE_AVAILABLE and user_email:
            try:
                preferences = await get_user_email_preferences(db, user_id)
                if preferences.get("api_alerts", True):
                    await send_api_alert_email(
                        db=db,
                        user_email=user_email,
                        api_name=api_name,
                        alert_type="recovery"
                    )
                    logger.info(f"Email recovery alert sent to {user_email} for {api_name}")
            except Exception as email_error:
                logger.error(f"Failed to send email recovery alert: {email_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating API recovery alert: {e}")
        return False


async def get_api_health_history(db, user_id: str, hours: int = 24) -> List[Dict]:
    """Get API health check history for the last N hours"""
    since = datetime.utcnow() - timedelta(hours=hours)
    
    alerts = await db.notifications.find({
        "user_id": user_id,
        "type": "api_alert",
        "created_at": {"$gte": since}
    }).sort("created_at", -1).to_list(100)
    
    # Format for response
    return [
        {
            "api_name": a.get("metadata", {}).get("api_name"),
            "alert_type": a.get("metadata", {}).get("alert_type"),
            "message": a.get("message"),
            "timestamp": a.get("created_at").isoformat() if a.get("created_at") else None
        }
        for a in alerts
    ]

