import SwiftUI
import MapKit

/// Filtres de découverte.
struct DiscoveryFilters {
    var instrument: Instrument?
    var genre: Genre?
    var minLevel: Level?
    /// nil = tout le monde ; sinon uniquement les musiciens dont le statut
    /// répond à cet horizon (« cette semaine » englobe ce soir et le week-end).
    var availability: Availability?
    var radiusKm: Double = 25

    var activeCount: Int {
        var count = 0
        if instrument != nil { count += 1 }
        if genre != nil { count += 1 }
        if minLevel != nil { count += 1 }
        if availability != nil { count += 1 }
        if radiusKm < 25 { count += 1 }
        return count
    }

    func matches(_ musician: Musician) -> Bool {
        if let instrument, !musician.instruments.contains(instrument) { return false }
        if let genre, !musician.genres.contains(genre) { return false }
        if let minLevel, musician.level < minLevel { return false }
        if let availability, !musician.availability.satisfies(availability) { return false }
        if musician.distance(from: AppStore.geneva) > radiusKm { return false }
        return true
    }
}

// MARK: - Accueil (feed social)

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @State private var filters = DiscoveryFilters()
    @State private var showFilters = false
    @State private var showMap = false

    private var filtered: [Musician] {
        store.musicians
            .filter { filters.matches($0) }
            .sorted {
                // Les plus vite mobilisables d'abord (ce soir → sur demande), puis distance.
                if $0.availability.urgencyRank != $1.availability.urgencyRank {
                    return $0.availability.urgencyRank > $1.availability.urgencyRank
                }
                return $0.distance(from: AppStore.geneva) < $1.distance(from: AppStore.geneva)
            }
    }

    /// Mobilisables immédiatement — la rangée d'urgence.
    private var availableTonight: [Musician] {
        store.musicians.filter { $0.availability == .tonight }
    }

    /// Dispo prochainement (semaine, week-end, sur demande).
    private var availableSoon: [Musician] {
        store.musicians
            .filter { $0.isAvailable && $0.availability != .tonight }
            .sorted { $0.availability.urgencyRank > $1.availability.urgencyRank }
    }

    private var greeting: String {
        Calendar.current.component(.hour, from: Date()) >= 17 ? "Bonsoir" : "Salut"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JC.bg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 22) {
                        header
                        tonightRow
                        soonRow
                        actionBar

                        if showMap {
                            MusicianMapView(musicians: filtered)
                                .frame(height: 480)
                                .clipShape(RoundedRectangle(cornerRadius: 24))
                        } else {
                            if !store.isPremium { premiumBanner }
                            feed
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .sheet(isPresented: $showFilters) {
                FilterSheet(filters: $filters)
                    .presentationDetents([.medium, .large])
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            LogoView(markSize: 26)
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(greeting) \(store.profile.name) 👋")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                    Text("\(availableTonight.count) musiciens peuvent te dépanner ce soir")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                ZStack(alignment: .topTrailing) {
                    AvatarView(name: store.profile.name, size: 46)
                    if store.profile.isAvailable {
                        Circle()
                            .fill(store.profile.availability.color)
                            .frame(width: 13, height: 13)
                            .overlay(Circle().stroke(JC.bg, lineWidth: 2))
                    }
                }
            }
        }
        .padding(.top, 12)
    }

    /// Rangée principale : mobilisables immédiatement, le cœur de l'app.
    private var tonightRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("🚨 Peuvent te dépanner ce soir")
                    .font(.headline)
                Spacer()
                Text("\(availableTonight.count)")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.coral)
            }
            storiesScroller(availableTonight, ringColors: [JC.coral, JC.magenta])
        }
    }

    /// Rangée secondaire : dispo cette semaine, le week-end ou sur demande.
    private var soonRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("📅 Dispo prochainement")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            storiesScroller(availableSoon, ringColors: [JC.gold, .teal], avatarSize: 52)
        }
    }

    private func storiesScroller(_ musicians: [Musician],
                                 ringColors: [Color],
                                 avatarSize: CGFloat = 62) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(musicians) { musician in
                    NavigationLink(value: musician) {
                        VStack(spacing: 6) {
                            AvatarView(name: musician.name, size: avatarSize, photo: musician.photo)
                                .padding(4)
                                .overlay(
                                    Circle().stroke(
                                        LinearGradient(colors: ringColors,
                                                       startPoint: .top, endPoint: .bottom),
                                        lineWidth: 2.5
                                    )
                                )
                            Text(musician.name.split(separator: " ").first.map(String.init) ?? "")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(musician.instruments.first?.rawValue ?? "")
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button {
                showFilters = true
            } label: {
                Label(
                    filters.activeCount > 0 ? "Filtres · \(filters.activeCount)" : "Filtres",
                    systemImage: "slider.horizontal.3"
                )
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(filters.activeCount > 0 ? JC.coral.opacity(0.25) : JC.card, in: Capsule())
                .overlay(Capsule().stroke(JC.cardStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.snappy) { showMap.toggle() }
            } label: {
                Label(showMap ? "Liste" : "Carte", systemImage: showMap ? "list.bullet" : "map.fill")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(showMap ? JC.violet.opacity(0.35) : JC.card, in: Capsule())
                    .overlay(Capsule().stroke(JC.cardStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Spacer()
            Text("\(filtered.count) profils")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }

    private var premiumBanner: some View {
        Button {
            store.showPaywall = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "crown.fill")
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ne rate plus un cachet")
                        .font(.subheadline.weight(.heavy))
                    Text("Alertes dépannage en priorité + profil en tête · dès CHF 3.25/mois")
                        .font(.caption)
                        .opacity(0.8)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(.black)
            .padding(16)
            .background(JC.premium, in: RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
    }

    private var feed: some View {
        LazyVStack(spacing: 18) {
            SectionHeader(
                title: "Près de chez toi",
                subtitle: "Les musiciens les plus proches, dispo en premier"
            )
            if filtered.isEmpty {
                JCCard {
                    VStack(spacing: 8) {
                        Text("😶 Aucun musicien avec ces filtres")
                            .font(.headline)
                        Text("Élargis le rayon ou retire un filtre.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            ForEach(filtered) { musician in
                NavigationLink(value: musician) {
                    MusicianCard(musician: musician)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Carte musicien (feed)

struct MusicianCard: View {
    @EnvironmentObject private var store: AppStore
    let musician: Musician

    private var mainGenre: Genre { musician.genres.first ?? .jazz }

    var body: some View {
        VStack(spacing: 0) {
            // Couverture « vidéo » — photo libre de droit du genre
            ZStack {
                GenreCover(genre: mainGenre)
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 46))
                    .foregroundStyle(.white.opacity(0.95))
                    .shadow(radius: 8)

                VStack {
                    HStack {
                        AvailabilityBadge(availability: musician.availability)
                        Spacer()
                        Button {
                            store.toggleFavorite(musician)
                        } label: {
                            Image(systemName: store.isFavorite(musician) ? "heart.fill" : "heart")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(store.isFavorite(musician) ? JC.magenta : .white)
                                .padding(9)
                                .background(.black.opacity(0.35), in: Circle())
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    HStack {
                        Spacer()
                        Label("1:15", systemImage: "video.fill")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.45), in: Capsule())
                            .foregroundStyle(.white)
                    }
                }
                .padding(12)
            }
            .frame(height: 155)

            // Infos
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 10) {
                    AvatarView(name: musician.name, size: 42, photo: musician.photo)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(musician.name)
                            .font(.headline)
                        Text(musician.instruments.map(\.rawValue).joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        if musician.reviews.isEmpty {
                            Text("Nouveau")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.violet)
                        } else {
                            StarsView(rating: musician.averageRating)
                            Text("\(musician.reviews.count) avis")
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                HStack(spacing: 6) {
                    ForEach(musician.genres.prefix(2)) { genre in
                        TagView(text: "\(genre.emoji) \(genre.rawValue)", color: genre.color)
                    }
                    TagView(text: musician.level.rawValue, color: .teal)
                }

                HStack {
                    Label(
                        String(format: "%.1f km · %@", musician.distance(from: AppStore.geneva), musician.neighborhood),
                        systemImage: "location.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Spacer()
                    Text("Voir le profil")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.coral)
                }
            }
            .padding(14)
            .background(JC.card)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(JC.cardStroke, lineWidth: 1))
    }
}

// MARK: - Carte MapKit

struct MusicianMapView: View {
    let musicians: [Musician]
    @State private var selected: Musician?

    var body: some View {
        Map(initialPosition: .region(MKCoordinateRegion(
            center: AppStore.geneva,
            span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
        ))) {
            ForEach(musicians) { musician in
                Annotation(musician.name, coordinate: musician.coordinate) {
                    Button {
                        selected = musician
                    } label: {
                        AvatarView(name: musician.name, size: 36, photo: musician.photo)
                            .overlay(alignment: .topTrailing) {
                                // Pastille colorée selon l'horizon de dispo.
                                if musician.isAvailable {
                                    Circle()
                                        .fill(musician.availability.color)
                                        .frame(width: 11, height: 11)
                                        .overlay(Circle().stroke(.white, lineWidth: 1.5))
                                }
                            }
                    }
                }
            }
        }
        .sheet(item: $selected) { musician in
            NavigationStack {
                MusicianDetailView(musician: musician)
            }
            .presentationDetents([.large])
        }
    }
}
