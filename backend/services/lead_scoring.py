from datetime import datetime

from utils.helpers import (
    has_confirmed_pagesjaunes_presence,
    is_confirmed_pagesjaunes_absent,
    is_directory_listing_url,
)


def build_solocal_priority_metadata(business: dict) -> dict:
    """
    Build a simple commercial priority for Solocal-style prospecting.

    This derived score complements the technical lead score with a quick
    explanation of why the lead matters and what contact mode is best next.
    """
    score = 0
    reasons: list[str] = []

    creation_days = None
    raw_date_creation = business.get("date_creation")
    if isinstance(raw_date_creation, str) and raw_date_creation.strip():
        try:
            creation_days = max(0, (datetime.utcnow() - datetime.fromisoformat(raw_date_creation.strip())).days)
        except ValueError:
            creation_days = None

    if creation_days is not None:
        if creation_days <= 30:
            score += 35
            reasons.append(f"créée il y a {creation_days} jours")
        elif creation_days <= 90:
            score += 25
            reasons.append(f"créée il y a {creation_days} jours")
        elif creation_days <= 365:
            score += 10
            reasons.append("création récente")

    if is_confirmed_pagesjaunes_absent(business):
        score += 20
        reasons.append("absente de PagesJaunes")

    has_website = bool(business.get("website_url") or business.get("has_website"))
    if not has_website:
        score += 15
        reasons.append("sans site web")

    if (business.get("google_reviews_count") or 0) < 5:
        score += 10
        reasons.append("peu d’avis")

    has_phone = bool(business.get("phone"))
    phone_requires_review = bool(business.get("phone_requires_review"))
    phone_confidence = (business.get("phone_confidence") or "").strip().lower()
    phone_source_url = business.get("phone_source_url") or ((business.get("data_sources") or {}).get("phone") or {}).get("url")
    is_terrain = business.get("lead_type") == "visite_terrain" or business.get("phone_unreachable") or not has_phone
    if is_terrain:
        score += 12
        reasons.append("visite terrain recommandée")

    if business.get("source") == "pappers":
        score += 8
        reasons.append("détectée via Pappers")

    if phone_requires_review:
        score -= 10
        reasons.append("téléphone à vérifier")

    if business.get("client_status") == "client":
        score = max(0, score - 80)
        reasons.append("déjà client")

    if business.get("crm_status") == "in_crm":
        score = max(0, score - 40)
        reasons.append("déjà dans le CRM")

    recommended_contact_mode = "appel"
    if is_terrain:
        recommended_contact_mode = "visite"
    elif not has_phone and has_website:
        recommended_contact_mode = "creuser"
    elif phone_requires_review:
        recommended_contact_mode = "verifier"

    related_clue_potential = False
    related_clue_reason = None
    if business.get("source") == "pappers" and business.get("siren"):
        if not has_phone:
            related_clue_potential = True
            related_clue_reason = "rebond dirigeant / nom commercial recommandé"
        elif phone_requires_review:
            related_clue_potential = True
            related_clue_reason = "téléphone direct fragile, piste liée utile"
        elif is_directory_listing_url(business.get("website_url")):
            related_clue_potential = True
            related_clue_reason = "site annuaire, rebond commercial à creuser"

    if related_clue_potential:
        score += 8
        reasons.append("piste de rebond disponible")

    next_best_action = "Ouvrir la fiche"
    next_best_action_detail = "Valider la donnée avant action commerciale."
    if related_clue_potential and (not has_phone or phone_requires_review):
        next_best_action = "Exploiter le rebond"
        next_best_action_detail = "Ouvrir les pistes liées puis tracer la meilleure coordonnée dans le CRM."
    elif recommended_contact_mode == "appel":
        next_best_action = "Appeler"
        next_best_action_detail = "Prioriser un appel direct pendant que le lead est encore chaud."
    elif recommended_contact_mode == "visite":
        next_best_action = "Préparer une visite"
        next_best_action_detail = "Basculer dans la tournée terrain pour optimiser le passage."
    elif recommended_contact_mode == "creuser":
        next_best_action = "Creuser la fiche"
        next_best_action_detail = "Chercher un site, un email ou une piste dirigeant avant relance."
    elif recommended_contact_mode == "verifier":
        next_best_action = "Vérifier la coordonnée"
        next_best_action_detail = "Confirmer le téléphone ou remplacer par une piste plus fiable."

    contact_route = "direct"
    contact_route_label = "Contact direct"
    contact_route_reason = "Téléphone exploitable immédiatement."
    if related_clue_potential and (not has_phone or phone_requires_review):
        contact_route = "rebound"
        contact_route_label = "Rebond"
        contact_route_reason = related_clue_reason or "Piste liée plus pertinente que la coordonnée directe."
    elif phone_requires_review:
        contact_route = "fragile"
        contact_route_label = "Direct fragile"
        contact_route_reason = "Téléphone présent mais à confirmer avant appel."
    elif is_terrain:
        contact_route = "terrain"
        contact_route_label = "Terrain"
        contact_route_reason = "Passage sur place recommandé."
    elif not has_phone and has_website:
        contact_route = "research"
        contact_route_label = "Recherche"
        contact_route_reason = "Coordonnée directe absente, il faut creuser la fiche."

    phone_reliability_status = "missing"
    phone_reliability_label = "Sans numéro"
    phone_reliability_reason = "Aucune coordonnée téléphonique exploitable."
    if business.get("phone_unreachable"):
        phone_reliability_status = "rejected"
        phone_reliability_label = "À rejeter"
        phone_reliability_reason = "Numéro marqué injoignable, bascule terrain recommandée."
    elif has_phone:
        if phone_requires_review or phone_confidence in {"basse", "non_verifiee"} or not phone_source_url:
            phone_reliability_status = "review"
            phone_reliability_label = "À confirmer"
            phone_reliability_reason = "Numéro présent mais source ou fiabilité insuffisante."
        else:
            phone_reliability_status = "verified"
            phone_reliability_label = "Fiable"
            phone_reliability_reason = "Numéro traçable avec source exploitable."

    if score >= 70:
        label = "Priorité haute"
    elif score >= 45:
        label = "Priorité moyenne"
    else:
        label = "Priorité faible"

    return {
        "solocal_priority_score": max(0, min(100, score)),
        "solocal_priority_label": label,
        "solocal_priority_reason": " • ".join(reasons[:5]) if reasons else "qualification en attente",
        "recommended_contact_mode": recommended_contact_mode,
        "creation_age_days": creation_days,
        "related_clue_potential": related_clue_potential,
        "related_clue_reason": related_clue_reason,
        "next_best_action": next_best_action,
        "next_best_action_detail": next_best_action_detail,
        "contact_route": contact_route,
        "contact_route_label": contact_route_label,
        "contact_route_reason": contact_route_reason,
        "phone_reliability_status": phone_reliability_status,
        "phone_reliability_label": phone_reliability_label,
        "phone_reliability_reason": phone_reliability_reason,
    }
