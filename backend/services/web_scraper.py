"""
Web Scraper Service

Ce module gère le scraping de sites web pour extraire les coordonnées
de contact (téléphones, emails, réseaux sociaux).
"""
import re
import asyncio
import logging
import httpx
import unicodedata
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from bs4 import BeautifulSoup

from utils.helpers import (
    extract_emails_from_text,
    extract_phones_from_text,
    normalize_phone,
    EMAIL_PATTERN,
    is_directory_listing_url,
    is_probable_business_website,
)

logger = logging.getLogger(__name__)


WEB_SCAN_DOMAIN_LABELS = {
    "habitat": "Habitat",
    "commerce": "Commerce",
    "restauration": "Restauration",
    "auto": "Auto/Moto",
    "beaute": "Beaute/Bien-etre",
    "sante": "Sante",
    "services": "Services",
    "tech": "Tech/Digital",
}

WEB_SCAN_DOMAIN_FAMILY_KEYS = {
    "habitat": ["habitat"],
    "commerce": ["commerce"],
    "restauration": ["restauration"],
    "auto": ["auto"],
    "beaute": ["beaute"],
    "sante": ["sante"],
    "services": ["b2b", "autre"],
    "tech": ["b2b"],
}


def _normalize_family_key(family: str) -> str:
    return (
        unicodedata.normalize("NFD", family or "")
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )


def get_web_scan_source_query_count(
    include_facebook: bool = True,
    include_linkedin: bool = True,
    include_websites: bool = True,
) -> int:
    count = 0
    if include_websites:
        count += 2
    if include_facebook:
        count += 1
    if include_linkedin:
        count += 1
    return count


def build_web_scan_search_queries(
    query: str,
    location: str,
    include_facebook: bool = True,
    include_linkedin: bool = True,
    include_websites: bool = True,
) -> List[str]:
    search_queries: List[str] = []
    base_query = f"{query} {location}".strip()

    if include_websites:
        search_queries.append(f"{base_query} contact telephone")
        search_queries.append(f"{base_query} artisan professionnel")
    if include_facebook:
        search_queries.append(f"site:facebook.com {base_query}")
    if include_linkedin:
        search_queries.append(f"site:linkedin.com/company {base_query}")

    return search_queries


def build_web_domain_activity_payload(
    activities: List[Dict[str, Any]],
    selected_domains: List[str],
    domain_mode: str = "quick",
) -> Dict[str, Any]:
    families_by_key: Dict[str, str] = {}
    activities_by_family: Dict[str, List[str]] = {}

    for activity in activities:
        family = activity.get("family") or ""
        label = (activity.get("label") or "").strip()
        if not family or not label:
            continue
        family_key = _normalize_family_key(family)
        families_by_key.setdefault(family_key, family)
        activities_by_family.setdefault(family, []).append(label)

    resolved_families = list(
        dict.fromkeys(
            families_by_key[family_key]
            for domain_id in selected_domains
            for family_key in WEB_SCAN_DOMAIN_FAMILY_KEYS.get(domain_id, [])
            if family_key in families_by_key
        )
    )

    available_activity_labels = list(
        dict.fromkeys(
            label
            for family in resolved_families
            for label in sorted(activities_by_family.get(family, []), key=str.lower)
        )
    )

    if domain_mode == "exhaustive":
        selected_activity_labels = available_activity_labels
        queries = selected_activity_labels[:]
    else:
        max_per_family = 3 if len(resolved_families) > 1 else 6
        selected_activity_labels = list(
            dict.fromkeys(
                label
                for family in resolved_families
                for label in sorted(activities_by_family.get(family, []), key=str.lower)[:max_per_family]
            )
        )
        queries = [' OR '.join(f'"{label}"' for label in selected_activity_labels)] if selected_activity_labels else []

    query_label = ", ".join(
        WEB_SCAN_DOMAIN_LABELS.get(domain_id, domain_id.title())
        for domain_id in selected_domains
    )

    return {
        "resolved_families": resolved_families,
        "available_activity_count": len(available_activity_labels),
        "selected_activity_count": len(selected_activity_labels),
        "selected_activity_labels": selected_activity_labels,
        "queries": queries,
        "query_label": query_label,
    }


async def scrape_website_contacts(website_url: str) -> dict:
    """
    Scrape un site web pour extraire les coordonnées de contact.
    Cherche dans la page d'accueil + pages contact/mentions légales.
    
    Args:
        website_url: URL du site web à scraper
        
    Returns:
        dict: {
            "emails": List[str],
            "phones": List[str],
            "social_links": {"facebook": str, "linkedin": str, "instagram": str},
            "success": bool
        }
    """
    result = {
        "emails": [],
        "phones": [],
        "social_links": {},
        "success": False
    }
    
    if not website_url:
        return result
    
    # Normaliser l'URL
    if not website_url.startswith('http'):
        website_url = f'https://{website_url}'
    
    try:
        parsed = urlparse(website_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
    except:
        return result

    if is_directory_listing_url(website_url):
        logger.info(f"Skipping directory listing scraping for {website_url}")
        return result
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    }
    
    # Pages à scraper
    pages_to_check = [
        website_url,
        f"{base_url}/contact",
        f"{base_url}/contact.html",
        f"{base_url}/contactez-nous",
        f"{base_url}/nous-contacter",
        f"{base_url}/mentions-legales",
        f"{base_url}/mentions",
        f"{base_url}/a-propos",
        f"{base_url}/about"
    ]
    
    all_emails = []
    all_phones = []
    
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for page_url in pages_to_check[:5]:  # Limiter à 5 pages
            try:
                response = await client.get(page_url, headers=headers)
                
                if response.status_code == 200:
                    html = response.text
                    soup = BeautifulSoup(html, 'lxml')
                    
                    # Supprimer scripts et styles
                    for tag in soup(['script', 'style', 'noscript']):
                        tag.decompose()
                    
                    text = soup.get_text(separator=' ')
                    
                    # Extraire emails
                    emails = extract_emails_from_text(text)
                    all_emails.extend(emails)
                    
                    # Chercher aussi dans les liens mailto:
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        if 'mailto:' in href:
                            email = href.replace('mailto:', '').split('?')[0]
                            if EMAIL_PATTERN.match(email):
                                all_emails.append(email.lower())
                    
                    # Extraire téléphones
                    phones = extract_phones_from_text(text)
                    all_phones.extend(phones)
                    
                    # Chercher dans les liens tel:
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        if 'tel:' in href:
                            phone = href.replace('tel:', '').replace(' ', '')
                            normalized = normalize_phone(phone)
                            if normalized:
                                all_phones.append(normalized)
                    
                    # Réseaux sociaux
                    for link in soup.find_all('a', href=True):
                        href = link['href'].lower()
                        if 'facebook.com' in href and 'facebook' not in result["social_links"]:
                            result["social_links"]["facebook"] = link['href']
                        elif 'linkedin.com' in href and 'linkedin' not in result["social_links"]:
                            result["social_links"]["linkedin"] = link['href']
                        elif 'instagram.com' in href and 'instagram' not in result["social_links"]:
                            result["social_links"]["instagram"] = link['href']
                    
                    result["success"] = True
                    
            except Exception as e:
                logger.debug(f"Erreur scraping {page_url}: {e}")
                continue
            
            # Petite pause pour éviter le rate limiting
            await asyncio.sleep(0.2)
    
    # Dédupliquer et retourner
    result["emails"] = list(set(all_emails))[:5]  # Max 5 emails
    result["phones"] = list(set(all_phones))[:3]  # Max 3 téléphones
    
    return result


async def search_email_via_web(
    company_name: str, 
    city: str, 
    serper_api_key: str
) -> List[str]:
    """
    Recherche l'email d'une entreprise via une recherche web (Serper API).
    
    Args:
        company_name: Nom de l'entreprise
        city: Ville
        serper_api_key: Clé API Serper
        
    Returns:
        List[str]: Liste des emails trouvés
    """
    emails_found = []
    
    if not serper_api_key or not company_name:
        return emails_found
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Recherche email via Serper
            search_query = f"{company_name} {city} email contact"
            
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
                    "num": 10
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Chercher dans Knowledge Graph
                kg = data.get("knowledgeGraph", {})
                if kg:
                    # Parfois l'email est dans les attributs
                    for key, value in kg.items():
                        if isinstance(value, str) and EMAIL_PATTERN.match(value):
                            emails_found.append(value.lower())
                
                # Chercher dans les résultats organiques
                for result in data.get("organic", []):
                    snippet = result.get("snippet", "")
                    title = result.get("title", "")
                    
                    # Extraire emails du snippet
                    emails = extract_emails_from_text(snippet)
                    emails_found.extend(emails)
                    
                    # Parfois l'email est dans le titre
                    emails_title = extract_emails_from_text(title)
                    emails_found.extend(emails_title)
                
                # Chercher dans les "siteLinks"
                for sitelink in data.get("sitelinks", []):
                    snippet = sitelink.get("snippet", "")
                    emails = extract_emails_from_text(snippet)
                    emails_found.extend(emails)
                    
    except Exception as e:
        logger.warning(f"Erreur recherche email web: {e}")
    
    # Dédupliquer et filtrer les emails de mauvaise qualité
    unique_emails = list(set(emails_found))
    
    # Filtrer les emails génériques ou de mauvaise qualité
    filtered_emails = [
        email for email in unique_emails
        if not any(domain in email for domain in ['example.com', 'test.com', 'localhost'])
    ]
    
    return filtered_emails[:5]  # Max 5 emails


async def extract_business_from_serper_result(
    result: dict, 
    query: str, 
    location: str
) -> Optional[dict]:
    """
    Extrait les informations d'une entreprise depuis un résultat de recherche Serper.
    Identifie si c'est une page business (Facebook, LinkedIn, site web) et extrait les contacts.
    
    Args:
        result: Résultat de recherche Serper (organic result)
        query: Terme de recherche original
        location: Localisation de la recherche
        
    Returns:
        dict: Données de l'entreprise ou None si non pertinent
    """
    link = result.get("link", "")
    title = result.get("title", "")
    snippet = result.get("snippet", "")
    
    # Skip irrelevant results
    skip_domains = [
        "wikipedia.org",
        "youtube.com",
        "amazon.",
        "ebay.",
        "leboncoin.fr",
        "indeed.com",
        "pole-emploi.fr",
        "kompass.com",
        "societe.com",
        "pappers.fr",
        "pagesjaunes.fr",
        "google.com",
        "bing.com",
        "travaux.com",
        "mestravaux.com",
        "habitatpresto.com",
        "rdvartisans.fr",
        "123devis.com",
        "allovoisins.com",
        "starofservice.com",
        "houzz.fr",
    ]
    
    if any(domain in link.lower() for domain in skip_domains):
        return None
    
    business_data = {
        "name": "",
        "phone": None,
        "email": None,
        "website_url": None,
        "address": None,
        "city": location,
        "source": "web_scan",
        "source_url": link,
        "source_type": "website",  # facebook, linkedin, website
        "raw_snippet": snippet
    }
    
    # Detect source type
    if "facebook.com" in link.lower():
        business_data["source_type"] = "facebook"
        # Extract name from Facebook page title
        name = title.replace(" | Facebook", "").replace(" - Facebook", "").strip()
        business_data["name"] = name
        business_data["facebook_url"] = link
    elif "linkedin.com" in link.lower():
        business_data["source_type"] = "linkedin"
        name = title.replace(" | LinkedIn", "").replace(" - LinkedIn", "").strip()
        business_data["name"] = name
        business_data["linkedin_url"] = link
    else:
        business_data["source_type"] = "directory" if is_directory_listing_url(link) else "website"
        business_data["name"] = title.split(" - ")[0].split(" | ")[0].strip()
        if is_probable_business_website(link):
            business_data["website_url"] = link
    
    # Extract phone from snippet using regex
    phone_patterns = [
        r'(?:(?:\+33|0033|0)[1-9])(?:[\s.-]?\d{2}){4}',  # French phone
        r'\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}',  # 10 digits with separators
    ]
    
    for pattern in phone_patterns:
        match = re.search(pattern, snippet)
        if match:
            phone = match.group()
            # Normalize phone
            normalized = re.sub(r'[\s.-]', '', phone)
            if len(normalized) >= 10:
                business_data["phone"] = normalized
                break
    
    # Extract email from snippet
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    email_match = re.search(email_pattern, snippet)
    if email_match:
        business_data["email"] = email_match.group()
    
    # Skip if no name
    if not business_data["name"] or len(business_data["name"]) < 2:
        return None
    
    return business_data


async def search_web_for_businesses(
    query: str,
    location: str,
    serper_api_key: str,
    max_results: int = 50,
    include_facebook: bool = True,
    include_linkedin: bool = True,
    include_websites: bool = True
) -> List[dict]:
    """
    Recherche sur le web via Serper API pour trouver des entreprises.
    
    Args:
        query: Terme de recherche (ex: "plombier")
        location: Localisation (ex: "Lille")
        serper_api_key: Clé API Serper
        max_results: Nombre maximum de résultats
        include_facebook: Inclure les pages Facebook
        include_linkedin: Inclure les profils LinkedIn
        include_websites: Inclure les sites web
        
    Returns:
        List[dict]: Liste des entreprises trouvées
    """
    if not serper_api_key:
        return []
    
    all_businesses = []
    seen_names = set()  # Deduplicate by name
    
    # Build search queries
    search_queries = []
    base_query = f"{query} {location}"
    
    # General web search
    if include_websites:
        search_queries.append(f"{base_query} contact téléphone")
        search_queries.append(f"{base_query} artisan professionnel")
    
    # Facebook-specific searches
    if include_facebook:
        search_queries.append(f"site:facebook.com {base_query}")
    
    # LinkedIn-specific searches  
    if include_linkedin:
        search_queries.append(f"site:linkedin.com/company {base_query}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for search_query in search_queries:
            try:
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
                        "num": 20  # Results per query
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    organic_results = data.get("organic", [])
                    
                    for result in organic_results:
                        business = await extract_business_from_serper_result(result, query, location)
                        
                        if business and business["name"]:
                            # Deduplicate by normalized name
                            name_key = business["name"].lower().strip()
                            if name_key not in seen_names:
                                seen_names.add(name_key)
                                all_businesses.append(business)
                                
                                if len(all_businesses) >= max_results:
                                    break
                    
                    if len(all_businesses) >= max_results:
                        break
                        
                else:
                    logger.warning(f"Serper API error: {response.status_code}")
                    
            except Exception as e:
                logger.error(f"Error in web search: {e}")
                continue
            
            # Small delay between queries to avoid rate limiting
            await asyncio.sleep(0.5)
    
    return all_businesses[:max_results]


async def search_web_for_businesses_with_metadata(
    query: str,
    location: str,
    serper_api_key: str,
    max_results: int = 50,
    include_facebook: bool = True,
    include_linkedin: bool = True,
    include_websites: bool = True,
) -> Dict[str, Any]:
    search_queries = build_web_scan_search_queries(
        query=query,
        location=location,
        include_facebook=include_facebook,
        include_linkedin=include_linkedin,
        include_websites=include_websites,
    )
    if not serper_api_key:
        return {
            "businesses": [],
            "requests_used": 0,
            "search_queries": search_queries,
        }

    businesses: List[Dict[str, Any]] = []
    seen_names = set()
    requests_used = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        for search_query in search_queries:
            try:
                requests_used += 1
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
                        "num": 20
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    for result in data.get("organic", []):
                        business = await extract_business_from_serper_result(result, query, location)
                        if business and business["name"]:
                            name_key = business["name"].lower().strip()
                            if name_key not in seen_names:
                                seen_names.add(name_key)
                                businesses.append(business)
                                if len(businesses) >= max_results:
                                    break

                    if len(businesses) >= max_results:
                        break
                else:
                    logger.warning(f"Serper API error: {response.status_code}")
            except Exception as exc:
                logger.error(f"Error in web search metadata mode: {exc}")
                continue

            await asyncio.sleep(0.5)

    return {
        "businesses": businesses,
        "requests_used": requests_used,
        "search_queries": search_queries,
    }
