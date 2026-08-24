import SwiftUI

@main
struct DispoApp: App {
    @UIApplicationDelegateAdaptor(DispoAppDelegate.self) private var appDelegate
    @StateObject private var store = AppStore()

    init() {
        JC.configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                // Langue choisie dans l'app : les Text localisés suivent la
                // locale d'environnement ; le .id force le re-rendu complet.
                // (L'apparence clair/sombre est appliquée au niveau UIWindow
                // par AppStore.applyThemeToWindows — instantané partout,
                // feuilles comprises.)
                .environment(\.locale, store.language.locale)
                .id(store.language)
                .tint(JC.laiton)
                .onOpenURL { url in
                    // Lien magique de connexion (dispo://login-callback).
                    Task { await store.handleAuthCallback(url) }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var scenePhase
    #if DEBUG
    /// Écran profond présenté par la route de capture (outillage screenshots).
    @State private var debugCover: DebugScreenshotCover?
    #endif

    var body: some View {
        ZStack {
            TabView(selection: $store.selectedTab) {
                HomeView()
                    .tabItem { Label("Accueil", systemImage: "house.fill") }
                    .tag(AppTab.home)
                MyEventsView()
                    .tabItem { Label("Sessions", systemImage: "calendar") }
                    // Tout ce qui attend une réponse de ma part : les dates de
                    // groupe non confirmées et les dépannages qu'on me demande.
                    .badge(store.sessionsTodoCount)
                    .tag(AppTab.agenda)
                EventsView()
                    .tabItem { Label("SOS", systemImage: "bolt.fill") }
                    // Seulement les SOS externes, compatibles avec mon profil
                    // et jamais ouverts. Mes propres annonces ne gonflent pas
                    // une puce censée m'alerter.
                    .badge(store.sosTodoCount)
                    .tag(AppTab.sos)
                ChatListView()
                    .tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right") }
                    // Messages reçus et pas encore ouverts (1:1 + groupes).
                    .badge(store.totalUnread)
                    .tag(AppTab.messages)
                MyProfileView()
                    .tabItem { Label("Profil", systemImage: "person.crop.circle") }
                    .tag(AppTab.profile)
            }
            .toolbarBackground(.ultraThinMaterial, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
            .sheet(isPresented: $store.showPaywall) { PaywallView() }

            // Connexion obligatoire dès qu'un backend est configuré.
            if store.backend != nil && !store.isLive {
                if store.sessionChecked {
                    AuthGateView()
                        .transition(.opacity)
                        .zIndex(0.5)
                } else {
                    ZStack {
                        JCBackground()
                        VStack(spacing: 16) {
                            LogoView(markSize: 40)
                            ProgressView()
                        }
                    }
                    .zIndex(0.5)
                }
            }

            if !store.hasOnboarded {
                OnboardingView()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(1)
            }

            // Bannière d'erreur backend, discrète et fermable.
            if let error = store.backendError {
                VStack {
                    HStack(spacing: 10) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.subheadline.weight(.bold))
                        Text(error)
                            .font(.caption.weight(.semibold))
                        Spacer(minLength: 0)
                        Button {
                            store.backendError = nil
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption.weight(.bold))
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(JC.signal, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 18)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(2)
            }
        }
        // Les nouveautés de la version, une seule fois après la mise à jour.
        // Posée sur le ZStack et non sur la TabView : deux `.sheet` sur la
        // même vue se marchent dessus (le paywall vit sur la TabView).
        // Jamais par-dessus l'onboarding ni l'écran de connexion.
        .sheet(
            isPresented: Binding(
                get: {
                    store.showWhatsNew
                        && store.hasOnboarded
                        && (store.backend == nil || store.isLive)
                },
                set: { if !$0 { store.markWhatsNewSeen() } }
            )
        ) {
            WhatsNewSheet()
        }
        .animation(.snappy(duration: 0.4), value: store.hasOnboarded)
        .animation(.snappy(duration: 0.3), value: store.backendError)
        .animation(.snappy(duration: 0.35), value: store.liveUserID)
        .animation(.snappy(duration: 0.35), value: store.sessionChecked)
        .onAppear { store.applyThemeToWindows() }
        .onChange(of: scenePhase) { _, phase in
            // Retour au premier plan : ré-applique le thème aux fenêtres
            // (re)créées et rafraîchit position + données pour rester
            // trouvable dans les recherches.
            guard phase == .active else { return }
            store.applyThemeToWindows()
            store.appBecameActive()
        }
        #if DEBUG
        .task { await applyScreenshotRoute() }
        .fullScreenCover(item: $debugCover) { cover in
            NavigationStack {
                switch cover {
                case .chat(let id): ChatView(conversationID: id)
                case .musician(let musician): MusicianDetailView(musician: musician)
                case .search(let query): SearchView(initialQuery: query)
                case .matching(let gig): SOSMatchView(gig: gig) {}
                case .settings: SettingsSheet()
                case .filters: DebugFilterPreview()
                case .songs: DebugSongRowsPreview()
                case .songDetail(let groupID, let songID):
                    SongDetailSheet(groupID: groupID, songID: songID)
                }
            }
        }
        #endif
    }

    #if DEBUG
    /// Route de capture d'écran (`-screenshotRoute chat`…) — builds Debug
    /// uniquement : outille les captures App Store sans interaction manuelle.
    enum DebugScreenshotCover: Identifiable {
        case chat(Conversation.ID)
        case musician(Musician)
        case search(String)
        case matching(GigRequest)
        case settings
        case filters
        case songs
        case songDetail(GroupChat.ID, Song.ID)
        var id: String {
            switch self {
            case .chat: return "chat"
            case .musician: return "musician"
            case .search: return "search"
            case .matching: return "matching"
            case .settings: return "settings"
            case .filters: return "filters"
            case .songs: return "songs"
            case .songDetail: return "song-detail"
            }
        }
    }

    private func applyScreenshotRoute() async {
        guard let route = UserDefaults.standard.string(forKey: "screenshotRoute") else { return }
        // Laisse la démo se charger et la TabView se poser.
        try? await Task.sleep(for: .milliseconds(800))
        switch route {
        case "home-leader":
            // État déterministe pour relire le cockpit Premium sans compte
            // serveur ni gestes automatisés dans le simulateur.
            if !store.groups.contains(where: { $0.name == "Blue Notes QA" }) {
                store.createGroup(
                    name: "Blue Notes QA",
                    emoji: "🎷",
                    members: store.musicians.prefix(3).map(\.name)
                )
                if let group = store.groups.first(where: { $0.name == "Blue Notes QA" }),
                   let date = Calendar.current.date(byAdding: .day, value: 4, to: Date()) {
                    store.addEvent(
                        GroupEvent(
                            kind: .repetition,
                            title: "Répétition générale",
                            venue: "Studio QA",
                            date: date
                        ),
                        to: group
                    )
                }
            }
            if !store.groups.contains(where: { $0.name == "Les Satellites QA" }) {
                let date = Calendar.current.date(byAdding: .day, value: 8, to: Date()) ?? Date()
                store.groups.append(
                    GroupChat(
                        name: "Les Satellites QA",
                        emoji: "🛰️",
                        leaderName: "Nina Keller",
                        memberNames: ["Nina Keller"],
                        events: [
                            GroupEvent(
                                kind: .concert,
                                title: "Concert",
                                venue: "Le Groove",
                                date: date
                            )
                        ]
                    )
                )
            }
            store.selectedTab = .home
        case "agenda", "sessions": store.selectedTab = .agenda
        // Les nouveautés ne s'ouvrent qu'après une vraie mise à jour : sans
        // cette route, impossible de les relire en QA sans trafiquer les
        // préférences du simulateur.
        case "whatsnew":
            store.hasOnboarded = true
            store.showWhatsNew = true
        case "sos": store.selectedTab = .sos
        case "messages": store.selectedTab = .messages
        case "profile": store.selectedTab = .profile
        case "paywall": store.showPaywall = true
        case "chat":
            if let conversation = store.conversations.first(where: { !$0.messages.isEmpty }) {
                debugCover = .chat(conversation.id)
            }
        case "musician":
            if let musician = store.musicians.first(where: { $0.name.hasPrefix("Marco") }) ?? store.musicians.first {
                debugCover = .musician(musician)
            }
        case "search":
            debugCover = .search(UserDefaults.standard.string(forKey: "screenshotQuery") ?? "")
        case "matching":
            if let gig = store.events.first(where: { !$0.wantedInstruments.isEmpty }) {
                debugCover = .matching(gig)
            }
        case "settings":
            debugCover = .settings
        case "filters":
            debugCover = .filters
        case "songs":
            debugCover = .songs
        case "song-detail", "song-detail-solos":
            store.hasOnboarded = true
            let soloists = [
                SoloistOption(id: UUID(uuidString: "40000000-0000-0000-0000-000000000001")!, name: "Raphaël Herrera"),
                SoloistOption(id: UUID(uuidString: "40000000-0000-0000-0000-000000000002")!, name: "Léa Zbinden"),
                SoloistOption(id: UUID(uuidString: "40000000-0000-0000-0000-000000000003")!, name: "Marco Fernández")
            ]
            let song = Song(
                title: "Autumn Leaves",
                artist: "Bill Evans",
                suggestedBy: "Léa Zbinden",
                isApproved: true,
                solos: soloists.map(\.id)
            )
            let group = GroupChat(
                name: "Blue Notes QA",
                leaderName: nil,
                memberNames: soloists.map(\.name),
                rosterProfiles: soloists,
                repertoire: [song]
            )
            store.groups.removeAll { $0.id == group.id }
            store.groups.insert(group, at: 0)
            debugCover = .songDetail(group.id, song.id)
        default: break
        }
    }
    #endif
}

#if DEBUG
/// Aperçu de lignes de morceaux (capture / QA du menu d'écoute).
struct DebugSongRowsPreview: View {
    private let songs = [
        Song(title: "Oye Como Va", artist: "Santana",
             artworkURL: nil, trackURL: "https://music.apple.com/us/album/oye-como-va/1443839135",
             suggestedBy: "Marco Fernández", isApproved: true, key: "A"),
        Song(title: "Autumn Leaves", artist: "Bill Evans",
             artworkURL: nil, suggestedBy: "Léa Zbinden", isApproved: false, key: "Gm")
    ]

    var body: some View {
        ZStack {
            JCBackground()
            VStack(spacing: 16) {
                SongRow(song: songs[0], isLeader: false, onReject: {})
                SongRow(song: songs[1], isLeader: true, onApprove: {}, onReject: {})

                // Contrôle visuel des logos officiels (tracés SVG).
                JCCard {
                    VStack(spacing: 14) {
                        Text(verbatim: "Streaming")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        HStack(spacing: 16) {
                            ForEach(StreamingPlatform.allCases) { platform in
                                StreamingLogoView(platform: platform, size: 40)
                            }
                        }
                        Text(verbatim: "Réseaux sociaux")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        HStack(spacing: 16) {
                            ForEach(SocialNetwork.allCases) { network in
                                SocialLogoView(network: network, size: 40)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(18)
        }
    }
}

/// Parcours complet pour relire les multisélections et la saisie du lieu
/// sans dépendre d'un compte de test.
struct DebugFilterPreview: View {
    @State private var filters = DiscoveryFilters()

    var body: some View {
        FilterSheet(filters: $filters)
    }
}
#endif

// MARK: - Design system « Nocturne cyan »

extension Color {
    /// Couleur adaptative selon le mode clair / sombre.
    init(light: Color, dark: Color) {
        self.init(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}

extension AppTheme {
    /// Schéma de couleurs SwiftUI correspondant (nil = suit le système).
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Palette issue de la maquette Stitch fournie : bleu nuit, surfaces ardoise,
/// cyan électrique, blanc froid et gris bleuté. La typographie et la mise en
/// page existantes restent volontairement inchangées.
enum JC {
    // Fonds
    static let bg = Color(
        light: Color(red: 240 / 255, green: 244 / 255, blue: 1), // #F0F4FF
        dark: Color(red: 5 / 255, green: 8 / 255, blue: 20 / 255) // #050814
    )
    static let card = Color(
        light: .white,
        dark: Color(red: 10 / 255, green: 17 / 255, blue: 40 / 255) // #0A1128
    )
    /// Surface interne (bulles, champs, encarts posés sur une carte).
    static let inset = Color(
        light: Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255), // #E2E8F0
        dark: Color(red: 14 / 255, green: 24 / 255, blue: 53 / 255) // #0E1835
    )
    static let cardStroke = Color(
        light: Color(red: 42 / 255, green: 58 / 255, blue: 102 / 255).opacity(0.18),
        dark: Color(red: 42 / 255, green: 58 / 255, blue: 102 / 255).opacity(0.72)
    )
    /// Reflet interne des cartes — simule une légère épaisseur.
    static let cardHighlight = Color(
        light: .white.opacity(0.75),
        dark: Color(red: 240 / 255, green: 244 / 255, blue: 1).opacity(0.06)
    )
    /// Ombre portée des cartes — douce en clair, inexistante en sombre.
    static let cardShadow = Color(
        light: Color(red: 42 / 255, green: 58 / 255, blue: 102 / 255).opacity(0.14),
        dark: .clear
    )

    // Accents (plus profonds en clair pour rester lisibles sur papier)
    /// Accent principal. Le nom historique reste pour ne pas disperser un
    /// changement purement visuel dans toutes les vues.
    static let laiton = Color(
        light: Color(red: 0, green: 153 / 255, blue: 1), // #0099FF
        dark: Color(red: 0, green: 210 / 255, blue: 1) // #00D2FF
    )
    /// Accent électrique de la référence : liens, import, recherche et
    /// couronne. En clair, une version assombrie garde le contraste.
    static let electric = Color(
        light: Color(red: 0, green: 153 / 255, blue: 1),
        dark: Color(red: 0, green: 210 / 255, blue: 1) // #00D2FF
    )
    static let warmMuted = Color(red: 30 / 255, green: 41 / 255, blue: 59 / 255) // #1E293B
    /// Réservé au SOS (urgence, erreurs) — à rien d'autre.
    static let signal = Color(
        light: Color(red: 0.720, green: 0.250, blue: 0.100),
        dark: Color(red: 0.933, green: 0.416, blue: 0.235)
    )
    /// Confirmations, présence, « dispo ».
    static let feutrine = Color(
        light: Color(red: 0, green: 153 / 255, blue: 1),
        dark: Color(red: 0, green: 210 / 255, blue: 1)
    )
    /// Secondaire discret (badges neutres, chips de genre, méta).
    static let bronze = Color(
        light: Color(red: 71 / 255, green: 85 / 255, blue: 105 / 255), // #475569
        dark: Color(red: 142 / 255, green: 154 / 255, blue: 175 / 255) // #8E9AAF
    )

    // Noms sémantiques à utiliser dans les nouveaux composants. Les alias
    // historiques restent compatibles mais ne dictent plus l'intention.
    static let primaryAccent = laiton
    static let secondaryText = bronze
    static let danger = signal
    static let confirmation = feutrine

    /// Codes événementiels sobres : le libellé et le symbole restent
    /// toujours présents, la couleur ne sert qu'à accélérer le balayage.
    static let eventConcert = Color(
        light: Color(red: 0.02, green: 0.45, blue: 0.82),
        dark: Color(red: 0.18, green: 0.72, blue: 1)
    )
    static let eventRehearsal = Color(
        light: Color(red: 0.38, green: 0.31, blue: 0.72),
        dark: Color(red: 0.64, green: 0.57, blue: 0.96)
    )
    static let eventJam = Color(
        light: Color(red: 0.02, green: 0.52, blue: 0.43),
        dark: Color(red: 0.22, green: 0.78, blue: 0.65)
    )

    /// Papier et encre du billet — identiques dans les deux modes,
    /// comme un vrai billet de concert.
    static let billetPaper = Color(red: 240 / 255, green: 244 / 255, blue: 1)
    static let billetInk = Color(red: 5 / 255, green: 8 / 255, blue: 20 / 255)
    // Encres d'accent imprimées sur le billet (fixes, jamais adaptatives —
    // les tokens adaptatifs s'éclairciraient en sombre sur le papier ivoire).
    static let billetSignal = Color(red: 0.700, green: 0.240, blue: 0.090)
    static let billetBronze = Color(red: 71 / 255, green: 85 / 255, blue: 105 / 255)
    static let billetFeutrine = Color(red: 0, green: 153 / 255, blue: 1)
    static let billetLaiton = Color(red: 0, green: 153 / 255, blue: 1)

    /// CTA principal cyan, texte nuit par-dessus.
    static let hero = LinearGradient(
        colors: [
            Color(red: 0, green: 210 / 255, blue: 1),
            Color(red: 0, green: 153 / 255, blue: 1)
        ],
        startPoint: .top, endPoint: .bottom
    )
    /// Rampe neutre des séries récurrentes. Les symboles et libellés portent
    /// le type ; cette surface ardoise sépare seulement routine et exception.
    static let serie = LinearGradient(
        colors: [
            Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255),
            Color(red: 142 / 255, green: 154 / 255, blue: 175 / 255)
        ],
        startPoint: .top, endPoint: .bottom
    )

    /// Talon « line-up complet » — cyan de confirmation, avec une coche dans
    /// l'interface : la couleur n'est jamais l'unique information.
    static let complet = LinearGradient(
        colors: [
            Color(red: 0, green: 210 / 255, blue: 1),
            Color(red: 0, green: 153 / 255, blue: 1)
        ],
        startPoint: .top, endPoint: .bottom
    )
    /// Talon « il manque du monde » — la date limite de réponse est passée et
    /// des postes restent vides. Terre cuite claire, de la famille du signal,
    /// mais assez lumineuse pour porter l'encre sombre du billet.
    static let alerte = LinearGradient(
        colors: [
            Color(red: 0.937, green: 0.616, blue: 0.482),
            Color(red: 0.878, green: 0.451, blue: 0.310)
        ],
        startPoint: .top, endPoint: .bottom
    )

    /// Pass backstage : cyan électrique plongé dans le bleu nuit.
    static let premium = LinearGradient(
        colors: [
            Color(red: 0, green: 210 / 255, blue: 1),
            Color(red: 0, green: 153 / 255, blue: 1),
            Color(red: 5 / 255, green: 8 / 255, blue: 20 / 255)
        ],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let premiumTint = electric

    /// Apparence globale (tab bar, navigation bar).
    static func configureAppearance() {
        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        tab.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
        UITabBar.appearance().tintColor = UIColor(red: 0, green: 210 / 255, blue: 1, alpha: 1)

        let nav = UINavigationBarAppearance()
        nav.configureWithDefaultBackground()
        nav.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
    }
}

/// Voix typographiques de la marque — Fraunces en display (l'affiche de
/// concert), Spline Sans Mono pour les cachets, dates et petits labels
/// (le billet imprimé). Le corps de texte reste en SF, natif iOS.
enum JCFont {
    static func display(_ size: CGFloat) -> Font {
        .custom("Fraunces-144ptSemiBold", size: size)
    }
    static func displayItalic(_ size: CGFloat) -> Font {
        .custom("Fraunces-144ptSemiBoldItalic", size: size)
    }
    static func mono(_ size: CGFloat) -> Font {
        .custom("SplineSansMonoRoman-Medium", size: size)
    }
    static func monoBold(_ size: CGFloat) -> Font {
        .custom("SplineSansMonoRoman-SemiBold", size: size)
    }
}

/// Fond signature : halo cyan en haut, profondeur bleu nuit au sol.
struct JCBackground: View {
    /// Profondeur du bas de scène.
    private static let braise = Color(
        light: Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255),
        dark: Color(red: 22 / 255, green: 32 / 255, blue: 61 / 255)
    )

    var body: some View {
        ZStack {
            JC.bg
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                Circle()
                    .fill(JC.electric)
                    .frame(width: w * 1.05)
                    .blur(radius: 110)
                    .opacity(0.17)
                    .position(x: w * 0.94, y: h * 0.02)
                Circle()
                    .fill(Self.braise)
                    .frame(width: w * 0.9)
                    .blur(radius: 115)
                    .opacity(0.38)
                    .position(x: w * 0.04, y: h * 0.96)
            }
            .drawingGroup()

            // Vignette légère — cadre l'écran sans alourdir le contenu.
            RadialGradient(
                colors: [.clear, JC.bg.opacity(0.45)],
                center: .center,
                startRadius: 80,
                endRadius: 520
            )
            .allowsHitTesting(false)
        }
        .ignoresSafeArea()
    }
}

extension Availability {
    var color: Color {
        switch self {
        case .tonight: return JC.feutrine
        case .thisWeek: return JC.laiton
        case .weekend: return JC.laiton
        case .onRequest: return JC.bronze
        case .unavailable: return .gray
        }
    }
}

extension GenreFamily {
    /// Un seul ton pour tous les genres : les chips restent silencieuses,
    /// le laiton est réservé à l'interactif.
    var color: Color { JC.bronze }

    /// Photo de couverture bundlée (les nouvelles familles réutilisent les
    /// visuels existants les plus proches — visuels dédiés en phase 2).
    var coverAsset: String {
        switch self {
        case .jazz: return "cover_jazz"
        case .latinWorld: return "cover_latin"
        case .classique: return "cover_classique"
        case .rockPop, .bluesCountry: return "cover_rock"
        case .soulFunk: return "cover_soul"
        case .urbain, .electro: return "cover_electro"
        case .folk: return "cover_folk"
        }
    }
}

extension Genre {
    var color: Color { family.color }

    var gradient: LinearGradient {
        LinearGradient(
            colors: [color.opacity(0.95), color.opacity(0.55), JC.bronze.opacity(0.8)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    /// Photo de couverture bundlée (images musicales libres de droit).
    var coverAsset: String { family.coverAsset }
}

/// Couverture photo d'un genre avec voile dégradé pour la lisibilité.
struct GenreCover: View {
    let genre: Genre

    var body: some View {
        GeometryReader { proxy in
            Image(genre.coverAsset)
                .resizable()
                .scaledToFill()
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()
                .overlay(
                    LinearGradient(
                        colors: [.black.opacity(0.15), .black.opacity(0.45)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .overlay(genre.color.opacity(0.18))
        }
    }
}

extension String {
    /// Hash stable entre lancements (contrairement à hashValue).
    var stableHash: Int {
        unicodeScalars.reduce(0) { $0 &* 31 &+ Int($1.value) }
    }
}

// MARK: - Composants partagés

struct AvatarView: View {
    let name: String
    var size: CGFloat = 52
    /// Photo de profil : URL hébergée (`https://…`), chemin de fichier local
    /// (`/…`, ma propre photo) ou nom d'asset bundlé (profils de démo). À
    /// défaut, pastille dégradée avec initiales.
    var photo: String? = nil

    private var colors: [Color] {
        // Variations limitées au système nuit / cyan / ardoise : les profils
        // restent distincts sans réintroduire une palette arc-en-ciel.
        let palette: [[Color]] = [
            [Color(red: 0, green: 210 / 255, blue: 1), Color(red: 0, green: 153 / 255, blue: 1)],
            [Color(red: 0, green: 153 / 255, blue: 1), Color(red: 42 / 255, green: 58 / 255, blue: 102 / 255)],
            [Color(red: 0, green: 210 / 255, blue: 1), Color(red: 14 / 255, green: 24 / 255, blue: 53 / 255)],
            [Color(red: 142 / 255, green: 154 / 255, blue: 175 / 255), Color(red: 10 / 255, green: 17 / 255, blue: 40 / 255)]
        ]
        return palette[abs(name.stableHash) % palette.count]
    }

    var body: some View {
        ZStack {
            if let photo, photo.hasPrefix("http"), let url = URL(string: photo) {
                // Photo hébergée (profil réel) — pastille d'initiales en
                // attendant le chargement.
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    placeholder
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else if let photo, photo.hasPrefix("/"),
                      let image = UIImage(contentsOfFile: photo) {
                // Ma photo, telle qu'elle est sur cet appareil.
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else if let photo, UIImage(named: photo) != nil {
                Image(photo)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
    }

    private var placeholder: some View {
        ZStack {
            Circle().fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
            Text(initials)
                .font(.system(size: size * 0.38, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: String {
        name.split(separator: " ").compactMap { $0.first.map(String.init) }.prefix(2).joined()
    }
}

/// Logo de l'app (marque + nom), utilisé sur l'accueil et l'onboarding.
struct LogoView: View {
    var markSize: CGFloat = 30
    var showWordmark: Bool = true
    /// Couleur du mot « Dispo » — adaptative par défaut, blanche sur les fonds dégradés.
    var wordmarkColor: Color = .primary

    var body: some View {
        HStack(spacing: 8) {
            Image("logo_mark")
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: markSize * 0.235, style: .continuous))
                .frame(width: markSize, height: markSize)
                .accessibilityHidden(true)
            if showWordmark {
                Text(verbatim: "dispo")
                    .font(JCFont.displayItalic(markSize * 0.72))
                    .foregroundStyle(wordmarkColor)
            }
        }
    }
}

/// Dispose ses enfants en lignes et passe à la ligne quand la largeur est
/// épuisée — pour les rangées de pastilles de taille variable (instruments,
/// dates…). Sans lui, un HStack trop plein écrase les textes à la verticale.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        let width = proposal.width ?? rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +)
            + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in computeRows(proposal: proposal, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    proposal: .unspecified
                )
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func computeRows(proposal: ProposedViewSize, subviews: Subviews) -> [Row] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [Row] = []
        var current = Row()
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if !current.indices.isEmpty && needed > maxWidth {
                rows.append(current)
                current = Row()
            }
            current.indices.append(index)
            current.width = current.indices.count == 1 ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

struct TagView: View {
    let text: LocalizedStringKey
    var color: Color = JC.bronze

    /// Beaucoup d'appels passent des valeurs dynamiques (instruments,
    /// genres…) : la chaîne devient une clé de traduction (repli : elle-même).
    init(text: String, color: Color = JC.bronze) {
        self.text = LocalizedStringKey(text)
        self.color = color
    }

    init(text: LocalizedStringKey, color: Color = JC.bronze) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.16), in: Capsule())
            .overlay(Capsule().stroke(color.opacity(0.35), lineWidth: 1))
            .foregroundStyle(color)
            // Une pastille ne se comprime jamais : quand la place manque,
            // c'est au conteneur (FlowLayout, ScrollView…) de gérer —
            // fini les textes écrasés à la verticale.
            .fixedSize()
    }
}

/// Pastille d'instrument — la donnée qu'on lit en premier quand on cherche
/// quelqu'un. Plus appuyée qu'une pastille ordinaire (icône de famille,
/// laiton, fond plein) et, quand on le connaît, le niveau collé derrière :
/// « Saxophone ténor · Avancé ».
struct InstrumentChip: View {
    let instrument: Instrument
    /// Niveau affiché à la suite (nil = pas de niveau connu, ou masqué).
    var level: Level? = nil

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: instrument.category.symbol)
                .font(.system(size: 9, weight: .black))
            Text(LocalizedStringKey(instrument.rawValue))
                .font(.caption.weight(.bold))
            if let level {
                Text(verbatim: "·")
                    .font(.caption2)
                    .foregroundStyle(JC.laiton.opacity(0.6))
                Text(LocalizedStringKey(level.label))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(JC.laiton.opacity(0.85))
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(JC.laiton.opacity(0.16), in: Capsule())
        .overlay(Capsule().stroke(JC.laiton.opacity(0.4), lineWidth: 1))
        .foregroundStyle(JC.laiton)
        .fixedSize()
    }
}

/// Badge du statut de dispo dépannage (masqué si indisponible).
struct AvailabilityBadge: View {
    let availability: Availability

    var body: some View {
        if availability.isAvailable {
            HStack(spacing: 5) {
                Image(systemName: availability.symbol)
                    .font(.system(size: 9, weight: .bold))
                Text(LocalizedStringKey(availability.badgeLabel))
                    .font(.caption2.weight(.bold))
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(availability.color.opacity(0.16), in: Capsule())
            .overlay(Capsule().stroke(availability.color.opacity(0.4), lineWidth: 1))
            .foregroundStyle(availability.color)
        }
    }
}

/// Logo d'un réseau social — le vrai tracé officiel (voir `Brand`), rendu
/// en vectoriel. Les logos monochromes (X, TikTok) suivent la couleur du
/// texte pour rester lisibles en clair comme en sombre.
struct SocialLogoView: View {
    let network: SocialNetwork
    var size: CGFloat = 28

    private var brand: Brand {
        switch network {
        case .instagram: return .instagram
        case .tiktok: return .tiktok
        case .youtube: return .youtube
        case .x: return .x
        }
    }

    var body: some View {
        BrandLogo(brand: brand, size: size)
    }
}

/// Ancien rendu maison, conservé le temps de comparer si besoin.
private struct LegacySocialLogoView: View {
    let network: SocialNetwork
    var size: CGFloat = 28

    var body: some View {
        switch network {
        case .instagram:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .fill(LinearGradient(
                        colors: [
                            Color(red: 0.99, green: 0.75, blue: 0.28),
                            Color(red: 0.93, green: 0.28, blue: 0.44),
                            Color(red: 0.51, green: 0.23, blue: 0.86)
                        ],
                        startPoint: .bottomLeading, endPoint: .topTrailing
                    ))
                RoundedRectangle(cornerRadius: size * 0.2, style: .continuous)
                    .stroke(.white, lineWidth: size * 0.065)
                    .frame(width: size * 0.62, height: size * 0.62)
                Circle()
                    .stroke(.white, lineWidth: size * 0.065)
                    .frame(width: size * 0.3, height: size * 0.3)
                Circle()
                    .fill(.white)
                    .frame(width: size * 0.09, height: size * 0.09)
                    .offset(x: size * 0.185, y: -size * 0.185)
            }
            .frame(width: size, height: size)
        case .tiktok:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .fill(.black)
                // La note signature, dédoublée en cyan / rose (effet chromatique).
                TikTokGlyph(size: size * 0.72, color: Color(red: 0.145, green: 0.957, blue: 0.933))
                    .offset(x: -size * 0.035, y: -size * 0.02)
                TikTokGlyph(size: size * 0.72, color: Color(red: 0.996, green: 0.173, blue: 0.333))
                    .offset(x: size * 0.035, y: size * 0.02)
                TikTokGlyph(size: size * 0.72, color: .white)
            }
            .frame(width: size, height: size)
        case .youtube:
            // Badge horizontal rouge + triangle blanc (proportions réelles).
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                    .fill(Color(red: 1.0, green: 0.0, blue: 0.0))
                    .frame(width: size, height: size * 0.72)
                Image(systemName: "play.fill")
                    .font(.system(size: size * 0.3, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        case .x:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .fill(.black)
                XMark()
                    .stroke(.white, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .butt))
            }
            .frame(width: size, height: size)
        }
    }
}

/// Rangée de logos sociaux cliquables d'un profil (masquée si vide).
struct SocialLogosRow: View {
    /// Pseudos par réseau (rawValue) — profil musicien ou le mien.
    let socials: [String: String]?
    var size: CGFloat = 30

    private var links: [(SocialNetwork, URL)] {
        SocialNetwork.allCases.compactMap { network in
            guard let handle = socials?[network.rawValue],
                  !handle.trimmingCharacters(in: .whitespaces).isEmpty,
                  let url = network.url(for: handle) else { return nil }
            return (network, url)
        }
    }

    var body: some View {
        if !links.isEmpty {
            HStack(spacing: 10) {
                ForEach(links, id: \.0) { network, url in
                    Link(destination: url) {
                        SocialLogoView(network: network, size: size)
                    }
                }
            }
        }
    }
}

/// Logo d'une plateforme de streaming — le vrai tracé officiel (voir
/// `Brand`). Deezer fait exception : son logo a été retiré du jeu
/// simple-icons à la demande de la marque, son symbole reste dessiné ici.
struct StreamingLogoView: View {
    let platform: StreamingPlatform
    var size: CGFloat = 34

    var body: some View {
        switch platform {
        case .appleMusic:
            BrandLogo(brand: .appleMusic, size: size)
        case .spotify:
            BrandLogo(brand: .spotify, size: size)
        case .youtubeMusic:
            BrandLogo(brand: .youtubeMusic, size: size)
        case .deezer:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                    .fill(Color(red: 0.07, green: 0.07, blue: 0.10))
                DeezerBars(size: size)
            }
            .frame(width: size, height: size)
        }
    }
}

/// Ancien rendu maison, conservé le temps de comparer si besoin.
private struct LegacyStreamingLogoView: View {
    let platform: StreamingPlatform
    var size: CGFloat = 34

    var body: some View {
        switch platform {
        case .appleMusic:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                    .fill(LinearGradient(
                        colors: [
                            Color(red: 0.99, green: 0.36, blue: 0.48),
                            Color(red: 0.94, green: 0.15, blue: 0.31)
                        ],
                        startPoint: .top, endPoint: .bottom
                    ))
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.52, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        case .spotify:
            ZStack {
                Circle().fill(Color(red: 0.12, green: 0.84, blue: 0.38))
                SpotifyWaves()
                    .stroke(.black, style: StrokeStyle(lineWidth: size * 0.085, lineCap: .round))
            }
            .frame(width: size, height: size)
        case .youtubeMusic:
            ZStack {
                Circle().fill(Color(red: 1.0, green: 0.02, blue: 0.05))
                Circle()
                    .stroke(.white, lineWidth: size * 0.06)
                    .frame(width: size * 0.62, height: size * 0.62)
                Image(systemName: "play.fill")
                    .font(.system(size: size * 0.26, weight: .bold))
                    .foregroundStyle(.white)
                    .offset(x: size * 0.02)
            }
            .frame(width: size, height: size)
        case .deezer:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                    .fill(Color(red: 0.07, green: 0.07, blue: 0.10))
                DeezerBars(size: size)
            }
            .frame(width: size, height: size)
        }
    }
}

/// Les trois ondes incurvées du logo Spotify (arcs concentriques).
private struct SpotifyWaves: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        // Centre des arcs bien sous le logo → trois ondes bombées vers le haut,
        // la plus haute la plus large — comme le vrai logo Spotify.
        let center = CGPoint(x: rect.midX, y: rect.maxY + w * 0.16)
        let waves: [(r: CGFloat, spread: Double)] = [
            (w * 0.82, 35),
            (w * 0.63, 34),
            (w * 0.46, 32)
        ]
        for wave in waves {
            path.move(to: point(on: center, radius: wave.r, angle: 270 - wave.spread))
            path.addArc(
                center: center,
                radius: wave.r,
                startAngle: .degrees(270 - wave.spread),
                endAngle: .degrees(270 + wave.spread),
                clockwise: false
            )
        }
        return path
    }

    private func point(on center: CGPoint, radius: CGFloat, angle: Double) -> CGPoint {
        CGPoint(
            x: center.x + radius * cos(angle * .pi / 180),
            y: center.y + radius * sin(angle * .pi / 180)
        )
    }
}

/// L'empilement de barres « égaliseur » du logo Deezer.
private struct DeezerBars: View {
    let size: CGFloat

    /// Nombre de barres par colonne (de gauche à droite), de bas en haut.
    private let columns = [1, 2, 3, 4]

    var body: some View {
        HStack(alignment: .bottom, spacing: size * 0.07) {
            ForEach(Array(columns.enumerated()), id: \.offset) { _, count in
                VStack(spacing: size * 0.055) {
                    ForEach(0..<count, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: size * 0.02)
                            .fill(.white)
                            .frame(width: size * 0.13, height: size * 0.055)
                    }
                }
            }
        }
        .frame(height: size * 0.42, alignment: .bottom)
    }
}

/// La note « quaver » stylisée du logo TikTok — tête ronde en bas à gauche,
/// hampe qui se recourbe vers la droite en haut.
private struct TikTokGlyph: View {
    let size: CGFloat
    let color: Color
    var body: some View {
        ZStack {
            TikTokStem()
                .stroke(color, style: StrokeStyle(lineWidth: size * 0.12, lineCap: .round, lineJoin: .round))
            Circle()
                .fill(color)
                .frame(width: size * 0.26, height: size * 0.26)
                .offset(x: -size * 0.15, y: size * 0.24)
        }
        .frame(width: size, height: size)
    }
}

private struct TikTokStem: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        var p = Path()
        p.move(to: CGPoint(x: w * 0.50, y: h * 0.76))
        p.addLine(to: CGPoint(x: w * 0.50, y: h * 0.30))
        p.addQuadCurve(
            to: CGPoint(x: w * 0.73, y: h * 0.36),
            control: CGPoint(x: w * 0.53, y: h * 0.22)
        )
        return p
    }
}

/// La croix du logo X (ex-Twitter) — deux traits droits à bouts francs.
private struct XMark: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        let i: CGFloat = 0.31
        var p = Path()
        p.move(to: CGPoint(x: w * i, y: h * i))
        p.addLine(to: CGPoint(x: w * (1 - i), y: h * (1 - i)))
        p.move(to: CGPoint(x: w * (1 - i), y: h * i))
        p.addLine(to: CGPoint(x: w * i, y: h * (1 - i)))
        return p
    }
}

/// Rangée de 5 étoiles remplies selon la moyenne (demi-étoiles comprises).
struct StarsView: View {
    let rating: Double
    var size: CGFloat = 12
    var color: Color = JC.laiton

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { index in
                Image(systemName: symbol(for: index))
                    .font(.system(size: size, weight: .semibold))
            }
        }
        .foregroundStyle(color)
    }

    private func symbol(for index: Int) -> String {
        let value = rating - Double(index - 1)
        if value >= 0.75 { return "star.fill" }
        if value >= 0.25 { return "star.leadinghalf.filled" }
        return "star"
    }
}

/// Pastille compacte « ★ 4,6 (12) » — moyenne + nombre d'avis, anonyme.
struct RatingBadge: View {
    let summary: RatingSummary

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill")
                .font(.system(size: 9, weight: .bold))
            Text(verbatim: summary.averageLabel)
                .font(.caption2.weight(.bold))
            Text(verbatim: "(\(summary.count))")
                .font(.caption2)
                .opacity(0.8)
        }
        .foregroundStyle(JC.laiton)
        .accessibilityLabel(Text(verbatim: "\(summary.averageLabel)/5 · \(summary.count)"))
    }
}

struct PremiumBadge: View {
    var body: some View {
        Label("Premium", systemImage: "crown.fill")
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(JC.premium, in: Capsule())
            .foregroundStyle(JC.billetPaper)
    }
}

/// Marque explicite des profils echantillons presents sur le reseau live.
struct DemoAccountBadge: View {
    var body: some View {
        Text("Démo")
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(JC.bronze)
            .background(JC.bronze.opacity(0.13), in: Capsule())
            .accessibilityLabel("Compte de démonstration")
    }
}

/// Style de bouton signature : léger enfoncement élastique au toucher.
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.97
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? 0.94 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.72), value: configuration.isPressed)
    }
}

/// Carte standard du design system : coins « continus », liseré fin et ombre douce.
struct JCCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(JC.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(JC.cardStroke, lineWidth: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [JC.cardHighlight, .clear],
                            startPoint: .top,
                            endPoint: .center
                        ),
                        lineWidth: 1
                    )
            )
            .shadow(color: JC.cardShadow, radius: 16, x: 0, y: 10)
    }
}

// MARK: - Billet de concert (signature SOS)

/// Forme de billet : rectangle arrondi + deux encoches punchées sur la
/// ligne de perforation, à `notchFromTrailing` points du bord droit.
/// À utiliser avec `FillStyle(eoFill: true)` pour découper les encoches.
struct TicketShape: Shape {
    var cornerRadius: CGFloat = 18
    var notchRadius: CGFloat = 7
    var notchFromTrailing: CGFloat = 74

    func path(in rect: CGRect) -> Path {
        var path = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).path(in: rect)
        let x = rect.maxX - notchFromTrailing
        path.addEllipse(in: CGRect(x: x - notchRadius, y: rect.minY - notchRadius,
                                   width: notchRadius * 2, height: notchRadius * 2))
        path.addEllipse(in: CGRect(x: x - notchRadius, y: rect.maxY - notchRadius,
                                   width: notchRadius * 2, height: notchRadius * 2))
        return path
    }
}

/// Ligne de perforation pointillée entre le billet et son talon.
struct PerforationLine: View {
    var body: some View {
        GeometryReader { geo in
            Path { path in
                path.move(to: CGPoint(x: 0.75, y: 7))
                path.addLine(to: CGPoint(x: 0.75, y: geo.size.height - 7))
            }
            .stroke(JC.billetInk.opacity(0.28), style: StrokeStyle(lineWidth: 1.5, dash: [4, 5]))
        }
        .frame(width: 1.5)
    }
}

/// Code-barres décoratif du talon — largeurs stables par annonce.
struct BarcodeStrip: View {
    let seed: Int
    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<11, id: \.self) { index in
                Rectangle()
                    .frame(width: (abs(seed) >> (index % 6)) & 1 == 1 ? 2.6 : 1.2, height: 9)
            }
        }
        .foregroundStyle(JC.billetInk.opacity(0.42))
        .accessibilityHidden(true)
    }
}

/// En-tête d'écran unifié — titre éditorial + sous-titre discret.
struct ScreenHeader: View {
    let title: LocalizedStringKey
    var subtitle: LocalizedStringKey? = nil
    var icon: String? = nil
    var iconColor: Color = JC.laiton
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if let icon {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(iconColor.opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(iconColor)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(JCFont.display(27))
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if let trailing { trailing }
        }
        .padding(.top, 8)
    }
}

/// Pilule d'action secondaire (filtres, bascule carte/liste).
struct JCPillButton: View {
    let title: LocalizedStringKey
    let icon: String
    var isActive: Bool = false
    var activeColor: Color = JC.laiton
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    isActive ? activeColor.opacity(0.2) : JC.card,
                    in: Capsule()
                )
                .overlay(Capsule().stroke(isActive ? activeColor.opacity(0.35) : JC.cardStroke, lineWidth: 1))
                .foregroundStyle(isActive ? activeColor : .primary)
        }
        .buttonStyle(PressableStyle(scale: 0.96))
    }
}

/// Bannière CTA signature (Premium, publier un SOS).
struct JCPromoBanner: View {
    let icon: String
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey
    var style: PromoStyle = .premium
    let action: () -> Void

    enum PromoStyle {
        case premium, hero
        var foreground: Color {
            switch self {
            case .premium: return JC.billetPaper  // ivoire sur le teal profond
            case .hero: return JC.billetInk        // encre sur le laiton clair
            }
        }
        var background: AnyShapeStyle {
            switch self {
            case .premium: return AnyShapeStyle(JC.premium)
            case .hero: return AnyShapeStyle(JC.hero)
            }
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(style.foreground.opacity(0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.heavy))
                    Text(subtitle)
                        .font(.caption)
                        .opacity(0.85)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .opacity(0.7)
            }
            .foregroundStyle(style.foreground)
            .padding(16)
            .background(style.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(PressableStyle())
    }
}

/// État vide soigné.
struct JCEmptyState: View {
    let icon: String
    let title: LocalizedStringKey
    let message: LocalizedStringKey
    var iconColor: Color = JC.bronze

    var body: some View {
        JCCard {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(iconColor.opacity(0.12))
                        .frame(width: 56, height: 56)
                    Image(systemName: icon)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(iconColor)
                }
                Text(title)
                    .font(.headline)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

/// Titre de section du feed, avec barre d'accent dégradée signature.
struct SectionHeader: View {
    let title: LocalizedStringKey
    var subtitle: LocalizedStringKey? = nil

    var body: some View {
        HStack(spacing: 11) {
            Capsule()
                .fill(JC.laiton)
                .frame(width: 3, height: subtitle == nil ? 22 : 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(JCFont.display(19))
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
