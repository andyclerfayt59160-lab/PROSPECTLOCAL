"""
Pappers Scan Service
Handles Pappers API searches and business data processing
"""
import re
import httpx
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import logging
import uuid

logger = logging.getLogger(__name__)

# Domain to NAF codes mapping
DOMAIN_NAF_CODES = {
    "PLOMBERIE": ["4322A", "4322B"],
    "ELECTRICITE": ["4321A", "4321B"],
    "CHAUFFAGE": ["4322A", "4322B", "4329A"],
    "CLIMATISATION": ["4322A", "4322B", "4329A"],
    "MENUISERIE": ["4332A", "4332B", "4332C"],
    "SERRURERIE": ["4332A", "8010Z"],
    "MACONNERIE": ["4399A", "4399B", "4399C"],
    "PEINTURE": ["4334Z"],
    "CARRELAGE": ["4333Z"],
    "COUVERTURE": ["4391A", "4391B"],
    "RENOVATION": ["4120A", "4120B", "4399D"],
    "JARDINIER": ["8130Z"],
    "DEMENAGEMENT": ["4942Z"],
    "NETTOYAGE": ["8121Z", "8122Z", "8129A", "8129B"],
    "RESTAURANT": ["5610A", "5610B", "5610C"],
    "BOULANGERIE": ["1071A", "1071B", "1071C", "1071D"],
    "COIFFEUR": ["9602A", "9602B"],
    "BEAUTE": ["9604Z"],
    "GARAGE": ["4520A", "4520B"],
    "IMMOBILIER": ["6831Z", "6832A", "6832B"],
    "COMPTABLE": ["6920Z"],
    "AVOCAT": ["6910Z"],
    "ARCHITECTE": ["7111Z"],
    "INFORMATIQUE": ["6201Z", "6202A", "6202B", "6203Z", "6209Z"],
    "AUTRE": [],
    # Domaines génériques du frontend
    "HABITAT": ["4322A", "4322B", "4321A", "4321B", "4332A", "4332B", "4333Z", "4334Z", "4391A", "4391B", "4399A", "4399B", "4120A", "4120B"],
    "COMMERCE": ["4711A", "4711B", "4711C", "4711D", "4711E", "4711F", "4719A", "4719B", "4721Z", "4722Z", "4723Z", "4724Z", "4725Z", "4726Z"],
    "RESTAURATION": ["5610A", "5610B", "5610C", "5621Z", "5629A", "5629B", "5630Z"],
    "AUTO": ["4511Z", "4519Z", "4520A", "4520B", "4531Z", "4532Z", "4540Z"],
    "SANTE": ["8610Z", "8621Z", "8622A", "8622B", "8622C", "8623Z", "8690A", "8690B", "8690C", "8690D", "8690E", "8690F"],
    "SERVICES": ["6910Z", "6920Z", "7010Z", "7021Z", "7022Z", "7111Z", "7112A", "7112B", "7120A", "7120B", "7311Z", "7312Z"],
    "TECH": ["6201Z", "6202A", "6202B", "6203Z", "6209Z", "6311Z", "6312Z"],
}

# Mapping code NAF -> libellé complet
NAF_LABELS = {
    # Habitat
    "4120A": "Construction de maisons individuelles",
    "4120B": "Construction de bâtiments",
    "4321A": "Installation électrique",
    "4321B": "Travaux d'installation électrique",
    "4322A": "Plomberie, chauffage",
    "4322B": "Travaux de plomberie et chauffage",
    "4329A": "Installation climatisation",
    "4332A": "Menuiserie bois",
    "4332B": "Menuiserie métallique",
    "4332C": "Agencement de lieux de vente",
    "4333Z": "Travaux de revêtement sols et murs",
    "4334Z": "Peinture et vitrerie",
    "4391A": "Couverture",
    "4391B": "Travaux de charpente",
    "4399A": "Travaux d'étanchéification",
    "4399B": "Travaux de montage structures",
    "4399C": "Travaux de maçonnerie générale",
    "4399D": "Autres travaux de finition",
    # Commerce
    "4711A": "Hypermarchés",
    "4711B": "Supermarchés",
    "4711C": "Supérettes",
    "4711D": "Alimentation générale",
    "4711E": "Magasins multi-commerces",
    "4711F": "Vente alimentaire plein air",
    "4719A": "Grands magasins",
    "4719B": "Autres commerces non spécialisés",
    "4721Z": "Fruits et légumes",
    "4722Z": "Viandes et charcuterie",
    "4723Z": "Poissons et crustacés",
    "4724Z": "Pain et pâtisserie",
    "4725Z": "Boissons",
    "4726Z": "Tabac",
    # Restauration
    "5610A": "Restauration traditionnelle",
    "5610B": "Cafétérias et self-services",
    "5610C": "Restauration rapide",
    "5621Z": "Traiteurs",
    "5629A": "Cantines, restaurants d'entreprises",
    "5629B": "Autres services restauration",
    "5630Z": "Débits de boissons",
    # Auto
    "4511Z": "Commerce automobile",
    "4519Z": "Commerce autres véhicules",
    "4520A": "Entretien et réparation auto",
    "4520B": "Entretien et réparation autre véhicules",
    "4531Z": "Commerce équipements auto",
    "4532Z": "Commerce pièces détachées",
    "4540Z": "Commerce motos",
    # Santé
    "8610Z": "Activités hospitalières",
    "8621Z": "Médecine générale",
    "8622A": "Activités de radiodiagnostic",
    "8622B": "Activités chirurgicales",
    "8622C": "Autres soins",
    "8623Z": "Dentaire",
    "8690A": "Ambulances",
    "8690B": "Laboratoires d'analyses",
    "8690C": "Centres de collecte",
    "8690D": "Activités des infirmiers",
    "8690E": "Activités des orthophonistes",
    "8690F": "Kinésithérapie",
    # Services
    "6910Z": "Activités juridiques",
    "6920Z": "Comptabilité et audit",
    "7010Z": "Sièges sociaux",
    "7021Z": "Conseil relations publiques",
    "7022Z": "Conseil gestion",
    "7111Z": "Architecture",
    "7112A": "Ingénierie",
    "7112B": "Ingénierie et études techniques",
    "7120A": "Contrôle technique",
    "7120B": "Analyses et contrôles",
    "7311Z": "Agences de publicité",
    "7312Z": "Régies publicitaires",
    # Tech
    "6201Z": "Programmation informatique",
    "6202A": "Conseil en systèmes et logiciels",
    "6202B": "Tierce maintenance de systèmes",
    "6203Z": "Gestion d'installations informatiques",
    "6209Z": "Autres activités informatiques",
    "6311Z": "Traitement de données, hébergement",
    "6312Z": "Portails Internet",
    # Beauté
    "9602A": "Coiffure",
    "9602B": "Soins de beauté",
    "9604Z": "Entretien corporel",
    # Autres
    "8010Z": "Sécurité privée",
    "8121Z": "Nettoyage courant des bâtiments",
    "8122Z": "Autres activités de nettoyage",
    "8129A": "Désinfection, désinsectisation",
    "8129B": "Autres activités de nettoyage",
    "8130Z": "Services d'aménagement paysager",
    "4942Z": "Déménagement",
    "6831Z": "Agences immobilières",
    "6832A": "Administration d'immeubles",
    "6832B": "Supports juridiques de programmes",
    "1071A": "Fabrication de pain",
    "1071B": "Pâtisserie fraîche",
    "1071C": "Boulangerie-pâtisserie",
    "1071D": "Cuisson de produits de boulangerie",
}

def get_naf_label(naf_code: str) -> str:
    """Get the label for a NAF code"""
    return NAF_LABELS.get(naf_code, "")


def get_naf_codes_for_domains(domains: List[str]) -> List[str]:
    """
    Get NAF codes for selected domains.
    
    Args:
        domains: List of domain names (e.g., ["PLOMBERIE", "ELECTRICITE"])
        
    Returns:
        List of unique NAF codes
    """
    naf_codes = []
    
    if "ALL" in domains or "all" in domains:
        for codes in DOMAIN_NAF_CODES.values():
            naf_codes.extend(codes)
    else:
        for domain in domains:
            domain_upper = domain.upper()
            if domain_upper in DOMAIN_NAF_CODES:
                naf_codes.extend(DOMAIN_NAF_CODES[domain_upper])
    
    return list(set(naf_codes))


async def get_postal_codes_for_radius(
    city_name: str,
    radius_km: int,
    get_cities_in_radius_func
) -> Tuple[List[str], str]:
    """
    Get postal codes for cities within a radius.
    
    Args:
        city_name: Name of the center city
        radius_km: Radius in kilometers
        get_cities_in_radius_func: Function to get cities in radius
        
    Returns:
        Tuple of (postal_codes, location_label)
    """
    postal_codes = []
    location_label = f"{city_name} +{radius_km}km"
    
    try:
        async with httpx.AsyncClient() as client:
            # Use limit=10 to get multiple results and find the best match
            geo_response = await client.get(
                f"https://geo.api.gouv.fr/communes?nom={city_name}&fields=centre,codesPostaux,population&limit=10"
            )
            
            if geo_response.status_code == 200 and geo_response.json():
                geo_results = geo_response.json()
                
                # Try to find exact match first
                city_data = None
                search_name = city_name.lower().strip()
                
                for result in geo_results:
                    result_name = result.get("nom", "").lower().strip()
                    if result_name == search_name:
                        city_data = result
                        break
                
                # If no exact match, try prefix matching and take most populous
                if not city_data:
                    matching_cities = [
                        r for r in geo_results 
                        if r.get("nom", "").lower().startswith(search_name)
                    ]
                    if matching_cities:
                        matching_cities_sorted = sorted(
                            matching_cities,
                            key=lambda x: x.get("population", 0),
                            reverse=True
                        )
                        city_data = matching_cities_sorted[0]
                    else:
                        # Fallback: take the most populous from all results
                        geo_results_sorted = sorted(
                            geo_results, 
                            key=lambda x: x.get("population", 0), 
                            reverse=True
                        )
                        city_data = geo_results_sorted[0] if geo_results_sorted else geo_results[0]
                
                logger.info(f"📍 Ville sélectionnée: {city_data.get('nom')} (pop: {city_data.get('population', 'N/A')})")
                
                lat = city_data.get("centre", {}).get("coordinates", [0, 0])[1]
                lng = city_data.get("centre", {}).get("coordinates", [0, 0])[0]
                
                # Get cities in radius
                cities_in_radius = await get_cities_in_radius_func(lat, lng, radius_km)
                for city in cities_in_radius[:30]:
                    postal_codes.extend(city.get("codes_postaux", []))
                    
    except Exception as e:
        logger.error(f"Error getting cities in radius: {e}")
    
    return list(set(postal_codes))[:50], location_label


def get_postal_codes_for_cities(cities: List[Dict]) -> Tuple[List[str], str]:
    """
    Get postal codes for multiple cities.
    
    Args:
        cities: List of city objects with name and postal_codes
        
    Returns:
        Tuple of (postal_codes, location_label)
    """
    postal_codes = []
    city_names = []
    
    for city in cities:
        if hasattr(city, 'postal_codes'):
            postal_codes.extend(city.postal_codes)
            city_names.append(city.name)
        else:
            postal_codes.extend(city.get("postal_codes", []))
            city_names.append(city.get("name", ""))
    
    location_label = ", ".join(city_names[:3])
    if len(city_names) > 3:
        location_label += f" +{len(city_names) - 3}"
    
    return list(set(postal_codes))[:50], location_label


def calculate_date_threshold(max_age_days: int) -> Tuple[str, str]:
    """
    Calculate date threshold for Pappers search.
    
    Args:
        max_age_days: Maximum age in days
        
    Returns:
        Tuple of (pappers_format, iso_format)
    """
    threshold_datetime = datetime.utcnow() - timedelta(days=max_age_days)
    date_threshold_pappers = threshold_datetime.strftime("%d-%m-%Y")  # Pappers format: DD-MM-YYYY
    date_threshold_iso = threshold_datetime.strftime("%Y-%m-%d")  # ISO format
    
    return date_threshold_pappers, date_threshold_iso


def classify_business(company: Dict, validated_phone: Optional[str] = None) -> str:
    """
    Classify a business based on phone availability.
    
    Args:
        company: Company data from Pappers
        validated_phone: The validated phone number (if any)
        
    Returns:
        Classification string: 'prospect_prioritaire' if has valid phone, 'visite_terrain' otherwise
    """
    # Use validated phone if provided, otherwise check raw Pappers phone
    has_phone = bool(validated_phone) or bool(company.get("siege", {}).get("telephone"))
    
    # Visite terrain criteria: no phone, likely needs physical visit
    if not has_phone:
        return "visite_terrain"
    
    return "prospect_prioritaire"


def format_pappers_business(
    company: Dict,
    scan_id: str,
    user_id: str,
    date_threshold_iso: str
) -> Optional[Dict]:
    """
    Format a Pappers company result into a business record.
    
    Args:
        company: Raw company data from Pappers
        scan_id: ID of the scan
        user_id: ID of the user
        date_threshold_iso: Date threshold in ISO format
        
    Returns:
        Formatted business dict or None if should be skipped
    """
    siege = company.get("siege", {})
    
    # Check date filter
    date_creation = company.get("date_creation")
    if date_creation:
        try:
            # Pappers returns dates as YYYY-MM-DD
            if date_creation < date_threshold_iso:
                return None
        except:
            pass
    
    business_id = str(uuid.uuid4())
    
    # Process phone number from Pappers with validation
    raw_phone = siege.get("telephone")
    validated_phone = None
    phone_source = None
    phone_confidence = "non_verifiée"
    
    if raw_phone:
        # Normalize and validate the phone number
        cleaned_phone = re.sub(r'\D', '', raw_phone)
        
        # Convert international format to French format
        if cleaned_phone.startswith('33') and len(cleaned_phone) == 11:
            cleaned_phone = '0' + cleaned_phone[2:]
        elif cleaned_phone.startswith('0033'):
            cleaned_phone = '0' + cleaned_phone[4:]
        
        # Validate French phone format (10 digits starting with 0)
        if len(cleaned_phone) == 10 and cleaned_phone.startswith('0'):
            # Check if it's a valid French prefix (01-05 landline, 06-07 mobile, 08 special, 09 VoIP)
            prefix = cleaned_phone[:2]
            if prefix in ['01', '02', '03', '04', '05', '06', '07', '08', '09']:
                validated_phone = cleaned_phone
                phone_source = "Pappers (données légales)"
                phone_confidence = "basse"  # Pappers data can be outdated
            else:
                logger.warning(f"  ⚠️ Invalid phone prefix for {company.get('nom_entreprise')}: {prefix}")
        else:
            logger.warning(f"  ⚠️ Invalid phone format for {company.get('nom_entreprise')}: {raw_phone}")
    
    # Process website URL
    website_url = company.get("site_internet")
    if website_url and not website_url.startswith(('http://', 'https://')):
        website_url = f"https://{website_url}"
    
    # Classify AFTER phone validation - use validated_phone to determine lead_type
    lead_type = classify_business(company, validated_phone)
    
    business = {
        "id": business_id,
        "scan_id": scan_id,
        "user_id": user_id,
        "siren": company.get("siren"),
        "siret": siege.get("siret"),
        "name": company.get("nom_entreprise") or company.get("denomination") or "Entreprise",
        "address": f"{siege.get('adresse_ligne_1', '')} {siege.get('code_postal', '')} {siege.get('ville', '')}".strip(),
        "city": siege.get("ville", ""),
        "postal_code": siege.get("code_postal", ""),
        "phone": validated_phone,
        "phone_source": phone_source,
        "phone_confidence": phone_confidence,
        "website_url": website_url,
        "naf_code": company.get("code_naf"),
        "activite_naf": company.get("code_naf"),
        "libelle_naf": company.get("libelle_code_naf", ""),
        "activity": company.get("libelle_code_naf", ""),
        "date_creation": date_creation,
        "legal_form": company.get("forme_juridique"),
        "capital": company.get("capital"),
        "dirigeants": company.get("dirigeants", [])[:3],  # First 3 managers
        "source": "pappers",
        "source_details": {
            "api": "pappers",
            "fetched_at": datetime.utcnow().isoformat(),
            "siren": company.get("siren"),
            "raw_phone": raw_phone  # Keep original for debugging
        },
        "lead_type": lead_type,
        "verified": False,  # Pappers data is NOT verified - it's just legal data
        "has_pappers_phone": bool(validated_phone),  # Distinguish from "verified"
        "enrichment_status": "pending",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    return business


async def search_pappers_batch(
    http_client: httpx.AsyncClient,
    pappers_api_key: str,
    naf_codes: List[str],
    postal_codes: List[str],
    date_threshold: str,
    max_naf_codes: int = 10,
    max_postal_codes: int = 10,
    max_per_page: int = 20,
    track_api_usage_func = None,
    user_id: str = None
) -> Tuple[List[Dict], int]:
    """
    Search Pappers API for businesses matching criteria.
    
    Args:
        http_client: Async HTTP client
        pappers_api_key: Pappers API key
        naf_codes: List of NAF codes to search
        postal_codes: List of postal codes to search
        date_threshold: Minimum creation date (DD-MM-YYYY format)
        max_naf_codes: Maximum NAF codes to search
        max_postal_codes: Maximum postal codes to search
        max_per_page: Results per page
        track_api_usage_func: Optional function to track API usage
        user_id: User ID for tracking
        
    Returns:
        Tuple of (companies, api_errors_count)
    """
    companies = []
    api_errors = 0
    max_api_errors = 5
    seen_sirens = set()
    
    for naf_code in naf_codes[:max_naf_codes]:
        if api_errors >= max_api_errors:
            logger.warning(f"⚠️ Stopping Pappers search: {api_errors} consecutive API errors")
            break
            
        for postal_code in postal_codes[:max_postal_codes]:
            try:
                pappers_url = "https://api.pappers.fr/v2/recherche"
                pappers_params = {
                    "api_token": pappers_api_key,
                    "code_naf": naf_code,
                    "code_postal": postal_code,
                    "date_creation_min": date_threshold,
                    "par_page": max_per_page,
                    "page": 1
                }
                
                response = await http_client.get(pappers_url, params=pappers_params)
                
                # Track API usage
                if track_api_usage_func and user_id:
                    await track_api_usage_func(
                        user_id=user_id,
                        api_type="pappers",
                        endpoint="recherche",
                        credits=1,
                        success=(response.status_code == 200),
                        error_msg=f"HTTP {response.status_code}" if response.status_code != 200 else None
                    )
                
                # Handle API errors
                if response.status_code in [401, 403, 429]:
                    api_errors += 1
                    logger.warning(f"⚠️ Pappers API error {response.status_code}")
                    continue
                elif response.status_code != 200:
                    api_errors += 1
                    continue
                
                # Reset error counter on success
                api_errors = 0
                
                data = response.json()
                results = data.get("resultats", [])
                
                for company in results:
                    siren = company.get("siren")
                    if siren and siren not in seen_sirens:
                        seen_sirens.add(siren)
                        companies.append(company)
                        
            except Exception as e:
                logger.error(f"Error searching Pappers: {e}")
                api_errors += 1
    
    return companies, api_errors


def calculate_scan_stats(businesses: List[Dict]) -> Dict[str, int]:
    """
    Calculate statistics for a scan's businesses.
    
    Args:
        businesses: List of business records
        
    Returns:
        Dict with statistics
    """
    total = len(businesses)
    visite_count = sum(1 for b in businesses if b.get("lead_type") == "visite_terrain")
    lead_count = sum(1 for b in businesses if b.get("lead_type") == "lead")
    with_phone = sum(1 for b in businesses if b.get("phone"))
    with_website = sum(1 for b in businesses if b.get("website"))
    
    return {
        "total": total,
        "visite_count": visite_count,
        "lead_count": lead_count,
        "with_phone": with_phone,
        "with_website": with_website
    }
