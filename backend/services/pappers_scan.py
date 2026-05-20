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

from services.pagesjaunes import check_pagesjaunes_direct
from utils.helpers import (
    generate_data_sources,
    is_hauts_de_france_postal_code,
    merge_data_sources,
)

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
    "HABITAT": [
        "4120A", "4120B",
        "4311Z", "4312A", "4312B", "4313Z",
        "4321A", "4321B",
        "4322A", "4322B",
        "4329A", "4329B",
        "4331Z", "4332A", "4332B", "4332C", "4333Z", "4334Z", "4339Z",
        "4391A", "4391B", "4399A", "4399B", "4399C", "4399D"
    ],
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
    "4311Z": "Travaux de démolition",
    "4312A": "Travaux de terrassement courants et travaux préparatoires",
    "4312B": "Travaux de terrassement spécialisés ou de grande masse",
    "4313Z": "Forages et sondages",
    "4321A": "Installation électrique",
    "4321B": "Travaux d'installation électrique",
    "4322A": "Plomberie, chauffage",
    "4322B": "Travaux de plomberie et chauffage",
    "4329A": "Installation climatisation",
    "4329B": "Autres travaux d'installation",
    "4331Z": "Travaux de plâtrerie",
    "4332A": "Menuiserie bois",
    "4332B": "Menuiserie métallique",
    "4332C": "Agencement de lieux de vente",
    "4333Z": "Travaux de revêtement sols et murs",
    "4334Z": "Peinture et vitrerie",
    "4339Z": "Autres travaux de finition",
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
    naf_codes: List[str] = []
    
    if "ALL" in domains or "all" in domains:
        for codes in DOMAIN_NAF_CODES.values():
            naf_codes.extend(codes)
    else:
        for domain in domains:
            domain_upper = domain.upper()
            if domain_upper in DOMAIN_NAF_CODES:
                naf_codes.extend(DOMAIN_NAF_CODES[domain_upper])
    
    # Preserve business-oriented ordering while deduplicating.
    # Using set() here makes the search plan unstable and can randomly
    # drop more relevant NAF codes from the truncated scan budget.
    return list(dict.fromkeys(naf_codes))


async def get_postal_codes_for_radius(
    city_name: str,
    radius_km: int,
    get_cities_in_radius_func,
    max_postal_codes: Optional[int] = 50,
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
                "https://geo.api.gouv.fr/communes",
                params={
                    "nom": city_name,
                    "fields": "centre,codesPostaux,population",
                    "limit": 10,
                },
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
                
                logger.info(f"[LOC] Ville selectionnee: {city_data.get('nom')} (pop: {city_data.get('population', 'N/A')})")
                
                lat = city_data.get("centre", {}).get("coordinates", [0, 0])[1]
                lng = city_data.get("centre", {}).get("coordinates", [0, 0])[0]
                
                # Get cities in radius
                cities_in_radius = await get_cities_in_radius_func(lat, lng, radius_km)
                for city in cities_in_radius:
                    postal_codes.extend(city.get("codes_postaux", []))
                    
    except Exception as e:
        logger.error(f"Error getting cities in radius: {e}")
    
    ordered_unique_postal_codes = list(dict.fromkeys(postal_codes))
    if max_postal_codes is not None:
        ordered_unique_postal_codes = ordered_unique_postal_codes[:max_postal_codes]
    return ordered_unique_postal_codes, location_label


def get_postal_codes_for_cities(cities: List[Dict], max_postal_codes: Optional[int] = 50) -> Tuple[List[str], str]:
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
    
    ordered_unique_postal_codes = list(dict.fromkeys(postal_codes))
    if max_postal_codes is not None:
        ordered_unique_postal_codes = ordered_unique_postal_codes[:max_postal_codes]
    return ordered_unique_postal_codes, location_label


def plan_pappers_scan_budget(
    *,
    total_naf_codes: int,
    total_postal_codes: int,
    search_mode: str,
    radius_km: int,
    max_age_days: int,
    selected_domains_count: int,
    has_explicit_naf_codes: bool,
) -> Dict[str, int]:
    """
    Compute the effective Pappers scan coverage budget.

    The goal is to keep local prospecting scans wide enough to be useful while
    preventing accidental API blow-ups on broad multi-domain searches.
    """
    is_single_domain = selected_domains_count <= 1 and not has_explicit_naf_codes
    is_specific_activity_scan = has_explicit_naf_codes
    is_small_local_radius = search_mode == "radius" and radius_km <= 10
    is_medium_local_radius = search_mode == "radius" and 10 < radius_km <= 20
    is_extended_local_radius = search_mode == "radius" and 20 < radius_km <= 30
    is_recent_window = max_age_days <= 90
    is_mid_window = max_age_days <= 180

    if is_small_local_radius and is_recent_window and (is_single_domain or is_specific_activity_scan):
        max_naf_codes = min(total_naf_codes, 24)
        max_postal_codes = min(total_postal_codes, max(18, min(30, 540 // max(1, max_naf_codes))))
    elif is_small_local_radius and is_recent_window:
        max_naf_codes = min(total_naf_codes, 18)
        max_postal_codes = min(total_postal_codes, 18)
    elif is_medium_local_radius and is_recent_window and (is_single_domain or is_specific_activity_scan):
        max_naf_codes = min(total_naf_codes, 22)
        max_postal_codes = min(total_postal_codes, max(18, min(24, 500 // max(1, max_naf_codes))))
    elif is_medium_local_radius and is_recent_window:
        max_naf_codes = min(total_naf_codes, 24)
        max_postal_codes = min(total_postal_codes, max(20, min(24, 500 // max(1, max_naf_codes))))
    elif is_extended_local_radius and is_recent_window and (is_single_domain or is_specific_activity_scan):
        max_naf_codes = min(total_naf_codes, 20)
        max_postal_codes = min(total_postal_codes, max(20, min(24, 480 // max(1, max_naf_codes))))
    elif is_extended_local_radius and is_recent_window:
        max_naf_codes = min(total_naf_codes, 16)
        max_postal_codes = min(total_postal_codes, 16)
    elif is_medium_local_radius and is_mid_window and (is_single_domain or is_specific_activity_scan):
        max_naf_codes = min(total_naf_codes, 18)
        max_postal_codes = min(total_postal_codes, 18)
    elif is_medium_local_radius and is_mid_window:
        max_naf_codes = min(total_naf_codes, 15)
        max_postal_codes = min(total_postal_codes, 15)
    else:
        max_naf_codes = min(total_naf_codes, 10)
        max_postal_codes = min(total_postal_codes, 10)

    return {
        "max_naf_codes": max_naf_codes,
        "max_postal_codes": max_postal_codes,
    }


def calculate_date_threshold(max_age_days: int) -> Tuple[str, str]:
    """
    Calculate date threshold for Pappers search.
    
    Args:
        max_age_days: Maximum age in days
        
    Returns:
        Tuple of (pappers_api_format, iso_format)
    """
    threshold_datetime = datetime.utcnow() - timedelta(days=max_age_days)
    date_threshold_pappers = threshold_datetime.strftime("%Y-%m-%d")  # Pappers API format
    date_threshold_iso = threshold_datetime.strftime("%Y-%m-%d")  # ISO format
    
    return date_threshold_pappers, date_threshold_iso


def evaluate_creation_date(
    date_creation: Optional[str],
    date_threshold_iso: str,
) -> Tuple[str, Optional[datetime.date]]:
    """
    Evaluate a Pappers creation date against the scan threshold.

    Returns one of:
    - "ok"
    - "missing"
    - "invalid"
    - "future"
    - "too_old"
    """
    if not date_creation:
        return "missing", None

    try:
        creation_date = datetime.strptime(date_creation, "%Y-%m-%d").date()
        threshold_date = datetime.strptime(date_threshold_iso, "%Y-%m-%d").date()
        today = datetime.utcnow().date()
    except ValueError:
        return "invalid", None

    if creation_date > today:
        return "future", creation_date
    if creation_date < threshold_date:
        return "too_old", creation_date
    return "ok", creation_date


def build_scan_diagnostics_payload(
    *,
    requests_attempted: int,
    raw_companies_received: int,
    skipped_missing_name_count: int,
    skipped_missing_date_count: int,
    skipped_invalid_date_count: int,
    skipped_future_date_count: int,
    skipped_too_old_count: int,
    skipped_batch_duplicate_count: int,
    duplicate_marked: int = 0,
    phone_conflicts: int = 0,
) -> Dict[str, int]:
    payload = {
        "requests_attempted": requests_attempted,
        "raw_companies_received": raw_companies_received,
        "skipped_missing_name_count": skipped_missing_name_count,
        "skipped_missing_date_count": skipped_missing_date_count,
        "skipped_invalid_date_count": skipped_invalid_date_count,
        "skipped_future_date_count": skipped_future_date_count,
        "skipped_too_old_count": skipped_too_old_count,
        "skipped_batch_duplicate_count": skipped_batch_duplicate_count,
    }
    if duplicate_marked:
        payload["duplicate_marked"] = duplicate_marked
    if phone_conflicts:
        payload["phone_conflicts"] = phone_conflicts
    return payload


def build_scan_completion_update(
    *,
    total_found: int,
    visite_count: int,
    new_results_count: int,
    reused_results_count: int,
    scan_diagnostics: Dict[str, int],
    progress_total_steps: int,
) -> Dict[str, Any]:
    return {
        "status": "done",
        "total_results": total_found,
        "visite_terrain_count": visite_count,
        "pappers_count": total_found,
        "new_results_count": new_results_count,
        "reused_results_count": reused_results_count,
        "scan_diagnostics": scan_diagnostics,
        "progress": 100,
        "progress_message": f"Termine ! {total_found} entreprises trouvees",
        "progress_step": progress_total_steps,
        "completed_at": datetime.utcnow(),
        "last_progress_at": datetime.utcnow(),
    }


def build_scan_record_payload(
    *,
    scan_id: str,
    user_id: str,
    query_label: str,
    location_label: str,
    selected_cities: List[Dict[str, Any]],
    radius_km: int,
    max_age_days: int,
    domains: List[str],
    naf_codes_count: int,
    naf_codes_searched: int,
    postal_codes_found: int,
    postal_codes_searched: int,
    search_mode: str,
    progress_total_steps: int,
) -> Dict[str, Any]:
    return {
        "id": scan_id,
        "user_id": user_id,
        "activity_id": "pappers_mass_scan",
        "query_label": query_label,
        "location_label": location_label,
        "selected_cities": selected_cities,
        "radius_km": radius_km,
        "max_age_days": max_age_days,
        "domains": domains,
        "naf_codes_count": naf_codes_count,
        "naf_codes_searched": naf_codes_searched,
        "postal_codes_found": postal_codes_found,
        "postal_codes_searched": postal_codes_searched,
        "search_mode": search_mode,
        "status": "processing",
        "created_at": datetime.utcnow(),
        "is_favorite": False,
        "total_results": 0,
        "scan_type": "pappers_mass",
        "progress": 0,
        "progress_message": "Demarrage du scan...",
        "progress_step": 0,
        "progress_total_steps": progress_total_steps,
        "last_progress_at": datetime.utcnow(),
    }


def build_scan_progress_update(
    *,
    step: int,
    progress_total_steps: int,
    message: str,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    update_data = {
        "progress": min(int((step / progress_total_steps) * 100), 99),
        "progress_message": message,
        "progress_step": step,
        "last_progress_at": datetime.utcnow(),
    }
    if extra_data:
        update_data.update(extra_data)
    return update_data


def build_scan_notification_payload(
    *,
    user_id: str,
    scan_id: str,
    total_found: int,
    visite_count: int,
    lead_count: int,
) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "visite_terrain" if visite_count > 0 else "scan_complete",
        "title": f"Scan Pappers termine - {total_found} entreprises",
        "message": f"{visite_count} visites de prospection, {lead_count} leads avec telephone",
        "data": {
            "scan_id": scan_id,
            "visite_count": visite_count,
            "lead_count": lead_count,
        },
        "is_read": False,
        "created_at": datetime.utcnow(),
    }


def build_scan_success_response(
    *,
    scan_id: str,
    total_found: int,
    visite_count: int,
    lead_count: int,
    new_results_count: int,
    reused_results_count: int,
    scan_diagnostics: Dict[str, int],
    naf_codes_scanned: int,
    naf_codes_available: int,
    postal_codes_scanned: int,
    postal_codes_available: int,
) -> Dict[str, Any]:
    return {
        "success": True,
        "scan_id": scan_id,
        "total_found": total_found,
        "visite_count": visite_count,
        "lead_count": lead_count,
        "new_results_count": new_results_count,
        "reused_results_count": reused_results_count,
        "scan_diagnostics": scan_diagnostics,
        "naf_codes_scanned": naf_codes_scanned,
        "naf_codes_available": naf_codes_available,
        "postal_codes_scanned": postal_codes_scanned,
        "postal_codes_available": postal_codes_available,
        "message": f"Scan terminé: {total_found} entreprises détectées",
    }


def build_reused_business_payload(
    *,
    existing: Dict[str, Any],
    scan_id: str,
    user_id: str,
    company_name: str,
    address: str,
    city: str,
    postal_code: str,
    siret: str,
    siren: str,
    date_creation: Optional[str],
    naf_code: str,
    fallback_city: str,
) -> Dict[str, Any]:
    pl_ref = existing.get("pl_reference")
    now = datetime.utcnow()

    reused_business = dict(existing)
    reused_business["id"] = str(uuid.uuid4())
    reused_business["scan_id"] = scan_id
    reused_business["pl_reference"] = pl_ref
    reused_business["source"] = "pappers"
    reused_business["name"] = company_name or existing.get("name", "Entreprise")
    reused_business["address"] = address or existing.get("address", "")
    reused_business["city"] = city or existing.get("city", fallback_city)
    reused_business["postal_code"] = postal_code or existing.get("postal_code", "")
    reused_business["siret"] = siret or existing.get("siret", "")
    reused_business["siren"] = siren or existing.get("siren", "")
    reused_business["date_creation"] = date_creation or existing.get("date_creation")
    reused_business["activite_naf"] = naf_code or existing.get("activite_naf", "")
    reused_business["pappers_url"] = existing.get("pappers_url") or (f"https://www.pappers.fr/entreprise/{siren}" if siren else "https://www.pappers.fr")
    reused_business["created_at"] = now
    reused_business["last_detected_at"] = now
    reused_business["is_new_in_scan"] = False
    reused_business["first_detected_at"] = existing.get("first_detected_at") or now
    reused_business["first_detected_by"] = existing.get("first_detected_by") or user_id
    return reused_business


def build_reused_business_scan_context(
    *,
    existing: Dict[str, Any],
    pl_reference: str,
    scan_id: str,
    user_id: str,
    company_name: str,
    address: str,
    city: str,
    postal_code: str,
    siret: str,
    siren: str,
    date_creation: Optional[str],
    naf_code: str,
    fallback_city: str,
) -> Dict[str, Any]:
    existing_with_reference = dict(existing)
    existing_with_reference["pl_reference"] = pl_reference
    reused_business = build_reused_business_payload(
        existing=existing_with_reference,
        scan_id=scan_id,
        user_id=user_id,
        company_name=company_name,
        address=address,
        city=city,
        postal_code=postal_code,
        siret=siret,
        siren=siren,
        date_creation=date_creation,
        naf_code=naf_code,
        fallback_city=fallback_city,
    )
    return {
        "reused_business": reused_business,
        "visite_delta": 1 if reused_business.get("lead_type") == "visite_terrain" else 0,
        "log_message": f"[Pappers Mass] Reused in scan: {company_name} ({pl_reference})",
    }


def resolve_pappers_phone_metadata(
    *,
    phone: Optional[str],
    enrichment_source: Optional[str],
    pappers_phone_validated: bool,
) -> Tuple[Optional[str], Optional[str]]:
    if not phone:
        return None, None

    if enrichment_source in {"Google", "Google (remplacement Pappers)", "google_places", "knowledge_graph", "serper_snippet"}:
        return "Google", "haute"
    if enrichment_source == "Site web":
        return "Site web", "moyenne"
    if enrichment_source == "Pappers":
        if pappers_phone_validated:
            return "Pappers (valide)", "moyenne"
        return "Pappers", "basse"

    return enrichment_source or "Inconnu", "moyenne"


def build_pappers_lead_scoring(
    *,
    has_pagesjaunes: bool,
    phone: Optional[str],
    enrichment_source: Optional[str],
    has_google: bool,
    siret: Optional[str],
) -> Tuple[int, str]:
    score = 80
    score_reason = "Nouvelle creation Pappers"

    if not has_pagesjaunes:
        score += 15
        score_reason += " | Absent PagesJaunes (+15)"
    if phone:
        score += 10
        score_reason += f" | Telephone ({enrichment_source or 'source inconnue'}) (+10)"
    if has_google:
        score += 5
        score_reason += " | Fiche Google (+5)"
    if siret:
        score += 10
        score_reason += " | SIRET verifie (+10)"

    return min(score, 100), score_reason


def build_pappers_data_sources(
    *,
    company_name: str,
    siret: str,
    siren: str,
    date_creation: Optional[str],
    naf_code: str,
    address: str,
    city: str,
    postal_code: str,
    phone: Optional[str],
    enrichment_source: Optional[str],
    website: Optional[str],
    google_place_id: Optional[str],
    google_rating: Optional[float],
    google_reviews: Optional[int],
) -> Dict[str, Any]:
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
            "postal_code": postal_code,
        },
        pappers_siren=siren,
    )

    if phone:
        if enrichment_source == "Google":
            phone_sources = generate_data_sources("google", {"phone": phone}, google_place_id=google_place_id)
        elif enrichment_source == "Site web":
            phone_sources = generate_data_sources("web", {"phone": phone}, website_url=website)
        else:
            phone_sources = generate_data_sources("pappers", {"phone": phone}, pappers_siren=siren)
        data_sources = merge_data_sources(data_sources, phone_sources)

    if website:
        website_sources = generate_data_sources("web", {"website_url": website}, website_url=website)
        data_sources = merge_data_sources(data_sources, website_sources)

    if google_rating:
        google_sources = generate_data_sources(
            "google",
            {"google_rating": google_rating, "google_reviews_count": google_reviews},
            google_place_id=google_place_id,
        )
        data_sources = merge_data_sources(data_sources, google_sources)

    return data_sources


def build_pappers_business_payload(
    *,
    scan_id: str,
    company_name: str,
    address: str,
    city: str,
    postal_code: str,
    phone: Optional[str],
    phone_source: Optional[str],
    phone_confidence: Optional[str],
    website_url: Optional[str],
    siret: str,
    siren: str,
    date_creation: Optional[str],
    naf_code: str,
    naf_label: str,
    has_google: bool,
    has_pagesjaunes: bool,
    pagesjaunes_url: Optional[str],
    pj_confidence: Optional[str],
    score: int,
    score_reason: str,
    lead_type: str,
    pappers_url: str,
    pl_reference: str,
    user_id: str,
    in_crm: bool,
    google_place_id: Optional[str],
    google_rating: Optional[float],
    google_reviews_count: Optional[int],
    latitude: Optional[float],
    longitude: Optional[float],
    data_sources: Dict[str, Any],
) -> Dict[str, Any]:
    now = datetime.utcnow()
    return {
        "scan_id": scan_id,
        "name": company_name,
        "address": address,
        "city": city,
        "postal_code": postal_code,
        "phone": phone,
        "phone_source": phone_source,
        "phone_confidence": phone_confidence,
        "website_url": website_url,
        "siret": siret,
        "siren": siren,
        "date_creation": date_creation,
        "activite_naf": naf_code,
        "libelle_naf": naf_label,
        "has_google": has_google,
        "has_pagesjaunes": has_pagesjaunes,
        "has_website": bool(website_url),
        "pagesjaunes_url": pagesjaunes_url,
        "match_confidence": pj_confidence,
        "score": score,
        "score_reason": score_reason,
        "source": "pappers",
        "lead_type": lead_type,
        "pappers_url": pappers_url,
        "pl_reference": pl_reference,
        "first_detected_at": now,
        "first_detected_by": user_id,
        "in_crm": in_crm,
        "google_place_id": google_place_id,
        "google_rating": google_rating,
        "google_reviews_count": google_reviews_count,
        "latitude": latitude,
        "longitude": longitude,
        "data_sources": data_sources,
        "created_at": now,
        "updated_at": now,
    }


def resolve_pappers_naf_label(*, company: Dict[str, Any], naf_code: str) -> str:
    naf_label = company.get("libelle_code_naf", "")
    if not naf_label and naf_code:
        naf_label = get_naf_label(naf_code)
    return naf_label


async def resolve_pappers_fallback_phone(
    *,
    company_name: str,
    city: str,
    current_phone: Optional[str],
    raw_pappers_phone: Optional[str],
    serper_api_key: Optional[str],
    normalize_phone_func,
    validate_phone_func,
) -> Tuple[Optional[str], bool, Optional[str]]:
    """
    Try to recover a usable phone from raw Pappers legal data when the main
    enrichment flow did not return one.

    Returns:
        (resolved_phone, is_validated, enrichment_source)
    """
    if current_phone or not raw_pappers_phone:
        return current_phone, False, None

    normalized_pappers_phone = normalize_phone_func(raw_pappers_phone)
    if not normalized_pappers_phone:
        return current_phone, False, None

    async with httpx.AsyncClient(timeout=15.0) as validation_client:
        validation_result = await validate_phone_func(
            validation_client,
            company_name,
            city,
            normalized_pappers_phone,
            serper_api_key,
        )

    resolved_phone = normalized_pappers_phone
    is_validated = validation_result.get("is_validated", False)
    enrichment_source = "Pappers"

    alternative = validation_result.get("alternative_phone")
    if alternative and not is_validated:
        resolved_phone = alternative
        is_validated = True
        enrichment_source = "Google (remplacement Pappers)"

    return resolved_phone, is_validated, enrichment_source


def build_pappers_insert_outcome(
    *,
    company_name: str,
    lead_type: str,
    phone: Optional[str],
    is_banned_domiciliation: bool,
) -> Dict[str, Any]:
    if is_banned_domiciliation:
        return {
            "is_active_result": False,
            "total_found_delta": 0,
            "new_results_delta": 0,
            "visite_delta": 0,
            "lead_delta": 0,
            "log_message": f"[Domiciliation] {company_name} excluded from active leads",
        }

    return {
        "is_active_result": True,
        "total_found_delta": 1,
        "new_results_delta": 1,
        "visite_delta": 1 if lead_type == "visite_terrain" else 0,
        "lead_delta": 0 if lead_type == "visite_terrain" else 1,
        "log_message": f"[Pappers Mass] {company_name} - {lead_type} {'[PHONE]' if phone else '[VISITE]'}",
    }


def apply_pappers_insert_outcome(
    *,
    counters: Dict[str, int],
    insert_outcome: Dict[str, Any],
) -> Dict[str, int]:
    return {
        "total_found": counters["total_found"] + insert_outcome["total_found_delta"],
        "new_results_count": counters["new_results_count"] + insert_outcome["new_results_delta"],
        "visite_count": counters["visite_count"] + insert_outcome["visite_delta"],
        "lead_count": counters["lead_count"] + insert_outcome["lead_delta"],
    }


def build_pappers_insert_runtime(
    *,
    counters: Dict[str, int],
    insert_outcome: Dict[str, Any],
) -> Dict[str, Any]:
    updated_counters = apply_pappers_insert_outcome(
        counters=counters,
        insert_outcome=insert_outcome,
    )
    return {
        "counters": updated_counters,
        "log_prefix": "[ACTIVE]" if insert_outcome["is_active_result"] else "[EXCLUDED]",
        "log_message": insert_outcome["log_message"],
    }


def build_pappers_insert_context(
    *,
    business_dict: Dict[str, Any],
    company_name: str,
    is_banned_domiciliation: bool,
    counters: Dict[str, int],
) -> Dict[str, Any]:
    insert_phone = business_dict.get("phone")
    insert_lead_type = business_dict.get("lead_type")
    insert_log_message = (
        f"[Pappers Insert] {business_dict.get('name')} | "
        f"phone: {insert_phone or 'N/A'} | lead_type: {insert_lead_type}"
    )
    insert_outcome = build_pappers_insert_outcome(
        company_name=company_name,
        lead_type=insert_lead_type,
        phone=insert_phone,
        is_banned_domiciliation=is_banned_domiciliation,
    )
    insert_runtime = build_pappers_insert_runtime(
        counters=counters,
        insert_outcome=insert_outcome,
    )
    return {
        "phone": insert_phone,
        "insert_log_message": insert_log_message,
        "insert_runtime": insert_runtime,
    }


async def find_existing_business_for_reuse(
    db,
    *,
    siret: str,
    siren: str,
    company_name: str,
    city: str,
    postal_code: str,
) -> Optional[Dict[str, Any]]:
    return await db.businesses.find_one(
        {
            "$or": [
                {"siret": siret},
                {"siren": siren},
                {"name": company_name, "city": city, "postal_code": postal_code},
            ]
        },
        {"_id": 0},
    )


def extract_pappers_enrichment_fields(enrichment: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "phone": enrichment.get("phone", ""),
        "website": enrichment.get("website", ""),
        "google_rating": enrichment.get("google_rating", 0),
        "google_reviews": enrichment.get("google_reviews_count", 0),
        "has_google": enrichment.get("has_google", False),
        "latitude": enrichment.get("latitude"),
        "longitude": enrichment.get("longitude"),
        "google_place_id": enrichment.get("google_place_id"),
        "enrichment_source": enrichment.get("enrichment_source"),
    }


def resolve_pappers_contact_bundle(
    *,
    company: Dict[str, Any],
    postal_code: str,
    naf_code: str,
    enrichment_fields: Dict[str, Any],
    resolved_phone: Optional[str],
    enrichment_source: str,
    pappers_phone_validated: bool,
) -> Dict[str, Any]:
    phone = resolved_phone
    pappers_phone = company.get("telephone")

    phone_source, phone_confidence = resolve_pappers_phone_metadata(
        phone=phone,
        enrichment_source=enrichment_source,
        pappers_phone_validated=pappers_phone_validated,
    )

    lead_type = (
        "prospect_prioritaire"
        if phone
        else ("visite_terrain" if is_hauts_de_france_postal_code(postal_code) else "standard")
    )

    return {
        **enrichment_fields,
        "phone": phone,
        "enrichment_source": enrichment_source,
        "pappers_phone": pappers_phone,
        "pappers_phone_validated": pappers_phone_validated,
        "phone_source": phone_source,
        "phone_confidence": phone_confidence,
        "lead_type": lead_type,
        "naf_label": resolve_pappers_naf_label(company=company, naf_code=naf_code),
    }


async def resolve_pappers_contact_runtime(
    *,
    company: Dict[str, Any],
    company_name: str,
    city: str,
    postal_code: str,
    naf_code: str,
    enrichment: Dict[str, Any],
    serper_api_key: Optional[str],
    normalize_phone_func,
    validate_phone_func,
) -> Dict[str, Any]:
    enrichment_fields = extract_pappers_enrichment_fields(enrichment)
    initial_phone = enrichment_fields["phone"]
    initial_enrichment_source = enrichment_fields["enrichment_source"] or ""
    previous_phone = initial_phone
    pappers_phone = company.get("telephone")

    resolved_phone, pappers_phone_validated, fallback_phone_source = await resolve_pappers_fallback_phone(
        company_name=company_name,
        city=city,
        current_phone=previous_phone,
        raw_pappers_phone=pappers_phone,
        serper_api_key=serper_api_key,
        normalize_phone_func=normalize_phone_func,
        validate_phone_func=validate_phone_func,
    )

    enrichment_source = initial_enrichment_source
    if fallback_phone_source:
        enrichment_source = fallback_phone_source

    contact_bundle = resolve_pappers_contact_bundle(
        company=company,
        postal_code=postal_code,
        naf_code=naf_code,
        enrichment_fields=enrichment_fields,
        resolved_phone=resolved_phone,
        enrichment_source=enrichment_source,
        pappers_phone_validated=pappers_phone_validated,
    )

    replacement_log_message = None
    if (
        contact_bundle["phone"]
        and contact_bundle["phone"] != previous_phone
        and fallback_phone_source == "Google (remplacement Pappers)"
    ):
        replacement_log_message = (
            f"[Pappers] Google replaced legal phone for {company_name}: "
            f"{pappers_phone} -> {contact_bundle['phone']}"
        )
    return {
        **contact_bundle,
        "replacement_log_message": replacement_log_message,
    }


async def resolve_pappers_post_contact_runtime(
    *,
    scan_id: str,
    user_id: str,
    company_name: str,
    address: str,
    city: str,
    postal_code: str,
    siret: str,
    siren: str,
    date_creation: Optional[str],
    naf_code: str,
    contact_runtime: Dict[str, Any],
    serper_api_key: Optional[str],
    pl_reference: str,
) -> Dict[str, Any]:
    has_pagesjaunes, pagesjaunes_url, pj_confidence, _pj_status = await check_pagesjaunes_direct(
        company_name,
        city,
        serper_api_key,
    )

    score, score_reason = build_pappers_lead_scoring(
        has_pagesjaunes=has_pagesjaunes,
        phone=contact_runtime["phone"],
        enrichment_source=contact_runtime["enrichment_source"],
        has_google=contact_runtime["has_google"],
        siret=siret,
    )

    pappers_url = f"https://www.pappers.fr/entreprise/{siren}"
    data_sources = build_pappers_data_sources(
        company_name=company_name,
        siret=siret,
        siren=siren,
        date_creation=date_creation,
        naf_code=naf_code,
        address=address,
        city=city,
        postal_code=postal_code,
        phone=contact_runtime["phone"],
        enrichment_source=contact_runtime["enrichment_source"],
        website=contact_runtime["website"],
        google_place_id=contact_runtime["google_place_id"],
        google_rating=contact_runtime["google_rating"],
        google_reviews=contact_runtime["google_reviews"],
    )

    business_payload = build_pappers_business_payload(
        scan_id=scan_id,
        company_name=company_name,
        address=address,
        city=city,
        postal_code=postal_code,
        phone=contact_runtime["phone"],
        phone_source=contact_runtime["phone_source"],
        phone_confidence=contact_runtime["phone_confidence"],
        website_url=contact_runtime["website"],
        siret=siret,
        siren=siren,
        date_creation=date_creation,
        naf_code=naf_code,
        naf_label=contact_runtime["naf_label"],
        has_google=contact_runtime["has_google"],
        has_pagesjaunes=has_pagesjaunes,
        pagesjaunes_url=pagesjaunes_url,
        pj_confidence=pj_confidence,
        score=score,
        score_reason=score_reason,
        lead_type=contact_runtime["lead_type"],
        pappers_url=pappers_url,
        pl_reference=pl_reference,
        user_id=user_id,
        in_crm=has_pagesjaunes,
        google_place_id=contact_runtime["google_place_id"],
        google_rating=contact_runtime["google_rating"],
        google_reviews_count=contact_runtime["google_reviews"],
        latitude=contact_runtime["latitude"],
        longitude=contact_runtime["longitude"],
        data_sources=data_sources,
    )
    return business_payload


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
    
    postal_code = company.get("siege", {}).get("code_postal") or company.get("code_postal")

    # Visite terrain auto uniquement en Hauts-de-France
    if not has_phone and is_hauts_de_france_postal_code(postal_code):
        return "visite_terrain"
    
    return "prospect_prioritaire" if has_phone else "standard"


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
                logger.warning(f"  [WARN] Invalid phone prefix for {company.get('nom_entreprise')}: {prefix}")
        else:
            logger.warning(f"  [WARN] Invalid phone format for {company.get('nom_entreprise')}: {raw_phone}")
    
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


async def fetch_pappers_search_page(
    *,
    http_client: httpx.AsyncClient,
    pappers_api_key: str,
    naf_code: str,
    postal_code: str,
    date_threshold: str,
    max_per_page: int,
    track_api_usage_func=None,
    user_id: Optional[str] = None,
    exclude_closed: bool = False,
) -> Dict[str, Any]:
    pappers_params = {
        "api_token": pappers_api_key,
        "code_naf": naf_code,
        "code_postal": postal_code,
        "date_creation_min": date_threshold,
        "par_page": max_per_page,
        "page": 1,
    }
    if exclude_closed:
        pappers_params["entreprise_cessee"] = "false"

    response = await http_client.get(
        "https://api.pappers.fr/v2/recherche",
        params=pappers_params,
    )

    if track_api_usage_func and user_id:
        await track_api_usage_func(
            user_id=user_id,
            api_type="pappers",
            endpoint="recherche",
            credits=1,
            success=(response.status_code == 200),
            error_msg=f"HTTP {response.status_code}" if response.status_code != 200 else None,
        )

    companies: List[Dict[str, Any]] = []
    if response.status_code == 200:
        companies = response.json().get("resultats", [])

    return {
        "status_code": response.status_code,
        "companies": companies,
    }


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
            logger.warning(f"[WARN] Stopping Pappers search: {api_errors} consecutive API errors")
            break
            
        for postal_code in postal_codes[:max_postal_codes]:
            try:
                page_result = await fetch_pappers_search_page(
                    http_client=http_client,
                    pappers_api_key=pappers_api_key,
                    naf_code=naf_code,
                    postal_code=postal_code,
                    date_threshold=date_threshold,
                    max_per_page=max_per_page,
                    track_api_usage_func=track_api_usage_func,
                    user_id=user_id,
                )
                status_code = page_result["status_code"]
                
                
                # Handle API errors
                if status_code in [401, 403, 429]:
                    api_errors += 1
                    logger.warning(f"[Pappers] API error {status_code}")
                    continue
                elif status_code != 200:
                    api_errors += 1
                    continue
                
                # Reset error counter on success
                api_errors = 0
                
                results = page_result["companies"]
                
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
