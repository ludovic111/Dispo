# Dispo mobile

Client mobile canonique Expo / React Native de Dispo pour iOS et Android. Les
anciennes applications SwiftUI et Kotlin ont été retirées du workspace le
1er septembre 2026 après validation explicite de ce client commun.

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

La variante locale utilise `Dispo Dev`, `ch.dispo.app.dev` et `dispo-dev`. La
production conserve `ch.dispo.app` et `dispo` et exige
`APP_VARIANT=production`.

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

## Périmètre courant

Le client couvre les cinq onglets, l’authentification, les profils et relations,
les disponibilités, SOS et Sessions, les messages directs/de groupe/d’école,
les groupes, répertoires, morceaux, événements, écoles, notifications,
localisation et pièces jointes. Les preuves, limites d’intégration et travaux
restants sont détaillés dans `MIGRATION.md`.
