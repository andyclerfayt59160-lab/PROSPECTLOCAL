"""
Scans Router

Gère tous les endpoints liés aux scans :
- Création de scans (Internet, Pappers, Web)
- Liste et gestion des scans
- Export des résultats
- Enrichissement
- Rafraîchissement et rescan

STATUS: TEMPLATE - Non activé car la logique est trop complexe pour une migration rapide.
Les endpoints restent dans server.py.

Endpoints documentés pour future migration (~20):
1. POST /scans - Créer un scan Internet (ligne ~1893)
2. GET /scans - Liste des scans (ligne ~2384)
3. GET /scans/{scan_id} - Détails d'un scan
4. DELETE /scans/{scan_id} - Supprimer un scan
5. PATCH /scans/{scan_id}/favorite - Favoris
6. POST /scans/pappers - Scan Pappers (ligne ~2441)
7. POST /pappers-scan - Scan Pappers (alt route)
8. POST /scans/{scan_id}/refresh - Rafraîchir
9. GET /scans/{scan_id}/export/csv - Export CSV
10. GET /scans/{scan_id}/businesses - Entreprises d'un scan (ligne ~3645)
11. GET /scans/favorites - Scans favoris
12. POST /scans/{scan_id}/rescan - Rescan
13. POST /scans/rescan-all - Rescan tous
14. POST /scans/web - Scan web
15. POST /scans/{scan_id}/enrich-web - Enrichir web
16. POST /scans/enrich-all-web - Enrichir tous web
17. GET /scans/active - Scans actifs (ligne ~6047)

Dépendances complexes :
- search_pappers_companies() - Recherche Pappers
- enrich_business_data() - Enrichissement multi-sources
- process_internet_scan() - Traitement scan Internet
- Background tasks pour les scans longs

Prérequis pour migration :
1. Extraire les fonctions helper dans services/
2. Créer un système de dépendance pour db
3. Tester chaque endpoint individuellement
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from datetime import datetime
from typing import Optional, List
import logging

from models import Scan, ScanCreate, ScanStatus
from auth import get_current_user
from utils.dependencies import get_database

logger = logging.getLogger(__name__)

# Router non inclus dans l'app - sert de documentation
router = APIRouter(prefix="/scans", tags=["Scans"])


# ============= TEMPLATE : GET /scans =============
# Exemple de ce qu'il faudrait implémenter

@router.get("")
async def list_scans_TEMPLATE(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """
    Liste des scans de l'utilisateur.
    
    ATTENTION: Ceci est un TEMPLATE. L'endpoint réel est dans server.py.
    """
    raise HTTPException(
        status_code=501, 
        detail="Template only - Use the endpoint in server.py"
    )

