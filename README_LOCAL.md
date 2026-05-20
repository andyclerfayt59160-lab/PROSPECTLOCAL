## ProspectLocal Source

Cette copie est la base locale de reprise de l'app. C'est ici qu'on continue
le produit et les builds desktop.

### Structure

- `backend` : API FastAPI + MongoDB
- `frontend` : app Expo / web

### Lancement le plus simple

- `start_local_app.cmd`
  Lance le backend stable, rebuild le front web exporte, sert la version
  statique la plus recente et ouvre `http://127.0.0.1:8085`.

- `start_local_dev.cmd`
  Lance le backend et le front web en mode dev dans deux fenetres.

- `start_local_preview.cmd`
  Lance une preview statique exportee. Utile pour controler le rendu, moins
  fiable pour les tests de connexion complets.

- `start_backend_local.cmd`
  Backend en mode dev avec reload.

- `start_backend_preview.cmd`
  Backend stable sans reload, recommande pour la preview locale.

### Lancement manuel

1. Lancer `start_backend_local.cmd`
2. Lancer `start_frontend_web.cmd`
3. Ouvrir l'URL Expo web affichee dans le terminal

### Build web et desktop

- `build_frontend_web.cmd`
- `build_frontend_web_hosted.cmd`
  Genere une vraie version web hebergee avec une URL backend publique et un
  `runtime-config.js` modifiable sans recompiler toute l'app.
- `serve_frontend_export.cmd`
- `build_desktop_exe.cmd`
  Rebuild le logiciel desktop dans `dist\ProspectLocalDesktop`.

- `build_desktop_installer.cmd`
  Construit un vrai installateur Windows dans `dist_installer`.

- `publish_desktop_release.cmd`
  Republie la build dans `C:\Users\AndyC\Documents\Codex\PROSPECTLOCAL.EXE`
  et relance automatiquement `PROSPECTLOCAL.exe`.

- `publish_update_feed.cmd`
  Publie un `manifest.json` + l'installateur dans un dossier de feed
  d'updates Windows.

- `prepare_work_pc_release.cmd`
  Prepare un installateur Windows "PC pro" avec feed OneDrive et peut
  activer en option le seed de base partagee au premier lancement.

- `rebuild_and_restart_desktop.cmd`
  Enchaine rebuild + republication + redemarrage automatique de l'app desktop.

### Acces local par defaut

- URL backend docs : `http://127.0.0.1:8011/docs`
- URL app web locale : `http://127.0.0.1:8085`
- Compte admin local seed :
  - email : `admin@prospection.com`
  - mot de passe : `admin123`

### Smoke test runtime

- `run_runtime_smoke.cmd`
  Rejoue la recette critique sur l'app locale publiee :
  login, estimation Pappers, credits, scans, CRM, visites, doublons,
  notifications.

- Variables requises :
  - `PL_EMAIL`
  - `PL_PASSWORD`

- Exemple PowerShell :
  - `$env:PL_EMAIL='vous@example.com'`
  - `$env:PL_PASSWORD='motdepasse'`
  - `.\run_runtime_smoke.cmd`

### Notes

- Par defaut, MongoDB local est attendu sur `mongodb://127.0.0.1:27017`
- Le backend utilise `backend/.env`
- Le frontend utilise `frontend/.env`
- Le front exporte est genere dans `frontend/dist`
- Le backend desktop ProspectLocal tourne desormais sur `127.0.0.1:8011`
  pour eviter les conflits avec d'autres projets locaux exposes en `8000`
- Pour tester la connexion et la navigation, utiliser de preference
  `start_local_app.cmd`
- `start_frontend_web.cmd` reste utile pour le debug Expo, mais moins fiable
  que le flux exporte/stable

### Installateur Windows et mises a jour

- Le desktop peut maintenant etre installe via un vrai installateur Windows
  genere par `build_desktop_installer.cmd`.
- Le desktop peut verifier les mises a jour au lancement si une source de
  manifest est configuree.
- Le manifest peut etre :
  - une URL `https://.../manifest.json`
  - un chemin partage Windows `\\serveur\partage\manifest.json`
  - un chemin local synchronise (OneDrive, etc.)
- Les chemins locaux peuvent utiliser `%USERPROFILE%` pour rester valides
  d'un PC a l'autre.
- Le feed d'updates se publie avec `publish_update_feed.cmd`.
- Le flux recommande pour un poste pro est :
  `%USERPROFILE%\OneDrive\Apps\ProspectLocal\stable\manifest.json`

#### Workflow recommande pour le PC pro

1. Rebuild le desktop si besoin.
2. Lance `prepare_work_pc_release.cmd`
   - sans option pour une version auto-update prete
   - avec `-SeedSharedDatabase` pour un premier lancement directement sur
     la base partagee si la cible distante est deja accessible
3. Installe l'app sur le PC pro avec l'installateur genere dans
   `dist_installer`.

#### Configuration persistante du PC installe

- Fichier local prioritaire :
  `C:\Users\%USERNAME%\AppData\Local\ProspectLocal\desktop-config.json`
- Fichier optionnel a cote de l'executable installe :
  `desktop-config.json`
- Exemple :
  ```json
  {
    "update_manifest_url": "\\\\serveur\\partage\\ProspectLocal\\stable\\manifest.json",
    "seed_shared_backend_on_first_run": true
  }
  ```

#### Base partagee live perso / pro

- Le desktop installe peut charger une config backend persistante hors du bundle
  dans :
  `C:\Users\%USERNAME%\AppData\Local\ProspectLocal\backend.override.env`
- Si `seed_shared_backend_on_first_run` est active et qu'aucun override n'existe
  encore, l'app copie automatiquement le profil partage depuis le bundle vers
  ce fichier local.
- Ce fichier n'est pas remplace par les mises a jour, donc la base Mongo partagee
  reste stable entre deux versions.

### Base partagee pro / perso

- L'app peut pointer vers une base MongoDB distante partagee entre plusieurs
  machines.
- La config locale active reste dans `backend/.env`.
- La config distante prete a l'emploi est dans `backend/.env.shared`.
- La sauvegarde du mode local est conservee dans `backend/.env.local.backup`.

#### Scripts utiles

- `switch_to_shared_database.cmd`
  Migre la base locale vers la base distante de `backend/.env.shared`, active
  ensuite cette base dans `backend/.env`, puis rebuild et relance l'app.

- `activate_shared_database.cmd`
  Lance le workflow complet de migration + activation de la base partagee.

- `activate_local_database.cmd`
  Remet `backend/.env` sur la base locale sauvegardee dans
  `backend/.env.local.backup`, puis rebuild et relance l'app.

#### Mode recommande

- Tant que la base distante n'a pas ete migree et testee, garder `backend/.env`
  en local.
- Une fois la migration reussie, la meme release desktop pourra etre utilisee
  sur le PC perso et le PC pro avec la meme base.

### Version web hebergee

- Voir [WEB_DEPLOYMENT.md](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/WEB_DEPLOYMENT.md)
- Le front web heberge peut etre build avec :
  - `build_frontend_web_hosted.cmd -BackendUrl "https://api.prospectlocal.example"`
  - `powershell -ExecutionPolicy Bypass -File .\build_frontend_web_hosted.ps1 -SameOrigin`
- Un pack complet de deploiement peut etre genere avec :
  - `prepare_hosted_release.cmd`
- Le backend public peut etre prepare avec :
  - [Dockerfile.backend](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/Dockerfile.backend)
  - [Dockerfile.frontend.hosted](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/Dockerfile.frontend.hosted)
  - [docker-compose.hosted.yml](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/docker-compose.hosted.yml)
  - [backend/.env.hosted.sample](C:/Users/AndyC/Documents/Codex/PROSPECTLOCAL.SOURCE/prospectlocal_source/backend/.env.hosted.sample)
