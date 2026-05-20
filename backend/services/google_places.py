"""
Google Places Service

Ce module gère les interactions avec l'API Google Places:
- Géocodage d'adresses
- Recherche d'entreprises
- Récupération des détails d'un établissement
"""
import asyncio
import logging
import httpx
from typing import Optional, List, Tuple

logger = logging.getLogger(__name__)

# Coordonnées par défaut (Paris)
DEFAULT_LAT = 48.8566
DEFAULT_LNG = 2.3522


async def geocode_location(location: str, api_key: str) -> Tuple[float, float]:
    """
    Convertit une adresse/ville en coordonnées GPS via Google Geocoding API.
    
    Args:
        location: Adresse ou nom de ville
        api_key: Clé API Google
        
    Returns:
        Tuple[float, float]: (latitude, longitude) ou coordonnées Paris par défaut
    """
    if not api_key or api_key == "YOUR_GOOGLE_API_KEY_HERE":
        logger.warning("⚠️ Google API key not configured - using default coordinates")
        return DEFAULT_LAT, DEFAULT_LNG
    
    async with httpx.AsyncClient() as http_client:
        try:
            url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {"address": location, "key": api_key}
            response = await http_client.get(url, params=params)
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                loc = data["results"][0]["geometry"]["location"]
                return loc["lat"], loc["lng"]
            else:
                logger.error(f"Geocoding failed: {data.get('status')}")
                return DEFAULT_LAT, DEFAULT_LNG
        except Exception as e:
            logger.error(f"Geocoding error: {e}")
            return DEFAULT_LAT, DEFAULT_LNG


async def get_place_details(place_id: str, api_key: str) -> Optional[dict]:
    """
    Récupère les détails complets d'un établissement via Google Places Details API.
    
    Args:
        place_id: ID Google Places
        api_key: Clé API Google
        
    Returns:
        dict: Détails de l'établissement ou None si erreur
    """
    async with httpx.AsyncClient() as http_client:
        try:
            url = "https://maps.googleapis.com/maps/api/place/details/json"
            params = {
                "place_id": place_id,
                "fields": "name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,business_status,geometry",
                "key": api_key
            }
            
            response = await http_client.get(url, params=params, timeout=10.0)
            data = response.json()
            
            if data.get("status") == "OK":
                return data.get("result")
        except Exception as e:
            logger.error(f"Error getting place details: {e}")
    return None


async def search_google_places(
    query: str, 
    lat: float, 
    lng: float, 
    radius_km: int, 
    api_key: str, 
    max_results: int = 60,
    serper_api_key: str = None
) -> List[dict]:
    """
    Recherche des entreprises via Google Places Text Search API avec pagination.
    Si Google échoue (billing, etc.), utilise Serper comme fallback automatique.
    
    Args:
        query: Terme de recherche (ex: "plombier")
        lat: Latitude du centre de recherche
        lng: Longitude du centre de recherche
        radius_km: Rayon de recherche en km
        api_key: Clé API Google
        max_results: Nombre maximum de résultats (default: 60)
        serper_api_key: Clé API Serper pour fallback
        
    Returns:
        List[dict]: Liste des établissements trouvés
    """
    
    if not api_key or api_key == "YOUR_GOOGLE_API_KEY_HERE":
        logger.warning("⚠️ Google API key not configured - using Serper fallback")
        return await _search_via_serper_fallback(query, lat, lng, max_results, serper_api_key)
    
    businesses = []
    seen_place_ids = set()
    next_page_token = None
    radius_meters = radius_km * 1000
    
    async with httpx.AsyncClient() as http_client:
        try:
            # First request
            url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
            params = {
                "query": query,
                "location": f"{lat},{lng}",
                "radius": min(radius_meters, 50000),
                "key": api_key
            }
            
            while len(businesses) < max_results:
                if next_page_token:
                    # Google requires a delay before using next_page_token
                    await asyncio.sleep(2)
                    params = {"pagetoken": next_page_token, "key": api_key}
                
                response = await http_client.get(url, params=params, timeout=30.0)
                data = response.json()
                
                if data.get("status") != "OK":
                    logger.warning(f"Google Places API: {data.get('status')}")
                    break
                
                for place in data.get("results", []):
                    place_id = place.get("place_id")
                    if place_id not in seen_place_ids:
                        seen_place_ids.add(place_id)
                        # Get detailed info
                        details = await get_place_details(place_id, api_key)
                        if details:
                            details["place_id"] = place_id  # Preserve place_id!
                            businesses.append(details)
                        else:
                            businesses.append(place)
                        
                        if len(businesses) >= max_results:
                            break
                
                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break
                    
            logger.info(f"✅ Found {len(businesses)} businesses")
            
        except Exception as e:
            logger.error(f"❌ Google Places search error: {e}")
    
    return businesses


async def check_website(url: str) -> bool:
    """
    Vérifie si un site web est accessible.
    
    Args:
        url: URL du site web
        
    Returns:
        bool: True si accessible, False sinon
    """
    if not url:
        return False
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.head(url, timeout=5.0, follow_redirects=True)
            return response.status_code < 400
    except:
        return False


async def _search_via_serper_fallback(
    query: str,
    lat: float,
    lng: float,
    max_results: int,
    serper_api_key: str
) -> List[dict]:
    """
    Fallback: Recherche via Serper API quand Google Places n'est pas disponible.
    Convertit les résultats Serper en format Google Places pour compatibilité.
    
    Args:
        query: Terme de recherche
        lat: Latitude (utilisé pour le contexte géographique)
        lng: Longitude
        max_results: Nombre max de résultats
        serper_api_key: Clé API Serper
        
    Returns:
        List[dict]: Résultats au format Google Places
    """
    import re
    
    if not serper_api_key:
        logger.warning("⚠️ No Serper API key for fallback - returning empty results")
        return []
    
    businesses = []
    seen_names = set()
    
    # Déterminer la ville approximative pour la recherche
    # On pourrait faire un reverse geocoding, mais pour simplifier on utilise la requête directement
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Recherche Google Maps via Serper
            response = await client.post(
                "https://google.serper.dev/maps",
                headers={
                    "X-API-KEY": serper_api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "q": query,
                    "ll": f"@{lat},{lng},14z",  # Coordonnées avec zoom
                    "gl": "fr",
                    "hl": "fr"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                places = data.get("places", [])
                
                logger.info(f"🔄 Serper Maps fallback: {len(places)} résultats pour '{query}'")
                
                for place in places[:max_results]:
                    name = place.get("title", "")
                    if not name or name.lower() in seen_names:
                        continue
                    seen_names.add(name.lower())
                    
                    # Extraire le téléphone
                    phone = place.get("phoneNumber", "")
                    if phone:
                        # Normaliser le téléphone français
                        phone_clean = re.sub(r'\D', '', phone)
                        if phone_clean.startswith('33'):
                            phone_clean = '0' + phone_clean[2:]
                        if len(phone_clean) == 10:
                            phone = ' '.join([phone_clean[i:i+2] for i in range(0, 10, 2)])
                    
                    # Convertir en format Google Places
                    business = {
                        "place_id": place.get("cid", f"serper_{len(businesses)}"),
                        "name": name,
                        "formatted_address": place.get("address", ""),
                        "formatted_phone_number": phone,
                        "website": place.get("website", ""),
                        "rating": place.get("rating", 0),
                        "user_ratings_total": place.get("reviewsCount", 0),
                        "types": place.get("categories", []),
                        "business_status": "OPERATIONAL",
                        "geometry": {
                            "location": {
                                "lat": place.get("latitude", lat),
                                "lng": place.get("longitude", lng)
                            }
                        },
                        "source": "serper_fallback"
                    }
                    businesses.append(business)
                    
                    if len(businesses) >= max_results:
                        break
            else:
                logger.warning(f"⚠️ Serper Maps API error: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Serper fallback error: {e}")
    
    logger.info(f"✅ Serper fallback: {len(businesses)} entreprises trouvées")
    return businesses


async def search_businesses_hybrid(
    query: str,
    location: str,
    lat: float,
    lng: float,
    radius_km: int,
    google_api_key: str,
    serper_api_key: str,
    max_results: int = 60
) -> Tuple[List[dict], str]:
    """
    Recherche hybride: essaie Google Places d'abord, puis Serper en fallback.
    
    Args:
        query: Terme de recherche
        location: Nom de la ville/lieu
        lat: Latitude
        lng: Longitude
        radius_km: Rayon de recherche
        google_api_key: Clé Google
        serper_api_key: Clé Serper
        max_results: Nombre max de résultats
        
    Returns:
        Tuple[List[dict], str]: (résultats, source utilisée)
    """
    # Essayer Google Places d'abord
    if google_api_key and google_api_key != "YOUR_GOOGLE_API_KEY_HERE":
        try:
            results = await search_google_places(
                query, lat, lng, radius_km, google_api_key, max_results, serper_api_key
            )
            if results and len(results) > 0:
                # Vérifier que ce ne sont pas des résultats de fallback
                if not results[0].get("source") == "serper_fallback":
                    return results, "google_places"
        except Exception as e:
            logger.warning(f"⚠️ Google Places failed: {e}")
    
    # Fallback vers Serper
    if serper_api_key:
        results = await _search_via_serper_fallback(
            f"{query} {location}",
            lat, lng, max_results, serper_api_key
        )
        if results:
            return results, "serper_fallback"
    
    return [], "none"
