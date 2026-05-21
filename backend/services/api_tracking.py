"""
API Usage Tracking Service

Ce module gère le tracking des crédits API (Pappers, Google, Serper)
et les alertes de dépassement de budget.
"""
from datetime import datetime
from typing import Optional
import logging

from models import APIUsageLog, Notification, NotificationType

logger = logging.getLogger(__name__)


async def track_api_usage(
    db,
    user_id: str, 
    api_type: str, 
    endpoint: str, 
    credits: float = 1.0, 
    success: bool = True, 
    error_msg: str = None
):
    """
    Log API usage and check budget thresholds.
    
    Args:
        db: MongoDB database instance
        user_id: User ID
        api_type: Type of API (pappers, google, serper)
        endpoint: Specific endpoint called
        credits: Number of credits consumed (default 1)
        success: Whether the call was successful
        error_msg: Error message if failed
    """
    log = APIUsageLog(
        user_id=user_id,
        api_type=api_type,
        endpoint=endpoint,
        credits_used=credits,
        success=success,
        error_message=error_msg
    )
    await db.api_usage_logs.insert_one(log.dict())

    # Budget alerts are helpful, but must never break a live scan or request.
    try:
        await check_api_budget_alerts(db, user_id, api_type)
    except Exception as exc:
        logger.error("API budget alert check failed for %s/%s: %s", user_id, api_type, exc)


async def check_api_budget_alerts(db, user_id: str, api_type: str):
    """
    Check if user has exceeded budget thresholds and send notifications.
    Alerts are sent at 80%, 90%, and 100% of the monthly budget.
    """
    # Get budget config (default 2000 for Pappers)
    config = await db.api_budget_configs.find_one({"user_id": user_id, "api_type": api_type})
    monthly_budget = config.get("monthly_budget", 2000) if config else 2000
    
    # Get current month usage
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    
    pipeline = [
        {"$match": {
            "user_id": user_id, 
            "api_type": api_type,
            "created_at": {"$gte": month_start}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$credits_used"}}}
    ]
    result = await db.api_usage_logs.aggregate(pipeline).to_list(1)
    used = result[0]["total"] if result else 0
    
    percentage = (used / monthly_budget * 100) if monthly_budget > 0 else 0
    
    # Check thresholds (80%, 90%, 100%)
    for threshold in [80, 90, 100]:
        if percentage >= threshold:
            # Check if alert already sent this month for this threshold
            alert_key = f"api_alert_{api_type}_{threshold}_{now.year}_{now.month}"
            existing_alert = await db.notifications.find_one({
                "user_id": user_id,
                "type": NotificationType.SYSTEM.value,
                "data.alert_key": alert_key
            })
            
            if not existing_alert:
                # Send alert
                if threshold == 100:
                    message = f"⚠️ Budget API {api_type.upper()} épuisé ! {used}/{monthly_budget} crédits utilisés ce mois."
                else:
                    message = f"🔔 Alerte budget API {api_type.upper()}: {threshold}% atteint ({used}/{monthly_budget} crédits)"
                
                notification = Notification(
                    user_id=user_id,
                    type=NotificationType.SYSTEM,
                    title=f"Alerte budget {api_type.upper()}",
                    message=message,
                    data={
                        "alert_key": alert_key,
                        "api_type": api_type,
                        "threshold": threshold,
                        "used": used,
                        "budget": monthly_budget
                    }
                )
                await db.notifications.insert_one(notification.dict())
                logger.info(f"📊 API Alert sent: {api_type} at {threshold}% for user {user_id}")


async def get_monthly_usage(db, user_id: str, api_type: Optional[str] = None) -> dict:
    """
    Get current month API usage statistics.
    
    Returns:
        dict with usage stats per API type
    """
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    
    match_query = {"user_id": user_id, "created_at": {"$gte": month_start}}
    if api_type:
        match_query["api_type"] = api_type
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": "$api_type",
            "total_credits": {"$sum": "$credits_used"},
            "total_calls": {"$sum": 1},
            "successful_calls": {"$sum": {"$cond": ["$success", 1, 0]}},
            "failed_calls": {"$sum": {"$cond": ["$success", 0, 1]}}
        }}
    ]
    
    results = await db.api_usage_logs.aggregate(pipeline).to_list(100)
    
    # Get budget configs
    budgets = {}
    configs = await db.api_budget_configs.find({"user_id": user_id}).to_list(10)
    for cfg in configs:
        budgets[cfg["api_type"]] = cfg.get("monthly_budget", 2000)
    
    # Format response
    stats = {}
    for r in results:
        api = r["_id"]
        budget = budgets.get(api, 2000)
        used = r["total_credits"]
        stats[api] = {
            "monthly_budget": budget,
            "credits_used": used,
            "credits_remaining": max(0, budget - used),
            "percentage_used": round(used / budget * 100, 1) if budget > 0 else 0,
            "total_calls": r["total_calls"],
            "successful_calls": r["successful_calls"],
            "failed_calls": r["failed_calls"]
        }
    
    return stats


async def update_budget(db, user_id: str, api_type: str, monthly_budget: int) -> bool:
    """
    Update monthly budget for an API.
    
    Args:
        db: MongoDB database instance
        user_id: User ID
        api_type: Type of API
        monthly_budget: New monthly budget (min 100)
    
    Returns:
        bool: Success status
    """
    if monthly_budget < 100:
        return False
    
    await db.api_budget_configs.update_one(
        {"user_id": user_id, "api_type": api_type},
        {"$set": {
            "user_id": user_id,
            "api_type": api_type,
            "monthly_budget": monthly_budget,
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )
    
    return True
