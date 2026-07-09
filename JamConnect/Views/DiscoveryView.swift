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
    /// Musicien en cours d'invitation depuis l'accueil (un tap).
    @State private var invitingName: String?

    private var filtered: [Musician] {
        // Amis / suivis / abonnés d'abord, puis niveau (Premium seulement),
        // puis urgence de dispo et distance — voir AppStore.rank.
        store.musicians
            .filter { filters.matches($0) }
            .sorted { store.rank($0, $1) }
    }

    /// Mobilisables immédiatement — la rangée d'urgence.
    private var availableTonight: [Musician] {
        store.musicians.filter { $0.availability == .tonight }
    }

    /// Prochain événement de groupe (7 jours) — pour le rappel + invitations.
    private var nextGroupEvent: (group: GroupChat, event: GroupEvent)? {
        let next = store.groups
            .flatMap { group in group.upcomingEvents.map { (group, $0) } }
            .min { $0.1.date < $1.1.date }
        guard let (group, event) = next,
              event.date < Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        else { return nil }
        return (group, event)
    }

    private var greeting: LocalizedStringKey {
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
                        searchBar
                        groupEventReminder
                        availableInviteRow
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
            .navigationDestination(for: GigRequest.self) { EventDetailView(eventID: $0.id) }
            .navigationDestination(for: GroupChat.ID.self) { GroupChatView(groupID: $0) }
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
                (Text(greeting) + Text(verbatim: ", \(store.profile.name.split(separator: " ").first.map(String.init) ?? store.profile.name)"))
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

    /// Barre de recherche libre — complète les filtres structurés.
    private var searchBar: some View {
        NavigationLink {
            SearchView()
        } label: {
            HStack(spacing: 9) {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("Musicien, @pseudo, instrument, lieu…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(JC.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(JC.cardStroke, lineWidth: 1)
            )
        }
        .buttonStyle(PressableStyle())
    }

    /// Prochain événement d'un de mes groupes — le pont accueil ↔ groupes.
    @ViewBuilder
    private var groupEventReminder: some View {
        if let (group, event) = nextGroupEvent {
            let myStatus = event.status(for: store.profile.name)
            VStack(spacing: 10) {
                NavigationLink(value: group.id) {
                    HStack(spacing: 11) {
                        Text(event.kind.emoji)
                            .font(.title3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "\(group.emoji) \(group.name) — \(event.title)")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Text(verbatim: "\(event.date.formatted(.dateTime.weekday(.wide).day().month())) · \(event.venue)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .buttonStyle(PressableStyle())

                if myStatus == .pending {
                    HStack(spacing: 8) {
                        Text("Tu viens ?")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                        Button {
                            store.setAttendance(.available, eventID: event.id, in: group.id)
                        } label: {
                            Text("Dispo")
                                .font(.caption.weight(.heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(Color.green, in: Capsule())
                        }
                        .buttonStyle(PressableStyle())
                        Button {
                            store.setAttendance(.unavailable, eventID: event.id, in: group.id)
                        } label: {
                            Text("Indispo")
                                .font(.caption.weight(.heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(JC.coral, in: Capsule())
                        }
                        .buttonStyle(PressableStyle())
                    }
                } else {
                    HStack(spacing: 6) {
                        Image(systemName: myStatus == .available ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(myStatus == .available ? Color.green : JC.coral)
                        Text(myStatus == .available ? "Tu as confirmé ta présence" : "Tu as indiqué être indispo")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(12)
            .background(JC.violet.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(JC.violet.opacity(0.3), lineWidth: 1)
            )
        }
    }

    /// Musiciens déjà dispo le jour de l'événement — invitation en un tap.
    @ViewBuilder
    private var availableInviteRow: some View {
        if let (group, event) = nextGroupEvent,
           store.canLead(group) {
            let invitees = store.availableInvitees(for: event, in: group)
            if !invitees.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "person.badge.plus")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(JC.violet)
                        Text("Dispos pour \(event.title)")
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                        Spacer()
                        Text("\(invitees.count)")
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(JC.violet)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(JC.violet.opacity(0.14), in: Capsule())
                    }
                    Text("Un tap pour inviter — ils rejoignent l'événement directement.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(invitees.prefix(12)) { musician in
                                VStack(spacing: 8) {
                                    AvatarView(name: musician.name, size: 52, photo: musician.photo)
                                    Text(musician.name.split(separator: " ").first.map(String.init) ?? musician.name)
                                        .font(.caption2.weight(.semibold))
                                        .lineLimit(1)
                                        .frame(width: 72)
                                    Button {
                                        guard invitingName == nil else { return }
                                        invitingName = musician.name
                                        Task {
                                            await store.inviteAvailable(musician, to: event, in: group)
                                            invitingName = nil
                                        }
                                    } label: {
                                        HStack(spacing: 4) {
                                            if invitingName == musician.name {
                                                ProgressView().controlSize(.mini)
                                            } else {
                                                Image(systemName: "paperplane.fill")
                                                    .font(.system(size: 9, weight: .bold))
                                            }
                                            Text("Inviter")
                                                .font(.caption2.weight(.heavy))
                                        }
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(JC.violet, in: Capsule())
                                    }
                                    .buttonStyle(PressableStyle())
                                    .disabled(invitingName != nil)
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
                .padding(14)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(JC.cardStroke, lineWidth: 1)
                )
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
                            Text(LocalizedStringKey(musician.instruments.first?.rawValue ?? ""))
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
                subtitle: store.showsPremium
                    ? "Tes relations d'abord, puis les meilleurs niveaux"
                    : "Tes relations d'abord, puis les plus proches"
            )
            if !store.showsPremium {
                levelUpsellBox
            }
            if filtered.isEmpty {
                JCEmptyState(
                    icon: "person.2.slash",
                    title: "Aucun musicien trouvé",
                    message: "Élargis le rayon ou retire un filtre pour voir plus de profils."
                )
            }
            ForEach(filtered) { musician in
                NavigationLink(value: musician) {
                    SearchMusicianRow(musician: musician)
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    /// Encart Premium : le tri et l'affichage du niveau sont réservés aux
    /// abonnés — les comptes gratuits ne voient que le tri par relations.
    private var levelUpsellBox: some View {
        Button { store.showPaywall = true } label: {
            HStack(spacing: 11) {
                Image(systemName: "medal.fill")
                    .font(.title3)
                    .foregroundStyle(JC.gold)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Vois le niveau des musiciens")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.primary)
                    Text("Avec Premium, les profils sont triés par niveau — les meilleurs en haut.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "lock.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.gold)
            }
            .padding(12)
            .background(JC.gold.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(JC.gold.opacity(0.35), lineWidth: 1)
            )
        }
        .buttonStyle(PressableStyle())
    }
}

/// Petit badge du lien social avec un musicien (ami / suivi / te suit).
struct SocialLinkBadge: View {
    let link: SocialLink

    var body: some View {
        switch link {
        case .friend: TagView(text: "Ami", color: JC.magenta)
        case .following: TagView(text: "Suivi", color: JC.violet)
        case .follower: TagView(text: "Te suit", color: .teal)
        case .none: EmptyView()
        }
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
