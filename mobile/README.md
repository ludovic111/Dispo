# Dispo mobile

Client commun Expo / React Native de Dispo. La migration est progressive : les
applications SwiftUI et Kotlin restent les références fonctionnelles jusqu’à
ce que chaque parcours Expo atteigne la parité et passe ses validations.

Le périmètre, les écarts et l’ordre de portage sont suivis dans
[`MIGRATION.md`](./MIGRATION.md).

## Prérequis

- Node.js 22.13 ou plus récent et npm 11 ;
- Xcode, CocoaPods et un simulateur iOS pour le build Apple ;
- JDK 17, Android SDK 36 et un émulateur Android pour le build Google.

## Configuration locale

```bash
npm install
cp .env.example .env.local
```

Renseigner uniquement l’URL Supabase et la clé publique/publishable dans
`.env.local`. Ne jamais placer de clé `service_role`, de secret Apple/Google ou
de secret RevenueCat dans le client.

La variante locale utilise `Dispo Dev`, `ch.dispo.app.dev` et `dispo-dev` afin
de cohabiter avec les applications natives. La production conserve
`ch.dispo.app` et `dispo` et exige `APP_VARIANT=production`.

## Commandes utiles

```bash
npm run validate
npx expo-doctor
npm run prebuild
npm run ios
npm run android
```

Les dossiers `ios/` et `android/` sont générés par Continuous Native Generation
et ignorés par Git. Toute configuration native durable doit vivre dans
`app.json`, `app.config.ts` ou un config plugin.

Expo Go n’est pas une preuve suffisante pour Dispo : les parcours natifs se
valident avec un development build ou un build local sur simulateur/appareil.

## Tranche fonctionnelle actuelle

- session Supabase persistante et connexion/création e-mail ;
- accueil de profils paginé, détail de profil et démarrage d’un message direct ;
- liste, détail, création et candidature SOS ;
- liste et fil de messages directs paginés avec Realtime filtré ;
- onglet profil en lecture et shell des cinq onglets.

Les Sessions, groupes, morceaux, écoles, pièces jointes, notifications,
localisation complète, achats et fournisseurs OAuth restent à porter et sont
détaillés dans `MIGRATION.md`.
