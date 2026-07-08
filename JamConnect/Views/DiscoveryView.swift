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

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        return (hour >= 17 || hour < 5) ? "Bonsoir" : "Salut"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 22) {
                        header
                        tonightRow
                        actionBar

                        if showMap {
                            MusicianMapView(musicians: filtered)
                                .frame(height: 480)
                                .clipShape(RoundedRectangle(cornerRadius: 24))
                        } else {
                            feed
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
                .refreshable {
                    await store.refreshLiveData()
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
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                LogoView(markSize: 20)
                Text("\(greeting), \(store.profile.name.split(separator: " ").first.map(String.init) ?? store.profile.name)")
                    .font(.system(size: 25, weight: .bold))
                    .tracking(-0.3)
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.coral)
                    Text("\(availableTonight.count) musiciens mobilisables ce soir")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            ZStack(alignment: .topTrailing) {
                AvatarView(name: store.profile.name, size: 48)
                if store.profile.isAvailable {
                    Circle()
                        .fill(store.profile.availability.color)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(JC.bg, lineWidth: 2))
                        .offset(x: 2, y: -2)
                }
            }
        }
    }

    /// Rangée principale : mobilisables immédiatement, le cœur de l'app.
    private var tonightRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.coral)
                Text("Dispo ce soir")
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text("\(availableTonight.count)")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.coral)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(JC.coral.opacity(0.14), in: Capsule())
            }
            if availableTonight.isEmpty {
                Text("Personne pour l'instant — reviens en fin d'après-midi.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                storiesScroller(availableTonight, ringColors: [JC.coral, JC.magenta])
            }
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
            JCPillButton(
                title: filters.activeCount > 0 ? "Filtres · \(filters.activeCount)" : "Filtres",
                icon: "slider.horizontal.3",
                isActive: filters.activeCount > 0
            ) { showFilters = true }

            JCPillButton(
                title: showMap ? "Liste" : "Carte",
                icon: showMap ? "list.bullet" : "map.fill",
                isActive: showMap,
                activeColor: JC.violet
            ) { withAnimation(.snappy) { showMap.toggle() } }

            Spacer()
            Text("\(filtered.count) profils")
                .font(.caption.weight(.medium))
                .foregroundStyle(.tertiary)
        }
    }

    private var feed: some View {
        LazyVStack(spacing: 18) {
            SectionHeader(
                title: "Près de chez toi",
                subtitle: "Les musiciens les plus proches, dispo en premier"
            )
            if filtered.isEmpty {
                JCEmptyState(
                    icon: "person.2.slash",
                    title: "Aucun musicien trouvé",
                    message: "Élargis le rayon ou retire un filtre pour voir plus de profils."
                )
            }
            ForEach(filtered) { musician in
                NavigationLink(value: musician) {
                    MusicianCard(musician: musician)
                }
                .buttonStyle(PressableStyle())
            }
        }
    }
}

// MARK: - Carte musicien (feed)

struct MusicianCard: View {
    @EnvironmentObject private var store: AppStore
    let musician: Musician

    private var mainGenre: Genre { musician.genres.first ?? .jazz }

    /// Durée fictive de la vidéo de présentation (60–90 s), stable par profil.
    private var videoDuration: String {
        let seconds = 60 + abs(musician.name.stableHash) % 31
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Couverture « vidéo » — photo libre de droit du genre
            ZStack(alignment: .bottom) {
                GenreCover(genre: mainGenre)
                    .frame(height: 168)

                // Scrim bas pour la lisibilité
                LinearGradient(
                    colors: [.clear, .black.opacity(0.55)],
                    startPoint: .center,
                    endPoint: .bottom
                )

                Image(systemName: "play.circle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.white.opacity(0.92))
                    .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
                    .offset(y: -20)

                VStack {
                    HStack(alignment: .top) {
                        AvailabilityBadge(availability: musician.availability)
                        Spacer()
                        Button {
                            withAnimation(.snappy(duration: 0.25)) {
                                store.toggleFavorite(musician)
                            }
                        } label: {
                            Image(systemName: store.isFavorite(musician) ? "heart.fill" : "heart")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(store.isFavorite(musician) ? JC.magenta : .white)
                                .padding(10)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .buttonStyle(PressableStyle(scale: 0.92))
                    }
                    Spacer()
                    HStack {
                        Spacer()
                        Label(videoDuration, systemImage: "video.fill")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(.black.opacity(0.4), in: Capsule())
                            .foregroundStyle(.white)
                    }
                }
                .padding(12)
            }
            .frame(height: 168)

            // Infos
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    AvatarView(name: musician.name, size: 44, photo: musician.photo)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(musician.name)
                            .font(.headline)
                        Text("\(musician.instruments.map(\.rawValue).joined(separator: " · ")) · \(musician.level.rawValue)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .trailing, spacing: 2) {
                        let notes = store.noteCount(for: musician)
                        if notes == 0 {
                            Text("Nouveau")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.violet)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(JC.violet.opacity(0.12), in: Capsule())
                        } else {
                            NoteRatingView(notes: notes, golden: store.goldenCount(for: musician))
                            Text(notes > 1 ? "\(notes) notes" : "1 note")
                                .font(.system(size: 9))
                                .foregroundStyle(.tertiary)
                        }
                    }
                }

                HStack(spacing: 6) {
                    ForEach(musician.genres.prefix(2)) { genre in
                        TagView(text: genre.rawValue, color: genre.color)
                    }
                    Spacer()
                    Label(
                        String(format: "%.1f km", musician.distance(from: AppStore.geneva)),
                        systemImage: "location.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(16)
            .background(JC.card)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(JC.cardStroke, lineWidth: 1))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(
                    LinearGradient(colors: [JC.cardHighlight, .clear], startPoint: .top, endPoint: .center),
                    lineWidth: 1
                )
        )
        .shadow(color: JC.cardShadow, radius: 16, x: 0, y: 10)
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
