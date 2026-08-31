# Migration de Dispo vers Expo / React Native

Dernière mise à jour documentaire : 31 août 2026.

Ce fichier est le contrat de migration de l’application iOS SwiftUI et de
l’application Android Kotlin vers une application Expo commune. Il décrit ce
qui existe dans mobile/, ce qui reste à porter et les preuves attendues.

La section suivante est la source de vérité au 31 août 2026. Les matrices plus
bas conservent la photographie détaillée du socle du 30 août et la cible finale ;
en cas d’écart de statut, l’état du 31 août prévaut. Aucune présence de code
n’est assimilée à une validation métier, visuelle ou sur appareil.

## État faisant autorité — 31 août 2026

### Surfaces désormais présentes dans le client Expo

- Authentification et compte : restauration de session, connexion/création,
  reset et retour de lien, onboarding, stockage SecureStore, réglages, thème,
  langues, préférences de notifications, nouveautés et écran Premium de la
  bêta. Les parcours Apple/Google existent dans le code mais restent à prouver
  avec leur configuration native réelle.
- Découverte et profils : Accueil, recherche et filtres, centre de
  notifications, profil public et personnel, édition, relations sociales,
  notes, abonnements, blocage/signalement, followers, joué-avec, portfolio
  photo/vidéo, disponibilités, localisation postale et affiliations/annuaire
  des écoles.
- SOS et Sessions : feed, détail, création structurée, candidature/retrait,
  décisions hôte, matching, demande directe, états d’adresse privée et agenda
  futur/passé avec réponses de présence. Le détail d’un événement propose une
  carte intégrée sur iOS, une ouverture d’itinéraire sur les deux plateformes
  et une carte Android lorsque la clé Google Maps restreinte est fournie.
- Messages : conversations directes et de groupe paginées, Realtime filtré,
  unread, typing éphémère, réactions, édition/suppression et pièces jointes
  photo, vidéo ou fichier.
- Groupes : liste, création, invitations, membres, réglages, répertoire,
  détails/copie de morceau, documents, événements nouveaux/édités/récurrents,
  présence, invités acceptés, rôles manquants, SOS liés et préremplis,
  candidats disponibles le jour même, adresse privée, rappels locaux et
  setlist avec suggestion, validation et réorganisation.
- Internationalisation : neuf catalogues sont branchés et leur cohérence est
  testée. La présence d’une traduction ne prouve pas encore son rendu sans
  débordement sur chaque écran et chaque plateforme.

Ces surfaces sont implémentées structurellement et couvertes par des tests
ciblés ; elles ne sont pas déclarées « pixel perfect » ni validées de bout en
bout avec des comptes authentifiés.

### Validations réellement observées

- `npm run format:check` : réussi sur l’état courant.
- `npm run validate` : réussi d’un seul tenant le 31 août, avec TypeScript,
  ESLint sans avertissement et 28 suites / 172 tests Jest réussis.
- `npx expo-doctor` : 21/21 contrôles réussis le 31 août.
- Les contrôles ciblés du détail d’événement de groupe ont aussi passé
  Prettier, ESLint, `git diff --check` et 7 suites Jest (54 tests).
- La suite SQL transactionnelle locale v35-v43 a été exécutée jusqu’au
  `ROLLBACK`, puis `supabase db lint --local --level error` n’a remonté aucune
  erreur. Le premier essai avec `supabase test db` a été écarté : ce fichier
  d’assertions SQL documente explicitement qu’il ne s’agit pas de pgTAP.
- Après le prébuild CNG final, CocoaPods et `xcodebuild` Debug simulateur iOS
  ont réussi ; `assembleDebug` Android a aussi réussi (458 tâches). Ces builds
  prouvent la compilation native, pas les parcours authentifiés complets.

### État Pixel et iOS

| Cible                     | État vérifié                                                                                                                                        | Ce que cela ne prouve pas                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Google Pixel physique     | Un APK de développement antérieur a été signé v2, installé et lancé avant la déconnexion du téléphone. Le Pixel est actuellement absent d’ADB.      | Le lot final n’a pas été réinstallé ni observé sur ce téléphone ; aucun parcours authentifié n’est prouvé.  |
| Expo Android émulateur    | APK final JDK 17 signé v2, installé sur l’AVD API 36 ; activité, PID, bundle Metro, écran de connexion sombre et absence d’erreur fatale contrôlés. | Les parcours authentifiés, les données réelles et la carte Android avec clé restreinte restent à exercer.   |
| Expo iOS simulateur       | Prebuild CNG, CocoaPods et build final `DispoDev` réussis ; app signée localement avec ses entitlements et installée sur un simulateur temporaire.  | macOS verrouillé a empêché la dernière ouverture/capture ; aucun parcours authentifié final n’est consigné. |
| iPhone physique / Expo Go | Aucun test effectué pour le lot courant.                                                                                                            | Expo Go ne couvre pas toutes les intégrations natives ; la preuve finale exige un development build.        |
| Référence SwiftUI         | L’application native iOS 2.4 build 35 a été recompilée et reste la référence.                                                                       | Aucune comparaison pixel à pixel complète avec Expo n’est encore approuvée.                                 |

### Limites et gates restants

- Conserver `npm run validate` et `expo-doctor` verts après toute modification
  supplémentaire ; le gate actuel est acquis sur le lot figé du 31 août.
- Exécuter sur deux comptes de test les droits propriétaire/membre,
  leader/invité, hôte/candidat, blocage, confidentialité des adresses, mutations
  et Realtime ; aucune de ces preuves ne doit utiliser les comptes de
  production comme fixtures automatisées.
- Refaire les builds après gel du JavaScript, puis parcourir les écrans sur
  Pixel et iOS en clair/sombre, dans les langues cibles et avec les principaux
  états ; comparer aux références SwiftUI et Kotlin sur des données identiques.
- Valider sur development builds les intégrations natives : Apple/Google,
  APNs/FCM, rappels locaux, deep links, localisation, caméra/photos, vidéo,
  documents privés, partage, haptique et stockage sécurisé. RevenueCat et les
  achats StoreKit/Play Billing ne sont pas encore intégrés à la cible commune.
- Aucun build Release signé, upload TestFlight/Play, publication ni soumission
  App Review n’est acquis pour Expo.
- Le backend et la production sont inchangés : aucun `db push`, déploiement
  d’Edge Function, changement Auth/RLS/secret, compte ou donnée de production
  n’a été réalisé par ce portage. La migration locale
  `20260830173725_fix_song_catalog_trigger_privileges.sql` reste non appliquée.

## 1. Références et règles

Références produit :

- iOS : Dispo 2.4 build 35, SwiftUI, branche main, commit de référence
  02480bf au début de l’audit.
- Android : application native Kotlin / Jetpack Compose existante, à conserver
  comme référence jusqu’à ce que la parité Expo soit démontrée.
- Backend partagé : projet Supabase cghmmpcwqzpjwgnbiuuw.
- Nouvelle cible : mobile/, Expo SDK 57, React Native 0.86, TypeScript strict.
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
- Les discussions d’école ne sont pas portées dans la nouvelle interface,
  conformément au nouveau prompt. Les groupes musicaux et conversations
  directes restent visibles.
- Les relations principales sont Ami, Même école, joué avec et notes 1–5.
  L’ancien enum Appreciation reste un artefact de seed et ne doit pas guider
  le nouveau modèle.
- AMR est affiché comme badge immédiatement après Ami lorsqu’il est présent ;
  il ne faut pas confondre une entrée d’annuaire avec un partenariat officiel.
- Les liens musicaux ne sont affichés que lorsqu’une URL HTTPS fonctionnelle
  existe. Aucun faux bouton Tidal, Amazon Music ou autre ne doit être rendu.
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
  20260830173725_fix_song_catalog_trigger_privileges.sql ; cette migration
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

| SwiftUI / fonctionnalité              | Cible Expo / RN                             | Statut        | Parité ou travail restant                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DispoApp + RootView                   | src/app/_layout.tsx, src/app/index.tsx      | EN COURS      | Session et shell présents ; onboarding, bannière globale, nouveautés, deep links et notifications à compléter.                                                                                               |
| TabView 5 onglets                     | src/app/(tabs)/_layout.tsx                  | EN COURS      | Ordre correct ; badges Sessions/SOS/Messages, ultraThinMaterial et identifiant agenda à préserver.                                                                                                           |
| AuthGateView / AuthForm               | src/app/(auth)/sign-in.tsx, features/auth   | EN COURS      | Hiérarchie, copies, sélecteur, champs, CTA et mentions Swift portés ; login/signup et demande de reset e-mail présents. Callback de récupération, Apple, Google Android et parcours réels restent à prouver. |
| OnboardingView                        | src/app/(auth)/onboarding/*                 | À FAIRE       | Quatre étapes, profil express, région et changement de compte.                                                                                                                                               |
| HomeView                              | src/app/(tabs)/index.tsx                    | EN COURS      | Feed profils présent ; greeting/logo, réseau, notifications, recherche, groupes, trois scopes de disponibilité et actions manquent.                                                                          |
| SearchView                            | src/app/search.tsx, features/search         | EN COURS      | Logique Ami/Même école/AMR présente dans domain/profile ; écran et recherche SOS manquent.                                                                                                                   |
| FilterSheet                           | src/app/filters.tsx, features/search        | EN COURS      | Type relationship filter présent ; instruments, genres, date, pays/postal/ville, rayon, niveaux et gating Premium manquent.                                                                                  |
| NotificationsCenterView               | src/app/notifications.tsx                   | À FAIRE       | Feed, lecture, navigation cible et états vides.                                                                                                                                                              |
| MusicianDetailView                    | src/app/profiles/[id].tsx                   | EN COURS      | Résumé, écoles, rating et contact présents ; follow, SOS direct, groupes, vidéos, réseaux, joué-avec, followers, report/block manquent.                                                                      |
| PlayedWithSheet                       | src/app/profiles/[id]/played-with.tsx       | À FAIRE       | Pagination et navigation profil.                                                                                                                                                                             |
| FollowersSheet                        | src/app/profiles/[id]/followers.tsx         | À FAIRE       | Followers/following, relation mutuelle.                                                                                                                                                                      |
| VideoPlayerSheet                      | features/media/profile-video.tsx            | À FAIRE       | Player, état de chargement, erreur et analytics local uniquement.                                                                                                                                            |
| EventsView                            | src/app/(tabs)/sos.tsx                      | EN COURS      | Feed public présent ; segments SOS/Mes SOS, compatibilité, demandes directes et gestion hôte manquent.                                                                                                       |
| EventCard                             | features/gigs/gig-card.tsx                  | EN COURS      | Carte présente, mais forme de billet, perforation, code-barres et couleurs exactes manquent.                                                                                                                 |
| CreateEventView                       | src/app/gigs/create.tsx                     | EN COURS      | Mutation minimale présente ; contrôles structurés, récurrence, Premium, lieu privé et validations UX manquent.                                                                                               |
| SOSMatchView                          | src/app/gigs/[id]/matches.tsx               | À FAIRE       | Classement et profils compatibles.                                                                                                                                                                           |
| SOSRequestSheet                       | src/app/gigs/request/[profileId].tsx        | À FAIRE       | Instrument, dates du musicien, lieu, cachet et message.                                                                                                                                                      |
| EventDetailView                       | src/app/gigs/[id].tsx                       | EN COURS      | Détail/candidature simple ; état candidature, retrait, hôte, sécurité, demandes et line-up manquent.                                                                                                         |
| GigPrivateLocationCard                | features/locations/private-gig-location.tsx | BLOQUÉ        | À implémenter uniquement via RPC privé autorisé et carte native ; aucune adresse exacte dans le feed.                                                                                                        |
| MyEventsView                          | src/app/(tabs)/sessions.tsx                 | À FAIRE       | Futur/passé, synthèse, groupes et SOS, badges de réponse.                                                                                                                                                    |
| AgendaRow / NextDateCard / AnswerCard | features/sessions/components/*              | À FAIRE       | Cartes, regroupement mensuel et réponse oui/non.                                                                                                                                                             |
| ChatListView                          | src/app/(tabs)/messages.tsx                 | EN COURS      | Direct présent ; groupes musicaux, invitations et unread manquent ; discussions école volontairement exclues.                                                                                                |
| ChatView                              | src/app/messages/[id].tsx                   | EN COURS      | Texte, pagination et Realtime présents ; delivered/read, typing, edit/delete, réactions et scroll fin manquent.                                                                                              |
| MessageAttachment*                    | features/messages/attachments/*             | À FAIRE       | Photo, vidéo, fichier, brouillon, upload privé, téléchargement et aperçu.                                                                                                                                    |
| MessageControls                       | features/messages/message-actions.tsx       | À FAIRE       | Jour, réactions, menu, édition, suppression, confirmations.                                                                                                                                                  |
| GroupChatView — Messages              | src/app/groups/[id]/index.tsx               | À FAIRE       | Messages de groupe, unread, typing, réactions et pièces jointes.                                                                                                                                             |
| GroupChatView — Répertoire            | src/app/groups/[id]/songs.tsx               | À FAIRE       | Liste, recherche, ajout et réordonnancement.                                                                                                                                                                 |
| SongRow / drag                        | features/songs/song-row.tsx                 | À FAIRE       | Appui long stationnaire pour options et drag réel prioritaire ; haptique et auto-scroll.                                                                                                                     |
| SongDetailSheet                       | src/app/groups/[id]/songs/[songId].tsx      | EN COURS      | Helpers de liens/déduplication/destination présents ; UI iReal, partitions, solos et commentaires absente.                                                                                                   |
| AddSongSheet / EditSongSheet          | src/app/groups/[id]/songs/edit.tsx          | À FAIRE       | Création et édition, tonalité sous titre, catalogue et validation.                                                                                                                                           |
| CopySongSheet                         | features/songs/copy-song.tsx                | EN COURS      | Tri, libellé complet et déduplication testables présents ; mutation/UI manquent.                                                                                                                             |
| ListenSheet                           | features/songs/listen.tsx                   | EN COURS      | Filtre d’URL HTTPS présent ; UI fournisseurs et ouverture manquent.                                                                                                                                          |
| GroupChatView — Événements            | src/app/groups/[id]/events.tsx              | À FAIRE       | Cartes, création, édition, annulation et réponses.                                                                                                                                                           |
| GroupEventSheet                       | src/app/groups/[id]/events/[eventId].tsx    | À FAIRE       | Détail, présence, setlist, invités, SOS et lieu privé.                                                                                                                                                       |
| Add/EditGroupEventSheet               | features/groups/events/forms/*              | À FAIRE       | Types concert/répétition/jam, récurrence et atomicité lieu privé.                                                                                                                                            |
| GroupMembersSheet                     | src/app/groups/[id]/members.tsx             | À FAIRE       | Membres, rôles et profils.                                                                                                                                                                                   |
| InviteMemberSheet                     | src/app/groups/[id]/invite.tsx              | À FAIRE       | Recherche, invitation, Premium et états.                                                                                                                                                                     |
| GroupSettingsSheet                    | src/app/groups/[id]/settings.tsx            | À FAIRE       | Nom/photo, leadership, sortie/suppression.                                                                                                                                                                   |
| NewGroupSheet                         | src/app/groups/create.tsx                   | À FAIRE       | Création et limite de groupes dirigés.                                                                                                                                                                       |
| DocPreview / QuickLook                | features/documents/document-preview.tsx     | BLOQUÉ        | Pas d’équivalent QuickLook exact ; choisir PDF viewer ou module natif et fallback partage.                                                                                                                   |
| MusicSchoolDirectoryView              | src/app/schools/index.tsx                   | À FAIRE       | Annuaire et affiliations uniquement.                                                                                                                                                                         |
| MusicSchoolJoinSheet                  | src/app/schools/[id]/join.tsx               | À FAIRE       | Rôle, instrument, statut et école principale.                                                                                                                                                                |
| MusicSchoolCommunityView              | aucune route publique                       | NE PAS PORTER | Discussions école explicitement masquées ; conserver seulement affiliation/badge si décision maintenue.                                                                                                      |
| MusicSchoolMembersSheet               | src/app/schools/[id]/members.tsx            | À FAIRE       | À décider séparément du chat école.                                                                                                                                                                          |
| MyProfileView                         | src/app/(tabs)/profile.tsx                  | EN COURS      | Lecture résumée présente ; édition, disponibilité, lieux, vidéos, groupes et stats détaillées manquent.                                                                                                      |
| EditProfileSheet                      | src/app/profile/edit.tsx                    | À FAIRE       | Photo, bio, instruments/niveaux, genres, région et réseaux.                                                                                                                                                  |
| VideoDetailsSheet                     | src/app/profile/videos/[id].tsx             | À FAIRE       | Titre, suppression et upload/transcodage.                                                                                                                                                                    |
| LanguageRegionSheet                   | src/app/settings/language-region.tsx        | À FAIRE       | Choix persistant parmi neuf langues et pays/région.                                                                                                                                                          |
| AvailabilityPlaceSheet                | src/app/profile/availability-place.tsx      | À FAIRE       | Dates, pays, code postal, ville et rayon.                                                                                                                                                                    |
| SettingsSheet                         | src/app/settings/index.tsx                  | À FAIRE       | Navigation réglages, thème, localisation, support et confidentialité.                                                                                                                                        |
| AccountSheet                          | src/app/settings/account.tsx                | À FAIRE       | E-mail, déconnexion, suppression, isolation de compte et changement de compte.                                                                                                                               |
| NotificationsSettingsView             | src/app/settings/notifications.tsx          | À FAIRE       | Catégories, permission système, token et badge.                                                                                                                                                              |
| LinkAppleSheet                        | src/app/settings/link-apple.tsx             | BLOQUÉ        | Capability/config Apple et parcours de liaison à valider sur development build.                                                                                                                              |
| PaywallView                           | src/app/paywall.tsx                         | BLOQUÉ        | Point de montage produit à décider, SDK RevenueCat absent et stores non configurés pour la cible commune.                                                                                                    |
| WhatsNewSheet / PatchNotesView        | src/app/whats-new.tsx                       | À FAIRE       | Présentation une fois par version et historique.                                                                                                                                                             |
| CityPickerSheet                       | aucune                                      | NE PAS PORTER | Vue Swift apparemment orpheline ; utiliser pays + postal + résolution de ville et correction manuelle.                                                                                                       |

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

| Intégration iOS actuelle       | Cible Expo / Android                            | Statut / règle                                                                                                                                 |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| NavigationStack / sheets       | Expo Router Stack, Tabs et routes modales       | EN COURS ; conserver deep links, restauration et historique.                                                                                   |
| ultraThinMaterial              | expo-blur avec fallback opaque                  | À FAIRE ; comparer performances Android.                                                                                                       |
| Sign in with Apple             | expo-apple-authentication                       | BLOQUÉ par câblage, capability et preuve en development build ; aucun bouton factice n’est affiché sur AuthGate.                               |
| Google Android                 | expo-auth-session ou fournisseur natif approuvé | BLOQUÉ : absent des apps natives, nécessite provider Supabase, OAuth, SHA et stratégie de liaison de compte.                                   |
| Reset / dispo://login-callback | Supabase Auth + Expo Linking / Router           | EN COURS ; envoi e-mail explicite présent et testé unitairement, mais consommation du callback et mise à jour du mot de passe restent à faire. |
| RevenueCat / StoreKit          | react-native-purchases + Play Billing           | BLOQUÉ : dépendance et configuration stores absentes ; webhook reste autoritaire.                                                              |
| APNs                           | expo-notifications avec token natif             | À FAIRE ; push_devices accepte déjà APNs et FCM. Utiliser getDevicePushTokenAsync, pas Expo Push Service.                                      |
| FCM Android                    | expo-notifications avec token natif             | À FAIRE ; credentials et development/release build requis.                                                                                     |
| Notifications locales          | expo-notifications                              | À FAIRE ; rappels présence, badge et catégories.                                                                                               |
| CoreLocation                   | expo-location                                   | À FAIRE ; foreground, précision/arrondi et retrait de localisation.                                                                            |
| MapKit adresse privée          | expo-maps ou module natif                       | BLOQUÉ jusqu’à validation du rendu et de la confidentialité RPC.                                                                               |
| PhotosPicker                   | expo-image-picker                               | Dépendance présente, parcours à faire.                                                                                                         |
| AVAssetReader/Writer           | module natif ou service approuvé                | BLOQUÉ pour la parité compression/transcodage 720p et audio.                                                                                   |
| AVPlayer                       | expo-video                                      | Dépendance présente, UI et erreurs à faire.                                                                                                    |
| DocumentPicker                 | expo-document-picker                            | Dépendance présente, upload privé et taille/type à faire.                                                                                      |
| QuickLook                      | PDF viewer/module natif + partage fallback      | BLOQUÉ par choix technique.                                                                                                                    |
| Analyse de tonalité audio      | module natif ou backend                         | BLOQUÉ ; aucun équivalent Expo standard.                                                                                                       |
| iReal Pro schemes/HTML         | Expo Linking + queries Android/iOS              | À FAIRE ; conditionnel selon disponibilité de l’app.                                                                                           |
| UIKit haptics                  | expo-haptics                                    | Dépendance présente, politique sémantique à reproduire.                                                                                        |
| URLSession/NSCache avatars     | expo-image + politique de cache                 | EN COURS ; retry borné, coalescence et invalidation après upload à prouver.                                                                    |
| UserDefaults                   | stockage local versionné                        | À FAIRE pour thème, langue et nouveautés.                                                                                                      |
| Keychain/session               | adaptateur SecureStore évalué                   | À FAIRE avant release.                                                                                                                         |

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
- Android Kotlin et iOS SwiftUI conservés jusqu’à décision de bascule ;
- aucune App Review ou publication implicite.

## 12. Risques prioritaires

| Priorité | Risque                                              | Réponse                                                                                                           |
| -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P0       | Fuite d’adresse exacte                              | Accès uniquement par RPC privé et tests propriétaire/participant/intrus.                                          |
| P0       | Contournement Premium                               | Lire is_premium serveur ; webhook seul auteur ; ignorer user_metadata.                                            |
| P0       | Requêtes globales reproduites du Swift              | Pagination, colonnes explicites, Realtime filtré et RPC curseur.                                                  |
| P0       | Session de plusieurs comptes mélangée               | Purge ciblée du cache Query/session lors de logout et tests d’isolation.                                          |
| P1       | Socle natif vert mais parcours métier non prouvés   | Exécuter Phase 2 à deux comptes, avec backend de test et captures comparatives.                                   |
| P1       | Variables Java/Android non forcément persistées     | Réexporter JAVA_HOME, ANDROID_HOME et PATH dans toute nouvelle session ; CocoaPods 1.17 et JDK 17 sont installés. |
| P1       | Expo Go utilisé comme preuve                        | Utiliser development builds CNG.                                                                                  |
| P1       | AsyncStorage pour session                           | Évaluer/adopter un stockage sécurisé avant release.                                                               |
| P1       | Paywall Swift orphelin et RevenueCat absent         | Décider montage produit, installer SDK, puis sandbox + webhook.                                                   |
| P1       | QuickLook/transcodage/analyse audio sans équivalent | Module natif ou changement produit explicite, jamais imitation silencieuse.                                       |
| P1       | i18n seulement exportée                             | Remplacer toutes les chaînes/formatters en dur et tester neuf locales.                                            |
| P1       | Rendu Android divergent                             | Golden tests, table d’icônes, fallback blur/shadow et tolérance approuvée.                                        |
| P1       | Correctif triggers morceaux local uniquement        | Revoir puis appliquer la migration 20260830173725 en production avec confirmation explicite.                      |
| P2       | Avis npm modérés dans l’outillage Expo              | Attendre une résolution compatible SDK 57 ; ne pas utiliser npm audit fix --force qui rétrograde Expo.            |
| P2       | Assets de scaffold Expo conservés localement        | Ils ne sont pas référencés et sont exclus de Git ; ne versionner que l’identité Dispo.                            |
| P2       | Vingt pfp legacy iOS probablement morts             | Ne pas les recopier sans preuve d’usage.                                                                          |

## 13. Discipline de mise à jour

Après chaque lot :

1. mettre à jour les statuts de ce document ;
2. distinguer code présent, test exécuté, build exécuté et livraison ;
3. consigner les commandes et sorties réellement observées ;
4. mettre à jour AGENTS.md en append-only ;
5. ne jamais masquer un blocage d’outillage ou d’accès administrateur ;
6. conserver les apps natives et le backend comme références jusqu’au gate
   final de Phase 4.
