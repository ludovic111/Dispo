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
            version: "2.3",
            title: "Tes échanges, vraiment sous contrôle",
            points: [
                "Un appui long permet de réagir, modifier ton texte ou supprimer ton message pour tout le monde",
                "Photos, vidéos et fichiers envoyés peuvent aussi être supprimés, avec nettoyage sécurisé du stockage",
                "Aujourd'hui, Hier et la date complète séparent clairement chaque journée de discussion",
                "Les messages modifiés sont signalés discrètement et les suppressions restent synchronisées en direct",
                "Le mode sombre est maintenant le choix par défaut, sans écraser ta préférence existante",
                "La messagerie charge un historique borné, évite les notifications en double et ne mélange plus les caches entre comptes"
            ]
        ),
        PatchNote(
            version: "2.2",
            title: "Ton répertoire et tes alertes, enfin complets",
            points: [
                "Ajoute la tonalité avec un morceau, modifie-la ensuite et retrouve-la juste à côté du titre",
                "Modifie le titre et l'artiste d'un morceau déjà présent, y compris dans ses setlists",
                "Concerts, répétitions et jams ont des couleurs distinctes, discrètes et cohérentes",
                "Les dates terminées quittent l'agenda et rejoignent un historique avec morceaux et présences",
                "Envoie des photos et des vidéos compressées dans les conversations privées et de groupe",
                "La cloche dans l'app et la puce de l'icône affichent le nombre exact de notifications non lues",
                "Les anciens comptes de démonstration ont été supprimés définitivement"
            ]
        ),
        PatchNote(
            version: "2.1",
            title: "Tout se comprend d'un coup d'œil",
            points: [
                "Nouveau logo Dispo, cohérent avec l'identité bleu nuit et cyan",
                "Le pays est détecté automatiquement : entre ton code postal et la ville se remplit toute seule",
                "Le même parcours de lieu s'applique au profil, aux séjours, aux SOS, aux filtres et aux événements",
                "Les filtres instruments, styles et niveaux acceptent plusieurs choix à la fois",
                "Concert, répétition et jam ont chacun un symbole clair et identique dans toute l'app",
                "La tonalité est visible directement sur chaque tuile de morceau",
                "Les actions, sélections, informations neutres et alertes utilisent enfin des couleurs au rôle constant"
            ]
        ),
        PatchNote(
            version: "2.0",
            title: "Plus simple, plus clair",
            points: [
                "Mes groupes montre maintenant tous les groupes dont tu fais partie, pas seulement ceux que tu diriges",
                "Sur l'accueil, chaque groupe se résume à son nom et à la date de sa prochaine session",
                "Pour agir sur un groupe, ouvre-le : l'accueil ne duplique plus ses commandes",
                "iReal Pro va droit au but : saisis un titre et lance la recherche",
                "Les petites phrases sous Aujourd'hui, Ce week-end et Près de chez toi ont disparu",
                "La nouvelle palette bleu nuit et cyan s'applique sans déplacer les écrans ni changer les polices",
                "Plusieurs libellés conditionnels sont désormais bien traduits dans les 7 langues"
            ]
        ),
        PatchNote(
            version: "1.9",
            title: "Nocturne, groupes et partitions",
            points: [
                "L'accueil affiche une seule tuile par groupe, avec sa prochaine session directement dedans",
                "Dans Sessions, un tap ouvre la date précise — plus l'écran entier du groupe",
                "Les conversations privées et de groupe acceptent maintenant partitions et fichiers jusqu'à 20 Mo",
                "iReal Pro recherche dans ta bibliothèque, importe et exporte ses vrais fichiers .html",
                "Une grille iReal Pro supprimée ne réapparaît plus automatiquement",
                "La nouvelle identité Nocturne & Brass mêle fond profond, or musical et cyan électrique"
            ]
        ),
        PatchNote(
            version: "1.8",
            title: "Tes groupes, sans perdre le fil",
            points: [
                "Une grille créée dans Dispo s'exporte au vrai format iReal Pro : valide l'import et elle rejoint ta bibliothèque",
                "Les leaders Premium pilotent leurs groupes depuis l'accueil : prochaine session, membres et création de date",
                "Une seule prochaine session s'affiche sur l'accueil — la plus proche, tous tes groupes confondus",
                "La puce SOS ne compte plus tes propres annonces : seulement les nouveaux SOS qui correspondent à ton instrument et ton niveau",
                "Le leader peut annuler une session ou les dates à venir d'une série, et tous les membres sont prévenus"
            ]
        ),
        PatchNote(
            version: "1.7",
            title: "Chaque chose à sa place",
            points: [
                "L'onglet Agenda s'appelle maintenant Sessions — et il réunit TOUT ce que tu joues",
                "« Je joue » quitte l'onglet SOS : les dépannages qu'on te demande se répondent dans Sessions",
                "L'onglet SOS ne garde que deux espaces : « SOS » (ceux des autres) et « Mes SOS » (les tiens)",
                "Le fil ne montre plus tes propres annonces ni celles dont tous les postes sont pris",
                "Accueil : « Ce soir » devient « Aujourd'hui » — c'est la journée entière qui compte, pas la soirée",
                "Accueil épuré : l'encart « Dispos pour… » s'en va, les musiciens dispos apparaissent là où il manque quelqu'un, dans l'événement",
                "Tu peux enfin changer l'heure d'une date déjà créée — même une répétition qui se répète",
                "Sur une série : cette date seulement, ou toutes les suivantes. Une seule notification part, jamais cinquante",
                "Si le jour change, les présences sont redemandées : « dispo jeudi » ne veut pas dire « dispo samedi »",
                "iReal Pro devient la façon normale de travailler un morceau, et sa fiche s'organise autour de lui",
                "Les liens iReal Pro qui ne s'ouvraient pas sont réparés : tonalité, accords et structure suivent enfin la spec officielle",
                "Le leader peut supprimer une grille d'accords remplie, et le lien iReal Pro, séparément",
                "Une grille peut toujours s'écrire à la main — c'est juste rangé à part",
                "Les partitions PDF et photo ne bougent pas : elles restent sous leur morceau"
            ]
        ),
        PatchNote(
            version: "1.6",
            title: "Mes événements, et des SOS qui te parlent",
            points: [
                "La carte laisse sa place à « Mes événements » : toutes tes dates au même endroit, mois par mois",
                "Ce qui attend ta réponse passe en tête — tu réponds dispo ou indispo sans quitter l'agenda",
                "Ta prochaine date s'affiche en grand, avec le compte à rebours et l'état du line-up",
                "L'onglet Agenda porte une pastille tant qu'un de tes groupes attend ta réponse",
                "Les dates déjà jouées se rangent dans « Passés » : douze mois d'historique",
                "Le fil des SOS ne te montre plus que ce qui te correspond — ton instrument, ton niveau",
                "À la publication d'un SOS, tu choisis un ou plusieurs niveaux (ou « peu importe »)",
                "Une pastille marque les annonces que tu n'as pas encore ouvertes",
                "Une annonce dont tous les postes sont pourvus disparaît du fil des autres",
                "Un lieu se saisit au code postal : la ville se trouve toute seule",
                "Quelques musiciens d'exemple reviennent dans le réseau, avec photo et badge « Démo »",
                "iReal Pro expliqué en clair — ce que c'est, ce que Dispo envoie, et ce qu'il se passe sans l'app",
                "Le leader peut supprimer la grille iReal Pro d'un morceau",
                "Le niveau « Professionnel » s'écrit désormais « Pro », partout"
            ]
        ),
        PatchNote(
            version: "1.5",
            title: "Le SOS devient une vraie machine",
            points: [
                "Accueil : « Ce soir », « Ce week-end », « Près de chez toi » — on répond d'abord à qui peut jouer, et quand",
                "Fini les « suggestions pour toi » : l'accueil parle de dispos, pas d'un algorithme",
                "Le prochain événement de CHACUN de tes groupes s'affiche en haut de l'accueil",
                "Un événement dont tout le monde est là passe au vert : line-up complet",
                "Un événement à qui il manque du monde passe au rouge dès que la date limite de réponse est dépassée",
                "L'onglet SOS a désormais trois espaces : les annonces, ce que tu organises, ce que tu joues",
                "Tu organises un SOS ? Accepte ou écarte chaque candidat d'un tap, poste par poste — sans quitter la page",
                "Le musicien retenu est prévenu tout de suite, les autres aussi : plus un seul message à écrire",
                "Tu t'es trompé·e ? Libère le poste : l'annonce se rouvre et le candidat repasse en attente",
                "« Demander un dépannage » n'envoie plus un message : c'est une vraie demande, acceptée ou refusée d'un tap",
                "« Je joue » réunit toutes tes prochaines dates : dépannages acceptés et concerts de tes groupes",
                "Le remplaçant trouvé pour un concert apparaît dans CE concert, avec le badge Invité — il n'entre pas dans le groupe",
                "Le leader gère les candidats de son SOS directement depuis l'événement du groupe",
                "Une pastille sur l'onglet SOS compte ce qui t'attend : candidats à trancher et demandes à répondre",
                "Messages non lus : une puce sur la conversation et un compteur sur l'onglet — fini les messages ratés",
                "iReal Pro : la grille du groupe s'ouvre directement dans l'app, transposée dans ta tonalité, sans rien coller"
            ]
        ),
        PatchNote(
            version: "1.4",
            title: "Notifications calmées & répertoire rangé",
            points: [
                "Créer une répétition récurrente n'envoie plus qu'UNE notification, pas une par date",
                "Une série va au maximum jusqu'à un an — 52 semaines, 26 quinzaines ou 12 mois",
                "Countdown de présence : tu vois le temps qu'il te reste pour dire si tu viens",
                "« Prochain événement » en haut de l'accueil, avec le compte à rebours jusqu'au concert",
                "Les partitions ne sont plus un onglet à part : elles vivent sous leur morceau, dans le répertoire",
                "Trois petits points sur chaque morceau — un coup d'œil suffit à voir qu'il y a une fiche",
                "Le lien iReal Pro s'ajoute et s'ouvre directement depuis la grille, et la grille se copie d'un tap",
                "Saxophone alto et saxophone ténor deviennent des instruments à part entière, transposés comme il faut",
                "Les instruments ressortent enfin dans l'accueil, avec le niveau sur chaque pastille",
                "Recherche dans le répertoire dès qu'un groupe dépasse huit morceaux",
                "Remplacement automatique : niveau « peu importe » ou « identique à l'absent », rien de plus à régler",
                "Nouveau réglage de position : ne pas apparaître sur la carte du tout",
                "Les étoiles ne s'ouvrent qu'après avoir déclaré que vous avez joué ensemble",
                "Ta photo de profil part enfin sur le serveur — et les anciennes sont rattrapées toutes seules",
                "Liens d'écoute plus fiables : Spotify, YouTube Music et Deezer résistent aux quotas",
                "Boutons de sortie ajoutés là où il n'y en avait pas (vidéos, partitions, fiches ouvertes en feuille)"
            ]
        ),
        PatchNote(
            version: "1.3",
            title: "Bêta — répétitions, remplacements et pros",
            points: [
                "Version bêta : tout est ouvert, aucun abonnement n'est vendu et rien ne sera débité",
                "Événements récurrents : crée une répétition hebdomadaire d'un coup — les dates qui reviennent ont leur propre couleur",
                "Choisis quand le groupe est prévenu : 2 jours avant par défaut, ou le délai que tu veux",
                "Un membre se déclare indisponible ? Tu es prévenu·e tout de suite — et si tu l'actives, un SOS part tout seul pour son poste, au niveau que tu as choisi",
                "Membres du groupe : tape sur un membre pour ouvrir sa fiche, et vois ce que joue chacun",
                "Les étoiles sont réservées aux professionnels. Entre amateurs, on déclare simplement « on a joué ensemble »",
                "Les cachets ne s'affichent qu'entre professionnels",
                "« Je suis ailleurs » : annonce où tu es dispo (tournée, vacances) — et cherche des musiciens par ville ou par pays",
                "Les comptes d'exemple n'apparaissent plus dans le réseau des vrais utilisateurs",
                "Chaque morceau a sa fiche : tonalité, grille d'accords, partitions et commentaires",
                "La tonalité s'affiche dans la tienne — sax alto, trompette, cor : la grille est transposée toute seule",
                "Partitions rangées sous leur morceau, en PDF ou en photo, et visables par instrument",
                "Commentaires par morceau, ouverts à tout le groupe",
                "Lien iReal Pro sur un morceau : un tap et la grille s'ouvre dans l'app",
                "Vrais logos Spotify, Apple Music, YouTube Music, Instagram, TikTok, YouTube et X",
                "Toute l'app traduite dans les 7 langues, sans mélange"
            ]
        ),
        PatchNote(
            version: "1.2",
            title: "Dépannages par poste & essai gratuit",
            points: [
                "SOS par poste : choisis l'instrument que tu peux tenir, l'organisateur confirme, et le poste pourvu disparaît de l'annonce",
                "Quand tu postules, un message part tout seul à l'organisateur — plus de candidature dans le vide",
                "Essai gratuit de 7 jours pour découvrir Premium",
                "Les liens d'écoute ouvrent enfin le morceau EXACT sur Spotify, YouTube Music et Deezer (fini la simple recherche)",
                "Vrais logos des plateformes de streaming et des réseaux sociaux",
                "Premium prend sa couleur : un bleu-vert « velours de coulisses », et une palette un peu plus vivante",
                "Rôles dans le groupe : donne un instrument à chaque membre — un SOS de groupe cible alors les postes non couverts",
                "Vois les abonnés et les collaborations de chaque profil, d'un simple tap",
                "Supprime un groupe quand tu veux (leader)",
                "Vidéos de démo : donne-leur un titre dès l'ajout, et un envoi plus fiable"
            ]
        ),
        PatchNote(
            version: "1.1",
            title: "Coulisses & Laiton — nouvelle identité",
            points: [
                "Dispo change de peau : lumière de scène ambrée, laiton et papier de partition — fini le violet",
                "Les SOS sont maintenant de vrais billets de concert, perforation et talon-date compris",
                "Nouvelles typographies : les grands titres respirent l'affiche de concert, les dates et cachets l'impression billetterie",
                "Premium devient le pass backstage — même avantage, plus belle carte",
                "Nouvelle icône d'app assortie",
                "Le rouge est désormais réservé aux SOS : le reste de l'app se lit d'un coup d'œil",
                "Mode clair repensé façon papier de partition"
            ]
        ),
        PatchNote(
            version: "1.0",
            title: "Dispo 1.0 — c'est parti 🎉",
            points: [
                "Les invitations de groupe s'acceptent : personne n'entre dans un groupe sans dire oui",
                "Ton niveau se règle maintenant instrument par instrument",
                "Le cachet d'un SOS se découvre en ouvrant l'annonce — avec une option « Sans cachet »",
                "« A joué avec » sur chaque profil : vois avec qui un musicien a déjà joué, et ouvre leurs profils",
                "Le feed SOS se met à jour en temps réel — plus besoin de relancer l'app",
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

// MARK: - Les nouveautés, au premier lancement après une mise à jour

/// Ce qui s'ouvre tout seul la première fois qu'on lance une nouvelle
/// version : uniquement les nouveautés de CETTE version, annoncées comme
/// importantes. L'historique complet reste dans Réglages → Nouveautés.
///
/// Ne s'affiche jamais sur une installation neuve : quelqu'un qui découvre
/// l'app n'a pas à lire ce qui a changé depuis une version qu'il n'a pas eue.
struct WhatsNewSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var showFullHistory = false

    private var note: PatchNote? {
        PatchNote.all.first { $0.version == Bundle.main.appVersion }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                            banner
                            if let note {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(verbatim: "v\(note.version)")
                                        .font(JCFont.monoBold(12))
                                        .foregroundStyle(JC.laiton)
                                    Text(note.title)
                                        .font(JCFont.display(26))
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                JCCard {
                                    VStack(alignment: .leading, spacing: 11) {
                                        ForEach(Array(note.points.enumerated()), id: \.offset) { _, point in
                                            HStack(alignment: .top, spacing: 9) {
                                                Image(systemName: "sparkle")
                                                    .font(.system(size: 10, weight: .bold))
                                                    .foregroundStyle(JC.bronze)
                                                    .padding(.top, 3)
                                                Text(point)
                                                    .font(.callout)
                                                    .foregroundStyle(.primary.opacity(0.9))
                                                    .fixedSize(horizontal: false, vertical: true)
                                            }
                                        }
                                    }
                                }
                            }
                            Button { showFullHistory = true } label: {
                                Label("Voir tout l'historique des versions", systemImage: "clock.arrow.circlepath")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(JC.bronze)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    .padding(18)
                }
                // safeAreaInset plutôt qu'un VStack : le bouton reste sous la
                // main ET la liste se décale d'autant — sinon la dernière
                // nouveauté passe dessous et personne ne la lit.
                .safeAreaInset(edge: .bottom) {
                    Button {
                        store.markWhatsNewSeen()
                        dismiss()
                    } label: {
                        Text("J'ai lu, c'est parti")
                            .font(.subheadline.weight(.heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(JC.hero, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(JC.billetInk)
                    }
                    .buttonStyle(PressableStyle())
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 14)
                    .background(.ultraThinMaterial)
                }
            }
            .navigationTitle("Nouveautés")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showFullHistory) { PatchNotesView() }
        }
        .interactiveDismissDisabled()
        // Balayer vers le bas ou fermer autrement vaut « vu » : on ne
        // represente pas les mêmes notes au lancement suivant.
        .onDisappear { store.markWhatsNewSeen() }
    }

    private var banner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.bubble.fill")
                .font(.title3)
                .foregroundStyle(JC.signal)
            VStack(alignment: .leading, spacing: 3) {
                Text("Important — à lire")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.signal)
                Text("Cette mise à jour déplace des choses dans l'app. Une minute de lecture t'évitera de chercher.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(JC.signal.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(JC.signal.opacity(0.35), lineWidth: 1)
        )
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
                .foregroundStyle(JC.laiton)
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
        .background(JC.laiton.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(JC.laiton.opacity(0.35), lineWidth: 1)
        )
    }

    private func noteCard(_ note: PatchNote, isCurrent: Bool) -> some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(verbatim: "v\(note.version)")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(isCurrent ? JC.laiton : .secondary)
                    Text(note.title)
                        .font(.subheadline.weight(.bold))
                    Spacer(minLength: 0)
                    if isCurrent {
                        TagView(text: "Version actuelle", color: JC.laiton)
                    }
                }
                ForEach(Array(note.points.enumerated()), id: \.offset) { _, point in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "sparkle")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(JC.bronze)
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
