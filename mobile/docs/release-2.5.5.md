# Dispo 2.5.5 (71) — Jazz et rock

## Comportement

La fiche morceau choisit le bouton de partition selon le style : iReal Pro pour
le jazz et ses variantes, Songsterr pour le rock et ses variantes. Le style choisi
dans le répertoire personnel est prioritaire ; sinon le genre principal du
catalogue est utilisé, puis les genres secondaires pour les anciens morceaux sans
genre principal. Un style non reconnu n'affiche aucun des deux boutons.
Songsterr recherche l'artiste et le titre sur son site officiel. Le fonctionnement
iReal Pro et son repli vers le store sont conservés.

Les éditeurs de morceaux de groupe et d'événement permettent de préciser Jazz ou
Rock. Ce choix est sauvegardé avec les champs existants et résiste à un enrichissement
tardif du catalogue. Les onglets, solos, commentaires, partitions et liens d'écoute
conservent leur fonctionnement. Les neuf langues incluent le bouton Songsterr.

Aucune migration, dépendance ou modification du backend. Le lot part de la version
publique 2.5.4 ; les chantiers locaux `v2` et `v2-site` restent séparés.

## Vérifications

- TypeScript, ESLint et Jest : 99 suites, 689 tests réussis.
- Tests couvrant styles, liens, erreur d'ouverture, repli iReal, sauvegarde du genre,
  sérialisation et onglets existants.
- CNG/pods, build iOS Release simulateur, archive/export de distribution ; build
  Android Release APK/AAB, signatures vérifiées et configuration production contrôlée.
- Rendu du composant réel en jazz/rock et sombre/clair sur iPhone Air iOS 27 et
  Android 16. XCTest iOS réussi ; ouverture Safari jusqu'aux résultats Songsterr.
  Android a transmis le lien à Chrome, arrêté sur son premier écran d'accueil.
- Démarrage des versions de production sur les deux plateformes, puis restauration
  de la version de production après les fixtures QA. Aucun compte de test en production.
- Formatage des fichiers modifiés et `git diff --check` réussis. Le contrôle global
  de formatage signale trois fichiers préexistants inchangés (`MIGRATION.md` et deux
  tests de matching/SOS).
- Expo Doctor : 20/21, avertissement de correctifs de dépendances disponibles ;
  aucune mise à jour de dépendance dans ce lot. Aucun appareil physique testé.

## Distribution et promotion

Le build 71 corrige aussi le repli des genres secondaires dans les anciens
morceaux personnels ; le build 70 a été importé mais ne sera pas soumis.

Le détail des états Apple/Google, des signatures et des preuves est conservé hors
Git dans `Dispo-dist/2.5.5/RELEASE-build71.md` et `Dispo-dist/qa-20260926-rock/`.
La soumission et l'import Apple ne constituent pas une publication approuvée.

La nouvelle offre Apple `DISPO3MOIS2026` fournit trois mois Premium, sans
renouvellement payant automatique, aux nouveaux abonnés et aux anciens abonnés
expirés, avec un plafond total de 1 000 activations. Le même QR sert à tous les
participants. L'offre est configurée dans les 175 territoires App Store ; Apple confirme également la disponibilité effective de Dispo dans les 175 territoires. PNG, SVG et notice :
`Dispo-dist/promo-monde-20260926/`. Le QR a été décodé et son URL vérifiée ;
l'activation réelle et l'attribution Premium sur iPhone physique restent à tester.

Le compte Google Play bloque la publication tant que l'identité et le téléphone
ne sont pas validés. L'APK et l'AAB signés sont prêts. Le code Apple n'est pas
utilisable sur Android. Les codes Play personnalisés demandent au moins 2 000
utilisations ; aucun code dépassant le plafond demandé de 1 000 n'a été créé.

## État de livraison — 2026-09-26T19:23:14+02:00

Build 71 importé `VALID / APP_STORE_ELIGIBLE`, TestFlight interne `IN_BETA_TESTING`,
notes FR/EN et version 2.5.5 soumise : `WAITING_FOR_REVIEW`, publication `AFTER_APPROVAL`.
Les 175 territoires sont `AVAILABLE` ; fiches publiques US/GB vérifiées en 2.5.4.
Google Play reste bloqué par les vérifications du compte. Les preuves et limites
sont détaillées dans le rapport de distribution.
