from datetime import datetime

from utils.helpers import (
    has_confirmed_pagesjaunes_presence,
    is_confirmed_pagesjaunes_absent,
    is_directory_listing_url,
    resolve_pagesjaunes_state,
)


def _coerce_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _coerce_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _build_google_presence(business: dict) -> tuple[str, str]:
    reviews = _coerce_int(business.get("google_reviews_count"))
    rating = _coerce_float(business.get("google_rating"))
    google_audit_status = (business.get("google_presence_audit_status") or "").strip().lower()
    has_google = bool(
        business.get("google_place_id")
        or business.get("has_google")
        or reviews > 0
        or rating > 0
        or business.get("source") == "google"
    )

    if has_google:
        if reviews >= 20 and rating >= 4.2:
            return "solid", f"Google solide ({reviews} avis)"
        if reviews >= 5:
            return "present", f"Google present ({reviews} avis)"
        return "fragile", "Google present mais peu travaille"

    if google_audit_status == "not_found":
        return "missing", "Fiche Google absente"

    return "unknown", "Presence Google a verifier"


def _build_website_presence(business: dict) -> tuple[str, str]:
    website_url = business.get("website_url")
    website_source = ((business.get("data_sources") or {}).get("website_url") or {})
    website_source_url = website_source.get("url") if isinstance(website_source, dict) else None
    has_website = bool(website_url or business.get("has_website"))
    if is_directory_listing_url(website_url) or is_directory_listing_url(website_source_url) or website_source.get("source") == "directory":
        return "directory", "Site annuaire uniquement"
    if not has_website:
        return "missing", "Sans site web"
    return "present", "Site web present"


def _build_pagesjaunes_presence(business: dict) -> tuple[str, str]:
    pj_state = resolve_pagesjaunes_state(business)
    if pj_state == "present":
        return "present", "PagesJaunes presente"
    if pj_state == "absent":
        return "absent", "PagesJaunes absente"
    return "unknown", "Presence PagesJaunes a verifier"


def _build_legal_presence(business: dict) -> tuple[str, str]:
    verification_status = (business.get("siret_verification_status") or "").strip().lower()
    etat_administratif = (business.get("etat_administratif") or "").strip().upper()
    is_closed = bool(
        business.get("is_closed")
        or business.get("is_inexploitable")
        or etat_administratif == "F"
    )

    if is_closed:
        return "closed", "Entreprise radiee ou inactive"

    if business.get("siret"):
        if verification_status == "warning":
            return "warning", "Entreprise declaree a recouper"
        return "confirmed", "Entreprise declaree"

    if verification_status == "not_found":
        return "missing", "Donnees legales non confirmees"

    return "unknown", "Donnees legales a verifier"


def _build_visibility_gap(
    google_status: str,
    website_status: str,
    pj_status: str,
) -> tuple[str, str, str]:
    if google_status == "unknown" and website_status == "missing" and pj_status == "present":
        return (
            "Site a creer",
            "PagesJaunes seule sans site exploitable",
            "Priorite site web puis fiche Google si absente.",
        )
    if google_status == "missing" and website_status == "missing" and pj_status == "present":
        return (
            "PJ seule",
            "PagesJaunes presente mais sans Google ni site",
            "Priorite fiche Google puis site web.",
        )
    if google_status == "missing" and website_status == "present" and pj_status == "present":
        return (
            "Sans Google",
            "Site et PagesJaunes presents mais Google absent",
            "Priorite fiche Google pour la visibilite locale.",
        )
    if google_status == "missing" and website_status == "missing" and pj_status == "absent":
        return (
            "Invisible localement",
            "Google absent, sans site ni PagesJaunes",
            "Priorite visibilite locale complete puis site web.",
        )
    if website_status == "missing" and google_status in {"present", "solid", "fragile"} and pj_status == "absent":
        return (
            "Google seule",
            "Google presente mais sans site ni PagesJaunes",
            "Priorite site web puis visibilite locale complementaire.",
        )
    if website_status == "missing" and google_status in {"present", "solid", "fragile"}:
        return (
            "Sans site",
            "Presence locale detectee mais sans vrai site web",
            "Priorite site web pour convertir la demande existante.",
        )
    if google_status == "unknown" and website_status == "present" and pj_status == "absent":
        return (
            "Visibilite locale faible",
            "Site present mais couverture locale incomplete",
            "Priorite fiche Google et annuaires locaux.",
        )
    if google_status == "fragile" and website_status in {"missing", "directory"}:
        return (
            "Presence fragile",
            "Google peu travaille et site insuffisant",
            "Priorite Google, avis et site web plus credible.",
        )
    if website_status == "directory":
        return (
            "Site faible",
            "La presence web repose surtout sur un annuaire",
            "Priorite vrai site web proprietaire.",
        )
    if pj_status == "absent" and google_status in {"present", "solid"}:
        return (
            "Visibilite a completer",
            "Google existe mais la couverture locale est incomplete",
            "Priorite annuaire local et maillage de presence.",
        )
    if google_status == "solid" and website_status == "present" and pj_status == "present":
        return (
            "Presence deja solide",
            "Les trois piliers principaux sont deja visibles",
            "Priorite plus basse sauf creation recente ou signal terrain.",
        )
    return (
        "Presence a qualifier",
        "La visibilite digitale existe mais reste incomplete",
        "Ouvrir la fiche pour verifier les piliers manquants.",
    )


def _build_offer_recommendation(
    google_status: str,
    website_status: str,
    pj_status: str,
    legal_status: str,
    google_reviews_count: int,
) -> tuple[str, str, str]:
    if legal_status in {"missing", "warning"}:
        return (
            "recouper",
            "A recouper",
            "Verifier d'abord la legitimite et les donnees legales avant proposition commerciale.",
        )

    if legal_status == "closed":
        return (
            "inactive",
            "Entreprise fermee",
            "Ne pas prioriser commercialement tant que le statut legal n'est pas clarifie.",
        )

    if google_status == "missing" and website_status in {"missing", "directory"}:
        return (
            "pack_visibility",
            "Pack visibilite",
            "L'entreprise manque de fiche Google et de vrai site : proposer une presence digitale complete.",
        )

    if google_status == "missing":
        return (
            "google_business",
            "Fiche Google",
            "La priorite est de creer ou renforcer la fiche Google pour la visibilite locale.",
        )

    if website_status in {"missing", "directory"}:
        return (
            "website",
            "Site web",
            "La presence locale existe deja, mais il manque un vrai site proprietaire pour convertir.",
        )

    if google_status == "fragile" or google_reviews_count < 5:
        return (
            "google_reviews",
            "Google et avis",
            "La fiche Google existe mais reste trop faible : travailler avis, contenu et conversion.",
        )

    if pj_status == "absent":
        return (
            "local_visibility",
            "Visibilite locale",
            "Completer la presence locale avec des annuaires et signaux de confiance supplementaires.",
        )

    return (
        "diagnostic",
        "Diagnostic",
        "La presence existe deja, il faut verifier le meilleur angle commercial avant relance.",
    )


def build_solocal_priority_metadata(business: dict) -> dict:
    """
    Build a commercial priority aligned with local digital visibility gaps.

    The goal is not only to rank raw leads, but to explain which visibility
    pillar is missing and what commercial angle is most relevant next.
    """
    score = 0
    reasons: list[str] = []

    creation_days = None
    raw_date_creation = business.get("date_creation")
    if isinstance(raw_date_creation, str) and raw_date_creation.strip():
        try:
            creation_days = max(
                0,
                (datetime.utcnow() - datetime.fromisoformat(raw_date_creation.strip())).days,
            )
        except ValueError:
            creation_days = None

    google_status, google_label = _build_google_presence(business)
    website_status, website_label = _build_website_presence(business)
    pj_status, pj_label = _build_pagesjaunes_presence(business)
    legal_status, legal_label = _build_legal_presence(business)
    visibility_gap_label, visibility_gap_summary, sales_pitch_hint = _build_visibility_gap(
        google_status=google_status,
        website_status=website_status,
        pj_status=pj_status,
    )
    offer_code, offer_label, offer_reason = _build_offer_recommendation(
        google_status=google_status,
        website_status=website_status,
        pj_status=pj_status,
        legal_status=legal_status,
        google_reviews_count=_coerce_int(business.get("google_reviews_count")),
    )

    digital_signals: list[str] = []
    if google_status == "fragile":
        score += 14
        digital_signals.append(google_label)
    elif google_status == "missing":
        score += 18
        digital_signals.append(google_label)
    elif google_status == "solid":
        score = max(0, score - 4)
    elif google_status == "present":
        score += 4
    elif google_status == "unknown":
        digital_signals.append(google_label)

    if legal_status == "confirmed":
        score += 6
        digital_signals.append(legal_label)
    elif legal_status == "warning":
        score = max(0, score - 8)
        reasons.append("activite legale a recouper")
        digital_signals.append(legal_label)
    elif legal_status == "missing" and business.get("source") == "web_scan":
        score = max(0, score - 20)
        reasons.append("existence legale non confirmee")
        digital_signals.append(legal_label)
    elif legal_status == "closed":
        score = max(0, score - 120)
        reasons.append("entreprise radiee")
        digital_signals.append(legal_label)

    if creation_days is not None:
        if creation_days <= 30:
            score += 24
            reasons.append(f"creee il y a {creation_days} jours")
        elif creation_days <= 90:
            score += 16
            reasons.append(f"creee il y a {creation_days} jours")
        elif creation_days <= 365:
            score += 8
            reasons.append("creation recente")

    if website_status == "missing":
        score += 22
        digital_signals.append(website_label)
    elif website_status == "directory":
        score += 14
        digital_signals.append(website_label)

    if is_confirmed_pagesjaunes_absent(business):
        score += 16
        digital_signals.append(pj_label)
    elif has_confirmed_pagesjaunes_presence(business):
        if google_status in {"unknown", "fragile"} or website_status in {"missing", "directory"}:
            digital_signals.append(pj_label)

    if google_status == "unknown" and website_status == "missing" and pj_status == "present":
        score += 20
    elif google_status == "missing" and website_status == "missing" and pj_status == "present":
        score += 26
    elif google_status == "missing" and website_status == "present" and pj_status == "present":
        score += 12
    elif google_status == "missing" and website_status == "missing" and pj_status == "absent":
        score += 28
    elif website_status == "missing" and google_status in {"present", "solid", "fragile"} and pj_status == "absent":
        score += 18
    elif website_status == "missing" and google_status in {"present", "solid", "fragile"}:
        score += 12
    elif website_status == "directory" and google_status == "fragile":
        score += 10
    elif pj_status == "absent" and google_status in {"present", "solid"}:
        score += 8

    if _coerce_int(business.get("google_reviews_count")) < 5 and google_status in {"present", "fragile"}:
        score += 8
        reasons.append("peu d'avis")

    has_website = bool(business.get("website_url") or business.get("has_website"))
    has_phone = bool(business.get("phone"))
    phone_requires_review = bool(business.get("phone_requires_review"))
    phone_confidence = (business.get("phone_confidence") or "").strip().lower()
    phone_source_url = business.get("phone_source_url") or (
        ((business.get("data_sources") or {}).get("phone") or {}).get("url")
    )
    is_terrain = (
        business.get("lead_type") == "visite_terrain"
        or business.get("phone_unreachable")
        or not has_phone
    )
    if is_terrain:
        score += 12
        reasons.append("visite terrain recommandee")

    if business.get("source") == "pappers":
        score += 8
        reasons.append("detectee via Pappers")

    if phone_requires_review:
        score -= 10
        reasons.append("telephone a verifier")

    if business.get("client_status") == "client":
        score = max(0, score - 80)
        reasons.append("deja client")

    if business.get("crm_status") == "in_crm":
        score = max(0, score - 40)
        reasons.append("deja dans le CRM")

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
            related_clue_reason = "rebond dirigeant / nom commercial recommande"
        elif phone_requires_review:
            related_clue_potential = True
            related_clue_reason = "telephone direct fragile, piste liee utile"
        elif is_directory_listing_url(business.get("website_url")):
            related_clue_potential = True
            related_clue_reason = "site annuaire, rebond commercial a creuser"

    if related_clue_potential:
        score += 8
        reasons.append("piste de rebond disponible")

    next_best_action = "Ouvrir la fiche"
    next_best_action_detail = "Valider la donnee avant action commerciale."
    if related_clue_potential and (not has_phone or phone_requires_review):
        next_best_action = "Exploiter le rebond"
        next_best_action_detail = "Ouvrir les pistes liees puis tracer la meilleure coordonnee dans le CRM."
    elif recommended_contact_mode == "appel":
        next_best_action = "Appeler"
        next_best_action_detail = "Prioriser un appel direct pendant que le lead est encore chaud."
    elif recommended_contact_mode == "visite":
        next_best_action = "Preparer une visite"
        next_best_action_detail = "Basculer dans la tournee terrain pour optimiser le passage."
    elif recommended_contact_mode == "creuser":
        next_best_action = "Creuser la fiche"
        next_best_action_detail = "Chercher un site, un email ou une piste dirigeant avant relance."
    elif recommended_contact_mode == "verifier":
        next_best_action = "Verifier la coordonnee"
        next_best_action_detail = "Confirmer le telephone ou remplacer par une piste plus fiable."

    if sales_pitch_hint:
        next_best_action_detail = f"{next_best_action_detail} Angle utile: {sales_pitch_hint}"

    contact_route = "direct"
    contact_route_label = "Contact direct"
    contact_route_reason = "Telephone exploitable immediatement."
    if related_clue_potential and (not has_phone or phone_requires_review):
        contact_route = "rebound"
        contact_route_label = "Rebond"
        contact_route_reason = related_clue_reason or "Piste liee plus pertinente que la coordonnee directe."
    elif phone_requires_review:
        contact_route = "fragile"
        contact_route_label = "Direct fragile"
        contact_route_reason = "Telephone present mais a confirmer avant appel."
    elif is_terrain:
        contact_route = "terrain"
        contact_route_label = "Terrain"
        contact_route_reason = "Passage sur place recommande."
    elif not has_phone and has_website:
        contact_route = "research"
        contact_route_label = "Recherche"
        contact_route_reason = "Coordonnee directe absente, il faut creuser la fiche."

    phone_reliability_status = "missing"
    phone_reliability_label = "Sans numero"
    phone_reliability_reason = "Aucune coordonnee telephonique exploitable."
    if business.get("phone_unreachable"):
        phone_reliability_status = "rejected"
        phone_reliability_label = "A rejeter"
        phone_reliability_reason = "Numero marque injoignable, bascule terrain recommandee."
    elif has_phone:
        if phone_requires_review or phone_confidence in {"basse", "non_verifiee"} or not phone_source_url:
            phone_reliability_status = "review"
            phone_reliability_label = "A confirmer"
            phone_reliability_reason = "Numero present mais source ou fiabilite insuffisante."
        else:
            phone_reliability_status = "verified"
            phone_reliability_label = "Fiable"
            phone_reliability_reason = "Numero tracable avec source exploitable."

    if score >= 70:
        label = "Priorite haute"
    elif score >= 45:
        label = "Priorite moyenne"
    else:
        label = "Priorite faible"

    reason_parts = []
    if visibility_gap_summary:
        reason_parts.append(visibility_gap_summary)
    reason_parts.extend(signal for signal in digital_signals if signal and signal not in reason_parts)
    reason_parts.extend(reason for reason in reasons if reason and reason not in reason_parts)

    return {
        "solocal_priority_score": max(0, min(100, score)),
        "solocal_priority_label": label,
        "solocal_priority_reason": " • ".join(reason_parts[:5]) if reason_parts else "qualification en attente",
        "digital_visibility_label": visibility_gap_label,
        "digital_visibility_summary": visibility_gap_summary,
        "sales_pitch_hint": sales_pitch_hint,
        "recommended_offer_code": offer_code,
        "recommended_offer_label": offer_label,
        "recommended_offer_reason": offer_reason,
        "google_presence_status": google_status,
        "google_presence_label": google_label,
        "website_presence_status": website_status,
        "website_presence_label": website_label,
        "pagesjaunes_presence_status": pj_status,
        "pagesjaunes_presence_label": pj_label,
        "legal_presence_status": legal_status,
        "legal_presence_label": legal_label,
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
