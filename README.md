# JamConnect 🎶

**L'app qui met en relation les musiciens pour des jams — profil vidéo + dispo temps réel + géolocalisation.**

Version 0.2 — démo autonome (sans backend) pour valider le concept en main, basée sur la réflexion menée avec Raphaël : le « BlaBlaCar de la jam », lancé sur la communauté jazz / latin jazz de Genève.

| | |
|---|---|
| **Plateforme** | iOS 17+ (SwiftUI) |
| **Statut** | Démo locale — pas de backend |
| **Bundle ID** | `com.ludovicmarie.jamconnect` |
| **Repo** | Privé |

## Structure du projet

```
JamConnect/
├── JamConnect/              # Code source SwiftUI
│   ├── Views/               # Écrans (Discovery, Events, Chat, Profil…)
│   ├── Assets.xcassets/     # Icônes, couvertures, avatars
│   ├── Models.swift         # Modèles de données
│   ├── AppStore.swift       # État global + persistance locale
│   └── SeedData.json        # Données fictives de démo
├── JamConnect.xcodeproj/    # Projet Xcode (généré)
├── project.yml              # Config XcodeGen
└── README.md
```

## Ce que contient la démo

- **Design « nuit de jazz »** — design system custom (dégradés violet → magenta → corail, cartes arrondies, couleur par genre musical), onboarding en 3 écrans qui explique le concept à la première ouverture.
- **Accueil (feed social)** — rangée « stories » des musiciens dispo ce soir, feed de cartes avec couverture vidéo, cœur favori, compteur de notes de musique reçues, pilules Filtres/Carte, bascule carte MapKit centrée sur Genève.
- **Groupes** — onglet dédié aux formations (bands) : feed de groupes avec niveau d'expérience (Débutant → Pro), notes de musique / coups de cœur, filtre par genre, rangée « Recrutent en ce moment », fiche détaillée (membres, répertoire, recrutement, appréciation interactive).
- **Fiche musicien** — hero vidéo (60–90 s, lecteur réel en phase 2), stats sociales (jams, notes, abonnés), genres avec leurs codes (standards jazz, clave latine…), répertoire, boutons favori + « Proposer une jam ».
- **Système d'appréciation positif** — après une jam, on donne une **note de musique** (« j'ai aimé ») ou une **note dorée animée** (« coup de cœur ») ; pas de note négative possible. Les profils affichent le total de notes et de coups de cœur.
- **Jams** — cartes d'événements avec bloc date coloré par genre, bannière « Lance ta jam », bouton « Je viens ! », création de votre propre jam (persistée localement).
- **Messages** — conversations avec réponse automatique scriptée (démo).
- **Profil** — carte hero avec stats, interrupteur « Dispo ce soir », badge Premium, édition (instruments, genres, niveau, bio).
- **Monétisation** — abonnement **JamConnect Premium à CHF 4.50/mois** : paywall (profil mis en avant, filtres avancés, qui a vu ton profil, badge doré), filtre par niveau verrouillé pour les non-abonnés. Paiement simulé dans la démo ; StoreKit/App Store en phase 2.

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

## Prochaines étapes (phase 2 — à discuter avec Raphaël)

1. **Backend Supabase** (gratuit au départ) : comptes avec vérification téléphone, vrais profils, messagerie temps réel.
2. **Vidéo réelle** : enregistrement in-app, upload et streaming via Mux ou Cloudflare Stream (~5 $/1000 min).
3. **Notifications push** (« un batteur dispo ce soir à 2 km »).
4. **Matching bidirectionnel** et avis post-jam réels.
5. **TestFlight** pour les 20–30 premiers musiciens genevois (AMR, Conservatoire, Chat Noir…).
