# Dispo

Application mobile commune de dépannage musical, développée avec Expo et React
Native pour iOS et Android.

| Élément             | Valeur                                                        |
| ------------------- | ------------------------------------------------------------- |
| Client canonique    | `mobile/` — Expo SDK 57, React Native 0.86, TypeScript strict |
| Backend             | Supabase `cghmmpcwqzpjwgnbiuuw` — Zurich                      |
| Identité production | `ch.dispo.app`, schéma `dispo`                                |
| Site                | [dispoapp.net](https://dispoapp.net) — dépôt séparé           |

Les anciennes applications SwiftUI et Kotlin ont été retirées du workspace le
1er septembre 2026 après validation explicite du client React Native. Leur
historique reste disponible dans Git ; elles ne sont plus des cibles de
développement ni des références actives.

## Structure

```text
Dispo/
├── mobile/              # Application Expo / React Native iOS + Android
├── supabase/            # Migrations, fonctions Edge et tests SQL partagés
├── docs/                # Documentation produit durable
└── README.md
```

Les dossiers `mobile/ios` et `mobile/android` sont générés par Continuous
Native Generation et ne sont pas versionnés. Toute configuration durable doit
rester dans `mobile/app.json`, `mobile/app.config.ts` ou un config plugin.

## Démarrage local

```bash
cd mobile
npm install
cp .env.example .env.local
npm start
```

Seules l’URL Supabase et la clé publique/publishable peuvent être placées dans
`.env.local`. Aucun secret `service_role`, Apple, Google ou RevenueCat ne doit
entrer dans le client ou dans Git.

La variante locale utilise `Dispo Dev`, `ch.dispo.app.dev` et `dispo-dev`. La
configuration production s’obtient avec `APP_VARIANT=production`.

## Validation

```bash
cd mobile
npm run validate
npx expo-doctor
APP_VARIANT=production npx expo prebuild --clean
npm run build:ios:local
npm run build:android:local
```

Expo Go ne couvre pas toutes les intégrations de Dispo. Les parcours caméra,
notifications, localisation, liens externes, stockage sécurisé et achats se
valident dans un development build ou un build local sur simulateur/appareil.

## Supabase

Le schéma partagé, les RLS et les Edge Functions vivent dans `supabase/` :

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db push
```

Une migration doit être versionnée avant toute application en production. Une
livraison App Store/TestFlight ne vaut jamais soumission App Review.

## Documentation

- [`mobile/MIGRATION.md`](mobile/MIGRATION.md) conserve le contrat de portage,
  les preuves de validation et l’historique de la convergence native → Expo.
- Le `AGENTS.md` placé à la racine du workspace DISPO fait autorité pour les
  décisions produit, les limites d’intervention et le journal append-only.
