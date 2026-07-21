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
                .tint(JC.coral)
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
                MapTabView()
                    .tabItem { Label("Carte", systemImage: "map.fill") }
                    .tag(AppTab.map)
                EventsView()
                    .tabItem { Label("SOS", systemImage: "bolt.fill") }
                    .tag(AppTab.sos)
                ChatListView()
                    .tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right") }
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
                    .background(JC.coral, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 18)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(2)
            }
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
        var id: String {
            switch self {
            case .chat: return "chat"
            case .musician: return "musician"
            case .search: return "search"
            case .matching: return "matching"
            case .settings: return "settings"
            }
        }
    }

    private func applyScreenshotRoute() async {
        guard let route = UserDefaults.standard.string(forKey: "screenshotRoute") else { return }
        // Laisse la démo se charger et la TabView se poser.
        try? await Task.sleep(for: .milliseconds(800))
        switch route {
        case "map": store.selectedTab = .map
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
        default: break
        }
    }
    #endif
}

// MARK: - Design system « nuit de jazz »

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

/// Palette « nuit de jazz », adaptative clair / sombre.
/// Sombre : nuit indigo profond, halos néon. Clair : ivoire lavande, halos pastel.
enum JC {
    // Fonds
    static let bg = Color(
        light: Color(red: 0.965, green: 0.955, blue: 0.98),
        dark: Color(red: 0.055, green: 0.05, blue: 0.11)
    )
    static let card = Color(
        light: .white,
        dark: Color(red: 0.115, green: 0.105, blue: 0.19)
    )
    /// Surface interne (bulles, champs, encarts posés sur une carte).
    static let inset = Color(
        light: Color(red: 0.945, green: 0.94, blue: 0.965),
        dark: Color(red: 0.085, green: 0.08, blue: 0.15)
    )
    static let cardStroke = Color(
        light: .black.opacity(0.06),
        dark: .white.opacity(0.08)
    )
    /// Reflet interne des cartes — simule une légère épaisseur.
    static let cardHighlight = Color(
        light: .white.opacity(0.65),
        dark: .white.opacity(0.06)
    )
    /// Ombre portée des cartes — douce en clair, inexistante en sombre.
    static let cardShadow = Color(
        light: Color(red: 0.28, green: 0.22, blue: 0.5).opacity(0.14),
        dark: .clear
    )

    // Accents de marque (légèrement plus profonds en clair pour la lisibilité)
    static let coral = Color(
        light: Color(red: 0.92, green: 0.35, blue: 0.25),
        dark: Color(red: 1.0, green: 0.45, blue: 0.35)
    )
    static let magenta = Color(
        light: Color(red: 0.86, green: 0.22, blue: 0.52),
        dark: Color(red: 0.96, green: 0.32, blue: 0.62)
    )
    static let violet = Color(
        light: Color(red: 0.46, green: 0.30, blue: 0.88),
        dark: Color(red: 0.58, green: 0.38, blue: 0.98)
    )
    static let gold = Color(
        light: Color(red: 0.80, green: 0.55, blue: 0.10),
        dark: Color(red: 1.0, green: 0.78, blue: 0.35)
    )

    static let hero = LinearGradient(
        colors: [violet, magenta, coral],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let premium = LinearGradient(
        colors: [gold, coral],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Apparence globale (tab bar, navigation bar).
    static func configureAppearance() {
        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        tab.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab

        let nav = UINavigationBarAppearance()
        nav.configureWithDefaultBackground()
        nav.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
    }
}

/// Fond signature « aurore de jazz » : halos dégradés diffus posés sur le fond de base.
/// Néon sur nuit indigo en sombre, pastel doux sur ivoire en clair.
struct JCBackground: View {
    var body: some View {
        ZStack {
            JC.bg
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                Circle()
                    .fill(JC.violet)
                    .frame(width: w * 0.95)
                    .blur(radius: 95)
                    .opacity(0.20)
                    .position(x: w * 0.08, y: h * 0.06)
                Circle()
                    .fill(JC.magenta)
                    .frame(width: w * 0.8)
                    .blur(radius: 95)
                    .opacity(0.16)
                    .position(x: w * 0.98, y: h * 0.26)
                Circle()
                    .fill(JC.coral)
                    .frame(width: w * 0.75)
                    .blur(radius: 105)
                    .opacity(0.14)
                    .position(x: w * 0.2, y: h * 0.92)
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
        case .tonight: return JC.coral
        case .thisWeek: return JC.gold
        case .weekend: return .teal
        case .onRequest: return JC.violet
        case .unavailable: return .gray
        }
    }
}

extension GenreFamily {
    var color: Color {
        switch self {
        case .jazz: return JC.coral
        case .latinWorld: return JC.magenta
        case .classique: return Color(red: 0.45, green: 0.55, blue: 1.0)
        case .rockPop: return Color(red: 1.0, green: 0.33, blue: 0.38)
        case .bluesCountry: return Color(red: 0.85, green: 0.58, blue: 0.30)
        case .soulFunk: return JC.gold
        case .urbain: return Color(red: 0.55, green: 0.65, blue: 0.95)
        case .electro: return Color(red: 0.25, green: 0.85, blue: 0.95)
        case .folk: return Color(red: 0.45, green: 0.85, blue: 0.55)
        }
    }

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
            colors: [color.opacity(0.95), color.opacity(0.55), JC.violet.opacity(0.8)],
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
    /// Nom d'asset d'une photo de profil ; à défaut, pastille dégradée avec initiales.
    var photo: String? = nil

    private var colors: [Color] {
        let palette: [[Color]] = [
            [JC.coral, JC.magenta], [JC.violet, JC.magenta], [.teal, JC.violet],
            [JC.gold, JC.coral], [.pink, JC.violet], [.mint, .teal],
            [.cyan, JC.violet], [.indigo, JC.magenta]
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
                .frame(width: markSize, height: markSize)
            if showWordmark {
                Text("Dispo")
                    .font(.system(size: markSize * 0.62, weight: .heavy, design: .rounded))
                    .foregroundStyle(wordmarkColor)
            }
        }
    }
}

struct TagView: View {
    let text: LocalizedStringKey
    var color: Color = JC.coral

    /// Beaucoup d'appels passent des valeurs dynamiques (instruments,
    /// genres…) : la chaîne devient une clé de traduction (repli : elle-même).
    init(text: String, color: Color = JC.coral) {
        self.text = LocalizedStringKey(text)
        self.color = color
    }

    init(text: LocalizedStringKey, color: Color = JC.coral) {
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

/// Logo d'un réseau social, dessiné en SwiftUI (aucun asset de marque
/// embarqué). Reconnaissable au premier coup d'œil, cliquable via Link.
struct SocialLogoView: View {
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
                // La note « chromatique » signature : cyan + rose décalés.
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.5, weight: .bold))
                    .foregroundStyle(Color(red: 0.15, green: 0.96, blue: 0.93))
                    .offset(x: -size * 0.04, y: -size * 0.04)
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.5, weight: .bold))
                    .foregroundStyle(Color(red: 0.98, green: 0.17, blue: 0.33))
                    .offset(x: size * 0.04, y: size * 0.04)
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.5, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        case .youtube:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .fill(Color(red: 1.0, green: 0.0, blue: 0.0))
                Image(systemName: "play.fill")
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        case .x:
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                    .fill(.black)
                Text(verbatim: "𝕏")
                    .font(.system(size: size * 0.58, weight: .bold))
                    .foregroundStyle(.white)
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

/// Rangée de 5 étoiles remplies selon la moyenne (demi-étoiles comprises).
struct StarsView: View {
    let rating: Double
    var size: CGFloat = 12
    var color: Color = JC.gold

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
        .foregroundStyle(JC.gold)
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
            .foregroundStyle(.black)
    }
}

/// Marque explicite des profils echantillons presents sur le reseau live.
struct DemoAccountBadge: View {
    var body: some View {
        Text("Démo")
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(JC.violet)
            .background(JC.violet.opacity(0.13), in: Capsule())
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

/// En-tête d'écran unifié — titre éditorial + sous-titre discret.
struct ScreenHeader: View {
    let title: LocalizedStringKey
    var subtitle: LocalizedStringKey? = nil
    var icon: String? = nil
    var iconColor: Color = JC.coral
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
                    .font(.system(size: 28, weight: .bold))
                    .tracking(-0.5)
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
    var activeColor: Color = JC.coral
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
        var foreground: Color { self == .premium ? .black : .white }
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
    var iconColor: Color = JC.violet

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
                .fill(JC.hero)
                .frame(width: 4, height: subtitle == nil ? 22 : 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.heavy))
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
