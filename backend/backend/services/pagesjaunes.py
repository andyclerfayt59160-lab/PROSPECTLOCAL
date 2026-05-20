"""
PagesJaunes Service

Ce module gère la détection et vérification de présence sur PagesJaunes
via recherche Serper API et croisement avec les données SIRENE.
"""
import logging
import httpx
from typing import Optional, Tuple
from urllib.parse import quote_plus

from utils.helpers import calculate_name_similarity
from services.sirene import get_sirene_data

logger = logging.getLogger(__name__)

# Clé Serper globale (peut être overridée par paramètre)
SERPER_API_KEY = None


def set_serper_api_key(key: str):
    """Configure la clé Serper API globale pour ce module."""
    global SERPER_API_KEY
    SERPER_API_KEY = key


async def check_pagesjaunes_direct(
    name: str, 
    city: str, 
    serper_api_key: str = None
) -> Tuple[bool, Optional[str], float, str]:
    """
    Vérifie si l'entreprise existe sur pagesjaunes.fr via une recherche Google (Serper API)
    
    AMÉLIORATION : Vérifie que le résultat PagesJaunes correspond VRAIMENT à l'entreprise
    en comparant le nom dans le titre/snippet avec le nom recherché.
    
    Args:
        name: Nom de l'entreprise
        city: Ville
        serper_api_key: Clé API Serper (optionnel, utilise la clé globale sinon)
        
    Returns: 
        Tuple[bool, Optional[str], float, str]:
        - has_pagesjaunes: Booléen indiquant si trouvé
        - url: URL de la fiche PagesJaunes
        - confidence: Score de confiance (0.0-1.0)
        - pj_status: "confirmed", "not_found", "to_verify"
    """
    
    # Utiliser la clé passée en paramètre ou la clé globale
    api_key = serper_api_key or SERPER_API_KEY
    
    # Si pas de clé Serper, retourner "to_verify"
    if not api_key:
        logger.warning(f"[PJ Check] Pas de clé Serper - {name} marqué 'to_verify'")
        search_url = f"https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui={quote_plus(name)}&ou={quote_plus(city)}"
        return False, search_url, 0.0, "to_verify"
    
    try:
        # Nettoyer le nom pour la recherche
        clean_name = name.replace("'", " ").replace('"', " ").strip()
        clean_city = city.replace("'", " ").strip() if city else ""
        
        # Requête plus précise : site:pagesjaunes.fr + nom + ville
        search_query = f'site:pagesjaunes.fr/pros "{clean_name}" {clean_city}'
        
        async with httpx.AsyncClient() as http_client:
            headers = {
                "X-API-KEY": api_key,
                "Content-Type": "application/json"
            }
            
            data = {
                "q": search_query,
                "gl": "fr",
                "hl": "fr",
                "num": 5  # Moins de résultats car plus ciblés
            }
            
            try:
                response = await http_client.post(
                    "https://google.serper.dev/search",
                    headers=headers,
                    json=data,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    results = response.json()
                    organic = results.get("organic", [])
                    
                    best_match = None
                    best_similarity = 0.0
                    
                    # Analyser chaque résultat PagesJaunes
                    for result in organic[:5]:
                        link = result.get("link", "")
                        title = result.get("title", "")
                        snippet = result.get("snippet", "")
                        
                        # Vérifier que c'est bien une fiche PagesJaunes
                        if "pagesjaunes.fr/pros/" not in link.lower():
                            continue
                        
                        # Extraire le nom de l'entreprise du titre PagesJaunes
                        # Format typique: "Nom Entreprise - Ville 12345 - PagesJaunes"
                        pj_name = title.split(" - ")[0] if " - " in title else title
                        
                        # Calculer la similarité avec le nom recherché
                        similarity = calculate_name_similarity(clean_name, pj_name)
                        
                        # Vérifier aussi si la ville est mentionnée dans le titre ou snippet
                        city_in_result = clean_city.lower() in title.lower() or clean_city.lower() in snippet.lower()
                        
                        # Bonus si la ville correspond
                        if city_in_result:
                            similarity += 0.1
                        
                        logger.debug(f"[PJ Check] Comparaison: '{clean_name}' vs '{pj_name}' = {similarity:.2f} (ville: {city_in_result})")
                        
                        if similarity > best_similarity:
                            best_similarity = similarity
                            best_match = {
                                "link": link,
                                "title": title,
                                "similarity": similarity,
                                "city_match": city_in_result
                            }
                    
                    # SEUIL STRICT : Similarité >= 0.6 ET (similarité >= 0.8 OU ville confirmée)
                    if best_match and best_similarity >= 0.6:
                        if best_similarity >= 0.8 or best_match["city_match"]:
                            logger.info(f"[PJ Check] ✅ {name} - CONFIRMÉ sur PagesJaunes (sim={best_similarity:.2f}): {best_match['link']}")
                            return True, best_match["link"], best_similarity, "confirmed"
                        else:
                            # Similarité moyenne sans confirmation ville -> à vérifier
                            logger.info(f"[PJ Check] ⚠️ {name} - POSSIBLE sur PagesJaunes mais à vérifier (sim={best_similarity:.2f})")
                            return False, best_match["link"], best_similarity, "to_verify"
                    
                    # Pas de correspondance suffisante
                    logger.info(f"[PJ Check] ❌ {name} - NON trouvé sur PagesJaunes (meilleur score: {best_similarity:.2f})")
                    return False, None, 0.90, "not_found"
                    
                elif response.status_code == 401:
                    logger.error(f"[PJ Check] Clé Serper invalide")
                    search_url = f"https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui={quote_plus(clean_name)}&ou={quote_plus(clean_city)}"
                    return False, search_url, 0.0, "to_verify"
                    
                elif response.status_code == 429:
                    logger.warning(f"[PJ Check] Quota Serper dépassé")
                    search_url = f"https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui={quote_plus(clean_name)}&ou={quote_plus(clean_city)}"
                    return False, search_url, 0.0, "to_verify"
                    
                else:
                    logger.warning(f"[PJ Check] Erreur Serper: {response.status_code}")
                    search_url = f"https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui={quote_plus(clean_name)}&ou={quote_plus(clean_city)}"
                    return False, search_url, 0.0, "to_verify"
                    
            except httpx.TimeoutException:
                logger.warning(f"[PJ Check] Timeout Serper pour {name}")
                search_url = f"https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui={quote_plus(clean_name)}&ou={quote_plus(clean_city)}"
                return False, search_url, 0.0, "to_verify"
                
    except Exception as e:
        logger.error(f"[PJ Check] Erreur pour {name}: {e}")
        return False, None, 0.0, "to_verify"


async def detect_pagesjaunes_presence(
    name: str, 
    phone: str, 
    city: str, 
    postal_code: str = "", 
    serper_api_key: str = None
) -> Tuple[bool, Optional[str], float, str, Optional[dict]]:
    """
    Détecte la présence sur PagesJaunes en combinant plusieurs méthodes:
    1. Récupère les données SIRENE pour le SIRET
    2. Vérifie directement sur PagesJaunes
    3. Si pas trouvé, essaie avec le nom SIRENE
    
    Args:
        name: Nom de l'entreprise
        phone: Numéro de téléphone
        city: Ville
        postal_code: Code postal
        serper_api_key: Clé API Serper
        
    Returns: 
        Tuple[bool, Optional[str], float, str, Optional[dict]]:
        - has_pagesjaunes: Booléen
        - url: URL de la fiche
        - confidence: Score de confiance
        - pj_status: Statut
        - sirene_data: Données SIRENE si trouvées
    """
    
    # 1. D'abord récupérer les données SIRENE (pour le SIRET)
    sirene_data = await get_sirene_data(name, city, postal_code)
    
    # 2. Vérification directe sur PagesJaunes
    has_pj, pj_url, confidence, pj_status = await check_pagesjaunes_direct(name, city, serper_api_key)
    
    if has_pj:
        logger.info(f"✓ PJ CONFIRMÉ pour {name}: {pj_url}")
        return True, pj_url, confidence, pj_status, sirene_data
    
    # 3. Si pas trouvé avec le nom complet, essayer avec le nom SIRENE
    if sirene_data and sirene_data.get("nom_complet"):
        sirene_name = sirene_data["nom_complet"]
        if sirene_name.lower() != name.lower():
            logger.info(f"[PJ Check] Tentative avec nom SIRENE: {sirene_name}")
            has_pj_sirene, pj_url_sirene, conf_sirene, status_sirene = await check_pagesjaunes_direct(
                sirene_name, 
                sirene_data.get("ville", city),
                serper_api_key
            )
            if has_pj_sirene:
                logger.info(f"✓ PJ trouvé via SIRENE pour {name}")
                return True, pj_url_sirene, conf_sirene, status_sirene, sirene_data
    
    logger.info(f"✗ PJ NON trouvé pour {name}")
    return False, None, confidence, pj_status, sirene_data
