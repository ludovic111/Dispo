import SwiftUI

/// Filtres de découverte.
struct DiscoveryFilters {
    var instrument: Instrument?
    var genre: Genre?
    var minLevel: Level?
    /// nil = peu importe quand ; sinon uniquement les musiciens dispo ce
    /// jour-là (date cochée dans leur calendrier).
    var neededDate: Date?
    var radiusKm: Double = 25
    /// Uniquement mes amis (suivi mutuel).
    var friendsOnly: Bool = false
    /// A déjà joué avec au moins un de mes amis.
    var playedWithAFriend: Bool = false
    /// Bien notés : moyenne ≥ 4 étoiles avec au moins 3 avis.
    var wellRated: Bool = false

    var activeCount: Int {
        var count = 0
        if instrument != nil { count += 1 }
        if genre != nil { count += 1 }
        if minLevel != nil { count += 1 }
        if neededDate != nil { count += 1 }
        if radiusKm != 25 { count += 1 }
        if friendsOnly { count += 1 }
        if playedWithAFriend { count += 1 }
        if wellRated { count += 1 }
        return count
    }

    @MainActor
    func matches(_ musician: Musician, store: AppStore) -> Bool {
        if let instrument, !musician.instruments.contains(instrument) { return false }
        if let genre, !musician.genres.contains(genre) { return false }
        if let minLevel, musician.level < minLevel { return false }
        if let neededDate, !musician.isAvailable(on: neededDate) { return false }
        // Rayon appliqué uniquement quand la distance est fiable (ma position
        // et la sienne connues) — on ne cache jamais un profil sans géoloc.
        if let distance = store.distance(to: musician), distance > radiusKm { return false }
        if friendsOnly, store.socialLink(with: musician.name) != .friend { return false }
        if playedWithAFriend, !store.playedWithAFriend(musician) { return false }
        if wellRated {
            guard let summary = store.ratingSummary(for: musician),
                  summary.count >= 3, summary.average >= 4
            else { return false }
        }
        return true
    }
}

// MARK: - Accueil (feed social)

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @State private var filters = DiscoveryFilters()
    @State private var showFilters = false
    /// Musicien en cours d'invitation depuis l'accueil (un tap).
    @State private var invitingName: String?

    private var filtered: [Musician] {
        // Amis / a joué avec un ami / suivis d'abord, puis niveau (Premium),
        // puis urgence de dispo et distance — voir AppStore.rank.
        store.musicians
            .filter { filters.matches($0, store: store) }
            .sorted { store.rank($0, $1) }
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
                        suggestionsRow
                        actionBar
                        feed
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
                    .font(JCFont.display(25))
                HStack(spacing: 6) {
                    Image(systemName: "person.2.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.laiton)
                    Text("\(store.musicians.count) musiciens sur le réseau")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            Button {
                store.selectedTab = .profile
            } label: {
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
            .buttonStyle(PressableStyle())
            .accessibilityLabel(Text("Ouvrir mon profil"))
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
                                .background(JC.feutrine, in: Capsule())
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
                                .background(JC.signal, in: Capsule())
                        }
                        .buttonStyle(PressableStyle())
                    }
                } else {
                    HStack(spacing: 6) {
                        Image(systemName: myStatus == .available ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(myStatus == .available ? JC.feutrine : JC.signal)
                        Text(myStatus == .available ? "Tu as confirmé ta présence" : "Tu as indiqué être indispo")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(12)
            .background(JC.bronze.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(JC.bronze.opacity(0.3), lineWidth: 1)
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
                            .foregroundStyle(JC.bronze)
                        Text("Dispos pour \(event.title)")
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                        Spacer()
                        Text("\(invitees.count)")
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(JC.bronze)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(JC.bronze.opacity(0.14), in: Capsule())
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
                                    if musician.isDemo { DemoAccountBadge() }
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
                                        .background(JC.bronze, in: Capsule())
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

    /// Suggestions de profils à suivre — affinité de styles, bien notés,
    /// proches ou déjà croisés via un ami.
    @ViewBuilder
    private var suggestionsRow: some View {
        let suggestions = store.followSuggestions
        if !suggestions.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "person.crop.circle.badge.plus")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.feutrine)
                    Text("Suggestions pour toi")
                        .font(.subheadline.weight(.bold))
                    Spacer(minLength: 0)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(suggestions) { musician in
                            SuggestionCard(musician: musician)
                        }
                    }
                    .padding(.vertical, 2)
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
                subtitle: store.isPremium
                    ? "Tes relations d'abord, puis les meilleurs niveaux"
                    : "Tes relations d'abord, puis les plus proches"
            )
            if filtered.isEmpty {
                JCEmptyState(
                    icon: "person.2.slash",
                    title: "Aucun musicien trouvé",
                    message: "Élargis le rayon ou retire un filtre pour voir plus de profils."
                )
            }
            ForEach(Array(filtered.enumerated()), id: \.element.id) { index, musician in
                NavigationLink(value: musician) {
                    SearchMusicianRow(musician: musician)
                }
                .buttonStyle(PressableStyle())
                if index == min(2, filtered.count - 1), !store.isPremium {
                    levelUpsellBox
                }
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
                    .foregroundStyle(JC.laiton)
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
                    .foregroundStyle(JC.laiton)
            }
            .padding(12)
            .background(JC.laiton.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(JC.laiton.opacity(0.35), lineWidth: 1)
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
        case .friend: TagView(text: "Ami", color: JC.feutrine)
        case .following: TagView(text: "Suivi", color: JC.bronze)
        case .follower: TagView(text: "Te suit", color: JC.bronze)
        case .none: EmptyView()
        }
    }
}

// MARK: - Carte de suggestion « à suivre »

/// Carte compacte d'un profil suggéré : identité + bouton Suivre en un tap.
struct SuggestionCard: View {
    @EnvironmentObject private var store: AppStore
    let musician: Musician

    var body: some View {
        VStack(spacing: 8) {
            NavigationLink(value: musician) {
                VStack(spacing: 8) {
                    AvatarView(name: musician.name, size: 58, photo: musician.photo)
                    VStack(spacing: 2) {
                        Text(musician.name.split(separator: " ").first.map(String.init) ?? musician.name)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        Text(LocalizedStringKey(musician.instruments.first?.rawValue ?? ""))
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        if let summary = store.ratingSummary(for: musician) {
                            RatingBadge(summary: summary)
                        } else if musician.isDemo {
                            DemoAccountBadge()
                        }
                    }
                }
            }
            .buttonStyle(PressableStyle())

            Button {
                withAnimation(.snappy) { store.toggleFollow(musician) }
            } label: {
                Text(store.isFollowing(musician) ? "Suivi" : "Suivre")
                    .font(.caption.weight(.heavy))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(
                        store.isFollowing(musician) ? AnyShapeStyle(JC.inset) : AnyShapeStyle(JC.hero),
                        in: Capsule()
                    )
                    .foregroundStyle(store.isFollowing(musician) ? Color.primary : JC.billetInk)
            }
            .buttonStyle(PressableStyle())
        }
        .frame(width: 116)
        .padding(10)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(JC.cardStroke, lineWidth: 1)
        )
    }
}
