# ProspectLocal Web Hosted

Cette app peut maintenant etre livree en vrai mode web heberge.

Le mode recommande est desormais :

- `un seul domaine public`
- `frontend` servi en statique
- `backend` derriere `/api`
- `MongoDB` partagee distante
- `HTTPS` gere par Caddy

Ce mode est le plus simple pour un PC pro :

- rien a installer
- aucun blocage Defender / AppLocker
- donnees partagees en live
- mises a jour immediates apres republication

## 0. Mode Railway recommande

Pour un usage simple sans serveur perso, le chemin recommande est maintenant :

- `GitHub`
- `Railway`
- `MongoDB Atlas`

Le repo contient desormais un [Dockerfile](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/Dockerfile) racine prevu pour Railway :

- build frontend Expo web
- embarque le frontend compile
- lance le backend FastAPI
- sert le frontend et l'API depuis une seule URL

Donc sur Railway, un seul service suffit.

## 1. Mode standard recommande

Le package standard de deploiement est compose de :

- [Dockerfile.backend](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/Dockerfile.backend)
- [Dockerfile.frontend.hosted](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/Dockerfile.frontend.hosted)
- [Caddyfile.hosted](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/Caddyfile.hosted)
- [docker-compose.hosted.yml](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/docker-compose.hosted.yml)

Le comportement cible est :

- `https://app.prospectlocal.example` sert le front
- `https://app.prospectlocal.example/api/...` pointe vers le backend
- le frontend et l'API partagent la meme origine

Donc pas besoin de gerer un second sous-domaine API si tu ne veux pas.

## 2. Variables backend minimales

Le backend se configure via :

- [backend/.env.hosted.sample](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/backend/.env.hosted.sample)

Variables minimales :

- `MONGO_URL`
- `DB_NAME`
- `SECRET_KEY`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `ALLOW_GLOBAL_API_KEY_FALLBACK=false`
- `SERPER_API_KEY`
- `PAPPERS_API_KEY`
- `GOOGLE_API_KEY`
- `CORS_ALLOW_ORIGINS`

Exemple :

- domaine public : `https://app.prospectlocal.example`
- `CORS_ALLOW_ORIGINS=https://app.prospectlocal.example`

Pour un premier acces securise sur une base neuve, tu peux aussi definir :

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Au demarrage, l'app cree ou repare automatiquement ce compte en administrateur actif et valide.

Pour un vrai mode multi-comptes securise, definir aussi :

- `ALLOW_GLOBAL_API_KEY_FALLBACK=false`

Comme ca, les utilisateurs sans cles personnelles ne peuvent pas utiliser des cles partagees par erreur.

## 3. Build frontend heberge

Si tu veux une build statique avec une URL API explicite :

```powershell
.\build_frontend_web_hosted.cmd -BackendUrl "https://api.prospectlocal.example"
```

Si tu veux le mode recommande `meme origine` :

```powershell
powershell -ExecutionPolicy Bypass -File .\build_frontend_web_hosted.ps1 -SameOrigin
```

Sortie :

- `frontend/dist_hosted`

Le front sait maintenant lire l'URL API depuis :

1. `window.__PROSPECTLOCAL_RUNTIME__.apiUrl`
2. `EXPO_PUBLIC_API_URL`
3. `EXPO_PUBLIC_BACKEND_URL`
4. `REACT_APP_BACKEND_URL`
5. fallback `meme origine`

## 4. Pack de deploiement pret a copier

Pour generer un dossier de deploiement simple a envoyer sur un serveur :

```powershell
.\prepare_hosted_release.cmd
```

Sortie :

- `dist_hosted_release`

Ce dossier contient deja :

- le frontend statique
- le backend
- les Dockerfiles
- le compose
- les fichiers de config sample

## 5. Mise en ligne type

Dans le dossier genere :

1. renommer `backend/.env.hosted.sample` en `backend/.env.hosted`
2. renommer `.env.hosted.compose.sample` en `.env`
3. remplir les vraies valeurs
4. lancer :

```powershell
docker compose -f docker-compose.hosted.yml up -d --build
```

Ensuite :

- Caddy sert le frontend
- Caddy reverse-proxy `/api`
- l'app est accessible par URL

## 5 bis. Mise en ligne Railway

Une fois le repo pousse sur GitHub :

1. creer un projet Railway
2. choisir le repo `PROSPECTLOCAL`
3. laisser Railway utiliser le `Dockerfile` racine
4. definir les variables suivantes dans le service Railway :
   - `MONGO_URL`
   - `DB_NAME`
   - `SECRET_KEY`
   - `BOOTSTRAP_ADMIN_EMAIL`
   - `BOOTSTRAP_ADMIN_PASSWORD`
   - `ALLOW_GLOBAL_API_KEY_FALLBACK=false`
   - `SERPER_API_KEY`
   - `PAPPERS_API_KEY`
   - `GOOGLE_API_KEY`
   - `CORS_ALLOW_ORIGINS`
5. configurer le `Healthcheck Path` sur :
   - `/healthz`

Le service Railway servira ensuite :

- l'app web sur `/`
- l'API sur `/api`

## 5 ter. Workflow simple pour les futures mises a jour

Une fois le repo GitHub relie a Railway, la mise a jour de l'URL se fait comme ceci :

1. modifier le code local dans [prospectlocal_source](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source)
2. lancer [publish_railway_update.cmd](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/publish_railway_update.cmd)
3. le script :
   - synchronise le dossier local vers le clone GitHub
   - commit les changements
   - push sur `main`
4. Railway redeploie automatiquement l'URL

Si tu veux seulement preparer le repo local sans publier tout de suite :

- lancer [sync_railway_repo.cmd](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/sync_railway_repo.cmd)

## 6. Endpoint de sante

Le backend expose maintenant :

- `/healthz`

Il sert pour :

- healthcheck Docker
- supervision simple
- verification rapide apres mise en ligne
