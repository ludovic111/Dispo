# Dispo ⚡🎶

**L'app de dépannage concert — un musicien te lâche, tu trouves un remplaçant fiable en quelques minutes. Profil vidéo + dispo temps réel + géolocalisation.**

Version **0.9.1 (bêta)** — projet mené avec Raphaël, lancé sur la communauté jazz / latin jazz de Genève. Positionnement : 100 % dépannage concert (le concept « jam » a été abandonné en juillet 2026 ; l'app s'est appelée « JamConnect » jusqu'à la v0.3, tout a été renommé « Dispo » depuis). L'historique des versions est consultable dans l'app : *Profil → Nouveautés*.

| | |
|---|---|
| **Plateforme** | iOS 17+ (SwiftUI) |
| **Langues** | FR (source), EN, ES, DE, IT, 中文, 日本語 — sélecteur in-app |
| **Statut** | Démo locale + **mode live** (backend Supabase hébergé) |
| **Backend** | Supabase `dispo` — Zurich (`cghmmpcwqzpjwgnbiuuw`), Postgres + RLS, Auth e-mail + Apple, Realtime |
| **Bundle ID** | `ch.dispo.app` |
| **Repo** | Privé |

## Structure du projet

```
Dispo/
├── Dispo/              # Code source SwiftUI
│   ├── Views/               # Écrans (Discovery, Events, Chat, Profil…)
│   ├── Backend/             # Couche Supabase (config + service)
│   ├── Assets.xcassets/     # Icônes, couvertures, avatars
│   ├── Models.swift         # Modèles de données
│   ├── AppStore.swift       # État global : mode démo + mode live
│   ├── Localizable.xcstrings# Catalogue de traductions (7 langues)
│   ├── Secrets.example.plist# Modèle de config backend (copier en Secrets.plist)
│   └── SeedData.json        # Données fictives de démo
├── supabase/
│   ├── migrations/          # Schéma SQL (tables, RLS, vue teaser Premium)
│   ├── seed.sql             # 20 musiciens de dev (mdp « jamconnect-demo »)
│   └── config.toml          # Config stack locale
├── Dispo.xcodeproj/    # Projet Xcode (généré)
├── project.yml              # Config XcodeGen
└── README.md
```

## Backend (mode live)

L'app embarque une couche Supabase complète : **auth e-mail + mot de passe**, profils
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
cd Dispo && supabase start      # migrations + seed appliqués automatiquement
supabase status                      # → API URL + anon key
```

Puis copiez `Dispo/Secrets.example.plist` en `Dispo/Secrets.plist` avec
`http://IP-DU-MAC:54321` (iPhone sur le même Wi-Fi) et l'anon key. Rebuild.

- Comptes de test : `marco@demo.dispo.ch` … (20 musiciens du seed), mot de passe `jamconnect-demo`.
- Les e-mails (réinitialisation de mot de passe…) arrivent dans **Mailpit** : http://localhost:54324
- Studio (admin BDD) : http://localhost:54323

### Projet hébergé (production de test)

Le projet **`dispo`** tourne sur supabase.com (org « Ludovic's Supabase », région
Zurich, plan gratuit) : schéma + seed déployés, `Secrets.plist` pointe dessus par
défaut — l'app fonctionne donc partout, pas seulement sur le Wi-Fi du Mac.

- Dashboard : https://supabase.com/dashboard/project/cghmmpcwqzpjwgnbiuuw
- Comptes de test : `prenom@demo.dispo.ch` / `jamconnect-demo` (20 musiciens du seed)
- **Connexion dans l'app** : e-mail + mot de passe classique (création de compte
  instantanée, confirmation d'e-mail désactivée, minimum 8 caractères). « Mot de
  passe oublié » envoie un lien de réinitialisation (`dispo://login-callback`) —
  seul cas qui utilise l'e-mail, limité à ~2/h sur le tier gratuit (SMTP custom
  type Resend à prévoir avant le lancement).
- Jeton CLI + mot de passe BDD : trousseau macOS (`supabase-cli-dispo`,
  `supabase-dispo-db-password`). Re-déployer : `supabase db push`.
- **Sign in with Apple** : provider activé côté Supabase (`ch.dispo.app`).
  Le code iOS est prêt, mais la capability exige le Developer Program (99 $/an) —
  le bouton Apple apparaîtra automatiquement une fois l'app signée avec l'équipe
  payante (décommenter le bloc `entitlements` dans `project.yml`).

## Ce que contient la démo

- **Design « nuit de jazz »** — design system custom (dégradés violet → magenta → corail, cartes arrondies, couleur par genre musical).
- **Onboarding en 4 étapes** — langue → concept → pays/ville → profil express (nom, instruments, niveau). Rejouable à tout moment pour les comptes admin (*Profil → Mode admin → Revoir l'onboarding*).
- **Lieux précis** — **14 pays** (CH, FR, US, DE, IT, ES, PT, BE, NL, LU, AT, GB, IE, CA) et **300+ villes avec code postal** (`Locations.swift`), sélecteur avec recherche par nom ou code postal.
- **42 genres musicaux** en 9 familles (jazz, latin & world, classique, rock & pop, blues & country, soul & funk, hip-hop & urbain, électronique, folk) avec sous-genres — et **33 instruments** triés par catégories (claviers, cordes, vents & cuivres, batterie & percussions, voix, DJ & électro).
- **7 langues** — français (source), anglais, espagnol, allemand, italien, mandarin, japonais. ~330 chaînes dans `Localizable.xcstrings`, bascule immédiate depuis *Profil → Langue & région*.
- **Recherche universelle** — barre de recherche sur l'accueil : requêtes libres (« pianiste Carouge », « salsa ce soir », un nom, un @pseudo, un code postal), normalisation des accents, alias par instrument (« batteur » → Batterie), résultats musiciens + annonces SOS. Chaque musicien a un **@pseudo** dérivé de son nom, et son **nombre d'abonnés** s'affiche sur son profil et dans la recherche.
- **Accueil** — rangée « Dispo ce soir » (les mobilisables immédiatement), rangée « Dispo prochainement », feed de cartes avec couverture vidéo, cœur favori, notes de musique reçues, pilules Filtres/Carte, bascule carte MapKit centrée sur Genève.
- **SOS dépannage** — tableau d'annonces : un concert cherche un musicien (date, lieu, instrument, cachet CHF — cachet et description optionnels). Publication de son propre SOS en 30 secondes, bouton « Je peux dépanner ! ». Les annonces passées sont purgées automatiquement.
- **Matching SOS** — à la publication, l'app affiche immédiatement les musiciens compatibles (bon instrument + date du concert cochée dans leur calendrier en premier, puis profils « sur demande ») ; sans match, message honnête + conseils. Section « Musiciens compatibles » persistante sur ses propres annonces. Chaque match a un bouton **« Inviter »** : message pré-rempli (titre, date, lieu, cachet) envoyé direct dans la conversation.
- **Amis & abonnés** — bouton suivre sur chaque fiche, ami = suivi mutuel, badges Ami/Suivi/Te suit. Le feed et les matchs classent les relations en premier ; le **tri par niveau** (et l'affichage du niveau) est réservé aux membres Premium — les comptes gratuits voient une invitation à s'abonner.
- **Photo de profil & vidéos de démo** — photo depuis la photothèque ; vidéos de démo lisibles in-app, **datées** (date du concert / de l'enregistrement, modifiable) : **1 en gratuit, jusqu'à 6 en Premium** (stockage local, Supabase Storage en phase 2b).
- **Notifications** — notifications locales : nouveaux SOS compatibles avec ses instruments et messages reçus, avec bouton de test (*Profil → Notifications*). Les push serveur (APNs) arrivent avec le Developer Program.
- **Patchnotes in-app** — *Profil → Nouveautés* : historique des versions avec bandeau bêta.
- **Avant-première Premium** — les SOS fraîchement publiés (< 30 min) sont réservés aux membres Premium : les non-abonnés voient le cachet et l'instrument mais pas le lieu, avec un compte à rebours en direct → c'est la démonstration in-app de la killer feature.
- **Fiche musicien** — hero vidéo (60–90 s, lecteur réel en phase 2), stats sociales, genres avec leurs codes (standards jazz, clave latine…), répertoire, boutons favori + « Demander un dépannage ».
- **Système d'appréciation positif** — après un concert, on donne une **note de musique** (« j'ai aimé ») ou une **note dorée animée** (« coup de cœur ») ; pas de note négative possible.
- **Messages** — conversations avec réponse automatique scriptée (démo).
- **Groupes = vrais groupes de musique** — rejoindre est gratuit, **créer est Premium** (le créateur devient **leader**). Le leader invite/exclut les membres et peut transmettre son rôle (à un membre Premium uniquement). Quatre onglets : messages d'équipe, **répertoire** (le leader valide, les membres suggèrent — pochettes récupérées automatiquement via iTunes Search, repli sans pochette), **événements** (concert / répé / jam, créés par le leader, chacun avec sa **setlist** et ses suggestions à valider d'un tap) et **partitions** (PDF/image, aperçu QuickLook). Chaque événement a un bouton « Un membre lâche ? Publier un SOS » pré-rempli. Local pour l'instant, synchro serveur en phase 2b.
- **Réseaux sociaux** — chaque profil peut renseigner ses pseudos Instagram, TikTok, YouTube et X (*Modifier mon profil → Réseaux sociaux*, colonne `socials` jsonb côté serveur) ; ils s'affichent avec les **logos des plateformes** (dessinés en SwiftUI, aucun asset de marque embarqué), cliquables vers le profil externe.
- **Pages profil façon Instagram** — photo + stats (démos, abonnés, concerts) en tête, nom/@pseudo/niveau/bio/genres/logos sociaux, boutons Suivre / Contacter / favori, et la **grille de démos** en bas. L'accueil est allégé : rangées compactes (avatar, nom, dispo) séparées de la page profil, avec rappel du prochain événement de groupe.
- **Favoris** — liste dédiée dans le profil pour retrouver ses musiciens fiables en un tap.
- **Profil** — carte hero avec photo, compteurs abonnés/suivis, calendrier de dispo (statut 🚨/📅/🌙 dérivé des dates cochées), vidéos de démo, teaser « qui a vu ton profil » (avatars floutés → paywall), langue & région, thème clair/sombre, édition complète.
- **Monétisation** — abonnements **Dispo Premium mensuel et annuel** via StoreKit 2 : alertes dépannage 30 min avant tout le monde, profil en tête, **groupes illimités**, 6 vidéos de démo, tri/affichage du niveau et visiteurs du profil. Les prix sont chargés directement depuis l’App Store, avec achat, restauration et gestion des abonnements.

## Prix & marge (calcul v0.7)

**Coûts fixes mensuels** (indépendants du nombre d'utilisateurs) :

| Poste | CHF/mois |
|---|---|
| Supabase Pro | ~22 |
| Apple Developer Program (99 $/an) | ~8 |
| SMTP (Resend) + domaine | ~7 |
| **Total fixe** | **~37** |

**Coût variable par abonné actif** : stockage vidéos (6 × ~50 Mo) + egress + push ≈ **CHF 0.30–0.50/mois**. Commission Apple : **15 %** (App Store Small Business Program, < 1 M$ de CA).

**Marge par abonné** :

| Plan | Prix | Net après Apple | Coût/an | Marge |
|---|---|---|---|---|
| Annuel CHF 79 | 79.00 | 67.15 | ~5 | **~92 %** |
| Mensuel CHF 9.90 | 118.80/an | 100.98 | ~5 | **~95 %** |

**Point mort** : ~7 abonnés annuels couvrent les coûts fixes. À 100 abonnés (mix 70 % annuel) : ~CHF 6 700/an net, coûts ~CHF 950 → **~85 % de marge nette**.

**Stratégie de conversion** : un seul niveau Premium (un menu de formules tue la conversion), deux périodicités. Le mensuel à 9.90 sert d'**ancre** : l'annuel paraît imbattable (−33 %, « un seul cachet rembourse l'année »). Essai 7 jours sans friction, et le paywall est alimenté par des verrous *visibles* dans l'app (SOS en avant-première, niveau masqué, 1 vidéo, groupes).

Les données sont fictives et rechargeables : *Profil → Réinitialiser la démo*.

## Installer sur votre iPhone

1. Ouvrez `Dispo.xcodeproj` dans Xcode.
2. Cliquez sur le projet **Dispo** (barre latérale) → cible **Dispo** → onglet **Signing & Capabilities** → **Team** : choisissez votre Apple ID (équipe personnelle « Ludovic Marie »). Si absent : Xcode → Settings → Accounts → « + » pour ajouter votre Apple ID.
3. Branchez votre iPhone en USB (ou Wi-Fi une fois appairé) et sélectionnez-le comme destination en haut de la fenêtre.
4. Appuyez sur **▶ Run**.
5. Sur l'iPhone, à la première installation :
   - **Réglages → Général → VPN et gestion de l'appareil** → faites confiance à votre certificat de développeur ;
   - activez le **Mode développeur** si iOS le demande (Réglages → Confidentialité et sécurité → Mode développeur), l'iPhone redémarre.

> ⚠️ Avec un compte Apple gratuit, l'app expire après **7 jours** — il suffit de relancer ▶ depuis Xcode pour la renouveler. Pour la distribuer à Raphaël ou à des testeurs via **TestFlight**, il faudra l'Apple Developer Program (99 $/an).

## Rebuilder le projet après modification des fichiers

Le `.xcodeproj` est généré par [XcodeGen](https://github.com/yonaskolb/XcodeGen) depuis `project.yml`. Si vous ajoutez/supprimez des fichiers Swift :

```bash
cd Dispo && xcodegen generate
```

## Prochaines étapes (phase 2b — à discuter avec Raphaël)

1. ~~Backend Supabase~~ ✅ fait (auth e-mail, profils, SOS, messagerie temps réel, RLS Premium).
2. ~~Projet Supabase hébergé~~ ✅ fait (`dispo`, Zurich) — reste : SMTP custom (Resend) pour les e-mails de connexion.
3. **Vidéo réelle** : enregistrement in-app, upload Supabase Storage ou Mux (~5 $/1000 min).
4. ~~Notifications~~ ✅ notifications locales faites (SOS compatibles + messages) — reste : **push serveur APNs** (« un SOS piano à 2 km, cachet CHF 150 »), le cœur de la promesse Premium, dès le Developer Program.
5. ~~**StoreKit 2** : brancher le paywall sur de vrais abonnements App Store.~~ ✅ fait côté client — reste la validation serveur des transactions et la configuration des produits dans App Store Connect.
5b. **Groupes serveur** : tables Supabase (groupes, membres, messages temps réel, Storage pour les partitions).
6. **Géolocalisation réelle** (aujourd'hui : position fixée au centre de Genève) et synchronisation serveur des favoris, appréciations, follows, photo et vidéos.
7. **TestFlight** pour les 20–30 premiers musiciens genevois (AMR, Conservatoire, Chat Noir…).
