# Dispo pour Android

Version Android native de **Dispo**, réalisée avec Kotlin et Jetpack Compose. Ce
module vise d'abord une bêta testable, fidèle aux parcours essentiels de l'app
iOS, tout en gardant le backend Supabase facultatif.

| Élément | Valeur |
|---|---|
| Dossier à ouvrir | `android/` |
| Application ID | `com.ludovicmarie.dispo` |
| Android minimum | Android 8.0 / API 26 |
| `compileSdk` / `targetSdk` | API 36 |
| Java | JDK 17 |
| UI | Kotlin + Jetpack Compose + Material 3 |
| Backend | Démo locale par défaut, Supabase facultatif |

## Périmètre de cette première bêta

Le MVP Android est **offline-first** : les données fictives fournies avec le
projet permettent de découvrir et tester l'app sans compte ni secret. Il couvre
les parcours qui valident le concept produit :

- onboarding et navigation principale Accueil / SOS / Messages / Profil ;
- recherche et découverte de musiciens ;
- annonces SOS, matching local et verrou Premium de 30 minutes ;
- favoris, disponibilité et profil ;
- conversations de démonstration et paywall simulé.

Les fonctions suivantes restent à terminer avant une vraie mise en production :

- synchronisation Supabase complète de tous les écrans ;
- cartes, géolocalisation réelle et recherche par distance ;
- groupes, répertoire, événements et partitions ;
- capture et upload des photos/vidéos ;
- notifications push FCM ;
- abonnements Google Play Billing et validation serveur des achats ;
- parité des sept langues et tests d'accessibilité complets.

Ne présentez donc pas cette build comme une version de production connectée :
c'est une **bêta fonctionnelle de validation**.

## Architecture du MVP

Le module suit une séparation simple, adaptée à une première version :

```text
android/
├── app/src/main/
│   ├── java/com/ludovicmarie/dispo/
│   │   ├── MainActivity.kt       # point d'entrée Android
│   │   ├── data/
│   │   │   ├── Models.kt         # modèles du domaine et du seed
│   │   │   ├── SeedDataSource.kt # lecture/reprojection du seed local
│   │   │   ├── SearchEngine.kt   # recherche normalisée et alias
│   │   │   └── MatchingEngine.kt # classement des remplaçants SOS
│   │   └── ui/                   # ViewModel, thème et écrans Compose
│   ├── assets/seed_data.json     # données JSON de démonstration
│   └── res/                      # textes, thèmes et images
├── app/src/test/java/com/ludovicmarie/dispo/data/
│                                # tests unitaires du matching/recherche
├── app/build.gradle.kts
└── local.properties.example
```

- **Compose** affiche l'interface et observe l'état exposé par le ViewModel.
- Le **repository de démonstration** charge le seed local et recalcule les dates
  afin que les profils et SOS restent testables dans le futur.
- La configuration **Supabase** est injectée dans `BuildConfig` au build. Des
  valeurs vides conservent le fonctionnement local.
- Le statut Premium du MVP est une simulation locale. Il ne constitue jamais
  une preuve d'abonnement côté serveur.

La variante `release` de cette bêta garde temporairement R8/minification
désactivé : la version de R8 livrée avec AGP 8.13 ne lit pas encore proprement
les métadonnées Kotlin 2.4. Réactivez la réduction seulement après migration
vers une combinaison AGP/R8 officiellement compatible et un test complet de
la build minifiée.

## Installer l'environnement

### Prérequis communs

1. Installez [Android Studio](https://developer.android.com/studio) avec le JDK
   embarqué ou un JDK 17.
2. Dans **SDK Manager**, installez **Android SDK Platform 36**, les Build Tools
   correspondants et **Android SDK Platform-Tools**.
3. Créez un émulateur récent ou activez le débogage USB sur un appareil Android.
4. Ouvrez le dossier `android`, et non le dépôt complet, dans Android Studio.

Le projet utilise le Gradle Wrapper : il n'est pas nécessaire d'installer
Gradle globalement.

### Windows 11 / PowerShell

Depuis la racine du dépôt :

```powershell
Set-Location .\android
Copy-Item .\local.properties.example .\local.properties
```

Dans `local.properties`, adaptez le chemin du SDK. Les antislashs doivent être
échappés dans ce fichier :

```properties
sdk.dir=C\:\\Users\\VOTRE_NOM\\AppData\\Local\\Android\\Sdk
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

Puis compilez et testez :

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```

L'APK de test se trouve dans
`app/build/outputs/apk/debug/app-debug.apk`. Pour l'installer sur l'appareil
connecté :

```powershell
adb install -r .\app\build\outputs\apk\debug\app-debug.apk
```

### macOS / Terminal

Depuis la racine du dépôt :

```bash
cd android
cp local.properties.example local.properties
```

Adaptez ensuite `local.properties` :

```properties
sdk.dir=/Users/VOTRE_NOM/Library/Android/sdk
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

Compilez, testez et installez :

```bash
chmod +x gradlew
./gradlew :app:testDebugUnitTest :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Dans Android Studio, le même résultat s'obtient en sélectionnant un téléphone
ou un émulateur puis **Run app**.

## Activer Supabase, facultativement

La démo fonctionne avec ces deux valeurs vides. Pour connecter une build de
développement au projet Supabase, renseignez seulement les valeurs client dans
`local.properties` :

```properties
SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_VOTRE_CLE
```

`local.properties` est ignoré par Git. La clé publishable reste malgré tout
extractible de l'APK : c'est normal pour une clé client publique, et c'est la
raison pour laquelle **toute autorisation doit être garantie par les policies
RLS de Supabase**.

Ne mettez jamais dans Android :

- une clé `service_role` ou une clé `sb_secret_…` ;
- un mot de passe Postgres ;
- un Personal Access Token Supabase ;
- une clé privée ou un secret de signature.

Ces secrets doivent vivre uniquement dans un environnement serveur sécurisé,
par exemple une Supabase Edge Function avec des secrets configurés côté projet.

### Sécurité Premium à corriger avant production

Le client ne doit jamais pouvoir écrire lui-même `profiles.is_premium`. Sinon,
un utilisateur peut modifier l'app ou appeler directement l'API pour s'accorder
Premium gratuitement.

Le flux de production doit être le suivant :

1. l'app lance un achat avec **Google Play Billing** ;
2. elle transmet le `purchaseToken` à une fonction serveur ;
3. le serveur vérifie l'achat auprès de Google Play ;
4. seul ce serveur privilégié crée ou met à jour l'entitlement Premium ;
5. les RLS refusent toute modification de cet entitlement par le client ;
6. renouvellements, expirations et remboursements sont réconciliés côté
   serveur.

Google recommande précisément cette vérification et cette synchronisation dans
[l'intégration Play Billing côté serveur](https://developer.android.com/google/play/billing/backend)
et son guide [Fraude et abus](https://developer.android.com/google/play/billing/security).

Tant que ce flux n'existe pas, gardez le paywall Android en mode démonstration
et ne vendez pas l'abonnement.

## Générer une build signée

### 1. Préparer la version

Avant chaque envoi, modifiez dans `app/build.gradle.kts` :

- `versionCode` : entier strictement supérieur à toutes les versions déjà
  envoyées sur Play Console ;
- `versionName` : version lisible, par exemple `0.9.1`.

L'`applicationId` `com.ludovicmarie.dispo` devient permanent dès la création de
l'application sur Play Console. Ne le changez plus après le premier upload.

### 2. Créer la clé d'upload

Le plus simple est Android Studio :

1. **Build → Generate Signed Bundle / APK** ;
2. choisissez **Android App Bundle** ;
3. cliquez **Create new** ;
4. créez une clé d'upload avec l'alias `dispo-upload` et une longue validité ;
5. stockez le fichier `.jks`, son mot de passe et le mot de passe de l'alias
   dans un gestionnaire de mots de passe et une sauvegarde sécurisée ;
6. choisissez la variante `release`, puis **Create**.

Alternative en ligne de commande pour créer la clé :

```bash
keytool -genkeypair -v -keystore CHEMIN_SECURISÉ/dispo-upload.jks \
  -alias dispo-upload -keyalg RSA -keysize 4096 -validity 10000
```

Ne placez ni le `.jks`, ni ses mots de passe dans le dépôt. Ils sont déjà
couverts par le `.gitignore` Android, mais une sauvegarde hors Git reste
indispensable.

### 3. Produire l'AAB

Utilisez l'assistant Android Studio avec la clé existante. Il génère le fichier
`.aab` signé dans le dossier de destination choisi. Un build Gradle standard
peut aussi produire le bundle :

```powershell
# Windows
.\gradlew.bat :app:bundleRelease
```

```bash
# macOS
./gradlew :app:bundleRelease
```

Sans configuration de signature Gradle, le fichier
`app/build/outputs/bundle/release/app-release.aab` produit par cette dernière
commande n'est pas prêt à être envoyé : signez-le via l'assistant Android
Studio. Google Play attend un **Android App Bundle (AAB)** signé, pas l'APK de
debug.

Au premier upload, activez **Play App Signing**. Google conserve alors la clé de
signature de l'app ; votre clé locale devient la **clé d'upload**. Conservez-la
malgré tout avec soin. La procédure officielle est détaillée dans
[Signer l'application](https://developer.android.com/studio/publish/app-signing)
et [envoyer un App Bundle](https://developer.android.com/studio/publish/upload-bundle).

## Mettre des testeurs sur Google Play

### Créer le compte et l'application

1. Créez un compte dans [Google Play Console](https://play.google.com/console/).
   Il faut avoir 18 ans et régler les frais uniques de **25 USD**. Choisissez
   correctement **Personnel** ou **Organisation**, car les vérifications
   diffèrent. Une organisation doit notamment prévoir son numéro D‑U‑N‑S ; son
   obtention peut prendre jusqu'à 30 jours. Les nouveaux comptes personnels
   doivent aussi vérifier l'accès à un appareil Android physique, non rooté,
   sous Android 10 ou plus récent. Voir les
   [conditions du compte](https://support.google.com/googleplay/android-developer/answer/6112435?hl=fr),
   les [informations D‑U‑N‑S](https://support.google.com/googleplay/android-developer/answer/13634885?hl=fr),
   la [vérification du compte](https://support.google.com/googleplay/android-developer/answer/13628312?hl=fr)
   et la [vérification de l'appareil](https://support.google.com/googleplay/android-developer/answer/14316361?hl=fr).
2. Cliquez **Toutes les applications → Créer une application**.
3. Choisissez le français comme langue par défaut, le nom **Dispo**, le type
   **Application**, puis gratuit ou payant. Une app gratuite ne peut pas devenir
   payante plus tard ; un abonnement Premium reste toutefois possible avec Play
   Billing.
4. Conservez le package `com.ludovicmarie.dispo` : le nom de package n'est plus
   modifiable après l'envoi du premier artefact.

### Test interne — pour les premières installations

Le test interne est le chemin le plus rapide et accepte jusqu'à **100 testeurs** :

1. ouvrez **Tests → Test interne** ;
2. créez une release, activez Play App Signing si demandé et envoyez l'AAB signé ;
3. ajoutez des notes de version, corrigez les erreurs bloquantes, puis lancez la
   release sur la piste interne ;
4. dans l'onglet **Testeurs**, créez une liste d'adresses e-mail Google ;
5. copiez l'URL de participation et envoyez-la aux testeurs ;
6. chaque testeur ouvre le lien avec le compte Google inscrit, clique pour
   participer, puis installe ou met à jour Dispo depuis Google Play.

L'URL ne fonctionne correctement qu'une fois la release publiée sur la piste.
La propagation prend généralement quelques minutes, mais peut prendre plusieurs
heures. Le test interne est idéal pour Ludovic, Raphaël et quelques appareils de
contrôle. Une app disponible **exclusivement** sur la piste interne est exemptée
du formulaire Sécurité des données ; celui-ci devient requis dès un test fermé,
ouvert ou une production. La procédure complète est dans la documentation
[Configurer un test ouvert, fermé ou interne](https://support.google.com/googleplay/android-developer/answer/9845334?hl=fr).

### Test fermé — étape obligatoire pour certains comptes personnels

Pour un compte **personnel créé après le 13 novembre 2023**, l'accès à la
production exige actuellement :

- au moins **12 testeurs** inscrits au test fermé ;
- une inscription continue pendant **14 jours consécutifs** ;
- des testeurs encore inscrits au moment de demander l'accès à la production ;
- un test réel et des réponses crédibles aux questions de Google sur les retours
  et les corrections effectuées.

Procédure recommandée :

1. ouvrez **Tests → Test fermé** et créez une piste `beta` ;
2. sélectionnez les pays concernés ;
3. ajoutez une liste e-mail ou un Google Group — invitez plutôt 15 à 20 personnes
   pour conserver au moins 12 participants actifs ;
4. créez et publiez une release avec l'AAB déjà validé en interne ;
5. envoyez l'URL de participation et demandez à chacun de confirmer
   l'inscription ;
6. vérifiez chaque jour que le seuil reste atteint pendant les 14 jours ;
7. collectez quelques scénarios testés et retours, corrigez les problèmes, puis
   envoyez une nouvelle version si nécessaire ;
8. une fois la période terminée, utilisez **Tableau de bord → Demander l'accès à
   la production** et décrivez honnêtement le test et les améliorations.

Être présent dans la liste ne suffit pas : chaque personne doit ouvrir le lien
avec son compte Google et accepter le test. Si elle quitte puis rejoint à
nouveau la piste, son compteur de 14 jours consécutifs repart de zéro.

Un utilisateur déjà inscrit au test interne doit quitter cette piste avant de
rejoindre un test fermé ou ouvert. Les conditions exactes et la demande d'accès
sont décrites dans
[Exigences de test pour les nouveaux comptes personnels](https://support.google.com/googleplay/android-developer/answer/14151465?hl=fr).

Le **test ouvert** est optionnel : toute personne disposant du lien, ou trouvant
la fiche si elle est visible, peut rejoindre la bêta. Pour les nouveaux comptes
personnels soumis à la règle 12/14, Google ne le rend disponible qu'après
l'obtention de l'accès production. Utilisez-le seulement quand le produit, le
support et la politique de confidentialité sont prêts.

## Préparer la publication publique

### Fiche Play Store et déclarations

Avant la revue, complétez toutes les tâches signalées dans le tableau de bord :

- nom, descriptions courte et complète, icône haute résolution, visuel de
  présentation et captures d'écran Android réelles ;
- coordonnées de support et catégorie ;
- questionnaire de classification du contenu, audience cible et déclaration
  sur les publicités ;
- section **Accès à l'application** avec un compte de revue fonctionnel si une
  connexion est requise ; le backend et ce compte doivent rester disponibles
  pendant toute la revue ;
- politique de confidentialité accessible publiquement par URL, non protégée et
  **pas uniquement sous forme de PDF** ;
- formulaire **Sécurité des données** correspondant exactement à la build
  envoyée ;
- si l'utilisateur peut créer un compte, suppression du compte disponible dans
  l'app **et** depuis une page web publique, avec suppression réelle des données
  associées sauf obligations de conservation clairement expliquées.

Pour la build locale sans compte ni serveur, les réponses « données collectées »
peuvent différer d'une future build Supabase. Réévaluez donc le formulaire à
chaque ajout d'authentification, analytics, crash reporting, géolocalisation,
messages ou média. Une build live Dispo collectera vraisemblablement au minimum
des identifiants de compte, du contenu de profil et des messages : ne la déclarez
pas comme une app qui ne collecte aucune donnée.

Références officielles :

- [Créer et configurer une application](https://support.google.com/googleplay/android-developer/answer/9859152?hl=fr)
- [Préparer l'application pour l'examen](https://support.google.com/googleplay/android-developer/answer/9859455?hl=fr)
- [Politique relative aux données utilisateur](https://support.google.com/googleplay/android-developer/answer/10144311?hl=fr)
- [Remplir la section Sécurité des données](https://support.google.com/googleplay/android-developer/answer/10787469?hl=fr)

### Exigences techniques 2026

- À compter du **31 août 2026**, une nouvelle app ou mise à jour doit cibler
  **Android 16 / API 36**. Ce module utilise déjà `targetSdk = 36`. Vérifiez la
  [règle officielle de niveau d'API cible](https://developer.android.com/google/play/requirements/target-sdk)
  avant chaque release.
- Envoyez un AAB signé et augmentez toujours `versionCode`.
- Testez la build `release`, pas seulement l'APK `debug`, notamment le login,
  les deep links, le réseau et les écrans affectés par R8/minification.
- À compter du 30 septembre 2026, les noms de package Play doivent aussi être
  enregistrés dans le cadre de l'Android developer verification. Google prévoit
  d'auto-enregistrer les apps Play quand les informations sont déjà validées ;
  contrôlez néanmoins l'état du package sur la
  [page officielle dédiée](https://support.google.com/googleplay/android-developer/answer/16984799?hl=en).

### Lancer la production

1. Résolvez toutes les alertes du tableau de bord et gardez au moins une build
   testée sur la piste fermée.
2. Si le compte personnel est soumis aux 12 testeurs / 14 jours, obtenez d'abord
   l'accès à la production.
3. Ouvrez **Production → Créer une release**, sélectionnez l'AAB validé, ajoutez
   les notes de version et vérifiez les pays de diffusion.
4. Examinez le résumé, corrigez les erreurs, puis envoyez la release pour revue.
5. Utilisez si possible la publication gérée ou un déploiement progressif afin
   de pouvoir arrêter rapidement le rollout en cas de problème.
6. Surveillez Android Vitals, les crashs, ANR, avis et tickets de support après
   la mise en ligne.

Une revue prend souvent jusqu'à **sept jours**, parfois davantage. Ne promettez
donc pas une date de lancement avant l'approbation. Voir
[Créer une release de production](https://support.google.com/googleplay/android-developer/answer/9859348?hl=fr)
et [délais d'examen](https://support.google.com/googleplay/android-developer/answer/9859751?hl=fr).

## Checklist de sortie bêta

- [ ] Tests unitaires et `assembleDebug` passent sur Windows ou macOS.
- [ ] APK installé sur au moins un vrai appareil Android 10+.
- [ ] Parcours onboarding, recherche, SOS, messages et reset testés.
- [ ] AAB `release` signé avec la clé d'upload sauvegardée.
- [ ] `versionCode` augmenté.
- [ ] Test interne réalisé sur plusieurs tailles d'écran.
- [ ] Au moins 12 testeurs fermés actifs pendant 14 jours si le compte y est soumis.
- [ ] RLS auditées et impossible de s'accorder Premium depuis le client.
- [ ] Play Billing et validation serveur en place avant tout abonnement payant.
- [ ] Politique de confidentialité et suppression de compte accessibles publiquement.
- [ ] Formulaire Sécurité des données conforme à la build réelle.
- [ ] Identifiants de revue valides et backend surveillé pendant l'examen.
