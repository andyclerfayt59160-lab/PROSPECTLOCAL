"""
Email Service for PROSPECTLOCAL
Handles sending email notifications for API alerts, scan completions, etc.
Falls back to storing emails in database if no email provider is configured.
"""
import os
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)

# Try to import resend
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False
    logger.warning("Resend library not installed. Email sending will be queued only.")


class EmailMessage(BaseModel):
    """Email message model"""
    to: str
    subject: str
    html_content: str
    text_content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


async def send_email(
    db,
    to: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Send an email using Resend if configured, otherwise queue it in the database.
    
    Args:
        db: MongoDB database instance
        to: Recipient email address
        subject: Email subject
        html_content: HTML body of the email
        text_content: Plain text body (optional)
        metadata: Additional metadata to store with the email
    
    Returns:
        Dict with status and details
    """
    resend_api_key = os.environ.get("RESEND_API_KEY")
    sender_email = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    
    email_record = {
        "to": to,
        "subject": subject,
        "html_content": html_content,
        "text_content": text_content,
        "metadata": metadata or {},
        "created_at": datetime.utcnow(),
        "status": "pending"
    }
    
    # If Resend is configured, try to send
    if RESEND_AVAILABLE and resend_api_key:
        try:
            resend.api_key = resend_api_key
            
            params = {
                "from": sender_email,
                "to": [to],
                "subject": subject,
                "html": html_content
            }
            
            if text_content:
                params["text"] = text_content
            
            # Run sync SDK in thread to keep FastAPI non-blocking
            result = await asyncio.to_thread(resend.Emails.send, params)
            
            email_record["status"] = "sent"
            email_record["sent_at"] = datetime.utcnow()
            email_record["provider_id"] = result.get("id")
            
            await db.email_queue.insert_one(email_record)
            
            logger.info(f"Email sent successfully to {to}: {subject}")
            return {
                "success": True,
                "status": "sent",
                "email_id": result.get("id"),
                "message": f"Email sent to {to}"
            }
            
        except Exception as e:
            logger.error(f"Failed to send email to {to}: {e}")
            email_record["status"] = "failed"
            email_record["error"] = str(e)
            await db.email_queue.insert_one(email_record)
            
            return {
                "success": False,
                "status": "failed",
                "error": str(e),
                "message": f"Failed to send email: {e}"
            }
    else:
        # Queue the email for later sending
        email_record["status"] = "queued"
        await db.email_queue.insert_one(email_record)
        
        logger.info(f"Email queued for {to}: {subject} (no email provider configured)")
        return {
            "success": True,
            "status": "queued",
            "message": f"Email queued for {to} (configure RESEND_API_KEY to send immediately)"
        }


async def send_api_alert_email(
    db,
    user_email: str,
    api_name: str,
    alert_type: str,  # "down" or "recovery"
    error_message: Optional[str] = None,
    downtime_minutes: Optional[float] = None
) -> Dict[str, Any]:
    """
    Send an email alert about API status change.
    
    Args:
        db: MongoDB database instance
        user_email: User's email address
        api_name: Name of the API (e.g., "Google Places")
        alert_type: "down" for outage, "recovery" for back online
        error_message: Error message if API is down
        downtime_minutes: How long the API has been down
    """
    if alert_type == "down":
        subject = f"⚠️ ALERTE: {api_name} est indisponible - ProspectLocal"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Alerte API</h1>
            </div>
            
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <h2 style="color: #EF4444; margin-top: 0;">{api_name} est indisponible</h2>
                
                <p style="font-size: 16px;">
                    L'API <strong>{api_name}</strong> ne répond plus depuis 
                    <strong>{int(downtime_minutes) if downtime_minutes else 'quelques'} minutes</strong>.
                </p>
                
                {f'<div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0;"><strong>Erreur:</strong> {error_message}</div>' if error_message else ''}
                
                <p style="color: #6B7280; font-size: 14px;">
                    Cette indisponibilité peut affecter les fonctionnalités suivantes:
                </p>
                <ul style="color: #6B7280; font-size: 14px;">
                    {'<li>Recherche de leads locaux</li>' if 'Google' in api_name else ''}
                    {'<li>Recherche web et enrichissement</li>' if 'Serper' in api_name else ''}
                    {'<li>Recherche entreprises et scans Pappers+</li>' if 'Pappers' in api_name else ''}
                </ul>
                
                <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin-top: 20px;">
                    <p style="margin: 0; color: #6B7280; font-size: 14px;">
                        💡 <strong>Que faire?</strong><br>
                        Vérifiez votre clé API dans les paramètres ou contactez le support de l'API concernée.
                    </p>
                </div>
                
                <a href="https://pappers-search-plus.preview.emergentagent.com/health" 
                   style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
                    Voir le statut des APIs
                </a>
            </div>
            
            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
                ProspectLocal - Cet email est envoyé automatiquement suite à une alerte système.
            </p>
        </body>
        </html>
        """
    else:  # recovery
        subject = f"✅ {api_name} est de nouveau opérationnel - ProspectLocal"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">✅ API Rétablie</h1>
            </div>
            
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <h2 style="color: #10B981; margin-top: 0;">{api_name} fonctionne à nouveau</h2>
                
                <p style="font-size: 16px;">
                    Bonne nouvelle ! L'API <strong>{api_name}</strong> est de nouveau opérationnelle.
                </p>
                
                <p style="color: #6B7280; font-size: 14px;">
                    Toutes les fonctionnalités liées à cette API sont à nouveau disponibles.
                </p>
                
                <a href="https://pappers-search-plus.preview.emergentagent.com/health" 
                   style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
                    Vérifier le statut
                </a>
            </div>
            
            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
                ProspectLocal - Cet email est envoyé automatiquement suite à une alerte système.
            </p>
        </body>
        </html>
        """
    
    return await send_email(
        db=db,
        to=user_email,
        subject=subject,
        html_content=html_content,
        metadata={
            "type": "api_alert",
            "api_name": api_name,
            "alert_type": alert_type
        }
    )


async def get_email_queue_status(db, limit: int = 20) -> List[Dict]:
    """Get recent emails from the queue"""
    emails = await db.email_queue.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return emails


async def get_user_email_preferences(db, user_id: str) -> Dict[str, bool]:
    """Get user's email notification preferences"""
    user = await db.users.find_one({"id": user_id}, {"email_notifications": 1})
    
    if user and "email_notifications" in user:
        return user["email_notifications"]
    
    # Default preferences
    return {
        "api_alerts": True,
        "scan_complete": True,
        "weekly_summary": False
    }


async def update_user_email_preferences(
    db,
    user_id: str,
    preferences: Dict[str, bool]
) -> bool:
    """Update user's email notification preferences"""
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"email_notifications": preferences}}
    )
    return result.modified_count > 0


async def send_scan_complete_email(
    db,
    user_email: str,
    scan_name: str,
    scan_type: str,  # "internet" or "pappers"
    total_results: int,
    verified_count: int,
    with_phone: int,
    with_email: int,
    scan_id: str,
    duration_seconds: int = 0
) -> Dict[str, Any]:
    """
    Send an email notification when a scan is completed.
    
    Args:
        db: MongoDB database instance
        user_email: User's email address
        scan_name: Name/query of the scan
        scan_type: Type of scan (internet or pappers)
        total_results: Total number of businesses found
        verified_count: Number of verified businesses
        with_phone: Number of businesses with phone
        with_email: Number of businesses with email
        scan_id: ID of the scan for link
        duration_seconds: How long the scan took
    """
    scan_type_label = "Scan Tout Internet" if scan_type == "internet" else "Scan Pappers+"
    scan_type_color = "#3B82F6" if scan_type == "internet" else "#8B5CF6"
    
    # Format duration
    if duration_seconds > 0:
        minutes = duration_seconds // 60
        seconds = duration_seconds % 60
        duration_str = f"{minutes}min {seconds}s" if minutes > 0 else f"{seconds}s"
    else:
        duration_str = "N/A"
    
    # Calculate percentages
    phone_pct = round(with_phone / total_results * 100) if total_results > 0 else 0
    email_pct = round(with_email / total_results * 100) if total_results > 0 else 0
    verified_pct = round(verified_count / total_results * 100) if total_results > 0 else 0
    
    subject = f"✅ Scan terminé : {scan_name} - {total_results} résultats"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, {scan_type_color} 0%, {'#2563EB' if scan_type == 'internet' else '#7C3AED'} 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">✅ Scan Terminé !</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">{scan_type_label}</p>
        </div>
        
        <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1E293B; margin-top: 0; font-size: 20px;">
                "{scan_name}"
            </h2>
            
            <p style="color: #64748B; font-size: 14px;">
                Votre scan est terminé en {duration_str}. Voici le résumé des résultats :
            </p>
            
            <!-- Stats Grid -->
            <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0;">
                <div style="flex: 1; min-width: 120px; background: #F0FDF4; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #10B981;">{total_results}</div>
                    <div style="font-size: 12px; color: #059669;">Résultats total</div>
                </div>
                <div style="flex: 1; min-width: 120px; background: #EFF6FF; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #3B82F6;">{verified_count}</div>
                    <div style="font-size: 12px; color: #2563EB;">Vérifiés ({verified_pct}%)</div>
                </div>
            </div>
            
            <!-- Contact Stats -->
            <div style="background: #F8FAFC; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">Contacts trouvés</h3>
                <div style="display: flex; justify-content: space-around;">
                    <div style="text-align: center;">
                        <div style="font-size: 20px; font-weight: 600; color: #10B981;">📞 {with_phone}</div>
                        <div style="font-size: 11px; color: #64748B;">Avec téléphone ({phone_pct}%)</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 20px; font-weight: 600; color: #8B5CF6;">📧 {with_email}</div>
                        <div style="font-size: 11px; color: #64748B;">Avec email ({email_pct}%)</div>
                    </div>
                </div>
            </div>
            
            <!-- CTA Button -->
            <a href="https://pappers-search-plus.preview.emergentagent.com/results/{scan_id}" 
               style="display: block; background: {scan_type_color}; color: white; padding: 14px 24px; text-decoration: none; border-radius: 8px; text-align: center; font-weight: 600;">
                Voir les résultats détaillés →
            </a>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0; color: #94A3B8; font-size: 12px;">
                    💡 <strong>Astuce :</strong> Utilisez les filtres pour afficher uniquement les leads avec téléphone ou les entreprises récentes.
                </p>
            </div>
        </div>
        
        <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
            ProspectLocal - Cet email est envoyé automatiquement à la fin de vos scans.<br>
            <a href="https://pappers-search-plus.preview.emergentagent.com/settings" style="color: #9CA3AF;">Gérer les préférences de notification</a>
        </p>
    </body>
    </html>
    """
    
    return await send_email(
        db=db,
        to=user_email,
        subject=subject,
        html_content=html_content,
        metadata={
            "type": "scan_complete",
            "scan_id": scan_id,
            "scan_type": scan_type,
            "total_results": total_results
        }
    )


async def send_surveillance_alert_email(
    db,
    user_email: str,
    surveillance_name: str,
    zone_description: str,
    new_companies: List[Dict[str, Any]],
    surveillance_id: str
) -> Dict[str, Any]:
    """
    Send an email notification when new companies are detected in a surveillance zone.
    
    Args:
        db: MongoDB database instance
        user_email: User's email address
        surveillance_name: Name of the surveillance zone
        zone_description: Description (city + radius or cities list)
        new_companies: List of new companies with details
        surveillance_id: ID of the surveillance for link
    """
    count = len(new_companies)
    
    subject = f"🔔 {count} nouvelle(s) entreprise(s) dans {surveillance_name}"
    
    # Build companies list HTML
    companies_html = ""
    for i, company in enumerate(new_companies[:10]):  # Max 10 in email
        nom = company.get("business_name", "Entreprise")
        ville = company.get("business_city", "")
        domain = company.get("domain", "autre").capitalize()
        date_creation = company.get("date_creation", "")
        
        companies_html += f"""
        <div style="background: #F8FAFC; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 4px solid #8B5CF6;">
            <div style="font-weight: 600; color: #1E293B; margin-bottom: 4px;">{nom}</div>
            <div style="font-size: 13px; color: #64748B;">
                📍 {ville} • 🏷️ {domain} • 📅 Créée le {date_creation}
            </div>
        </div>
        """
    
    if count > 10:
        companies_html += f"""
        <div style="text-align: center; color: #64748B; font-size: 13px; padding: 10px;">
            ... et {count - 10} autre(s) entreprise(s)
        </div>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🔔 Alerte Surveillance</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">{surveillance_name}</p>
        </div>
        
        <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <div style="background: #F0FDF4; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <div style="font-size: 36px; font-weight: 700; color: #10B981;">{count}</div>
                <div style="font-size: 14px; color: #059669;">Nouvelle(s) entreprise(s) détectée(s)</div>
            </div>
            
            <p style="color: #64748B; font-size: 14px; margin-bottom: 20px;">
                📍 Zone surveillée : <strong>{zone_description}</strong>
            </p>
            
            <h3 style="color: #1E293B; font-size: 16px; margin-bottom: 12px;">
                Entreprises récemment créées :
            </h3>
            
            {companies_html}
            
            <!-- CTA Button -->
            <a href="https://pappers-search-plus.preview.emergentagent.com/surveillance" 
               style="display: block; background: #8B5CF6; color: white; padding: 14px 24px; text-decoration: none; border-radius: 8px; text-align: center; font-weight: 600; margin-top: 20px;">
                Voir toutes les alertes →
            </a>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0; color: #94A3B8; font-size: 12px;">
                    💡 <strong>Astuce :</strong> Cliquez sur une entreprise pour voir ses coordonnées et l'ajouter à votre CRM.
                </p>
            </div>
        </div>
        
        <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
            ProspectLocal - Alerte de surveillance automatique.<br>
            <a href="https://pappers-search-plus.preview.emergentagent.com/settings" style="color: #9CA3AF;">Gérer les préférences de notification</a>
        </p>
    </body>
    </html>
    """
    
    return await send_email(
        db=db,
        to=user_email,
        subject=subject,
        html_content=html_content,
        metadata={
            "type": "surveillance_alert",
            "surveillance_id": surveillance_id,
            "new_count": count
        }
    )


async def send_weekly_summary_email(
    db,
    user_email: str,
    user_name: str,
    stats: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Envoie un résumé hebdomadaire des activités de prospection.
    
    Args:
        db: MongoDB database instance
        user_email: Email de l'utilisateur
        user_name: Nom de l'utilisateur
        stats: Statistiques de la semaine {
            "scans_count": int,
            "new_leads": int,
            "verified_leads": int,
            "calls_made": int,
            "conversions": int,
            "top_cities": List[str],
            "top_sectors": List[str],
            "period_start": str,
            "period_end": str
        }
    """
    subject = f"📊 Résumé Hebdomadaire ProspectLocal - {stats.get('period_start', '')} au {stats.get('period_end', '')}"
    
    # Calcul des métriques
    scans = stats.get("scans_count", 0)
    new_leads = stats.get("new_leads", 0)
    verified = stats.get("verified_leads", 0)
    calls = stats.get("calls_made", 0)
    conversions = stats.get("conversions", 0)
    conversion_rate = round((conversions / calls * 100) if calls > 0 else 0, 1)
    
    top_cities = stats.get("top_cities", [])[:3]
    top_sectors = stats.get("top_sectors", [])[:3]
    
    cities_html = "".join([f"<li style='color: #D1D5DB;'>{city}</li>" for city in top_cities]) if top_cities else "<li style='color: #9CA3AF;'>Aucune donnée</li>"
    sectors_html = "".join([f"<li style='color: #D1D5DB;'>{sector}</li>" for sector in top_sectors]) if top_sectors else "<li style='color: #9CA3AF;'>Aucune donnée</li>"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Résumé Hebdomadaire</title>
    </head>
    <body style="background-color: #111827; color: #F9FAFB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #10B981; margin: 0;">📊 Résumé Hebdomadaire</h1>
                <p style="color: #9CA3AF; margin-top: 10px;">
                    {stats.get('period_start', '')} - {stats.get('period_end', '')}
                </p>
            </div>
            
            <div style="background-color: #1F2937; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h2 style="color: #F9FAFB; margin-top: 0; font-size: 18px;">👋 Bonjour {user_name},</h2>
                <p style="color: #D1D5DB; line-height: 1.6;">
                    Voici le récapitulatif de votre activité de prospection cette semaine.
                </p>
            </div>
            
            <!-- Métriques principales -->
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <div style="flex: 1; min-width: 120px; background-color: #1F2937; border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #10B981;">{scans}</div>
                    <div style="color: #9CA3AF; font-size: 12px;">Scans effectués</div>
                </div>
                <div style="flex: 1; min-width: 120px; background-color: #1F2937; border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #3B82F6;">{new_leads}</div>
                    <div style="color: #9CA3AF; font-size: 12px;">Nouveaux leads</div>
                </div>
                <div style="flex: 1; min-width: 120px; background-color: #1F2937; border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #8B5CF6;">{verified}</div>
                    <div style="color: #9CA3AF; font-size: 12px;">Leads vérifiés</div>
                </div>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <div style="flex: 1; min-width: 120px; background-color: #1F2937; border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #F59E0B;">{calls}</div>
                    <div style="color: #9CA3AF; font-size: 12px;">Appels passés</div>
                </div>
                <div style="flex: 1; min-width: 120px; background-color: #1F2937; border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #EF4444;">{conversions}</div>
                    <div style="color: #9CA3AF; font-size: 12px;">Conversions</div>
                </div>
                <div style="flex: 1; min-width: 120px; background-color: #1F2937; border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #EC4899;">{conversion_rate}%</div>
                    <div style="color: #9CA3AF; font-size: 12px;">Taux conversion</div>
                </div>
            </div>
            
            <!-- Top villes et secteurs -->
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <div style="flex: 1; background-color: #1F2937; border-radius: 8px; padding: 15px;">
                    <h3 style="color: #10B981; margin-top: 0; font-size: 14px;">🏙️ Top Villes</h3>
                    <ol style="margin: 0; padding-left: 20px;">
                        {cities_html}
                    </ol>
                </div>
                <div style="flex: 1; background-color: #1F2937; border-radius: 8px; padding: 15px;">
                    <h3 style="color: #3B82F6; margin-top: 0; font-size: 14px;">📊 Top Secteurs</h3>
                    <ol style="margin: 0; padding-left: 20px;">
                        {sectors_html}
                    </ol>
                </div>
            </div>
            
            <!-- Call to action -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="https://pappers-search-plus.preview.emergentagent.com/stats" 
                   style="display: inline-block; background-color: #10B981; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                    Voir les statistiques détaillées
                </a>
            </div>
            
            <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 20px;">
                ProspectLocal - Résumé hebdomadaire automatique.<br>
                <a href="https://pappers-search-plus.preview.emergentagent.com/settings" style="color: #9CA3AF;">Gérer les préférences de notification</a>
            </p>
        </div>
    </body>
    </html>
    """
    
    return await send_email(
        db=db,
        to=user_email,
        subject=subject,
        html_content=html_content,
        metadata={
            "type": "weekly_summary",
            "period_start": stats.get("period_start"),
            "period_end": stats.get("period_end"),
            "stats": stats
        }
    )


async def compute_weekly_stats_for_user(db, user_id: str) -> Dict[str, Any]:
    """
    Calcule les statistiques hebdomadaires pour un utilisateur.
    
    Args:
        db: MongoDB database instance
        user_id: ID de l'utilisateur
        
    Returns:
        Dict avec les statistiques de la semaine
    """
    from datetime import timedelta
    
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    
    # Format dates pour affichage
    period_start = week_ago.strftime("%d/%m/%Y")
    period_end = now.strftime("%d/%m/%Y")
    
    # Compter les scans de la semaine
    scans_count = await db.scans.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago}
    })
    
    # Compter les nouveaux leads
    new_leads = await db.businesses.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago}
    })
    
    # Compter les leads vérifiés (avec téléphone)
    verified_leads = await db.businesses.count_documents({
        "user_id": user_id,
        "created_at": {"$gte": week_ago},
        "phone": {"$ne": None, "$ne": ""}
    })
    
    # Compter les appels passés (status = appelé ou autres statuts d'appel)
    calls_made = await db.businesses.count_documents({
        "user_id": user_id,
        "updated_at": {"$gte": week_ago},
        "status": {"$in": ["appelé", "rappeler", "converti", "pas_intéressé"]}
    })
    
    # Compter les conversions
    conversions = await db.businesses.count_documents({
        "user_id": user_id,
        "updated_at": {"$gte": week_ago},
        "status": "converti"
    })
    
    # Top villes
    top_cities_pipeline = [
        {"$match": {"user_id": user_id, "created_at": {"$gte": week_ago}}},
        {"$group": {"_id": "$city", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_cities_cursor = db.businesses.aggregate(top_cities_pipeline)
    top_cities = [doc["_id"] async for doc in top_cities_cursor if doc["_id"]]
    
    # Top secteurs (query)
    top_sectors_pipeline = [
        {"$match": {"user_id": user_id, "created_at": {"$gte": week_ago}}},
        {"$lookup": {"from": "scans", "localField": "scan_id", "foreignField": "id", "as": "scan"}},
        {"$unwind": {"path": "$scan", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$scan.query", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_sectors_cursor = db.businesses.aggregate(top_sectors_pipeline)
    top_sectors = [doc["_id"] async for doc in top_sectors_cursor if doc["_id"]]
    
    return {
        "scans_count": scans_count,
        "new_leads": new_leads,
        "verified_leads": verified_leads,
        "calls_made": calls_made,
        "conversions": conversions,
        "top_cities": top_cities,
        "top_sectors": top_sectors,
        "period_start": period_start,
        "period_end": period_end
    }


async def send_weekly_summaries(db) -> Dict[str, Any]:
    """
    Envoie les résumés hebdomadaires à tous les utilisateurs qui ont activé cette préférence.
    Cette fonction devrait être appelée une fois par semaine (ex: lundi matin).
    
    Args:
        db: MongoDB database instance
        
    Returns:
        Dict avec le résultat de l'envoi
    """
    results = {
        "sent": 0,
        "skipped": 0,
        "errors": 0,
        "details": []
    }
    
    # Récupérer tous les utilisateurs avec weekly_summary activé
    users_cursor = db.users.find({
        "notification_preferences.weekly_summary": True
    })
    
    async for user in users_cursor:
        user_id = user.get("id")
        user_email = user.get("email")
        user_name = user.get("name", user_email.split("@")[0] if user_email else "Utilisateur")
        
        if not user_email:
            results["skipped"] += 1
            continue
        
        try:
            # Calculer les stats
            stats = await compute_weekly_stats_for_user(db, user_id)
            
            # Ne pas envoyer si aucune activité
            if stats["scans_count"] == 0 and stats["new_leads"] == 0:
                results["skipped"] += 1
                results["details"].append({
                    "user_id": user_id,
                    "status": "skipped",
                    "reason": "no_activity"
                })
                continue
            
            # Envoyer l'email
            email_result = await send_weekly_summary_email(
                db=db,
                user_email=user_email,
                user_name=user_name,
                stats=stats
            )
            
            if email_result.get("status") in ["sent", "queued"]:
                results["sent"] += 1
            else:
                results["errors"] += 1
                
            results["details"].append({
                "user_id": user_id,
                "status": email_result.get("status"),
                "stats_summary": {
                    "scans": stats["scans_count"],
                    "leads": stats["new_leads"]
                }
            })
            
        except Exception as e:
            logger.error(f"Error sending weekly summary to {user_email}: {e}")
            results["errors"] += 1
            results["details"].append({
                "user_id": user_id,
                "status": "error",
                "error": str(e)
            })
    
    logger.info(f"📧 Weekly summaries: {results['sent']} sent, {results['skipped']} skipped, {results['errors']} errors")
    return results


