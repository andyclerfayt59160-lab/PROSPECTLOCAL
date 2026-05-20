"""
Business Enrichment Service

Ce module gère l'enrichissement des données d'entreprises via :
- Google Places API (téléphone, site web, avis, coordonnées)
- Serper API (recherche web, Knowledge Graph)
- Annuaires (PagesJaunes, etc.)
"""
import re
import asyncio
import logging
import httpx
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calcule la similarité entre deux noms d'entreprises.
    Utilise le coefficient de Jaccard sur les mots.
    
    Returns:
        float: Score de similarité entre 0 et 1
    """
    if not name1 or not name2:
        return 0.0
    
    # Normaliser les noms
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()
    
    # Supprimer les caractères spéciaux
    n1 = re.sub(r'[^\w\s]', '', n1)
    n2 = re.sub(r'[^\w\s]', '', n2)
    
    # Séparer en mots
    words1 = set(n1.split())
    words2 = set(n2.split())
    
    # Supprimer les mots très courants
    stop_words = {'sarl', 'sas', 'sa', 'eurl', 'sasu', 'et', 'le', 'la', 'les', 'de', 'du', 'des', 'cie', 'fils'}
    words1 = words1 - stop_words
    words2 = words2 - stop_words
    
    if not words1 or not words2:
        return 0.0
    
    # Coefficient de Jaccard
    intersection = len(words1 & words2)
    union = len(words1 | words2)
    jaccard = intersection / union if union else 0.0
    
    # Bonus si le premier mot correspond
    first1 = n1.split()[0] if n1.split() else ""
    first2 = n2.split()[0] if n2.split() else ""
    bonus = 0.2 if first1 == first2 else 0.0
    
    return min(jaccard + bonus, 1.0)


def normalize_french_phone(phone: str) -> Optional[str]:
    """
    Normalise un numéro de téléphone français.
    
    Args:
        phone: Numéro brut
        
    Returns:
        str: Numéro normalisé (10 chiffres commençant par 0) ou None
    """
    if not phone:
        return None
    
    # Garder uniquement les chiffres
    phone = re.sub(r'\D', '', phone)
    
    # Convertir +33 ou 0033 en 0
    if phone.startswith('33') and len(phone) == 11:
        phone = '0' + phone[2:]
    elif phone.startswith('0033'):
        phone = '0' + phone[4:]
    
    # Valider le format
    if len(phone) == 10 and phone.startswith('0'):
        return phone
    
    return None


async def enrich_with_google_places(
    http_client: httpx.AsyncClient,
    company_name: str,
    city: str,
    postal_code: str,
    google_api_key: str,
    track_usage_callback=None,
    user_id: str = None
) -> dict:
    """
    Enrichit via Google Places API.
    
    Returns:
        dict: {phone, website, google_rating, google_reviews_count, has_google, 
               latitude, longitude, google_place_id, enrichment_source}
    """
    result = {
        "phone": "",
        "website": "",
        "google_rating": 0,
        "google_reviews_count": 0,
        "has_google": False,
        "latitude": None,
        "longitude": None,
        "google_place_id": None,
        "enrichment_source": None
    }
    
    if not google_api_key:
        return result
    
    try:
        # Recherche textuelle
        search_query = f"{company_name} {city}"
        places_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        places_params = {
            "query": search_query,
            "key": google_api_key,
            "language": "fr",
            "region": "fr"
        }
        
        response = await http_client.get(places_url, params=places_params)
        
        # Track usage si callback fourni
        if track_usage_callback and user_id:
            await track_usage_callback(
                user_id=user_id,
                api_type="google",
                endpoint="places_textsearch",
                credits=1,
                success=(response.status_code == 200)
            )
        
        if response.status_code != 200:
            return result
        
        data = response.json()
        places = data.get("results", [])
        
        # Chercher la meilleure correspondance
        for place in places[:5]:
            place_name = place.get("name", "")
            place_address = place.get("formatted_address", "")
            
            # Vérifier la correspondance
            name_similarity = calculate_name_similarity(company_name, place_name)
            city_match = city.lower() in place_address.lower() or (postal_code and postal_code in place_address)
            
            if name_similarity >= 0.5 and city_match:
                place_id = place.get("place_id")
                result["google_place_id"] = place_id
                result["has_google"] = True
                result["google_rating"] = place.get("rating", 0)
                result["google_reviews_count"] = place.get("user_ratings_total", 0)
                
                # Coordonnées
                location = place.get("geometry", {}).get("location", {})
                result["latitude"] = location.get("lat")
                result["longitude"] = location.get("lng")
                
                # Récupérer les détails
                if place_id:
                    details_url = "https://maps.googleapis.com/maps/api/place/details/json"
                    details_params = {
                        "place_id": place_id,
                        "fields": "formatted_phone_number,international_phone_number,website",
                        "key": google_api_key
                    }
                    details_response = await http_client.get(details_url, params=details_params)
                    
                    if track_usage_callback and user_id:
                        await track_usage_callback(
                            user_id=user_id,
                            api_type="google",
                            endpoint="place_details",
                            credits=1,
                            success=(details_response.status_code == 200)
                        )
                    
                    if details_response.status_code == 200:
                        details_data = details_response.json().get("result", {})
                        
                        # Téléphone
                        phone = details_data.get("formatted_phone_number", "") or details_data.get("international_phone_number", "")
                        normalized_phone = normalize_french_phone(phone)
                        if normalized_phone:
                            result["phone"] = normalized_phone
                            result["phone_source"] = "Google Places"
                            result["enrichment_source"] = "google_places"
                        
                        # Site web
                        result["website"] = details_data.get("website", "")
                
                logger.info(f"  ✅ Google Places: {company_name} - Phone: {result['phone'] or 'N/A'}")
                break
                
    except Exception as e:
        logger.warning(f"  ⚠️ Erreur Google Places: {e}")
    
    return result


async def enrich_with_serper(
    http_client: httpx.AsyncClient,
    company_name: str,
    city: str,
    serper_api_key: str,
    track_usage_callback=None,
    user_id: str = None
) -> dict:
    """
    Enrichit via Serper API (recherche Google).
    
    Returns:
        dict: {phone, website, enrichment_source}
    """
    result = {
        "phone": "",
        "website": "",
        "enrichment_source": None
    }
    
    if not serper_api_key:
        return result
    
    try:
        serper_response = await http_client.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": serper_api_key, "Content-Type": "application/json"},
            json={
                "q": f"{company_name} {city} téléphone contact",
                "gl": "fr",
                "hl": "fr",
                "num": 10
            }
        )
        
        if track_usage_callback and user_id:
            await track_usage_callback(
                user_id=user_id,
                api_type="serper",
                endpoint="search",
                credits=1,
                success=(serper_response.status_code == 200)
            )
        
        if serper_response.status_code != 200:
            return result
        
        serper_data = serper_response.json()
        
        # Knowledge Graph - VERIFY LOCATION before using phone
        knowledge_graph = serper_data.get("knowledgeGraph", {})
        if knowledge_graph:
            kg_phone = knowledge_graph.get("phone", "")
            kg_address = knowledge_graph.get("address", "").lower()
            kg_title = knowledge_graph.get("title", "").lower()
            
            # Check if the city matches (CRITICAL to avoid homonyme errors)
            city_matches = False
            if city:
                city_lower = city.lower()
                city_variations = [city_lower, city_lower.replace("-", " "), city_lower.replace(" ", "-")]
                # Also check postal code prefix for region
                postal_prefix = postal_code[:2] if postal_code and len(postal_code) >= 2 else ""
                
                for variation in city_variations:
                    if variation in kg_address or variation in kg_title:
                        city_matches = True
                        break
                
                # Also accept if postal code region matches (e.g., "59" for Nord)
                if postal_prefix and postal_prefix in kg_address:
                    city_matches = True
            
            normalized_phone = normalize_french_phone(kg_phone)
            if normalized_phone and city_matches:
                result["phone"] = normalized_phone
                result["phone_source"] = "Google Knowledge Graph (ville vérifiée)"
                result["phone_confidence"] = "haute"
                result["enrichment_source"] = "knowledge_graph"
                logger.info(f"  ✅ Knowledge Graph: {company_name} ({city}) - Phone: {result['phone']}")
            elif normalized_phone and not city_matches:
                logger.warning(f"  ⚠️ Knowledge Graph REJECTED for {company_name}: phone found but city mismatch (expected: {city}, got: {kg_address})")
            
            if not result.get("website"):
                result["website"] = knowledge_graph.get("website", "")
        
        # Snippets organiques - STRICT matching to avoid wrong phone numbers
        if not result["phone"]:
            for organic_result in serper_data.get("organic", []):
                snippet = organic_result.get("snippet", "")
                title = organic_result.get("title", "")
                link = organic_result.get("link", "")
                
                # Calculate name similarity
                name_similarity = calculate_name_similarity(company_name, title)
                
                # STRICT: Require at least 70% match OR exact name in title
                exact_match = company_name.lower() in title.lower()
                
                # Also check if the city is mentioned (extra validation)
                city_in_snippet = city.lower() in snippet.lower() if city else False
                city_in_title = city.lower() in title.lower() if city else False
                
                # Only proceed if we have a strong match
                if (name_similarity >= 0.7) or (exact_match and (city_in_snippet or city_in_title)):
                    # Patterns téléphone français
                    phone_patterns = [
                        r'(?:0[1-9])(?:[\s.-]?\d{2}){4}',
                        r'(?:\+33|0033)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}',
                    ]
                    for pattern in phone_patterns:
                        phone_match = re.search(pattern, snippet)
                        if phone_match:
                            normalized_phone = normalize_french_phone(phone_match.group())
                            if normalized_phone:
                                result["phone"] = normalized_phone
                                # Mark confidence level
                                confidence = "haute" if name_similarity >= 0.8 or exact_match else "moyenne"
                                result["phone_source"] = f"Recherche Web (confiance {confidence})"
                                result["phone_confidence"] = confidence
                                result["enrichment_source"] = "serper_snippet"
                                logger.info(f"  ✅ Serper Snippet: {company_name} - Phone: {result['phone']} (similarity: {name_similarity:.2f}, confidence: {confidence})")
                                break
                    
                    if result["phone"]:
                        break
                else:
                    # Log when we skip a potential match due to low confidence
                    if name_similarity >= 0.3:
                        logger.debug(f"  ⚠️ Skipped low-confidence match: {company_name} vs '{title}' (similarity: {name_similarity:.2f})")
                    
                    # Site web - can still extract website with lower threshold
                    if not result["website"] and name_similarity >= 0.5:
                        if link and company_name.lower().replace(" ", "") in link.lower().replace("-", "").replace(".", ""):
                            result["website"] = link
                            
    except Exception as e:
        logger.warning(f"  ⚠️ Erreur Serper: {e}")
    
    return result


async def validate_pappers_phone(
    http_client: httpx.AsyncClient,
    company_name: str,
    city: str,
    pappers_phone: str,
    serper_api_key: str,
    track_usage_callback=None,
    user_id: str = None
) -> dict:
    """
    Valide un numéro de téléphone Pappers en le recherchant sur le web.
    
    L'idée est de vérifier si le numéro Pappers apparaît dans d'autres sources
    (Google, annuaires, site web de l'entreprise) pour confirmer sa validité.
    
    Args:
        http_client: Client HTTP
        company_name: Nom de l'entreprise
        city: Ville
        pappers_phone: Numéro de téléphone provenant de Pappers
        serper_api_key: Clé API Serper
        
    Returns:
        dict: {
            "is_validated": bool,
            "phone_confidence": "haute" | "moyenne" | "basse",
            "validation_source": str,
            "alternative_phone": str (si un autre numéro est trouvé)
        }
    """
    result = {
        "is_validated": False,
        "phone_confidence": "basse",
        "validation_source": None,
        "alternative_phone": None
    }
    
    if not serper_api_key or not pappers_phone:
        return result
    
    # Normaliser le numéro Pappers pour la recherche
    normalized_pappers = normalize_french_phone(pappers_phone)
    if not normalized_pappers:
        return result
    
    # Formater le numéro pour la recherche (avec espaces)
    formatted_phone = f"{normalized_pappers[:2]} {normalized_pappers[2:4]} {normalized_pappers[4:6]} {normalized_pappers[6:8]} {normalized_pappers[8:10]}"
    
    try:
        # Recherche 1: Chercher le numéro exact avec le nom de l'entreprise
        serper_response = await http_client.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": serper_api_key, "Content-Type": "application/json"},
            json={
                "q": f'"{formatted_phone}" {company_name}',
                "gl": "fr",
                "hl": "fr",
                "num": 5
            }
        )
        
        if track_usage_callback and user_id:
            await track_usage_callback(
                user_id=user_id,
                api_type="serper",
                endpoint="phone_validation",
                credits=1,
                success=(serper_response.status_code == 200)
            )
        
        if serper_response.status_code == 200:
            serper_data = serper_response.json()
            
            # Vérifier le Knowledge Graph
            kg = serper_data.get("knowledgeGraph", {})
            if kg:
                kg_phone = normalize_french_phone(kg.get("phone", ""))
                if kg_phone == normalized_pappers:
                    result["is_validated"] = True
                    result["phone_confidence"] = "haute"
                    result["validation_source"] = "Google Knowledge Graph"
                    logger.info(f"  ✅ Téléphone Pappers VALIDÉ via Knowledge Graph: {company_name} - {normalized_pappers}")
                    return result
                elif kg_phone and kg_phone != normalized_pappers:
                    # Un autre numéro trouvé dans le Knowledge Graph - potentiellement plus fiable
                    result["alternative_phone"] = kg_phone
                    logger.info(f"  ℹ️ Numéro alternatif trouvé pour {company_name}: {kg_phone} (Pappers: {normalized_pappers})")
            
            # Vérifier les résultats organiques
            organic_results = serper_data.get("organic", [])
            phone_found_count = 0
            
            for organic in organic_results:
                snippet = organic.get("snippet", "")
                title = organic.get("title", "")
                
                # Vérifier que le résultat correspond bien à l'entreprise
                name_similarity = calculate_name_similarity(company_name, title)
                
                if name_similarity >= 0.5 or company_name.lower() in title.lower():
                    # Chercher le numéro Pappers dans le snippet
                    # Normaliser les numéros dans le snippet pour comparaison
                    phone_patterns = [
                        r'(?:0[1-9])(?:[\s.-]?\d{2}){4}',
                        r'(?:\+33|0033)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}',
                    ]
                    
                    for pattern in phone_patterns:
                        matches = re.findall(pattern, snippet)
                        for match in matches:
                            found_phone = normalize_french_phone(match)
                            if found_phone == normalized_pappers:
                                phone_found_count += 1
                                result["validation_source"] = organic.get("link", "Web")
            
            # Si le numéro Pappers est trouvé dans au moins un résultat fiable
            if phone_found_count >= 1:
                result["is_validated"] = True
                result["phone_confidence"] = "moyenne" if phone_found_count == 1 else "haute"
                logger.info(f"  ✅ Téléphone Pappers VALIDÉ ({phone_found_count}x): {company_name} - {normalized_pappers}")
                return result
        
        # Recherche 2: Si pas trouvé, chercher l'entreprise pour voir si un autre numéro existe
        if not result["is_validated"] and not result.get("alternative_phone"):
            serper_response2 = await http_client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": serper_api_key, "Content-Type": "application/json"},
                json={
                    "q": f"{company_name} {city} téléphone",
                    "gl": "fr",
                    "hl": "fr",
                    "num": 5
                }
            )
            
            if track_usage_callback and user_id:
                await track_usage_callback(
                    user_id=user_id,
                    api_type="serper",
                    endpoint="phone_validation_fallback",
                    credits=1,
                    success=(serper_response2.status_code == 200)
                )
            
            if serper_response2.status_code == 200:
                data2 = serper_response2.json()
                kg2 = data2.get("knowledgeGraph", {})
                if kg2:
                    alt_phone = normalize_french_phone(kg2.get("phone", ""))
                    if alt_phone and alt_phone != normalized_pappers:
                        result["alternative_phone"] = alt_phone
                        result["phone_confidence"] = "basse"
                        logger.info(f"  ℹ️ Téléphone Pappers NON VALIDÉ, alternatif trouvé: {company_name} - Pappers: {normalized_pappers}, Google: {alt_phone}")
        
        # Si toujours pas validé
        if not result["is_validated"]:
            logger.info(f"  ⚠️ Téléphone Pappers NON VALIDÉ: {company_name} - {normalized_pappers}")
            
    except Exception as e:
        logger.warning(f"  ⚠️ Erreur validation téléphone: {e}")
    
    return result


async def enrich_business_data(
    company_name: str, 
    city: str, 
    postal_code: str, 
    google_api_key: str, 
    serper_api_key: str,
    user_id: str = None,
    track_usage_callback=None
) -> dict:
    """
    Enrichit les données d'une entreprise via plusieurs sources.
    
    Args:
        company_name: Nom de l'entreprise
        city: Ville
        postal_code: Code postal
        google_api_key: Clé API Google
        serper_api_key: Clé API Serper
        user_id: ID utilisateur pour le tracking
        track_usage_callback: Callback async pour tracker l'usage API
    
    Returns:
        dict: Données enrichies (phone, website, google_rating, etc.)
    """
    result = {
        "phone": "",
        "website": "",
        "google_rating": 0,
        "google_reviews_count": 0,
        "has_google": False,
        "latitude": None,
        "longitude": None,
        "google_place_id": None,
        "enrichment_source": None
    }
    
    logger.info(f"🔍 Enrichissement: {company_name} ({city})")
    
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        # 1. Google Places
        if google_api_key:
            google_result = await enrich_with_google_places(
                http_client, company_name, city, postal_code, 
                google_api_key, track_usage_callback, user_id
            )
            result.update(google_result)
        
        # 2. Serper (si pas de téléphone)
        if not result["phone"] and serper_api_key:
            serper_result = await enrich_with_serper(
                http_client, company_name, city, 
                serper_api_key, track_usage_callback, user_id
            )
            if serper_result["phone"]:
                result["phone"] = serper_result["phone"]
                result["enrichment_source"] = serper_result["enrichment_source"]
            if not result["website"] and serper_result["website"]:
                result["website"] = serper_result["website"]
    
    # Résumé
    if result["phone"]:
        logger.info(f"  📞 Enrichissement réussi: {result['phone']} (source: {result['enrichment_source']})")
    else:
        logger.info(f"  ❌ Aucun téléphone trouvé pour {company_name}")
    
    return result


async def auto_enrich_scan_with_web(
    db,
    scan_id: str,
    user_id: str,
    serper_api_key: str,
    max_businesses: int = 30
):
    """
    Enrichit automatiquement les entreprises sans téléphone d'un scan avec des données web.
    Cette fonction est appelée en arrière-plan après chaque scan.
    
    Args:
        db: Instance de la base de données MongoDB
        scan_id: ID du scan à enrichir
        user_id: ID de l'utilisateur
        serper_api_key: Clé API Serper
        max_businesses: Nombre maximum d'entreprises à enrichir
    """
    if not serper_api_key:
        logger.warning(f"⚠️ No Serper API key for auto-enrichment of scan {scan_id}")
        return
    
    try:
        # Get businesses without phone from this scan
        businesses_to_enrich = await db.businesses.find({
            "scan_id": scan_id,
            "$or": [
                {"phone": None},
                {"phone": ""},
                {"phone": "N/A"}
            ],
            "status": {"$ne": "inexploitable"},
            "web_enriched": {"$ne": True}
        }).to_list(max_businesses)
        
        if not businesses_to_enrich:
            logger.info(f"✅ No businesses to enrich in scan {scan_id}")
            return
        
        logger.info(f"🔄 Auto-enriching {len(businesses_to_enrich)} businesses from scan {scan_id}")
        
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
                                import re
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
        
        # Log results
        logger.info(f"✅ Auto-enrichment complete for scan {scan_id}: {enriched_count} enriched, {phones_found} phones found")
        
        # Update scan with enrichment info
        await db.scans.update_one(
            {"id": scan_id},
            {"$set": {
                "web_enriched": True,
                "web_enriched_at": datetime.utcnow(),
                "web_enriched_phones": phones_found
            }}
        )
        
    except Exception as e:
        logger.error(f"❌ Auto-enrichment error for scan {scan_id}: {e}")


async def enrich_business_full(
    business_id: str,
    name: str,
    city: str,
    postal_code: str,
    website: str,
    siret: str,
    siren: str,
    google_api_key: str,
    serper_api_key: str,
    scrape_website_contacts_func,
    get_bodacc_data_func,
    search_email_via_web_func
) -> dict:
    """
    Enrichissement complet d'une entreprise avec toutes les sources disponibles.
    
    Cette fonction orchestre plusieurs sources d'enrichissement:
    1. Scraping du site web (emails, téléphones, réseaux sociaux)
    2. Données BODACC (procédures collectives, alertes)
    3. Recherche email via web (si non trouvé ailleurs)
    
    Args:
        business_id: ID de l'entreprise
        name: Nom de l'entreprise
        city: Ville
        postal_code: Code postal
        website: URL du site web
        siret: Numéro SIRET
        siren: Numéro SIREN
        google_api_key: Clé API Google (non utilisée actuellement)
        serper_api_key: Clé API Serper
        scrape_website_contacts_func: Fonction de scraping (injectée pour éviter imports circulaires)
        get_bodacc_data_func: Fonction BODACC (injectée)
        search_email_via_web_func: Fonction recherche email (injectée)
        
    Returns:
        dict: {
            "emails_found": List[str],
            "phones_found": List[str],
            "social_links": dict,
            "bodacc_alerts": List[dict],
            "has_procedure_collective": bool,
            "tranche_effectif": str,
            "enrichment_sources": List[str]
        }
    """
    enrichment = {
        "emails_found": [],
        "phones_found": [],
        "social_links": {},
        "bodacc_alerts": [],
        "has_procedure_collective": False,
        "tranche_effectif": None,
        "enrichment_sources": []
    }
    
    # 1. Scraping du site web
    if website:
        logger.info(f"📄 Scraping site web: {website}")
        web_data = await scrape_website_contacts_func(website)
        if web_data["success"]:
            enrichment["emails_found"].extend(web_data["emails"])
            enrichment["phones_found"].extend(web_data["phones"])
            enrichment["social_links"].update(web_data["social_links"])
            enrichment["enrichment_sources"].append("website_scraping")
    
    # 2. Données BODACC (si SIREN disponible)
    if siren:
        logger.info(f"📋 Recherche BODACC pour SIREN: {siren}")
        bodacc = await get_bodacc_data_func(siren)
        if bodacc["success"]:
            enrichment["bodacc_alerts"] = bodacc["annonces"][:5]
            enrichment["has_procedure_collective"] = bodacc["has_procedure_collective"]
            enrichment["enrichment_sources"].append("bodacc")
    
    # 3. Recherche email via web (si pas trouvé ailleurs)
    if not enrichment["emails_found"] and serper_api_key:
        logger.info(f"🔍 Recherche email via web pour: {name}")
        web_emails = await search_email_via_web_func(name, city, serper_api_key)
        enrichment["emails_found"].extend(web_emails)
        if web_emails:
            enrichment["enrichment_sources"].append("web_search_email")
    
    # Dédupliquer
    enrichment["emails_found"] = list(set(enrichment["emails_found"]))[:5]
    enrichment["phones_found"] = list(set(enrichment["phones_found"]))[:3]
    
    logger.info(f"✅ Enrichissement terminé: {len(enrichment['emails_found'])} emails, {len(enrichment['phones_found'])} téléphones")
    
    return enrichment


async def enrich_business_data(
    company_name: str, 
    city: str, 
    postal_code: str, 
    google_api_key: str, 
    serper_api_key: str,
    user_id: str = None,
    track_api_usage_func = None
) -> dict:
    """
    Enrichit les données d'une entreprise Pappers en recherchant sur Internet :
    1. Google Places API - téléphone, site web, avis, rating, coordonnées
    2. Recherche Serper - téléphone dans les snippets Google
    3. Extraction depuis le Knowledge Graph Google
    
    Args:
        company_name: Nom de l'entreprise
        city: Ville
        postal_code: Code postal
        google_api_key: Clé API Google
        serper_api_key: Clé API Serper
        user_id: ID utilisateur pour tracking (optionnel)
        track_api_usage_func: Fonction de tracking API (injectée)
        
    Returns: 
        dict avec phone, website, google_rating, google_reviews, has_google, lat, lng, google_place_id
    """
    result = {
        "phone": "",
        "website": "",
        "google_rating": 0,
        "google_reviews_count": 0,
        "has_google": False,
        "latitude": None,
        "longitude": None,
        "google_place_id": None,
        "enrichment_source": None
    }
    
    logger.info(f"🔍 Enrichissement: {company_name} ({city})")
    
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        # ========== 1. RECHERCHE GOOGLE PLACES ==========
        if google_api_key:
            try:
                # Recherche textuelle sur Google Places
                search_query = f"{company_name} {city}"
                places_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
                places_params = {
                    "query": search_query,
                    "key": google_api_key,
                    "language": "fr",
                    "region": "fr"
                }
                
                response = await http_client.get(places_url, params=places_params)
                
                # Track Google API usage
                if user_id and track_api_usage_func:
                    await track_api_usage_func(
                        user_id=user_id,
                        api_type="google",
                        endpoint="places_textsearch",
                        credits=1,
                        success=(response.status_code == 200)
                    )
                
                if response.status_code == 200:
                    data = response.json()
                    places = data.get("results", [])
                    
                    # Chercher la meilleure correspondance
                    for place in places[:5]:
                        place_name = place.get("name", "")
                        place_address = place.get("formatted_address", "")
                        
                        # Vérifier que c'est bien la même entreprise (nom similaire + même ville)
                        name_similarity = calculate_name_similarity(company_name, place_name)
                        city_match = city.lower() in place_address.lower() or postal_code in place_address
                        
                        if name_similarity >= 0.5 and city_match:
                            place_id = place.get("place_id")
                            result["google_place_id"] = place_id
                            result["has_google"] = True
                            result["google_rating"] = place.get("rating", 0)
                            result["google_reviews_count"] = place.get("user_ratings_total", 0)
                            
                            # Coordonnées
                            location = place.get("geometry", {}).get("location", {})
                            result["latitude"] = location.get("lat")
                            result["longitude"] = location.get("lng")
                            
                            # Récupérer les détails (téléphone, site web) via Place Details
                            if place_id:
                                details_url = "https://maps.googleapis.com/maps/api/place/details/json"
                                details_params = {
                                    "place_id": place_id,
                                    "fields": "formatted_phone_number,international_phone_number,website",
                                    "key": google_api_key
                                }
                                details_response = await http_client.get(details_url, params=details_params)
                                
                                # Track Google Place Details API usage
                                if user_id and track_api_usage_func:
                                    await track_api_usage_func(
                                        user_id=user_id,
                                        api_type="google",
                                        endpoint="place_details",
                                        credits=1,
                                        success=(details_response.status_code == 200)
                                    )
                                
                                if details_response.status_code == 200:
                                    details_data = details_response.json().get("result", {})
                                    
                                    # Téléphone
                                    phone = details_data.get("formatted_phone_number", "") or details_data.get("international_phone_number", "")
                                    if phone:
                                        # Normaliser le téléphone français
                                        phone = re.sub(r'\D', '', phone)
                                        if phone.startswith('33'):
                                            phone = '0' + phone[2:]
                                        if len(phone) == 10 and phone.startswith('0'):
                                            result["phone"] = phone
                                            result["enrichment_source"] = "google_places"
                                    
                                    # Site web
                                    result["website"] = details_data.get("website", "")
                            
                            logger.info(f"  ✅ Google Places: trouvé! Phone: {result['phone'] or 'N/A'}, Rating: {result['google_rating']}")
                            break
                            
            except Exception as e:
                logger.warning(f"  ⚠️ Erreur Google Places: {e}")
        
        # ========== 2. RECHERCHE SERPER (si pas de téléphone trouvé) ==========
        if not result["phone"] and serper_api_key:
            try:
                # Recherche Google via Serper
                serper_response = await http_client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": serper_api_key, "Content-Type": "application/json"},
                    json={
                        "q": f"{company_name} {city} téléphone contact",
                        "gl": "fr",
                        "hl": "fr",
                        "num": 10
                    }
                )
                
                # Track Serper API usage
                if user_id and track_api_usage_func:
                    await track_api_usage_func(
                        user_id=user_id,
                        api_type="serper",
                        endpoint="search",
                        credits=1,
                        success=(serper_response.status_code == 200)
                    )
                
                if serper_response.status_code == 200:
                    serper_data = serper_response.json()
                    
                    # Chercher dans le Knowledge Graph
                    knowledge_graph = serper_data.get("knowledgeGraph", {})
                    if knowledge_graph:
                        kg_phone = knowledge_graph.get("phone", "")
                        if kg_phone:
                            phone = re.sub(r'\D', '', kg_phone)
                            if phone.startswith('33'):
                                phone = '0' + phone[2:]
                            if len(phone) == 10 and phone.startswith('0'):
                                result["phone"] = phone
                                result["enrichment_source"] = "knowledge_graph"
                                logger.info(f"  ✅ Knowledge Graph: Phone {result['phone']}")
                        
                        # Site web depuis Knowledge Graph
                        if not result["website"]:
                            result["website"] = knowledge_graph.get("website", "")
                    
                    # Chercher dans les snippets des résultats organiques
                    if not result["phone"]:
                        for organic_result in serper_data.get("organic", []):
                            snippet = organic_result.get("snippet", "")
                            title = organic_result.get("title", "")
                            
                            # Vérifier que le résultat correspond à notre entreprise
                            if calculate_name_similarity(company_name, title) >= 0.4 or company_name.lower() in title.lower():
                                # Chercher un numéro de téléphone français
                                phone_patterns = [
                                    r'(?:0[1-9])(?:[\s.-]?\d{2}){4}',  # 01 23 45 67 89
                                    r'(?:\+33|0033)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}',  # +33 1 23 45 67 89
                                ]
                                for pattern in phone_patterns:
                                    phone_match = re.search(pattern, snippet)
                                    if phone_match:
                                        phone = re.sub(r'\D', '', phone_match.group())
                                        if phone.startswith('33'):
                                            phone = '0' + phone[2:]
                                        if len(phone) == 10 and phone.startswith('0'):
                                            result["phone"] = phone
                                            result["enrichment_source"] = "serper_snippet"
                                            logger.info(f"  ✅ Serper Snippet: Phone {result['phone']}")
                                            break
                                if result["phone"]:
                                    break
                            
                            # Chercher un site web si pas encore trouvé
                            if not result["website"]:
                                link = organic_result.get("link", "")
                                if link and company_name.lower().replace(" ", "") in link.lower().replace("-", "").replace(".", ""):
                                    result["website"] = link
                                    
            except Exception as e:
                logger.warning(f"  ⚠️ Erreur Serper: {e}")
        
        # ========== 3. RECHERCHE ANNUAIRE (fallback) ==========
        if not result["phone"] and serper_api_key:
            try:
                # Recherche spécifique sur les annuaires
                annuaire_response = await http_client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": serper_api_key, "Content-Type": "application/json"},
                    json={
                        "q": f"site:pagesjaunes.fr OR site:118712.fr OR site:infobel.com \"{company_name}\" {city}",
                        "gl": "fr",
                        "hl": "fr",
                        "num": 5
                    }
                )
                
                if annuaire_response.status_code == 200:
                    annuaire_data = annuaire_response.json()
                    for annuaire_result in annuaire_data.get("organic", []):
                        snippet = annuaire_result.get("snippet", "")
                        phone_match = re.search(r'(?:0[1-9])(?:[\s.-]?\d{2}){4}', snippet)
                        if phone_match:
                            phone = re.sub(r'\D', '', phone_match.group())
                            if len(phone) == 10 and phone.startswith('0'):
                                result["phone"] = phone
                                result["enrichment_source"] = "annuaire"
                                logger.info(f"  ✅ Annuaire: Phone {result['phone']}")
                                break
                                
            except Exception as e:
                logger.warning(f"  ⚠️ Erreur Annuaire: {e}")
    
    # Résumé
    if result["phone"]:
        logger.info(f"  📞 Enrichissement réussi: {result['phone']} (source: {result['enrichment_source']})")
    else:
        logger.info(f"  ❌ Aucun téléphone trouvé pour {company_name}")
    
    return result
