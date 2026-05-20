from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Query, BackgroundTasks, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timedelta
import httpx
import csv
import io
import re
import asyncio
import uuid
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

# Import models and auth
from models import (
    Activity, ActivityCreate, ActivityFamily,
    User, UserCreate, UserLogin, Token, Role,
    Scan, ScanCreate, ScanStatus,
    Business, UserBusinessStatus, UserBusinessStatusUpdate,
    ContactStatusManual, ClientStatus, InterestStatus, CRMStatus,
    Notification, NotificationType,
    SalesStatus, InteractionType, BusinessInteraction, BusinessInteractionCreate, SalesStatusUpdate,
    APIType, APIUsageLog, APIBudgetConfig
)
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_current_admin
)
from activities_seed import ACTIVITIES_SEED

# Import utility helpers
from utils.helpers import (
    normalize_phone,
    normalize_french_phone_full,
    generate_data_sources,
    merge_data_sources,
    calculate_score,
    normalize_name_for_matching,
    calculate_name_similarity,
    extract_emails_from_text,
    extract_phones_from_text,
    ACTIVITY_NAF_MAPPING
)

# Import services
from services.geo import (
    get_cities_in_radius as geo_get_cities_in_radius,
    search_cities as geo_search_cities,
    haversine_distance
)
from services.api_tracking import (
    track_api_usage as service_track_api_usage,
    check_api_budget_alerts as service_check_api_budget_alerts
)
from services.health import (
    get_full_health_status,
    get_error_rates,
    check_and_alert_api_health,
    get_api_health_history
)
from services.email import (
    send_scan_complete_email,
    get_user_email_preferences,
    send_surveillance_alert_email,
    send_weekly_summary_email,
    send_weekly_summaries,
    compute_weekly_stats_for_user
)
from services.enrichment import auto_enrich_scan_with_web, enrich_business_full as service_enrich_business_full, enrich_business_data as service_enrich_business_data
from services.pappers_scan import (
    get_naf_codes_for_domains,
    get_postal_codes_for_cities,
    get_postal_codes_for_radius,
    calculate_date_threshold,
    format_pappers_business,
    search_pappers_batch,
    calculate_scan_stats,
    DOMAIN_NAF_CODES
)
from services.web_scraper import (
    scrape_website_contacts,
    search_email_via_web,
    extract_business_from_serper_result,
    search_web_for_businesses
)
from services.sirene import (
    get_sirene_data,
    get_annuaire_entreprises_data,
    get_bodacc_data,
    check_activity_coherence,
    NAF_CATEGORIES
)
from services.pagesjaunes import (
    check_pagesjaunes_direct,
    detect_pagesjaunes_presence
)
from services.google_places import (
    geocode_location,
    search_google_places,
    get_place_details,
    check_website,
    search_businesses_hybrid
)

# Import routers
from routers import auth as auth_router
from routers import stats as stats_router
from routers import businesses as businesses_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# API Keys (fallback globals - user keys take priority)
SERPER_API_KEY = os.environ.get('SERPER_API_KEY', '')
PAPPERS_API_KEY = os.environ.get('PAPPERS_API_KEY', '')

# Create the main app
app = FastAPI(title="Prospection Scanner API")
api_router = APIRouter(prefix="/api")

# Add validation error handler to log details
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    logger.error(f"🔴 Validation Error on {request.url.path}")
    logger.error(f"🔴 Body: {body.decode('utf-8')[:500]}")
    logger.error(f"🔴 Errors: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode('utf-8')[:200]}
    )

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============= API KEYS HELPER =============

async def fetch_user_api_keys(user_id: str) -> dict:
    """Get user's API keys, falling back to global keys if not set"""
    user = await db.users.find_one({"id": user_id})
    
    # User's keys take priority, fall back to global env vars
    google_key = user.get("google_api_key") if user else None
    serper_key = user.get("serper_api_key") if user else None
    pappers_key = user.get("pappers_api_key") if user else None
    
    return {
        "google_api_key": google_key or os.environ.get("GOOGLE_API_KEY", ""),
        "serper_api_key": serper_key or SERPER_API_KEY,
        "pappers_api_key": pappers_key or PAPPERS_API_KEY,
        "using_own_keys": {
            "google": bool(google_key),
            "serper": bool(serper_key),
            "pappers": bool(pappers_key),
        }
    }

# ============= SHARED HISTORY FUNCTIONS =============

async def get_or_create_shared_history(business_id: str, pl_reference: str, user_id: str, user_email: str, scan_id: str):
    """Get or create shared history for a business"""
    existing = await db.shared_business_history.find_one({"pl_reference": pl_reference})
    
    if existing:
        # Add detection event if this user hasn't detected it before
        user_detected = any(e.get("user_id") == user_id for e in existing.get("detection_events", []))
        if not user_detected:
            await db.shared_business_history.update_one(
                {"pl_reference": pl_reference},
                {
                    "$push": {
                        "detection_events": {
                            "user_id": user_id,
                            "email": user_email,
                            "scan_id": scan_id,
                            "detected_at": datetime.utcnow().isoformat()
                        }
                    },
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
        return existing
    
    # Create new shared history
    history = {
        "id": str(uuid.uuid4()),
        "pl_reference": pl_reference,
        "business_id": business_id,
        "first_detected_at": datetime.utcnow(),
        "first_detected_by_user_id": user_id,
        "first_detected_by_email": user_email,
        "first_detected_in_scan_id": scan_id,
        "detection_events": [{
            "user_id": user_id,
            "email": user_email,
            "scan_id": scan_id,
            "detected_at": datetime.utcnow().isoformat()
        }],
        "total_views": 0,
        "view_events": [],
        "last_viewed_at": None,
        "last_viewed_by_email": None,
        "is_contacted": False,
        "is_client": False,
        "is_not_interested": False,
        "is_in_crm": False,
        "shared_notes": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.shared_business_history.insert_one(history)
    return history

async def record_view_event(pl_reference: str, user_id: str, user_email: str):
    """Record a view event in shared history"""
    await db.shared_business_history.update_one(
        {"pl_reference": pl_reference},
        {
            "$inc": {"total_views": 1},
            "$push": {
                "view_events": {
                    "$each": [{
                        "user_id": user_id,
                        "email": user_email,
                        "viewed_at": datetime.utcnow().isoformat()
                    }],
                    "$slice": -100  # Keep last 100 views
                }
            },
            "$set": {
                "last_viewed_at": datetime.utcnow(),
                "last_viewed_by_email": user_email,
                "updated_at": datetime.utcnow()
            }
        }
    )

async def update_shared_status(pl_reference: str, user_email: str, status_type: str, value: bool):
    """Update shared status (contacted, client, not_interested, in_crm)"""
    now = datetime.utcnow()
    update_fields = {"updated_at": now}
    
    if status_type == "contacted":
        update_fields["is_contacted"] = value
        if value:
            update_fields["contacted_at"] = now
            update_fields["contacted_by_email"] = user_email
    elif status_type == "client":
        update_fields["is_client"] = value
        if value:
            update_fields["client_since"] = now
            update_fields["marked_client_by_email"] = user_email
    elif status_type == "not_interested":
        update_fields["is_not_interested"] = value
        if value:
            update_fields["not_interested_at"] = now
            update_fields["not_interested_by_email"] = user_email
    elif status_type == "in_crm":
        update_fields["is_in_crm"] = value
        if value:
            update_fields["in_crm_at"] = now
            update_fields["in_crm_by_email"] = user_email
    
    await db.shared_business_history.update_one(
        {"pl_reference": pl_reference},
        {"$set": update_fields}
    )

async def add_shared_note(pl_reference: str, user_email: str, note: str):
    """Add a shared note visible to all users"""
    await db.shared_business_history.update_one(
        {"pl_reference": pl_reference},
        {
            "$push": {
                "shared_notes": {
                    "user_email": user_email,
                    "note": note,
                    "created_at": datetime.utcnow().isoformat()
                }
            },
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

# ============= UTILITY FUNCTIONS =============

async def generate_pl_reference() -> str:
    """Generate a unique PL reference (PL0001, PL0002, etc.)"""
    # Find the highest existing PL reference
    pipeline = [
        {"$match": {"pl_reference": {"$exists": True, "$ne": None}}},
        {"$project": {"num": {"$toInt": {"$substr": ["$pl_reference", 2, -1]}}}},
        {"$sort": {"num": -1}},
        {"$limit": 1}
    ]
    result = await db.businesses.aggregate(pipeline).to_list(1)
    
    if result:
        next_num = result[0]["num"] + 1
    else:
        next_num = 1
    
    return f"PL{next_num:04d}"

async def find_existing_business(phone: str = None, google_place_id: str = None, name: str = None, city: str = None):
    """Find an existing business by phone, google_place_id, or name+city"""
    if google_place_id:
        existing = await db.businesses.find_one({"google_place_id": google_place_id})
        if existing:
            return existing
    
    if phone:
        normalized = normalize_phone(phone)
        if normalized:
            # Search for matching phone (normalized)
            all_businesses = await db.businesses.find({"phone": {"$exists": True, "$ne": None}}).to_list(10000)
            for b in all_businesses:
                if normalize_phone(b.get("phone", "")) == normalized:
                    return b
    
    if name and city:
        existing = await db.businesses.find_one({
            "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            "city": {"$regex": f"^{re.escape(city)}$", "$options": "i"}
        })
        if existing:
            return existing
    
    return None

async def link_duplicate_businesses(business_id: str, phone: str):
    """Find and link businesses with the same phone number"""
    if not phone:
        return []
    
    normalized = normalize_phone(phone)
    if not normalized:
        return []
    
    # Find all businesses with matching phone
    all_with_phone = await db.businesses.find({"phone": {"$exists": True, "$ne": None}}).to_list(10000)
    matching_ids = []
    
    for b in all_with_phone:
        if b["id"] != business_id and normalize_phone(b.get("phone", "")) == normalized:
            matching_ids.append(b["id"])
    
    if matching_ids:
        # Update all linked businesses to point to each other
        all_linked = [business_id] + matching_ids
        for bid in all_linked:
            others = [x for x in all_linked if x != bid]
            await db.businesses.update_one(
                {"id": bid},
                {"$set": {"linked_business_ids": others}}
            )
    
    return matching_ids

# NOTE: normalize_phone, generate_data_sources, merge_data_sources imported from utils.helpers

# NOTE: geocode_location, search_google_places, get_place_details, check_website
# imported from services.google_places

# NOTE: get_sirene_data, get_annuaire_entreprises_data, get_bodacc_data, check_activity_coherence
# imported from services.sirene

# ========== NOUVELLES FONCTIONS D'ENRICHISSEMENT MULTI-SOURCES ==========

# NOTE: extract_emails_from_text and extract_phones_from_text imported from utils.helpers
# NOTE: scrape_website_contacts and search_email_via_web imported from services.web_scraper

async def enrich_business_full(
    business_id: str,
    name: str,
    city: str,
    postal_code: str,
    website: str,
    siret: str,
    siren: str,
    google_api_key: str,
    serper_api_key: str
) -> dict:
    """
    Wrapper local pour service_enrich_business_full avec injection des dépendances.
    """
    return await service_enrich_business_full(
        business_id=business_id,
        name=name,
        city=city,
        postal_code=postal_code,
        website=website,
        siret=siret,
        siren=siren,
        google_api_key=google_api_key,
        serper_api_key=serper_api_key,
        scrape_website_contacts_func=scrape_website_contacts,
        get_bodacc_data_func=get_bodacc_data,
        search_email_via_web_func=search_email_via_web
    )

# NOTE: normalize_phone imported from utils.helpers
# Using normalize_french_phone_full for full 10-digit normalization

async def link_businesses_by_phone(new_business_id: str, phone: str):
    """
    Cherche les fiches existantes avec le même numéro de téléphone
    et crée des liens bidirectionnels
    """
    if not phone:
        return
    
    normalized_phone = normalize_french_phone_full(phone)
    if not normalized_phone:
        return
    
    # Rechercher les fiches avec le même numéro (en excluant la nouvelle)
    existing_businesses = await db.businesses.find({
        "_id": {"$ne": new_business_id},
        "phone": {"$regex": normalized_phone[-8:], "$options": "i"}  # Matcher les 8 derniers chiffres
    }).to_list(length=50)
    
    if not existing_businesses:
        return
    
    linked_ids = []
    for existing in existing_businesses:
        existing_phone = normalize_french_phone_full(existing.get("phone", ""))
        # Vérifier que les numéros sont identiques
        if existing_phone == normalized_phone:
            existing_id = existing.get("id") or str(existing.get("_id"))
            linked_ids.append(existing_id)
            
            # Mettre à jour la fiche existante avec le lien vers la nouvelle
            existing_linked = existing.get("linked_business_ids", [])
            if new_business_id not in existing_linked:
                await db.businesses.update_one(
                    {"_id": existing["_id"]},
                    {"$addToSet": {"linked_business_ids": new_business_id}}
                )
                logger.info(f"🔗 Linked business {existing_id} -> {new_business_id} (same phone: {normalized_phone})")
    
    # Mettre à jour la nouvelle fiche avec les liens vers les existantes
    if linked_ids:
        await db.businesses.update_one(
            {"id": new_business_id},
            {"$addToSet": {"linked_business_ids": {"$each": linked_ids}}}
        )
        logger.info(f"🔗 New business {new_business_id} linked to {len(linked_ids)} existing business(es)")

# NOTE: normalize_name_for_matching, calculate_name_similarity imported from utils.helpers

async def enrich_business_data(company_name: str, city: str, postal_code: str, google_api_key: str, serper_api_key: str, user_id: str = None) -> dict:
    """
    Wrapper local pour service_enrich_business_data avec injection de track_api_usage.
    """
    return await service_enrich_business_data(
        company_name=company_name,
        city=city,
        postal_code=postal_code,
        google_api_key=google_api_key,
        serper_api_key=serper_api_key,
        user_id=user_id,
        track_api_usage_func=track_api_usage
    )

# NOTE: check_pagesjaunes_direct and detect_pagesjaunes_presence imported from services.pagesjaunes

# NOTE: calculate_score imported from utils.helpers

# ============= PAPPERS INTEGRATION =============

# NOTE: ACTIVITY_NAF_MAPPING imported from utils.helpers

# NOTE: get_cities_in_radius is now imported from services.geo as geo_get_cities_in_radius
async def get_cities_in_radius(lat: float, lng: float, radius_km: int) -> list[dict]:
    """Wrapper for geo service - maintains backward compatibility"""
    return await geo_get_cities_in_radius(lat, lng, radius_km)

async def search_pappers_companies(
    codes_postaux: list[str],
    activity_label: str = None,
    date_creation_min: str = None,
    max_results: int = 30,
    api_key: str = None
) -> list[dict]:
    """
    Recherche les nouvelles créations sur Pappers
    Filtre strict: entreprises actives, créées depuis moins d'un an, dans la zone
    """
    pappers_key = api_key or PAPPERS_API_KEY
    if not pappers_key:
        return []
    
    # Calculate date for 1 year ago if not provided
    if not date_creation_min:
        from datetime import timedelta
        one_year_ago = (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%d")
        date_creation_min = one_year_ago
    
    # Trouver les codes NAF correspondants à l'activité
    codes_naf = []
    if activity_label:
        activity_lower = activity_label.lower()
        for key, naf_codes in ACTIVITY_NAF_MAPPING.items():
            if key in activity_lower:
                codes_naf.extend(naf_codes)
                break
    
    all_companies = []
    seen_sirens = set()
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            for code_postal in codes_postaux[:8]:  # Max 8 codes postaux
                params = {
                    "api_token": pappers_key,
                    "code_postal": code_postal,
                    "par_page": 25,
                    "entreprise_cessee": "false",
                    "statut_entreprise": "Actif",  # STRICT: Only active companies
                    "date_creation_min": date_creation_min  # STRICT: Only recent creations
                }
                
                # Si on a des codes NAF, les utiliser
                if codes_naf:
                    for code_naf in codes_naf[:2]:
                        params["code_naf"] = code_naf
                        response = await client.get("https://api.pappers.fr/v2/recherche", params=params)
                        
                        if response.status_code == 200:
                            data = response.json()
                            for company in data.get("resultats", []):
                                siren = company.get("siren")
                                # Double-check: skip if company is ceased or inactive
                                if company.get("entreprise_cessee") == True:
                                    continue
                                if siren and siren not in seen_sirens:
                                    seen_sirens.add(siren)
                                    all_companies.append(company)
                else:
                    response = await client.get("https://api.pappers.fr/v2/recherche", params=params)
                    if response.status_code == 200:
                        data = response.json()
                        for company in data.get("resultats", []):
                            siren = company.get("siren")
                            # Double-check: skip if company is ceased or inactive
                            if company.get("entreprise_cessee") == True:
                                continue
                            if siren and siren not in seen_sirens:
                                seen_sirens.add(siren)
                                all_companies.append(company)
                
                if len(all_companies) >= max_results:
                    break
                    
    except Exception as e:
        logger.error(f"Erreur Pappers: {e}")
    
    logger.info(f"📊 Pappers: {len(all_companies)} créations récentes trouvées (actives, <1 an)")
    return all_companies[:max_results]

# ============= INITIALIZATION =============

@app.on_event("startup")
async def startup():
    """Initialize database with activities seed"""
    try:
        # Check if activities already exist
        count = await db.activities.count_documents({})
        if count == 0:
            logger.info("🌱 Seeding activities database...")
            activities = [Activity(**act_data).dict() for act_data in ACTIVITIES_SEED]
            await db.activities.insert_many(activities)
            logger.info(f"✅ Inserted {len(activities)} activities")
        
        # Create default admin user if not exists
        admin_exists = await db.users.find_one({"email": "admin@prospection.com"})
        if not admin_exists:
            admin = User(
                email="admin@prospection.com",
                password_hash=get_password_hash("admin123"),
                role=Role.ADMIN
            )
            await db.users.insert_one(admin.dict())
            logger.info("✅ Created default admin user (admin@prospection.com / admin123)")
        
        # Start surveillance background loop
        logger.info("🔄 Starting surveillance background engine...")
        asyncio.create_task(surveillance_background_loop())
        
        # Start weekly summary scheduler
        logger.info("📧 Starting weekly summary scheduler...")
        asyncio.create_task(weekly_summary_scheduler())
            
    except Exception as e:
        logger.error(f"Startup error: {e}")

# ============= AUTH ENDPOINTS =============

# ============= ACTIVITIES ENDPOINTS =============

@api_router.get("/activities", response_model=List[Activity])
async def get_activities(
    search: Optional[str] = None,
    family: Optional[ActivityFamily] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all activities with optional search and filter"""
    query = {"is_active": True}
    
    if search:
        # Search in label and synonyms
        query["$or"] = [
            {"label": {"$regex": search, "$options": "i"}},
            {"synonyms": {"$regex": search, "$options": "i"}}
        ]
    
    if family:
        query["family"] = family
    
    activities = await db.activities.find(query, {"_id": 0}).sort("label", 1).to_list(1000)
    return activities

@api_router.post("/activities", response_model=Activity)
async def create_activity(
    activity: ActivityCreate,
    current_user: dict = Depends(get_current_admin)
):
    """Create new activity (admin only)"""
    new_activity = Activity(**activity.dict())
    await db.activities.insert_one(new_activity.dict())
    return new_activity

# ============= SCAN ENDPOINTS =============

@api_router.post("/scans", response_model=Scan)
async def create_scan(
    scan_create: ScanCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new scan and start processing"""
    
    # SECURITY: Check if user has their own API keys (admin bypass)
    user = await db.users.find_one({"id": current_user["sub"]})
    is_admin = user.get("role") == "admin" if user else False
    
    if not is_admin:
        # Non-admin users MUST have their own Google API key to scan
        user_google_key = user.get("google_api_key") if user else None
        user_serper_key = user.get("serper_api_key") if user else None
        
        if not user_google_key or not user_serper_key:
            logger.warning(f"⛔ User {current_user.get('email', 'unknown')} tried to scan without personal API keys")
            raise HTTPException(
                status_code=403, 
                detail="Vous devez configurer vos clés API personnelles (Google et Serper) avant de pouvoir effectuer des scans. Rendez-vous dans Paramètres > Clés API."
            )
    
    # Determine activities to scan based on mode
    activities_to_scan = []
    scan_label = ""
    
    if getattr(scan_create, 'activity_mode', 'single') == 'domain' and scan_create.domains:
        # Domain mode: get all activities from selected domains
        domain_activities = await db.activities.find({
            "family": {"$in": scan_create.domains},
            "is_active": True
        }, {"_id": 0}).to_list(200)
        
        activities_to_scan = domain_activities
        scan_label = f"Domaines: {', '.join(scan_create.domains)}"
        logger.info(f"📦 Domain scan: {len(activities_to_scan)} activities from domains {scan_create.domains}")
    else:
        # Single activity mode
        activity = await db.activities.find_one({"id": scan_create.activity_id}, {"_id": 0})
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        activities_to_scan = [activity]
        scan_label = activity["label"]
    
    # Calculate total steps for progress tracking
    total_activities = len(activities_to_scan)
    total_cities = 1  # Will be updated if multi-city mode
    if getattr(scan_create, 'search_mode', 'radius') == 'multi' and scan_create.additional_cities:
        total_cities = 1 + len(scan_create.additional_cities)
    total_search_steps = total_activities * total_cities * 3  # 3 search terms per activity approx
    
    # Create scan record with progress tracking
    scan = Scan(
        user_id=current_user["sub"],
        activity_id=scan_create.activity_id or activities_to_scan[0].get("id", ""),
        query_label=scan_label,
        location_label=scan_create.location_label,
        radius_km=scan_create.radius_km,
        status=ScanStatus.PENDING
    )
    scan_dict = scan.dict()
    scan_dict["progress"] = 0
    scan_dict["progress_message"] = "Démarrage du scan..."
    scan_dict["progress_step"] = 0
    scan_dict["progress_total_steps"] = total_search_steps + 10  # +10 for enrichment
    await db.scans.insert_one(scan_dict)
    
    # Helper function to update progress
    async def update_scan_progress(step: int, message: str, extra_data: dict = None):
        progress_pct = min(int((step / scan_dict["progress_total_steps"]) * 100), 99)
        update_data = {
            "progress": progress_pct,
            "progress_message": message,
            "progress_step": step
        }
        if extra_data:
            update_data.update(extra_data)
        await db.scans.update_one(
            {"id": scan.id},
            {"$set": update_data}
        )
    
    # Start scan processing
    try:
        # Get user's API keys (or fallback to global)
        user_keys = await fetch_user_api_keys(current_user["sub"])
        google_api_key = user_keys["google_api_key"]
        serper_api_key = user_keys["serper_api_key"]
        pappers_api_key = user_keys["pappers_api_key"]
        
        logger.info(f"🔑 Using API keys - Google: {'user' if user_keys['using_own_keys']['google'] else 'global'}, Serper: {'user' if user_keys['using_own_keys']['serper'] else 'global'}, Pappers: {'user' if user_keys['using_own_keys']['pappers'] else 'global'}")
        
        # Determine list of cities to search
        cities_to_search = [scan_create.location_label]
        
        # If multi-city mode, add additional cities
        if getattr(scan_create, 'search_mode', 'radius') == 'multi' and scan_create.additional_cities:
            cities_to_search.extend(scan_create.additional_cities)
            logger.info(f"🌆 Multi-city mode: searching {len(cities_to_search)} cities")
        
        # Search Google Places across all activities and cities
        all_places = []
        seen_place_ids = set()
        current_step = 0  # Progress tracking
        
        # Update status to processing
        await db.scans.update_one(
            {"id": scan.id},
            {"$set": {"status": "processing", "progress_message": "Recherche en cours..."}}
        )
        
        # Loop through all activities (single in normal mode, multiple in domain mode)
        for activity in activities_to_scan:
            # Build search terms list for this activity
            search_terms = [activity["label"]]
            if activity.get("synonyms"):
                search_terms.extend(activity["synonyms"][:2])
            
            for city_name in cities_to_search:
                # Geocode each city
                try:
                    lat, lng = await geocode_location(city_name, google_api_key)
                    logger.info(f"📍 Scanning: {activity['label']} at {city_name} ({lat}, {lng})")
                except Exception as e:
                    logger.warning(f"⚠️ Could not geocode city '{city_name}': {e}")
                    continue
                
                for search_term in search_terms:
                    current_step += 1
                    
                    # Update progress
                    await update_scan_progress(
                        current_step,
                        f"Recherche '{search_term}' à {city_name}... ({len(all_places)} établissements)",
                        {"total_results": len(all_places)}
                    )
                    
                    query = f"{search_term} {city_name}"
                    
                    # In multi-city mode, only search without radius (city exact match)
                    search_radius = 0 if len(cities_to_search) > 1 else scan_create.radius_km
                    
                    places = await search_google_places(
                    query,
                    lat,
                    lng,
                    search_radius,
                    google_api_key,
                    max_results=40 if len(cities_to_search) > 1 else 60
                )
                
                # Deduplicate by place_id
                for place in places:
                    place_id = place.get("place_id")
                    if place_id and place_id not in seen_place_ids:
                        seen_place_ids.add(place_id)
                        all_places.append(place)
                
                logger.info(f"  🔍 '{search_term}' @ {city_name}: {len(places)} résultats")
        
        logger.info(f"📊 Total unique places across all cities: {len(all_places)}")
        places = all_places
        
        businesses_created = []
        
        for place in places:
            # Extract data
            name = place.get("name", "")
            address = place.get("formatted_address", "")
            phone = place.get("formatted_phone_number", "")
            website = place.get("website")
            rating = place.get("rating")
            reviews = place.get("user_ratings_total", 0)
            place_id = place.get("place_id")
            
            # Extract city and postal code from address
            address_parts = address.split(",") if address else []
            city = address_parts[-2].strip() if len(address_parts) > 1 else ""
            postal_code = ""
            if city:
                postal_match = re.search(r'\b\d{5}\b', city)
                if postal_match:
                    postal_code = postal_match.group()
                    city = city.replace(postal_code, "").strip()
            
            # Check website
            has_website = await check_website(website) if website else False
            
            # Vérifier présence Pages Jaunes (vérification directe)
            has_pj, pj_url, confidence, pj_status, sirene_data = await detect_pagesjaunes_presence(
                name,
                phone,
                city,
                postal_code,
                serper_api_key
            )
            
            # Extract SIRET/SIREN if found
            siret = sirene_data.get("siret") if sirene_data else None
            siren = sirene_data.get("siren") if sirene_data else None
            date_creation = sirene_data.get("date_creation") if sirene_data else None
            
            # Generate Pappers URL if we have SIREN
            pappers_url = f"https://www.pappers.fr/entreprise/{siren}" if siren else None
            
            # Check if company was created less than 1 year ago
            is_recent_creation = False
            if date_creation:
                try:
                    from datetime import timedelta
                    creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                    one_year_ago = datetime.utcnow() - timedelta(days=365)
                    is_recent_creation = creation_date >= one_year_ago
                except:
                    pass
            
            # Determine lead type based on phone and creation date
            lead_type = "standard"
            if is_recent_creation and not phone:
                lead_type = "visite_terrain"
            elif is_recent_creation and phone:
                lead_type = "prospect_prioritaire"
            
            # Prepare business data for scoring
            business_data = {
                "has_google": True,
                "has_pagesjaunes": has_pj,
                "has_website": has_website,
                "google_reviews_count": reviews,
                "source": "google",
                "phone": phone,
                "siret": siret  # Ajout du SIRET pour le scoring
            }
            
            # Calculate score
            score, score_reason = calculate_score(business_data)
            
            # Add bonus for recent creation
            if is_recent_creation:
                score += 15
                score_reason += f" | 🆕 Création récente (+15)"
            
            # Create business record
            business = Business(
                scan_id=scan.id,
                name=name,
                address=address,
                city=city,
                postal_code=postal_code,
                phone=phone,
                website_url=website,
                google_place_id=place_id,
                google_rating=rating,
                google_reviews_count=reviews,
                pagesjaunes_url=pj_url,
                match_confidence=confidence,
                has_google=True,
                has_pagesjaunes=has_pj,
                has_website=has_website,
                score=min(score, 100),
                score_reason=score_reason,
                latitude=place.get("geometry", {}).get("location", {}).get("lat"),
                longitude=place.get("geometry", {}).get("location", {}).get("lng"),
                siret=siret,
                siren=siren,
                pj_confidence=pj_status,
                pappers_url=pappers_url,
                lead_type=lead_type,
                date_creation=date_creation,
                source="google",
                # RÈGLE MÉTIER : PagesJaunes détecté → automatiquement dans le CRM
                in_crm=has_pj,  # Si présent PJ, alors présent CRM
                # Traçabilité des sources
                data_sources=generate_data_sources(
                    source_type="google",
                    fields={
                        "name": name,
                        "address": address,
                        "city": city,
                        "postal_code": postal_code,
                        "phone": phone,
                        "website_url": website,
                        "google_rating": rating,
                        "google_reviews_count": reviews,
                    },
                    google_place_id=place_id
                )
            )
            
            # Log si auto-CRM appliqué
            if has_pj:
                logger.info(f"📋 Auto-CRM: {name} marqué 'dans le CRM' (présent sur PagesJaunes)")
            
            # Generate unique PL reference
            pl_ref = await generate_pl_reference()
            business.pl_reference = pl_ref
            business.first_detected_at = datetime.utcnow()
            business.first_detected_by = current_user["sub"]
            
            await db.businesses.insert_one(business.dict())
            
            # Link businesses with same phone number
            if phone:
                await link_businesses_by_phone(business.id, phone)
            
            # Create shared history for this business
            user = await db.users.find_one({"id": current_user["sub"]})
            user_email = user.get("email", "unknown") if user else "unknown"
            await get_or_create_shared_history(business.id, pl_ref, current_user["sub"], user_email, scan.id)
            
            businesses_created.append(business)
            
            # Track visite terrain for notification
            if lead_type == "visite_terrain":
                visite_terrain_count = getattr(scan, '_visite_count', 0) + 1
                setattr(scan, '_visite_count', visite_terrain_count)
            
            logger.info(f"✅ {name} ({pl_ref}) - Score: {score} - PJ: {'✓' if has_pj else '✗'} - Type: {lead_type}")
            
            # Auto-enrichissement si site web présent mais pas de téléphone
            if website and not phone:
                try:
                    web_contacts = await scrape_website_contacts(website)
                    if web_contacts["success"]:
                        update_fields = {}
                        if web_contacts["phones"]:
                            update_fields["phone"] = web_contacts["phones"][0]
                            update_fields["phones_all"] = web_contacts["phones"]
                            update_fields["phone_source"] = "website_scraping"
                            logger.info(f"📞 Téléphone trouvé via site web: {web_contacts['phones'][0]}")
                        if web_contacts["emails"]:
                            update_fields["email"] = web_contacts["emails"][0]
                            update_fields["emails_all"] = web_contacts["emails"]
                        if web_contacts["social_links"]:
                            update_fields["social_links"] = web_contacts["social_links"]
                        
                        if update_fields:
                            update_fields["enrichment_sources"] = ["website_scraping"]
                            await db.businesses.update_one(
                                {"id": business.id},
                                {"$set": update_fields}
                            )
                except Exception as e:
                    logger.debug(f"Erreur enrichissement web pour {name}: {e}")
        
        # Count visite terrain leads
        visite_terrain_businesses = [b for b in businesses_created if b.lead_type == "visite_terrain"]
        
        # ============= PAPPERS INTEGRATION =============
        # Rechercher les nouvelles créations dans les villes du rayon
        pappers_count = 0
        if pappers_api_key:
            logger.info(f"🔍 Recherche Pappers pour {activity['label']} dans un rayon de {scan_create.radius_km}km...")
            
            try:
                # Obtenir les villes dans le rayon
                cities_in_radius = await get_cities_in_radius(lat, lng, scan_create.radius_km)
                
                # Collecter tous les codes postaux
                all_postal_codes = []
                for city_data in cities_in_radius[:15]:  # Max 15 villes
                    all_postal_codes.extend(city_data.get("codes_postaux", []))
                
                # Supprimer les doublons
                all_postal_codes = list(set(all_postal_codes))[:10]
                
                if all_postal_codes:
                    # Date de création minimum = 12 mois
                    from datetime import timedelta
                    date_min = (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%d")
                    
                    # Rechercher les nouvelles créations
                    pappers_companies = await search_pappers_companies(
                        all_postal_codes,
                        activity["label"],
                        date_min,
                        max_results=25
                    )
                    
                    # Traiter chaque entreprise Pappers
                    for company in pappers_companies:
                        company_name = company.get("denomination") or company.get("nom_entreprise", "")
                        if not company_name:
                            continue
                        
                        # Vérifier le statut de l'entreprise - ignorer si cessée
                        statut = company.get("statut_rcs", "").lower()
                        if "radié" in statut or "cessé" in statut or "liquidation" in statut:
                            logger.info(f"⏭️ [Pappers] Ignoré {company_name} - Statut: {statut}")
                            continue
                        
                        # Vérifier la date de création - moins d'un an
                        date_creation = company.get("date_creation", "")
                        if date_creation:
                            try:
                                creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                                one_year_ago = datetime.utcnow() - timedelta(days=365)
                                if creation_date < one_year_ago:
                                    logger.info(f"⏭️ [Pappers] Ignoré {company_name} - Trop ancien: {date_creation}")
                                    continue
                            except:
                                pass  # Si erreur de parsing, on garde
                        
                        # Vérifier si déjà dans les résultats Google (par SIREN)
                        company_siren = company.get("siren", "")
                        existing = await db.businesses.find_one({
                            "scan_id": scan.id,
                            "siren": company_siren
                        }) if company_siren else None
                        
                        if existing:
                            continue  # Déjà trouvé via Google
                        
                        # Extraire les données
                        siege = company.get("siege", {})
                        company_address = f"{siege.get('adresse_ligne_1', '')}, {siege.get('code_postal', '')} {siege.get('ville', '')}".strip(", ")
                        company_city = siege.get("ville", "")
                        company_postal = siege.get("code_postal", "")
                        company_siret = siege.get("siret", "")
                        activite_naf = company.get("libelle_code_naf", "")
                        
                        # Générer l'URL Pappers
                        pappers_url = f"https://www.pappers.fr/entreprise/{company_siren}" if company_siren else None
                        
                        # Vérifier présence Google et PagesJaunes
                        has_pj, pj_url, pj_conf, pj_status, _ = await detect_pagesjaunes_presence(
                            company_name, "", company_city, company_postal, serper_api_key
                        )
                        
                        # Calculer le score (source = pappers)
                        business_data = {
                            "has_google": False,
                            "has_pagesjaunes": has_pj,
                            "has_website": False,
                            "phone": "",
                            "address": company_address,
                            "google_reviews_count": 0,
                            "source": "pappers"
                        }
                        score, score_reason = calculate_score(business_data)
                        
                        # Déterminer le type de lead
                        lead_type = "visite_terrain" if company_address else "standard"
                        
                        # Créer l'enregistrement
                        pappers_business = Business(
                            scan_id=scan.id,
                            name=company_name,
                            address=company_address,
                            city=company_city,
                            postal_code=company_postal,
                            phone="",  # Pappers ne fournit pas le téléphone
                            siret=company_siret,
                            siren=company_siren,
                            has_google=False,
                            has_pagesjaunes=has_pj,
                            pagesjaunes_url=pj_url,
                            pj_confidence=pj_status,
                            score=score,
                            score_reason=score_reason + f" | 📅 Créé le {date_creation}" if date_creation else score_reason,
                            source="pappers",
                            date_creation=date_creation,
                            activite_naf=activite_naf,
                            lead_type=lead_type,
                            pappers_url=pappers_url
                        )
                        
                        await db.businesses.insert_one(pappers_business.dict())
                        businesses_created.append(pappers_business)
                        pappers_count += 1
                        
                        # Count visite terrain from Pappers
                        if lead_type == "visite_terrain":
                            visite_terrain_businesses.append(pappers_business)
                        
                        logger.info(f"🆕 [Pappers] {company_name} - Score: {score} - Type: {lead_type}")
                
            except Exception as pe:
                logger.error(f"Erreur Pappers: {pe}")
        
        # Update scan status - COMPLETE
        total_count = len(businesses_created)
        visite_count = len(visite_terrain_businesses)
        
        await db.scans.update_one(
            {"id": scan.id},
            {"$set": {
                "status": ScanStatus.DONE,
                "total_results": total_count,
                "pappers_count": pappers_count,
                "visite_terrain_count": visite_count,
                "progress": 100,
                "progress_message": f"Terminé ! {total_count} établissements trouvés",
                "progress_step": scan_dict["progress_total_steps"]
            }}
        )
        
        # Create notification for visite terrain if any
        if visite_count > 0:
            notif = Notification(
                user_id=current_user["sub"],
                type=NotificationType.VISITE_TERRAIN,
                title=f"🚗 {visite_count} visite(s) de prospection détectée(s)",
                message=f"Le scan '{activity['label']}' a trouvé {visite_count} entreprise(s) récente(s) sans téléphone. Rendez-vous sur place pour récupérer leurs coordonnées !",
                data={
                    "scan_id": scan.id,
                    "visite_count": visite_count,
                    "businesses": [{"id": b.id, "name": b.name, "address": b.address} for b in visite_terrain_businesses[:5]]
                }
            )
            await db.notifications.insert_one(notif.dict())
            logger.info(f"📬 Notification créée: {visite_count} visite(s) terrain")
        
        logger.info(f"🎉 Scan terminé: {total_count} entreprises (dont {pappers_count} Pappers, {visite_count} visites terrain)")
        
        # Auto-enrich with web data (background task)
        user_keys = await fetch_user_api_keys(current_user["sub"])
        serper_key = user_keys.get("serper_api_key")
        if serper_key:
            asyncio.create_task(auto_enrich_scan_with_web(db, scan.id, current_user["sub"], serper_key))
            logger.info(f"🔄 Auto-enrichment web lancé en arrière-plan pour le scan {scan.id}")
        
        # Return updated scan
        updated_scan = await db.scans.find_one({"id": scan.id}, {"_id": 0})
        return Scan(**updated_scan)
        
    except Exception as e:
        import traceback
        logger.error(f"❌ Scan error: {e}")
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        await db.scans.update_one(
            {"id": scan.id},
            {"$set": {"status": ScanStatus.ERROR}}
        )
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/scans")
async def get_scans(current_user: dict = Depends(get_current_user)):
    """Get user's scan history with actual result counts and enrichment info"""
    scans = await db.scans.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Add actual result_count and enrichment info from businesses collection
    for scan in scans:
        scan_id = scan.get("id")
        if scan_id:
            # Count total businesses
            count = await db.businesses.count_documents({"scan_id": scan_id})
            scan["result_count"] = count
            
            # Count web-enriched businesses and phones found
            enriched_count = await db.businesses.count_documents({
                "scan_id": scan_id,
                "web_enriched": True
            })
            
            # Count businesses that got phone via web enrichment
            phones_from_web = await db.businesses.count_documents({
                "scan_id": scan_id,
                "web_enriched": True,
                "phone": {"$nin": [None, "", "N/A"]}
            })
            
            scan["web_enriched_count"] = enriched_count
            scan["web_phones_found"] = phones_from_web
    
    return scans

@api_router.delete("/scans/{scan_id}")
async def delete_scan(scan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a scan and all its businesses"""
    # Verify scan belongs to user
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Delete all businesses for this scan
    await db.businesses.delete_many({"scan_id": scan_id})
    
    # Delete the scan
    await db.scans.delete_one({"id": scan_id})
    
    return {"success": True, "message": "Scan deleted"}

@api_router.patch("/scans/{scan_id}/favorite")
async def toggle_favorite(scan_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle favorite status of a scan"""
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    new_status = not scan.get("is_favorite", False)
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {"is_favorite": new_status}}
    )
    
    return {"success": True, "is_favorite": new_status}

# ========== PAPPERS - NOUVELLES CRÉATIONS ==========

@api_router.post("/scans/pappers")
async def create_pappers_scan(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a scan for new companies from Pappers.fr"""
    
    if not PAPPERS_API_KEY:
        raise HTTPException(status_code=500, detail="Clé API Pappers non configurée")
    
    code_postal = data.get("code_postal")
    date_creation_min = data.get("date_creation_min")  # Format: YYYY-MM-DD
    code_naf = data.get("code_naf")  # Optional filter
    
    if not code_postal:
        raise HTTPException(status_code=400, detail="Code postal requis")
    
    # Create scan record
    scan = Scan(
        user_id=current_user["sub"],
        activity_id="pappers_nouvelles_creations",
        query_label=f"Nouvelles créations ({code_postal})",
        location_label=code_postal,
        radius_km=0,
        status=ScanStatus.PENDING
    )
    await db.scans.insert_one(scan.dict())
    
    logger.info(f"🆕 Starting Pappers scan for {code_postal} (since {date_creation_min})")
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            params = {
                "api_token": PAPPERS_API_KEY,
                "code_postal": code_postal,
                "par_page": 100,
                "entreprise_cessee": "false"  # Only active companies
            }
            
            if date_creation_min:
                params["date_creation_min"] = date_creation_min
            
            if code_naf:
                params["code_naf"] = code_naf
            
            response = await client.get("https://api.pappers.fr/v2/recherche", params=params)
            
            if response.status_code != 200:
                logger.error(f"Pappers API error: {response.text}")
                raise HTTPException(status_code=500, detail="Erreur API Pappers")
            
            pappers_data = response.json()
            companies = pappers_data.get("resultats", [])
            
            logger.info(f"📊 Found {len(companies)} companies from Pappers")
        
        businesses_created = 0
        
        for company in companies:
            # Extract company data
            name = company.get("denomination") or company.get("nom_entreprise") or "N/A"
            siren = company.get("siren", "")
            date_creation = company.get("date_creation", "")
            activite = company.get("libelle_code_naf", "")
            
            # Get address from siege or first etablissement
            siege = company.get("siege", {})
            adresse = siege.get("adresse_ligne_1", "")
            code_postal_ent = siege.get("code_postal", "")
            ville = siege.get("ville", "")
            latitude = siege.get("latitude")
            longitude = siege.get("longitude")
            
            # Build full address
            full_address = f"{adresse}, {code_postal_ent} {ville}".strip(", ")
            
            # Get SIRET
            siret = siege.get("siret", "")
            
            # Check if has Google presence (quick search)
            has_google = False
            google_data = {}
            
            try:
                google_api_key = os.getenv("GOOGLE_API_KEY", "")
                if google_api_key and latitude and longitude:
                    search_url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json"
                    async with httpx.AsyncClient(timeout=10) as gclient:
                        gresponse = await gclient.get(search_url, params={
                            "key": google_api_key,
                            "location": f"{latitude},{longitude}",
                            "radius": 50,
                            "keyword": name
                        })
                        if gresponse.status_code == 200:
                            gdata = gresponse.json()
                            if gdata.get("results"):
                                has_google = True
                                google_data = gdata["results"][0]
            except Exception as e:
                logger.warning(f"Google check failed for {name}: {e}")
            
            # Check PagesJaunes presence
            has_pj, pj_url, pj_confidence, pj_status, sirene_data = await detect_pagesjaunes_presence(
                name, "", ville, code_postal_ent
            )
            
            # Calculate opportunity score
            score = 0
            score_reasons = []
            
            # New company bonus
            if date_creation:
                try:
                    creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                    months_old = (datetime.now() - creation_date).days / 30
                    if months_old <= 6:
                        score += 30
                        score_reasons.append("🆕 Création < 6 mois (+30)")
                    elif months_old <= 12:
                        score += 20
                        score_reasons.append("🆕 Création < 1 an (+20)")
                except:
                    pass
            
            # No PagesJaunes = opportunity
            if not has_pj:
                score += 40
                score_reasons.append("❌ Absent de PagesJaunes (+40)")
            
            # No Google = more opportunity
            if not has_google:
                score += 20
                score_reasons.append("❌ Absent de Google (+20)")
            
            # Has address = can visit
            if adresse:
                score += 10
                score_reasons.append("📍 Adresse disponible (+10)")
            
            # Determine lead type
            lead_type = "standard"
            if not has_pj and not has_google:
                lead_type = "visite_terrain"  # No online presence, visit needed
                score_reasons.append("🚗 VISITE TERRAIN RECOMMANDÉE")
            elif not has_pj:
                lead_type = "prospect_prioritaire"
            
            # Create business record
            business = Business(
                scan_id=scan.id,
                name=name,
                address=full_address,
                city=ville,
                postal_code=code_postal_ent,
                phone="",  # Pappers doesn't provide phone
                siret=siret,
                has_google=has_google,
                google_place_id=google_data.get("place_id", ""),
                google_rating=google_data.get("rating"),
                google_reviews_count=google_data.get("user_ratings_total", 0),
                has_pagesjaunes=has_pj,
                pagesjaunes_url=pj_url,
                pj_confidence=str(pj_status) if pj_status else "unknown",
                score=min(score, 100),
                score_reason=" | ".join(score_reasons),
                source="pappers",
                date_creation=date_creation,
                activite_naf=activite,
                lead_type=lead_type
            )
            
            await db.businesses.insert_one(business.dict())
            businesses_created += 1
            
            # Auto-enrichissement pour trouver le téléphone si absent
            if not business.phone:
                try:
                    user_keys = await fetch_user_api_keys(current_user["sub"])
                    serper_api_key = user_keys.get("serper_api_key", "")
                    google_api_key = user_keys.get("google_api_key", "")
                    
                    # Essayer de trouver le téléphone via Google/Serper
                    enrichment = await enrich_business_data(
                        name, ville, code_postal_ent,
                        google_api_key, serper_api_key
                    )
                    
                    update_fields = {}
                    
                    if enrichment.get("phone"):
                        update_fields["phone"] = enrichment["phone"]
                        update_fields["phone_source"] = "auto_enrichment"
                        logger.info(f"📞 Téléphone trouvé pour {name}: {enrichment['phone']}")
                        # Si téléphone trouvé, plus visite_terrain
                        if business.lead_type == "visite_terrain":
                            update_fields["lead_type"] = "standard"
                    
                    if enrichment.get("email"):
                        update_fields["email"] = enrichment["email"]
                    
                    if enrichment.get("website"):
                        update_fields["website_url"] = enrichment["website"]
                        update_fields["has_website"] = True
                    
                    if update_fields:
                        update_fields["enrichment_sources"] = ["google_places", "serper"]
                        update_fields["enriched_at"] = datetime.utcnow()
                        await db.businesses.update_one(
                            {"id": business.id},
                            {"$set": update_fields}
                        )
                except Exception as e:
                    logger.debug(f"Erreur enrichissement pour {name}: {e}")
            
            # Vérification BODACC pour détecter les procédures collectives
            if siren:
                try:
                    bodacc_data = await get_bodacc_data(siren)
                    if bodacc_data.get("has_procedure_collective"):
                        await db.businesses.update_one(
                            {"id": business.id},
                            {"$set": {
                                "has_procedure_collective": True,
                                "bodacc_alerts": bodacc_data.get("annonces", [])[:3]
                            }}
                        )
                        logger.warning(f"⚠️ Procédure collective détectée pour {name}")
                except Exception as e:
                    logger.debug(f"Erreur BODACC pour {name}: {e}")
            
            logger.info(f"✅ {name} - Score: {score} - Type: {lead_type}")
        
        # Update scan status
        await db.scans.update_one(
            {"id": scan.id},
            {"$set": {
                "status": ScanStatus.DONE,
                "total_results": businesses_created,
                "completed_at": datetime.utcnow()
            }}
        )
        
        logger.info(f"🎉 Pappers scan completed: {businesses_created} businesses")
        
        return {
            "id": scan.id,
            "total_results": businesses_created,
            "message": f"{businesses_created} nouvelles entreprises trouvées"
        }
        
    except Exception as e:
        logger.error(f"Pappers scan error: {e}")
        await db.scans.update_one(
            {"id": scan.id},
            {"$set": {"status": ScanStatus.ERROR}}
        )
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/scans/{scan_id}/refresh")
async def refresh_scan(scan_id: str, current_user: dict = Depends(get_current_user)):
    """Refresh Pages Jaunes detection for existing scan"""
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Get all businesses for this scan
    businesses = await db.businesses.find({"scan_id": scan_id}).to_list(1000)
    
    updated_count = 0
    for business in businesses:
        # Re-check Pages Jaunes (vérification directe)
        has_pj, pj_url, confidence, pj_status, sirene_data = await detect_pagesjaunes_presence(
            business.get("name", ""),
            business.get("phone", ""),
            business.get("city", ""),
            business.get("postal_code", "")
        )
        
        # Recalculate score with new PJ data
        business_data = {
            "has_google": business.get("has_google", True),
            "has_pagesjaunes": has_pj,
            "has_website": business.get("has_website", False),
            "phone": business.get("phone"),
            "google_reviews_count": business.get("google_reviews_count", 0)
        }
        score, score_reason = calculate_score(business_data)
        
        # Update business
        siret = sirene_data.get("siret") if sirene_data else None
        siren = sirene_data.get("siren") if sirene_data else None
        
        await db.businesses.update_one(
            {"id": business["id"]},
            {"$set": {
                "has_pagesjaunes": has_pj,
                "pagesjaunes_url": pj_url,
                "match_confidence": confidence,
                "score": score,
                "score_reason": score_reason,
                "siret": siret,
                "siren": siren,
                "pj_confidence": pj_status
            }}
        )
        updated_count += 1
    
    # Update scan last_scanned_at
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {"last_scanned_at": datetime.utcnow()}}
    )
    
    return {
        "success": True,
        "message": f"{updated_count} établissements actualisés",
        "updated_count": updated_count
    }

# ============= EXPORT ENDPOINTS =============

@api_router.get("/scans/{scan_id}/export/csv")
async def export_csv(
    scan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Export scan results to CSV with enriched prospection data"""
    
    # Verify scan
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Get businesses
    businesses = await db.businesses.find({"scan_id": scan_id}, {"_id": 0}).to_list(1000)
    
    if not businesses:
        raise HTTPException(status_code=404, detail="No data to export")
    
    # Get user status for each business
    user_statuses = await db.user_business_status.find({
        "user_id": current_user["sub"],
        "business_id": {"$in": [b["id"] for b in businesses]}
    }).to_list(1000)
    status_map = {s["business_id"]: s for s in user_statuses}
    
    # Helper function to determine opportunity level
    def get_opportunity_level(b):
        no_pj = not b.get("has_pagesjaunes", True)
        low_visibility = (b.get("google_reviews_count") or 0) < 5
        has_phone = bool(b.get("phone"))
        has_website = bool(b.get("website_url") or b.get("has_website"))
        
        if no_pj and low_visibility and has_phone:
            return "🔥 MAXIMUM"
        elif no_pj and has_phone:
            return "⭐ HAUTE"
        elif no_pj:
            return "📍 MOYENNE"
        else:
            return "📋 STANDARD"
    
    # Create CSV with enriched columns
    output = io.StringIO()
    fieldnames = [
        "nom", "activite", "adresse", "ville", "telephone", "site_web",
        "pagesjaunes_statut", "pagesjaunes_url", 
        "google_note", "google_avis", "google_url",
        "opportunite", "score", "score_detail",
        "statut_contact", "statut_client", "notes",
        "siret"
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    
    for b in businesses:
        status = status_map.get(b["id"], {})
        google_url = f"https://www.google.com/maps/place/?q=place_id:{b.get('google_place_id')}" if b.get("google_place_id") else ""
        
        # Determine PJ status text
        pj_status = "ABSENT"
        if b.get("has_pagesjaunes"):
            pj_status = "PRÉSENT"
        elif b.get("pj_confidence") == "not_found":
            pj_status = "ABSENT (vérifié)"
        elif b.get("pj_confidence") == "confirmed":
            pj_status = "PRÉSENT (vérifié)"
        elif b.get("pj_manually_set"):
            pj_status = "PRÉSENT (manuel)" if b.get("has_pagesjaunes") else "ABSENT (manuel)"
        
        writer.writerow({
            "nom": b.get("name", ""),
            "activite": scan.get("query_label", ""),
            "adresse": b.get("address", ""),
            "ville": b.get("city", ""),
            "telephone": b.get("phone", ""),
            "site_web": b.get("website_url", ""),
            "pagesjaunes_statut": pj_status,
            "pagesjaunes_url": b.get("pagesjaunes_url", ""),
            "google_note": b.get("google_rating", ""),
            "google_avis": b.get("google_reviews_count", ""),
            "google_url": google_url,
            "opportunite": get_opportunity_level(b),
            "score": b.get("score", ""),
            "score_detail": b.get("score_reason", ""),
            "statut_contact": "Contacté" if status.get("contact_status") == "contacted" else "",
            "statut_client": "Client" if status.get("client_status") == "client" else "",
            "notes": status.get("note", ""),
            "siret": b.get("siret", "")
        })
    
    # Generate filename with activity and location
    safe_activity = scan.get("query_label", "scan").replace(" ", "_")[:20]
    safe_location = scan.get("location_label", "").replace(" ", "_")[:20]
    filename = f"ProspectLocal_{safe_activity}_{safe_location}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ========== CITIES AUTOCOMPLETE (API GEO GOUV) ==========
@api_router.get("/cities/search")
async def search_cities(q: str):
    """
    Search French cities using API Geo Gouv
    Returns list of cities matching the query
    """
    if not q or len(q) < 2:
        return []
    
    try:
        async with httpx.AsyncClient() as http_client:
            # API Geo du gouvernement français
            url = "https://geo.api.gouv.fr/communes"
            params = {
                "nom": q,
                "fields": "nom,code,codesPostaux,codeDepartement,departement,population",
                "boost": "population",  # Prioritize by population
                "limit": 10
            }
            
            response = await http_client.get(url, params=params, timeout=5.0)
            
            if response.status_code == 200:
                cities = response.json()
                return [
                    {
                        "name": city.get("nom"),
                        "code": city.get("code"),
                        "postal_codes": city.get("codesPostaux", []),  # All postal codes
                        "codesPostaux": city.get("codesPostaux", []),  # Alias for frontend compatibility
                        "department": city.get("departement", {}).get("nom", ""),
                        "department_code": city.get("codeDepartement"),
                        "population": city.get("population", 0),
                        "label": f"{city.get('nom')} ({city.get('codeDepartement')})"
                    }
                    for city in cities
                ]
            
            return []
    except Exception as e:
        logger.error(f"Error searching cities: {e}")
        return []

# ========== MANUAL PAGESJAUNES UPDATE ==========
@api_router.patch("/businesses/{business_id}/pagesjaunes")
async def update_pagesjaunes_status(
    business_id: str, 
    update: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually update PagesJaunes status for a business
    update: { has_pagesjaunes: bool, pagesjaunes_url: str | null }
    """
    # Find business and verify ownership
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Verify user owns the scan
    scan = await db.scans.find_one({
        "id": business["scan_id"], 
        "user_id": current_user["sub"]
    })
    if not scan:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    has_pj = update.get("has_pagesjaunes", False)
    pj_url = update.get("pagesjaunes_url")
    
    # Recalculate score with manual PJ status
    business_data = {
        "has_google": business.get("has_google", True),
        "has_pagesjaunes": has_pj,
        "has_website": business.get("has_website", False),
        "phone": business.get("phone"),
        "google_reviews_count": business.get("google_reviews_count", 0)
    }
    score, score_reason = calculate_score(business_data)
    
    # Update business
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {
            "has_pagesjaunes": has_pj,
            "pagesjaunes_url": pj_url,
            "pj_manually_set": True,
            "pj_manual_status": has_pj,
            "pj_confidence": "confirmed" if has_pj else "not_found",
            "score": score,
            "score_reason": score_reason
        }}
    )
    
    return {
        "success": True,
        "has_pagesjaunes": has_pj,
        "pagesjaunes_url": pj_url,
        "score": score,
        "score_reason": score_reason,
        "pj_confidence": "confirmed" if has_pj else "not_found"
    }

# ========== MARK BUSINESS AS VIEWED ==========
@api_router.patch("/businesses/{business_id}/viewed")
async def mark_business_viewed(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a business as viewed and track in user_business_status"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    user_id = current_user["sub"]
    google_place_id = business.get("google_place_id")
    
    # Update or create user_business_status
    existing_status = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": business_id
    })
    
    now = datetime.utcnow()
    
    if existing_status:
        await db.user_business_status.update_one(
            {"id": existing_status["id"]},
            {"$set": {
                "is_viewed": True,
                "last_viewed_at": now,
                "view_count": existing_status.get("view_count", 0) + 1,
                "updated_at": now
            }}
        )
    else:
        status_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "business_id": business_id,
            "google_place_id": google_place_id,
            "is_viewed": True,
            "last_viewed_at": now,
            "view_count": 1,
            "contact_status_manual": "not_contacted",
            "client_status": "not_client",
            "created_at": now,
            "updated_at": now
        }
        await db.user_business_status.insert_one(status_data)
    
    return {"success": True}

# ========== UPDATE USER BUSINESS STATUS (Mini-CRM) ==========
@api_router.patch("/businesses/{business_id}/status")
async def update_user_business_status(
    business_id: str,
    update: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Update user-specific status for a business (contact, client, note, interest, crm)
    Also updates SHARED HISTORY visible to all users.
    update: { contact_status_manual?, client_status?, note?, interest_status?, crm_status? }
    """
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id})
    user_email = user.get("email", "unknown") if user else "unknown"
    google_place_id = business.get("google_place_id")
    pl_reference = business.get("pl_reference")
    now = datetime.utcnow()
    
    # Find or create user_business_status
    existing_status = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": business_id
    })
    
    update_fields = {"updated_at": now}
    
    if "contact_status_manual" in update:
        update_fields["contact_status_manual"] = update["contact_status_manual"]
        if update["contact_status_manual"] == "contacted":
            update_fields["contacted_at"] = now
        # Update SHARED history
        if pl_reference:
            await update_shared_status(pl_reference, user_email, "contacted", update["contact_status_manual"] == "contacted")
    
    if "client_status" in update:
        update_fields["client_status"] = update["client_status"]
        if update["client_status"] == "client":
            update_fields["client_since"] = now
        # Update SHARED history
        if pl_reference:
            await update_shared_status(pl_reference, user_email, "client", update["client_status"] == "client")
    
    if "note" in update:
        update_fields["note"] = update["note"]
        update_fields["note_updated_at"] = now
        # Add to SHARED notes
        if pl_reference and update["note"]:
            await add_shared_note(pl_reference, user_email, update["note"])
    
    # Interest status (Non intéressé)
    if "interest_status" in update:
        update_fields["interest_status"] = update["interest_status"]
        update_fields["interest_updated_at"] = now
        # Update SHARED history
        if pl_reference:
            await update_shared_status(pl_reference, user_email, "not_interested", update["interest_status"] == "not_interested")
    
    # CRM status (Déjà présent dans le CRM)
    if "crm_status" in update:
        update_fields["crm_status"] = update["crm_status"]
        update_fields["crm_updated_at"] = now
        # Update SHARED history
        if pl_reference:
            await update_shared_status(pl_reference, user_email, "in_crm", update["crm_status"] == "in_crm")
    
    if existing_status:
        await db.user_business_status.update_one(
            {"id": existing_status["id"]},
            {"$set": update_fields}
        )
    else:
        status_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "business_id": business_id,
            "google_place_id": google_place_id,
            "is_viewed": True,
            "last_viewed_at": now,
            "view_count": 1,
            "contact_status_manual": update.get("contact_status_manual", "not_contacted"),
            "client_status": update.get("client_status", "not_client"),
            "interest_status": update.get("interest_status", "unknown"),
            "crm_status": update.get("crm_status", "not_in_crm"),
            "note": update.get("note"),
            "note_updated_at": now if "note" in update else None,
            "created_at": now,
            "updated_at": now
        }
        await db.user_business_status.insert_one(status_data)
    
    return {"success": True, **update_fields}


@api_router.patch("/businesses/{business_id}/move-to-visite")
async def move_business_to_visite_terrain(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Move a business to visite_terrain category.
    Useful when a phone number is unreachable and requires a physical visit.
    """
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Update the lead_type to visite_terrain
    result = await db.businesses.update_one(
        {"id": business_id},
        {
            "$set": {
                "lead_type": "visite_terrain",
                "phone_unreachable": True,
                "moved_to_visite_at": datetime.utcnow(),
                "moved_to_visite_by": current_user["sub"]
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"📍 Business {business.get('name')} moved to visite_terrain by user {current_user['sub']}")
        return {
            "success": True,
            "message": f"{business.get('name')} déplacé en visite terrain",
            "new_lead_type": "visite_terrain"
        }
    
    return {"success": False, "message": "Aucune modification effectuée"}


# ========== VISITES DE PROSPECTION (IMPORTANT: Must be declared BEFORE /businesses/{business_id}) ==========
@api_router.get("/businesses/visites")
async def get_visites_prospection(
    current_user: dict = Depends(get_current_user),
    visite_type: Optional[str] = Query(None, description="Filter by type: 'pappers' or 'autres'"),
    max_age_years: Optional[int] = Query(1, description="Max company age in years (default: 1 year)")
):
    """Get all businesses marked for field visits with filters.
    
    IMPORTANT: 
    - Seules les entreprises SANS téléphone sont affichées
    - Par défaut, seules les entreprises créées il y a moins d'1 an
    - Priorité aux entreprises avec SIRET vérifié
    
    OPTIMIZED: Uses MongoDB aggregation for efficient date filtering
    """
    user_id = current_user["sub"]
    
    # Get all scan IDs for user (quick query)
    user_scans = await db.scans.find({"user_id": user_id}, {"id": 1, "query_label": 1}).to_list(1000)
    scan_ids = [s["id"] for s in user_scans]
    scan_labels = {s["id"]: s.get("query_label", "") for s in user_scans}
    
    if not scan_ids:
        return {"businesses": [], "total": 0, "pappers_count": 0, "autres_count": 0}
    
    # Calculate cutoff date for age filter
    from datetime import timedelta
    cutoff_date = datetime.utcnow() - timedelta(days=(max_age_years or 1) * 365)
    
    # Build aggregation pipeline for efficient filtering
    pipeline = [
        # Stage 1: Match base criteria
        {
            "$match": {
                "scan_id": {"$in": scan_ids},
                "phone": {"$in": [None, "", "N/A"]},
                "address": {"$nin": [None, ""]},
                "$or": [
                    {"is_inexploitable": {"$ne": True}},
                    {"is_inexploitable": {"$exists": False}}
                ],
                "status": {"$ne": "inexploitable"}
            }
        },
        # Stage 2: Filter by visite_type if specified
        *([{"$match": {"source": "pappers"}}] if visite_type == "pappers" else []),
        *([{"$match": {"source": {"$ne": "pappers"}}}] if visite_type == "autres" else []),
        # Stage 3: Add computed fields
        {
            "$addFields": {
                "visite_type": {"$cond": [{"$eq": ["$source", "pappers"]}, "pappers", "autres"]},
                "has_siret": {"$and": [
                    {"$ne": ["$siret", None]},
                    {"$ne": ["$siret", ""]},
                    {"$ne": ["$siret", "N/A"]}
                ]},
                # Convert string date to Date for comparison
                "date_creation_parsed": {
                    "$cond": {
                        "if": {"$eq": [{"$type": "$date_creation"}, "string"]},
                        "then": {
                            "$dateFromString": {
                                "dateString": "$date_creation",
                                "onError": None,
                                "onNull": None
                            }
                        },
                        "else": "$date_creation"
                    }
                }
            }
        },
        # Stage 4: Filter by age and source
        {
            "$match": {
                "$or": [
                    # Pappers: must have recent date_creation
                    {
                        "source": "pappers",
                        "date_creation_parsed": {"$gte": cutoff_date}
                    },
                    # Others: include if has SIRET or has address
                    {
                        "source": {"$ne": "pappers"},
                        "$or": [
                            {"has_siret": True},
                            {"address": {"$nin": [None, ""]}}
                        ]
                    }
                ]
            }
        },
        # Stage 5: Project only needed fields (optimize transfer)
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "pl_reference": 1,
                "name": 1,
                "address": 1,
                "city": 1,
                "postal_code": 1,
                "phone": 1,
                "email": 1,
                "website_url": 1,
                "siret": 1,
                "siren": 1,
                "source": 1,
                "score": 1,
                "date_creation": 1,
                "scan_id": 1,
                "visite_type": 1,
                "has_siret": 1,
                "facebook_url": 1,
                "linkedin_url": 1,
                "google_rating": 1,
                "google_reviews_count": 1,
                "status": 1,
                "activite_naf": 1,
                "code_naf": 1,
                "libelle_naf": 1
            }
        },
        # Stage 6: Sort by score descending
        {"$sort": {"score": -1}},
        # Stage 7: Limit results
        {"$limit": 500}
    ]
    
    # Execute aggregation
    businesses = await db.businesses.aggregate(pipeline).to_list(500)
    
    # Get user statuses for these businesses (batch query)
    business_ids = [b["id"] for b in businesses]
    
    if business_ids:
        user_statuses = await db.user_business_status.find({
            "user_id": user_id,
            "business_id": {"$in": business_ids}
        }, {"_id": 0}).to_list(500)
        status_lookup = {s["business_id"]: s for s in user_statuses}
    else:
        status_lookup = {}
    
    # Enrich with scan label and user status
    result = []
    for b in businesses:
        b["scan_label"] = scan_labels.get(b.get("scan_id"), "")
        
        # Add flag for businesses without SIRET from non-pappers source
        if not b.get("has_siret") and b.get("source") != "pappers":
            b["needs_siret_check"] = True
        
        # Add user status info
        user_status = status_lookup.get(b["id"], {})
        b["visite_status"] = user_status.get("visite_status", "non_visite")
        b["note"] = user_status.get("note")
        b["contact_status_manual"] = user_status.get("contact_status_manual", "not_contacted")
        
        result.append(b)
    
    # Sort by visite_status (non-visited first) then by score
    status_order = {"non_visite": 0, "a_revisiter": 1, "interesse": 2, "visite": 3, "pas_interesse": 4, "client": 5}
    result.sort(key=lambda x: (status_order.get(x.get("visite_status", "non_visite"), 99), -x.get("score", 0)))
    
    # Return with counts
    pappers_count = len([b for b in result if b.get("visite_type") == "pappers"])
    autres_count = len([b for b in result if b.get("visite_type") == "autres"])
    
    return {
        "businesses": result,
        "total": len(result),
        "pappers_count": pappers_count,
        "autres_count": autres_count
    }

# ========== GET SINGLE BUSINESS BY ID ==========
@api_router.get("/businesses/{business_id}")
async def get_business_by_id(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single business by ID with user status AND shared history"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    business.pop("_id", None)
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id})
    user_email = user.get("email", "unknown") if user else "unknown"
    
    # Generate default data_sources if not present (for backwards compatibility)
    if not business.get("data_sources"):
        source = business.get("source", "google")
        google_place_id = business.get("google_place_id")
        siren = business.get("siren")
        website_url = business.get("website_url")
        
        default_sources = {}
        
        if source == "google" or source == "standard":
            # Google Places source
            google_url = f"https://www.google.com/maps/search/?api=1&query_place_id={google_place_id}" if google_place_id else None
            for field in ["name", "address", "city", "postal_code"]:
                if business.get(field):
                    default_sources[field] = {
                        "source": "google",
                        "source_name": "Google Places",
                        "url": google_url,
                        "icon": "logo-google",
                        "date": business.get("created_at", datetime.utcnow()).isoformat() if isinstance(business.get("created_at"), datetime) else str(business.get("created_at", ""))
                    }
            if business.get("phone"):
                default_sources["phone"] = {
                    "source": "google",
                    "source_name": "Google Places",
                    "url": google_url,
                    "icon": "logo-google",
                    "date": business.get("created_at", datetime.utcnow()).isoformat() if isinstance(business.get("created_at"), datetime) else str(business.get("created_at", ""))
                }
            if business.get("google_rating"):
                default_sources["google_rating"] = {
                    "source": "google",
                    "source_name": "Google Places",
                    "url": google_url,
                    "icon": "logo-google",
                    "date": business.get("created_at", datetime.utcnow()).isoformat() if isinstance(business.get("created_at"), datetime) else str(business.get("created_at", ""))
                }
        
        elif source == "pappers":
            # Pappers source
            pappers_url = f"https://www.pappers.fr/entreprise/{siren}" if siren else "https://www.pappers.fr"
            for field in ["name", "siret", "siren", "date_creation", "activite_naf", "address", "city", "postal_code"]:
                if business.get(field):
                    default_sources[field] = {
                        "source": "pappers",
                        "source_name": "Pappers.fr",
                        "url": pappers_url,
                        "icon": "document-text",
                        "date": business.get("created_at", datetime.utcnow()).isoformat() if isinstance(business.get("created_at"), datetime) else str(business.get("created_at", ""))
                    }
            # Phone source for Pappers - check phone_source field first
            if business.get("phone"):
                phone_source = business.get("phone_source", "")
                if "pappers" in phone_source.lower() or "légales" in phone_source.lower():
                    # Phone from Pappers legal data
                    default_sources["phone"] = {
                        "source": "pappers",
                        "source_name": "Pappers (données légales)",
                        "url": pappers_url,
                        "icon": "document-text",
                        "confidence": business.get("phone_confidence", "basse"),
                        "date": business.get("created_at", datetime.utcnow()).isoformat() if isinstance(business.get("created_at"), datetime) else str(business.get("created_at", ""))
                    }
                else:
                    # Phone from enrichment (Google, web scraping, etc.)
                    default_sources["phone"] = {
                        "source": "enrichment",
                        "source_name": phone_source or "Enrichissement web",
                        "url": website_url,
                        "icon": "sparkles",
                        "confidence": business.get("phone_confidence", "moyenne"),
                        "date": business.get("enriched_at", datetime.utcnow()).isoformat() if isinstance(business.get("enriched_at"), datetime) else str(business.get("enriched_at", ""))
                    }
        
        # Website source
        if website_url:
            default_sources["website_url"] = {
                "source": "web",
                "source_name": "Site web",
                "url": website_url,
                "icon": "globe",
                "date": business.get("created_at", datetime.utcnow()).isoformat() if isinstance(business.get("created_at"), datetime) else str(business.get("created_at", ""))
            }
        
        # Email from enrichment
        if business.get("email"):
            default_sources["email"] = {
                "source": "enrichment",
                "source_name": "Enrichissement web",
                "url": website_url,
                "icon": "sparkles",
                "date": business.get("enriched_at", datetime.utcnow()).isoformat() if isinstance(business.get("enriched_at"), datetime) else str(business.get("enriched_at", ""))
            }
        
        business["data_sources"] = default_sources
    
    # Get user status
    user_status = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": business_id
    })
    
    if user_status:
        user_status.pop("_id", None)
        business.update({
            "is_viewed": user_status.get("is_viewed", False),
            "contact_status_manual": user_status.get("contact_status_manual", "not_contacted"),
            "client_status": user_status.get("client_status", "not_client"),
            "interest_status": user_status.get("interest_status", "unknown"),
            "crm_status": user_status.get("crm_status", "not_in_crm"),
            "note": user_status.get("note"),
            "visite_status": user_status.get("visite_status", "non_visite"),
        })
    
    # Get or create shared history if business has PL reference
    pl_ref = business.get("pl_reference")
    if pl_ref:
        shared_history = await db.shared_business_history.find_one({"pl_reference": pl_ref})
        
        # If no shared history exists, create one automatically
        if not shared_history:
            # Get scan_id from business if available
            scan_id = business.get("scan_id", "manual")
            await get_or_create_shared_history(business_id, pl_ref, user_id, user_email, scan_id)
            shared_history = await db.shared_business_history.find_one({"pl_reference": pl_ref})
        
        if shared_history:
            shared_history.pop("_id", None)
            business["shared_history"] = {
                "first_detected_at": shared_history.get("first_detected_at"),
                "first_detected_by": shared_history.get("first_detected_by_email"),
                "total_views": shared_history.get("total_views", 0),
                "last_viewed_at": shared_history.get("last_viewed_at"),
                "last_viewed_by": shared_history.get("last_viewed_by_email"),
                "detection_count": len(shared_history.get("detection_events", [])),
                "detected_by_users": [e.get("email") for e in shared_history.get("detection_events", [])],
                "is_contacted": shared_history.get("is_contacted", False),
                "contacted_by": shared_history.get("contacted_by_email"),
                "is_client": shared_history.get("is_client", False),
                "marked_client_by": shared_history.get("marked_client_by_email"),
                "is_not_interested": shared_history.get("is_not_interested", False),
                "not_interested_by": shared_history.get("not_interested_by_email"),
                "is_in_crm": shared_history.get("is_in_crm", False),
                "in_crm_by": shared_history.get("in_crm_by_email"),
                "shared_notes": shared_history.get("shared_notes", []),
                "view_events": shared_history.get("view_events", [])[-10:]  # Last 10 views
            }
        
        # Record this view
        await record_view_event(pl_ref, user_id, user_email)
    
    return business

# ========== DELETE SINGLE BUSINESS ==========
@api_router.delete("/businesses/{business_id}")
async def delete_business(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a single business (visite de prospection)"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Verify user owns the scan OR is admin OR scan doesn't exist anymore
    scan = await db.scans.find_one({"id": business.get("scan_id")})
    
    if scan:
        # Scan exists - check ownership
        if scan.get("user_id") != current_user["sub"]:
            # Check if admin
            user = await db.users.find_one({"id": current_user["sub"]})
            if not user or not user.get("is_admin"):
                raise HTTPException(status_code=403, detail="Not authorized to delete this business")
    else:
        # Scan doesn't exist anymore - check if business was created by this user
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

# ========== GET LINKED BUSINESSES (same phone) ==========
@api_router.get("/businesses/{business_id}/linked")
async def get_linked_businesses(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Récupère les fiches liées (même numéro de téléphone)
    Returns: list of linked business summaries
    """
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    linked_ids = business.get("linked_business_ids", [])
    
    if not linked_ids:
        return {"linked_businesses": []}
    
    # Récupérer les fiches liées
    linked_businesses = []
    for linked_id in linked_ids:
        linked = await db.businesses.find_one({"id": linked_id})
        if linked:
            # Récupérer le scan associé pour avoir le contexte
            scan = await db.scans.find_one({"id": linked.get("scan_id")})
            linked_businesses.append({
                "id": linked.get("id"),
                "name": linked.get("name"),
                "phone": linked.get("phone"),
                "city": linked.get("city"),
                "address": linked.get("address"),
                "scan_activity": scan.get("query_label", "N/A") if scan else "N/A",
                "scan_location": scan.get("location_label", "N/A") if scan else "N/A",
                "created_at": linked.get("created_at"),
                "source": linked.get("source", "google"),
                "pl_reference": linked.get("pl_reference"),
            })
    
    return {"linked_businesses": linked_businesses, "count": len(linked_businesses)}

# ========== UPDATE VISITE BUSINESS (phone, notes, status) ==========
@api_router.patch("/businesses/{business_id}/visite")
async def update_visite_business(
    business_id: str,
    update: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a visite terrain business (add phone, notes, status)"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Verify user owns the scan
    scan = await db.scans.find_one({
        "id": business["scan_id"],
        "user_id": current_user["sub"]
    })
    if not scan:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user_id = current_user["sub"]
    now = datetime.utcnow()
    
    # Update business fields if provided (phone mainly)
    business_updates = {}
    if "phone" in update and update["phone"]:
        business_updates["phone"] = update["phone"]
        # If phone is added, change lead_type to standard (no longer needs visit)
        # But keep it in visites page as per user request
    
    if business_updates:
        await db.businesses.update_one(
            {"id": business_id},
            {"$set": business_updates}
        )
    
    # Update user_business_status
    existing_status = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": business_id
    })
    
    status_updates = {"updated_at": now}
    
    if "note" in update:
        status_updates["note"] = update["note"]
        status_updates["note_updated_at"] = now
    
    if "visite_status" in update:
        status_updates["visite_status"] = update["visite_status"]
        if update["visite_status"] == "visite":
            status_updates["visited_at"] = now
    
    if "contact_status_manual" in update:
        status_updates["contact_status_manual"] = update["contact_status_manual"]
        if update["contact_status_manual"] == "contacted":
            status_updates["contacted_at"] = now
    
    if "client_status" in update:
        status_updates["client_status"] = update["client_status"]
        if update["client_status"] == "client":
            status_updates["client_since"] = now
    
    if existing_status:
        await db.user_business_status.update_one(
            {"id": existing_status["id"]},
            {"$set": status_updates}
        )
    else:
        status_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "business_id": business_id,
            "google_place_id": business.get("google_place_id"),
            "is_viewed": True,
            "last_viewed_at": now,
            "view_count": 1,
            "contact_status_manual": update.get("contact_status_manual", "not_contacted"),
            "client_status": update.get("client_status", "not_client"),
            "note": update.get("note"),
            "visite_status": update.get("visite_status", "non_visite"),
            "note_updated_at": now if "note" in update else None,
            "created_at": now,
            "updated_at": now
        }
        await db.user_business_status.insert_one(status_data)
    
    # Return updated business
    updated_business = await db.businesses.find_one({"id": business_id})
    updated_business.pop("_id", None)
    
    # Merge with updated status
    final_status = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": business_id
    })
    if final_status:
        final_status.pop("_id", None)
        updated_business.update({
            "note": final_status.get("note"),
            "visite_status": final_status.get("visite_status", "non_visite"),
            "contact_status_manual": final_status.get("contact_status_manual", "not_contacted"),
            "client_status": final_status.get("client_status", "not_client"),
        })
    
    return {"success": True, "business": updated_business}

# ========== GET BUSINESSES WITH USER STATUS ==========
@api_router.get("/scans/{scan_id}/businesses")
async def get_scan_businesses_with_status(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
    sort_by: str = "score",
    filter_google_no_pj: bool = False,
    filter_weak_google: bool = False,
    filter_has_website: bool = False,
    include_clients: bool = False,  # New filter: exclude clients by default
    include_inexploitable: bool = False  # New filter: exclude inexploitable by default
):
    """Get businesses for a scan with user-specific status"""
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    user_id = current_user["sub"]
    
    # Build base query - Get ALL businesses for this scan (including visite terrain)
    query = {"scan_id": scan_id}
    
    # Exclude inexploitable businesses by default
    if not include_inexploitable:
        query["$or"] = [
            {"is_inexploitable": {"$ne": True}}, 
            {"is_inexploitable": {"$exists": False}}
        ]
    
    # Get all businesses for this scan
    all_businesses = await db.businesses.find(query).to_list(1000)
    
    # Separate into 3 categories:
    # 1. verified = has phone + has SIRET
    # 2. unverified = has phone + no SIRET  
    # 3. visite_terrain = no phone (need field visit to get contact info)
    verified_businesses = []
    unverified_businesses = []
    visite_terrain_businesses = []
    
    for b in all_businesses:
        has_phone = b.get("phone") and b.get("phone") not in [None, "", "N/A"]
        has_siret = b.get("siret") and b.get("siret") not in [None, "", "N/A"]
        
        if not has_phone:
            # No phone = visite terrain (need to go on-site)
            visite_terrain_businesses.append(b)
        elif has_siret:
            # Phone + SIRET = verified
            verified_businesses.append(b)
        else:
            # Phone but no SIRET = unverified
            unverified_businesses.append(b)
    
    # Clean _id from all businesses lists
    for b in verified_businesses:
        b.pop("_id", None)
    for b in unverified_businesses:
        b.pop("_id", None)
    for b in visite_terrain_businesses:
        b.pop("_id", None)
    
    # Get user statuses for ALL businesses (verified + unverified + visite_terrain)
    all_business_ids = [b["id"] for b in verified_businesses] + [b["id"] for b in unverified_businesses] + [b["id"] for b in visite_terrain_businesses]
    user_statuses = await db.user_business_status.find({
        "user_id": user_id,
        "business_id": {"$in": all_business_ids}
    }).to_list(2000)
    
    # Clean _id from statuses
    for s in user_statuses:
        s.pop("_id", None)
    
    # Create status lookup by business_id
    status_lookup = {s["business_id"]: s for s in user_statuses}
    
    # Helper function to process businesses list with user status
    def process_business_list(businesses_list):
        result = []
        for b in businesses_list:
            user_status = status_lookup.get(b["id"], {})
            
            # Check if client and should be excluded
            client_status = user_status.get("client_status", "not_client")
            if client_status == "client" and not include_clients:
                continue
            
            # Apply filters
            if filter_google_no_pj and b.get("has_pagesjaunes", False):
                continue
            if filter_weak_google:
                rating = b.get("google_rating", 0) or 0
                reviews = b.get("google_reviews_count", 0) or 0
                if rating >= 4.0 and reviews >= 10:
                    continue
            if filter_has_website and not b.get("has_website", False):
                continue
            
            # Clean the business dict to remove _id
            clean_business = {k: v for k, v in b.items() if k != "_id"}
            
            business_data = {
                **clean_business,
                # User status fields
                "is_viewed": user_status.get("is_viewed", False),
                "last_viewed_at": user_status.get("last_viewed_at"),
                "view_count": user_status.get("view_count", 0),
                "contact_status_manual": user_status.get("contact_status_manual", "not_contacted"),
                "contacted_at": user_status.get("contacted_at"),
                "client_status": user_status.get("client_status", "not_client"),
                "client_since": user_status.get("client_since"),
                "interest_status": user_status.get("interest_status", "unknown"),
                "crm_status": user_status.get("crm_status", "not_in_crm"),
                "note": user_status.get("note"),
            }
            
            # Reduce score for "Non intéressé" or "Déjà dans CRM"
            original_score = business_data.get("score", 0)
            interest_status = user_status.get("interest_status", "unknown")
            crm_status = user_status.get("crm_status", "not_in_crm")
            
            if interest_status == "not_interested":
                business_data["score"] = max(0, original_score - 50)  # -50 points
                business_data["score_penalty"] = "non_interesse"
            elif crm_status == "in_crm":
                business_data["score"] = max(0, original_score - 30)  # -30 points
                business_data["score_penalty"] = "deja_crm"
            
            result.append(business_data)
        return result
    
    # Process both lists
    verified_result = process_business_list(verified_businesses)
    unverified_result = process_business_list(unverified_businesses)
    visite_terrain_result = process_business_list(visite_terrain_businesses)
    
    # Sort all lists
    def sort_list(lst):
        if sort_by == "score":
            lst.sort(key=lambda x: (-x.get("score", 0), x.get("name", "")))
        elif sort_by == "name":
            lst.sort(key=lambda x: x.get("name", ""))
        elif sort_by == "rating":
            lst.sort(key=lambda x: -(x.get("google_rating", 0) or 0))
        elif sort_by == "new":
            lst.sort(key=lambda x: (not x.get("is_new_in_scan", False), -x.get("score", 0)))
        return lst
    
    verified_result = sort_list(verified_result)
    unverified_result = sort_list(unverified_result)
    visite_terrain_result = sort_list(visite_terrain_result)
    
    # Combined list for backward compatibility (verified businesses = main list)
    combined_result = verified_result
    
    # Count stats (on all lists)
    total_all = len(verified_result) + len(unverified_result) + len(visite_terrain_result)
    no_pj = sum(1 for b in verified_result + unverified_result if not b.get("has_pagesjaunes", False))
    weak_google = sum(1 for b in verified_result + unverified_result if (b.get("google_rating", 0) or 0) < 4 or (b.get("google_reviews_count", 0) or 0) < 10)
    new_count = sum(1 for b in verified_result + unverified_result + visite_terrain_result if b.get("is_new_in_scan", False))
    viewed_count = sum(1 for b in verified_result if b.get("is_viewed", False))
    contacted_count = sum(1 for b in verified_result if b.get("contact_status_manual") == "contacted")
    
    return {
        "businesses": combined_result,  # Backward compatibility: verified only
        "verified_businesses": verified_result,  # Verified (with SIRET + phone)
        "unverified_businesses": unverified_result,  # Unverified (phone but no SIRET)
        "visite_terrain_businesses": visite_terrain_result,  # No phone - need field visit
        "stats": {
            "total": total_all,  # Total of ALL businesses
            "total_verified": len(verified_result),
            "total_unverified": len(unverified_result),
            "total_visite_terrain": len(visite_terrain_result),
            "no_pagesjaunes": no_pj,
            "weak_google": weak_google,
            "new_in_scan": new_count,
            "viewed": viewed_count,
            "contacted": contacted_count
        }
    }

# ========== FAVORITE SCANS ==========
@api_router.get("/scans/favorites")
async def get_favorite_scans(current_user: dict = Depends(get_current_user)):
    """Get favorite scans for the user"""
    scans = await db.scans.find({
        "user_id": current_user["sub"],
        "is_favorite": True
    }).sort("created_at", -1).to_list(100)
    
    # Convert ObjectId to string
    for scan in scans:
        scan.pop("_id", None)
    
    return scans

@api_router.patch("/scans/{scan_id}/favorite")
async def toggle_scan_favorite(
    scan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Toggle favorite status for a scan"""
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    new_favorite = not scan.get("is_favorite", False)
    
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {"is_favorite": new_favorite}}
    )
    
    return {"success": True, "is_favorite": new_favorite}

# ========== RE-SCAN WITH NEW BUSINESS DETECTION ==========
@api_router.post("/scans/{scan_id}/rescan")
async def rescan_favorite(
    scan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Re-run a scan and detect new businesses.
    Compares with previous results and marks new ones.
    Creates notification if new businesses found.
    """
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Get current business google_place_ids for comparison
    current_businesses = await db.businesses.find({"scan_id": scan_id}).to_list(1000)
    previous_place_ids = set(b.get("google_place_id") for b in current_businesses if b.get("google_place_id"))
    previous_business_ids = [b["id"] for b in current_businesses]
    
    # Update scan with previous IDs
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {"previous_business_ids": previous_business_ids}}
    )
    
    # Get activity label
    activity = await db.activities.find_one({"id": scan.get("activity_id")})
    query_label = activity["label"] if activity else scan.get("query_label", "")
    
    # Run new scan
    google_api_key = os.environ.get("GOOGLE_API_KEY", "")
    lat, lng = await geocode_location(scan["location_label"], google_api_key)
    places = await search_google_places(query_label, lat, lng, scan.get("radius_km", 10) * 1000, google_api_key)
    
    # Process results and detect new businesses
    new_businesses = []
    new_business_ids = []
    
    for place in places:
        place_id = place.get("place_id")
        is_new = place_id not in previous_place_ids if place_id else True
        
        # Get details and process business
        name = place.get("name", "")
        address = place.get("vicinity", "")
        # Extract city from address
        address_parts = address.split(",") if address else []
        city = address_parts[-1].strip() if address_parts else scan["location_label"]
        postal_code = ""
        
        lat_b = place.get("geometry", {}).get("location", {}).get("lat")
        lng_b = place.get("geometry", {}).get("location", {}).get("lng")
        
        # Get additional details
        details = await get_place_details(place_id, google_api_key) if place_id else None
        phone = details.get("formatted_phone_number", "") if details else ""
        website = details.get("website", "") if details else ""
        reviews = details.get("user_ratings_total", 0) if details else 0
        rating = details.get("rating", place.get("rating", 0)) if details else place.get("rating", 0)
        
        # Check website
        has_website = await check_website(website) if website else False
        
        # Check PagesJaunes via Serper
        has_pj, pj_url, confidence, pj_status, sirene_data = await detect_pagesjaunes_presence(name, phone, city, postal_code)
        
        # Get SIRET
        siret = sirene_data.get("siret") if sirene_data else None
        siren = sirene_data.get("siren") if sirene_data else None
        
        # Calculate score
        business_data = {
            "has_google": True,
            "has_pagesjaunes": has_pj,
            "has_website": has_website,
            "phone": phone,
            "google_reviews_count": reviews
        }
        score, score_reason = calculate_score(business_data)
        
        business_id = str(uuid.uuid4())
        business_doc = {
            "id": business_id,
            "scan_id": scan_id,
            "name": name,
            "address": address,
            "city": city,
            "postal_code": postal_code,
            "phone": phone,
            "website_url": website,
            "google_place_id": place_id,
            "google_rating": rating,
            "google_reviews_count": reviews,
            "has_google": True,
            "has_pagesjaunes": has_pj,
            "pagesjaunes_url": pj_url,
            "pj_confidence": pj_status,
            "has_website": has_website,
            "score": score,
            "score_reason": score_reason,
            "latitude": lat_b,
            "longitude": lng_b,
            "siret": siret,
            "siren": siren,
            "is_new_in_scan": is_new,
            "first_detected_at": datetime.utcnow() if is_new else None,
            "last_detected_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
            "source_detection": "GOOGLE",
            "contact_status": "DIRECT" if phone else ("INDIRECT" if website else "MANUAL_REQUIRED")
        }
        
        # Check if this business already exists (by google_place_id)
        existing = await db.businesses.find_one({
            "scan_id": scan_id,
            "google_place_id": place_id
        }) if place_id else None
        
        if existing:
            # Update existing business
            await db.businesses.update_one(
                {"id": existing["id"]},
                {"$set": {
                    **business_doc,
                    "id": existing["id"],
                    "is_new_in_scan": is_new,
                    "first_detected_at": existing.get("first_detected_at") or datetime.utcnow()
                }}
            )
        else:
            # Insert new business
            await db.businesses.insert_one(business_doc)
            if is_new:
                new_businesses.append(business_doc)
                new_business_ids.append(business_id)
    
    # Update scan stats
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {
            "last_scanned_at": datetime.utcnow(),
            "total_results": len(places),
            "new_businesses_count": len(new_businesses)
        }}
    )
    
    # Create notification if new businesses found
    if new_businesses:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["sub"],
            "type": "new_businesses",
            "title": f"🆕 {len(new_businesses)} nouveaux établissements",
            "message": f"Nouveau scan '{query_label}' à {scan['location_label']}: {len(new_businesses)} nouveaux établissements détectés !",
            "scan_id": scan_id,
            "new_business_ids": new_business_ids,
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "total_businesses": len(places),
        "new_businesses_count": len(new_businesses),
        "new_business_ids": new_business_ids
    }

# ========== NOTIFICATIONS ==========
@api_router.get("/notifications")
async def get_notifications(
    current_user: dict = Depends(get_current_user),
    unread_only: bool = False
):
    """Get notifications for the user"""
    query = {"user_id": current_user["sub"]}
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(query).sort("created_at", -1).to_list(50)
    
    # Clean up for response
    for n in notifications:
        n.pop("_id", None)
    
    unread_count = await db.notifications.count_documents({
        "user_id": current_user["sub"],
        "is_read": False
    })
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }

@api_router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["sub"]},
        {"$set": {"is_read": True}}
    )
    return {"success": True}

# ========== EXPORT CSV ==========
@api_router.get("/scans/{scan_id}/export-csv")
async def export_scan_to_csv(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
    include_clients: bool = Query(False, description="Include businesses marked as client")
):
    """Export scan results to CSV format"""
    import csv
    from io import StringIO
    
    # Verify scan belongs to user
    scan = await db.scans.find_one({"id": scan_id, "user_id": current_user["sub"]})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan non trouvé")
    
    # Get businesses
    query = {"scan_id": scan_id}
    if not include_clients:
        query["in_crm"] = {"$ne": True}
    
    businesses = await db.businesses.find(query).to_list(2000)
    
    # Create CSV
    output = StringIO()
    writer = csv.writer(output, delimiter=';', quotechar='"', quoting=csv.QUOTE_MINIMAL)
    
    # Header
    writer.writerow([
        "Référence", "Nom", "Adresse", "Code Postal", "Ville",
        "Téléphone", "Email", "Site Web", "SIRET", "SIREN",
        "Score", "Note Google", "Avis Google", "PagesJaunes",
        "Type", "Date Création", "Procédure Collective",
        "Facebook", "LinkedIn", "Instagram"
    ])
    
    # Data rows
    for b in businesses:
        social = b.get("social_links", {}) or {}
        
        writer.writerow([
            b.get("pl_reference", ""),
            b.get("name", ""),
            b.get("address", ""),
            b.get("postal_code", ""),
            b.get("city", ""),
            b.get("phone", ""),
            b.get("email", ""),
            b.get("website", ""),
            b.get("siret", ""),
            b.get("siren", ""),
            b.get("score", ""),
            b.get("rating", ""),
            b.get("reviews", ""),
            "Oui" if b.get("has_pagesjaunes") else "Non",
            b.get("lead_type", "standard"),
            b.get("date_creation", ""),
            "Oui" if b.get("has_procedure_collective") else "Non",
            social.get("facebook", ""),
            social.get("linkedin", ""),
            social.get("instagram", "")
        ])
    
    # Return CSV response
    csv_content = output.getvalue()
    
    # Generate filename
    query_label = scan.get("query_label", "scan")
    location = scan.get("location_label", "")
    filename = f"export_{query_label}_{location}_{datetime.now().strftime('%Y%m%d')}.csv"
    filename = filename.replace(" ", "_").replace("/", "-")
    
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

@api_router.get("/businesses/visites/export-csv")
async def export_visites_to_csv(
    current_user: dict = Depends(get_current_user),
    visite_type: Optional[str] = Query(None, description="Filter: pappers or autres"),
    max_age_years: Optional[int] = Query(None, description="Max age: 1 or 2")
):
    """Export visites terrain to CSV format"""
    import csv
    from io import StringIO
    
    # Get visites using the same logic as the visites endpoint
    user_id = current_user["sub"]
    user_scans = await db.scans.find({"user_id": user_id}).to_list(1000)
    scan_ids = [s["id"] for s in user_scans]
    
    # Build query based on visite_type
    if visite_type == "pappers":
        query = {
            "scan_id": {"$in": scan_ids},
            "source": "pappers",
            "$or": [
                {"phone": {"$in": [None, ""]}},
                {"lead_type": "visite_terrain"}
            ]
        }
    elif visite_type == "autres":
        query = {
            "scan_id": {"$in": scan_ids},
            "source": {"$ne": "pappers"},
            "$or": [
                {"lead_type": "visite_terrain"},
                {"phone": {"$in": [None, ""]}, "address": {"$ne": None}}
            ]
        }
    else:
        query = {
            "scan_id": {"$in": scan_ids},
            "$or": [
                {"source": "pappers", "phone": {"$in": [None, ""]}},
                {"source": "pappers", "lead_type": "visite_terrain"},
                {"lead_type": "visite_terrain"},
                {"phone": {"$in": [None, ""]}, "address": {"$ne": None}}
            ]
        }
    
    businesses = await db.businesses.find(query).to_list(1000)
    
    # Filter by age if specified
    if max_age_years and max_age_years in [1, 2]:
        from datetime import timedelta
        cutoff_date = datetime.utcnow() - timedelta(days=max_age_years * 365)
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
                            date_creation = None
                if date_creation and date_creation >= cutoff_date:
                    filtered.append(b)
            elif visite_type != "pappers":
                filtered.append(b)
        businesses = filtered
    
    # Create CSV
    output = StringIO()
    writer = csv.writer(output, delimiter=';', quotechar='"', quoting=csv.QUOTE_MINIMAL)
    
    # Header
    writer.writerow([
        "Référence", "Nom", "Adresse", "Code Postal", "Ville",
        "SIRET", "SIREN", "Type", "Source", "Date Création",
        "Score", "Procédure Collective", "Scan"
    ])
    
    # Data
    scan_labels = {s["id"]: s.get("query_label", "") for s in user_scans}
    
    for b in businesses:
        writer.writerow([
            b.get("pl_reference", ""),
            b.get("name", ""),
            b.get("address", ""),
            b.get("postal_code", ""),
            b.get("city", ""),
            b.get("siret", ""),
            b.get("siren", ""),
            b.get("lead_type", "visite_terrain"),
            b.get("source", ""),
            b.get("date_creation", ""),
            b.get("score", ""),
            "Oui" if b.get("has_procedure_collective") else "Non",
            scan_labels.get(b.get("scan_id"), "")
        ])
    
    csv_content = output.getvalue()
    filename = f"visites_terrain_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

@api_router.patch("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": current_user["sub"]},
        {"$set": {"is_read": True}}
    )
    return {"success": True}

# ========== RE-SCAN GLOBAL ==========

@api_router.post("/scans/rescan-all")
async def rescan_all_scans(current_user: dict = Depends(get_current_user)):
    """
    Re-scan ONLY FAVORITE scans and detect new businesses.
    Compares with previous results and generates notifications with direct links.
    """
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id})
    user_email = user.get("email", "unknown") if user else "unknown"
    
    # Get only FAVORITE scans for this user
    scans = await db.scans.find({
        "user_id": user_id,
        "is_favorite": True
    }).to_list(1000)
    
    if not scans:
        return {
            "success": True,
            "message": "Aucun scan favori à relancer. Mettez des scans en favoris d'abord.",
            "total_scans": 0,
            "new_businesses_total": 0
        }
    
    # Get user's API keys
    user_keys = await fetch_user_api_keys(user_id)
    google_api_key = user_keys["google_api_key"]
    serper_api_key = user_keys["serper_api_key"]
    
    total_new_businesses = 0
    scans_processed = 0
    all_new_business_ids = []
    all_new_businesses_info = []  # Store name + scan info for notification
    scan_results = []
    
    for scan in scans:
        scan_id = scan["id"]
        query_label = scan.get("query_label", "")
        location_label = scan.get("location_label", "")
        radius_km = scan.get("radius_km", 10)
        
        logger.info(f"🔄 Re-scanning FAVORITE: {query_label} at {location_label}")
        
        try:
            # Get existing business identifiers (phone numbers + google_place_ids)
            existing_businesses = await db.businesses.find({"scan_id": scan_id}).to_list(1000)
            existing_phones = set()
            existing_place_ids = set()
            existing_names_cities = set()
            
            for b in existing_businesses:
                if b.get("phone"):
                    existing_phones.add(normalize_phone(b["phone"]))
                if b.get("google_place_id"):
                    existing_place_ids.add(b["google_place_id"])
                if b.get("name") and b.get("city"):
                    existing_names_cities.add(f"{b['name'].lower()}|{b['city'].lower()}")
            
            # Geocode location
            lat, lng = await geocode_location(location_label, google_api_key)
            
            # Search Google Places again
            query = f"{query_label} {location_label}"
            places = await search_google_places(
                query, lat, lng, radius_km, google_api_key, max_results=60
            )
            
            new_businesses_in_scan = []
            new_business_ids_in_scan = []
            
            for place in places:
                place_id = place.get("place_id")
                phone = place.get("formatted_phone_number", "")
                name = place.get("name", "")
                address = place.get("formatted_address", "")
                
                # Extract city
                address_parts = address.split(",") if address else []
                city = address_parts[-2].strip() if len(address_parts) > 1 else ""
                
                # Check if this is a new business
                is_new = True
                
                if place_id and place_id in existing_place_ids:
                    is_new = False
                elif phone and normalize_phone(phone) in existing_phones:
                    is_new = False
                elif name and city and f"{name.lower()}|{city.lower()}" in existing_names_cities:
                    is_new = False
                
                if is_new and name:
                    # Get place details
                    website = place.get("website", "")
                    rating = place.get("rating", 0)
                    reviews = place.get("user_ratings_total", 0)
                    
                    # Check PagesJaunes
                    has_pj, pj_url, confidence, pj_status, sirene_data = await detect_pagesjaunes_presence(
                        name, phone, city, "", serper_api_key
                    )
                    
                    # Extract SIRET/SIREN and date creation
                    siret = sirene_data.get("siret") if sirene_data else None
                    siren = sirene_data.get("siren") if sirene_data else None
                    date_creation = sirene_data.get("date_creation") if sirene_data else None
                    
                    # Generate Pappers URL if we have SIREN
                    pappers_url = f"https://www.pappers.fr/entreprise/{siren}" if siren else None
                    
                    # Check if company was created less than 1 year ago
                    is_recent_creation = False
                    if date_creation:
                        try:
                            from datetime import timedelta
                            creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                            one_year_ago = datetime.utcnow() - timedelta(days=365)
                            is_recent_creation = creation_date >= one_year_ago
                        except:
                            pass
                    
                    # Determine lead type
                    lead_type = "standard"
                    if is_recent_creation and not phone:
                        lead_type = "visite_terrain"
                    elif is_recent_creation and phone:
                        lead_type = "prospect_prioritaire"
                    
                    # Calculate score
                    business_data = {
                        "has_google": True,
                        "has_pagesjaunes": has_pj,
                        "has_website": bool(website),
                        "google_reviews_count": reviews
                    }
                    score, score_reason = calculate_score(business_data)
                    
                    # Bonus for recent creation
                    if is_recent_creation:
                        score += 15
                        score_reason += f" | 🆕 Création récente (+15)"
                    
                    # Generate PL reference
                    pl_ref = await generate_pl_reference()
                    
                    # Create business record
                    business = Business(
                        scan_id=scan_id,
                        name=name,
                        address=address,
                        city=city,
                        phone=phone,
                        website_url=website,
                        google_place_id=place_id,
                        google_rating=rating,
                        google_reviews_count=reviews,
                        pagesjaunes_url=pj_url,
                        match_confidence=confidence,
                        has_google=True,
                        has_pagesjaunes=has_pj,
                        has_website=bool(website),
                        score=min(score, 100),
                        score_reason=score_reason,
                        latitude=place.get("geometry", {}).get("location", {}).get("lat"),
                        longitude=place.get("geometry", {}).get("location", {}).get("lng"),
                        siret=siret,
                        siren=siren,
                        pj_confidence=pj_status,
                        is_new_in_scan=True,
                        pl_reference=pl_ref,
                        first_detected_at=datetime.utcnow(),
                        first_detected_by=user_id,
                        pappers_url=pappers_url,
                        lead_type=lead_type,
                        date_creation=date_creation,
                        source="google"
                    )
                    
                    await db.businesses.insert_one(business.dict())
                    
                    # Create shared history
                    await get_or_create_shared_history(business.id, pl_ref, user_id, user_email, scan_id)
                    
                    new_businesses_in_scan.append(business)
                    new_business_ids_in_scan.append(business.id)
                    all_new_businesses_info.append({
                        "id": business.id,
                        "name": name,
                        "city": city,
                        "pl_reference": pl_ref,
                        "scan_query": query_label,
                        "scan_location": location_label,
                        "lead_type": lead_type
                    })
                    
                    logger.info(f"  🆕 NEW: {name} ({pl_ref}) - Score: {score} - Type: {lead_type}")
            
            # Update scan stats
            await db.scans.update_one(
                {"id": scan_id},
                {"$set": {
                    "last_scanned_at": datetime.utcnow(),
                    "new_businesses_count": len(new_businesses_in_scan)
                }}
            )
            
            total_new_businesses += len(new_businesses_in_scan)
            all_new_business_ids.extend(new_business_ids_in_scan)
            scans_processed += 1
            
            scan_results.append({
                "scan_id": scan_id,
                "query_label": query_label,
                "location_label": location_label,
                "new_count": len(new_businesses_in_scan)
            })
            
            logger.info(f"  ✅ {len(new_businesses_in_scan)} new businesses found")
            
        except Exception as e:
            logger.error(f"Error re-scanning {scan_id}: {e}")
            continue
    
    # Count visite terrain leads
    visite_terrain_leads = [b for b in all_new_businesses_info if b.get("lead_type") == "visite_terrain"]
    
    # Create summary notification with LINKS to new businesses
    if total_new_businesses > 0:
        # Build message with business names
        business_names = [b["name"] for b in all_new_businesses_info[:5]]
        names_preview = ", ".join(business_names)
        if len(all_new_businesses_info) > 5:
            names_preview += f" (+{len(all_new_businesses_info) - 5} autres)"
        
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "rescan_new",
            "title": f"🎯 {total_new_businesses} nouveaux établissements détectés !",
            "message": f"{names_preview}",
            "scan_id": None,
            "new_business_ids": all_new_business_ids[:50],  # Limit to 50 IDs
            "data": {"new_businesses_info": all_new_businesses_info[:20]},  # Info for direct links
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(notification)
    
    # Create additional notification for visite terrain if any
    if len(visite_terrain_leads) > 0:
        visite_names = ", ".join([b["name"] for b in visite_terrain_leads[:3]])
        if len(visite_terrain_leads) > 3:
            visite_names += f" (+{len(visite_terrain_leads) - 3} autres)"
        
        visite_notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "visite_terrain",
            "title": f"🚗 {len(visite_terrain_leads)} visite(s) de prospection détectée(s)",
            "message": f"Entreprises récentes sans téléphone: {visite_names}. Rendez-vous sur place !",
            "data": {"businesses": visite_terrain_leads[:10]},
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(visite_notification)
        logger.info(f"📬 Notification visite terrain: {len(visite_terrain_leads)} leads")
    
    logger.info(f"🎉 Re-scan favoris complete: {total_new_businesses} new businesses across {scans_processed} scans")
    
    return {
        "success": True,
        "message": f"Re-scan terminé: {total_new_businesses} nouveaux établissements détectés",
        "total_scans": scans_processed,
        "new_businesses_total": total_new_businesses,
        "visite_terrain_count": len(visite_terrain_leads),
        "scan_results": scan_results,
        "new_businesses": all_new_businesses_info[:20]  # Return info for immediate display
    }

# ========== PAPPERS MASS SCAN ENDPOINT ==========

# Domain to NAF codes mapping - AVEC LETTRES pour Pappers
# Codes NAF prioritaires par domaine (les plus pertinents en premier)
# Optimisé pour réduire la consommation de crédits Pappers
DOMAIN_NAF_CODES = {
    "HABITAT": ["43.22A", "43.22B", "43.21A", "43.11Z", "43.12A", "43.31Z", "43.32A", "43.33Z", "43.34Z", "43.91A"],  # Top 10 BTP
    "COMMERCE": ["47.11A", "47.11B", "47.21Z", "47.73Z", "47.75Z", "47.76Z", "47.77Z"],  # Commerce de détail prioritaire
    "RESTAURATION": ["56.10A", "56.10B", "56.10C", "56.21Z", "56.30Z"],  # Restaurants principaux
    "BEAUTE": ["96.02A", "96.02B", "96.04Z", "96.09Z"],  # Tous (peu de codes)
    "AUTO": ["45.20A", "45.20B", "45.32Z", "45.40Z"],  # Garage/réparation auto
    "SANTE": ["86.21Z", "86.22A", "86.22B", "86.23Z", "86.90A", "86.90D"],  # Médecins/dentistes/kiné
    "B2B": ["69.10Z", "69.20Z", "70.22Z", "71.11Z", "73.11Z", "74.10Z"],  # Conseil/archi/pub
    "AUTRE": ["96.01A", "96.01B", "95.23Z", "74.20Z"],  # Services divers
}

from pydantic import BaseModel as PydanticBaseModel

class CityData(PydanticBaseModel):
    name: str
    code: str = ""
    postal_codes: List[str] = []

class PappersScanRequest(PydanticBaseModel):
    domains: List[str]
    cities: List[CityData]
    search_mode: str = "radius"  # "radius" or "multi"
    radius_km: int = 20
    max_age_days: int = 365  # Filtre date de création (par défaut 1 an)
    naf_codes: List[str] = []  # Codes NAF spécifiques pour le mode "Par activité"

@api_router.post("/pappers-scan")
async def pappers_mass_scan(
    request: PappersScanRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Mass scan Pappers for new businesses in selected domains
    Filtrable par date de création (7j, 30j, 6 mois, 12 mois, 24 mois)
    """
    user_id = current_user["sub"]
    
    # Check user has API keys
    user = await db.users.find_one({"id": user_id})
    is_admin = user.get("role") == "admin" if user else False
    
    if not is_admin:
        user_pappers_key = user.get("pappers_api_key") if user else None
        user_serper_key = user.get("serper_api_key") if user else None
        
        if not user_pappers_key:
            raise HTTPException(
                status_code=403,
                detail="Vous devez configurer votre clé API Pappers pour utiliser cette fonctionnalité."
            )
    
    # Get API keys
    user_keys = await fetch_user_api_keys(user_id)
    pappers_api_key = user_keys["pappers_api_key"]
    serper_api_key = user_keys["serper_api_key"]
    google_api_key = user_keys.get("google_api_key", "")
    
    if not pappers_api_key:
        raise HTTPException(status_code=400, detail="Clé API Pappers non configurée")
    
    # Collect NAF codes: priorité aux codes spécifiques, sinon utiliser les domaines
    if request.naf_codes and len(request.naf_codes) > 0:
        # Mode "Par activité" : utiliser les codes NAF spécifiques
        naf_codes = request.naf_codes
        logger.info(f"📋 Using specific NAF codes: {naf_codes}")
    else:
        # Mode "Par domaine" : récupérer les codes NAF des domaines sélectionnés
        naf_codes = get_naf_codes_for_domains(request.domains)
    
    # Get first city name for logging
    first_city_name = request.cities[0].name if request.cities else "Unknown"
    
    logger.info(f"📋 Starting Pappers mass scan - {len(naf_codes)} NAF codes - Mode: {request.search_mode}")
    
    # Collect postal codes based on search mode using service
    if request.search_mode == "radius" and request.cities:
        first_city = request.cities[0]
        # Clean city name - remove any "+Xkm" suffix if present
        clean_city_name = first_city.name.split('+')[0].strip()
        all_postal_codes, location_label = await get_postal_codes_for_radius(
            city_name=clean_city_name,
            radius_km=request.radius_km,
            get_cities_in_radius_func=get_cities_in_radius
        )
        # Add original postal codes
        all_postal_codes = list(set(all_postal_codes + first_city.postal_codes))[:50]
    else:
        all_postal_codes, location_label = get_postal_codes_for_cities(request.cities)
    
    logger.info(f"📍 Searching in {len(all_postal_codes)} postal codes")
    
    # Create a "scan" record for this mass scan
    scan_id = str(uuid.uuid4())
    
    # Calculate total steps for progress tracking
    total_naf_codes = min(len(naf_codes), 10)
    total_postal_codes = min(len(all_postal_codes), 10)
    total_search_steps = total_naf_codes * total_postal_codes
    
    scan_record = {
        "id": scan_id,
        "user_id": user_id,
        "activity_id": "pappers_mass_scan",
        "query_label": f"Scan Pappers - {', '.join(request.domains[:3])}{'...' if len(request.domains) > 3 else ''}",
        "location_label": location_label,
        "radius_km": request.radius_km if request.search_mode == "radius" else 0,
        "max_age_days": request.max_age_days,
        "domains": request.domains,
        "naf_codes_count": len(naf_codes),
        "search_mode": request.search_mode,
        "status": "processing",
        "created_at": datetime.utcnow(),
        "is_favorite": False,
        "total_results": 0,
        "scan_type": "pappers_mass",
        # Progress tracking
        "progress": 0,
        "progress_message": "Démarrage du scan...",
        "progress_step": 0,
        "progress_total_steps": total_search_steps + 10  # +10 for enrichment phase
    }
    await db.scans.insert_one(scan_record)
    
    # Helper function to update progress
    async def update_scan_progress(step: int, message: str, extra_data: dict = None):
        progress_pct = min(int((step / scan_record["progress_total_steps"]) * 100), 99)
        update_data = {
            "progress": progress_pct,
            "progress_message": message,
            "progress_step": step
        }
        if extra_data:
            update_data.update(extra_data)
        await db.scans.update_one(
            {"id": scan_id},
            {"$set": update_data}
        )
    
    # Calculate date threshold based on max_age_days parameter using service
    date_threshold, date_threshold_iso = calculate_date_threshold(request.max_age_days)
    logger.info(f"📅 Date filter: companies created since {date_threshold} ({request.max_age_days} days)")
    
    total_found = 0
    visite_count = 0
    lead_count = 0
    businesses_created = []
    api_errors = 0  # Compteur d'erreurs API (pour détecter épuisement crédits)
    max_api_errors = 5  # Arrêter si trop d'erreurs consécutives
    current_step = 0  # Progress tracking
    
    # Search Pappers by NAF codes - OPTIMISÉ pour réduire consommation crédits
    # Max 10 codes NAF x 10 codes postaux = 100 requêtes max par scan
    async with httpx.AsyncClient(timeout=60.0) as http_client:
        for naf_idx, naf_code in enumerate(naf_codes[:10]):  # Max 10 codes NAF
            if api_errors >= max_api_errors:
                logger.warning(f"⚠️ Arrêt scan Pappers: {api_errors} erreurs API consécutives (crédits épuisés?)")
                break
                
            for postal_idx, postal_code in enumerate(all_postal_codes[:10]):  # Max 10 codes postaux
                current_step += 1
                
                # Update progress
                await update_scan_progress(
                    current_step, 
                    f"Recherche NAF {naf_code} dans {postal_code}... ({total_found} entreprises trouvées)",
                    {"total_results": total_found}
                )
                
                try:
                    pappers_url = f"https://api.pappers.fr/v2/recherche"
                    pappers_params = {
                        "api_token": pappers_api_key,
                        "code_naf": naf_code,
                        "departement": all_postal_codes[0][:2] if all_postal_codes else "59",  # Use department for broader results
                        "date_creation_min": date_threshold,
                        "par_page": 100,  # More results per page
                        "page": 1
                    }
                    
                    response = await http_client.get(pappers_url, params=pappers_params)
                    
                    # Track API usage for Pappers
                    await track_api_usage(
                        user_id=user_id,
                        api_type="pappers",
                        endpoint="recherche",
                        credits=1,
                        success=(response.status_code == 200),
                        error_msg=f"HTTP {response.status_code}" if response.status_code != 200 else None
                    )
                    
                    # Gestion erreurs API (401 = crédits épuisés, 429 = rate limit)
                    if response.status_code == 401:
                        api_errors += 1
                        logger.warning(f"⚠️ Pappers 401 - Crédits insuffisants ({api_errors}/{max_api_errors})")
                        if api_errors >= max_api_errors:
                            break
                        continue
                    elif response.status_code == 429:
                        api_errors += 1
                        logger.warning(f"⚠️ Pappers 429 - Rate limit ({api_errors}/{max_api_errors})")
                        await asyncio.sleep(2)  # Attendre avant de réessayer
                        continue
                    elif response.status_code != 200:
                        continue
                    
                    # Reset error counter on success
                    api_errors = 0
                    
                    data = response.json()
                    companies = data.get("resultats", [])
                    
                    for company in companies:
                        company_name = company.get("nom_entreprise", "")
                        siren = company.get("siren", "")
                        siret = company.get("siege", {}).get("siret", "")
                        date_creation = company.get("date_creation", "")
                        
                        # Skip if no name or already exists
                        if not company_name:
                            continue
                        
                        # ========== FILTRE STRICT SUR LA DATE DE CRÉATION ==========
                        # Vérifier que l'entreprise a bien été créée après date_threshold
                        if date_creation:
                            try:
                                creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                                threshold_date = datetime.strptime(date_threshold_iso, "%Y-%m-%d")
                                if creation_date < threshold_date:
                                    logger.info(f"⏭️ [Pappers] Ignoré {company_name} - Créé le {date_creation} (avant {date_threshold_iso})")
                                    continue
                            except ValueError:
                                # Si on ne peut pas parser la date, on ignore l'entreprise par précaution
                                logger.warning(f"⚠️ [Pappers] Date invalide pour {company_name}: {date_creation}")
                                continue
                        else:
                            # Pas de date de création = on ignore (on ne peut pas vérifier)
                            logger.info(f"⏭️ [Pappers] Ignoré {company_name} - Pas de date de création")
                            continue
                        
                        # Get the first city name from request for fallback
                        first_city_name = request.cities[0].name if request.cities else "Unknown"
                        
                        existing = await db.businesses.find_one({
                            "$or": [
                                {"siren": siren},
                                {"name": company_name, "city": first_city_name}
                            ]
                        })
                        if existing:
                            continue
                        
                        # Get address info
                        siege = company.get("siege", {})
                        address = siege.get("adresse_ligne_1", "")
                        city = siege.get("ville", first_city_name)
                        cp = siege.get("code_postal", postal_code)
                        
                        # ========== ENRICHISSEMENT INTELLIGENT ==========
                        # Rechercher téléphone, site web, présence Google via APIs
                        enrichment = await enrich_business_data(
                            company_name, city, cp, google_api_key, serper_api_key
                        )
                        
                        phone = enrichment.get("phone", "")
                        website = enrichment.get("website", "")
                        google_rating = enrichment.get("google_rating", 0)
                        google_reviews = enrichment.get("google_reviews_count", 0)
                        has_google = enrichment.get("has_google", False)
                        latitude = enrichment.get("latitude")
                        longitude = enrichment.get("longitude")
                        google_place_id = enrichment.get("google_place_id")
                        enrichment_source = enrichment.get("enrichment_source")
                        
                        # ========== TELEPHONE PAPPERS - VALIDATION ==========
                        # Si pas de téléphone trouvé via Google/Serper, utiliser le téléphone Pappers
                        # ET le valider via une recherche web
                        pappers_phone = company.get("telephone")
                        pappers_phone_validated = False
                        
                        if not phone and pappers_phone:
                            # Normaliser le téléphone Pappers
                            from services.enrichment import normalize_french_phone, validate_pappers_phone
                            normalized_pappers_phone = normalize_french_phone(pappers_phone)
                            
                            if normalized_pappers_phone:
                                # Valider via recherche web (Serper)
                                async with httpx.AsyncClient(timeout=15.0) as validation_client:
                                    validation_result = await validate_pappers_phone(
                                        validation_client,
                                        company_name,
                                        city,
                                        normalized_pappers_phone,
                                        serper_api_key
                                    )
                                
                                phone = normalized_pappers_phone
                                pappers_phone_validated = validation_result.get("is_validated", False)
                                enrichment_source = "Pappers"
                                
                                # Si un numéro alternatif plus fiable est trouvé, l'utiliser
                                alternative = validation_result.get("alternative_phone")
                                if alternative and not pappers_phone_validated:
                                    phone = alternative
                                    enrichment_source = "Google (remplacement Pappers)"
                                    pappers_phone_validated = True  # Le numéro Google est validé
                                    logger.info(f"  📞 Remplacement téléphone Pappers par Google pour {company_name}: {normalized_pappers_phone} → {alternative}")
                        
                        # Get NAF label from Pappers response, or from our mapping
                        naf_label = company.get("libelle_code_naf", "")
                        if not naf_label and naf_code:
                            # Use our local NAF mapping as fallback
                            from services.pappers_scan import get_naf_label
                            naf_label = get_naf_label(naf_code)
                        
                        # Determine phone source and confidence
                        phone_source = None
                        phone_confidence = None
                        if phone:
                            if enrichment_source == "Google" or enrichment_source == "Google (remplacement Pappers)":
                                phone_source = "Google"
                                phone_confidence = "haute"  # Google data is usually reliable
                            elif enrichment_source == "Site web":
                                phone_source = "Site web"
                                phone_confidence = "moyenne"  # Website data may be outdated
                            elif enrichment_source == "Pappers":
                                phone_source = "Pappers"
                                # Use validation result if available
                                if pappers_phone_validated:
                                    phone_confidence = "moyenne"  # Validated via web search
                                    phone_source = "Pappers (validé)"
                                else:
                                    phone_confidence = "basse"  # Not validated, may be outdated
                            elif enrichment_source in ["google_places", "knowledge_graph", "serper_snippet"]:
                                phone_source = "Google"
                                phone_confidence = "haute"
                            else:
                                phone_source = enrichment_source or "Inconnu"
                                phone_confidence = "moyenne"
                        
                        # Determine lead type based on phone presence
                        lead_type = "prospect_prioritaire" if phone else "visite_terrain"
                        
                        # Check PagesJaunes
                        has_pj, pj_url, pj_confidence, pj_status = await check_pagesjaunes_direct(
                            company_name, city, serper_api_key
                        )
                        
                        # Apply rule: PagesJaunes → CRM
                        in_crm = has_pj
                        
                        # Calculate score with enriched data
                        score = 80  # Base score for new businesses
                        score_reason = "🆕 Nouvelle création Pappers"
                        if not has_pj:
                            score += 15
                            score_reason += " | ❌ Absent PagesJaunes (+15)"
                        if phone:
                            score += 10
                            score_reason += f" | 📞 Téléphone ({enrichment_source}) (+10)"
                        if has_google:
                            score += 5
                            score_reason += " | 🌐 Fiche Google (+5)"
                        if siret:
                            score += 10
                            score_reason += " | ✅ SIRET vérifié (+10)"
                        
                        # Generate PL reference
                        pl_ref = await generate_pl_reference()
                        
                        # Create business record
                        pappers_url = f"https://www.pappers.fr/entreprise/{siren}"
                        
                        # Determine source for phone
                        phone_source_type = "pappers" if phone and enrichment_source == "Pappers" else "google" if phone and enrichment_source == "Google" else "web"
                        
                        # Build data_sources - track origin of each field
                        data_sources = generate_data_sources(
                            source_type="pappers",
                            fields={
                                "name": company_name,
                                "siret": siret,
                                "siren": siren,
                                "date_creation": date_creation,
                                "activite_naf": naf_code,
                                "address": address,
                                "city": city,
                                "postal_code": cp,
                            },
                            pappers_siren=siren
                        )
                        
                        # Add phone source separately if from different source
                        if phone:
                            if enrichment_source == "Google":
                                phone_sources = generate_data_sources("google", {"phone": phone}, google_place_id=google_place_id)
                            elif enrichment_source == "Site web":
                                phone_sources = generate_data_sources("web", {"phone": phone}, website_url=website)
                            else:
                                phone_sources = generate_data_sources("pappers", {"phone": phone}, pappers_siren=siren)
                            data_sources = merge_data_sources(data_sources, phone_sources)
                        
                        # Add website source
                        if website:
                            website_sources = generate_data_sources("web", {"website_url": website}, website_url=website)
                            data_sources = merge_data_sources(data_sources, website_sources)
                        
                        # Add Google rating source if from Google
                        if google_rating:
                            google_sources = generate_data_sources("google", {"google_rating": google_rating, "google_reviews_count": google_reviews}, google_place_id=google_place_id)
                            data_sources = merge_data_sources(data_sources, google_sources)
                        
                        business = Business(
                            scan_id=scan_id,
                            name=company_name,
                            address=address,
                            city=city,
                            postal_code=cp,
                            phone=phone,
                            phone_source=phone_source,
                            phone_confidence=phone_confidence,
                            website_url=website,
                            siret=siret,
                            siren=siren,
                            date_creation=date_creation,
                            activite_naf=naf_code,
                            libelle_naf=naf_label,
                            has_google=has_google,
                            has_pagesjaunes=has_pj,
                            has_website=bool(website),
                            pagesjaunes_url=pj_url,
                            match_confidence=pj_confidence,
                            score=min(score, 100),
                            score_reason=score_reason,
                            source="pappers",
                            lead_type=lead_type,
                            pappers_url=pappers_url,
                            pl_reference=pl_ref,
                            first_detected_at=datetime.utcnow(),
                            first_detected_by=user_id,
                            in_crm=in_crm,
                            google_place_id=google_place_id,
                            google_rating=google_rating,
                            google_reviews_count=google_reviews,
                            latitude=latitude,
                            longitude=longitude,
                            data_sources=data_sources
                        )
                        
                        try:
                            business_dict = business.dict()
                            logger.info(f"📝 Inserting: {business_dict.get('name')} | phone: {phone or 'N/A'} | lead_type: {lead_type}")
                            result = await db.businesses.insert_one(business_dict)
                            logger.info(f"✅ Inserted with _id: {result.inserted_id}")
                            businesses_created.append(business)
                            
                            # Link with same phone number
                            if phone:
                                await link_businesses_by_phone(business.id, phone)
                            
                            total_found += 1
                            if lead_type == "visite_terrain":
                                visite_count += 1
                            else:
                                lead_count += 1
                            
                            logger.info(f"🆕 [Pappers Mass] {company_name} - {lead_type} {'📞' if phone else '🚶'}")
                        except Exception as insert_err:
                            logger.error(f"❌ Insert error for {company_name}: {insert_err}")
                        
                except Exception as e:
                    logger.error(f"Error scanning NAF {naf_code} in {postal_code}: {e}")
                    continue
                
                # Small delay to avoid rate limits
                await asyncio.sleep(0.2)
    
    # Update scan record - COMPLETE
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {
            "status": "done",
            "total_results": total_found,
            "visite_terrain_count": visite_count,
            "pappers_count": total_found,
            "progress": 100,
            "progress_message": f"Terminé ! {total_found} entreprises trouvées",
            "progress_step": scan_record["progress_total_steps"]
        }}
    )
    
    # Create notification
    if total_found > 0:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "visite_terrain" if visite_count > 0 else "scan_complete",
            "title": f"📋 Scan Pappers terminé - {total_found} entreprises",
            "message": f"{visite_count} visites de prospection, {lead_count} leads avec téléphone",
            "data": {
                "scan_id": scan_id,
                "visite_count": visite_count,
                "lead_count": lead_count
            },
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(notification)
        
        # Send email notification if user has it enabled
        try:
            user = await db.users.find_one({"id": user_id})
            if user and user.get("email"):
                prefs = await get_user_email_preferences(db, user_id)
                if prefs.get("scan_complete", True):
                    # Get the scan to know the query
                    scan = await db.scans.find_one({"id": scan_id})
                    scan_name = scan.get("query", "Scan Pappers+") if scan else "Scan Pappers+"
                    
                    await send_scan_complete_email(
                        db=db,
                        user_email=user["email"],
                        scan_name=scan_name,
                        scan_type="pappers",
                        total_results=total_found,
                        verified_count=lead_count,
                        with_phone=lead_count,
                        with_email=0,
                        scan_id=scan_id
                    )
                    logger.info(f"📧 Pappers scan complete email sent to {user['email']}")
        except Exception as email_error:
            logger.error(f"Failed to send Pappers scan complete email: {email_error}")
    
    logger.info(f"🎉 Pappers mass scan complete: {total_found} found ({visite_count} visites, {lead_count} leads)")
    
    # Auto-enrich with web data (background task)
    if serper_api_key:
        asyncio.create_task(auto_enrich_scan_with_web(db, scan_id, user_id, serper_api_key))
        logger.info(f"🔄 Auto-enrichment web lancé en arrière-plan pour le scan Pappers {scan_id}")
    
    return {
        "success": True,
        "scan_id": scan_id,
        "total_found": total_found,
        "visite_count": visite_count,
        "lead_count": lead_count,
        "message": f"Scan terminé: {total_found} nouvelles entreprises détectées"
    }


# ========== SCAN TOUT INTERNET ==========

class WebScanRequest(PydanticBaseModel):
    """Request model for web-wide internet scan"""
    query: str  # e.g., "plombier Lille", "restaurant Paris"
    location: str  # City name
    radius_km: int = 20
    max_results: int = 50  # Limit results to control API usage
    include_facebook: bool = True
    include_linkedin: bool = True
    include_websites: bool = True

# NOTE: extract_business_from_serper_result and search_web_for_businesses
# imported from services.web_scraper

@api_router.post("/scans/web")
async def web_scan(
    request: WebScanRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Scan tout Internet - Recherche sur tout le web (Facebook, LinkedIn, sites web)
    pour trouver des entreprises correspondant à la requête.
    """
    user_id = current_user["sub"]
    
    # Get user API keys
    user_keys = await fetch_user_api_keys(user_id)
    serper_api_key = user_keys.get("serper_api_key")
    google_api_key = user_keys.get("google_api_key")
    
    if not serper_api_key:
        raise HTTPException(
            status_code=403,
            detail="Vous devez configurer votre clé API Serper pour utiliser le scan Internet."
        )
    
    logger.info(f"🌐 Starting Web Scan: '{request.query}' in {request.location}")
    
    # Create scan record
    scan_id = str(uuid.uuid4())
    scan_record = {
        "id": scan_id,
        "user_id": user_id,
        "activity_id": "web_scan",
        "query_label": f"Scan Internet - {request.query}",
        "location_label": f"{request.location} +{request.radius_km}km",
        "radius_km": request.radius_km,
        "status": "processing",
        "created_at": datetime.utcnow(),
        "is_favorite": False,
        "total_results": 0,
        "scan_type": "web_scan"
    }
    await db.scans.insert_one(scan_record)
    
    # Search the web for businesses
    web_businesses = await search_web_for_businesses(
        query=request.query,
        location=request.location,
        serper_api_key=serper_api_key,
        max_results=request.max_results,
        include_facebook=request.include_facebook,
        include_linkedin=request.include_linkedin,
        include_websites=request.include_websites
    )
    
    logger.info(f"🔍 Found {len(web_businesses)} potential businesses from web search")
    
    # Process and save businesses
    total_found = 0
    leads_with_phone = 0
    leads_without_phone = 0
    
    for web_biz in web_businesses:
        try:
            # Generate unique ID
            business_id = str(uuid.uuid4())
            
            # Create PL reference
            last_pl = await db.businesses.find_one(
                {"pl_reference": {"$regex": "^PL"}},
                sort=[("pl_reference", -1)]
            )
            if last_pl and last_pl.get("pl_reference"):
                try:
                    last_num = int(last_pl["pl_reference"].replace("PL", ""))
                    pl_reference = f"PL{last_num + 1}"
                except:
                    pl_reference = f"PL{random.randint(10000, 99999)}"
            else:
                pl_reference = "PL10001"
            
            # Build business document
            business_doc = {
                "id": business_id,
                "pl_reference": pl_reference,
                "scan_id": scan_id,
                "name": web_biz["name"],
                "phone": web_biz.get("phone"),
                "email": web_biz.get("email"),
                "address": web_biz.get("address"),
                "city": web_biz.get("city", request.location),
                "postal_code": "",
                "website_url": web_biz.get("website_url"),
                "facebook_url": web_biz.get("facebook_url"),
                "linkedin_url": web_biz.get("linkedin_url"),
                "source": "web_scan",
                "source_type": web_biz.get("source_type", "website"),
                "source_url": web_biz.get("source_url"),
                "raw_snippet": web_biz.get("raw_snippet"),
                "siret": None,  # To be enriched
                "siret_verification_status": None,
                "has_pagesjaunes": False,
                "has_website": bool(web_biz.get("website_url")),
                "google_rating": None,
                "google_reviews_count": None,
                "score": 50,  # Base score for web-found leads
                "status": "active",
                "is_closed": False,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "is_new_in_scan": True
            }
            
            # Adjust score based on available info
            if business_doc["phone"]:
                business_doc["score"] += 30
                leads_with_phone += 1
            else:
                leads_without_phone += 1
                
            if business_doc["email"]:
                business_doc["score"] += 10
            if business_doc.get("facebook_url"):
                business_doc["score"] += 5
            if business_doc.get("linkedin_url"):
                business_doc["score"] += 5
            
            # Save to database
            await db.businesses.insert_one(business_doc)
            total_found += 1
            
        except Exception as e:
            logger.error(f"Error processing web business: {e}")
            continue
    
    # Update scan status
    await db.scans.update_one(
        {"id": scan_id},
        {"$set": {
            "status": "done",
            "total_results": total_found,
            "leads_with_phone": leads_with_phone,
            "leads_without_phone": leads_without_phone
        }}
    )
    
    # Create notification
    if total_found > 0:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "scan_complete",
            "title": f"🌐 Scan Internet terminé - {total_found} entreprises",
            "message": f"{leads_with_phone} avec téléphone, {leads_without_phone} à enrichir",
            "data": {
                "scan_id": scan_id,
                "total": total_found,
                "with_phone": leads_with_phone
            },
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(notification)
        
        # Send email notification if user has it enabled
        try:
            user = await db.users.find_one({"id": user_id})
            if user and user.get("email"):
                prefs = await get_user_email_preferences(db, user_id)
                if prefs.get("scan_complete", True):
                    await send_scan_complete_email(
                        db=db,
                        user_email=user["email"],
                        scan_name=query,
                        scan_type="internet",
                        total_results=total_found,
                        verified_count=leads_with_phone,
                        with_phone=leads_with_phone,
                        with_email=0,  # Web scan doesn't track emails directly
                        scan_id=scan_id
                    )
                    logger.info(f"📧 Scan complete email sent to {user['email']}")
        except Exception as email_error:
            logger.error(f"Failed to send scan complete email: {email_error}")
    
    logger.info(f"🎉 Web scan complete: {total_found} businesses found")
    
    # Auto-enrich with web data (background task) for businesses without phone
    if serper_api_key and leads_without_phone > 0:
        asyncio.create_task(auto_enrich_scan_with_web(db, scan_id, user_id, serper_api_key))
        logger.info(f"🔄 Auto-enrichment web lancé en arrière-plan pour le scan Internet {scan_id}")
    
    return {
        "success": True,
        "scan_id": scan_id,
        "total_found": total_found,
        "leads_with_phone": leads_with_phone,
        "leads_without_phone": leads_without_phone,
        "message": f"Scan Internet terminé: {total_found} entreprises trouvées"
    }


@api_router.post("/scans/{scan_id}/enrich-web")
async def enrich_scan_with_web_data(
    scan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Enrichit un scan existant avec des données du web (Facebook, LinkedIn, etc.)
    Recherche des informations complémentaires pour les entreprises sans téléphone.
    """
    user_id = current_user["sub"]
    
    # Check scan exists and belongs to user
    scan = await db.scans.find_one({"id": scan_id, "user_id": user_id})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan non trouvé")
    
    # Get user API keys
    user_keys = await fetch_user_api_keys(user_id)
    serper_api_key = user_keys.get("serper_api_key")
    
    if not serper_api_key:
        raise HTTPException(
            status_code=403,
            detail="Clé API Serper requise pour l'enrichissement web."
        )
    
    # Get businesses without phone from this scan
    businesses_to_enrich = await db.businesses.find({
        "scan_id": scan_id,
        "$or": [
            {"phone": None},
            {"phone": ""},
            {"phone": "N/A"}
        ],
        "status": {"$ne": "inexploitable"}
    }).to_list(100)  # Limit to 100 to control API usage
    
    logger.info(f"🔍 Enriching {len(businesses_to_enrich)} businesses from scan {scan_id}")
    
    enriched_count = 0
    phones_found = 0
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for business in businesses_to_enrich:
            try:
                name = business.get("name", "")
                city = business.get("city", "")
                
                if not name or not city:
                    continue
                
                # Search for this specific business
                search_query = f"{name} {city} téléphone contact"
                
                response = await client.post(
                    "https://google.serper.dev/search",
                    headers={
                        "X-API-KEY": serper_api_key,
                        "Content-Type": "application/json"
                    },
                    json={
                        "q": search_query,
                        "gl": "fr",
                        "hl": "fr",
                        "num": 5
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Check knowledge graph first
                    kg = data.get("knowledgeGraph", {})
                    phone_found = None
                    email_found = None
                    website_found = None
                    facebook_found = None
                    linkedin_found = None
                    
                    # Extract from knowledge graph
                    if kg:
                        phone_found = kg.get("phone") or kg.get("telephone")
                        website_found = kg.get("website")
                    
                    # Search in organic results
                    for result in data.get("organic", []):
                        snippet = result.get("snippet", "")
                        link = result.get("link", "")
                        
                        # Extract phone
                        if not phone_found:
                            phone_match = re.search(r'(?:(?:\+33|0033|0)[1-9])(?:[\s.-]?\d{2}){4}', snippet)
                            if phone_match:
                                phone_found = re.sub(r'[\s.-]', '', phone_match.group())
                        
                        # Extract email
                        if not email_found:
                            email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', snippet)
                            if email_match:
                                email_found = email_match.group()
                        
                        # Check for Facebook/LinkedIn URLs
                        if "facebook.com" in link and not facebook_found:
                            facebook_found = link
                        if "linkedin.com" in link and not linkedin_found:
                            linkedin_found = link
                    
                    # Update business if we found new info
                    update_fields = {"updated_at": datetime.utcnow()}
                    score_bonus = 0
                    
                    if phone_found and not business.get("phone"):
                        update_fields["phone"] = phone_found
                        score_bonus += 30
                        phones_found += 1
                    
                    if email_found and not business.get("email"):
                        update_fields["email"] = email_found
                        score_bonus += 10
                    
                    if website_found and not business.get("website_url"):
                        update_fields["website_url"] = website_found
                        update_fields["has_website"] = True
                        score_bonus += 5
                    
                    if facebook_found and not business.get("facebook_url"):
                        update_fields["facebook_url"] = facebook_found
                        score_bonus += 5
                    
                    if linkedin_found and not business.get("linkedin_url"):
                        update_fields["linkedin_url"] = linkedin_found
                        score_bonus += 5
                    
                    if score_bonus > 0:
                        update_fields["score"] = business.get("score", 50) + score_bonus
                        update_fields["web_enriched"] = True
                        update_fields["web_enriched_at"] = datetime.utcnow()
                        
                        await db.businesses.update_one(
                            {"id": business["id"]},
                            {"$set": update_fields}
                        )
                        enriched_count += 1
                
                # Rate limiting
                await asyncio.sleep(0.3)
                
            except Exception as e:
                logger.error(f"Error enriching business {business.get('id')}: {e}")
                continue
    
    logger.info(f"✅ Web enrichment complete: {enriched_count} enriched, {phones_found} phones found")
    
    return {
        "success": True,
        "enriched_count": enriched_count,
        "phones_found": phones_found,
        "message": f"Enrichissement terminé: {phones_found} téléphones trouvés sur {enriched_count} entreprises"
    }


@api_router.post("/scans/enrich-all-web")
async def enrich_all_scans_with_web_data(
    current_user: dict = Depends(get_current_user),
    background_tasks: BackgroundTasks = None
):
    """
    Lance l'enrichissement web de TOUS les scans de l'utilisateur.
    Recherche des informations supplémentaires (téléphone, email, réseaux sociaux)
    pour toutes les entreprises sans téléphone.
    """
    user_id = current_user["sub"]
    
    # Get user API keys
    user_keys = await fetch_user_api_keys(user_id)
    serper_api_key = user_keys.get("serper_api_key")
    
    if not serper_api_key:
        raise HTTPException(
            status_code=403,
            detail="Clé API Serper requise pour l'enrichissement web."
        )
    
    # Get all scans for this user
    user_scans = await db.scans.find({"user_id": user_id}).to_list(100)
    
    logger.info(f"🔄 Starting web enrichment for all {len(user_scans)} scans of user {user_id}")
    
    total_enriched = 0
    total_phones = 0
    scans_processed = 0
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for scan in user_scans:
            scan_id = scan["id"]
            
            # Get businesses without phone from this scan
            businesses_to_enrich = await db.businesses.find({
                "scan_id": scan_id,
                "$or": [
                    {"phone": None},
                    {"phone": ""},
                    {"phone": "N/A"}
                ],
                "status": {"$ne": "inexploitable"},
                "web_enriched": {"$ne": True}  # Skip already enriched
            }).to_list(50)  # Limit per scan
            
            if not businesses_to_enrich:
                continue
            
            logger.info(f"📋 Enriching {len(businesses_to_enrich)} businesses from scan {scan.get('query_label', scan_id)}")
            
            for business in businesses_to_enrich:
                try:
                    name = business.get("name", "")
                    city = business.get("city", "")
                    
                    if not name or not city:
                        continue
                    
                    # Search for this specific business
                    search_query = f"{name} {city} téléphone contact"
                    
                    response = await client.post(
                        "https://google.serper.dev/search",
                        headers={
                            "X-API-KEY": serper_api_key,
                            "Content-Type": "application/json"
                        },
                        json={
                            "q": search_query,
                            "gl": "fr",
                            "hl": "fr",
                            "num": 5
                        }
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        # Check knowledge graph first
                        kg = data.get("knowledgeGraph", {})
                        phone_found = None
                        email_found = None
                        website_found = None
                        facebook_found = None
                        linkedin_found = None
                        
                        # Extract from knowledge graph
                        if kg:
                            phone_found = kg.get("phone") or kg.get("telephone")
                            website_found = kg.get("website")
                        
                        # Search in organic results
                        for result in data.get("organic", []):
                            snippet = result.get("snippet", "")
                            link = result.get("link", "")
                            
                            # Extract phone
                            if not phone_found:
                                phone_match = re.search(r'(?:(?:\+33|0033|0)[1-9])(?:[\s.-]?\d{2}){4}', snippet)
                                if phone_match:
                                    phone_found = re.sub(r'[\s.-]', '', phone_match.group())
                            
                            # Extract email
                            if not email_found:
                                email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', snippet)
                                if email_match:
                                    email_found = email_match.group()
                            
                            # Check for Facebook/LinkedIn URLs
                            if "facebook.com" in link and not facebook_found:
                                facebook_found = link
                            if "linkedin.com" in link and not linkedin_found:
                                linkedin_found = link
                        
                        # Update business if we found new info
                        update_fields = {"updated_at": datetime.utcnow(), "web_enriched": True, "web_enriched_at": datetime.utcnow()}
                        score_bonus = 0
                        
                        if phone_found and not business.get("phone"):
                            update_fields["phone"] = phone_found
                            score_bonus += 30
                            total_phones += 1
                        
                        if email_found and not business.get("email"):
                            update_fields["email"] = email_found
                            score_bonus += 10
                        
                        if website_found and not business.get("website_url"):
                            update_fields["website_url"] = website_found
                            update_fields["has_website"] = True
                            score_bonus += 5
                        
                        if facebook_found and not business.get("facebook_url"):
                            update_fields["facebook_url"] = facebook_found
                            score_bonus += 5
                        
                        if linkedin_found and not business.get("linkedin_url"):
                            update_fields["linkedin_url"] = linkedin_found
                            score_bonus += 5
                        
                        if score_bonus > 0:
                            update_fields["score"] = business.get("score", 50) + score_bonus
                        
                        await db.businesses.update_one(
                            {"id": business["id"]},
                            {"$set": update_fields}
                        )
                        total_enriched += 1
                    
                    # Rate limiting
                    await asyncio.sleep(0.3)
                    
                except Exception as e:
                    logger.error(f"Error enriching business {business.get('id')}: {e}")
                    continue
            
            scans_processed += 1
    
    # Create notification
    if total_enriched > 0:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "enrichment_complete",
            "title": f"🌐 Enrichissement web terminé",
            "message": f"{total_phones} téléphones trouvés sur {total_enriched} entreprises ({scans_processed} scans)",
            "data": {
                "enriched": total_enriched,
                "phones": total_phones,
                "scans": scans_processed
            },
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(notification)
    
    logger.info(f"✅ All scans web enrichment complete: {total_enriched} enriched, {total_phones} phones found")
    
    return {
        "success": True,
        "scans_processed": scans_processed,
        "total_enriched": total_enriched,
        "phones_found": total_phones,
        "message": f"Enrichissement terminé: {total_phones} téléphones trouvés sur {total_enriched} entreprises"
    }


# ========== STATISTICS ENDPOINTS ==========

@api_router.get("/stats/dashboard")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """
    Get comprehensive dashboard statistics for the current user.
    """
    user_id = current_user["sub"]
    
    # Get all scans for user
    user_scans = await db.scans.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    scan_ids = [s["id"] for s in user_scans]
    
    if not scan_ids:
        return {
            "total_leads": 0,
            "internet_leads": 0,
            "pappers_leads": 0,
            "leads_with_phone": 0,
            "leads_without_phone": 0,
            "enrichment_rate": 0,
            "web_enriched_count": 0,
            "phones_from_web": 0,
            "visites_terrain_pending": 0,
            "total_scans": 0,
            "internet_scans": 0,
            "pappers_scans": 0,
            "favorite_scans": 0
        }
    
    # Count total leads
    total_leads = await db.businesses.count_documents({"scan_id": {"$in": scan_ids}})
    
    # Count leads with phone
    leads_with_phone = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "phone": {"$nin": [None, "", "N/A"]}
    })
    
    # Count web enriched
    web_enriched_count = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "web_enriched": True
    })
    
    # Count phones found via web enrichment
    phones_from_web = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "web_enriched": True,
        "phone": {"$nin": [None, "", "N/A"]}
    })
    
    # Count visites terrain pending (no phone, not inexploitable)
    visites_terrain = await db.businesses.count_documents({
        "scan_id": {"$in": scan_ids},
        "phone": {"$in": [None, "", "N/A"]},
        "address": {"$nin": [None, ""]},
        "status": {"$ne": "inexploitable"}
    })
    
    # Scan counts by type
    internet_scans = len([s for s in user_scans if s.get("scan_type") in ["web_scan", "internet", None, "standard"] or not s.get("scan_type")])
    pappers_scans = len([s for s in user_scans if s.get("scan_type") in ["pappers", "pappers_mass"]])
    favorite_scans = len([s for s in user_scans if s.get("is_favorite")])
    
    # Get scan IDs by type
    internet_scan_ids = [s["id"] for s in user_scans if s.get("scan_type") not in ["pappers", "pappers_mass"]]
    pappers_scan_ids = [s["id"] for s in user_scans if s.get("scan_type") in ["pappers", "pappers_mass"]]
    
    # Count leads by section
    internet_leads = await db.businesses.count_documents({"scan_id": {"$in": internet_scan_ids}}) if internet_scan_ids else 0
    pappers_leads = await db.businesses.count_documents({"scan_id": {"$in": pappers_scan_ids}}) if pappers_scan_ids else 0
    
    # Calculate enrichment rate
    enrichment_rate = (phones_from_web / web_enriched_count * 100) if web_enriched_count > 0 else 0
    
    return {
        "total_leads": total_leads,
        "internet_leads": internet_leads,
        "pappers_leads": pappers_leads,
        "leads_with_phone": leads_with_phone,
        "leads_without_phone": total_leads - leads_with_phone,
        "enrichment_rate": enrichment_rate,
        "web_enriched_count": web_enriched_count,
        "phones_from_web": phones_from_web,
        "visites_terrain_pending": visites_terrain,
        "total_scans": len(user_scans),
        "internet_scans": internet_scans,
        "pappers_scans": pappers_scans,
        "favorite_scans": favorite_scans
    }


@api_router.get("/stats/trends")
async def get_stats_trends(current_user: dict = Depends(get_current_user)):
    """
    Get trend data for charts - scans and leads by day for the last 30 days.
    """
    user_id = current_user["sub"]
    from datetime import timedelta
    
    # Get date range (last 30 days)
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=30)
    
    # Get all scans for user in the period
    user_scans = await db.scans.find({
        "user_id": user_id,
        "created_at": {"$gte": start_date}
    }, {"_id": 0}).to_list(1000)
    
    scan_ids = [s["id"] for s in user_scans]
    
    # Get all businesses created in the period
    businesses = await db.businesses.find({
        "scan_id": {"$in": scan_ids},
        "created_at": {"$gte": start_date}
    }, {"_id": 0, "created_at": 1, "phone": 1, "scan_id": 1, "siret": 1}).to_list(10000)
    
    # Group by day
    daily_data = {}
    for i in range(31):
        day = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_data[day] = {
            "date": day,
            "scans": 0,
            "leads": 0,
            "with_phone": 0,
            "verified": 0
        }
    
    # Count scans per day
    for scan in user_scans:
        if scan.get("created_at"):
            day = scan["created_at"].strftime("%Y-%m-%d") if isinstance(scan["created_at"], datetime) else scan["created_at"][:10]
            if day in daily_data:
                daily_data[day]["scans"] += 1
    
    # Count businesses per day
    for business in businesses:
        if business.get("created_at"):
            day = business["created_at"].strftime("%Y-%m-%d") if isinstance(business["created_at"], datetime) else business["created_at"][:10]
            if day in daily_data:
                daily_data[day]["leads"] += 1
                if business.get("phone") and business["phone"] not in [None, "", "N/A"]:
                    daily_data[day]["with_phone"] += 1
                if business.get("siret"):
                    daily_data[day]["verified"] += 1
    
    # Sort by date
    trend_data = sorted(daily_data.values(), key=lambda x: x["date"])
    
    # Calculate weekly aggregates
    weekly_data = []
    for i in range(4):
        week_start = end_date - timedelta(days=(i+1)*7)
        week_end = end_date - timedelta(days=i*7)
        week_scans = sum(1 for s in user_scans 
                        if s.get("created_at") and week_start <= s["created_at"] <= week_end)
        week_leads = sum(1 for b in businesses 
                        if b.get("created_at") and week_start <= b["created_at"] <= week_end)
        weekly_data.append({
            "week": f"S-{i}" if i > 0 else "Cette semaine",
            "scans": week_scans,
            "leads": week_leads
        })
    
    return {
        "daily": trend_data[-14:],  # Last 14 days
        "weekly": list(reversed(weekly_data)),
        "summary": {
            "total_scans_30d": len(user_scans),
            "total_leads_30d": len(businesses),
            "avg_leads_per_scan": len(businesses) / len(user_scans) if user_scans else 0
        }
    }


# ========== SCAN PROGRESS TRACKING ==========

# Store active scans progress (in-memory for simplicity)
active_scans_progress = {}

@api_router.get("/scans/active")
async def get_active_scans(current_user: dict = Depends(get_current_user)):
    """
    Get list of currently running scans for this user.
    """
    user_id = current_user["sub"]
    
    # Check for scans with status "processing"
    active = await db.scans.find({
        "user_id": user_id,
        "status": "processing"
    }, {"_id": 0}).to_list(10)
    
    # Add progress info from memory
    for scan in active:
        scan_id = scan.get("id")
        if scan_id in active_scans_progress:
            scan["progress"] = active_scans_progress[scan_id]
    
    return {"active_scans": active, "count": len(active)}


# ========== ADVANCED SEARCH ENDPOINTS ==========

@api_router.get("/search/businesses")
async def search_businesses(
    q: str = Query(..., description="Search query (PL reference or phone number)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Advanced search for businesses by:
    - PL reference (e.g., PL0001, PL0042)
    - Phone number (any format)
    
    Returns all matching businesses accessible by the user.
    """
    user_id = current_user["sub"]
    results = []
    
    # Check if query looks like a PL reference
    if q.upper().startswith("PL"):
        # Search by PL reference
        businesses = await db.businesses.find({
            "pl_reference": {"$regex": f"^{re.escape(q.upper())}$", "$options": "i"}
        }).to_list(100)
        results.extend(businesses)
    else:
        # Assume it's a phone number - normalize and search
        normalized_query = normalize_phone(q)
        
        if normalized_query and len(normalized_query) >= 6:
            # Search all businesses with phones
            all_businesses = await db.businesses.find({
                "phone": {"$exists": True, "$ne": None}
            }).to_list(10000)
            
            for b in all_businesses:
                if normalized_query in normalize_phone(b.get("phone", "")):
                    results.append(b)
    
    # Get user status for each business
    enriched_results = []
    for business in results:
        business.pop("_id", None)
        
        # Get user-specific status
        user_status = await db.user_business_status.find_one({
            "user_id": user_id,
            "business_id": business["id"]
        })
        
        if user_status:
            business["contact_status_manual"] = user_status.get("contact_status_manual", "not_contacted")
            business["client_status"] = user_status.get("client_status", "not_client")
            business["interest_status"] = user_status.get("interest_status", "unknown")
            business["crm_status"] = user_status.get("crm_status", "not_in_crm")
            business["note"] = user_status.get("note")
        
        # Get linked businesses count
        linked_count = len(business.get("linked_business_ids", []))
        business["linked_count"] = linked_count
        
        # Get scan info
        scan = await db.scans.find_one({"id": business["scan_id"]})
        if scan:
            business["scan_query"] = scan.get("query_label", "")
            business["scan_location"] = scan.get("location_label", "")
        
        enriched_results.append(business)
    
    return {
        "query": q,
        "count": len(enriched_results),
        "results": enriched_results
    }

@api_router.get("/businesses/{business_id}/linked")
async def get_linked_businesses(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all businesses linked to this one (same phone number)"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    linked_ids = business.get("linked_business_ids", [])
    if not linked_ids:
        return {"count": 0, "linked_businesses": []}
    
    linked = await db.businesses.find({"id": {"$in": linked_ids}}).to_list(100)
    
    # Clean up
    for b in linked:
        b.pop("_id", None)
        # Get scan info
        scan = await db.scans.find_one({"id": b["scan_id"]})
        if scan:
            b["scan_query"] = scan.get("query_label", "")
            b["scan_location"] = scan.get("location_label", "")
    
    return {
        "count": len(linked),
        "linked_businesses": linked
    }

@api_router.post("/businesses/assign-pl-references")
async def assign_pl_references_to_all(current_user: dict = Depends(get_current_admin)):
    """
    Admin endpoint: Assign PL references to all businesses that don't have one.
    Also runs deduplication.
    """
    # Find businesses without PL reference
    businesses_without_pl = await db.businesses.find({
        "$or": [
            {"pl_reference": {"$exists": False}},
            {"pl_reference": None}
        ]
    }).to_list(100000)
    
    count_assigned = 0
    count_linked = 0
    
    for business in businesses_without_pl:
        # Check if this is a duplicate of an existing business
        existing = await find_existing_business(
            phone=business.get("phone"),
            google_place_id=business.get("google_place_id"),
            name=business.get("name"),
            city=business.get("city")
        )
        
        if existing and existing["id"] != business["id"] and existing.get("pl_reference"):
            # Link to existing business
            await db.businesses.update_one(
                {"id": business["id"]},
                {"$set": {
                    "pl_reference": existing["pl_reference"],
                    "linked_business_ids": [existing["id"]]
                }}
            )
            count_linked += 1
        else:
            # Assign new PL reference
            pl_ref = await generate_pl_reference()
            await db.businesses.update_one(
                {"id": business["id"]},
                {"$set": {"pl_reference": pl_ref}}
            )
            count_assigned += 1
        
        # Run deduplication by phone
        if business.get("phone"):
            linked = await link_duplicate_businesses(business["id"], business["phone"])
            if linked:
                count_linked += len(linked)
    
    return {
        "success": True,
        "assigned": count_assigned,
        "linked": count_linked,
        "total_processed": len(businesses_without_pl)
    }

# ========== SIRET AUTO-ENRICHMENT ENDPOINT ==========
@api_router.post("/businesses/{business_id}/enrich-siret")
async def enrich_business_siret(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Recherche automatiquement le SIRET d'une entreprise et vérifie la cohérence d'activité
    """
    # Get business
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Entreprise non trouvée")
    
    name = business.get("name", "")
    city = business.get("city", "")
    postal_code = business.get("postal_code", "")
    google_types = business.get("types", [])
    
    if not name:
        raise HTTPException(status_code=400, detail="Nom de l'entreprise requis")
    
    logger.info(f"🔍 Recherche SIRET pour: {name} ({city})")
    
    # Search SIRET
    sirene_data = await get_sirene_data(name, city, postal_code)
    
    if not sirene_data:
        return {
            "success": False,
            "message": "Aucun résultat SIRET trouvé",
            "business_id": business_id
        }
    
    # Check activity coherence
    naf_code = sirene_data.get("activite_principale", "")
    naf_label = sirene_data.get("libelle_activite", "")
    coherence = check_activity_coherence(google_types, naf_code, naf_label)
    
    # Update business
    update_data = {
        "siret": sirene_data.get("siret"),
        "siren": sirene_data.get("siren"),
        "nom_sirene": sirene_data.get("nom_complet"),
        "activite_naf": naf_code,
        "libelle_naf": naf_label,
        "siret_match_score": sirene_data.get("match_score", 0),
        "siret_verification_status": coherence["status"],
        "siret_verification_message": coherence["message"],
        "siret_enriched_at": datetime.utcnow(),
        "etat_administratif": sirene_data.get("etat_administratif", "A")
    }
    
    # Check if company is closed/radiated
    is_closed = sirene_data.get("is_closed", False)
    if is_closed:
        update_data["is_inexploitable"] = True
        update_data["inexploitable_reason"] = "radié"
        update_data["inexploitable_at"] = datetime.utcnow()
        update_data["inexploitable_by"] = current_user.get("email", "system")
        logger.warning(f"⚠️ Entreprise radiée détectée: {name} - SIRET: {sirene_data.get('siret')}")
    
    # If date_creation from SIRENE
    if sirene_data.get("date_creation"):
        update_data["date_creation_sirene"] = sirene_data.get("date_creation")
    
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": update_data}
    )
    
    logger.info(f"✅ SIRET trouvé pour {name}: {sirene_data.get('siret')} (score: {sirene_data.get('match_score')})")
    
    return {
        "success": True,
        "siret": sirene_data.get("siret"),
        "siren": sirene_data.get("siren"),
        "nom_sirene": sirene_data.get("nom_complet"),
        "naf_code": naf_code,
        "naf_label": naf_label,
        "match_score": sirene_data.get("match_score", 0),
        "verification_status": coherence["status"],
        "verification_message": coherence["message"],
        "business_id": business_id,
        "is_closed": is_closed,
        "etat_administratif": sirene_data.get("etat_administratif", "A")
    }

# ========== MARK BUSINESS AS INEXPLOITABLE ==========
@api_router.post("/businesses/{business_id}/mark-inexploitable")
async def mark_business_inexploitable(
    business_id: str,
    reason: str = "manuel",
    current_user: dict = Depends(get_current_user)
):
    """
    Marque une entreprise comme inexploitable définitivement.
    Raisons possibles: 'radié', 'fermé', 'doublon', 'faux_positif', 'manuel'
    """
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Entreprise non trouvée")
    
    user_email = current_user.get("email", "unknown")
    
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {
            "is_inexploitable": True,
            "inexploitable_reason": reason,
            "inexploitable_at": datetime.utcnow(),
            "inexploitable_by": user_email
        }}
    )
    
    logger.info(f"🚫 Entreprise marquée inexploitable: {business.get('name')} - Raison: {reason} - Par: {user_email}")
    
    return {
        "success": True,
        "message": f"Entreprise marquée comme inexploitable ({reason})",
        "business_id": business_id
    }

@api_router.post("/businesses/{business_id}/unmark-inexploitable")
async def unmark_business_inexploitable(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retire le statut inexploitable d'une entreprise.
    """
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Entreprise non trouvée")
    
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {
            "is_inexploitable": False,
            "inexploitable_reason": None,
            "inexploitable_at": None,
            "inexploitable_by": None
        }}
    )
    
    return {
        "success": True,
        "message": "Statut inexploitable retiré",
        "business_id": business_id
    }

@api_router.post("/businesses/batch-enrich-siret")
async def batch_enrich_siret(
    background_tasks: BackgroundTasks,
    limit: int = Query(100, description="Nombre max d'entreprises à enrichir"),
    current_user: dict = Depends(get_current_admin)
):
    """
    Admin: Lance l'enrichissement SIRET pour toutes les entreprises sans SIRET
    """
    # Count businesses without SIRET
    count = await db.businesses.count_documents({
        "$or": [
            {"siret": {"$exists": False}},
            {"siret": None},
            {"siret": ""}
        ]
    })
    
    # Start background task
    async def enrich_all():
        businesses = await db.businesses.find({
            "$or": [
                {"siret": {"$exists": False}},
                {"siret": None},
                {"siret": ""}
            ]
        }).limit(limit).to_list(limit)
        
        enriched = 0
        failed = 0
        warnings = 0
        
        for business in businesses:
            try:
                name = business.get("name", "")
                city = business.get("city", "")
                postal_code = business.get("postal_code", "")
                google_types = business.get("types", [])
                
                if not name:
                    continue
                
                sirene_data = await get_sirene_data(name, city, postal_code)
                
                if sirene_data:
                    naf_code = sirene_data.get("activite_principale", "")
                    naf_label = sirene_data.get("libelle_activite", "")
                    coherence = check_activity_coherence(google_types, naf_code, naf_label)
                    
                    await db.businesses.update_one(
                        {"id": business["id"]},
                        {"$set": {
                            "siret": sirene_data.get("siret"),
                            "siren": sirene_data.get("siren"),
                            "nom_sirene": sirene_data.get("nom_complet"),
                            "activite_naf": naf_code,
                            "libelle_naf": naf_label,
                            "siret_match_score": sirene_data.get("match_score", 0),
                            "siret_verification_status": coherence["status"],
                            "siret_verification_message": coherence["message"],
                            "siret_enriched_at": datetime.utcnow()
                        }}
                    )
                    enriched += 1
                    if coherence["status"] == "warning":
                        warnings += 1
                else:
                    failed += 1
                
                # Rate limit to avoid API throttling
                await asyncio.sleep(0.3)
                
            except Exception as e:
                logger.error(f"Error enriching {business.get('name')}: {e}")
                failed += 1
        
        logger.info(f"✅ Batch SIRET enrichment complete: {enriched} enriched, {failed} failed, {warnings} warnings")
    
    background_tasks.add_task(enrich_all)
    
    return {
        "success": True,
        "message": f"Enrichissement SIRET lancé pour {min(count, limit)} entreprises",
        "total_without_siret": count,
        "processing": min(count, limit)
    }

# ========== ENRICHISSEMENT COMPLET MULTI-SOURCES ==========
@api_router.post("/businesses/{business_id}/enrich-full")
async def enrich_business_full_endpoint(
    business_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Enrichissement complet d'une entreprise avec toutes les sources :
    - Scraping du site web (emails, téléphones)
    - BODACC (procédures collectives)
    - Recherche email via web
    """
    # Get business
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Entreprise non trouvée")
    
    # Get user's API keys
    user_keys = await fetch_user_api_keys(current_user["sub"])
    serper_api_key = user_keys.get("serper_api_key", "")
    google_api_key = user_keys.get("google_api_key", "")
    
    name = business.get("name", "")
    city = business.get("city", "")
    postal_code = business.get("postal_code", "")
    website = business.get("website", "")
    siret = business.get("siret", "")
    siren = business.get("siren", "")
    
    logger.info(f"🔄 Enrichissement complet: {name}")
    
    # Run full enrichment
    enrichment = await enrich_business_full(
        business_id=business_id,
        name=name,
        city=city,
        postal_code=postal_code,
        website=website,
        siret=siret,
        siren=siren,
        google_api_key=google_api_key,
        serper_api_key=serper_api_key
    )
    
    # Update business with enriched data
    update_data = {
        "enrichment_sources": enrichment["enrichment_sources"],
        "enriched_at": datetime.utcnow()
    }
    
    # Add emails if found and not already present
    if enrichment["emails_found"]:
        existing_email = business.get("email", "")
        if not existing_email:
            update_data["email"] = enrichment["emails_found"][0]
        update_data["emails_all"] = enrichment["emails_found"]
    
    # Add phones if found and not already present  
    if enrichment["phones_found"]:
        existing_phone = business.get("phone", "")
        if not existing_phone:
            update_data["phone"] = enrichment["phones_found"][0]
        update_data["phones_all"] = enrichment["phones_found"]
    
    # Add social links
    if enrichment["social_links"]:
        update_data["social_links"] = enrichment["social_links"]
    
    # Add BODACC info
    if enrichment["has_procedure_collective"]:
        update_data["has_procedure_collective"] = True
        update_data["bodacc_alerts"] = enrichment["bodacc_alerts"]
    
    # Update data_sources with enrichment info
    existing_sources = business.get("data_sources", {})
    website_url = business.get("website_url")
    siren = business.get("siren")
    
    new_sources = {}
    if enrichment["emails_found"]:
        email_sources = generate_data_sources("enrichment", {"email": enrichment["emails_found"][0]}, website_url=website_url)
        new_sources.update(email_sources)
    
    if enrichment["phones_found"] and not business.get("phone"):
        phone_sources = generate_data_sources("enrichment", {"phone": enrichment["phones_found"][0]}, website_url=website_url)
        new_sources.update(phone_sources)
    
    if enrichment["social_links"]:
        social_sources = generate_data_sources("web", {"social_links": True}, website_url=website_url)
        new_sources.update(social_sources)
    
    if enrichment["has_procedure_collective"]:
        bodacc_sources = generate_data_sources("sirene", {"has_procedure_collective": True}, pappers_siren=siren)
        new_sources.update(bodacc_sources)
    
    if new_sources:
        update_data["data_sources"] = merge_data_sources(existing_sources, new_sources)
    
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": update_data}
    )
    
    return {
        "success": True,
        "business_id": business_id,
        "emails_found": enrichment["emails_found"],
        "phones_found": enrichment["phones_found"],
        "social_links": enrichment["social_links"],
        "has_procedure_collective": enrichment["has_procedure_collective"],
        "bodacc_alerts": len(enrichment["bodacc_alerts"]),
        "sources_used": enrichment["enrichment_sources"]
    }

@api_router.post("/businesses/batch-enrich-full")
async def batch_enrich_full(
    background_tasks: BackgroundTasks,
    limit: int = Query(50, description="Nombre max d'entreprises à enrichir"),
    only_without_email: bool = Query(True, description="Uniquement les entreprises sans email"),
    current_user: dict = Depends(get_current_admin)
):
    """
    Admin: Lance l'enrichissement complet pour plusieurs entreprises
    """
    # Get user's API keys
    user_keys = await fetch_user_api_keys(current_user["sub"])
    serper_api_key = user_keys.get("serper_api_key", "")
    google_api_key = user_keys.get("google_api_key", "")
    
    # Build query
    query = {}
    if only_without_email:
        query["$or"] = [
            {"email": {"$exists": False}},
            {"email": None},
            {"email": ""}
        ]
    
    count = await db.businesses.count_documents(query)
    
    async def enrich_batch():
        businesses = await db.businesses.find(query).limit(limit).to_list(limit)
        
        enriched = 0
        for business in businesses:
            try:
                enrichment = await enrich_business_full(
                    business_id=business["id"],
                    name=business.get("name", ""),
                    city=business.get("city", ""),
                    postal_code=business.get("postal_code", ""),
                    website=business.get("website", ""),
                    siret=business.get("siret", ""),
                    siren=business.get("siren", ""),
                    google_api_key=google_api_key,
                    serper_api_key=serper_api_key
                )
                
                # Update
                update_data = {"enriched_at": datetime.utcnow()}
                if enrichment["emails_found"]:
                    update_data["email"] = enrichment["emails_found"][0]
                    update_data["emails_all"] = enrichment["emails_found"]
                if enrichment["phones_found"] and not business.get("phone"):
                    update_data["phone"] = enrichment["phones_found"][0]
                if enrichment["social_links"]:
                    update_data["social_links"] = enrichment["social_links"]
                if enrichment["has_procedure_collective"]:
                    update_data["has_procedure_collective"] = True
                
                await db.businesses.update_one(
                    {"id": business["id"]},
                    {"$set": update_data}
                )
                enriched += 1
                
                # Rate limit
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error enriching {business.get('name')}: {e}")
        
        logger.info(f"✅ Batch enrichment complete: {enriched}/{limit}")
    
    background_tasks.add_task(enrich_batch)
    
    return {
        "success": True,
        "message": f"Enrichissement lancé pour {min(count, limit)} entreprises",
        "total_matching": count,
        "processing": min(count, limit)
    }

# ========== ADMIN PANEL ENDPOINTS ==========

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_admin)):
    """Get all users (admin only)"""
    users = await db.users.find().to_list(1000)
    
    # Clean up and hide password hashes
    result = []
    for user in users:
        user.pop("_id", None)
        user.pop("password_hash", None)
        
        # Get stats for each user
        scan_count = await db.scans.count_documents({"user_id": user["id"]})
        business_count = await db.businesses.aggregate([
            {"$lookup": {
                "from": "scans",
                "localField": "scan_id",
                "foreignField": "id",
                "as": "scan"
            }},
            {"$match": {"scan.user_id": user["id"]}},
            {"$count": "count"}
        ]).to_list(1)
        
        user["scan_count"] = scan_count
        user["business_count"] = business_count[0]["count"] if business_count else 0
        result.append(user)
    
    return result

@api_router.get("/admin/pending-registrations")
async def get_pending_registrations(current_user: dict = Depends(get_current_admin)):
    """Get all pending registration requests (admin only)"""
    pending_users = await db.users.find({
        "is_approved": False
    }).sort("registration_date", -1).to_list(100)
    
    result = []
    for user in pending_users:
        user.pop("_id", None)
        user.pop("password_hash", None)
        user.pop("google_api_key", None)
        user.pop("serper_api_key", None)
        user.pop("pappers_api_key", None)
        result.append(user)
    
    return result

@api_router.post("/admin/approve-registration/{user_id}")
async def approve_registration(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Approve a pending registration (admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    if user.get("is_approved", True):
        raise HTTPException(status_code=400, detail="Cet utilisateur est déjà approuvé")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_approved": True,
            "is_active": True,
            "approved_at": datetime.utcnow(),
            "approved_by": current_user["sub"]
        }}
    )
    
    logger.info(f"✅ Registration approved: {user['email']} by {current_user['email']}")
    
    return {
        "success": True,
        "message": f"L'utilisateur {user['email']} a été approuvé"
    }

@api_router.post("/admin/reject-registration/{user_id}")
async def reject_registration(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Reject and delete a pending registration (admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    if user.get("is_approved", True):
        raise HTTPException(status_code=400, detail="Impossible de rejeter un utilisateur déjà approuvé")
    
    # Delete the user
    await db.users.delete_one({"id": user_id})
    
    logger.info(f"❌ Registration rejected: {user['email']} by {current_user['email']}")
    
    return {
        "success": True,
        "message": f"La demande de {user['email']} a été refusée"
    }

@api_router.post("/admin/users")
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(get_current_admin)
):
    """Create a new user (admin only)"""
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Un utilisateur avec cet email existe déjà")
    
    # Create user
    new_user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role
    )
    
    await db.users.insert_one(new_user.dict())
    
    return {
        "success": True,
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "role": new_user.role,
            "created_at": new_user.created_at.isoformat()
        }
    }

@api_router.patch("/admin/users/{user_id}")
async def update_user(
    user_id: str,
    update_data: dict,
    current_user: dict = Depends(get_current_admin)
):
    """Update a user (admin only) - enable/disable, change role"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Prevent admin from disabling themselves
    if user_id == current_user["sub"] and update_data.get("is_active") == False:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte")
    
    # Build update dict
    update_fields = {}
    
    if "is_active" in update_data:
        update_fields["is_active"] = update_data["is_active"]
    
    if "role" in update_data:
        if update_data["role"] in ["admin", "user"]:
            update_fields["role"] = update_data["role"]
    
    if "password" in update_data and update_data["password"]:
        update_fields["password_hash"] = get_password_hash(update_data["password"])
    
    if update_fields:
        await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
    
    return {"success": True, "updated_fields": list(update_fields.keys())}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Delete a user and all their data (admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Prevent admin from deleting themselves
    if user_id == current_user["sub"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    
    # Delete all user data
    # 1. Get all user scans
    scan_ids = [s["id"] async for s in db.scans.find({"user_id": user_id})]
    
    # 2. Delete businesses from those scans
    if scan_ids:
        await db.businesses.delete_many({"scan_id": {"$in": scan_ids}})
    
    # 3. Delete user_business_status
    await db.user_business_status.delete_many({"user_id": user_id})
    
    # 4. Delete scans
    await db.scans.delete_many({"user_id": user_id})
    
    # 5. Delete notifications
    await db.notifications.delete_many({"user_id": user_id})
    
    # 6. Delete user
    await db.users.delete_one({"id": user_id})
    
    return {"success": True, "message": f"Utilisateur {user['email']} supprimé"}

@api_router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_admin)):
    """Get global statistics (admin only)"""
    total_users = await db.users.count_documents({})
    total_scans = await db.scans.count_documents({})
    total_businesses = await db.businesses.count_documents({})
    
    # PJ stats
    pj_absent = await db.businesses.count_documents({"has_pagesjaunes": False})
    pj_present = await db.businesses.count_documents({"has_pagesjaunes": True})
    
    # Website stats
    with_website = await db.businesses.count_documents({"has_website": True})
    
    # Recent activity
    recent_scans = await db.scans.find().sort("created_at", -1).limit(5).to_list(5)
    for scan in recent_scans:
        scan.pop("_id", None)
    
    return {
        "total_users": total_users,
        "total_scans": total_scans,
        "total_businesses": total_businesses,
        "pj_absent": pj_absent,
        "pj_present": pj_present,
        "with_website": with_website,
        "recent_scans": recent_scans
    }

# ========== ZONE SURVEILLANCE ENDPOINTS ==========

@api_router.post("/surveillances")
async def create_surveillance(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a new zone surveillance"""
    from models import ZoneSurveillance
    
    user_id = current_user["sub"]
    
    # Check limit (max 10 surveillances per user)
    count = await db.surveillances.count_documents({"user_id": user_id})
    if count >= 10:
        raise HTTPException(status_code=400, detail="Limite de 10 surveillances atteinte")
    
    surveillance = ZoneSurveillance(
        user_id=user_id,
        name=data.get("name", f"Surveillance {data.get('city', 'zone')}"),
        geo_mode=data.get("geo_mode", "radius"),
        city=data.get("city"),
        postal_code=data.get("postal_code"),
        radius_km=data.get("radius_km", 20),
        cities=data.get("cities", []),
        domains=data.get("domains", []),
        max_age_days=data.get("max_age_days", 30),
        frequency=data.get("frequency", "daily"),
        notify_email=data.get("notify_email", False),
        notify_app=data.get("notify_app", True)
    )
    
    await db.surveillances.insert_one(surveillance.dict())
    
    return {"success": True, "surveillance": surveillance.dict()}

@api_router.get("/surveillances")
async def get_surveillances(current_user: dict = Depends(get_current_user)):
    """Get all zone surveillances for current user"""
    user_id = current_user["sub"]
    
    surveillances = await db.surveillances.find({"user_id": user_id}).sort("created_at", -1).to_list(20)
    for s in surveillances:
        s.pop("_id", None)
    
    return surveillances

@api_router.get("/surveillances/{surveillance_id}")
async def get_surveillance(
    surveillance_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific zone surveillance"""
    user_id = current_user["sub"]
    
    surveillance = await db.surveillances.find_one({"id": surveillance_id, "user_id": user_id})
    if not surveillance:
        raise HTTPException(status_code=404, detail="Surveillance non trouvée")
    
    surveillance.pop("_id", None)
    
    # Get recent alerts for this surveillance
    alerts = await db.surveillance_alerts.find(
        {"surveillance_id": surveillance_id}
    ).sort("created_at", -1).limit(50).to_list(50)
    for a in alerts:
        a.pop("_id", None)
    
    return {"surveillance": surveillance, "alerts": alerts}

@api_router.patch("/surveillances/{surveillance_id}")
async def update_surveillance(
    surveillance_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a zone surveillance"""
    user_id = current_user["sub"]
    
    surveillance = await db.surveillances.find_one({"id": surveillance_id, "user_id": user_id})
    if not surveillance:
        raise HTTPException(status_code=404, detail="Surveillance non trouvée")
    
    update_fields = {}
    allowed_fields = ["name", "city", "postal_code", "radius_km", "domains", "is_active", "notify_email", "notify_app"]
    
    for field in allowed_fields:
        if field in data:
            update_fields[field] = data[field]
    
    if update_fields:
        update_fields["updated_at"] = datetime.utcnow()
        await db.surveillances.update_one(
            {"id": surveillance_id},
            {"$set": update_fields}
        )
    
    return {"success": True}

@api_router.delete("/surveillances/{surveillance_id}")
async def delete_surveillance(
    surveillance_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a zone surveillance"""
    user_id = current_user["sub"]
    
    result = await db.surveillances.delete_one({"id": surveillance_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Surveillance non trouvée")
    
    # Also delete related alerts
    await db.surveillance_alerts.delete_many({"surveillance_id": surveillance_id})
    
    return {"success": True}

@api_router.get("/surveillances/alerts/unread")
async def get_unread_surveillance_alerts(current_user: dict = Depends(get_current_user)):
    """Get unread surveillance alerts count"""
    user_id = current_user["sub"]
    
    count = await db.surveillance_alerts.count_documents({"user_id": user_id, "is_read": False})
    
    return {"unread_count": count}

@api_router.post("/surveillances/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a surveillance alert as read"""
    user_id = current_user["sub"]
    
    await db.surveillance_alerts.update_one(
        {"id": alert_id, "user_id": user_id},
        {"$set": {"is_read": True}}
    )
    
    return {"success": True}


# ========== ZONE SURVEILLANCE ENGINE ==========

# Global flag to control the surveillance loop
surveillance_running = False

async def search_pappers_for_surveillance(
    city_name: str,
    postal_codes: list[str],
    naf_codes: list[str],
    date_creation_min: str,
    pappers_api_key: str,
    max_results: int = 50,
    user_id: str = None  # For API usage tracking
) -> list[dict]:
    """
    Recherche Pappers optimisée pour la surveillance de zone.
    Retourne les nouvelles entreprises créées depuis date_creation_min.
    NOTE: L'API Pappers ne respecte pas toujours date_creation_min, donc on filtre côté serveur.
    """
    all_companies = []
    seen_sirens = set()
    
    if not pappers_api_key:
        return []
    
    # Parse the minimum date for filtering
    try:
        min_date = datetime.strptime(date_creation_min, "%Y-%m-%d")
    except:
        min_date = datetime.utcnow() - timedelta(days=30)
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # Search by postal codes (max 5)
            for code_postal in postal_codes[:5]:
                # If we have NAF codes, search by each one
                if naf_codes:
                    for code_naf in naf_codes[:6]:  # Max 6 NAF codes
                        params = {
                            "api_token": pappers_api_key,
                            "code_postal": code_postal,
                            "code_naf": code_naf,
                            "par_page": 50,  # Get more to filter
                            "entreprise_cessee": "false",
                            "statut_entreprise": "Actif"
                        }
                        
                        try:
                            response = await client.get("https://api.pappers.fr/v2/recherche", params=params)
                            
                            # Track API usage
                            if user_id:
                                await track_api_usage(
                                    user_id=user_id,
                                    api_type="pappers",
                                    endpoint="surveillance_recherche",
                                    credits=1,
                                    success=(response.status_code == 200),
                                    error_msg=f"HTTP {response.status_code}" if response.status_code != 200 else None
                                )
                            
                            if response.status_code == 200:
                                data = response.json()
                                for company in data.get("resultats", []):
                                    siren = company.get("siren")
                                    if company.get("entreprise_cessee") == True:
                                        continue
                                    
                                    # FILTER BY DATE - Pappers API doesn't respect date_creation_min
                                    date_creation = company.get("date_creation")
                                    if date_creation:
                                        try:
                                            creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                                            if creation_date < min_date:
                                                continue  # Skip old companies
                                        except:
                                            continue  # Skip if date parsing fails
                                    else:
                                        continue  # Skip companies without creation date
                                    
                                    if siren and siren not in seen_sirens:
                                        seen_sirens.add(siren)
                                        all_companies.append(company)
                        except Exception as e:
                            logger.warning(f"Pappers surveillance error: {e}")
                            continue
                        
                        if len(all_companies) >= max_results:
                            break
                else:
                    # No NAF codes, search all
                    params = {
                        "api_token": pappers_api_key,
                        "code_postal": code_postal,
                        "par_page": 50,
                        "entreprise_cessee": "false",
                        "statut_entreprise": "Actif"
                    }
                    
                    try:
                        response = await client.get("https://api.pappers.fr/v2/recherche", params=params)
                        
                        # Track API usage
                        if user_id:
                            await track_api_usage(
                                user_id=user_id,
                                api_type="pappers",
                                endpoint="surveillance_recherche",
                                credits=1,
                                success=(response.status_code == 200),
                                error_msg=f"HTTP {response.status_code}" if response.status_code != 200 else None
                            )
                        
                        if response.status_code == 200:
                            data = response.json()
                            for company in data.get("resultats", []):
                                siren = company.get("siren")
                                if company.get("entreprise_cessee") == True:
                                    continue
                                
                                # FILTER BY DATE
                                date_creation = company.get("date_creation")
                                if date_creation:
                                    try:
                                        creation_date = datetime.strptime(date_creation, "%Y-%m-%d")
                                        if creation_date < min_date:
                                            continue
                                    except:
                                        continue
                                else:
                                    continue
                                
                                if siren and siren not in seen_sirens:
                                    seen_sirens.add(siren)
                                    all_companies.append(company)
                    except Exception as e:
                        logger.warning(f"Pappers surveillance error: {e}")
                        continue
                
                if len(all_companies) >= max_results:
                    break
                    
    except Exception as e:
        logger.error(f"Erreur Pappers surveillance: {e}")
    
    logger.info(f"🔍 Surveillance: {len(all_companies)} companies after date filter (min: {date_creation_min})")
    return all_companies[:max_results]


async def get_city_postal_codes(city_name: str) -> list[str]:
    """Get postal codes for a city using the Geo API"""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://geo.api.gouv.fr/communes",
                params={
                    "nom": city_name,
                    "fields": "codesPostaux",
                    "boost": "population",
                    "limit": 1
                }
            )
            if response.status_code == 200:
                cities = response.json()
                if cities:
                    return cities[0].get("codesPostaux", [])
    except Exception as e:
        logger.warning(f"Error getting postal codes for {city_name}: {e}")
    return []


async def get_nearby_cities_postal_codes(city_name: str, radius_km: int) -> list[str]:
    """Get postal codes for all cities within a radius"""
    postal_codes = []
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # First, get the main city coordinates
            response = await client.get(
                "https://geo.api.gouv.fr/communes",
                params={
                    "nom": city_name,
                    "fields": "centre,codesPostaux",
                    "boost": "population",
                    "limit": 1
                }
            )
            
            if response.status_code != 200 or not response.json():
                return []
            
            main_city = response.json()[0]
            postal_codes.extend(main_city.get("codesPostaux", []))
            
            if not main_city.get("centre"):
                return postal_codes
            
            lng, lat = main_city["centre"]["coordinates"]
            
            # Get all nearby cities
            response = await client.get(
                "https://geo.api.gouv.fr/communes",
                params={
                    "lat": lat,
                    "lon": lng,
                    "fields": "nom,codesPostaux,centre",
                    "format": "json"
                }
            )
            
            if response.status_code == 200:
                # Use imported haversine_distance from services.geo
                for city in response.json():
                    if city.get("centre") and city["centre"].get("coordinates"):
                        city_lng, city_lat = city["centre"]["coordinates"]
                        distance = haversine_distance(lat, lng, city_lat, city_lng)
                        
                        if distance <= radius_km:
                            postal_codes.extend(city.get("codesPostaux", []))
                
    except Exception as e:
        logger.error(f"Error getting nearby cities for {city_name}: {e}")
    
    # Remove duplicates and limit
    return list(set(postal_codes))[:20]


async def process_single_surveillance(surveillance: dict) -> dict:
    """
    Process a single surveillance zone.
    Supports both "radius" mode (city + radius) and "cities" mode (specific cities list).
    Returns stats about new businesses found.
    """
    zone_id = surveillance["id"]
    user_id = surveillance["user_id"]
    geo_mode = surveillance.get("geo_mode", "radius")
    city = surveillance.get("city")
    cities_list = surveillance.get("cities", [])
    radius_km = surveillance.get("radius_km", 20)
    domains = surveillance.get("domains", [])
    
    # Build description for logs
    if geo_mode == "cities" and cities_list:
        geo_desc = f"villes: {', '.join(cities_list[:3])}{'...' if len(cities_list) > 3 else ''}"
    else:
        geo_desc = f"{city}, {radius_km}km"
    
    logger.info(f"🔍 Processing surveillance: {surveillance.get('name')} ({geo_desc})")
    
    # Get user's Pappers API key
    user = await db.users.find_one({"id": user_id})
    if not user:
        logger.warning(f"User {user_id} not found for surveillance {zone_id}")
        return {"zone_id": zone_id, "new_count": 0, "error": "User not found"}
    
    pappers_key = user.get("pappers_api_key") or PAPPERS_API_KEY
    if not pappers_key:
        logger.warning(f"No Pappers API key for user {user_id}")
        return {"zone_id": zone_id, "new_count": 0, "error": "No Pappers API key"}
    
    # Get postal codes based on geo_mode
    postal_codes = []
    
    if geo_mode == "cities" and cities_list:
        # Mode "villes précises": get postal codes for each specific city
        for city_name in cities_list[:10]:  # Max 10 cities
            city_codes = await get_city_postal_codes(city_name)
            postal_codes.extend(city_codes)
        postal_codes = list(set(postal_codes))[:25]  # Limit and dedupe
        logger.info(f"📍 Cities mode: {len(cities_list)} cities -> {len(postal_codes)} postal codes")
    else:
        # Mode "rayon": get postal codes for city + radius
        if city:
            postal_codes = await get_nearby_cities_postal_codes(city, radius_km)
            if not postal_codes:
                postal_codes = await get_city_postal_codes(city)
            logger.info(f"📍 Radius mode: {city} + {radius_km}km -> {len(postal_codes)} postal codes")
    
    if not postal_codes:
        logger.warning(f"No postal codes found for {city}")
        return {"zone_id": zone_id, "new_count": 0, "error": "No postal codes"}
    
    # Build NAF codes from domains
    naf_codes = []
    for domain in domains:
        domain_upper = domain.upper()
        if domain_upper in DOMAIN_NAF_CODES:
            naf_codes.extend(DOMAIN_NAF_CODES[domain_upper])
    naf_codes = list(set(naf_codes))
    
    # Calculate date filter using surveillance's max_age_days setting
    from datetime import timedelta
    max_age_days = surveillance.get("max_age_days", 30)
    date_min = (datetime.utcnow() - timedelta(days=max_age_days)).strftime("%Y-%m-%d")
    
    logger.info(f"🔍 Surveillance filter: companies created after {date_min} ({max_age_days} days)")
    
    # Search Pappers
    companies = await search_pappers_for_surveillance(
        city_name=city,
        postal_codes=postal_codes,
        naf_codes=naf_codes,
        date_creation_min=date_min,
        pappers_api_key=pappers_key,
        max_results=50,
        user_id=user_id  # For API tracking
    )
    
    logger.info(f"📊 Pappers found {len(companies)} companies for {city}")
    
    # Check which companies are new (not already alerted)
    new_companies = []
    for company in companies:
        siren = company.get("siren")
        if not siren:
            continue
        
        # Check if already alerted for this zone
        existing_alert = await db.surveillance_alerts.find_one({
            "surveillance_id": zone_id,
            "business_siren": siren
        })
        
        if not existing_alert:
            new_companies.append(company)
    
    logger.info(f"✨ {len(new_companies)} new companies found (not previously alerted)")
    
    # Create alerts for new companies
    alerts_created = 0
    for company in new_companies[:20]:  # Max 20 alerts per run
        siren = company.get("siren", "")
        nom = company.get("nom_entreprise") or company.get("denomination") or "Entreprise"
        ville = company.get("siege", {}).get("ville") or city
        
        # Determine domain from NAF code
        naf_code = company.get("code_naf", "")
        detected_domain = "autre"
        for domain_name, codes in DOMAIN_NAF_CODES.items():
            if any(naf_code.startswith(code[:2]) for code in codes):
                detected_domain = domain_name.lower()
                break
        
        alert = {
            "id": str(uuid.uuid4()),
            "surveillance_id": zone_id,
            "user_id": user_id,
            "business_siren": siren,
            "business_name": nom,
            "business_city": ville,
            "business_naf": naf_code,
            "domain": detected_domain,
            "date_creation": company.get("date_creation"),
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        
        await db.surveillance_alerts.insert_one(alert)
        alerts_created += 1
    
    # Update surveillance stats
    await db.surveillances.update_one(
        {"id": zone_id},
        {
            "$set": {
                "last_scan_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            },
            "$inc": {"total_alerts": alerts_created}
        }
    )
    
    # Create notification if new companies found
    if alerts_created > 0:
        notification = Notification(
            user_id=user_id,
            type=NotificationType.NEW_BUSINESSES,
            title=f"🔔 {alerts_created} nouvelle(s) entreprise(s) détectée(s)",
            message=f"Zone: {surveillance.get('name', city)} • {alerts_created} création(s) récente(s) trouvée(s)",
            data={
                "surveillance_id": zone_id,
                "surveillance_name": surveillance.get("name", city),
                "count": alerts_created
            }
        )
        await db.notifications.insert_one(notification.dict())
        logger.info(f"📬 Notification created for {alerts_created} new businesses")
        
        # Send email notification if user has it enabled
        try:
            if user and user.get("email"):
                prefs = await get_user_email_preferences(db, user_id)
                if prefs.get("surveillance_alerts", True):
                    # Build zone description
                    if geo_mode == "cities" and cities_list:
                        zone_desc = f"Villes: {', '.join(cities_list[:3])}{'...' if len(cities_list) > 3 else ''}"
                    else:
                        zone_desc = f"{city}, rayon {radius_km}km"
                    
                    # Build companies list for email
                    email_companies = []
                    for company in new_companies[:10]:
                        email_companies.append({
                            "business_name": company.get("nom_entreprise") or company.get("denomination") or "Entreprise",
                            "business_city": company.get("siege", {}).get("ville") or city,
                            "domain": "autre",  # Will be determined later
                            "date_creation": company.get("date_creation", "")
                        })
                    
                    await send_surveillance_alert_email(
                        db=db,
                        user_email=user["email"],
                        surveillance_name=surveillance.get("name", city),
                        zone_description=zone_desc,
                        new_companies=email_companies,
                        surveillance_id=zone_id
                    )
                    logger.info(f"📧 Surveillance alert email sent to {user['email']}")
        except Exception as email_error:
            logger.error(f"Failed to send surveillance alert email: {email_error}")
    
    return {
        "zone_id": zone_id,
        "zone_name": surveillance.get("name", city),
        "new_count": alerts_created,
        "total_found": len(companies)
    }


async def process_all_surveillances():
    """
    Process all active surveillance zones.
    This is called periodically by the background task.
    """
    logger.info("🚀 Starting surveillance engine cycle...")
    
    # Get all active surveillances
    surveillances = await db.surveillances.find({"is_active": True}).to_list(100)
    
    if not surveillances:
        logger.info("No active surveillances to process")
        return {"processed": 0, "results": []}
    
    logger.info(f"📋 Found {len(surveillances)} active surveillance zones")
    
    results = []
    for surveillance in surveillances:
        surveillance.pop("_id", None)
        try:
            result = await process_single_surveillance(surveillance)
            results.append(result)
            # Small delay between zones to avoid rate limiting
            await asyncio.sleep(2)
        except Exception as e:
            logger.error(f"Error processing surveillance {surveillance.get('id')}: {e}")
            results.append({
                "zone_id": surveillance.get("id"),
                "error": str(e)
            })
    
    total_new = sum(r.get("new_count", 0) for r in results)
    logger.info(f"✅ Surveillance cycle complete: {len(results)} zones processed, {total_new} new alerts")
    
    return {"processed": len(results), "total_new": total_new, "results": results}


async def surveillance_background_loop():
    """
    Background task that runs surveillance checks based on each surveillance's frequency.
    Frequencies: "daily" (1x/day at 8h), "twice" (2x/day at 7h and 14h), "weekly" (1x/week Monday 8h)
    """
    global surveillance_running
    surveillance_running = True
    
    logger.info("🔄 Surveillance background loop started (frequency-based)")
    
    import pytz
    
    paris_tz = pytz.timezone('Europe/Paris')
    
    while surveillance_running:
        try:
            # Get current Paris time
            now_paris = datetime.now(paris_tz)
            current_hour = now_paris.hour
            current_minute = now_paris.minute
            current_weekday = now_paris.weekday()  # 0 = Monday
            
            # Determine which frequencies should run now
            frequencies_to_run = []
            
            # Check if we're at a scheduled time (with 5 min tolerance at start of hour)
            if current_minute < 5:
                # 7h00 - Run "twice" frequency
                if current_hour == 7:
                    frequencies_to_run.append("twice")
                
                # 8h00 - Run "daily" and "weekly" (on Monday)
                if current_hour == 8:
                    frequencies_to_run.append("daily")
                    if current_weekday == 0:  # Monday
                        frequencies_to_run.append("weekly")
                
                # 14h00 - Run "twice" frequency
                if current_hour == 14:
                    frequencies_to_run.append("twice")
            
            if frequencies_to_run:
                logger.info(f"⏰ Running surveillance for frequencies: {frequencies_to_run} at {now_paris.strftime('%H:%M')}")
                await process_surveillances_by_frequency(frequencies_to_run)
                # Wait 1 hour to avoid running again in the same hour
                await asyncio.sleep(3600)
            else:
                # Sleep for 30 minutes then check again
                await asyncio.sleep(1800)
                
        except Exception as e:
            logger.error(f"Surveillance loop error: {e}")
            await asyncio.sleep(1800)


async def weekly_summary_scheduler():
    """
    Background task that sends weekly summary emails every Monday at 9h (Paris time).
    """
    import pytz
    
    logger.info("📧 Weekly summary scheduler started")
    
    paris_tz = pytz.timezone('Europe/Paris')
    
    while True:
        try:
            now_paris = datetime.now(paris_tz)
            current_hour = now_paris.hour
            current_minute = now_paris.minute
            current_weekday = now_paris.weekday()  # 0 = Monday
            
            # Send weekly summaries every Monday at 9h00 (with 5 min tolerance)
            if current_weekday == 0 and current_hour == 9 and current_minute < 5:
                logger.info("📧 Starting weekly summary distribution...")
                
                try:
                    results = await send_weekly_summaries(db)
                    logger.info(f"📧 Weekly summaries sent: {results['sent']} emails, {results['skipped']} skipped, {results['errors']} errors")
                except Exception as e:
                    logger.error(f"❌ Error sending weekly summaries: {e}")
                
                # Wait 1 hour to avoid sending again in the same hour
                await asyncio.sleep(3600)
            else:
                # Check every 30 minutes
                await asyncio.sleep(1800)
                
        except Exception as e:
            logger.error(f"Weekly summary scheduler error: {e}")
            await asyncio.sleep(1800)


async def process_surveillances_by_frequency(frequencies: list[str]):
    """
    Process surveillances filtered by frequency.
    """
    logger.info(f"🚀 Processing surveillances with frequencies: {frequencies}")
    
    # Get active surveillances matching the frequencies
    surveillances = await db.surveillances.find({
        "is_active": True,
        "frequency": {"$in": frequencies}
    }).to_list(100)
    
    if not surveillances:
        logger.info(f"No active surveillances for frequencies {frequencies}")
        return {"processed": 0, "results": []}
    
    logger.info(f"📋 Found {len(surveillances)} surveillance zones to process")
    
    results = []
    for surveillance in surveillances:
        surveillance.pop("_id", None)
        try:
            result = await process_single_surveillance(surveillance)
            results.append(result)
            # Small delay between zones to avoid rate limiting
            await asyncio.sleep(2)
        except Exception as e:
            logger.error(f"Error processing surveillance {surveillance.get('id')}: {e}")
            results.append({
                "zone_id": surveillance.get("id"),
                "error": str(e)
            })
    
    total_new = sum(r.get("new_count", 0) for r in results)
    logger.info(f"✅ Surveillance cycle complete: {len(results)} zones processed, {total_new} new alerts")
    
    return {"processed": len(results), "total_new": total_new, "results": results}


@api_router.post("/surveillances/run")
async def trigger_surveillance_manually(
    current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger surveillance check for current user's zones.
    Useful for testing or forcing immediate check.
    """
    user_id = current_user["sub"]
    
    # Get user's active surveillances
    surveillances = await db.surveillances.find({
        "user_id": user_id,
        "is_active": True
    }).to_list(10)
    
    if not surveillances:
        return {"success": True, "message": "Aucune surveillance active", "results": []}
    
    results = []
    for surveillance in surveillances:
        surveillance.pop("_id", None)
        try:
            result = await process_single_surveillance(surveillance)
            results.append(result)
        except Exception as e:
            logger.error(f"Error in manual surveillance: {e}")
            results.append({"zone_id": surveillance.get("id"), "error": str(e)})
    
    total_new = sum(r.get("new_count", 0) for r in results)
    
    return {
        "success": True,
        "message": f"{len(results)} zone(s) vérifiée(s), {total_new} nouvelle(s) entreprise(s) détectée(s)",
        "results": results
    }


@api_router.get("/surveillances/{surveillance_id}/alerts")
async def get_surveillance_alerts(
    surveillance_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get alerts for a specific surveillance zone"""
    user_id = current_user["sub"]
    
    # Verify ownership
    surveillance = await db.surveillances.find_one({
        "id": surveillance_id,
        "user_id": user_id
    })
    if not surveillance:
        raise HTTPException(status_code=404, detail="Surveillance non trouvée")
    
    alerts = await db.surveillance_alerts.find(
        {"surveillance_id": surveillance_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for alert in alerts:
        alert.pop("_id", None)
    
    return {
        "surveillance_name": surveillance.get("name"),
        "total_alerts": surveillance.get("total_alerts", 0),
        "alerts": alerts
    }


# ========== MINI CRM - Sales Pipeline & Interactions ==========

SALES_STATUS_LABELS = {
    "new": "Nouveau",
    "to_call": "À appeler",
    "called": "Appelé",
    "callback": "Rappeler",
    "meeting_scheduled": "RDV programmé",
    "meeting_done": "RDV effectué",
    "proposal_sent": "Devis envoyé",
    "won": "Gagné",
    "lost": "Perdu",
    "not_interested": "Non intéressé"
}

SALES_STATUS_COLORS = {
    "new": "#6B7280",
    "to_call": "#3B82F6",
    "called": "#8B5CF6",
    "callback": "#F59E0B",
    "meeting_scheduled": "#10B981",
    "meeting_done": "#059669",
    "proposal_sent": "#6366F1",
    "won": "#22C55E",
    "lost": "#EF4444",
    "not_interested": "#9CA3AF"
}


@api_router.get("/crm/pipeline")
async def get_pipeline_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get pipeline statistics for the current user"""
    user_id = current_user["sub"]
    
    # Count businesses by sales status
    pipeline = []
    for status in SalesStatus:
        count = await db.user_business_status.count_documents({
            "user_id": user_id,
            "sales_status": status.value
        })
        pipeline.append({
            "status": status.value,
            "label": SALES_STATUS_LABELS.get(status.value, status.value),
            "color": SALES_STATUS_COLORS.get(status.value, "#6B7280"),
            "count": count
        })
    
    # Get total businesses for this user
    total = await db.user_business_status.count_documents({"user_id": user_id})
    
    # Get callbacks due
    callbacks_due = await db.business_interactions.count_documents({
        "user_id": user_id,
        "callback_date": {"$lte": datetime.utcnow()},
        "callback_reminder": True
    })
    
    return {
        "pipeline": pipeline,
        "total": total,
        "callbacks_due": callbacks_due
    }


@api_router.get("/crm/stats")
async def get_crm_detailed_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get detailed CRM statistics including conversion rates and performance metrics"""
    user_id = current_user["sub"]
    
    # Date ranges
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Count by status
    status_counts = {}
    for status in SalesStatus:
        count = await db.user_business_status.count_documents({
            "user_id": user_id,
            "sales_status": status.value
        })
        status_counts[status.value] = count
    
    total_leads = sum(status_counts.values())
    
    # Conversion metrics
    won_count = status_counts.get("won", 0)
    lost_count = status_counts.get("lost", 0)
    closed_count = won_count + lost_count
    
    # Conversion rate (won / (won + lost))
    conversion_rate = round((won_count / closed_count * 100) if closed_count > 0 else 0, 1)
    
    # Win rate (won / total worked)
    worked_statuses = ["called", "callback", "meeting_scheduled", "meeting_done", "proposal_sent", "won", "lost"]
    worked_count = sum(status_counts.get(s, 0) for s in worked_statuses)
    win_rate = round((won_count / worked_count * 100) if worked_count > 0 else 0, 1)
    
    # Activity this week
    week_interactions = await db.business_interactions.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago}
    })
    
    # Calls this week
    week_calls = await db.business_interactions.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago},
        "interaction_type": {"$in": ["call_outbound", "call_inbound"]}
    })
    
    # New leads this week
    week_new_leads = await db.user_business_status.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago}
    })
    
    # Meetings this week
    week_meetings = await db.business_interactions.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago},
        "interaction_type": "meeting"
    })
    
    # Pipeline value estimation (count * average deal value)
    # For now, we'll just count active opportunities
    active_opps = sum(status_counts.get(s, 0) for s in ["meeting_scheduled", "meeting_done", "proposal_sent"])
    
    # Average time to close (for won deals)
    won_deals = await db.user_business_status.find({
        "user_id": user_id,
        "sales_status": "won"
    }).to_list(100)
    
    avg_days_to_close = 0
    if won_deals:
        total_days = 0
        valid_deals = 0
        for deal in won_deals:
            if deal.get("created_at") and deal.get("updated_at"):
                days = (deal["updated_at"] - deal["created_at"]).days
                if days >= 0:
                    total_days += days
                    valid_deals += 1
        avg_days_to_close = round(total_days / valid_deals) if valid_deals > 0 else 0
    
    # Top performing sources
    source_pipeline = [
        {"$match": {"user_id": user_id, "sales_status": "won"}},
        {"$lookup": {
            "from": "businesses",
            "localField": "business_id",
            "foreignField": "id",
            "as": "business"
        }},
        {"$unwind": {"path": "$business", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": "$business.source",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_sources_cursor = db.user_business_status.aggregate(source_pipeline)
    top_sources = [{"source": doc["_id"] or "unknown", "wins": doc["count"]} async for doc in top_sources_cursor]
    
    return {
        "overview": {
            "total_leads": total_leads,
            "conversion_rate": conversion_rate,
            "win_rate": win_rate,
            "avg_days_to_close": avg_days_to_close,
            "active_opportunities": active_opps
        },
        "status_breakdown": status_counts,
        "this_week": {
            "new_leads": week_new_leads,
            "interactions": week_interactions,
            "calls": week_calls,
            "meetings": week_meetings
        },
        "performance": {
            "won": won_count,
            "lost": lost_count,
            "worked": worked_count,
            "top_sources": top_sources
        }
    }


@api_router.get("/crm/callbacks-due")
async def get_callbacks_due(
    current_user: dict = Depends(get_current_user)
):
    """Get list of callbacks that are due or overdue"""
    user_id = current_user["sub"]
    now = datetime.utcnow()
    
    # Get callbacks due today or overdue
    callbacks = await db.business_interactions.find({
        "user_id": user_id,
        "callback_date": {"$lte": now + timedelta(days=1)},  # Due within 24h
        "callback_reminder": True
    }).sort("callback_date", 1).to_list(50)
    
    result = []
    for cb in callbacks:
        # Get business info
        business = await db.businesses.find_one({"id": cb.get("business_id")}, {"name": 1, "phone": 1, "city": 1})
        
        callback_date = cb.get("callback_date")
        is_overdue = callback_date < now if callback_date else False
        
        result.append({
            "interaction_id": cb.get("id"),
            "business_id": cb.get("business_id"),
            "business_name": business.get("name") if business else "Inconnu",
            "business_phone": business.get("phone") if business else None,
            "business_city": business.get("city") if business else None,
            "callback_date": callback_date.isoformat() if callback_date else None,
            "note": cb.get("content", ""),
            "is_overdue": is_overdue,
            "days_overdue": (now - callback_date).days if is_overdue else 0
        })
    
    return {
        "callbacks": result,
        "total": len(result),
        "overdue_count": sum(1 for r in result if r["is_overdue"])
    }


@api_router.get("/crm/businesses")
async def get_crm_businesses(
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Get businesses filtered by sales status"""
    user_id = current_user["sub"]
    
    # Build query
    query = {"user_id": user_id}
    if status and status != "all":
        query["sales_status"] = status
    
    # Get user business statuses
    statuses = await db.user_business_status.find(query).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get full business details for each
    results = []
    for ubs in statuses:
        ubs.pop("_id", None)
        business = await db.businesses.find_one({"id": ubs["business_id"]})
        if business:
            business.pop("_id", None)
            results.append({
                **business,
                "sales_status": ubs.get("sales_status", "new"),
                "crm_note": ubs.get("note"),
                "last_interaction_at": ubs.get("last_interaction_at")
            })
    
    total = await db.user_business_status.count_documents(query)
    
    return {
        "businesses": results,
        "total": total,
        "has_more": skip + limit < total
    }


@api_router.post("/crm/status")
async def update_sales_status(
    request: SalesStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update the sales status of a business"""
    user_id = current_user["sub"]
    user_email = current_user.get("email", "unknown")
    
    # Get or create user business status
    existing = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": request.business_id
    })
    
    old_status = existing.get("sales_status", "new") if existing else "new"
    new_status = request.sales_status.value
    
    if existing:
        await db.user_business_status.update_one(
            {"id": existing["id"]},
            {"$set": {
                "sales_status": new_status,
                "updated_at": datetime.utcnow()
            }}
        )
    else:
        new_ubs = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "business_id": request.business_id,
            "sales_status": new_status,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await db.user_business_status.insert_one(new_ubs)
    
    # Create an interaction record for the status change
    if old_status != new_status:
        interaction = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "business_id": request.business_id,
            "interaction_type": InteractionType.STATUS_CHANGE.value,
            "title": f"Statut changé: {SALES_STATUS_LABELS.get(old_status, old_status)} → {SALES_STATUS_LABELS.get(new_status, new_status)}",
            "content": request.note,
            "old_status": old_status,
            "new_status": new_status,
            "created_at": datetime.utcnow()
        }
        await db.business_interactions.insert_one(interaction)
    
    return {
        "success": True,
        "old_status": old_status,
        "new_status": new_status,
        "label": SALES_STATUS_LABELS.get(new_status, new_status)
    }


@api_router.post("/crm/interactions")
async def create_interaction(
    request: BusinessInteractionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new interaction (call, note, etc.)"""
    user_id = current_user["sub"]
    
    # Get business reference
    business = await db.businesses.find_one({"id": request.business_id})
    pl_reference = business.get("pl_reference") if business else None
    
    # Parse callback date if provided
    callback_date = None
    if request.callback_date:
        try:
            callback_date = datetime.fromisoformat(request.callback_date.replace('Z', '+00:00'))
        except:
            pass
    
    interaction = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "business_id": request.business_id,
        "pl_reference": pl_reference,
        "interaction_type": request.interaction_type.value,
        "title": request.title,
        "content": request.content,
        "call_duration": request.call_duration,
        "call_outcome": request.call_outcome,
        "callback_date": callback_date,
        "callback_reminder": callback_date is not None,
        "created_at": datetime.utcnow()
    }
    
    await db.business_interactions.insert_one(interaction)
    
    # Update last interaction on user business status
    await db.user_business_status.update_one(
        {"user_id": user_id, "business_id": request.business_id},
        {
            "$set": {"last_interaction_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "business_id": request.business_id,
                "sales_status": "new",
                "created_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    
    interaction.pop("_id", None)
    
    return {
        "success": True,
        "interaction": interaction
    }


@api_router.get("/crm/interactions/{business_id}")
async def get_business_interactions(
    business_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get interaction history for a business"""
    user_id = current_user["sub"]
    
    interactions = await db.business_interactions.find({
        "user_id": user_id,
        "business_id": business_id
    }).sort("created_at", -1).limit(limit).to_list(limit)
    
    for i in interactions:
        i.pop("_id", None)
    
    # Get business info
    business = await db.businesses.find_one({"id": business_id})
    business_name = business.get("name") if business else "Unknown"
    
    # Get current status
    status = await db.user_business_status.find_one({
        "user_id": user_id,
        "business_id": business_id
    })
    sales_status = status.get("sales_status", "new") if status else "new"
    
    return {
        "business_id": business_id,
        "business_name": business_name,
        "sales_status": sales_status,
        "sales_status_label": SALES_STATUS_LABELS.get(sales_status, sales_status),
        "interactions": interactions,
        "total": len(interactions)
    }


@api_router.get("/crm/callbacks")
async def get_callbacks(
    current_user: dict = Depends(get_current_user)
):
    """Get callbacks due today or overdue"""
    user_id = current_user["sub"]
    
    # Get callbacks that are due
    callbacks = await db.business_interactions.find({
        "user_id": user_id,
        "callback_date": {"$exists": True, "$ne": None},
        "callback_reminder": True
    }).sort("callback_date", 1).limit(50).to_list(50)
    
    results = []
    for cb in callbacks:
        cb.pop("_id", None)
        # Get business info
        business = await db.businesses.find_one({"id": cb["business_id"]})
        if business:
            cb["business_name"] = business.get("name")
            cb["business_phone"] = business.get("phone")
            cb["business_city"] = business.get("city")
            results.append(cb)
    
    return {
        "callbacks": results,
        "total": len(results)
    }


@api_router.delete("/crm/callbacks/{interaction_id}")
async def dismiss_callback(
    interaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Dismiss a callback reminder"""
    user_id = current_user["sub"]
    
    await db.business_interactions.update_one(
        {"id": interaction_id, "user_id": user_id},
        {"$set": {"callback_reminder": False}}
    )
    
    return {"success": True}


# ========== DUPLICATE DETECTION ==========

import re
from difflib import SequenceMatcher

def normalize_text(text: str) -> str:
    """Normalize text for comparison (lowercase, no accents, no special chars)"""
    if not text:
        return ""
    # Lowercase
    text = text.lower().strip()
    # Remove common business suffixes
    suffixes = [' sarl', ' sas', ' sa', ' eurl', ' sasu', ' snc', ' sci', ' eirl', ' auto-entrepreneur', ' ae']
    for suffix in suffixes:
        text = text.replace(suffix, '')
    # Remove special characters
    text = re.sub(r'[^\w\s]', '', text)
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def similarity_score(str1: str, str2: str) -> float:
    """Calculate similarity between two strings (0-1)"""
    if not str1 or not str2:
        return 0.0
    return SequenceMatcher(None, normalize_text(str1), normalize_text(str2)).ratio()

def normalize_phone(phone: str) -> str:
    """Normalize phone number for comparison"""
    if not phone:
        return ""
    # Keep only digits
    return re.sub(r'\D', '', phone)

def are_duplicates(b1: dict, b2: dict) -> tuple[bool, str, float]:
    """
    Check if two businesses are duplicates.
    Returns: (is_duplicate, reason, confidence)
    """
    # 1. Same SIRET = definite duplicate
    siret1 = b1.get('siret', '').strip()
    siret2 = b2.get('siret', '').strip()
    if siret1 and siret2 and siret1 == siret2:
        return (True, "siret", 1.0)
    
    # 2. Same SIREN = very likely duplicate
    siren1 = b1.get('siren', '').strip()
    siren2 = b2.get('siren', '').strip()
    if siren1 and siren2 and siren1 == siren2:
        return (True, "siren", 0.95)
    
    # 3. Same phone number = likely duplicate
    phone1 = normalize_phone(b1.get('phone', ''))
    phone2 = normalize_phone(b2.get('phone', ''))
    if phone1 and phone2 and len(phone1) >= 10 and phone1 == phone2:
        return (True, "phone", 0.9)
    
    # 4. Name + Address similarity
    name_sim = similarity_score(b1.get('name', ''), b2.get('name', ''))
    addr_sim = similarity_score(b1.get('address', ''), b2.get('address', ''))
    
    # High name similarity + high address similarity
    if name_sim > 0.85 and addr_sim > 0.8:
        return (True, "name_address", (name_sim + addr_sim) / 2)
    
    # Very high name similarity alone (same name, different scan)
    if name_sim > 0.95:
        return (True, "name", name_sim * 0.85)
    
    return (False, "", 0.0)


@api_router.get("/duplicates")
async def detect_duplicates(
    scan_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Detect potential duplicate businesses across all scans.
    Returns groups of potential duplicates.
    """
    user_id = current_user["sub"]
    
    # Build query
    query = {"user_id": user_id}
    if scan_id:
        query["scan_id"] = scan_id
    
    # Get all businesses
    businesses = await db.businesses.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "address": 1, "phone": 1, "siret": 1, "siren": 1, 
         "scan_id": 1, "city": 1, "source": 1, "status": 1, "reference": 1}
    ).to_list(5000)
    
    if len(businesses) < 2:
        return {"groups": [], "total_duplicates": 0}
    
    # Find duplicates using Union-Find algorithm
    parent = {b['id']: b['id'] for b in businesses}
    
    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]
    
    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py
    
    # Compare businesses and find duplicates
    duplicate_info = {}  # Store duplicate reason and confidence
    
    for i in range(len(businesses)):
        for j in range(i + 1, len(businesses)):
            b1, b2 = businesses[i], businesses[j]
            is_dup, reason, confidence = are_duplicates(b1, b2)
            
            if is_dup:
                union(b1['id'], b2['id'])
                key = tuple(sorted([b1['id'], b2['id']]))
                duplicate_info[key] = {"reason": reason, "confidence": confidence}
    
    # Group duplicates
    groups_dict = {}
    for b in businesses:
        root = find(b['id'])
        if root not in groups_dict:
            groups_dict[root] = []
        groups_dict[root].append(b)
    
    # Filter groups with more than 1 business
    duplicate_groups = []
    for group_id, group_businesses in groups_dict.items():
        if len(group_businesses) > 1:
            # Get the best confidence for this group
            max_confidence = 0
            reasons = set()
            for i in range(len(group_businesses)):
                for j in range(i + 1, len(group_businesses)):
                    key = tuple(sorted([group_businesses[i]['id'], group_businesses[j]['id']]))
                    if key in duplicate_info:
                        max_confidence = max(max_confidence, duplicate_info[key]["confidence"])
                        reasons.add(duplicate_info[key]["reason"])
            
            duplicate_groups.append({
                "group_id": group_id,
                "businesses": group_businesses,
                "count": len(group_businesses),
                "confidence": round(max_confidence, 2),
                "reasons": list(reasons)
            })
    
    # Sort by confidence (highest first)
    duplicate_groups.sort(key=lambda x: x["confidence"], reverse=True)
    
    return {
        "groups": duplicate_groups[:100],  # Limit to 100 groups
        "total_duplicates": sum(g["count"] for g in duplicate_groups),
        "total_groups": len(duplicate_groups)
    }


@api_router.post("/duplicates/merge")
async def merge_duplicates(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Merge duplicate businesses. Keep the 'primary' and mark others as duplicates.
    request: { "primary_id": "xxx", "duplicate_ids": ["yyy", "zzz"] }
    """
    user_id = current_user["sub"]
    primary_id = request.get("primary_id")
    duplicate_ids = request.get("duplicate_ids", [])
    
    if not primary_id or not duplicate_ids:
        raise HTTPException(status_code=400, detail="primary_id et duplicate_ids requis")
    
    # Verify ownership of primary
    primary = await db.businesses.find_one({
        "id": primary_id,
        "user_id": user_id
    })
    if not primary:
        raise HTTPException(status_code=404, detail="Entreprise principale non trouvée")
    
    # Get all duplicates
    duplicates = await db.businesses.find({
        "id": {"$in": duplicate_ids},
        "user_id": user_id
    }).to_list(len(duplicate_ids))
    
    if len(duplicates) != len(duplicate_ids):
        raise HTTPException(status_code=404, detail="Certains doublons non trouvés")
    
    # Merge data: enrich primary with data from duplicates
    merged_data = {}
    merged_sources = primary.get("data_sources", {})
    
    for dup in duplicates:
        # Add phone if missing
        if not primary.get("phone") and dup.get("phone"):
            merged_data["phone"] = dup["phone"]
            merged_sources["phone"] = dup.get("data_sources", {}).get("phone", {
                "source": dup.get("source", "merged"),
                "url": "",
                "date": datetime.utcnow().isoformat()
            })
        
        # Add email if missing
        if not primary.get("email") and dup.get("email"):
            merged_data["email"] = dup["email"]
            merged_sources["email"] = dup.get("data_sources", {}).get("email", {
                "source": "merged",
                "url": "",
                "date": datetime.utcnow().isoformat()
            })
        
        # Add website if missing
        if not primary.get("website") and dup.get("website"):
            merged_data["website"] = dup["website"]
        
        # Add siret if missing
        if not primary.get("siret") and dup.get("siret"):
            merged_data["siret"] = dup["siret"]
        
        # Add siren if missing  
        if not primary.get("siren") and dup.get("siren"):
            merged_data["siren"] = dup["siren"]
    
    # Update primary with merged data
    if merged_data or merged_sources:
        merged_data["data_sources"] = merged_sources
        merged_data["updated_at"] = datetime.utcnow()
        await db.businesses.update_one(
            {"id": primary_id},
            {"$set": merged_data}
        )
    
    # Mark duplicates as merged (soft delete)
    await db.businesses.update_many(
        {"id": {"$in": duplicate_ids}},
        {"$set": {
            "is_duplicate": True,
            "merged_into": primary_id,
            "status": "duplicate",
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {
        "success": True,
        "message": f"{len(duplicate_ids)} doublon(s) fusionné(s) avec {primary.get('name', 'entreprise principale')}",
        "primary_id": primary_id,
        "merged_count": len(duplicate_ids)
    }


@api_router.post("/duplicates/ignore")
async def ignore_duplicates(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark businesses as not duplicates (ignore the group).
    request: { "business_ids": ["xxx", "yyy"] }
    """
    user_id = current_user["sub"]
    business_ids = request.get("business_ids", [])
    
    if len(business_ids) < 2:
        raise HTTPException(status_code=400, detail="Au moins 2 business_ids requis")
    
    # Create a "not duplicate" record
    ignore_record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "business_ids": sorted(business_ids),
        "created_at": datetime.utcnow()
    }
    
    await db.duplicate_ignores.insert_one(ignore_record)
    
    return {"success": True, "message": "Groupe ignoré"}


@api_router.get("/duplicates/stats")
async def get_duplicate_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get statistics about duplicates"""
    user_id = current_user["sub"]
    
    # Count total businesses
    total = await db.businesses.count_documents({"user_id": user_id, "is_duplicate": {"$ne": True}})
    
    # Count merged duplicates
    merged = await db.businesses.count_documents({"user_id": user_id, "is_duplicate": True})
    
    # Count businesses with SIRET (easier to detect duplicates)
    with_siret = await db.businesses.count_documents({
        "user_id": user_id,
        "is_duplicate": {"$ne": True},
        "siret": {"$exists": True, "$ne": None, "$ne": ""}
    })
    
    return {
        "total_businesses": total,
        "merged_duplicates": merged,
        "with_siret": with_siret,
        "without_siret": total - with_siret
    }


# ========== API CREDITS TRACKING ==========

# NOTE: track_api_usage and check_api_budget_alerts imported from services.api_tracking
# Wrapper functions to maintain backward compatibility with global db
async def track_api_usage(user_id: str, api_type: str, endpoint: str, credits: int = 1, success: bool = True, error_msg: str = None):
    """Log API usage and check thresholds - wrapper for service"""
    await service_track_api_usage(db, user_id, api_type, endpoint, credits, success, error_msg)

async def check_api_budget_alerts(user_id: str, api_type: str):
    """Check budget thresholds - wrapper for service"""
    await service_check_api_budget_alerts(db, user_id, api_type)

@api_router.get("/api-usage/stats")
async def get_api_usage_stats(
    current_user: dict = Depends(get_current_user),
    api_type: Optional[str] = Query(None, description="Filter by API type: pappers, google, serper")
):
    """Get API usage statistics for current user"""
    user_id = current_user["sub"]
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    
    # Build query
    match_query = {"user_id": user_id, "created_at": {"$gte": month_start}}
    if api_type:
        match_query["api_type"] = api_type
    
    # Aggregation for usage by API type
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
    stats = []
    for r in results:
        api = r["_id"]
        budget = budgets.get(api, 2000)  # Default 2000 for all APIs
        used = r["total_credits"]
        stats.append({
            "api_type": api,
            "monthly_budget": budget,
            "credits_used": used,
            "credits_remaining": max(0, budget - used),
            "percentage_used": round(used / budget * 100, 1) if budget > 0 else 0,
            "total_calls": r["total_calls"],
            "successful_calls": r["successful_calls"],
            "failed_calls": r["failed_calls"]
        })
    
    # Add defaults for APIs not yet used
    used_apis = {s["api_type"] for s in stats}
    for default_api in ["pappers", "google", "serper"]:
        if default_api not in used_apis:
            budget = budgets.get(default_api, 2000)
            stats.append({
                "api_type": default_api,
                "monthly_budget": budget,
                "credits_used": 0,
                "credits_remaining": budget,
                "percentage_used": 0,
                "total_calls": 0,
                "successful_calls": 0,
                "failed_calls": 0
            })
    
    # Calculate days remaining in month
    if now.month == 12:
        next_month = datetime(now.year + 1, 1, 1)
    else:
        next_month = datetime(now.year, now.month + 1, 1)
    days_remaining = (next_month - now).days
    
    return {
        "month": now.strftime("%B %Y"),
        "days_remaining": days_remaining,
        "stats": sorted(stats, key=lambda x: x["api_type"])
    }

@api_router.get("/api-usage/history")
async def get_api_usage_history(
    current_user: dict = Depends(get_current_user),
    api_type: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=90)
):
    """Get daily API usage history"""
    user_id = current_user["sub"]
    now = datetime.utcnow()
    start_date = now - timedelta(days=days)
    
    match_query = {"user_id": user_id, "created_at": {"$gte": start_date}}
    if api_type:
        match_query["api_type"] = api_type
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "api_type": "$api_type"
            },
            "credits": {"$sum": "$credits_used"},
            "calls": {"$sum": 1}
        }},
        {"$sort": {"_id.date": 1}}
    ]
    
    results = await db.api_usage_logs.aggregate(pipeline).to_list(1000)
    
    # Format as daily data
    history = {}
    for r in results:
        date = r["_id"]["date"]
        api = r["_id"]["api_type"]
        if date not in history:
            history[date] = {"date": date, "pappers": 0, "google": 0, "serper": 0}
        history[date][api] = r["credits"]
    
    return list(history.values())

@api_router.put("/api-usage/budget")
async def update_api_budget(
    api_type: str,
    monthly_budget: int = Query(..., ge=100, le=100000),
    current_user: dict = Depends(get_current_user)
):
    """Update monthly budget for an API"""
    user_id = current_user["sub"]
    
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
    
    return {"success": True, "api_type": api_type, "monthly_budget": monthly_budget}


@api_router.get("/api-usage/check-before-scan")
async def check_credits_before_scan(
    scan_type: str = Query(..., description="Type de scan: 'pappers' ou 'internet'"),
    current_user: dict = Depends(get_current_user)
):
    """
    Vérifie si les crédits sont suffisants avant de lancer un scan.
    Retourne un avertissement si les crédits sont bas ou insuffisants.
    """
    user_id = current_user["sub"]
    
    # Estimation des crédits nécessaires par type de scan
    ESTIMATED_CREDITS = {
        "pappers": {"pappers": 50, "serper": 20, "google": 0},  # Pappers scan
        "internet": {"pappers": 0, "serper": 10, "google": 100},  # Internet scan (Google Places)
    }
    
    estimates = ESTIMATED_CREDITS.get(scan_type, {"pappers": 20, "serper": 20, "google": 20})
    
    # Get current month stats
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    
    warnings = []
    blockers = []
    
    for api_type in ["pappers", "google", "serper"]:
        # Get budget config
        config = await db.api_budget_configs.find_one({
            "user_id": user_id,
            "api_type": api_type
        })
        monthly_budget = config["monthly_budget"] if config else 2000
        
        # Get usage
        usage = await db.api_usage.aggregate([
            {"$match": {
                "user_id": user_id,
                "api_type": api_type,
                "timestamp": {"$gte": month_start}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$credits_used"}}}
        ]).to_list(length=1)
        
        credits_used = usage[0]["total"] if usage else 0
        credits_remaining = max(0, monthly_budget - credits_used)
        estimated_need = estimates.get(api_type, 0)
        
        # Check if enough credits
        if estimated_need > 0:
            if credits_remaining < estimated_need:
                blockers.append({
                    "api_type": api_type,
                    "credits_remaining": credits_remaining,
                    "estimated_need": estimated_need,
                    "message": f"Crédits {api_type.upper()} insuffisants: {credits_remaining} restants, ~{estimated_need} nécessaires"
                })
            elif credits_remaining < estimated_need * 2:
                warnings.append({
                    "api_type": api_type,
                    "credits_remaining": credits_remaining,
                    "estimated_need": estimated_need,
                    "message": f"Crédits {api_type.upper()} bas: {credits_remaining} restants"
                })
    
    can_proceed = len(blockers) == 0
    
    return {
        "can_proceed": can_proceed,
        "warnings": warnings,
        "blockers": blockers,
        "scan_type": scan_type,
        "message": "Crédits insuffisants pour lancer le scan" if not can_proceed else (
            "Attention: certains crédits sont bas" if warnings else "Crédits OK"
        )
    }


# ========== SYSTEM HEALTH DASHBOARD ==========

@api_router.get("/system/health")
async def get_system_health(current_user: dict = Depends(get_current_user)):
    """
    Get real-time health status of all external APIs.
    Tests connectivity and returns status, latency, and quota information.
    Uses services/health.py for all API checks.
    """
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id})
    
    # Get user's API keys from settings, fallback to environment variables
    settings = user.get("settings", {}) if user else {}
    google_key = settings.get("google_api_key") or os.environ.get("GOOGLE_API_KEY")
    serper_key = settings.get("serper_api_key") or os.environ.get("SERPER_API_KEY")
    pappers_key = settings.get("pappers_api_key") or os.environ.get("PAPPERS_API_KEY")
    
    # Get health status using service
    health_results = await get_full_health_status(google_key, serper_key, pappers_key)
    
    # Get error rates
    health_results["error_rates_24h"] = await get_error_rates(db, user_id)
    
    return health_results


@api_router.get("/system/health/check-alerts")
async def check_health_with_alerts(current_user: dict = Depends(get_current_user)):
    """
    Check API health and create alerts if APIs have been down for 5+ minutes.
    This endpoint can be called periodically to monitor API health.
    Sends email notifications if configured.
    """
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id})
    
    # Get user's API keys from settings, fallback to environment variables
    settings = user.get("settings", {}) if user else {}
    google_key = settings.get("google_api_key") or os.environ.get("GOOGLE_API_KEY")
    serper_key = settings.get("serper_api_key") or os.environ.get("SERPER_API_KEY")
    pappers_key = settings.get("pappers_api_key") or os.environ.get("PAPPERS_API_KEY")
    user_email = user.get("email") if user else None
    
    result = await check_and_alert_api_health(
        db, user_id, google_key, serper_key, pappers_key, user_email
    )
    
    # Add error rates
    result["health"]["error_rates_24h"] = await get_error_rates(db, user_id)
    
    return result


@api_router.get("/system/health/history")
async def get_health_alert_history(
    hours: int = Query(24, ge=1, le=168),
    current_user: dict = Depends(get_current_user)
):
    """
    Get API health alert history for the last N hours.
    Default is 24 hours, max is 168 hours (1 week).
    """
    user_id = current_user["sub"]
    history = await get_api_health_history(db, user_id, hours)
    
    return {
        "hours": hours,
        "alerts": history,
        "total_alerts": len(history)
    }


# ========== NOTIFICATION PREFERENCES ==========

@api_router.get("/user/notification-preferences")
async def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    """Get user's notification preferences"""
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id}, {"email_notifications": 1, "email": 1})
    
    # Default preferences
    default_prefs = {
        "api_alerts": True,
        "scan_complete": True,
        "weekly_summary": False,
        "surveillance_alerts": True
    }
    
    prefs = user.get("email_notifications", default_prefs) if user else default_prefs
    
    return {
        "email": user.get("email") if user else None,
        "preferences": prefs,
        "email_configured": bool(os.environ.get("RESEND_API_KEY"))
    }


@api_router.get("/user/weekly-stats")
async def get_user_weekly_stats(current_user: dict = Depends(get_current_user)):
    """Get user's weekly statistics (preview of weekly summary)"""
    user_id = current_user["sub"]
    
    stats = await compute_weekly_stats_for_user(db, user_id)
    
    return {
        "success": True,
        "stats": stats
    }


@api_router.post("/admin/send-weekly-summaries")
async def trigger_weekly_summaries(current_user: dict = Depends(get_current_admin)):
    """Admin only: Manually trigger weekly summary emails for all users"""
    results = await send_weekly_summaries(db)
    
    return {
        "success": True,
        "sent": results["sent"],
        "skipped": results["skipped"],
        "errors": results["errors"],
        "details": results["details"][:20]  # Limit details to first 20
    }


@api_router.post("/user/test-weekly-summary")
async def test_weekly_summary_email(current_user: dict = Depends(get_current_user)):
    """Send a test weekly summary email to the current user"""
    user_id = current_user["sub"]
    user = await db.users.find_one({"id": user_id})
    
    if not user or not user.get("email"):
        raise HTTPException(status_code=400, detail="Email non configuré")
    
    stats = await compute_weekly_stats_for_user(db, user_id)
    
    result = await send_weekly_summary_email(
        db=db,
        user_email=user["email"],
        user_name=user.get("name", user["email"].split("@")[0]),
        stats=stats
    )
    
    return {
        "success": result.get("status") in ["sent", "queued"],
        "status": result.get("status"),
        "message": result.get("message", "Email envoyé")
    }


@api_router.put("/user/notification-preferences")
async def update_notification_preferences(
    preferences: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update user's notification preferences"""
    user_id = current_user["sub"]
    
    # Validate preferences
    allowed_keys = {"api_alerts", "scan_complete", "weekly_summary", "surveillance_alerts"}
    filtered_prefs = {k: bool(v) for k, v in preferences.items() if k in allowed_keys}
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"email_notifications": filtered_prefs}}
    )
    
    return {
        "success": True,
        "preferences": filtered_prefs
    }



@api_router.post("/admin/fix-pappers-businesses")
async def fix_pappers_businesses(current_user: dict = Depends(get_current_user)):
    """
    Admin endpoint to fix existing Pappers businesses:
    - Set phone_source and phone_confidence for businesses with phone
    - Correct lead_type to prospect_prioritaire for businesses with phone
    """
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    results = {}
    
    # Fix 1: Set phone_source and phone_confidence for Pappers businesses with phone
    result1 = await db.businesses.update_many(
        {
            "source": "pappers",
            "phone": {"$exists": True, "$ne": None, "$ne": ""},
            "$or": [
                {"phone_source": {"$exists": False}},
                {"phone_source": None}
            ]
        },
        {
            "$set": {
                "phone_source": "Pappers",
                "phone_confidence": "basse"
            }
        }
    )
    results["phone_source_added"] = result1.modified_count
    
    # Fix 2: Correct lead_type for businesses with phone marked as visite_terrain
    result2 = await db.businesses.update_many(
        {
            "source": "pappers",
            "phone": {"$exists": True, "$ne": None, "$ne": ""},
            "lead_type": "visite_terrain"
        },
        {
            "$set": {
                "lead_type": "prospect_prioritaire"
            }
        }
    )
    results["lead_type_fixed"] = result2.modified_count
    
    # Fix 3: Also fix for any business (not just pappers) that has phone but visite_terrain
    result3 = await db.businesses.update_many(
        {
            "phone": {"$exists": True, "$ne": None, "$ne": ""},
            "lead_type": "visite_terrain",
            "phone_unreachable": {"$ne": True}  # Don't change if explicitly marked unreachable
        },
        {
            "$set": {
                "lead_type": "prospect_prioritaire"
            }
        }
    )
    results["all_lead_type_fixed"] = result3.modified_count
    
    # Fix 4: Add libelle_naf using our mapping for businesses with activite_naf
    from services.pappers_scan import NAF_LABELS
    
    # Find all businesses with NAF code
    all_businesses_with_naf = await db.businesses.find({
        "activite_naf": {"$exists": True, "$ne": None, "$ne": ""}
    }).to_list(length=2000)
    
    libelle_count = 0
    for business in all_businesses_with_naf:
        naf_code = business.get("activite_naf")
        current_libelle = business.get("libelle_naf")
        # Only update if no label or label is empty/null
        if naf_code and naf_code in NAF_LABELS and (not current_libelle or current_libelle == ""):
            await db.businesses.update_one(
                {"_id": business["_id"]},
                {"$set": {"libelle_naf": NAF_LABELS[naf_code]}}
            )
            libelle_count += 1
    
    results["libelle_naf_added"] = libelle_count
    
    return {
        "success": True,
        "results": results
    }


# Include routers
api_router.include_router(auth_router.router)
api_router.include_router(auth_router.user_router)
api_router.include_router(stats_router.router)
# NOTE: businesses_router désactivé - les endpoints server.py sont plus complets (shared_history, view_count, etc.)
# api_router.include_router(businesses_router.router)

# Include main router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
