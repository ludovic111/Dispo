# Dispo Expo / React Native — état courant et historique de migration

Dernière mise à jour documentaire : 2 septembre 2026.

Ce fichier conserve le contrat historique de migration et les preuves du
client commun. Depuis la décision explicite de Ludovic du 1er septembre 2026,
`mobile/` est l’unique client canonique pour iOS et Android. Les sources SwiftUI
et Kotlin ont été retirées du workspace ; toute mention contraire plus bas est
une photographie historique désormais supersédée.

La validation de Ludovic autorise la bascule produit et le nettoyage des
anciens clients. Elle ne remplace pas les preuves techniques propres à chaque
parcours, intégration native, appareil physique ou livraison Store.

La section suivante est la source de vérité au 2 septembre 2026. Les matrices
plus bas conservent la photographie détaillée du socle du 30 août et la cible
finale ; en cas d’écart de statut, l’état du 2 septembre prévaut. Aucune
présence de code n’est assimilée à une validation métier, visuelle ou sur
appareil.

## État faisant autorité — 2 septembre 2026

### Surfaces désormais présentes dans le client Expo

- Navigation : le shell utilise les `NativeTabs` système avec les cinq onglets,
  les badges et les marges sûres. La pile racine applique désormais une
  politique explicite avant le premier rendu : les routes qui possèdent leur
  propre `ScreenHeader` masquent la barre native, tandis que les écrans qui
  conservent un titre système n’en rendent pas un second. Pour ces derniers,
  `Screen` retire uniquement la marge sûre supérieure déjà gérée par la barre
  native et conserve la marge basse. Ce lot élimine structurellement les deux
  titres et le grand espace supérieur. Le rendu sans doublon a été contrôlé sur
  simulateur iOS 26.5 et émulateur Android 16 pour Réglages, Disponibilités et
  Notifications, ainsi que sous un vrai titre Stack iOS pour Recherche.
- Authentification et compte : restauration de session, connexion/création,
  reset et retour de lien, onboarding, stockage SecureStore, réglages, thème,
  langues, préférences de notifications, nouveautés et écran Premium de la
  bêta. La connexion par e-mail propose aussi un lien magique Supabase aux
  comptes existants (`shouldCreateUser: false`) : le mot de passe n'est pas
  demandé et le callback revient dans l'application. Une migration non
  destructive reprend au premier lancement la session
  Keychain SwiftUI ou Supabase-KT/SharedPreferences et les préférences locales
  compatibles ; elle conserve les anciennes valeurs pour permettre un retour
  arrière. Les parcours Apple/Google existent dans le code mais restent à
  prouver avec leur configuration native réelle.
- Découverte et profils : Accueil, recherche et filtres, centre de
  notifications, profil public et personnel, édition, relations sociales,
  notes, abonnements, blocage/signalement, followers, joué-avec, portfolio
  photo/vidéo, disponibilités, localisation postale et affiliations/annuaire
  des écoles. Le profil personnel sépare désormais l’édition, les dates de
  disponibilité, les voyages et les démos ; le lieu de voyage est porté par
  `/profile/travel`. Sur l'accueil, « Nouveau groupe » est le seul raccourci
  permanent. Dans les résultats de découverte, l’école n’est affichée qu’une
  fois dans l’identité du profil ;
  le badge redondant « Même école » a été retiré sans supprimer le filtre ni
  l’affiliation. L'acronyme de l'école principale est affiché dans les lignes
  de musiciens disponibles de l'accueil, sans modifier les autres contextes.
- SOS et Sessions : feed, détail, création structurée, candidature/retrait,
  décisions hôte, matching, demande directe, états d’adresse privée et agenda
  futur/passé avec réponses de présence. Le détail d’un événement propose une
  carte intégrée sur iOS, une ouverture d’itinéraire sur les deux plateformes
  et une carte Android lorsque la clé Google Maps restreinte est fournie.
- Messages : conversations directes et de groupe paginées, Realtime
  filtré, unread, typing éphémère, réactions, édition/suppression, signalement,
  blocage et pièces jointes photo, vidéo ou fichier. L'écran Messages ne charge
  et n'affiche plus une section Écoles ; ses routes et notifications dédiées
  restent disponibles ailleurs. L'action « Nouveau groupe » est fixée dans
  l'en-tête du segment Groupes.
- Groupes : liste, création, invitations, membres, réglages, répertoire,
  détails/copie de morceau, documents, événements nouveaux/édités/récurrents,
  présence, invités acceptés, rôles manquants, SOS liés et préremplis,
  candidats disponibles le jour même, adresse privée, rappels locaux et
  setlist avec suggestion, validation et réorganisation. Toutes les routes
  Groupes sans barre Stack possèdent désormais un Retour ou Fermer visible de
  44 points dans leurs états chargement, erreur, vide et succès. Les
  répertoires et setlists partagent maintenant une tuile compacte de 76 points
  minimum, sa pochette de 52 points, une hiérarchie titre/artiste et une ligne
  stable de métadonnées. La poignée de déplacement n’encombre plus chaque
  morceau : le propriétaire entre dans un mode explicite « Réorganiser », puis
  en sort avec « Terminé ». Ce mode masque les actions d’ouverture et d’écoute
  pour éviter les gestes accidentels ; les suggestions en attente restent
  limitées aux décisions utiles. Le geste caché de copie a été supprimé : la
  copie reste une action nommée dans la fiche morceau. La feuille
  d’écoute affiche d’abord uniquement les liens directs de morceau dont l’hôte
  officiel et la forme d’URL ont été vérifiés. Les services sans lien exact sont
  rangés dans une action secondaire explicite « Rechercher sur un autre
  service » ; une recherche n’est jamais présentée comme un lien direct.
  La création de groupe génère maintenant son UUID côté client et n'utilise
  plus `insert(...).select()` : cela évite le `42501` causé par la lecture de la
  représentation PostgREST avant que le trigger d'adhésion rende le groupe
  visible au leader. Les invitations restent indépendantes et signalent les
  échecs partiels. Les dates concert/répétition/jam conservent leur couleur
  propre, indépendamment du line-up. Les morceaux utilisent les 24 tonalités
  historiques et exposent un ordre de solos en lecture seule dans le répertoire
  comme dans les setlists, avec « Membre retiré » pour un identifiant absent.
  La recherche d’ajout interroge le catalogue canonique Supabase puis fusionne
  son résultat avec le repli Apple, en privilégiant les métadonnées et liens
  canoniques lorsque le RPC est disponible. L'analyse locale de fichier audio
  est portée par un module Expo natif AVFoundation/Accelerate sur iOS et
  MediaCodec sur Android pour estimer tonalité et tempo sans envoyer le média.
- Internationalisation : neuf catalogues sont branchés et leur cohérence est
  testée. Langue, pays/région, code postal et ville disposent d'un parcours
  dédié et persistant. La présence d’une traduction ne prouve pas encore son
  rendu sans débordement sur chaque écran et chaque plateforme.
- Identité visuelle : le bleu jazz reste la signature de Dispo, avec une
  palette nuit/cyan, des fonds atmosphériques, une hiérarchie Fraunces plus
  éditoriale, des cartes à trois niveaux et des contrôles cohérents. Le shell,
  les onglets, la saisie, les sélecteurs de date et l’accessibilité privilégient
  les conventions natives ; les surfaces métier restent dessinées sur mesure
  lorsqu’elles rendent l’action plus évidente et la marque plus reconnaissable.
  Le système typographique actif est volontairement limité à trois rôles :
  police système pour lecture et contrôles, Fraunces pour les titres éditoriaux,
  Spline Sans Mono pour libellés courts et données.
- Navigation et morceau : chaque modal possède une sortie système et une sortie
  visible ; les états chargement/erreur de l’affiliation école et l’écran
  Nouveautés ne peuvent plus enfermer l’utilisateur. La fiche morceau ne rend
  plus la grille d’accords, affiche uniquement l’action d’ouverture iReal Pro et
  présente les solos comme une liste numérotée ordonnable avec avatars.
- SOS : le feed propose trois portées explicites — Pour moi, École et Tout — et
  la portée École compare les affiliations visibles du musicien hôte à celles
  du profil connecté.

Ces surfaces sont implémentées structurellement et couvertes par des tests
ciblés. Le lot du 2 septembre a été parcouru avec des comptes locaux dédiés,
mais l'ensemble du client n'est pas déclaré « pixel perfect » ni validé de bout
en bout sur appareil physique.

### Validations réellement observées

- `npm run format:check` : réussi sur l’état courant.
- `npm run validate` : réussi d’un seul tenant le 1er septembre après le lot
  navigation/répertoire/SOS, avec TypeScript, ESLint sans avertissement et 48
  suites / 293 tests Jest réussis.
- Les nouvelles suites verrouillent les trois portées SOS, la sortie de chaque
  modal, les sorties visibles des écrans auparavant bloquants, la tuile morceau,
  l’absence de grille d’accords et la liste ordonnée des solos.
- Les tests ciblés couvrent aussi la politique de barre de navigation, les
  marges sûres des écrans à titre natif, la sérialisation rétrocompatible, la
  déduplication, la copie, iReal Pro, la fusion catalogue canonique/Apple et la
  distinction entre lien direct vérifié et recherche secondaire, notamment
  face aux faux domaines, identifiants et ports.
- L’introspection CNG confirme `irealb` et `irealbook` dans
  `LSApplicationQueriesSchemes` sur iOS et dans les intents `<queries>` Android.
- `npx expo-doctor` : 21/21 contrôles réussis le 31 août.
- Les cinq écrans qui emploient le sélecteur de date natif utilisent l’API
  actuelle `onValueChange` / `onDismiss` ; l’avertissement de développement
  qui recouvrait le bas de l’écran n’est plus émis par ces composants.
- Les contrôles ciblés du détail d’événement de groupe ont aussi passé
  Prettier, ESLint, `git diff --check` et 7 suites Jest (54 tests).
- La suite SQL transactionnelle locale v35-v43 a été exécutée jusqu’au
  `ROLLBACK`, puis `supabase db lint --local --level error` n’a remonté aucune
  erreur. Le premier essai avec `supabase test db` a été écarté : ce fichier
  d’assertions SQL documente explicitement qu’il ne s’agit pas de pgTAP.
- La migration du catalogue a été rejouée localement après un reset au
  `20260831204619` avec un harness comprenant un morceau manuel privé et deux
  titres portant le même Apple ID : une seule identité, un seul lien et aucun
  morceau manuel exposé. Le test transactionnel complet a atteint `ROLLBACK` et
  `supabase db lint --local --level error` a terminé sans erreur. Supabase et
  Colima ont ensuite été arrêtés.
- Le lot final a été prébuildé en configuration production CNG avec les
  identités `ch.dispo.app`, version 2.4, build/versionCode 38. Le build Release
  iOS simulateur a réussi avec son `main.jsbundle`, a été installé et lancé sur
  iOS 26.5 ; l’APK Android Release complet (`:app:assembleRelease`),
  `:app:compileReleaseKotlin` et les tests Kotlin ont réussi sous JDK 17.
- Les 26 tests Deno de `song-enrichment` ont réussi. Les cinq migrations du
  catalogue/enrichissement sont appliquées en production et la fonction Edge
  v1 est active. Le contrôle final de production compte 20 jobs terminés sur
  20, aucun job en attente, aucun morceau sans lien exact, 20 liens Apple
  Music, 20 Deezer, 19 Tidal et 19 Amazon Music. Spotify et YouTube Music sont
  proposés comme recherches explicites lorsqu'aucune URL exacte n'est fournie.
- L'archive de distribution Expo 2.4 (38) a réussi après déverrouillage du
  trousseau, puis l'IPA finale a passé `codesign --verify --deep --strict`, le
  contrôle d'intégrité ZIP et l'inspection de ses entitlements : identifiant
  `2YBQQ56HH8.ch.dispo.app`, APNs `production`, Sign in with Apple `Default` et
  `get-task-allow=false`. Apple a répondu `VERIFY SUCCEEDED` et
  `UPLOAD SUCCEEDED`, puis `BUILD-STATUS: VALID`, `IMPORT-STATUS: VALID` et
  `APP_STORE_ELIGIBLE` pour la livraison
  `8ef20792-e31f-4216-a8f0-6fca1bc93517`. Aucune soumission App Review n'a été
  effectuée.
- Après l’évolution de l’identité bleu jazz, le lot 2.4 (39) a de nouveau passé
  `npm run validate` (46 suites, 286 tests), Expo Doctor 21/21 et un prebuild
  production CNG propre. Le build Release iOS avec bundle embarqué a réussi,
  puis a été installé et lancé sur simulateur iPhone 17 Pro sous iOS 26.5. La
  connexion en thème sombre a été contrôlée visuellement sans chevauchement.
- L’application Android 2.4 (39) a passé `:app:assembleRelease` et
  `:app:testReleaseUnitTest` sous JDK 17 ; la tâche de tests de l’application
  est `NO-SOURCE`. La tâche agrégée à la racine reste incompatible avec une
  suite vide interne à `expo-modules-core`, sans échec du module applicatif.
  L’APK final porte `ch.dispo.app`, `versionCode 39`, `versionName 2.4`,
  `minSdk 24`, `targetSdk 36` et le SHA-256
  `d426acab92921317c7d96f2ed41d6dce2edeb4fdee2917462fca6eeea1a4447d`.
- L’IPA 2.4 (39) a passé l’intégrité ZIP,
  `codesign --verify --deep --strict` et l’inspection de ses entitlements :
  identifiant `2YBQQ56HH8.ch.dispo.app`, APNs `production`, Sign in with Apple
  `Default` et `get-task-allow=false`. Son SHA-256 est
  `e75ca10af300a32dc65e5c17c2215ceb3aa1d3dd468f4a2d703f18ebc4b6cf17`.
  Apple a répondu `VERIFY SUCCEEDED`, `UPLOAD SUCCEEDED`, puis
  `BUILD-STATUS: VALID`, `IMPORT-STATUS: VALID` et `APP_STORE_ELIGIBLE` pour la
  livraison `dd4eb42b-4adb-4fa4-b062-09afb32bc255`. Aucune soumission App
  Review n’a été effectuée.
- Le lot UX du 1er septembre a de nouveau passé Expo Doctor 21/21, un prebuild
  production CNG propre, l’installation des 128 pods, un build Release iOS
  simulateur avec bundle embarqué et `:app:assembleRelease` Android sous JDK 17. L’application Release a été installée et lancée sur l’iPhone 17 Pro
  simulé ; sans session ni compte de test injecté, l’observation s’arrête
  honnêtement à l’écran de connexion et ne prouve pas encore les tuiles sur des
  données authentifiées.
- Ce même lot a ensuite été livré en Expo 2.4 (40) selon la règle TestFlight
  automatique. `npm run validate` a réussi avec 48 suites et 293 tests, Expo
  Doctor 21/21, puis CNG production et 128 pods. L'archive et l'export ont
  réussi ; l'IPA finale a passé l'intégrité ZIP et la signature stricte, contient
  son bundle JavaScript et expose APNs production, Apple Sign-In `Default` et
  `get-task-allow=false`. Apple a répondu `VERIFY SUCCEEDED`,
  `UPLOAD SUCCEEDED`, `BUILD-STATUS: VALID`, `IMPORT-STATUS: VALID` et
  `APP_STORE_ELIGIBLE` pour la livraison
  `a16009f0-fc84-4e6c-82cb-243136a75310`. Aucune soumission App Review ni
  activation de testeurs n'a été effectuée.
- Le lot UX issu des captures du 1er septembre a été livré en Expo 2.4 (41). La tuile
  morceau compacte et la carte de découverte sans badge d’école redondant ont
  été contrôlées visuellement sur iPhone 17 Pro simulé. `npm run validate` a
  réussi avec 48 suites et 294 tests, Expo Doctor avec 21 contrôles sur 21,
  puis le prebuild production CNG et l’installation de 128 pods ont réussi.
  Android `:app:assembleRelease` et `:app:testReleaseUnitTest` ont terminé avec
  succès sous JDK 17 ; la tâche de tests applicative reste `NO-SOURCE`. L’APK
  final est signé v2, porte `ch.dispo.app`, `versionCode 41`, `versionName 2.4`,
  `minSdk 24`, `targetSdk 36` et le SHA-256
  `998cd89842495f25f837dc6fa4cf5274f6ab3322ee94b94340dd482c837be836`.
  L’archive et l’export iOS ont réussi ; l’IPA a passé l’intégrité ZIP et
  `codesign --verify --deep --strict`, contient son bundle JavaScript et expose
  `2YBQQ56HH8.ch.dispo.app`, APNs `production`, Apple Sign-In `Default` et
  `get-task-allow=false`. Son SHA-256 est
  `fed96d70df493b623eec12c2f336a0a8fcb650a9b795d95b88c0abf3435bde0d`.
  Apple a répondu `VERIFY SUCCEEDED`, `UPLOAD SUCCEEDED`,
  `BUILD-STATUS: VALID`, `IMPORT-STATUS: VALID` et `APP_STORE_ELIGIBLE` pour la
  livraison `bb1299a7-0583-4c5c-961a-0de497c8b7e0`. Aucune soumission App
  Review ni activation de testeurs n’a été effectuée.
- Le lot du 2 septembre a été livré en Expo 2.4 (42), commit fonctionnel
  `db058f8`. `npm run validate` a réussi avec 49 suites et 311 tests,
  `npm run format:check` et `git diff --check` ont réussi. Expo Doctor passe
  20 contrôles sur 21 ; le seul écart est un ensemble de 14 paquets Expo en
  retard d'une révision patch, laissé hors de ce lot fonctionnel. Le prebuild
  production CNG, CocoaPods, les builds iOS simulateur et Android Release ont
  réussi. Les écrans Accueil, Messages/Groupes, événements, répertoire, solos,
  tonalités et disponibilités ont été parcourus avec des fixtures Supabase
  locales en clair et sombre, puis les comptes et données temporaires ont été
  supprimés. L'APK direct est signé v2, porte `ch.dispo.app`, `versionCode 42`,
  `versionName 2.4`, `minSdk 24`, `targetSdk 36` et le SHA-256
  `4dc0e143bf94da47885baeccecb9b9504f05818f612fa1994a183e55932e3b40`.
  L'IPA finale expose `2YBQQ56HH8.ch.dispo.app`, APNs `production`, Apple
  Sign-In `Default` et `get-task-allow=false`; son SHA-256 est
  `82ab58669485c71ee89c845561d2f8ee9c98a1b81369f37fb88bdf0a2f536a33`.
  Apple a répondu `VERIFY SUCCEEDED`, `UPLOAD SUCCEEDED`, puis
  `BUILD-STATUS: VALID`, `IMPORT-STATUS: VALID` et `APP_STORE_ELIGIBLE` pour la
  livraison `95d17ad6-46b9-4fc9-94e4-465933f458d3`. Aucune soumission App
  Review ni activation de testeurs n'a été effectuée.
- La migration `20260901082014_rename_hem_to_ema.sql` a conservé l’identifiant
  de l’école et ses relations, puis a été appliquée en production. Les
  historiques local et distant sont alignés ; la ligne active expose désormais
  `ema-geneve`, `École des Musiques Actuelles`, `EMA` et `https://ema.school`.
- Après validation explicite de Ludovic, les sources SwiftUI suivies et la copie
  locale Kotlin ont été retirées du workspace. Le dépôt Android distant et les
  historiques Git sont conservés ; les derniers reliquats locaux iOS et Android
  ont été déplacés dans la Corbeille et restent récupérables.

### État Pixel et iOS

| Cible                        | État vérifié                                                                                                                                                                                        | Ce que cela ne prouve pas                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Pixel physique        | Un APK de développement antérieur a été signé v2, installé et lancé avant la déconnexion du téléphone. Le Pixel est actuellement absent d’ADB.                                                      | Le lot final n’a pas été réinstallé ni observé sur ce téléphone ; aucun parcours authentifié n’est prouvé.                                                             |
| Expo Android émulateur       | APK Release direct 2.4 (42) compilé sous JDK 17, signé v2, installé et lancé sur Android 16/API 36 ; le bouton de lien magique est visible.                                                         | Les parcours authentifiés complets, les données réelles, les ouvertures de services musicaux et la carte avec clé restreinte restent à exercer.                        |
| Expo iOS simulateur          | Build natif 2.4 (42) réussi et lancé sur iPhone 17 Pro ; parcours authentifié avec Supabase local sur Accueil, Groupes, événements, répertoire, solos, tonalités et disponibilités en clair/sombre. | Les intégrations externes et l'équivalence complète sur iPhone physique ne sont pas prouvées par ces fixtures locales.                                                 |
| iPhone physique / TestFlight | Le build Expo 2.4 (42) est importé `VALID` et `APP_STORE_ELIGIBLE` chez Apple.                                                                                                                      | Il n'a pas encore été installé et parcouru sur l'iPhone physique ; la distribution réussie ne prouve pas les intégrations ni la parité visuelle en conditions réelles. |
| Anciens clients natifs       | Sources SwiftUI et copie locale Kotlin retirées après validation explicite du client commun. L’historique Git et les dépôts distants permettent un audit ou une restauration.                       | Leur suppression n’ajoute aucune preuve aux intégrations Expo sur appareil physique.                                                                                   |

### Limites et gates restants

- Conserver `npm run validate` vert après toute modification supplémentaire et
  réaligner les 14 révisions patch Expo avant d'exiger Expo Doctor 21/21 ; le
  lot du 2 septembre passe actuellement 20 contrôles sur 21.
- Exécuter sur deux comptes de test les droits propriétaire/membre,
  leader/invité, hôte/candidat, blocage, confidentialité des adresses, mutations
  et Realtime ; aucune de ces preuves ne doit utiliser les comptes de
  production comme fixtures automatisées.
- Refaire les contrôles sur Pixel et iPhone physiques après gel du JavaScript,
  puis parcourir les écrans en clair/sombre, dans les langues cibles et avec
  les principaux états sur des données identiques.
- Valider sur development builds les intégrations natives : Apple/Google,
  APNs/FCM, rappels locaux, deep links, localisation, caméra/photos, vidéo,
  documents privés, partage, haptique et stockage sécurisé. RevenueCat et les
  achats StoreKit/Play Billing ne sont pas encore intégrés à la cible commune.
- Le build Expo 2.4 (42) est importé `VALID` et `APP_STORE_ELIGIBLE` côté Apple,
  sans soumission App Review ni activation implicite de testeurs. Aucune
  publication Google Play n’a eu lieu.
- Le backend de production contient désormais le catalogue canonique, sa file
  d'enrichissement privée, les alias Apple par storefront et la fonction Edge
  protégée par son authentification applicative. Aucun compte, secret Auth,
  abonnement fournisseur ou droit utilisateur n'a été modifié.
- La production fournit les liens exacts réellement résolus par Odesli ; elle
  ne fabrique jamais de destination Spotify ou YouTube Music. L'interface
  distingue donc les liens directs des recherches de secours, service par
  service.

## 1. Références et règles

Références produit actives :

- iOS et Android : client commun `mobile/`, Expo SDK 57, React Native 0.86,
  TypeScript strict. Les anciens clients ne sont consultables que dans
  l’historique de migration et Git.
- Backend partagé : projet Supabase cghmmpcwqzpjwgnbiuuw.
- Identité applicative : ch.dispo.app sur iOS et Android, schéma dispo.

Règles non négociables :

- aucune migration SQL, Edge Function, configuration Auth, secret, donnée,
  compte ou bucket de production n’est modifié pour construire le client ;
- aucune clé service_role ou clé secrète ne doit entrer dans mobile/ ;
- seuls l’URL Supabase et la clé publique/publishable peuvent être exposées via
  EXPO_PUBLIC_* ;
- les RLS et les RPC restent l’autorité : le client ne recrée jamais une
  autorisation localement ;
- is_premium vient du profil serveur et du webhook RevenueCat, jamais de
  user_metadata ni d’un booléen client ;
- les adresses exactes restent dans le schéma privé et passent uniquement par
  les RPC autorisés ;
- une réussite JavaScript ne prouve pas une réussite native ; une archive ne
  prouve pas une livraison ; une livraison ne vaut jamais soumission en review.

## 2. Légende des statuts

| Statut                              | Signification                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| FAIT — validé techniquement         | Le code est présent et les gates techniques listées dans ce document ont été observées vertes. |
| FAIT — validation métier en attente | Le socle compile ou se rend, mais le parcours fonctionnel complet n’a pas encore été prouvé.   |
| EN COURS                            | Une base utilisable existe, mais la parité fonctionnelle ou visuelle n’est pas atteinte.       |
| À FAIRE                             | Aucun parcours équivalent complet n’existe dans mobile/.                                       |
| BLOQUÉ                              | Une dépendance native, un accès administrateur ou une décision produit manque.                 |
| NE PAS PORTER                       | Élément abandonné, orphelin ou explicitement retiré de la cible.                               |

Les statuts sont un inventaire de code, pas une déclaration de qualité ou de
fonctionnement sur simulateur/appareil.

## 3. Décisions actées

### Architecture

- Expo SDK 57 avec Expo Router et Continuous Native Generation.
- Development builds obligatoires pour les validations réelles. Expo Go ne
  couvre pas RevenueCat, les capacités natives finales ni la chaîne de
  signature attendue.
- React Query gère le cache serveur ; les stores locaux ne doivent pas recopier
  les tables Supabase.
- Les repositories sélectionnent des colonnes explicites et paginent.
- Les abonnements Realtime sont filtrés par ressource et patchent le cache au
  lieu de recharger globalement l’application.
- Les futures listes agrégées ou très volumineuses devront utiliser des RPC à
  curseur stable plutôt qu’une pagination fragile par offset.
- Le code est organisé par feature : app pour les routes, features pour les
  cas d’usage, domain pour les invariants purs, services pour Supabase et les
  intégrations, components/ui pour les primitives.

### Produit

- Les cinq onglets restent Accueil, Sessions, SOS, Messages et Profil.
- L’identifiant persistant de Sessions reste agenda pour les anciens deep links
  et payloads, même si la route Expo visible s’appelle sessions.
- Les neuf langues de l’app iOS sont la cible : français, anglais, espagnol,
  allemand, italien, chinois simplifié, japonais, portugais et coréen.
- Les affiliations et badges d’école restent visibles.
- Les discussions d’école sont conservées : leur absence dans le premier port
  Expo constituait une régression certaine face au build SwiftUI 35. Elles
  apparaissent dans Messages avec unread, pagination, Realtime et contrôles de
  modération, aux côtés des groupes musicaux et conversations directes.
- Les relations principales sont Ami, Même école, joué avec et notes 1–5.
  L’ancien enum Appreciation reste un artefact de seed et ne doit pas guider
  le nouveau modèle.
- AMR est affiché comme badge immédiatement après Ami lorsqu’il est présent ;
  il ne faut pas confondre une entrée d’annuaire avec un partenariat officiel.
- Les services musicaux ne sont affichés comme destinations directes que
  lorsqu’une URL de morceau HTTPS sur l’hôte officiel est vérifiée. Un service
  manquant peut apparaître uniquement dans la zone secondaire, libellé sans
  ambiguïté « Rechercher sur … » ; aucun faux lien direct Tidal, Amazon Music
  ou autre ne doit être rendu.
- Premium reste contextuel et serveur-autoritaire.
- Le Paywall SwiftUI semble orphelin dans le shell actuel. Son point de
  présentation Expo doit être décidé avant de déclarer cette parité terminée.

### Première tranche de Phase 2

La tranche verticale choisie est :

1. restauration de session et connexion e-mail ;
2. Accueil paginé de profils ;
3. détail d’un profil et création/ouverture d’une conversation directe ;
4. feed SOS, détail, création et candidature ;
5. liste et fil de messages directs avec Realtime filtré.

Cette tranche existe structurellement dans mobile/. Son socle technique est
maintenant validé, mais la Phase 2 reste EN COURS tant que l’i18n réelle, les
parcours Supabase à deux comptes, les états de sécurité et les comparaisons
visuelles ne sont pas terminés.

## 4. Photographie historique de mobile/ au 30 août 2026

Cette section décrit le socle avant le portage fonctionnel massif du 31 août.
Elle est conservée pour retracer la migration et ne doit pas être utilisée
comme inventaire courant ; l’état faisant autorité est celui du début de ce
document.

### Fondation

| Élément                          | Statut                              | État observé                                                                                                                                           |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo SDK 57 / RN 0.86 / React 19 | FAIT — validé techniquement         | Versions épinglées ; npm validate et expo-doctor verts.                                                                                                |
| TypeScript strict                | FAIT — validé techniquement         | strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes et alias @/* ; typecheck vert.                                                            |
| Configuration Expo               | FAIT — validation métier en attente | Production ch.dispo.app/dispo et développement ch.dispo.app.dev/dispo-dev, portrait et plugins générés par CNG. ios/ et android/ restent régénérables. |
| CNG / development client         | FAIT — validation métier en attente | Expo prebuild, CocoaPods, builds Debug iOS/Android et build Release non signé pour simulateur iOS réussis ; Release Android/signature non faits.       |
| Fonts et assets Dispo            | FAIT — validé techniquement         | Fraunces, Spline Sans Mono, icône, logo et sept couvertures copiés ; écran de connexion rendu sur les deux plateformes.                                |
| Provider global                  | FAIT — validé techniquement         | Gesture Handler, thème, React Query et AuthProvider compilés ; lancement Android sans erreur JavaScript observée.                                      |
| Thème                            | EN COURS                            | Palettes clair/sombre présentes, mais seulement pilotées par le système et avec plusieurs écarts Swift listés plus bas.                                |
| i18n                             | EN COURS                            | Neuf catalogues JSON et export xcstrings présents ; les écrans actuels contiennent encore beaucoup de texte français en dur.                           |
| Supabase typé                    | FAIT — validé techniquement         | Client générique Database, validation Zod des variables publiques et snapshot de types couverts par typecheck/lint/tests.                              |
| Stockage de session              | EN COURS                            | AsyncStorage est branché. Un adaptateur sécurisé doit être évalué avant release pour les tokens.                                                       |
| États loading/empty/error        | EN COURS                            | Primitives communes présentes, mais fidélité Swift et états offline globaux incomplets.                                                                |
| Tests unitaires                  | FAIT — validé techniquement         | 4 suites Jest et 28 tests réussis via npm validate.                                                                                                    |

### Routes présentes

| Route Expo       | Statut                              | Portée actuelle                                                                                                  |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| /                | FAIT — validation métier en attente | Redirect vers l’auth rendu ; restauration avec une vraie session encore à exercer.                               |
| /(auth)/sign-in  | EN COURS                            | Structure Swift portée, login/signup et demande de reset présents ; parcours réels et callback restent à tester. |
| /(tabs)          | EN COURS                            | Cinq onglets créés, sans badges ni blur fidèle.                                                                  |
| /(tabs)/index    | EN COURS                            | Profils paginés, pull-to-refresh, empty/loading/error.                                                           |
| /profiles/[id]   | EN COURS                            | Détail résumé, écoles, note, disponibilité, contact.                                                             |
| /(tabs)/sos      | EN COURS                            | Feed SOS paginé et accès à la création.                                                                          |
| /gigs/[id]       | EN COURS                            | Détail public et candidature simple.                                                                             |
| /gigs/create     | EN COURS                            | Formulaire textuel minimal, pas encore la sélection native/parité métier complète.                               |
| /(tabs)/messages | EN COURS                            | Conversations directes paginées.                                                                                 |
| /messages/[id]   | EN COURS                            | Texte, pagination inversée, envoi et patch Realtime.                                                             |
| /(tabs)/profile  | EN COURS                            | Profil courant en lecture seule.                                                                                 |
| /(tabs)/sessions | À FAIRE                             | Placeholder explicite de Phase 3.                                                                                |

### Validations techniques acquises le 30 août 2026

- npm run validate : réussi, comprenant typecheck, lint sans warning et Jest
  4/4 suites, 28/28 tests après la correction de l’authentification ;
- npx expo-doctor : 21/21 contrôles réussis ;
- Expo prebuild puis installation des pods : réussis ;
- xcodebuild Debug puis Release avec bundle Hermes embarqué pour
  iphonesimulator : réussis ; le Release est non signé et ne constitue pas une
  archive distribuable ;
- Gradle assembleDebug : réussi après CNG, 395 tâches exécutées ;
- permission Android RECORD_AUDIO retirée du manifeste généré ;
- APK Debug installé et lancé sur l’AVD API 36 ; topResumedActivity et le PID
  ont confirmé ch.dispo.app.dev/.MainActivity au premier plan ;
- écrans de connexion iOS et Android recapturés en français, clair et sombre,
  après réalignement avec SwiftUI ; validation vide observée sur Android avec
  les deux erreurs attendues et aucune erreur ReactNativeJS/FATAL ;
- APK vérifié : signature Debug v2 valide et zéro permission RECORD_AUDIO ;
- stack Supabase local démarré sous Colima, suite SQL transactionnelle exécutée
  jusqu’au ROLLBACK, zéro fixture résiduelle et db lint local à zéro erreur ;
- le test local a révélé puis fait versionner
  20260831204619_fix_song_catalog_trigger_privileges.sql ; cette migration
  n’a pas été appliquée à la production ;
- scan des fichiers ajoutables sans secret détecté ; npm audit ne remonte aucun
  niveau high/critical, mais 12 avis modérés transitifs dans l’outillage Expo.

Portée de ces preuves : démarrage, rendu du shell et compilation Debug. Elles ne
valident pas encore connexion réelle, requêtes Supabase, mutations, Realtime,
notifications, achats, médias, confidentialité à deux comptes ou parité visuelle
des écrans Phase 2.

## 5. Matrice exhaustive SwiftUI vers React Native

Les chemins RN proposés deviennent les propriétaires des parcours. Un composant
partagé ne doit pas absorber la logique métier de plusieurs features.

| SwiftUI / fonctionnalité              | Cible Expo / RN                             | Statut                              | Parité ou travail restant                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DispoApp + RootView                   | src/app/_layout.tsx, src/app/index.tsx      | FAIT — validé techniquement         | Session, shell et politique globale de header présents ; build Release iOS et compilation Release Android réussis. Validation authentifiée sur appareils encore requise.                                                                                                                                                                                       |
| TabView 5 onglets                     | src/app/(tabs)/_layout.tsx                  | FAIT — validation métier en attente | `NativeTabs` système, ordre, badges et safe area présents ; la barre basse ne masque plus la fin des listes. Validation visuelle authentifiée iOS/Android encore requise.                                                                                                                                                                                      |
| AuthGateView / AuthForm               | src/app/(auth)/sign-in.tsx, features/auth   | EN COURS                            | Hiérarchie, copies, sélecteur, champs, CTA et mentions Swift portés ; login/signup et demande de reset e-mail présents. Callback de récupération, Apple, Google Android et parcours réels restent à prouver.                                                                                                                                                   |
| OnboardingView                        | src/app/(auth)/onboarding/*                 | FAIT — validation métier en attente | Quatre étapes, profil express, région et changement de compte présents et couverts par tests. Parcours Apple/Google réel restant.                                                                                                                                                                                                                              |
| HomeView                              | src/app/(tabs)/index.tsx                    | FAIT — validation métier en attente | Greeting/logo, réseau, notifications, recherche, groupes, trois scopes, filtres et feed sont portés. Le tri relation/niveau/urgence/distance, les cinq états de disponibilité et les voyages à la date du scope suivent le build SwiftUI 35 ; comparaison appareil encore requise.                                                                             |
| SearchView                            | src/app/search.tsx, features/discovery      | FAIT — validation métier en attente | Recherche profils et SOS avec nom/@pseudo, lieux/quartiers, disponibilités, traductions, alias d’instruments et familles de genres. Les badges Ami/Même école/AMR/relation commune sont présents ; validation multilingue sur appareil encore requise.                                                                                                         |
| FilterSheet                           | src/app/filters.tsx, features/discovery     | FAIT — validation métier en attente | Instruments et styles regroupés avec effacement par section, date, pays/code postal/ville séparés, rayon, niveaux, relations et Bien notés (≥ 4 avec ≥ 3 avis). Feuille iOS medium/large et modal Android ; validation visuelle encore requise.                                                                                                                |
| NotificationsCenterView               | src/app/notifications.tsx                   | FAIT — validation métier en attente | Feed paginé, lecture, Tout lire, navigation cible, états vides et Realtime présents.                                                                                                                                                                                                                                                                           |
| MusicianDetailView                    | src/app/profiles/[id].tsx                   | FAIT — validation métier en attente | Résumé, écoles, rating, contact, follow, SOS direct, groupes, portfolio, réseaux, joué-avec, followers, report et blocage présents.                                                                                                                                                                                                                            |
| PlayedWithSheet                       | src/app/profiles/[id]/played-with.tsx       | FAIT — validation métier en attente | Pagination exhaustive et navigation profil présentes.                                                                                                                                                                                                                                                                                                          |
| FollowersSheet                        | src/app/profiles/[id]/followers.tsx         | FAIT — validation métier en attente | Followers/following et relation mutuelle présents.                                                                                                                                                                                                                                                                                                             |
| VideoPlayerSheet                      | features/media/profile-video.tsx            | FAIT — validation métier en attente | Player plein écran bord à bord, lecture automatique, contrôles natifs, chargement, erreurs et fermeture superposée présents ; son/codec à prouver sur appareils.                                                                                                                                                                                               |
| EventsView                            | src/app/(tabs)/sos.tsx                      | FAIT — validation métier en attente | Segments SOS/Mes SOS, compatibilité, badge des candidatures en attente, triage hôte et demandes directes envoyées présents ; preuve à deux comptes requise.                                                                                                                                                                                                    |
| EventCard                             | features/gigs/gig-card.tsx                  | FAIT — validation métier en attente | Billet, perforation, code-barres, nouveau, candidatures à traiter et état des demandes directes présents ; comparaison physique restante.                                                                                                                                                                                                                      |
| CreateEventView                       | src/app/gigs/create.tsx                     | FAIT — validation métier en attente | Formulaire structuré, sélecteurs date/heure natifs, zone publique, adresse privée, niveaux, cachet et moyen de paiement libre présents.                                                                                                                                                                                                                        |
| SOSMatchView                          | src/app/gigs/matches.tsx                    | FAIT — validation métier en attente | Classement et profils compatibles présents ; les pages candidates sont chargées jusqu’au bout avant le filtrage final.                                                                                                                                                                                                                                         |
| SOSRequestSheet                       | src/app/gigs/request.tsx                    | FAIT — validation métier en attente | Instrument, dates du musicien, sélecteurs natifs, lieu, cachet, moyen de paiement libre et message présents.                                                                                                                                                                                                                                                   |
| EventDetailView                       | src/app/gigs/[id].tsx                       | FAIT — validation métier en attente | États candidature/direct, retrait après refus, décisions hôte, candidatures historiques sous Autre, adresse privée et line-up présents.                                                                                                                                                                                                                        |
| GigPrivateLocationCard                | features/locations/private-gig-location.tsx | FAIT — validation métier en attente | Adresse via RPC privé autorisé, carte iOS et itinéraire multiplateforme ; aucune adresse exacte dans le feed.                                                                                                                                                                                                                                                  |
| MyEventsView                          | src/app/(tabs)/sessions.tsx                 | FAIT — validation métier en attente | Futur/passé, synthèse, groupes, SOS et badges de réponse présents, pagination exhaustive et Realtime ajoutés.                                                                                                                                                                                                                                                  |
| AgendaRow / NextDateCard / AnswerCard | features/sessions/components/*              | FAIT — validation métier en attente | Cartes, regroupement et réponse oui/non présents.                                                                                                                                                                                                                                                                                                              |
| ChatListView                          | src/app/(tabs)/messages.tsx                 | FAIT — validation métier en attente | Direct, groupes musicaux, écoles, invitations, unread et pagination présents.                                                                                                                                                                                                                                                                                  |
| ChatView                              | src/app/messages/[id].tsx                   | FAIT — validation métier en attente | Texte, pagination, Realtime, delivered/read, typing, édition/suppression, réactions et reprise présents.                                                                                                                                                                                                                                                       |
| MessageAttachment*                    | features/messages/attachments/*             | EN COURS                            | Photo, vidéo, fichier, brouillon et upload privé présents. Les objets privés s’ouvrent via une URL signée courte dans le navigateur intégré ; cache local, vrai Quick Look et Save to Files natifs restent à porter.                                                                                                                                           |
| MessageControls                       | features/messages/message-actions.tsx       | FAIT — validation métier en attente | Jour, réactions, menu, édition, suppression et confirmations présents.                                                                                                                                                                                                                                                                                         |
| GroupChatView — Messages              | src/app/groups/[id]/index.tsx               | FAIT — validation métier en attente | Messages de groupe, unread, typing, réactions, pièces jointes, pagination et Realtime présents.                                                                                                                                                                                                                                                                |
| GroupChatView — Répertoire            | src/app/groups/[id]/songs.tsx               | FAIT — validation appareil requise  | Liste, recherche, ajout/suggestion, réordonnancement optimiste avec rollback, documents libres et droits leader/auteur présents ; comparaison visuelle authentifiée avec Swift encore requise.                                                                                                                                                                 |
| SongRow / drag                        | features/groups/group-song-row.tsx          | FAIT — validation appareil requise  | Ligne partagée de 68 pt, pochette 46 × 46, méta compacte, écoute et actions 44 pt. Le répertoire et les setlists validées utilisent un drag continu Reanimated/Gesture Handler avec auto-scroll, poignée dédiée, haptique à chaque changement de rang, commandes accessibles et rollback serveur testé ; le geste doit encore être prouvé sur iPhone et Pixel. |
| SongDetailSheet                       | src/app/groups/[id]/songs/[songId].tsx      | EN COURS                            | En-tête avec pochette, écoute, iReal direct ou recherche, partitions, solos et commentaires présents pour le répertoire comme pour les morceaux propres aux setlists ; onglets segmentés/drag des solos et validation visuelle Swift restent à terminer.                                                                                                       |
| AddSongSheet / EditSongSheet          | src/app/groups/[id]/songs/[songId].tsx      | EN COURS                            | Création/édition, tonalité, catalogue et validation présents dans la fiche ; enrichissement canonique serveur et parcours leader/membre restent à valider.                                                                                                                                                                                                     |
| CopySongSheet                         | features/groups/group-song-copy-screen.tsx  | FAIT — validation métier en attente | UI multi-destination, tri, libellé complet, déduplication, copie répertoire/setlist, suggestion membre, retours partiels et haptique présents et testés ; parcours à deux comptes encore requis.                                                                                                                                                               |
| ListenSheet                           | features/groups/group-song-row.tsx          | FAIT — validation métier en attente | Liens exacts production vérifiés pour 20/20 morceaux ; Apple 20, Deezer 20, Tidal 19, Amazon 19. Spotify/YouTube restent des recherches explicitement libellées en l'absence d'URL exacte.                                                                                                                                                                     |
| GroupChatView — Événements            | src/app/groups/[id]/events.tsx              | FAIT — validation métier en attente | Cartes, création, édition, annulation et réponses présentes.                                                                                                                                                                                                                                                                                                   |
| GroupEventSheet                       | src/app/groups/[id]/events/[eventId].tsx    | FAIT — validation métier en attente | Détail, présence, setlist, invités, SOS, lieu privé et ouverture des fiches de morceaux propres à l’événement présents.                                                                                                                                                                                                                                        |
| Add/EditGroupEventSheet               | features/groups/events/forms/*              | FAIT — validation métier en attente | Concert/répétition/jam, récurrence et atomicité du lieu privé présentes.                                                                                                                                                                                                                                                                                       |
| GroupMembersSheet                     | src/app/groups/[id]/members.tsx             | FAIT — validation métier en attente | Membres, rôles et profils présents.                                                                                                                                                                                                                                                                                                                            |
| InviteMemberSheet                     | src/app/groups/[id]/invite.tsx              | FAIT — validation métier en attente | Recherche, invitation, Premium et états présents.                                                                                                                                                                                                                                                                                                              |
| GroupSettingsSheet                    | src/app/groups/[id]/settings.tsx            | FAIT — validation métier en attente | Nom/photo, leadership, sortie et suppression présents.                                                                                                                                                                                                                                                                                                         |
| NewGroupSheet                         | src/app/groups/create.tsx                   | FAIT — validation métier en attente | Création et limite de groupes dirigés présentes.                                                                                                                                                                                                                                                                                                               |
| DocPreview / QuickLook                | repositories groupes/messages               | EN COURS — fallback                 | PDF/JPEG/PNG/TXT privés consultables via URL signée courte dans le navigateur intégré. Un module natif reste requis pour égaler Quick Look : fichier local, rendu MIME, partage/Save to Files et cache hors ligne.                                                                                                                                             |
| MusicSchoolDirectoryView              | src/app/schools/index.tsx                   | FAIT — validation métier en attente | Annuaire, recherche, détail et affiliations présents.                                                                                                                                                                                                                                                                                                          |
| MusicSchoolJoinSheet                  | src/app/schools/[id]/join.tsx               | FAIT — validation métier en attente | Rôle, instrument, statut et école principale présents.                                                                                                                                                                                                                                                                                                         |
| MusicSchoolCommunityView              | src/app/schools/[id]/community.tsx          | FAIT — validation métier en attente | Chat école rétabli avec pagination, Realtime, unread, édition/suppression, signalement et blocage.                                                                                                                                                                                                                                                             |
| MusicSchoolMembersSheet               | src/app/schools/[id]/members.tsx            | FAIT — validation métier en attente | Membres et navigation profil présents.                                                                                                                                                                                                                                                                                                                         |
| MyProfileView                         | src/app/(tabs)/profile.tsx                  | EN COURS                            | Lecture et accès séparés à l’édition, aux disponibilités, aux voyages et aux démos présents ; parcours authentifié et stats détaillées restent à valider.                                                                                                                                                                                                      |
| EditProfileSheet                      | src/app/profile/edit.tsx                    | EN COURS                            | Édition profil présente ; parcours authentifié et comparaison Swift restent à valider.                                                                                                                                                                                                                                                                         |
| VideoDetailsSheet                     | features/portfolio/portfolio-screen.tsx     | FAIT — validation appareil requise  | Ajout, limite 3 min/50 Mo sur le MP4 final, miniature, titre, date, lecture et suppression présents. Le module Expo local encode en H.264 720p ~2 Mbit/s sur iOS (AVAssetReader/Writer) et Android (Media3), conserve orientation/audio, annule et purge son cache ; fichiers caméra réels à exercer.                                                          |
| LanguageRegionSheet                   | src/app/settings/language-region.tsx        | FAIT — validation métier en attente | Choix persistant parmi neuf langues, pays/région, code postal et ville présent.                                                                                                                                                                                                                                                                                |
| AvailabilityPlaceSheet                | src/app/profile/travel.tsx                  | EN COURS                            | Voyage/lieu séparé des démos ; les dates de disponibilité vivent dans `/profile/availability`. Validation authentifiée et visuelle encore requise.                                                                                                                                                                                                             |
| SettingsSheet                         | src/app/settings/index.tsx                  | FAIT — validation métier en attente | Navigation réglages, thème, localisation, support et confidentialité présents.                                                                                                                                                                                                                                                                                 |
| AccountSheet                          | src/app/settings/account.tsx                | FAIT — validation métier en attente | E-mail, déconnexion, suppression, isolation et changement de compte présents ; reprise de session native ajoutée.                                                                                                                                                                                                                                              |
| NotificationsSettingsView             | src/app/settings/notifications.tsx          | FAIT — validation métier en attente | Catégories, permission système, token natif et badge présents ; APNs/FCM réels restent à exercer.                                                                                                                                                                                                                                                              |
| LinkAppleSheet                        | features/settings/settings-screen.tsx       | FAIT — validation appareil requise  | Liaison d’identité Apple avec nonce natif, bouton Réglages et entitlement Sign in with Apple présents ; compte signé réel à exercer.                                                                                                                                                                                                                           |
| PaywallView                           | src/app/premium.tsx                         | FAIT — parité bêta                  | Le build SwiftUI 35 active la bêta ouverte : écran Premium informatif et capacités débloquées sont reproduits. RevenueCat/StoreKit/Play Billing restent un chantier post-bêta, pas une régression de ce build de référence.                                                                                                                                    |
| WhatsNewSheet / PatchNotesView        | src/app/whats-new.tsx                       | FAIT — validation métier en attente | Présentation versionnée et historique présents, avec migration de préférence native.                                                                                                                                                                                                                                                                           |
| CityPickerSheet                       | aucune                                      | NE PAS PORTER                       | Vue Swift apparemment orpheline ; utiliser pays + postal + résolution de ville et correction manuelle.                                                                                                                                                                                                                                                         |

## 6. Contrat Supabase et performance

### Inventaire audité

Le schéma public expose 28 tables typées :

- identité/social : profiles, profile_locations, follows, collaborations,
  ratings, blocks et reports ;
- SOS : gig_requests et gig_applications ;
- direct : conversations, messages, message_reactions et
  message_file_cleanup ;
- groupes : music_groups, group_members, group_invitations, group_messages,
  group_message_reactions, group_events, event_attendance et group_docs ;
- écoles : music_schools, music_school_memberships, school_channels et
  school_messages ;
- contenu : song_comments ;
- push : push_devices et push_notifications.

La vue gig_requests_feed est security_invoker. Les tables publiques ont RLS
active. Les adresses exactes et l’état RevenueCat vivent dans des structures
privées : le client n’y accède jamais directement.

Storage :

- avatars et demo-videos sont publics ;
- group-docs et message-files sont privés et exigent un accès signé/autorisé.

Realtime :

- 18 tables sont publiées ;
- le client Swift s’abonne encore souvent sans filtre puis recharge de larges
  ensembles ;
- le nouveau client doit souscrire au minimum utile et patcher React Query ;
- le fil direct actuel montre le modèle attendu :
  conversation_id filtré, pagination de 40 et patch du message reçu.

Data API :

- max_rows vaut 1000 ;
- les anciens chargements globaux profiles/follows/collaborations/
  notifications/SOS ne doivent pas être copiés ;
- mobile utilise déjà des plages page-bound de 20 pour profils/SOS/
  conversations et des colonnes explicites ;
- les écrans complexes devront évoluer vers des RPC à curseur stable,
  particulièrement notifications, sessions, groupes et recherches combinées.

Le lot répertoire déploie en production un modèle non destructif :

- `song_catalog` conserve identité canonique, ISRC, compositeur, genres,
  identifiants fournisseurs et métadonnées ; les snapshots JSONB historiques
  restent opérationnels pendant la transition. Le backfill conserve un artiste
  réellement absent sous forme vide, accepte les UUID canoniques récents et
  ignore sans erreur les nombres hérités hors limites. Il n'expose dans ce
  catalogue global que les snapshots munis d'un ISRC de forme valide ou d'un
  identifiant Apple numérique ; les morceaux manuels restent dans le JSONB
  privé du groupe ;
- `song_platform_links` cache les liens exacts par service et marché pour les
  six plateformes. Un trigger exige HTTPS, l’hôte officiel exact, sans
  identifiants ni port ; le backfill applique le même filtre ;
- `search_song_catalog` fournit une recherche accent-insensible bornée à
  160 caractères, paginée seulement avec la paire curseur/titre complète et
  lisible par les utilisateurs authentifiés ; les écritures restent réservées
  au `service_role` ;
- le repository interroge ce RPC canonique et Apple en parallèle, déduplique par
  ISRC, identifiant Apple ou couple artiste/titre et laisse gagner les données
  canoniques. L’absence temporaire du RPC reste tolérée et déclenche le repli
  Apple sans rendre la recherche indisponible ;
- une file privée bornée enrichit les morceaux via une Edge Function avec
  authentification applicative, quota SQL, backoff et cache négatif. Odesli est
  le résolveur public primaire ; Musicfetch est optionnel côté serveur. Les IDs
  Apple variant selon le storefront sont rattachés au morceau canonique sans
  dupliquer les cartes ; aucune clé fournisseur n’est présente dans le client ;
- aucun catalogue public iReal Pro n’est interrogé : l’app ouvre un lien iReal
  valide ou la recherche locale officielle `irealb://search?...`.

### Règles de sécurité client

- ne jamais décider d’une autorisation avec user_metadata ;
- ne jamais écrire is_premium depuis le client ;
- ne jamais interroger le schéma privé ni construire une adresse exacte à
  partir de colonnes publiques ;
- respecter les RLS même si un écran cache déjà une action ;
- utiliser les RPC existantes pour les opérations atomiques et autorisées ;
- une suppression de compte devra également respecter la révocation de session ;
- régénérer database.types.ts après toute migration approuvée, jamais avant ;
- auditer le stockage de session AsyncStorage avant release ;
- tester les parcours à deux comptes : propriétaire/non-propriétaire,
  leader/membre, candidat/hôte, bloqué/non-bloqué.

### Absence de mutation production

La construction de mobile/ et ce document n’ont exécuté :

- aucun supabase db push ;
- aucune migration, requête DDL/DML ou réparation d’historique ;
- aucun déploiement d’Edge Function ;
- aucune modification de secrets, Auth, RLS, Realtime, cron ou Vault ;
- aucun upload Storage ;
- aucune création/suppression de compte ou donnée de production.

Les repositories contiennent des mutations normales d’application
— connexion, création SOS, candidature et message — mais elles ne doivent pas
être exercées sur la production pendant les tests automatisés de migration.

## 7. Design system et écarts visuels

### Direction de marque au 1er septembre 2026

Le bleu jazz est l’accent propriétaire de Dispo : cyan électrique pour les
actions primaires et états actifs, bleu profond pour les surfaces élevées et
bleu nuit pour l’atmosphère. Il ne doit pas devenir un halo uniforme : les
fonds, bordures, contrastes et niveaux de cartes donnent la hiérarchie avant la
couleur. Fraunces porte la voix éditoriale des titres ; la typographie système
reste prioritaire pour les contrôles, champs et contenus denses.

La règle n’est pas de rendre chaque élément techniquement natif. Les
composants système sont privilégiés pour la navigation, les onglets, le clavier,
les sélecteurs, les feuilles, les permissions et l’accessibilité. Les cartes de
musiciens, morceaux, groupes, disponibilités et SOS peuvent rester propres à
Dispo si elles préservent les gestes attendus, une cible tactile minimale de
44 points, le redimensionnement du texte et un comportement équivalent sur iOS
et Android.

### Tokens Swift à conserver

| Token                        | Clair   | Sombre  |
| ---------------------------- | ------- | ------- |
| background                   | #F0F4FF | #050814 |
| card                         | #FFFFFF | #0A1128 |
| inset                        | #E2E8F0 | #0E1835 |
| accent/electric/confirmation | #0099FF | #00D2FF |
| signal/error                 | #B8401A | #EE6A3C |
| bronze                       | #475569 | #8E9AAF |
| concert                      | #0573D1 | #2EB8FF |
| répétition                   | #614FB8 | #A391F5 |
| jam                          | #05856E | #38C7A6 |

Dégradés Swift :

- hero/complet : #00D2FF vers #0099FF ;
- série : #CBD5E1 vers #8E9AAF ;
- alerte : environ #EF9D7B vers #E0734F ;
- premium : #00D2FF vers #0099FF vers #050814.

Typographies :

- Fraunces Display SemiBold et Italic pour titres et marque ;
- Spline Sans Mono Medium/SemiBold pour dates, cachets et labels ;
- corps SF sur iOS ; Android nécessite un substitut système explicite et une
  tolérance approuvée.

Géométrie de référence :

- gouttière dominante 18 ;
- carte : padding 16, rayon continu 22, bord 1, ombre claire rayon 16 y=10,
  aucune ombre sombre ;
- billet : rayon 18, encoches rayon 7 à 74 points du bord, perforation
  1,5 avec motif 4/5 ;
- puces : padding horizontal 9–12, vertical 5 et forme capsule ;
- cible tactile minimale : 44 points.

### Écarts constatés le 30 août 2026 (historique)

| Élément         | Écart observé                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing         | Échelle simplifiée 4/8/12/16/20/24/32 ; Swift emploie aussi 2/3/5/6/9/10/11/14/18.                                                                                                                                         |
| Fond            | Deux gradients rectangulaires remplacent les cercles floutés et la vignette radiale Swift.                                                                                                                                 |
| Carte SOS       | Rectangle avec bande date ; pas encore TicketShape, encoches, perforation ni code-barres.                                                                                                                                  |
| Avatar fallback | Fond inset et initiales 31 % ; Swift utilise quatre dégradés déterministes et 38 %.                                                                                                                                        |
| Tag             | H8/V4, rayon 10 ; Swift H10/V5 et capsule.                                                                                                                                                                                 |
| ScreenHeader    | Icône à droite et titre 30 par défaut ; Swift icône 44 à gauche, gap 14, titre Fraunces 27.                                                                                                                                |
| Pression        | Opacité 0,85 sans spring/reduce-motion ; Swift 0,94, scale 0,97, spring 0,3/0,72.                                                                                                                                          |
| Tab bar         | Surface opaque ; blur ultraThinMaterial et badges absents.                                                                                                                                                                 |
| Thème           | Suit uniquement le système ; Swift mémorise system/light/dark et démarre en sombre.                                                                                                                                        |
| Icônes          | Ionicons remplace SF Symbols ; établir une table d’équivalence et des assets lorsque la silhouette diffère.                                                                                                                |
| AuthGate        | La structure, la copie, la typographie de marque, le sélecteur, les champs, le CTA et les mentions sont réalignés et recapturés. Le bouton Apple reste volontairement absent tant que le vrai flux natif n’est pas validé. |
| i18n            | L’authentification lit désormais les catalogues ; d’autres textes visibles restent codés en français et les formatters sont figés fr-CH.                                                                                   |
| Android         | overflow hidden sur Card peut couper les ombres ; elevation et rendu des coins diffèrent d’iOS.                                                                                                                            |

### Comparaison AuthGate du 30 août 2026

La référence Swift propre montre un logo horizontal compact (`markSize: 44`,
mot-symbole `dispo` en Fraunces italique), l’accroche produit puis le formulaire
e-mail. La capture Expo Release antérieure montrait au contraire un logo
vertical de 84 points, la copie « Les bons musiciens… », un titre interne
« Content de te revoir » et deux boutons séparés. `sign-in.tsx` reprend
désormais la structure Swift : titre/sous-titre, séparateur, sélecteur
connexion/création dans la carte, placeholders, CTA, mot de passe oublié et
texte légal, avec largeur plafonnée et ScrollView pour Android.

Écarts explicitement conservés : aucun bouton Apple n’est affiché tant que le
flux natif n’est pas câblé et testé ; l’envoi de l’e-mail de récupération est
présent, mais la consommation de `dispo://login-callback` et la saisie du
nouveau mot de passe ne le sont pas encore. Les captures post-correction
Release iOS et development build Android, en français et dans les deux thèmes,
confirment la même hiérarchie et le même rythme général. Elles ne constituent
pas une parité pixel ni une validation du flux Apple manquant.

La parité signifie même hiérarchie, contenu, rythme, couleur, action et état.
Elle ne signifie pas forcer Android à rasteriser exactement SF Symbols ou le
moteur typographique iOS.

## 8. Intégrations natives

| Intégration iOS actuelle       | Cible Expo / Android                            | Statut / règle                                                                                                                                               |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NavigationStack / sheets       | Expo Router Stack, Tabs et routes modales       | EN COURS ; conserver deep links, restauration et historique.                                                                                                 |
| ultraThinMaterial              | expo-blur avec fallback opaque                  | À FAIRE ; comparer performances Android.                                                                                                                     |
| Sign in with Apple             | expo-apple-authentication                       | EN COURS ; bouton natif, capability et entitlement production présents ; connexion réelle à prouver sur le build signé.                                      |
| Google Android                 | expo-auth-session ou fournisseur natif approuvé | BLOQUÉ : absent des apps natives, nécessite provider Supabase, OAuth, SHA et stratégie de liaison de compte.                                                 |
| Reset / dispo://login-callback | Supabase Auth + Expo Linking / Router           | FAIT — validation métier en attente ; envoi, callback et mise à jour sont présents, à exercer avec un vrai e-mail.                                           |
| RevenueCat / StoreKit          | react-native-purchases + Play Billing           | BLOQUÉ : dépendance et configuration stores absentes ; webhook reste autoritaire.                                                                            |
| APNs                           | expo-notifications avec token natif             | EN COURS ; enregistrement natif, préférences, deep links et entitlement production présents ; réception réelle à prouver.                                    |
| FCM Android                    | expo-notifications avec token natif             | EN COURS ; enregistrement natif et Firebase présents ; réception Release réelle à prouver.                                                                   |
| Notifications locales          | expo-notifications                              | EN COURS ; rappels de présence, badge et catégories présents ; preuve appareil requise.                                                                      |
| CoreLocation                   | expo-location                                   | EN COURS ; foreground, précision/arrondi, synchronisation et retrait présents ; preuve appareil requise.                                                     |
| MapKit adresse privée          | expo-maps / itinéraire système                  | EN COURS ; carte iOS, carte Android conditionnelle et RPC privé présents ; confidentialité à deux comptes à prouver.                                         |
| PhotosPicker                   | expo-image-picker                               | Parcours photo/vidéo présent ; permissions et média réel à prouver.                                                                                          |
| AVAssetReader/Writer           | module Expo local `dispo-video-transcoder`      | FAIT — builds natifs validés ; H.264 720p ~2 Mbit/s, orientation/audio, annulation et purge cache présents sur iOS/Android ; preuve caméra appareil requise. |
| AVPlayer                       | expo-video                                      | Dépendance présente, UI et erreurs à faire.                                                                                                                  |
| DocumentPicker                 | expo-document-picker                            | Upload privé, validation taille/type, téléchargement et aperçu présents ; preuve appareil à faire.                                                           |
| QuickLook                      | ouverture système + partage fallback            | EN COURS ; ouverture native/fallback présents, rendu de chaque type à prouver.                                                                               |
| Analyse de tonalité audio      | module Expo natif iOS/Android                   | FAIT — validation métier en attente ; AVFoundation/Accelerate iOS et MediaCodec Android estiment tonalité et BPM localement.                                 |
| iReal Pro schemes/HTML         | Expo Linking + queries Android/iOS              | EN COURS ; CNG ajoute `irealb`/`irealbook`, lien direct valide sinon recherche locale, puis store si l’app manque. Test development build requis.            |
| UIKit haptics                  | expo-haptics                                    | Dépendance présente, politique sémantique à reproduire.                                                                                                      |
| URLSession/NSCache avatars     | expo-image + politique de cache                 | EN COURS ; retry borné, coalescence et invalidation après upload à prouver.                                                                                  |
| UserDefaults                   | stockage local versionné + pont legacy          | FAIT — validation métier en attente ; thème, langue, nouveautés, rappels et dates de lecture sont migrés sans supprimer les anciennes valeurs.               |
| Keychain/session               | SecureStore + pont legacy natif                 | FAIT — validation métier en attente ; reprise Swift Keychain et Supabase-KT validée unitairement, preuve finale via mise à jour signée requise.              |

L’application Android Kotlin couvre déjà une grande partie du produit et
possède neuf catalogues de traduction, mais n’offre ni Google OAuth ni
RevenueCat/Play Billing. Elle reste la seconde référence visuelle et
fonctionnelle ; elle ne doit pas être supprimée avant la Phase 4.

## 9. Outillage et commandes

### État audité du Mac

- Node 24.4.1 : présent.
- npm 11.4.2 : présent.
- Xcode 26.6 : présent.
- CocoaPods 1.17 : installé et utilisé avec succès.
- JDK 17 : installé et utilisé avec succès par Gradle.
- JAVA_HOME : configuré pour la validation ; à réexporter dans toute nouvelle
  session qui ne le persiste pas.
- ANDROID_HOME et PATH Android : configurés pour la validation ; à réexporter
  dans toute nouvelle session qui ne les persiste pas.
- Android SDK API 36 et émulateur : présents.
- AVD de référence : medium_phone.

### Vérification ou reproduction de la toolchain

Les installations suivantes ont déjà été effectuées sur le Mac audité. Ces
commandes ne servent que pour une nouvelle machine ou une réinstallation :

```bash
brew install cocoapods
brew install openjdk@17
```

Vérifier CocoaPods et préparer une nouvelle session Android :

```bash
pod --version
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/Users/ludovicmarie/Library/Android/sdk
export PATH="${ANDROID_HOME}/emulator:${ANDROID_HOME}/platform-tools:${PATH}"
java -version
adb version
```

### Installation JavaScript

Depuis Dispo/mobile :

```bash
npm ci
cp .env.example .env.local
```

Le fichier .env.local contient uniquement :

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Ne jamais y mettre service_role, APNs, RevenueCat secret, clé privée ou
credential de store.

### Validations JavaScript exécutées le 30 août 2026 (historique)

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run validate
npx expo-doctor
npx expo config --type public
```

Résultat acquis : npm run validate est vert — typecheck, lint, 4 suites Jest et
28 tests — et expo-doctor est vert à 21/21. expo config reste une commande utile
de revue de configuration publique, pas une preuve de comportement métier.

### Development builds CNG

Le premier cycle CNG a été exécuté avec succès :

```bash
npm run prebuild
npx pod-install ios
npx expo start --dev-client --clear
```

Build local iOS reproduisible après génération native :

```bash
npx expo run:ios
```

Build/lancement local Android reproduisible après export de l’environnement :

```bash
emulator -avd medium_phone
npx expo run:android
adb shell am start -n ch.dispo.app.dev/.MainActivity
```

Résultats acquis : build Debug iphonesimulator réussi ; assembleDebug Android
réussi avec 395 tâches ; APK installé/lancé sur API 36 avec activité et PID
confirmés. Les scripts build:ios:local et build:android:local utilisent
--no-install et supposent toujours prebuild, pods et dépendances déjà prêts.

La configuration EAS, eas.json, les profils de signature et les commandes de
distribution ne font pas encore partie du socle prouvé. Ne pas documenter un
eas build ou un upload comme réussi avant sa sortie explicite.

### Types Supabase

Après une migration approuvée et réellement appliquée, jamais pendant ce port
en lecture seule :

```bash
npx supabase gen types typescript --project-id cghmmpcwqzpjwgnbiuuw
```

La sortie remplace database.types.ts uniquement après revue du diff. Aucun type
généré ne justifie à lui seul une modification de production.

## 10. Stratégie de captures comparatives

### Matrice minimale

Capturer chaque surface :

- iOS SwiftUI build 35 ;
- Expo iOS sur le même format logique ;
- Expo Android sur medium_phone API 36 ;
- mode clair et sombre ;
- français et anglais pour toutes les surfaces majeures ;
- contrôle des neuf langues pour débordements, glyphes et sens de lecture ;
- texte système normal et agrandi ;
- Reduce Motion activé ;
- données remplies, vide, chargement, erreur et offline ;
- gratuit/Premium ;
- propriétaire/non-propriétaire, leader/membre et adresse privée
  autorisée/non autorisée.

### Routes de référence

Réutiliser les routes Debug iOS existantes :

- home, sessions/agenda, SOS, messages et profil ;
- chat, musicien, recherche, matching ;
- réglages, filtres, morceaux, détail morceau ;
- répertoire de groupe et détail événement.

Créer en Expo des routes ou fixtures de capture uniquement en développement,
avec testID stables. Elles ne doivent jamais être exposées dans un build
Release ni lire/écrire la production.

Baseline observée : la comparaison du 30 août entre la référence SwiftUI et la
première capture Expo a servi à réaligner AuthGate. Les quatre captures finales
locales sous `captures/auth/` montrent iOS et Android en français, clair et
sombre. `scripts/capture-auth-shell.sh` reproduit cette matrice en attendant le
runtime React Native avant chaque PNG ; les images restent volontairement hors
Git. Aucune parité pixel n’est revendiquée et l’absence du vrai bouton Apple
demeure un écart explicite.

### Procédure

1. fixer appareil, viewport, locale, thème, taille de texte et données ;
2. attendre fonts, images et animations ;
3. capturer iOS Swift, Expo iOS et Expo Android ;
4. superposer à 50 % pour contrôler alignements, tailles, rythme et safe areas ;
5. utiliser un diff pixel pour les zones déterministes ;
6. exclure explicitement heure, statut réseau, rendu natif de police et contenu
   dynamique ;
7. créer une fiche d’écart avec composant propriétaire et priorité ;
8. refaire les trois captures après correction.

Convention suggérée :

```text
captures/{surface}/{platform}-{theme}-{locale}-{state}.png
```

Les seuils de diff ne doivent être fixés qu’après une première baseline
validée : Android et iOS n’ont pas le même rasterizer de texte ni les mêmes
symboles.

## 11. Plan de phases initial — photographie du 30 août 2026

### Phase 1 — Fondation et contrat

Objectifs :

- figer décisions produit et architecture ;
- copier fonts/assets ;
- installer Expo Router, TypeScript strict, thème et i18n neuf langues ;
- créer client Supabase typé, providers et primitives UI ;
- documenter backend, RLS, Storage, Realtime et outillage ;
- créer le harnais de captures.

État : FAIT — validé techniquement pour le socle demandé. npm validate,
expo-doctor, CNG, pods, builds natifs, lancements iOS/Android, harnais de capture,
captures AuthGate clair/sombre et décision de gouvernance sont acquis. La
matrice visuelle de toutes les routes reste un gate de parité ultérieur, pas un
prétexte pour déclarer la Phase 2 terminée.

Gate :

- [x] typecheck, lint, Jest 4/4 suites et 28/28 tests ;
- [x] expo-doctor 21/21 ;
- [x] prebuild, pods, build Debug iphonesimulator et assembleDebug ;
- [x] APK installé/lancé sur API 36, activité/PID et écran de connexion observés ;
- [x] aucune mutation production pendant ces validations ;
- [x] captures shell propres clair/sombre sur iOS et Android ;
- [x] décision officielle Expo inscrite dans AGENTS.md.

### Phase 2 — Parcours cœur

Objectifs :

- auth/session ;
- Accueil paginé ;
- profil public/personnel minimal ;
- SOS feed/détail/création/candidature ;
- messages directs paginés et Realtime filtré ;
- états loading/empty/error cohérents.

État : première tranche structurellement implémentée et socle compilé/lancé,
mais EN COURS. Le succès des builds ne prouve pas les parcours métier ni la
parité avec SwiftUI/Kotlin.

Reste critique :

- onboarding, Apple/Google, consommation du callback reset/magic link ;
- i18n effective ;
- follow/blocage/signalement ;
- filtres/recherche/notifications ;
- read/delivered/typing/réactions/attachments ;
- sécurité et confidentialité des mutations ;
- captures comparatives et tests sur développement natif.

Gate :

- deux comptes de test dédiés, jamais des comptes de production ;
- pagination sans dépasser max_rows ;
- abonnement message filtré sans doublon ;
- aucune fuite de profil/adresse après blocage ou déconnexion ;
- screenshots approuvés des cinq routes Phase 2.

### Phase 3 — Profondeur fonctionnelle et natif

Objectifs :

- Sessions ;
- groupes, invitations, membres et réglages ;
- répertoire, morceaux, setlists, iReal, partitions, solos/commentaires ;
- événements de groupe, présence, récurrence et Auto-SOS ;
- affiliations école sans discussions ;
- notifications APNs/FCM natives ;
- médias et documents privés ;
- localisation et adresses privées ;
- RevenueCat/StoreKit/Play Billing ;
- Apple et Google.

Gate :

- RPC et RLS vérifiées à deux comptes ;
- stockage privé testé avec URL expirée/non autorisée ;
- token APNs et FCM enregistrés dans push_devices ;
- achat sandbox puis webhook puis is_premium serveur ;
- aucune capacité Premium simulée côté client ;
- build iOS et Android local réellement lancé.

### Phase 4 — Parité, durcissement et livraison

Objectifs :

- fermer tous les écarts visuels ;
- accessibilité, Reduce Motion, Dynamic Type et lecteurs d’écran ;
- performance listes/images/Realtime ;
- offline, reprise, rotation de token et nettoyage de cache ;
- tests end-to-end des parcours critiques ;
- configuration Release, signature, privacy manifests et stores ;
- stratégie de remplacement des apps natives.

Gate :

- matrice de captures approuvée ;
- tests, builds, lancement et smoke tests réels sur les deux plateformes ;
- entitlements/extracted artifacts vérifiés ;
- backend et production inchangés sauf changements explicitement approuvés ;
- [historique supersédé] Android Kotlin et iOS SwiftUI devaient être conservés
  jusqu’à la décision de bascule, désormais prise le 1er septembre 2026 ;
- aucune App Review ou publication implicite.

## 12. Risques prioritaires

| Priorité | Risque                                            | Réponse                                                                                                             |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0       | Fuite d’adresse exacte                            | Accès uniquement par RPC privé et tests propriétaire/participant/intrus.                                            |
| P0       | Contournement Premium                             | Lire is_premium serveur ; webhook seul auteur ; ignorer user_metadata.                                              |
| P0       | Requêtes globales reproduites du Swift            | Pagination, colonnes explicites, Realtime filtré et RPC curseur.                                                    |
| P0       | Session de plusieurs comptes mélangée             | Purge ciblée du cache Query/session lors de logout et tests d’isolation.                                            |
| P1       | Socle natif vert mais parcours métier non prouvés | Exécuter Phase 2 à deux comptes, avec backend de test et captures comparatives.                                     |
| P1       | Variables Java/Android non forcément persistées   | Réexporter JAVA_HOME, ANDROID_HOME et PATH dans toute nouvelle session ; CocoaPods 1.17 et JDK 17 sont installés.   |
| P1       | Expo Go utilisé comme preuve                      | Utiliser development builds CNG.                                                                                    |
| P1       | AsyncStorage pour session                         | Évaluer/adopter un stockage sécurisé avant release.                                                                 |
| P1       | Monétisation post-bêta non intégrée               | Avant de fermer la bêta ouverte, intégrer StoreKit/Play Billing ou RevenueCat puis valider sandbox + webhook.       |
| P1       | QuickLook et médias réels non prouvés             | Finaliser aperçu/partage système et valider le transcodage natif sur vidéos caméra iOS/Android.                     |
| P1       | i18n seulement exportée                           | Remplacer toutes les chaînes/formatters en dur et tester neuf locales.                                              |
| P1       | Rendu Android divergent                           | Golden tests, table d’icônes, fallback blur/shadow et tolérance approuvée.                                          |
| P1       | Enrichissement fournisseur incomplet ou trompeur  | N'afficher comme directs que les hôtes exacts vérifiés ; conserver les autres services comme recherches explicites. |
| P2       | Avis npm modérés dans l’outillage Expo            | Attendre une résolution compatible SDK 57 ; ne pas utiliser npm audit fix --force qui rétrograde Expo.              |
| P2       | Assets de scaffold Expo conservés localement      | Ils ne sont pas référencés et sont exclus de Git ; ne versionner que l’identité Dispo.                              |
| P2       | Vingt pfp legacy iOS probablement morts           | Ne pas les recopier sans preuve d’usage.                                                                            |

## 13. Discipline de mise à jour

Après chaque lot :

1. mettre à jour les statuts de ce document ;
2. distinguer code présent, test exécuté, build exécuté et livraison ;
3. consigner les commandes et sorties réellement observées ;
4. mettre à jour AGENTS.md en append-only ;
5. ne jamais masquer un blocage d’outillage ou d’accès administrateur ;
6. conserver le backend Supabase unique et vérifier les deux plateformes à
   partir de `mobile/` ; les anciens clients ne font plus partie du workspace.

## 14. Lot retours utilisateurs du 3 septembre 2026

État : les cinq corrections sont implémentées et validées sur le client Expo.
Après autorisation explicite, la migration
`20260903084546_profile_availability_time_slots.sql` a été appliquée au projet
production existant `cghmmpcwqzpjwgnbiuuw` et son schéma contrôlé. Le build est
passé à 2.4 (43) sur iOS et Android ; la livraison TestFlight est l'étape de
distribution suivante.

Corrections ciblées :

- date/heure SOS : les champs natifs reçoivent les couleurs de texte, d'accent
  et de thème explicites, y compris leur état désactivé ;
- disponibilités : `profiles.availability_time_slots` ajoute un objet JSONB
  rétrocompatible `{ "YYYY-MM-DD": [{ "start": "HH:mm", "end": "HH:mm" }] }`.
  Plusieurs tranches facultatives peuvent être ajoutées, modifiées et retirées
  par date ; la sauvegarde des dates et horaires est atomique. Un trigger
  valide les dates, le format local `HH:mm`, l'ordre début/fin et interdit les
  tranches rattachées à une date absente de `available_dates` ;
- recherche : le filtre « École de musique » réutilise le répertoire paginé
  des écoles actives, stocke leurs UUID, applique un OU entre les affiliations
  visibles et compte la sélection comme une catégorie ;
- Mes SOS : une requête propriétaire exhaustive et dédiée remplace la
  dérivation depuis la première page du fil public. Les invalidations création,
  suppression, candidatures, changements d'état et Realtime couvrent désormais
  cette requête ; le fil public continue d'exclure les propres annonces ;
- vidéos : aperçu ouvrable, lecteur, titre/date éditables et actions tactiles
  explicites lire/modifier/supprimer ; les limites 1 gratuite/6 Premium et le
  rollback de la ligne lorsque la suppression Storage échoue sont conservés.
  Les URL HTTPS restent obligatoires hors développement local.

Preuves exécutées sur l'état final :

- `npm run format:check` réussi ; `npm run validate` réussi avec 52 suites et
  322 tests, sans suppression des 49 suites/311 tests préexistants ;
- Expo Doctor 20/21, strictement le même contrôle connu : 14 révisions patch
  Expo disponibles, dépendances volontairement inchangées ;
- prébuild CNG production propre, bundle/package généré `ch.dispo.app`, sans
  autorisation cleartext Android temporaire ;
- build iOS Release pour simulateur réussi avec `BUILD SUCCEEDED` ; build
  Android Release et tests unitaires Gradle réussis avec `BUILD SUCCESSFUL` ;
- APK direct `Dispo-dist/android/Dispo-2.4-build43-direct-test.apk`, package
  `ch.dispo.app`, version 2.4, versionCode 43, signature v2 valide avec le
  certificat Android Debug de test, SHA-256
  `e79509098dd062852b97da9367cd8a703df57074953f1ccad77c97f7f7fb68b1` ;
  l'APK a été installé puis lancé à froid sur Android API 36 ;
- validation visuelle réelle avec development builds : champs date/heure clair
  et sombre, plusieurs tranches, deux écoles sélectionnées avec logique OU,
  SOS propriétaire au-delà de la première page et vidéo ajoutée/lue/modifiée
  sur iPhone 17 Pro Simulator et Android API 36 ; toutes les fixtures locales
  ont ensuite été supprimées ; aucun appareil physique n'a été validé ;
- migration testée localement : sauvegarde/relecture de deux tranches, refus
  RLS d'une mise à jour tierce, refus d'une tranche inversée ou orpheline ;
  `supabase db lint --local --level error` retourne zéro résultat. La liste des
  migrations confirme `20260903084546` alignée localement et à distance. En
  production, la colonne JSONB non nullable, son défaut `{}`, le trigger, la
  fonction `SECURITY INVOKER` privée et RLS active ont été relus ; l'advisor
  performance ne remonte aucun problème.

Porte de schéma levée : committer/pousser le lot sur `origin/main`, puis
archiver, vérifier, uploader et attendre le verdict d'import TestFlight du build 43. L'advisor sécurité CLI a été interrompu après 90 secondes sans sortie ; les
contrôles directs de la fonction, de ses ACL et de RLS sont concluants.
