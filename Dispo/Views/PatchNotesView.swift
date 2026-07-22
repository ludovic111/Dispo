import SwiftUI

/// Une version de l'app et ses nouveautés (affichées dans « Nouveautés »).
struct PatchNote: Identifiable {
    let version: String
    let title: LocalizedStringKey
    let points: [LocalizedStringKey]
    var id: String { version }

    /// Historique des versions — la plus récente en premier. À compléter à
    /// chaque mise à jour (et penser à bumper MARKETING_VERSION).
    static let all: [PatchNote] = [
        PatchNote(
            version: "1.0",
            title: "Dispo 1.0 — c'est parti 🎉",
            points: [
                "Les partitions du groupe sont maintenant partagées : chaque membre peut les ouvrir, les télécharger et en ajouter",
                "Le leader peut renommer son groupe à tout moment",
                "« Écouter sur… » : les liens ouvrent vraiment Apple Music, Spotify, YouTube Music et Deezer — avec leurs logos",
                "Vidéos de démo plus légères à l'envoi, sans toucher au son ni sacrifier l'image",
                "Ta ville s'affiche désormais correctement sur ta fiche chez les autres",
                "Ta photo de profil te suit sur un nouvel appareil",
                "Le bouton « Lier mon compte Apple » apparaît maintenant sur TestFlight et l'App Store",
                "Corrections et finitions dans toute l'app"
            ]
        ),
        PatchNote(
            version: "0.9.6",
            title: "Carte, position maîtrisée & groupes publics",
            points: [
                "Nouvel onglet Carte : les musiciens autour de toi, plein écran",
                "Ta position est approximative (niveau ville) par défaut — partage exact possible, pour tes amis ou pour tous, dans les réglages",
                "Rayon de recherche au curseur (5 à 100 km) et filtre par date précise de dispo",
                "Accueil et messages allégés : suggestions de musiciens à suivre, conversations et groupes séparés",
                "Ouvre le profil d'un musicien d'un tap depuis la conversation",
                "SOS : moyen de versement du cachet (Twint, virement, espèces, Cash App ou autre) et carte du lieu",
                "Vidéos de démo : titre, miniatures et son même en mode silencieux",
                "Écoute chaque morceau du répertoire sur Apple Music, Spotify, YouTube Music ou Deezer (bouton casque)",
                "Lie ton compte Apple dans les réglages : reconnexion en un tap, sans mot de passe",
                "Groupes : photo de groupe et option « groupe public » affichée sur vos profils",
                "Le changement d'apparence (clair / sombre) s'applique instantanément",
                "Corrigé : le remplacement de la photo de profil échouait"
            ]
        ),
        PatchNote(
            version: "0.9.5",
            title: "Notes, vidéos & conversations vivantes",
            points: [
                "Note les musiciens avec qui tu as joué : 1 à 5 étoiles, note anonyme — seule la moyenne et le nombre d'avis s'affichent",
                "Tes vidéos de démo sont maintenant en ligne : les autres musiciens les regardent depuis ton profil",
                "Ta photo de profil est visible par les autres musiciens",
                "Ton profil s'affiche comme les autres le voient, avec un bouton pour le modifier",
                "Nouveaux réglages rangés par catégories : compte, notifications, préférences, abonnement, aide",
                "Coches « reçu / lu » sous tes messages et « en train d'écrire… », comme sur WhatsApp"
            ]
        ),
        PatchNote(
            version: "0.9.4",
            title: "Autour de toi, pour de vrai",
            points: [
                "Géolocalisation réelle : le rayon de recherche et les distances s'appuient sur ta vraie position (arrondie à ~1 km, jamais ton adresse exacte)",
                "Les profils sans géoloc restent visibles — simplement sans distance affichée",
                "Abonnements Premium gérés par RevenueCat et validés côté serveur : ton statut te suit sur tous tes appareils",
                "Notification push quand un message arrive dans un de tes groupes"
            ]
        ),
        PatchNote(
            version: "0.9.3",
            title: "Vrai réseau, vraies données",
            points: [
                "Badge « Démo » partout — matchs SOS, groupes et invitations : aucun compte d'exemple ne se confond avec un vrai musicien",
                "Statistiques de profil honnêtes : notes, abonnés et collabs réels, plus aucun chiffre inventé",
                "Publication des SOS réparée côté serveur, adhésion aux groupes durcie",
                "Statut Premium des membres lu depuis le serveur (transfert de leadership fiable)"
            ]
        ),
        PatchNote(
            version: "0.9.2",
            title: "Plus claire, plus réactive",
            points: [
                "Notifications push pour les messages, SOS compatibles et événements de groupe",
                "Réglages de notifications détaillés et raccourcis vers les bons écrans",
                "Accueil et cartes de musiciens allégés pour trouver l'essentiel plus vite",
                "Corrections de stabilité et synchronisation Supabase renforcée"
            ]
        ),
        PatchNote(
            version: "0.9.1",
            title: "Réseau réel et sécurité",
            points: [
                "Profils réels et comptes de démonstration clairement distingués",
                "Follows, favoris et collaborations synchronisés sur le réseau",
                "Signalement, blocage et suppression définitive du compte",
                "Abonnements Premium sécurisés par StoreKit et restaurables"
            ]
        ),
        PatchNote(
            version: "0.9.0",
            title: "Noyau fixe, présence & invitations",
            points: [
                "Membres Permanent ou Occasionnel — le leader bascule d'un tap",
                "Confirmation de présence (Dispo / Indispo) sur chaque événement",
                "Rappel automatique pour confirmer, alerte leader 2 jours avant si indispo",
                "Sur l'accueil : inviter en un tap les musiciens déjà dispo ce jour-là",
                "Groupes, membres et présence synchronisés sur Supabase"
            ]
        ),
        PatchNote(
            version: "0.8.0",
            title: "Vrais groupes, profils façon Insta & invitations",
            points: [
                "Les groupes deviennent de vrais groupes : leader (Premium), invitations, exclusions, leadership transférable",
                "Répertoire validé par le leader — pochettes des morceaux récupérées automatiquement",
                "Événements (concert, répé, jam) avec setlist et suggestions à valider d'un tap",
                "Bouton « Inviter » sur chaque match SOS — message pré-rempli envoyé direct",
                "Pages profil repensées façon Instagram, avec les vrais logos des réseaux sociaux",
                "Accueil allégé : rangées compactes, rappel du prochain événement de groupe"
            ]
        ),
        PatchNote(
            version: "0.7.0",
            title: "Groupes, réseaux sociaux & grand ménage",
            points: [
                "Groupes (Premium) : messages d'équipe, partitions partagées, agenda des concerts",
                "Un membre lâche ? SOS pré-rempli depuis le concert du groupe",
                "Tes liens Instagram, TikTok, YouTube et X cliquables sur ton profil",
                "Nouvel écran profil : réglages regroupés et liste de favoris",
                "Abonnements Premium gérés et tarifés par l'App Store"
            ]
        ),
        PatchNote(
            version: "0.6.1",
            title: "Recherche plus futée",
            points: [
                "Tout le monde est trouvable — même sans géoloc, sans instruments ou indisponible",
                "Recherche approximative : fautes de frappe et bouts de nom tolérés (« marco » suffit, sans @)",
                "S'il n'y a pas de résultat exact, les résultats proches s'affichent quand même"
            ]
        ),
        PatchNote(
            version: "0.6.0",
            title: "Recherche, @pseudos & vidéos datées",
            points: [
                "Recherche libre : « pianiste Carouge », « salsa ce soir », un nom, un @pseudo…",
                "Un @pseudo pour chaque musicien, visible sur les profils",
                "Nombre d'abonnés affiché sur chaque profil et dans la recherche",
                "Ajoute une date à tes vidéos de démo"
            ]
        ),
        PatchNote(
            version: "0.5.0",
            title: "Lieux précis, genres & instruments",
            points: [
                "14 pays et plus de 300 villes avec code postal",
                "Recherche de ville par nom ou code postal",
                "42 genres musicaux rangés en 9 familles (sous-genres inclus)",
                "33 instruments triés par catégories (claviers, cordes, vents…)"
            ]
        ),
        PatchNote(
            version: "0.4.0",
            title: "Matching, réseau & langues",
            points: [
                "Matching des SOS : les musiciens compatibles s'affichent dès la publication",
                "Amis & abonnés — tes relations remontent en premier",
                "Tri par niveau et niveau visible (Premium)",
                "Photo de profil et vidéos de démo (1 gratuite, 6 en Premium)",
                "App en 7 langues + choix du pays et de la ville",
                "Nouvel onboarding, notifications et patchnotes"
            ]
        ),
        PatchNote(
            version: "0.3.0",
            title: "Dépannage d'abord",
            points: [
                "Recentrage 100 % dépannage concert — l'onglet Groupes s'en va",
                "Dispo par vraies dates cochées au calendrier",
                "Avant-première Premium visible (SOS verrouillés 30 min)",
                "Compte e-mail + mot de passe, serveur en Suisse"
            ]
        ),
        PatchNote(
            version: "0.2.0",
            title: "La démo vivante",
            points: [
                "20 musiciens genevois, annonces et conversations de démo",
                "Design « nuit de jazz », mode clair / sombre",
                "Appréciations positives : notes de musique et notes dorées"
            ]
        ),
        PatchNote(
            version: "0.1.0",
            title: "Premier prototype",
            points: [
                "Feed de musiciens, profils et carte de Genève",
                "Premières annonces SOS"
            ]
        )
    ]
}

extension Bundle {
    /// Version marketing de l'app (ex. « 0.4.0 »).
    var appVersion: String {
        (infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0.0"
    }
}

/// Historique des mises à jour, avec bandeau de contact. Ouvert depuis le
/// profil.
struct PatchNotesView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        feedbackBanner
                        ForEach(PatchNote.all) { note in
                            noteCard(note, isCurrent: note.version == Bundle.main.appVersion)
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Nouveautés")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
        }
    }

    private var feedbackBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "heart.fill")
                .font(.title3)
                .foregroundStyle(JC.coral)
            VStack(alignment: .leading, spacing: 2) {
                Text("Merci d'utiliser Dispo !")
                    .font(.subheadline.weight(.heavy))
                Text("Un pépin, une idée ? Écris-nous via l'assistance dispoapp.net.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(JC.coral.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(JC.coral.opacity(0.35), lineWidth: 1)
        )
    }

    private func noteCard(_ note: PatchNote, isCurrent: Bool) -> some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(verbatim: "v\(note.version)")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(isCurrent ? JC.coral : .secondary)
                    Text(note.title)
                        .font(.subheadline.weight(.bold))
                    Spacer(minLength: 0)
                    if isCurrent {
                        TagView(text: "Version actuelle", color: JC.coral)
                    }
                }
                ForEach(Array(note.points.enumerated()), id: \.offset) { _, point in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "sparkle")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(JC.violet)
                            .padding(.top, 4)
                        Text(point)
                            .font(.caption)
                            .foregroundStyle(.primary.opacity(0.85))
                    }
                }
            }
        }
    }
}
