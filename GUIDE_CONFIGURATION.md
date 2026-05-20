# 🚀 Guide de Configuration - Application de Prospection B2B

## 📋 Vue d'ensemble

Votre application de prospection B2B est prête ! Elle permet de :
- ✅ Scanner les fiches Google Business par zone géographique
- ✅ Filtrer par activité (plombiers, électriciens, etc.)
- ✅ Vérifier automatiquement la présence sur Pages Jaunes
- ✅ Exporter les données en CSV, Excel ou JSON
- ✅ Utilisation sur mobile (iOS/Android) et Windows (navigateur web)

---

## 🔑 Configuration de la Clé API Google Places (OBLIGATOIRE)

### Pourquoi c'est nécessaire ?
Pour scanner les établissements Google, l'application utilise l'API Google Places. Sans cette clé, l'application affichera uniquement des données de démonstration.

### ⏱️ Temps estimé : 10-15 minutes

---

## 📖 Étapes pour obtenir votre clé API Google Places

### Étape 1 : Créer un compte Google Cloud (si vous n'en avez pas)

1. Allez sur : https://console.cloud.google.com
2. Connectez-vous avec votre compte Google
3. Acceptez les conditions d'utilisation

### Étape 2 : Créer un nouveau projet

1. Cliquez sur le menu déroulant du projet en haut de la page
2. Cliquez sur "**Nouveau projet**"
3. Donnez un nom à votre projet : `Prospection-B2B`
4. Cliquez sur "**Créer**"

### Étape 3 : Activer l'API Places

1. Dans le menu de gauche, allez sur "**APIs et services**" > "**Bibliothèque**"
2. Recherchez : `Places API`
3. Cliquez sur "**Places API**"
4. Cliquez sur le bouton "**ACTIVER**"

### Étape 4 : Activer aussi Geocoding API

1. Toujours dans la bibliothèque, recherchez : `Geocoding API`
2. Cliquez sur "**Geocoding API**"
3. Cliquez sur "**ACTIVER**"

### Étape 5 : Configurer la facturation

⚠️ **Important** : La facturation est obligatoire, MAIS Google offre 300$ de crédit gratuit !

1. Allez sur "**Facturation**" dans le menu
2. Cliquez sur "**Associer un compte de facturation**"
3. Suivez les étapes pour ajouter votre carte bancaire
4. **Rassurez-vous** : Vous ne serez pas débité tant que vous restez dans la limite gratuite (300$/mois offerts)

### Étape 6 : Créer votre clé API

1. Allez dans "**APIs et services**" > "**Identifiants**"
2. Cliquez sur "**+ CRÉER DES IDENTIFIANTS**" en haut
3. Sélectionnez "**Clé API**"
4. Votre clé API apparaît ! **Copiez-la immédiatement**

### Étape 7 : Sécuriser votre clé API (RECOMMANDÉ)

1. Cliquez sur "**RESTREINDRE LA CLÉ**"
2. Sous "Restrictions de l'API", sélectionnez "**Restreindre la clé**"
3. Cochez :
   - ✅ Places API
   - ✅ Geocoding API
4. Cliquez sur "**ENREGISTRER**"

---

## 💻 Configuration de l'application

### Sur votre serveur / PC de développement

1. Ouvrez le fichier : `/app/backend/.env`

2. Remplacez la ligne :
   ```
   GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY_HERE
   ```
   
   Par :
   ```
   GOOGLE_API_KEY=votre_vraie_clé_ici
   ```

3. Sauvegardez le fichier

4. Redémarrez le backend :
   ```bash
   sudo supervisorctl restart backend
   ```

---

## 🌐 Utilisation de l'application

### Sur Windows (Navigateur)

1. Ouvrez votre navigateur (Chrome, Edge, Firefox)
2. Accédez à l'URL de votre application
3. L'interface s'adapte automatiquement aux grands écrans

### Sur Mobile (iOS/Android)

1. Scannez le QR code Expo Go avec votre téléphone
2. L'application s'ouvre dans Expo Go

---

## 📊 Fonctionnalités principales

### 🔍 Recherche

1. **Choisissez une activité** :
   - Tapez manuellement (ex: "plombier", "électricien")
   - Ou utilisez les boutons rapides

2. **Définissez la zone** :
   - Ville : "Lille", "Paris", "Lyon"
   - Code postal : "59000", "75001"
   - Adresse complète : "10 Rue de la Paix, Paris"

3. **Sélectionnez le rayon** :
   - 5km, 10km, 20km, 30km ou 50km

4. **Lancez la recherche** !

### 📋 Résultats

Pour chaque établissement, vous obtenez :
- ✅ Nom de l'entreprise
- ✅ Adresse complète
- ✅ Numéro de téléphone (cliquez pour appeler)
- ✅ Site web (cliquez pour visiter)
- ✅ Note et nombre d'avis Google
- ✅ **Indicateur Pages Jaunes** (✓ présent / ✗ absent)
- ✅ Lien vers la fiche Pages Jaunes (si présente)

### 💾 Export des données

Exportez vos résultats en 3 formats :

1. **CSV** : Compatible Excel, LibreOffice
2. **Excel (.xlsx)** : Format Excel natif avec mise en forme
3. **JSON** : Pour intégrations techniques

**Sur Windows** : Le fichier se télécharge automatiquement dans votre dossier Téléchargements

---

## 💰 Coûts et limites

### Limites gratuites Google Places API

Google offre **300$ de crédit gratuit par mois**, ce qui correspond à :

- **Geocoding** : ~40 000 requêtes gratuites/mois
- **Places Text Search** : ~1 000 recherches gratuites/mois
- **Places Details** : ~10 000 détails gratuits/mois

### Estimation pour votre usage

Si vous faites 50 recherches par jour avec 20 résultats chacune :
- 50 recherches × 30 jours = 1 500 recherches/mois
- **Coût estimé** : ~45$ par mois
- **Donc GRATUIT** avec le crédit de 300$ !

### Conseils pour optimiser les coûts

1. **Ne demandez que les champs nécessaires** (déjà configuré ✓)
2. **Utilisez le cache** : Les résultats sont sauvegardés en base de données
3. **Limitez le rayon** : Un rayon plus petit = moins de résultats = moins cher
4. **Configurez des alertes** : Google Cloud permet de recevoir des alertes à 50%, 90% et 100% du budget

---

## 🆘 Dépannage

### "Aucun résultat trouvé"

1. Vérifiez que votre clé API est bien configurée
2. Vérifiez que les APIs sont activées (Places API + Geocoding API)
3. Vérifiez que la facturation est configurée

### "API key not valid"

1. Copiez à nouveau votre clé API (sans espaces)
2. Vérifiez les restrictions de la clé
3. Attendez quelques minutes après la création de la clé

### "Quota exceeded"

1. Vérifiez votre utilisation dans Google Cloud Console
2. Augmentez votre quota ou attendez le mois prochain

---

## 📱 Installation sur Windows (Progressive Web App)

### Option 1 : Utiliser dans le navigateur
Ajoutez simplement l'URL en favori !

### Option 2 : Installer comme application
1. Ouvrez l'application dans Chrome/Edge
2. Cliquez sur le menu (⋮) > "Installer l'application"
3. L'icône apparaît sur votre bureau Windows !

---

## 🔐 Sécurité

### ⚠️ NE JAMAIS :
- ❌ Partager votre clé API publiquement
- ❌ Committer la clé dans Git
- ❌ Envoyer la clé par email

### ✅ TOUJOURS :
- ✅ Garder la clé dans le fichier `.env`
- ✅ Restreindre la clé aux APIs nécessaires
- ✅ Configurer des alertes de budget
- ✅ Surveiller l'utilisation régulièrement

---

## 📧 Support

Pour toute question :
1. Consultez la documentation Google : https://developers.google.com/maps/documentation/places/web-service
2. Vérifiez les logs du backend : `sudo supervisorctl tail -f backend`

---

## ✨ Prochaines étapes

Une fois votre clé API configurée :

1. **Testez l'application** avec différentes recherches
2. **Exportez vos premières données** de prospection
3. **Ajustez les paramètres** selon vos besoins

---

**🎉 Félicitations ! Votre outil de prospection B2B est prêt à l'emploi !**

Bonne prospection ! 💼🚀
