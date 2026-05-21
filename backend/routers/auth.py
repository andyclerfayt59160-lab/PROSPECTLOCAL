"""
Authentication Router

Gère les endpoints d'authentification :
- POST /auth/register - Inscription
- POST /auth/login - Connexion
- GET /auth/me - Profil utilisateur
- Gestion des clés API utilisateur
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime
from typing import Optional
import logging
from pydantic import ValidationError

from models import User, UserCreate, UserLogin, Token
from auth import get_password_hash, verify_password, create_access_token, get_current_user, get_current_admin
from utils.dependencies import get_database

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register")
async def register(user_create: UserCreate):
    """Register new user - account requires admin approval"""
    db = get_database()
    
    # Check if email exists
    existing = await db.users.find_one({"email": user_create.email})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    
    # Create user with pending status
    user = User(
        email=user_create.email,
        password_hash=get_password_hash(user_create.password),
        role="user"
    )
    user_dict = user.dict()
    user_dict["is_approved"] = False
    user_dict["is_active"] = False
    user_dict["registration_date"] = datetime.utcnow()
    
    await db.users.insert_one(user_dict)
    
    logger.info(f"Registration pending approval: {user_create.email}")
    
    return {
        "success": True,
        "message": "Votre demande d'inscription a été envoyée. Un administrateur validera votre accès prochainement.",
        "email": user_create.email
    }


@router.post("/login", response_model=Token)
async def login(request: Request):
    """Login user via JSON payload or form-urlencoded fields."""
    db = get_database()
    content_type = (request.headers.get("content-type") or "").lower()
    payload_email: Optional[str] = None
    payload_password: Optional[str] = None

    try:
        if "application/json" in content_type:
            body = await request.json()
            if isinstance(body, dict):
                payload_email = body.get("email") or body.get("username")
                payload_password = body.get("password")
        elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
            form = await request.form()
            payload_email = form.get("email") or form.get("username")
            payload_password = form.get("password")
        else:
            body = await request.json()
            if isinstance(body, dict):
                payload_email = body.get("email") or body.get("username")
                payload_password = body.get("password")
    except Exception:
        payload_email = None
        payload_password = None

    try:
        user_login = UserLogin(
            email=(payload_email or "").strip(),
            password=payload_password or "",
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors())
    
    logger.info(f"Login attempt for: {user_login.email}")
    user = await db.users.find_one({"email": user_login.email})
    
    if not user:
        logger.warning(f"User not found: {user_login.email}")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    logger.info(f"User found: {user.get('email')}, has password_hash: {bool(user.get('password_hash'))}")
    
    if not verify_password(user_login.password, user["password_hash"]):
        logger.warning(f"Password verification failed for: {user_login.email}")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    logger.info(f"Password verified for: {user_login.email}")
    
    # Check if user is approved
    if not user.get("is_approved", True):
        raise HTTPException(
            status_code=403, 
            detail="Votre compte est en attente de validation par un administrateur"
        )
    
    # Check if user is active
    if user.get("is_active") == False:
        raise HTTPException(
            status_code=403, 
            detail="Votre compte a été désactivé. Contactez un administrateur."
        )

    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "last_login_at": datetime.utcnow(),
                "last_login_ip": request.client.host if request.client else None,
            }
        }
    )
    
    access_token = create_access_token(data={
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"]
    })
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "email": user["email"], "role": user["role"]}
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    db = get_database()
    
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "password_hash": 0})
    if user:
        user["has_google_api_key"] = bool(user.get("google_api_key"))
        user["has_serper_api_key"] = bool(user.get("serper_api_key"))
        user["has_pappers_api_key"] = bool(user.get("pappers_api_key"))
        user["onboarding_completed"] = user.get("onboarding_completed", False)
        # Remove actual keys from response
        user.pop("google_api_key", None)
        user.pop("serper_api_key", None)
        user.pop("pappers_api_key", None)
    return user


# ============= USER API KEYS MANAGEMENT =============

user_router = APIRouter(prefix="/user", tags=["User"])


def mask_key(key: Optional[str]) -> Optional[str]:
    """Mask API key for display"""
    if not key:
        return None
    if len(key) < 8:
        return "****"
    return key[:4] + "****" + key[-4:]


@user_router.get("/api-keys")
async def get_user_api_keys(current_user: dict = Depends(get_current_user)):
    """Get user's API keys status (masked)"""
    db = get_database()
    
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "google_api_key": mask_key(user.get("google_api_key")),
        "serper_api_key": mask_key(user.get("serper_api_key")),
        "pappers_api_key": mask_key(user.get("pappers_api_key")),
        "has_google_api_key": bool(user.get("google_api_key")),
        "has_serper_api_key": bool(user.get("serper_api_key")),
        "has_pappers_api_key": bool(user.get("pappers_api_key")),
        "has_google_key": bool(user.get("google_api_key")),
        "has_serper_key": bool(user.get("serper_api_key")),
        "has_pappers_key": bool(user.get("pappers_api_key")),
        "onboarding_completed": user.get("onboarding_completed", False),
    }


@user_router.put("/api-keys")
async def update_user_api_keys(
    keys: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update user's API keys"""
    db = get_database()
    user_id = current_user["sub"]
    
    update_fields = {}
    
    if "google_api_key" in keys and keys["google_api_key"]:
        update_fields["google_api_key"] = keys["google_api_key"].strip()
    
    if "serper_api_key" in keys and keys["serper_api_key"]:
        update_fields["serper_api_key"] = keys["serper_api_key"].strip()
    
    if "pappers_api_key" in keys and keys["pappers_api_key"]:
        update_fields["pappers_api_key"] = keys["pappers_api_key"].strip()
    
    if update_fields:
        await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
    
    return {"success": True, "updated_keys": list(update_fields.keys())}


@user_router.delete("/api-keys/{key_name}")
async def delete_user_api_key(
    key_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a specific API key"""
    db = get_database()
    
    valid_keys = ["google_api_key", "serper_api_key", "pappers_api_key"]
    if key_name not in valid_keys:
        raise HTTPException(status_code=400, detail="Invalid key name")
    
    await db.users.update_one(
        {"id": current_user["sub"]},
        {"$unset": {key_name: ""}}
    )
    
    return {"success": True, "deleted_key": key_name}


@user_router.post("/complete-onboarding")
async def complete_onboarding(current_user: dict = Depends(get_current_user)):
    """Mark onboarding as completed"""
    db = get_database()
    
    await db.users.update_one(
        {"id": current_user["sub"]},
        {"$set": {"onboarding_completed": True}}
    )
    return {"success": True}
