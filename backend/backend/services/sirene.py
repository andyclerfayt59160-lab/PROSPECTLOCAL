"""
SIRENE Service

Ce module gère les appels à l'API SIRENE (recherche-entreprises.api.gouv.fr)
pour la récupération des données d'entreprises (SIRET, SIREN, NAF, etc.)
"""
import logging
import httpx
from typing import Optional, List

logger = logging.getLogger(__name__)


async def get_sirene_data(name: str, city: str, postal_code: str = "") -> Optional[dict]:
    """
    Récupère les données SIRENE (SIRET, etc.) depuis l'API publique.
    Fait plusieurs tentatives avec différentes stratégies de recherche.
    
    Args:
        name: Nom de l'entreprise
        city: Ville
        postal_code: Code postal (optionnel)
        
    Returns:
        dict avec les données SIRENE ou None si non trouvé:
        {
            "siret": str,
            "siren": str,
            "nom_complet": str,
            "activite_principale": str,
            "libelle_activite": str,
            "adresse": str,
            "code_postal": str,
            "ville": str,
            "date_creation": str,
            "match_score": int,
            "etat_administratif": str,
            "is_closed": bool
        }
    """
    async with httpx.AsyncClient() as http_client:
        # Nettoyer le nom - enlever les formes juridiques courantes
        clean_name = name
        for prefix in ["SAS ", "SARL ", "EURL ", "SA ", "SCI ", "SASU ", "EI "]:
            clean_name = clean_name.replace(prefix, "").replace(prefix.lower(), "")
        clean_name = clean_name.strip()
        
        # Préparer plusieurs variantes de recherche
        search_queries = []
        
        # 1. Nom nettoyé + ville
        search_queries.append(f"{clean_name} {city}")
        
        # 2. Nom original + ville  
        if clean_name != name:
            search_queries.append(f"{name} {city}")
        
        # 3. Nom nettoyé seul
        search_queries.append(clean_name)
        
        # 4. Premiers mots du nom + ville
        words = clean_name.split()
        if len(words) > 1:
            search_queries.append(f"{' '.join(words[:2])} {city}")
        
        # 5. Nom avec apostrophes remplacées
        clean_name_no_apos = clean_name.replace("'", " ").replace("-", " ")
        if clean_name_no_apos != clean_name:
            search_queries.append(f"{clean_name_no_apos} {city}")
        
        for search_query in search_queries:
            try:
                url = "https://recherche-entreprises.api.gouv.fr/search"
                params = {
                    "q": search_query,
                    "per_page": 10,
                }
                
                # Add postal code filter if available
                if postal_code:
                    params["code_postal"] = postal_code
                
                response = await http_client.get(url, params=params, timeout=10.0)
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    
                    if results:
                        # Chercher le meilleur match par nom
                        best_match = None
                        best_score = 0
                        
                        for result in results:
                            nom_complet = result.get("nom_complet", "").lower()
                            nom_raison_sociale = result.get("nom_raison_sociale", "").lower()
                            name_lower = name.lower()
                            clean_name_lower = clean_name.lower()
                            
                            # Score de similarité
                            score = 0
                            
                            # Match exact ou partiel
                            if clean_name_lower in nom_complet or nom_complet in clean_name_lower:
                                score = 100
                            elif clean_name_lower in nom_raison_sociale or nom_raison_sociale in clean_name_lower:
                                score = 90
                            else:
                                # Compter les mots communs
                                name_words = set(clean_name_lower.replace("'", " ").replace("-", " ").split())
                                result_words = set(nom_complet.replace("'", " ").replace("-", " ").split())
                                common = name_words & result_words
                                # Exclure les mots très courts
                                common = {w for w in common if len(w) > 2}
                                score = len(common) * 25
                            
                            # Bonus si même ville
                            result_city = result.get("siege", {}).get("libelle_commune", "").lower()
                            if city.lower() in result_city or result_city in city.lower():
                                score += 30
                            
                            # Bonus si même code postal
                            result_cp = result.get("siege", {}).get("code_postal", "")
                            if postal_code and postal_code == result_cp:
                                score += 20
                            
                            if score > best_score:
                                best_score = score
                                best_match = result
                        
                        if best_match and best_score >= 40:
                            # Vérifier l'état administratif (A = Actif, F = Fermé/Radié)
                            etat_admin = best_match.get("etat_administratif", "A")
                            is_closed = etat_admin == "F" or best_match.get("statut_diffusion") == "N"
                            
                            logger.info(f"✓ SIRET trouvé pour '{name}' via '{search_query}' (score: {best_score}, etat: {etat_admin})")
                            return {
                                "siret": best_match.get("siege", {}).get("siret"),
                                "siren": best_match.get("siren"),
                                "nom_complet": best_match.get("nom_complet"),
                                "activite_principale": best_match.get("activite_principale"),
                                "libelle_activite": best_match.get("libelle_activite_principale"),
                                "adresse": best_match.get("siege", {}).get("adresse"),
                                "code_postal": best_match.get("siege", {}).get("code_postal"),
                                "ville": best_match.get("siege", {}).get("libelle_commune"),
                                "date_creation": best_match.get("date_creation"),
                                "match_score": best_score,
                                "etat_administratif": etat_admin,
                                "is_closed": is_closed,
                            }
            except Exception as e:
                logger.debug(f"Erreur API SIRENE pour '{search_query}': {e}")
                continue
    
    logger.info(f"✗ Aucun SIRET trouvé pour '{name}' ({city})")
    return None


async def get_annuaire_entreprises_data(
    siret: str = None, 
    siren: str = None, 
    name: str = None, 
    city: str = None
) -> dict:
    """
    Récupère les données depuis l'API Annuaire Entreprises (data.gouv.fr).
    Plus complet que la simple recherche, inclut les établissements.
    
    Args:
        siret: Numéro SIRET (14 chiffres)
        siren: Numéro SIREN (9 chiffres)
        name: Nom de l'entreprise (si pas de SIRET/SIREN)
        city: Ville (si recherche par nom)
        
    Returns:
        dict: {
            "email": str,
            "phone": str,
            "dirigeants": list,
            "etablissements": list,
            "tranche_effectif": str,
            "success": bool
        }
    """
    result = {
        "email": None,
        "phone": None,
        "dirigeants": [],
        "etablissements": [],
        "tranche_effectif": None,
        "success": False
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Si on a un SIRET/SIREN, recherche directe
            if siret:
                url = f"https://entreprise.data.gouv.fr/api/sirene/v3/etablissements/{siret}"
            elif siren:
                url = f"https://entreprise.data.gouv.fr/api/sirene/v3/unites_legales/{siren}"
            else:
                # Recherche par nom non supportée ici
                return result
            
            response = await client.get(url)
            
            if response.status_code == 200:
                data = response.json()
                
                if siret and "etablissement" in data:
                    etab = data["etablissement"]
                    result["tranche_effectif"] = etab.get("tranche_effectifs")
                    result["success"] = True
                    
                elif siren and "unite_legale" in data:
                    ul = data["unite_legale"]
                    result["tranche_effectif"] = ul.get("tranche_effectifs_unite_legale")
                    result["success"] = True
                    
        except Exception as e:
            logger.debug(f"Erreur API Annuaire Entreprises: {e}")
    
    return result


async def get_bodacc_data(siren: str) -> dict:
    """
    Récupère les annonces BODACC (créations, cessions, procédures collectives).
    
    Args:
        siren: Numéro SIREN (9 chiffres)
        
    Returns:
        dict: {
            "annonces": list,
            "has_procedure_collective": bool,
            "has_radiation": bool,
            "creation_date": str,
            "success": bool
        }
    """
    result = {
        "annonces": [],
        "has_procedure_collective": False,
        "has_radiation": False,
        "creation_date": None,
        "success": False
    }
    
    if not siren or len(siren) != 9:
        return result
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # API BODACC via data.gouv.fr
            url = f"https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/"
            params = {
                "dataset": "annonces-commerciales",
                "q": f"registre:{siren}",
                "rows": 20,
                "sort": "-dateparution"
            }
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                records = data.get("records", [])
                
                for record in records:
                    fields = record.get("fields", {})
                    annonce = {
                        "type": fields.get("familleavis_lib"),
                        "date": fields.get("dateparution"),
                        "tribunal": fields.get("tribunal"),
                        "description": fields.get("jugement")
                    }
                    result["annonces"].append(annonce)
                    
                    # Détecter les procédures collectives
                    famille = fields.get("familleavis_lib", "").lower()
                    if "liquidation" in famille or "redressement" in famille or "sauvegarde" in famille:
                        result["has_procedure_collective"] = True
                    if "radiation" in famille:
                        result["has_radiation"] = True
                    
                result["success"] = True
                
        except Exception as e:
            logger.debug(f"Erreur API BODACC: {e}")
    
    return result


# Mapping des codes NAF vers des catégories d'activité générales
NAF_CATEGORIES = {
    "construction": ["41", "42", "43"],  # Construction
    "commerce": ["45", "46", "47"],  # Commerce
    "restauration": ["55", "56"],  # Hébergement/restauration
    "beaute": ["96"],  # Services personnels (coiffure, esthétique)
    "sante": ["86", "87", "88"],  # Santé/social
    "auto": ["45.1", "45.2", "45.3", "45.4"],  # Auto/moto
    "immobilier": ["68"],  # Immobilier
    "services": ["69", "70", "71", "72", "73", "74"],  # Services aux entreprises
}


def check_activity_coherence(google_types: list, naf_code: str, naf_label: str) -> dict:
    """
    Vérifie la cohérence entre l'activité Google et le code NAF.
    Retourne un dict avec le statut et un message.
    
    Args:
        google_types: Liste des types Google Places
        naf_code: Code NAF (ex: "43.22A")
        naf_label: Libellé de l'activité NAF
        
    Returns:
        dict: {
            "status": "coherent" | "warning" | "unknown",
            "message": str
        }
    """
    if not naf_code:
        return {"status": "unknown", "message": "Code NAF non disponible"}
    
    # Mapping Google types vers catégories
    google_categories = set()
    type_mappings = {
        "plumber": "construction",
        "electrician": "construction",
        "general_contractor": "construction",
        "roofing_contractor": "construction",
        "restaurant": "restauration",
        "cafe": "restauration",
        "bar": "restauration",
        "hair_care": "beaute",
        "beauty_salon": "beaute",
        "spa": "beaute",
        "car_repair": "auto",
        "car_dealer": "auto",
        "real_estate_agency": "immobilier",
        "doctor": "sante",
        "dentist": "sante",
        "pharmacy": "sante",
        "store": "commerce",
        "shopping_mall": "commerce",
    }
    
    for gt in google_types:
        if gt in type_mappings:
            google_categories.add(type_mappings[gt])
    
    # Trouver la catégorie NAF
    naf_category = None
    naf_prefix = naf_code[:2] if len(naf_code) >= 2 else naf_code
    
    for category, codes in NAF_CATEGORIES.items():
        for code in codes:
            if naf_code.startswith(code) or naf_prefix == code:
                naf_category = category
                break
    
    # Comparer
    if not google_categories:
        return {"status": "unknown", "message": f"Activité: {naf_label or naf_code}"}
    
    if naf_category and naf_category in google_categories:
        return {"status": "coherent", "message": f"Activité confirmée: {naf_label or naf_code}"}
    
    if naf_category:
        return {
            "status": "warning", 
            "message": f"⚠️ Incohérence potentielle: Google={list(google_categories)}, NAF={naf_category} ({naf_label})"
        }
    
    return {"status": "unknown", "message": f"Activité: {naf_label or naf_code}"}
