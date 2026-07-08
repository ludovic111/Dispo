# JamConnect ⚡🎶

**L'app de dépannage concert — un musicien te lâche, tu trouves un remplaçant fiable en quelques minutes. Profil vidéo + dispo temps réel + géolocalisation.**

Version 0.3 — démo autonome (sans backend) pour valider le concept en main, projet mené avec Raphaël, lancé sur la communauté jazz / latin jazz de Genève. Positionnement : 100 % dépannage concert (le concept « jam » a été abandonné en juillet 2026).

| | |
|---|---|
| **Plateforme** | iOS 17+ (SwiftUI) |
| **Statut** | Démo locale + **mode live** (backend Supabase) |
| **Backend** | Supabase (Postgres + RLS, Auth OTP e-mail, Realtime) |
| **Bundle ID** | `com.ludovicmarie.jamconnect` |
| **Repo** | Privé |

## Structure du projet

```
JamConnect/
├── JamConnect/              # Code source SwiftUI
│   ├── Views/               # Écrans (Discovery, Events, Chat, Profil…)
│   ├── Backend/             # Couche Supabase (config + service)
│   ├── Assets.xcassets/     # Icônes, couvertures, avatars
│   ├── Models.swift         # Modèles de données
│   ├── AppStore.swift       # État global : mode démo + mode live
│   ├── Secrets.example.plist# Modèle de config backend (copier en Secrets.plist)
│   └── SeedData.json        # Données fictives de démo
├── supabase/
│   ├── migrations/          # Schéma SQL (tables, RLS, vue teaser Premium)
│   ├── seed.sql             # 20 musiciens de dev (mdp « jamconnect-demo »)
│   └── config.toml          # Config stack locale
├── JamConnect.xcodeproj/    # Projet Xcode (généré)
├── project.yml              # Config XcodeGen
└── README.md
```

## Backend (mode live)

L'app embarque une couche Supabase complète : **auth par code e-mail**, profils
synchronisés, annonces SOS, candidatures et **messagerie temps réel**. Toute la
sécurité est côté serveur (RLS) — y compris l'**avant-première Premium** : pendant
30 min, la vue `gig_requests_feed` masque titre/lieu/description aux non-Premium
(le cachet et l'instrument restent visibles), et postuler est bloqué par policy.

Sans `Secrets.plist`, l'app reste en mode démo 100 % locale. Avec, une carte
« Rejoindre le réseau » apparaît dans l'onglet Profil.

### Dev local (stack Supabase dans Docker)

```bash
brew install supabase/tap/supabase colima
colima start --cpu 4 --memory 6
cd JamConnect && supabase start      # migrations + seed appliqués automatiquement
supabase status                      # → API URL + anon key
```

Puis copiez `JamConnect/Secrets.example.plist` en `JamConnect/Secrets.plist` avec
`http://IP-DU-MAC:54321` (iPhone sur le même Wi-Fi) et l'anon key. Rebuild.

- Comptes de test : `marco@demo.jamconnect.ch` … (20 musiciens du seed), mot de passe `jamconnect-demo`.
- Les codes e-mail de connexion arrivent dans **Mailpit** : http://localhost:54324
- Studio (admin BDD) : http://localhost:54323

### Passage en production

Créer un projet sur [supabase.com](https://supabase.com) (plan gratuit), puis :

```bash
supabase link --project-ref <ref>
supabase db push                     # applique les migrations (PAS le seed)
```

Mettre l'URL https + l'anon key du projet dans `Secrets.plist`. C'est tout.

## Ce que contient la démo

- **Design « nuit de jazz »** — design system custom (dégradés violet → magenta → corail, cartes arrondies, couleur par genre musical), onboarding en 3 écrans qui explique le concept à la première ouverture.
- **Accueil** — rangée « Dispo ce soir » (les mobilisables immédiatement), rangée « Dispo prochainement », feed de cartes avec couverture vidéo, cœur favori, notes de musique reçues, pilules Filtres/Carte, bascule carte MapKit centrée sur Genève.
- **SOS dépannage** — tableau d'annonces : un concert cherche un musicien (date, lieu, instrument, cachet CHF). Publication de son propre SOS en 30 secondes, bouton « Je peux dépanner ! ». Les annonces passées sont purgées automatiquement.
- **Avant-première Premium** — les SOS fraîchement publiés (< 30 min) sont réservés aux membres Premium : les non-abonnés voient le cachet et l'instrument mais pas le lieu, avec un compte à rebours en direct → c'est la démonstration in-app de la killer feature.
- **Fiche musicien** — hero vidéo (60–90 s, lecteur réel en phase 2), stats sociales, genres avec leurs codes (standards jazz, clave latine…), répertoire, boutons favori + « Demander un dépannage ».
- **Système d'appréciation positif** — après un concert, on donne une **note de musique** (« j'ai aimé ») ou une **note dorée animée** (« coup de cœur ») ; pas de note négative possible.
- **Messages** — conversations avec réponse automatique scriptée (démo).
- **Profil** — carte hero avec stats, sélecteur de dispo dépannage (5 statuts, de 🚨 Ce soir à 🌙 Indisponible), teaser « qui a vu ton profil » (avatars floutés → paywall), badge Premium, thème clair/sombre, édition complète.
- **Monétisation** — abonnement **JamConnect Premium à CHF 6.90/mois ou CHF 59/an** (annuel mis en avant : « soit CHF 4.90/mois, −29 % ») : alertes dépannage 30 min avant tout le monde, profil en tête, filtres avancés, qui a vu ton profil, badge doré. Essai 7 jours. Paiement simulé dans la démo ; StoreKit/App Store en phase 2.

Les données sont fictives et rechargeables : *Profil → Réinitialiser la démo*.

## Installer sur votre iPhone

1. Ouvrez `JamConnect.xcodeproj` dans Xcode.
2. Cliquez sur le projet **JamConnect** (barre latérale) → cible **JamConnect** → onglet **Signing & Capabilities** → **Team** : choisissez votre Apple ID (équipe personnelle « Ludovic Marie »). Si absent : Xcode → Settings → Accounts → « + » pour ajouter votre Apple ID.
3. Branchez votre iPhone en USB (ou Wi-Fi une fois appairé) et sélectionnez-le comme destination en haut de la fenêtre.
4. Appuyez sur **▶ Run**.
5. Sur l'iPhone, à la première installation :
   - **Réglages → Général → VPN et gestion de l'appareil** → faites confiance à votre certificat de développeur ;
   - activez le **Mode développeur** si iOS le demande (Réglages → Confidentialité et sécurité → Mode développeur), l'iPhone redémarre.

> ⚠️ Avec un compte Apple gratuit, l'app expire après **7 jours** — il suffit de relancer ▶ depuis Xcode pour la renouveler. Pour la distribuer à Raphaël ou à des testeurs via **TestFlight**, il faudra l'Apple Developer Program (99 $/an).

## Rebuilder le projet après modification des fichiers

Le `.xcodeproj` est généré par [XcodeGen](https://github.com/yonaskolb/XcodeGen) depuis `project.yml`. Si vous ajoutez/supprimez des fichiers Swift :

```bash
cd JamConnect && xcodegen generate
```

## Prochaines étapes (phase 2b — à discuter avec Raphaël)

1. ~~Backend Supabase~~ ✅ fait (auth e-mail, profils, SOS, messagerie temps réel, RLS Premium).
2. **Projet Supabase hébergé** (gratuit) + `supabase db push` pour sortir du Mac.
3. **Vidéo réelle** : enregistrement in-app, upload Supabase Storage ou Mux (~5 $/1000 min).
4. **Notifications push** (« un SOS piano à 2 km, cachet CHF 150 ») — le cœur de la promesse Premium.
5. **StoreKit 2** : brancher le paywall sur de vrais abonnements App Store + `is_premium` serveur.
6. **Géolocalisation réelle** (aujourd'hui : position fixée au centre de Genève) et favoris/appréciations synchronisés.
7. **TestFlight** pour les 20–30 premiers musiciens genevois (AMR, Conservatoire, Chat Noir…).
