import SwiftUI

@main
struct JamConnectApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
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

enum JC {
    static let bg = Color(red: 0.055, green: 0.05, blue: 0.11)
    static let card = Color(red: 0.115, green: 0.105, blue: 0.19)
    static let cardStroke = Color.white.opacity(0.07)

    static let coral = Color(red: 1.0, green: 0.45, blue: 0.35)
    static let magenta = Color(red: 0.96, green: 0.32, blue: 0.62)
    static let violet = Color(red: 0.58, green: 0.38, blue: 0.98)
    static let gold = Color(red: 1.0, green: 0.78, blue: 0.35)

    static let hero = LinearGradient(
        colors: [violet, magenta, coral],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let premium = LinearGradient(
        colors: [gold, coral],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
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

    var body: some View {
        HStack(spacing: 8) {
            Image("logo_mark")
                .resizable()
                .scaledToFit()
                .frame(width: markSize, height: markSize)
            if showWordmark {
                Text("JamConnect")
                    .font(.system(size: markSize * 0.62, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
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

struct StarsView: View {
    let rating: Double

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: Double(star) <= rating.rounded() ? "star.fill" : "star")
                    .font(.caption2)
                    .foregroundStyle(JC.gold)
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

/// Carte standard du design system.
struct JCCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(JC.card, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(JC.cardStroke, lineWidth: 1))
    }
}

/// Titre de section du feed.
struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.title3.weight(.heavy))
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
