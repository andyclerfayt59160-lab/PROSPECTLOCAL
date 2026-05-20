"""
Pappers API Service

Ce module gère toutes les interactions avec l'API Pappers.fr :
- Recherche de nouvelles créations d'entreprises
- Récupération des villes dans un rayon
- Traitement et formatage des données Pappers
"""
import httpx
import logging
from datetime import datetime
from typing import Optional, List
from math import radians, sin, cos, sqrt, atan2

from utils.helpers import ACTIVITY_NAF_MAPPING

logger = logging.getLogger(__name__)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two coordinates using Haversine formula.
    
    Args:
        lat1, lon1: First point coordinates
        lat2, lon2: Second point coordinates
        
    Returns:
        Distance in kilometers
    """
    R = 6371  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


async def get_cities_in_radius(lat: float, lng: float, radius_km: int) -> List[dict]:
    """
    Get cities within a radius using API Géo Gouv.
    
    Args:
        lat: Latitude of center point
        lng: Longitude of center point
        radius_km: Search radius in kilometers
        
    Returns:
        List of cities with name, postal codes, and distance
    """
    cities = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            url = "https://geo.api.gouv.fr/communes"
            params = {
                "lat": lat,
                "lon": lng,
                "fields": "nom,code,codesPostaux,population,centre",
                "format": "json",
                "geometry": "centre"
            }
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                all_cities = response.json()
                
                for city in all_cities:
                    if city.get("centre") and city["centre"].get("coordinates"):
                        city_lng, city_lat = city["centre"]["coordinates"]
                        distance = haversine_distance(lat, lng, city_lat, city_lng)
                        
                        if distance <= radius_km:
                            cities.append({
                                "nom": city.get("nom"),
                                "codes_postaux": city.get("codesPostaux", []),
                                "distance_km": round(distance, 1)
                            })
                
                cities.sort(key=lambda x: x["distance_km"])
                logger.info(f"📍 {len(cities)} villes dans un rayon de {radius_km}km")
                
    except Exception as e:
        logger.error(f"Erreur get_cities_in_radius: {e}")
    
    return cities


def get_naf_codes_for_activity(activity_label: str) -> List[str]:
    """
    Get NAF codes for an activity label.
    
    Args:
        activity_label: Activity name (e.g., "plombier", "restaurant")
        
    Returns:
        List of NAF codes for the activity
    """
    if not activity_label:
        return []
    
    activity_lower = activity_label.lower()
    
    # Check exact match first
    if activity_lower in ACTIVITY_NAF_MAPPING:
        return ACTIVITY_NAF_MAPPING[activity_lower]
    
    # Check partial match
    for key, codes in ACTIVITY_NAF_MAPPING.items():
        if key in activity_lower or activity_lower in key:
            return codes
    
    return []


def format_pappers_company(company: dict, source_label: str = "pappers") -> dict:
    """
    Format a Pappers company result into a standardized business dict.
    
    Args:
        company: Raw Pappers company data
        source_label: Source identifier
        
    Returns:
        Formatted business dictionary
    """
    # Extract basic info
    nom = company.get("nom_entreprise") or company.get("denomination") or "N/A"
    siege = company.get("siege", {})
    
    # Address components
    address_parts = []
    if siege.get("numero_voie"):
        address_parts.append(siege["numero_voie"])
    if siege.get("type_voie"):
        address_parts.append(siege["type_voie"])
    if siege.get("libelle_voie"):
        address_parts.append(siege["libelle_voie"])
    
    address = " ".join(address_parts) if address_parts else siege.get("adresse_ligne_1", "")
    
    # Format result
    return {
        "name": nom,
        "address": address,
        "postal_code": siege.get("code_postal", ""),
        "city": siege.get("ville", ""),
        "siren": company.get("siren", ""),
        "siret": siege.get("siret", ""),
        "naf_code": company.get("code_naf", ""),
        "naf_label": company.get("libelle_code_naf", ""),
        "date_creation": company.get("date_creation", ""),
        "legal_form": company.get("forme_juridique", ""),
        "source": source_label,
        "phone": "",  # Pappers doesn't provide phone
        "website": "",
        "email": "",
    }


async def search_pappers_companies(
    codes_postaux: List[str],
    activity_label: str = None,
    date_creation_min: str = None,
    max_results: int = 30,
    api_key: str = None,
    track_usage_callback = None,
    user_id: str = None
) -> List[dict]:
    """
    Search for new company creations on Pappers.
    
    Args:
        codes_postaux: List of postal codes to search
        activity_label: Activity type filter
        date_creation_min: Minimum creation date (YYYY-MM-DD)
        max_results: Maximum number of results
        api_key: Pappers API key
        track_usage_callback: Optional callback for API usage tracking
        user_id: User ID for tracking
        
    Returns:
        List of formatted company dictionaries
    """
    if not api_key:
        logger.warning("No Pappers API key provided")
        return []
    
    companies = []
    seen_sirens = set()
    
    # Get NAF codes for activity
    naf_codes = get_naf_codes_for_activity(activity_label) if activity_label else []
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for cp in codes_postaux[:10]:  # Limit to 10 postal codes
                if len(companies) >= max_results:
                    break
                
                # Build request params
                params = {
                    "api_token": api_key,
                    "code_postal": cp,
                    "entreprise_cessee": "false",
                    "per_page": min(20, max_results - len(companies))
                }
                
                if date_creation_min:
                    params["date_creation_min"] = date_creation_min
                
                if naf_codes:
                    params["code_naf"] = ",".join(naf_codes)
                
                # Make API call
                response = await client.get(
                    "https://api.pappers.fr/v2/recherche",
                    params=params
                )
                
                # Track usage if callback provided
                if track_usage_callback and user_id:
                    await track_usage_callback(
                        user_id=user_id,
                        api_type="pappers",
                        endpoint="recherche",
                        credits=1,
                        success=(response.status_code == 200)
                    )
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("resultats", [])
                    
                    for company in results:
                        siren = company.get("siren")
                        
                        # Skip ceased companies
                        if company.get("entreprise_cessee"):
                            continue
                        
                        # Skip duplicates
                        if siren and siren in seen_sirens:
                            continue
                        
                        seen_sirens.add(siren)
                        
                        # Format and add
                        formatted = format_pappers_company(company)
                        companies.append(formatted)
                        
                        if len(companies) >= max_results:
                            break
                
                elif response.status_code == 401:
                    logger.error("Pappers API: Invalid or exhausted API key")
                    break
                    
    except Exception as e:
        logger.error(f"Pappers search error: {e}")
    
    logger.info(f"📋 Pappers: {len(companies)} entreprises trouvées")
    return companies


async def get_company_details(siren: str, api_key: str) -> Optional[dict]:
    """
    Get detailed information about a company by SIREN.
    
    Args:
        siren: Company SIREN number
        api_key: Pappers API key
        
    Returns:
        Company details dict or None
    """
    if not api_key or not siren:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"https://api.pappers.fr/v2/entreprise/{siren}",
                params={"api_token": api_key}
            )
            
            if response.status_code == 200:
                return response.json()
                
    except Exception as e:
        logger.error(f"Pappers company details error: {e}")
    
    return None
