"""
Utility Functions / Helpers

Ce module contient les fonctions utilitaires communes utilisées
dans tout le backend de PROSPECTLOCAL V2.
"""
import re
from datetime import datetime
from typing import Optional, List

# Common Patterns
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
PHONE_PATTERN_FR = re.compile(r'(?:(?:\+33|0033|0)[1-9])(?:[\s.-]?\d{2}){4}')


def normalize_phone(phone: str) -> str:
    """
    Normalize phone number for matching.
    Keeps last 9 digits (French format without leading 0).
    
    Args:
        phone: Raw phone number string
        
    Returns:
        Normalized 9-digit string or empty string
    """
    if not phone:
        return ""
    # Remove all non-digit characters
    digits = re.sub(r'\D', '', phone)
    # Keep last 9 digits (French format)
    return digits[-9:] if len(digits) >= 9 else digits


def normalize_french_phone_full(phone: str) -> Optional[str]:
    """
    Normalize a French phone number to 10 digits starting with 0.
    
    Args:
        phone: Raw phone number
        
    Returns:
        10-digit normalized phone or None if invalid
    """
    if not phone:
        return None
    
    # Keep only digits
    phone = re.sub(r'\D', '', phone)
    
    # Convert +33 or 0033 to 0
    if phone.startswith('33') and len(phone) == 11:
        phone = '0' + phone[2:]
    elif phone.startswith('0033'):
        phone = '0' + phone[4:]
    
    # Validate format
    if len(phone) == 10 and phone.startswith('0'):
        return phone
    
    return None


def generate_data_sources(
    source_type: str,  # "google", "pappers", "web", "sirene"
    fields: dict,  # {"name": value, "phone": value, ...}
    google_place_id: str = None,
    pappers_siren: str = None,
    website_url: str = None
) -> dict:
    """
    Generate data_sources dict tracking origin of each field.
    
    Format: {"field_name": {"source": "...", "source_name": "...", "url": "...", "date": "..."}}
    
    Args:
        source_type: Type of source (google, pappers, web, sirene, enrichment)
        fields: Dict of field names and their values
        google_place_id: Google Place ID for URL generation
        pappers_siren: SIREN for Pappers URL
        website_url: Website URL
        
    Returns:
        Dict mapping field names to their source metadata
    """
    now = datetime.utcnow().isoformat()
    
    # Source configurations with verification URLs
    source_configs = {
        "google": {
            "source_name": "Google Places",
            "url_template": f"https://www.google.com/maps/search/?api=1&query_place_id={google_place_id}" if google_place_id else None,
            "icon": "logo-google"
        },
        "pappers": {
            "source_name": "Pappers.fr",
            "url_template": f"https://www.pappers.fr/entreprise/{pappers_siren}" if pappers_siren else "https://www.pappers.fr",
            "icon": "document-text"
        },
        "web": {
            "source_name": "Site web",
            "url_template": website_url,
            "icon": "globe"
        },
        "sirene": {
            "source_name": "INSEE SIRENE",
            "url_template": f"https://annuaire-entreprises.data.gouv.fr/entreprise/{pappers_siren}" if pappers_siren else "https://annuaire-entreprises.data.gouv.fr",
            "icon": "business"
        },
        "enrichment": {
            "source_name": "Enrichissement web",
            "url_template": website_url,
            "icon": "sparkles"
        }
    }
    
    config = source_configs.get(source_type, source_configs["google"])
    
    data_sources = {}
    for field_name, field_value in fields.items():
        if field_value:  # Only track non-empty fields
            data_sources[field_name] = {
                "source": source_type,
                "source_name": config["source_name"],
                "url": config["url_template"],
                "icon": config["icon"],
                "date": now
            }
    
    return data_sources


def merge_data_sources(existing: dict, new_sources: dict) -> dict:
    """
    Merge new data sources with existing ones (new overwrites existing).
    
    Args:
        existing: Existing data sources dict
        new_sources: New data sources to merge
        
    Returns:
        Merged data sources dict
    """
    merged = existing.copy() if existing else {}
    merged.update(new_sources)
    return merged


def calculate_score(business_data: dict) -> tuple[int, str]:
    """
    Calculate priority score (0-100) for a business.
    Higher score = higher priority prospect.
    
    Scoring logic:
    - BONUS: Absent from PagesJaunes (+30), SIRET verified (+10), 
             New Pappers creation with phone (+20), Low Google reviews (+15)
    - MALUS: Present on PagesJaunes (-35), High Google reviews (-15/-10)
    
    Args:
        business_data: Dict with business information
        
    Returns:
        Tuple of (score, reason_string)
    """
    score = 50  # Base score
    reasons = []
    
    has_google = business_data.get("has_google", True)
    has_pagesjaunes = business_data.get("has_pagesjaunes", False)
    has_website = business_data.get("has_website", False)
    has_phone = bool(business_data.get("phone"))
    has_siret = bool(business_data.get("siret"))
    reviews_count = business_data.get("google_reviews_count", 0)
    source = business_data.get("source", "google")
    
    # ========= BONUS (increases score) =========
    
    # +30 if ABSENT from PagesJaunes (main target!)
    if not has_pagesjaunes:
        score += 30
        reasons.append("🔴 ABSENT de PagesJaunes (+30)")
    
    # +10 if SIRET detected (verified official business)
    if has_siret:
        score += 10
        reasons.append("✅ SIRET vérifié (+10)")
    
    # +20 if new Pappers creation with phone
    if source == "pappers" and has_phone:
        score += 20
        reasons.append("🆕 Nouvelle création contactable (+20)")
    
    # +15 if low Google presence (< 5 reviews)
    if has_google and reviews_count < 5:
        score += 15
        reasons.append(f"Faible visibilité Google ({reviews_count} avis, +15)")
    
    # +10 if Google presence but few reviews (5-10)
    elif has_google and reviews_count < 10:
        score += 10
        reasons.append(f"Visibilité Google moyenne ({reviews_count} avis, +10)")
    
    # +10 if has website but not on PJ
    if has_website and not has_pagesjaunes:
        score += 10
        reasons.append("Site web mais absent PJ (+10)")
    
    # ========= MALUS (decreases score) =========
    
    # -35 if PRESENT on PagesJaunes (less interesting prospect)
    if has_pagesjaunes:
        score -= 35
        reasons.append("🟢 PRÉSENT sur PagesJaunes (-35)")
    
    # -15 if good Google visibility (> 20 reviews)
    if has_google and reviews_count > 20:
        score -= 15
        reasons.append(f"Bonne visibilité Google ({reviews_count} avis, -15)")
    
    # -10 additional if very good visibility (> 50 reviews)
    if has_google and reviews_count > 50:
        score -= 10
        reasons.append(f"Très bonne visibilité ({reviews_count} avis, -10)")
    
    # Clamp score between 0 and 100
    score = max(0, min(100, score))
    score_reason = " | ".join(reasons) if reasons else "Score standard"
    
    return score, score_reason


def normalize_name_for_matching(name: str) -> str:
    """
    Normalize a company name for matching/comparison.
    
    Removes common suffixes (SARL, SAS, etc.), special characters,
    and converts to lowercase.
    
    Args:
        name: Company name
        
    Returns:
        Normalized name string
    """
    if not name:
        return ""
    
    # Lowercase and strip
    name = name.lower().strip()
    
    # Remove common legal forms
    legal_forms = [
        "sarl", "sas", "sa", "sasu", "eurl", "eirl", "sci", "scp",
        "snc", "auto-entrepreneur", "autoentrepreneur", "ae",
        "entreprise individuelle", "ei"
    ]
    for form in legal_forms:
        name = re.sub(rf'\b{form}\b', '', name)
    
    # Remove special characters
    name = re.sub(r'[^\w\s]', '', name)
    
    # Normalize whitespace
    name = ' '.join(name.split())
    
    return name


def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calculate similarity between two company names using Jaccard coefficient.
    
    Args:
        name1: First company name
        name2: Second company name
        
    Returns:
        Similarity score between 0 and 1
    """
    if not name1 or not name2:
        return 0.0
    
    # Normalize names
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()
    
    # Remove special characters
    n1 = re.sub(r'[^\w\s]', '', n1)
    n2 = re.sub(r'[^\w\s]', '', n2)
    
    # Split into words
    words1 = set(n1.split())
    words2 = set(n2.split())
    
    # Remove common stop words
    stop_words = {'sarl', 'sas', 'sa', 'eurl', 'sasu', 'et', 'le', 'la', 'les', 'de', 'du', 'des', 'cie', 'fils'}
    words1 = words1 - stop_words
    words2 = words2 - stop_words
    
    if not words1 or not words2:
        return 0.0
    
    # Jaccard coefficient
    intersection = len(words1 & words2)
    union = len(words1 | words2)
    jaccard = intersection / union if union else 0.0
    
    # Bonus if first word matches
    first1 = n1.split()[0] if n1.split() else ""
    first2 = n2.split()[0] if n2.split() else ""
    bonus = 0.2 if first1 == first2 else 0.0
    
    return min(jaccard + bonus, 1.0)


def extract_emails_from_text(text: str) -> List[str]:
    """
    Extract email addresses from text, filtering out false positives.
    
    Args:
        text: Text to search
        
    Returns:
        List of found email addresses
    """
    if not text:
        return []
    
    # Email regex pattern
    pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    emails = re.findall(pattern, text.lower())
    
    # Filter out common false positives and generic emails
    invalid_patterns = [
        'example.com', 'test.com', 'domain.com', 'email.com',
        'noreply', 'no-reply', 'mailer-daemon', 'postmaster',
        'wixpress.com', 'wordpress.com', 'squarespace.com',
        '.png', '.jpg', '.gif', '.css', '.js'
    ]
    
    valid_emails = []
    for email in emails:
        is_valid = True
        for invalid in invalid_patterns:
            if invalid in email:
                is_valid = False
                break
        if is_valid and len(email) < 100:  # Avoid long false positives
            valid_emails.append(email)
    
    return list(set(valid_emails))


def extract_phones_from_text(text: str) -> List[str]:
    """
    Extract French phone numbers from text, filtering out premium numbers.
    
    Args:
        text: Text to search
        
    Returns:
        List of normalized phone numbers
    """
    if not text:
        return []
    
    phones = []
    
    # French phone patterns
    patterns = [
        r'(?:0[1-9])(?:[\s.-]?\d{2}){4}',  # 01 23 45 67 89
        r'(?:\+33|0033)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}',  # +33 1 23 45 67 89
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            normalized = normalize_french_phone_full(match)
            if normalized:
                # Exclude premium numbers (08xx)
                if not normalized.startswith('08'):
                    phones.append(normalized)
    
    return list(set(phones))


# Activity to NAF code mapping for Pappers searches
ACTIVITY_NAF_MAPPING = {
    "plombier": ["43.22A", "43.22B"],
    "électricien": ["43.21A", "43.21B"],
    "couvreur": ["43.91A", "43.91B"],
    "chauffagiste": ["43.22A", "43.22B"],
    "menuisier": ["43.32A", "43.32B"],
    "peintre": ["43.34Z"],
    "maçon": ["43.99A", "43.99B", "41.20A"],
    "carreleur": ["43.33Z"],
    "serrurier": ["43.32A"],
    "vitrier": ["43.34Z"],
    "climatisation": ["43.22A"],
    "isolation": ["43.29A", "43.29B"],
    "toiture": ["43.91A", "43.91B"],
    "restaurant": ["56.10A", "56.10B", "56.10C"],
    "boulangerie": ["10.71A", "10.71B", "10.71C"],
    "coiffeur": ["96.02A", "96.02B"],
    "garage": ["45.20A", "45.20B"],
    "auto-école": ["85.53Z"],
}
