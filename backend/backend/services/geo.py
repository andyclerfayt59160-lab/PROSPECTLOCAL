"""
Geo Service

Ce module gère toutes les fonctionnalités de géolocalisation :
- Géocodage d'adresses via Google Maps API
- Recherche de villes via API Géo Gouv
- Calcul de distances
"""
import httpx
import logging
from typing import Optional, List, Tuple
from math import radians, sin, cos, sqrt, atan2

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


async def geocode_address(
    address: str,
    city: str = None,
    google_api_key: str = None
) -> Tuple[Optional[float], Optional[float]]:
    """
    Geocode an address using Google Maps Geocoding API.
    
    Args:
        address: Street address
        city: City name
        google_api_key: Google API key
        
    Returns:
        Tuple of (latitude, longitude) or (None, None)
    """
    if not google_api_key:
        return None, None
    
    query = f"{address}, {city}" if city else address
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {
                "address": query,
                "key": google_api_key,
                "region": "fr"
            }
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                
                if results:
                    location = results[0].get("geometry", {}).get("location", {})
                    return location.get("lat"), location.get("lng")
                    
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
    
    return None, None


async def search_cities(
    query: str,
    limit: int = 10
) -> List[dict]:
    """
    Search for cities in France using API Géo Gouv.
    
    Args:
        query: City name search query
        limit: Maximum number of results
        
    Returns:
        List of city dictionaries
    """
    cities = []
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = "https://geo.api.gouv.fr/communes"
            params = {
                "nom": query,
                "fields": "nom,code,codesPostaux,population,centre,departement",
                "boost": "population",
                "limit": limit
            }
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                for city in data:
                    centre = city.get("centre", {})
                    coords = centre.get("coordinates", [None, None])
                    
                    cities.append({
                        "nom": city.get("nom"),
                        "code": city.get("code"),
                        "codes_postaux": city.get("codesPostaux", []),
                        "population": city.get("population", 0),
                        "departement": city.get("departement", {}).get("nom", ""),
                        "lat": coords[1] if len(coords) > 1 else None,
                        "lng": coords[0] if len(coords) > 0 else None
                    })
                    
    except Exception as e:
        logger.error(f"City search error: {e}")
    
    return cities


async def get_city_by_postal_code(postal_code: str) -> Optional[dict]:
    """
    Get city information by postal code.
    
    Args:
        postal_code: French postal code
        
    Returns:
        City dictionary or None
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = "https://geo.api.gouv.fr/communes"
            params = {
                "codePostal": postal_code,
                "fields": "nom,code,codesPostaux,population,centre,departement"
            }
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                if data:
                    city = data[0]
                    centre = city.get("centre", {})
                    coords = centre.get("coordinates", [None, None])
                    
                    return {
                        "nom": city.get("nom"),
                        "code": city.get("code"),
                        "codes_postaux": city.get("codesPostaux", []),
                        "population": city.get("population", 0),
                        "departement": city.get("departement", {}).get("nom", ""),
                        "lat": coords[1] if len(coords) > 1 else None,
                        "lng": coords[0] if len(coords) > 0 else None
                    }
                    
    except Exception as e:
        logger.error(f"City by postal code error: {e}")
    
    return None


async def get_cities_in_radius(
    lat: float,
    lng: float,
    radius_km: int,
    min_population: int = 0
) -> List[dict]:
    """
    Get all cities within a radius of a point.
    Uses department-based search for better coverage.
    
    Args:
        lat: Center latitude
        lng: Center longitude
        radius_km: Search radius in kilometers
        min_population: Minimum city population filter
        
    Returns:
        List of cities sorted by distance
    """
    cities = []
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # First, find which department the center point is in
            url_nearby = "https://geo.api.gouv.fr/communes"
            params_nearby = {
                "lat": lat,
                "lon": lng,
                "fields": "nom,code,codesPostaux,population,centre,codeDepartement",
                "format": "json",
                "geometry": "centre"
            }
            
            response_nearby = await client.get(url_nearby, params=params_nearby)
            
            if response_nearby.status_code != 200:
                logger.error(f"Geo API error: {response_nearby.status_code}")
                return cities
            
            nearby_cities = response_nearby.json()
            if not nearby_cities:
                return cities
            
            # Get the department code from the first nearby city
            dept_codes = set()
            for city in nearby_cities[:3]:
                dept_code = city.get("codeDepartement")
                if dept_code:
                    dept_codes.add(dept_code)
            
            # Also add neighboring departments based on center coordinates
            # This helps when the search point is near department borders
            if lat > 49.5:  # Northern France
                dept_codes.update(["59", "62", "80", "02"])  # Nord, Pas-de-Calais, Somme, Aisne
            
            logger.info(f"📍 Searching in departments: {dept_codes}")
            
            # Fetch all communes from these departments
            all_communes = []
            for dept_code in dept_codes:
                url_dept = f"https://geo.api.gouv.fr/departements/{dept_code}/communes"
                params_dept = {
                    "fields": "nom,code,codesPostaux,population,centre",
                    "format": "json"
                }
                
                response_dept = await client.get(url_dept, params=params_dept)
                
                if response_dept.status_code == 200:
                    dept_communes = response_dept.json()
                    all_communes.extend(dept_communes)
                    logger.info(f"  📍 Department {dept_code}: {len(dept_communes)} communes")
            
            # Filter communes by distance
            for city in all_communes:
                if city.get("centre") and city["centre"].get("coordinates"):
                    city_lng, city_lat = city["centre"]["coordinates"]
                    distance = haversine_distance(lat, lng, city_lat, city_lng)
                    population = city.get("population", 0)
                    
                    if distance <= radius_km and population >= min_population:
                        cities.append({
                            "nom": city.get("nom"),
                            "code": city.get("code"),
                            "codes_postaux": city.get("codesPostaux", []),
                            "population": population,
                            "lat": city_lat,
                            "lng": city_lng,
                            "distance_km": round(distance, 1)
                        })
            
            # Remove duplicates by code
            seen_codes = set()
            unique_cities = []
            for city in cities:
                if city["code"] not in seen_codes:
                    seen_codes.add(city["code"])
                    unique_cities.append(city)
            
            cities = unique_cities
            cities.sort(key=lambda x: x["distance_km"])
            logger.info(f"📍 Found {len(cities)} cities within {radius_km}km radius")
                
    except Exception as e:
        logger.error(f"Cities in radius error: {e}")
    
    return cities


async def get_departments() -> List[dict]:
    """
    Get list of all French departments.
    
    Returns:
        List of department dictionaries
    """
    departments = []
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = "https://geo.api.gouv.fr/departements"
            params = {"fields": "nom,code,codeRegion"}
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                for dept in data:
                    departments.append({
                        "code": dept.get("code"),
                        "nom": dept.get("nom"),
                        "code_region": dept.get("codeRegion")
                    })
                    
    except Exception as e:
        logger.error(f"Departments fetch error: {e}")
    
    return departments
