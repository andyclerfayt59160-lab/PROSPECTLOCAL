# Architecture Backend - PROSPECTLOCAL V2

## État actuel

Le fichier `server.py` a été considérablement réduit de ~8900 lignes à ~6998 lignes (-21% de réduction).
La logique métier a été extraite vers des services modulaires réutilisables.

### Résumé du refactoring total:
- server.py initial: ~8900 lignes (début de tout le refactoring)
- server.py actuel: ~6998 lignes (-1900 lignes, -21%)
- Code extrait dans services: ~4313 lignes
- Services créés: 11 (api_tracking, enrichment, geo, pappers, health, email, pappers_scan, web_scraper, sirene, pagesjaunes, google_places)
- Utils créés: 3 (database, dependencies, helpers)
- Routers actifs: 2 (auth, stats)

## Architecture cible

```
/app/backend/
├── server.py           # Point d'entrée principal (minimal - ~200 lignes)
├── models.py           # Modèles Pydantic (déjà séparé)
├── auth.py             # Authentification JWT (déjà séparé)
├── routers/
│   ├── __init__.py
│   ├── auth.py         # Endpoints d'authentification
│   ├── scans.py        # Endpoints de scans (Internet, Pappers)
│   ├── businesses.py   # Endpoints entreprises
│   ├── surveillance.py # Endpoints de surveillance
│   ├── stats.py        # Endpoints statistiques
│   ├── export.py       # Endpoints d'export
│   ├── crm.py          # Endpoints CRM
│   └── api_usage.py    # Endpoints tracking crédits API
├── services/
│   ├── __init__.py
│   ├── pappers.py      # Service Pappers API
│   ├── google_places.py # Service Google Places
│   ├── serper.py       # Service Serper (recherche web)
│   ├── enrichment.py   # Service d'enrichissement multi-sources
│   ├── surveillance.py # Service de surveillance automatique
│   └── api_tracking.py # Service de tracking des crédits API
├── utils/
│   ├── __init__.py
│   ├── database.py     # Configuration MongoDB (créé)
│   ├── helpers.py      # Fonctions utilitaires
│   └── constants.py    # Constantes (codes NAF, domaines, etc.)
└── tests/
    ├── __init__.py
    └── ...
```

## Plan de migration (par phases)

### Phase 1 - Préparation (FAIT)
- [x] Créer la structure de dossiers
- [x] Créer `utils/database.py`
- [x] Documenter l'architecture cible

### Phase 2 - Services critiques
- [x] Créer `services/api_tracking.py` - Tracking des crédits API
- [x] Créer `services/enrichment.py` - Enrichissement multi-sources (Google, Serper)
- [ ] Intégrer les services dans server.py (utiliser les imports)

### Phase 3 - Routers
- [x] Créer `routers/auth.py` - ✅ ACTIF
- [x] Créer `routers/stats.py` - ✅ ACTIF
- [x] Créer `utils/dependencies.py` - Module de dépendances partagées
- [x] Activer routers auth + stats, supprimer code dupliqué (~400 lignes)
- [x] Créer `routers/scans.py` - Template documenté (non activé)
- [x] Créer `routers/businesses.py` - Template créé (non activé, logique complexe)
- [ ] Migration progressive quand nécessaire

#### Résultats Phase 3 :
- server.py réduit de 8913 à 8511 lignes (-402 lignes)
- 2 routers actifs (auth, stats)
- 2 routers en template (scans, businesses) - prêts pour future migration

#### Pourquoi les routers scans et businesses ne sont pas activés :
Les endpoints existants ont une logique complexe avec :
- Historique partagé entre utilisateurs
- Background tasks
- Multiples collections MongoDB interdépendantes
- Fonctions helper non encore extraites

Une migration trop rapide risquerait de créer des régressions.

### Phase 4 - Services et Helpers
- [x] Créer `utils/helpers.py` - Fonctions utilitaires communes (~350 lignes)
  - `normalize_phone()`, `normalize_french_phone_full()`
  - `generate_data_sources()`, `merge_data_sources()`
  - `calculate_score()` - Calcul du score de priorité
  - `normalize_name_for_matching()`, `calculate_name_similarity()`
  - `extract_emails_from_text()`, `extract_phones_from_text()`
  - `ACTIVITY_NAF_MAPPING` - Mapping activités → codes NAF
- [x] Enrichir `services/enrichment.py` - Service d'enrichissement
- [x] Enrichir `services/api_tracking.py` - Tracking API
- [x] Importer les helpers dans server.py (FAIT)

### Phase 5 - Services Géo et Pappers (EN COURS)
- [x] Créer `services/geo.py` - Service géolocalisation
  - `haversine_distance()` - Calcul de distance
  - `get_cities_in_radius()` - Villes dans un rayon
  - `search_cities()` - Recherche de villes
  - `geocode_address()` - Géocodage
- [x] Créer `services/pappers.py` - Service Pappers API
  - `search_pappers_companies()` - Recherche entreprises
  - `format_pappers_company()` - Formatage données
  - `get_naf_codes_for_activity()` - Codes NAF
- [x] Intégrer `services/geo.py` dans server.py
  - `get_cities_in_radius` -> wrapper vers geo service
  - `haversine_distance` importé et utilisé directement

#### Résultats Phase 5 :
- server.py réduit de 8308 à 8158 lignes puis augmenté à ~8478 lignes (ajout feature Santé Système)
- Fonctions géo factorisées dans `services/geo.py`
- Duplication haversine éliminée
- `extract_emails_from_text` et `extract_phones_from_text` consolidés dans utils/helpers
- `track_api_usage` et `check_api_budget_alerts` délégués à services/api_tracking

### Phase 6 - Feature: Tableau de Bord Santé Système
- [x] Créer endpoint `/api/system/health` pour vérifier l'état des APIs en temps réel
- [x] Tests automatiques pour Google Places, Serper, Pappers, Géo Gouv, SIRENE
- [x] Mesure de latence et taux d'erreur 24h
- [x] Créer page frontend `/health` avec auto-refresh
- [x] Ajouter lien "Santé" sur la page d'accueil
- [x] Extraire la logique vers `services/health.py` (~290 lignes)

#### Résultats Phase 6:
- server.py réduit de 8478 à 8188 lignes (-290 lignes)
- Nouveau service `services/health.py` créé avec fonctions réutilisables

### Résumé du refactoring total:
- server.py initial: ~8900 lignes (début de tout le refactoring)
- server.py actuel: ~7695 lignes
- Code extrait dans services: ~3726 lignes
- Services créés: 9 (api_tracking, enrichment, geo, pappers, health, email, pappers_scan, web_scraper, sirene)
- Utils créés: 3 (database, dependencies, helpers)
- Routers actifs: 2 (auth, stats)

### Phase 7 - Service Pappers Scan (TERMINÉ)
- [x] Créer `services/pappers_scan.py` (~376 lignes)
  - `get_naf_codes_for_domains()` - Mapping domaines vers codes NAF
  - `get_postal_codes_for_radius()` - Codes postaux dans un rayon
  - `get_postal_codes_for_cities()` - Codes postaux multi-villes
  - `calculate_date_threshold()` - Seuil de date pour filtrage
  - `classify_business()` - Classification visite/lead
  - `format_pappers_business()` - Formatage données entreprise
  - `search_pappers_batch()` - Recherche batch Pappers
  - `calculate_scan_stats()` - Statistiques du scan
  - `DOMAIN_NAF_CODES` - Mapping domaines/codes NAF exporté
- [x] Refactoriser `pappers_mass_scan` pour utiliser le service (-61 lignes)

### Phase 8 - Services Enrichment, Web Scraper et SIRENE (TERMINÉ - 01/04/2026)
- [x] Extraire `auto_enrich_scan_with_web` vers `services/enrichment.py` (~156 lignes)
  - Enrichissement automatique via Serper pour les entreprises sans téléphone
  - Passer `db` en paramètre pour éviter imports circulaires
- [x] Créer `services/web_scraper.py` (~230 lignes)
  - `scrape_website_contacts()` - Scraping multi-pages (contact, mentions légales, etc.)
  - `search_email_via_web()` - Recherche d'email via Serper API
- [x] Créer `services/sirene.py` (~377 lignes)
  - `get_sirene_data()` - Recherche SIRET/SIREN via API gouv.fr
  - `get_annuaire_entreprises_data()` - Données détaillées entreprise
  - `get_bodacc_data()` - Annonces BODACC (procédures collectives)
  - `check_activity_coherence()` - Vérification cohérence Google/NAF
  - `NAF_CATEGORIES` - Mapping catégories d'activité
- [x] Créer `services/pagesjaunes.py` (~224 lignes)
  - `check_pagesjaunes_direct()` - Vérification présence via Serper
  - `detect_pagesjaunes_presence()` - Détection combinée PJ + SIRENE
- [x] Extraire `enrich_business_full` vers `services/enrichment.py` (~92 lignes)
  - Orchestration enrichissement multi-sources (site web, BODACC, web search)
  - Injection de dépendances pour éviter imports circulaires
- [x] Ajouter `EMAIL_PATTERN` et `PHONE_PATTERN_FR` dans `utils/helpers.py`

#### Résultats Phase 8:
- server.py réduit de 8313 à 7506 lignes (-807 lignes, -9.7%)
- 10 services actifs (3667 lignes de code modulaire)
- Total réduction server.py depuis début: ~1400 lignes (-16%)

## Notes importantes

1. **Migration incrémentale** : Chaque extraction doit être testée individuellement
2. **Imports circulaires** : Attention aux dépendances entre modules
3. **Variables globales** : `db` doit être importé depuis `utils/database.py`
4. **Background tasks** : La surveillance doit rester dans le module principal pour l'instant

## Dépendances entre modules

```
server.py
  └── routers/*
        └── services/*
              └── utils/database.py
              └── models.py
```
