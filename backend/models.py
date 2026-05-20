from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid

class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"

class ScanStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"

class ActivityFamily(str, Enum):
    HABITAT = "Habitat"
    RESTAURATION = "Restauration"
    BEAUTE = "Beauté"
    AUTO = "Auto"
    B2B = "B2B"
    COMMERCE = "Commerce"
    SANTE = "Santé"
    AUTRE = "Autre"

# ========== LEAD STATUS ENUMS (Mini-CRM) ==========
class ContactStatusManual(str, Enum):
    NOT_CONTACTED = "not_contacted"
    CONTACTED = "contacted"

class ClientStatus(str, Enum):
    NOT_CLIENT = "not_client"
    CLIENT = "client"

class InterestStatus(str, Enum):
    """Statut d'intérêt du prospect"""
    UNKNOWN = "unknown"          # Pas encore qualifié
    INTERESTED = "interested"    # Intéressé
    NOT_INTERESTED = "not_interested"  # Non intéressé

class CRMStatus(str, Enum):
    """Statut de présence dans le CRM externe"""
    NOT_IN_CRM = "not_in_crm"    # Pas encore dans le CRM
    IN_CRM = "in_crm"            # Déjà présent dans le CRM

class SalesStatus(str, Enum):
    """Statut commercial du prospect (pipeline de vente)"""
    NEW = "new"                    # Nouveau lead, pas encore traité
    TO_CALL = "to_call"           # À appeler
    CALLED = "called"             # Appelé (en attente de suite)
    CALLBACK = "callback"         # Rappeler plus tard
    MEETING_SCHEDULED = "meeting_scheduled"  # RDV programmé
    MEETING_DONE = "meeting_done" # RDV effectué
    PROPOSAL_SENT = "proposal_sent"  # Devis/Proposition envoyé
    WON = "won"                   # Gagné (client)
    LOST = "lost"                 # Perdu (refus)
    NOT_INTERESTED = "not_interested"  # Non intéressé

class InteractionType(str, Enum):
    """Type d'interaction avec un prospect"""
    CALL_OUTBOUND = "call_outbound"    # Appel sortant
    CALL_INBOUND = "call_inbound"      # Appel entrant
    EMAIL_SENT = "email_sent"          # Email envoyé
    EMAIL_RECEIVED = "email_received"  # Email reçu
    MEETING = "meeting"                # Réunion/RDV
    NOTE = "note"                      # Note simple
    STATUS_CHANGE = "status_change"    # Changement de statut

class ExploitabilityStatus(str, Enum):
    """Statut d'exploitabilité de l'établissement"""
    EXPLOITABLE = "exploitable"        # Exploitable (défaut)
    INEXPLOITABLE = "inexploitable"    # Inexploitable définitivement (radié, fermé, etc.)

# ========== ACTIVITY ==========
class Activity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    family: ActivityFamily
    synonyms: List[str] = []
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ActivityCreate(BaseModel):
    label: str
    family: ActivityFamily
    synonyms: List[str] = []

# ========== USER ==========
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password_hash: str
    role: Role = Role.USER
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: Role = Role.USER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

# ========== SCAN ==========
class Scan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    activity_id: str
    query_label: str
    location_label: str
    radius_km: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: ScanStatus = ScanStatus.PENDING
    total_results: int = 0
    is_favorite: bool = False
    last_scanned_at: Optional[datetime] = None
    # Progress tracking
    progress: int = 0  # 0-100%
    progress_message: str = ""  # Current step description
    progress_step: int = 0  # Current step number
    progress_total_steps: int = 0  # Total steps
    # New fields for re-scan comparison
    previous_business_ids: List[str] = []  # IDs from previous scan
    new_businesses_count: int = 0  # Count of new businesses since last scan

class ScanCreate(BaseModel):
    activity_id: Optional[str] = None
    location_label: str
    radius_km: int = 10
    # Multi-city support
    search_mode: str = "radius"  # "radius" or "multi"
    additional_cities: List[str] = []  # List of additional city names for multi-city search
    # Domain scan support
    activity_mode: str = "single"  # "single" or "domain"
    domains: List[str] = []  # List of domain names for domain scan

# ========== BUSINESS ==========
class Business(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pl_reference: Optional[str] = None  # Unique Prospect Local reference (PL0001, PL0002, etc.)
    scan_id: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    website_url: Optional[str] = None
    google_place_id: Optional[str] = None
    google_rating: Optional[float] = None
    google_reviews_count: Optional[int] = 0
    pagesjaunes_url: Optional[str] = None
    match_confidence: float = 0.0
    has_google: bool = True
    has_pagesjaunes: bool = False
    has_website: bool = False
    score: int = 0
    score_reason: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Detection fields
    is_new_business: bool = False  # Less than 3 months old based on reviews
    is_new_in_scan: bool = False  # New since last scan of same query
    siret: Optional[str] = None
    siren: Optional[str] = None
    pj_confidence: str = "unknown"  # "confirmed", "not_found", "to_verify", "unknown"
    pj_manually_set: bool = False  # True if PJ status was manually set by user
    pj_manual_status: Optional[bool] = None  # Manual override: True=present, False=absent, None=auto
    source_detection: str = "GOOGLE"  # "GOOGLE", "WEB", "SOCIAL", "PLATFORM", "MIXED"
    contact_status: str = "UNKNOWN"  # "DIRECT", "INDIRECT", "MANUAL_REQUIRED"
    first_detected_at: Optional[datetime] = None
    last_detected_at: Optional[datetime] = None
    
    # Shared history tracking
    first_detected_by: Optional[str] = None  # user_id of first detector
    detected_by_users: list = Field(default_factory=list)  # List of user_ids who detected this
    detection_count: int = 1  # How many times detected across all scans
    
    # Pappers integration fields
    source: str = "google"  # "google", "pappers"
    date_creation: Optional[str] = None  # Date de création de l'entreprise (Pappers)
    activite_naf: Optional[str] = None  # Code NAF (Pappers) - ex: "4322A"
    libelle_naf: Optional[str] = None  # Libellé NAF (Pappers) - ex: "Travaux d'installation d'eau et de gaz"
    lead_type: str = "standard"  # "standard", "visite_terrain", "prospect_prioritaire"
    pappers_url: Optional[str] = None  # URL vers la fiche Pappers
    
    # Phone source tracking
    phone_source: Optional[str] = None  # "Pappers", "Google", "Site web", "Manuel"
    phone_confidence: Optional[str] = None  # "haute", "moyenne", "basse", "non_verifiée"
    
    # Linked businesses (for deduplication)
    linked_business_ids: list = Field(default_factory=list)  # IDs of businesses with same phone
    
    # Exploitability status
    is_inexploitable: bool = False  # Marked as permanently unusable
    inexploitable_reason: Optional[str] = None  # Reason: "radié", "fermé", "doublon", etc.
    inexploitable_at: Optional[datetime] = None
    inexploitable_by: Optional[str] = None  # User email who marked it
    
    # SIRENE administrative status
    etat_administratif: Optional[str] = None  # "A" = Active, "F" = Fermé/Radié
    
    # Data sources tracking - stores origin of each field
    # Format: {"field_name": {"source": "google|pappers|web|sirene", "url": "link_to_verify", "date": "2024-01-01"}}
    data_sources: dict = Field(default_factory=dict)


class ManualVisiteCreate(BaseModel):
    """
    Minimal payload for a manually created field-visit record.

    The goal is to let sales users add a prospect spotted outside the automatic
    scans while keeping it in the same visits workflow, map and route planner.
    """
    name: str
    address: str
    city: str
    postal_code: str
    phone: Optional[str] = None
    siret: Optional[str] = None
    siren: Optional[str] = None
    date_creation: Optional[str] = None
    activite_naf: Optional[str] = None
    libelle_naf: Optional[str] = None
    note: Optional[str] = None

# ========== USER BUSINESS STATUS (Mini-CRM - per user per business) ==========
class UserBusinessStatus(BaseModel):
    """
    Stores user-specific status for each business.
    This is separate from Business to preserve data across re-scans.
    Key: (user_id, business_id) or (user_id, google_place_id)
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    business_id: str
    google_place_id: Optional[str] = None  # For matching across scans
    
    # View tracking
    is_viewed: bool = False
    last_viewed_at: Optional[datetime] = None
    view_count: int = 0
    
    # Contact status
    contact_status_manual: ContactStatusManual = ContactStatusManual.NOT_CONTACTED
    contacted_at: Optional[datetime] = None
    
    # Client status
    client_status: ClientStatus = ClientStatus.NOT_CLIENT
    client_since: Optional[datetime] = None
    
    # Interest status (NEW)
    interest_status: InterestStatus = InterestStatus.UNKNOWN
    interest_updated_at: Optional[datetime] = None
    
    # CRM status (NEW)
    crm_status: CRMStatus = CRMStatus.NOT_IN_CRM
    crm_updated_at: Optional[datetime] = None
    
    # Visite terrain status
    visite_status: Optional[str] = None  # non_visite, visite, a_revisiter, interesse, pas_interesse, client
    visite_updated_at: Optional[datetime] = None
    
    # Notes
    note: Optional[str] = None
    note_updated_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# ========== SHARED BUSINESS HISTORY (Actions partagées entre utilisateurs) ==========
class SharedBusinessHistory(BaseModel):
    """
    Tracks ALL actions on a business across ALL users.
    This is the shared history visible to everyone.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pl_reference: str  # The PL reference this history belongs to
    business_id: str   # The business ID
    
    # First detection info
    first_detected_at: datetime = Field(default_factory=datetime.utcnow)
    first_detected_by_user_id: str
    first_detected_by_email: str
    first_detected_in_scan_id: str
    
    # Detection tracking
    detection_events: List[dict] = Field(default_factory=list)
    # Format: [{"user_id": str, "email": str, "scan_id": str, "detected_at": datetime}]
    
    # Consultation tracking
    total_views: int = 0
    view_events: List[dict] = Field(default_factory=list)
    # Format: [{"user_id": str, "email": str, "viewed_at": datetime}]
    last_viewed_at: Optional[datetime] = None
    last_viewed_by_email: Optional[str] = None
    
    # Shared status (visible to all users)
    is_contacted: bool = False
    contacted_at: Optional[datetime] = None
    contacted_by_email: Optional[str] = None
    
    is_client: bool = False
    client_since: Optional[datetime] = None
    marked_client_by_email: Optional[str] = None
    
    is_not_interested: bool = False
    not_interested_at: Optional[datetime] = None
    not_interested_by_email: Optional[str] = None
    
    is_in_crm: bool = False
    in_crm_at: Optional[datetime] = None
    in_crm_by_email: Optional[str] = None
    
    # Shared notes (visible to all)
    shared_notes: List[dict] = Field(default_factory=list)
    # Format: [{"user_email": str, "note": str, "created_at": datetime}]
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserBusinessStatusUpdate(BaseModel):
    """For updating user business status"""
    contact_status_manual: Optional[ContactStatusManual] = None
    client_status: Optional[ClientStatus] = None
    note: Optional[str] = None

# ========== BUSINESS INTERACTIONS (Historique d'appels/notes) ==========
class BusinessInteraction(BaseModel):
    """
    Historique des interactions avec une entreprise.
    Chaque appel, email, note, changement de statut est enregistré.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    business_id: str
    pl_reference: Optional[str] = None
    
    # Type d'interaction
    interaction_type: InteractionType
    
    # Détails de l'interaction
    title: Optional[str] = None  # Ex: "Appel de prospection"
    content: Optional[str] = None  # Notes détaillées
    
    # Pour les appels
    call_duration: Optional[int] = None  # Durée en secondes
    call_outcome: Optional[str] = None  # "answered", "no_answer", "busy", "voicemail"
    
    # Pour les changements de statut
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    
    # Rappel programmé
    callback_date: Optional[datetime] = None
    callback_reminder: bool = False
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BusinessInteractionCreate(BaseModel):
    """For creating a new interaction"""
    business_id: str
    interaction_type: InteractionType
    title: Optional[str] = None
    content: Optional[str] = None
    call_duration: Optional[int] = None
    call_outcome: Optional[str] = None
    callback_date: Optional[str] = None  # ISO date string

class SalesStatusUpdate(BaseModel):
    """For updating sales status"""
    business_id: str
    sales_status: SalesStatus
    note: Optional[str] = None

# ========== NOTIFICATIONS ==========
class NotificationType(str, Enum):
    NEW_BUSINESSES = "new_businesses"
    SCAN_COMPLETE = "scan_complete"
    VISITE_TERRAIN = "visite_terrain"
    RESCAN_NEW = "rescan_new"
    SYSTEM = "system"

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: NotificationType
    title: str
    message: str
    scan_id: Optional[str] = None
    new_business_ids: List[str] = []
    data: Optional[dict] = None
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PagesJaunesUpdate(BaseModel):
    """For manual PagesJaunes status update"""
    has_pagesjaunes: bool
    pagesjaunes_url: Optional[str] = None

# ========== ZONE SURVEILLANCE (Alertes automatiques) ==========
class ZoneSurveillance(BaseModel):
    """Model for zone surveillance / automatic alerts"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str  # Name of the surveillance (e.g., "Plombiers Lille")
    
    # Geographic mode: "radius" or "cities"
    geo_mode: str = "radius"  # "radius" = city + radius_km, "cities" = specific cities list
    
    # For "radius" mode
    city: Optional[str] = None  # Main city
    postal_code: Optional[str] = None
    radius_km: int = 20  # Radius in km
    
    # For "cities" mode - list of specific cities
    cities: List[str] = []  # e.g., ["Lille", "Roubaix", "Tourcoing"]
    
    # Activity filters - list of domain codes
    domains: List[str] = []  # e.g., ["habitat", "restauration"]
    
    # Date filter - maximum age of companies in days
    max_age_days: int = 30  # Only companies created within this many days (7, 14, 30, 90, 180)
    
    # Frequency: "daily" (1x/day at 8h), "twice" (2x/day at 7h and 14h), "weekly" (1x/week on Monday)
    frequency: str = "daily"  # "daily", "twice", "weekly"
    
    # Status
    is_active: bool = True
    last_scan_at: Optional[datetime] = None
    total_alerts: int = 0
    
    # Notification preferences
    notify_email: bool = False
    notify_app: bool = True
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ZoneSurveillanceAlert(BaseModel):
    """Alert generated by zone surveillance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    surveillance_id: str
    user_id: str
    business_id: str
    business_name: str
    business_city: str
    domain: str
    
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)



# ========== API CREDITS TRACKING ==========
class APIType(str, Enum):
    """Types d'API trackées"""
    PAPPERS = "pappers"
    GOOGLE = "google"
    SERPER = "serper"

class APIUsageLog(BaseModel):
    """Log d'utilisation d'une API"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    api_type: APIType
    endpoint: str  # Ex: "recherche", "entreprise", "suggestions"
    credits_used: int = 1
    success: bool = True
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class APIBudgetConfig(BaseModel):
    """Configuration du budget API pour un utilisateur"""
    user_id: str
    api_type: APIType
    monthly_budget: int = 2000  # Crédits max par mois
    alert_threshold_80: bool = True  # Alerte à 80%
    alert_threshold_90: bool = True  # Alerte à 90%
    alert_threshold_100: bool = True  # Alerte à 100%
    updated_at: datetime = Field(default_factory=datetime.utcnow)
