import SwiftUI

@main
struct JamConnectApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(store.theme.colorScheme)
                .tint(JC.coral)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack {
            TabView {
                HomeView()
                    .tabItem { Label("Accueil", systemImage: "sparkles") }
                EventsView()
                    .tabItem { Label("SOS", systemImage: "bolt.fill") }
                ChatListView()
                    .tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right.fill") }
                MyProfileView()
                    .tabItem { Label("Profil", systemImage: "person.crop.circle") }
            }
            .sheet(isPresented: $store.showPaywall) { PaywallView() }

            if !store.hasOnboarded {
                OnboardingView()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(1)
            }
        }
        .animation(.snappy(duration: 0.4), value: store.hasOnboarded)
    }
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

extension Genre {
    var color: Color {
        switch self {
        case .jazz: return JC.coral
        case .latin: return JC.magenta
        case .classique: return Color(red: 0.45, green: 0.55, blue: 1.0)
        case .rock: return Color(red: 1.0, green: 0.33, blue: 0.38)
        case .electro: return Color(red: 0.25, green: 0.85, blue: 0.95)
        case .soul: return JC.gold
        case .folk: return Color(red: 0.45, green: 0.85, blue: 0.55)
        }
    }

    var gradient: LinearGradient {
        LinearGradient(
            colors: [color.opacity(0.95), color.opacity(0.55), JC.violet.opacity(0.8)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    /// Photo de couverture bundlée (images musicales libres de droit).
    var coverAsset: String {
        switch self {
        case .jazz: return "cover_jazz"
        case .latin: return "cover_latin"
        case .classique: return "cover_classique"
        case .rock: return "cover_rock"
        case .electro: return "cover_electro"
        case .soul: return "cover_soul"
        case .folk: return "cover_folk"
        }
    }
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
            if let photo, UIImage(named: photo) != nil {
                Image(photo)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                Circle().fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
    }

    private var initials: String {
        name.split(separator: " ").compactMap { $0.first.map(String.init) }.prefix(2).joined()
    }
}

/// Logo de l'app (marque + nom), utilisé sur l'accueil et l'onboarding.
struct LogoView: View {
    var markSize: CGFloat = 30
    var showWordmark: Bool = true
    /// Couleur du mot « JamConnect » — adaptative par défaut, blanche sur les fonds dégradés.
    var wordmarkColor: Color = .primary

    var body: some View {
        HStack(spacing: 8) {
            Image("logo_mark")
                .resizable()
                .scaledToFit()
                .frame(width: markSize, height: markSize)
            if showWordmark {
                Text("JamConnect")
                    .font(.system(size: markSize * 0.62, weight: .heavy, design: .rounded))
                    .foregroundStyle(wordmarkColor)
            }
        }
    }
}

struct TagView: View {
    let text: String
    var color: Color = JC.coral

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
            HStack(spacing: 4) {
                Text(availability.emoji)
                    .font(.system(size: 8))
                Text(availability.badgeLabel)
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

/// Note de musique dorée animée — le « coup de cœur ». Pulse et scintille en continu.
struct GoldenNoteView: View {
    var size: CGFloat = 16
    @State private var animate = false

    var body: some View {
        Image(systemName: "music.note")
            .font(.system(size: size, weight: .black))
            .foregroundStyle(JC.premium)
            .scaleEffect(animate ? 1.14 : 0.9)
            .rotationEffect(.degrees(animate ? 7 : -7))
            .shadow(color: JC.gold.opacity(animate ? 0.85 : 0.25), radius: animate ? size * 0.45 : 2)
            .animation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true), value: animate)
            .onAppear { animate = true }
    }
}

/// Récapitulatif des appréciations reçues : notes de musique + coups de cœur dorés.
/// Système strictement positif — pas de note négative.
struct NoteRatingView: View {
    let notes: Int
    let golden: Int

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 3) {
                Image(systemName: "music.note")
                    .font(.caption2.weight(.bold))
                Text("\(notes)")
                    .font(.caption2.weight(.bold))
            }
            .foregroundStyle(JC.violet)

            if golden > 0 {
                HStack(spacing: 3) {
                    GoldenNoteView(size: 12)
                    Text("\(golden)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.gold)
                }
            }
        }
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
            .shadow(color: JC.cardShadow, radius: 16, x: 0, y: 10)
    }
}

/// Titre de section du feed, avec barre d'accent dégradée signature.
struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil

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
