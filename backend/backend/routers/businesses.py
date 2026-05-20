"""
Businesses Router

Gère les endpoints liés aux entreprises :
- GET /businesses/{id} - Détails d'une entreprise
- DELETE /businesses/{id} - Supprimer
- PATCH /businesses/{id}/status - Mettre à jour le statut
- PATCH /businesses/{id}/viewed - Marquer comme vu
- GET /businesses/{id}/linked - Entreprises liées (même téléphone)
- POST /businesses/{id}/mark-inexploitable - Marquer inexploitable
- POST /businesses/{id}/unmark-inexploitable - Retirer marquage inexploitable
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from typing import Optional, List
import logging

from models import UserBusinessStatus, UserBusinessStatusUpdate, ContactStatusManual, ClientStatus, InterestStatus
from auth import get_current_user
from utils.dependencies import get_database

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.delete("/{business_id}")
async def delete_business(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a single business"""
    db = get_database()
    
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Verify user owns the scan OR is admin
    scan = await db.scans.find_one({"id": business.get("scan_id")})
    
    if scan:
        if scan.get("user_id") != current_user["sub"]:
            user = await db.users.find_one({"id": current_user["sub"]})
            if not user or not user.get("is_admin"):
                raise HTTPException(status_code=403, detail="Not authorized to delete this business")
    else:
        if business.get("first_detected_by") and business.get("first_detected_by") != current_user["sub"]:
            user = await db.users.find_one({"id": current_user["sub"]})
            if not user or not user.get("is_admin"):
                raise HTTPException(status_code=403, detail="Not authorized to delete this business")
    
    # Delete the business
    await db.businesses.delete_one({"id": business_id})
    
    # Also delete any user status associated with it
    await db.user_business_status.delete_many({"business_id": business_id})
    
    # Delete shared history if exists
    if business.get("pl_reference"):
        await db.shared_business_histories.delete_one({"pl_reference": business["pl_reference"]})
    
    logger.info(f"🗑️ Business deleted: {business.get('name', 'N/A')} by user {current_user.get('email', 'unknown')}")
    
    return {"success": True, "message": "Business deleted successfully"}


@router.patch("/{business_id}/viewed")
async def mark_business_viewed(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a business as viewed by the user"""
    db = get_database()
    user_id = current_user["sub"]
    
    # Check business exists
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Update or create user status
    await db.user_business_status.update_one(
        {"user_id": user_id, "business_id": business_id},
        {
            "$set": {
                "viewed": True,
                "viewed_at": datetime.utcnow()
            },
            "$setOnInsert": {
                "user_id": user_id,
                "business_id": business_id,
                "contact_status": "non_contacte",
                "is_client": "non_renseigne",
                "interest_level": "non_renseigne"
            }
        },
        upsert=True
    )
    
    return {"success": True}


@router.patch("/{business_id}/status")
async def update_business_status(
    business_id: str,
    status_update: UserBusinessStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user's status for a business (contact status, client status, interest, notes)"""
    db = get_database()
    user_id = current_user["sub"]
    
    # Check business exists
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Build update dict
    update_fields = {"updated_at": datetime.utcnow()}
    
    if status_update.contact_status is not None:
        update_fields["contact_status"] = status_update.contact_status
    if status_update.is_client is not None:
        update_fields["is_client"] = status_update.is_client
    if status_update.interest_level is not None:
        update_fields["interest_level"] = status_update.interest_level
    if status_update.notes is not None:
        update_fields["notes"] = status_update.notes
    if status_update.sales_status is not None:
        update_fields["sales_status"] = status_update.sales_status
    if status_update.next_action_date is not None:
        update_fields["next_action_date"] = status_update.next_action_date
    
    # Update or create
    result = await db.user_business_status.update_one(
        {"user_id": user_id, "business_id": business_id},
        {
            "$set": update_fields,
            "$setOnInsert": {
                "user_id": user_id,
                "business_id": business_id
            }
        },
        upsert=True
    )
    
    # Get updated status
    updated_status = await db.user_business_status.find_one(
        {"user_id": user_id, "business_id": business_id},
        {"_id": 0}
    )
    
    return updated_status


@router.get("/{business_id}/linked")
async def get_linked_businesses(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get businesses with the same phone number"""
    db = get_database()
    
    # Get the business
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    phone = business.get("phone")
    if not phone:
        return {"linked_businesses": [], "count": 0}
    
    # Find businesses with same phone
    linked = await db.businesses.find(
        {"phone": phone, "id": {"$ne": business_id}},
        {"_id": 0}
    ).limit(20).to_list(20)
    
    return {"linked_businesses": linked, "count": len(linked)}


@router.post("/{business_id}/mark-inexploitable")
async def mark_business_inexploitable(
    business_id: str,
    reason: str = Query(None, description="Reason for marking as inexploitable"),
    current_user: dict = Depends(get_current_user)
):
    """Mark a business as inexploitable (wrong number, closed, etc.)"""
    db = get_database()
    user_id = current_user["sub"]
    
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Update user status
    await db.user_business_status.update_one(
        {"user_id": user_id, "business_id": business_id},
        {
            "$set": {
                "is_inexploitable": True,
                "inexploitable_reason": reason,
                "inexploitable_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            },
            "$setOnInsert": {
                "user_id": user_id,
                "business_id": business_id
            }
        },
        upsert=True
    )
    
    logger.info(f"❌ Business marked inexploitable: {business.get('name')} - Reason: {reason}")
    
    return {"success": True, "message": "Business marked as inexploitable"}


@router.post("/{business_id}/unmark-inexploitable")
async def unmark_business_inexploitable(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove inexploitable mark from a business"""
    db = get_database()
    user_id = current_user["sub"]
    
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Update user status
    await db.user_business_status.update_one(
        {"user_id": user_id, "business_id": business_id},
        {
            "$set": {
                "is_inexploitable": False,
                "inexploitable_reason": None,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return {"success": True, "message": "Inexploitable mark removed"}
