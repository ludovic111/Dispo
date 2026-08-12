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
    /// Bien notés : moyenne ≥ 4 étoiles avec au moins 3 avis (pros seulement).
    var wellRated: Bool = false
    /// Où : ville ou pays. Vide = peu importe. Combiné à `neededDate`, cherche
    /// les musiciens présents là-bas ce jour-là (séjour déclaré), sinon ceux
    /// qui y habitent.
    var place: String = ""

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
        if !place.trimmingCharacters(in: .whitespaces).isEmpty { count += 1 }
        return count
    }

    @MainActor
    func matches(_ musician: Musician, store: AppStore) -> Bool {
        if let instrument, !musician.instruments.contains(instrument) { return false }
        if let genre, !musician.genres.contains(genre) { return false }
        if let minLevel, musician.level < minLevel { return false }
        if let neededDate, !musician.isAvailable(on: neededDate) { return false }
        if !matchesPlace(musician) { return false }
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

    /// Le musicien est-il au bon endroit ? Si une date est demandée, on
    /// regarde où il sera ce jour-là (séjour déclaré) ; sinon on accepte
    /// aussi bien son domicile qu'un de ses séjours à venir.
    private func matchesPlace(_ musician: Musician) -> Bool {
        let needle = place.trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return true }
        let home = musician.neighborhood
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .contains(needle.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current))
        if let neededDate {
            if let trip = musician.place(on: neededDate) { return trip.matches(needle) }
            return home
        }
        return home || musician.availabilityPlaces.contains { $0.matches(needle) }
    }
}

// MARK: - Accueil (feed social)

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @State private var filters = DiscoveryFilters()
    @State private var showFilters = false
    @State private var scope: AvailabilityScope = .today
    /// Le créneau d'ouverture n'est choisi qu'une fois, au premier chargement.
    @State private var scopePicked = false
    /// Actions rapides du cockpit leader : elles restent des feuilles légères,
    /// la page complète du groupe garde les fonctions avancées.
    @State private var membersGroup: GroupChat?
    @State private var newEventGroup: GroupChat?

    /// La vraie question d'un musicien qui ouvre l'app : qui peut jouer, et
    /// quand ? On répond avant de parler de distance — c'est ce qui distingue
    /// Dispo d'un annuaire de profils.
    enum AvailabilityScope: String, CaseIterable, Identifiable {
        case today = "Aujourd'hui"
        case weekend = "Ce week-end"
        case nearby = "Près de chez toi"
        var id: String { rawValue }

        var icon: String {
            switch self {
            case .today: return "bolt.fill"
            case .weekend: return "calendar.badge.clock"
            case .nearby: return "location.fill"
            }
        }

        /// Les couleurs des badges de dispo, à l'identique — le rouge signal
        /// reste réservé au SOS, jamais à une simple disponibilité.
        var color: Color {
            switch self {
            case .today: return JC.feutrine
            case .weekend: return JC.laiton
            case .nearby: return JC.bronze
            }
        }

        var subtitle: LocalizedStringKey {
            switch self {
            case .today: return "Dispos aujourd'hui — appelle, ça peut jouer ce soir"
            case .weekend: return "Dispos samedi ou dimanche"
            case .nearby: return "Tes relations d'abord, puis les plus proches"
            }
        }
    }

    /// Les musiciens qui passent les filtres, classés comme d'habitude.
    private var filtered: [Musician] {
        // Amis / a joué avec un ami / suivis d'abord, puis niveau (Premium),
        // puis urgence de dispo et distance — voir AppStore.rank.
        store.musicians
            .filter { filters.matches($0, store: store) }
            .sorted { store.rank($0, $1) }
    }

    /// La liste affichée : le créneau choisi restreint les musiciens à ceux
    /// qui ont vraiment coché ces jours-là.
    private var visible: [Musician] {
        switch scope {
        case .today: return filtered.filter { $0.isAvailable(on: Date()) }
        case .weekend: return filtered.filter { musician in
            Self.weekendDays.contains { musician.isAvailable(on: $0) }
        }
        case .nearby: return filtered
        }
    }

    /// Combien de musiciens dans chaque créneau (les pastilles du sélecteur).
    private func count(for scope: AvailabilityScope) -> Int {
        switch scope {
        case .today: return filtered.filter { $0.isAvailable(on: Date()) }.count
        case .weekend: return filtered.filter { musician in
            Self.weekendDays.contains { musician.isAvailable(on: $0) }
        }.count
        case .nearby: return filtered.count
        }
    }

    /// Ouvre sur le premier créneau qui a du monde.
    ///
    /// Arriver sur « Aujourd'hui » vide un mardi après-midi oblige à
    /// comprendre le sélecteur avant de voir le moindre musicien — on répond
    /// à la question « qui peut jouer ? » par un mur. On choisit donc pour
    /// l'utilisateur, une seule fois, et il reste libre de changer.
    private func pickOpeningScope() {
        guard !scopePicked, !store.musicians.isEmpty else { return }
        scopePicked = true
        if count(for: .today) > 0 {
            scope = .today
        } else if count(for: .weekend) > 0 {
            scope = .weekend
        } else {
            scope = .nearby
        }
    }

    /// Le prochain samedi et le dimanche qui suit (aujourd'hui compris quand
    /// on est déjà dans le week-end).
    private static var weekendDays: [Date] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        return (0...7).compactMap { offset -> Date? in
            guard let day = calendar.date(byAdding: .day, value: offset, to: today) else { return nil }
            let weekday = calendar.component(.weekday, from: day)
            return (weekday == 7 || weekday == 1) ? day : nil
        }
        .prefix(2)
        .map { $0 }
    }

    /// Groupes que je peux réellement diriger : leader ET Premium. Un membre
    /// ordinaire n'a pas besoin d'un cockpit de gestion sur son accueil.
    private var managedGroups: [GroupChat] {
        store.groups.filter(store.canLead)
    }

    /// Une seule prochaine session, tous mes groupes dirigés confondus : la
    /// plus proche. Les autres restent dans Sessions et dans chaque groupe.
    private var nextManagedEvent: (group: GroupChat, event: GroupEvent)? {
        managedGroups
            .compactMap { group in
                group.upcomingEvents.first.map { (group: group, event: $0) }
            }
            .min { $0.event.date < $1.event.date }
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
                        leaderGroupDashboard
                        scopePicker
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
            .onAppear { pickOpeningScope() }
            // Les musiciens arrivent après le premier rendu : on choisit le
            // créneau dès qu'il y a de quoi choisir, puis plus jamais.
            .onChange(of: store.musicians.count) { _, _ in pickOpeningScope() }
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .navigationDestination(for: GigRequest.self) { EventDetailView(eventID: $0.id) }
            .navigationDestination(for: GroupChat.ID.self) { GroupChatView(groupID: $0) }
            .sheet(isPresented: $showFilters) {
                FilterSheet(filters: $filters)
                    .presentationDetents([.medium, .large])
            }
            .sheet(item: $membersGroup) { group in
                GroupMembersSheet(groupID: group.id)
            }
            .sheet(item: $newEventGroup) { group in
                AddGroupEventSheet(group: group)
                    .presentationDetents([.medium])
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
                    AvatarView(name: store.profile.name, size: 48, photo: store.myPhotoReference)
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

    /// Cockpit volontairement réduit : la prochaine session, puis trois
    /// raccourcis par groupe. Répertoire, réglages, invitations et gestion
    /// fine restent dans la vraie page du groupe.
    ///
    /// La section n'existe que pour un leader Premium (`managedGroups`) :
    /// l'accueil des autres musiciens reste centré sur qui est disponible.
    @ViewBuilder
    private var leaderGroupDashboard: some View {
        if !managedGroups.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 7) {
                    Image(systemName: "crown.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.premiumTint)
                    Text("Mes groupes")
                        .font(.caption2.weight(.heavy))
                        .textCase(.uppercase)
                        .foregroundStyle(JC.premiumTint)
                    PremiumBadge()
                    Spacer(minLength: 0)
                    Text("Gestion rapide")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let next = nextManagedEvent {
                    GroupEventReminderCard(group: next.group, event: next.event)
                } else {
                    Text("Aucune session planifiée — crée la prochaine sans quitter l'accueil.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(managedGroups) { group in
                    leaderGroupRow(group)
                }
            }
            .padding(12)
            .background(JC.premiumTint.opacity(0.07), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(JC.premiumTint.opacity(0.22), lineWidth: 1)
            )
        }
    }

    /// Une ligne de pilotage par groupe : ouvrir, créer une session ou gérer
    /// les membres. Trois décisions utiles, pas une copie miniature des trois
    /// onglets complets du groupe.
    private func leaderGroupRow(_ group: GroupChat) -> some View {
        JCCard(padding: 10) {
            VStack(spacing: 9) {
                NavigationLink {
                    GroupChatView(groupID: group.id)
                } label: {
                    HStack(spacing: 9) {
                        GroupAvatarView(group: group, size: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "\(group.emoji) \(group.name)")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Text(String(
                                format: store.tr("%lld membres"),
                                Int64(store.roster(of: group).count)
                            ))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        if store.unreadCount(in: group) > 0 {
                            Text(verbatim: "\(store.unreadCount(in: group))")
                                .font(JCFont.monoBold(10))
                                .foregroundStyle(JC.billetInk)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 4)
                                .background(JC.laiton, in: Capsule())
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .buttonStyle(PressableStyle())

                HStack(spacing: 8) {
                    Button { newEventGroup = group } label: {
                        Label("Session", systemImage: "calendar.badge.plus")
                            .frame(maxWidth: .infinity)
                    }
                    Button { membersGroup = group } label: {
                        Label("Membres", systemImage: "person.3.fill")
                            .frame(maxWidth: .infinity)
                    }
                    NavigationLink {
                        GroupChatView(groupID: group.id, initialTab: .events)
                    } label: {
                        Label("Tout gérer", systemImage: "slider.horizontal.3")
                            .frame(maxWidth: .infinity)
                    }
                }
                .font(.caption2.weight(.bold))
                .buttonStyle(LeaderQuickActionStyle())
            }
        }
    }

    /// Le créneau : ce soir, ce week-end, ou tout ce qu'il y a autour de moi.
    private var scopePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                ForEach(AvailabilityScope.allCases) { item in
                    let isOn = scope == item
                    Button {
                        withAnimation(.snappy) { scope = item }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: item.icon)
                                .font(.system(size: 11, weight: .bold))
                            Text(LocalizedStringKey(item.rawValue))
                                .font(.subheadline.weight(.bold))
                            Text(verbatim: "\(count(for: item))")
                                .font(JCFont.monoBold(11))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(
                                    isOn ? Color.black.opacity(0.16) : JC.inset,
                                    in: Capsule()
                                )
                        }
                        .padding(.horizontal, 13)
                        .padding(.vertical, 9)
                        .background(
                            isOn ? AnyShapeStyle(item.color) : AnyShapeStyle(JC.card),
                            in: Capsule()
                        )
                        .overlay(
                            Capsule().stroke(isOn ? .clear : JC.cardStroke, lineWidth: 1)
                        )
                        .foregroundStyle(isOn ? (item == .weekend ? JC.billetInk : .white) : .primary)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
            .padding(.vertical, 2)
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
            Text("\(visible.count) profils")
                .font(.caption.weight(.medium))
                .foregroundStyle(.tertiary)
        }
    }

    private var feed: some View {
        LazyVStack(spacing: 18) {
            SectionHeader(
                title: LocalizedStringKey(scope.rawValue),
                subtitle: scope == .nearby && store.isPremium
                    ? "Tes relations d'abord, puis les meilleurs niveaux"
                    : scope.subtitle
            )
            if visible.isEmpty {
                emptyScopeState
            }
            ForEach(Array(visible.enumerated()), id: \.element.id) { index, musician in
                NavigationLink(value: musician) {
                    SearchMusicianRow(musician: musician, on: scopeDate)
                }
                .buttonStyle(PressableStyle())
                if index == min(2, visible.count - 1), !store.isPremium {
                    levelUpsellBox
                }
            }
        }
    }

    /// La date mise en avant sur les lignes : celle du créneau choisi (elle
    /// sert à afficher où le musicien se trouve ce jour-là).
    private var scopeDate: Date? {
        switch scope {
        case .today: return Date()
        case .weekend: return Self.weekendDays.first
        case .nearby: return filters.neededDate
        }
    }

    /// Créneau vide : on propose le suivant plutôt que d'afficher un mur.
    @ViewBuilder
    private var emptyScopeState: some View {
        switch scope {
        case .today:
            VStack(spacing: 10) {
                JCEmptyState(
                    icon: "moon.zzz",
                    title: "Personne aujourd'hui",
                    message: "Personne n'a coché aujourd'hui. Regarde le week-end — ou lance un SOS, il partira à tous les musiciens compatibles.",
                    iconColor: JC.signal
                )
                Button { withAnimation(.snappy) { scope = .weekend } } label: {
                    Text("Voir ce week-end")
                        .font(.caption.weight(.heavy))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(JC.hero, in: Capsule())
                        .foregroundStyle(JC.billetInk)
                }
                .buttonStyle(PressableStyle())
            }
        case .weekend:
            VStack(spacing: 10) {
                JCEmptyState(
                    icon: "calendar.badge.exclamationmark",
                    title: "Personne ce week-end",
                    message: "Aucun musicien n'a coché samedi ou dimanche pour l'instant.",
                    iconColor: JC.laiton
                )
                Button { withAnimation(.snappy) { scope = .nearby } } label: {
                    Text("Voir tous les musiciens")
                        .font(.caption.weight(.heavy))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(JC.hero, in: Capsule())
                        .foregroundStyle(JC.billetInk)
                }
                .buttonStyle(PressableStyle())
            }
        case .nearby:
            JCEmptyState(
                icon: "person.2.slash",
                title: "Aucun musicien trouvé",
                message: "Élargis le rayon ou retire un filtre pour voir plus de profils."
            )
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

/// Bouton compact du cockpit leader. Le fond reste discret pour que la
/// prochaine session garde le poids visuel principal.
private struct LeaderQuickActionStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(JC.premiumTint)
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .background(
                JC.premiumTint.opacity(configuration.isPressed ? 0.18 : 0.10),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Prochain événement d'un groupe

/// Le prochain rendez-vous d'un de mes groupes, avec l'état de son line-up :
/// vert quand tout le monde est là (ou remplacé), rouge quand la date limite
/// de réponse est passée et qu'il manque encore du monde.
struct GroupEventReminderCard: View {
    @EnvironmentObject private var store: AppStore
    let group: GroupChat
    let event: GroupEvent

    private var state: LineupState { store.lineupState(event, in: group) }
    private var missing: [Instrument] { store.missingRoles(event, in: group) }
    private var guests: [EventGuest] { store.guests(for: event) }

    private var tint: Color {
        switch state {
        case .complete: return JC.feutrine
        case .late: return JC.signal
        case .forming: return JC.bronze
        }
    }

    var body: some View {
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
                        Text(verbatim: "\(event.date.formatted(.dateTime.weekday(.wide).day().month().locale(store.language.locale))) · \(event.venue)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if let left = store.countdown(to: event.date) {
                        Text(String(format: store.tr("dans %@"), left))
                            .font(.caption2.weight(.heavy))
                            .foregroundStyle(JC.laiton)
                    }
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(PressableStyle())

            lineupLine
            if !guests.isEmpty { guestLine }
            attendanceControls
        }
        .padding(12)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(tint.opacity(state == .forming ? 0.3 : 0.55), lineWidth: 1)
        )
    }

    /// La ligne qui dit tout : line-up complet, ou ce qu'il manque encore.
    @ViewBuilder
    private var lineupLine: some View {
        HStack(spacing: 6) {
            switch state {
            case .complete:
                Image(systemName: "checkmark.seal.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.feutrine)
                Text("Line-up complet — tout le monde est là")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.feutrine)
            case .late:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.signal)
                Text(missing.isEmpty
                     ? LocalizedStringKey("Il manque encore des réponses")
                     : "Il manque : \(missing.map { store.tr($0.rawValue) }.joined(separator: ", "))")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.signal)
                    .lineLimit(2)
            case .forming:
                Image(systemName: "person.2.fill")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                Text("Présence : \(event.availableNames.count)/\(store.roster(of: group).count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }

    /// Les invités d'un soir trouvés par SOS — ils ne sont pas du groupe.
    private var guestLine: some View {
        FlowLayout(spacing: 5) {
            Text("Invités")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            ForEach(guests) { guest in
                TagView(
                    text: guest.instrument.map { "\(guest.name) · \(store.tr($0.rawValue))" } ?? guest.name,
                    color: JC.feutrine
                )
            }
        }
    }

    @ViewBuilder
    private var attendanceControls: some View {
        let myStatus = event.status(for: store.profile.name)
        if myStatus == .pending {
            HStack(spacing: 8) {
                ConfirmCountdownBadge(event: event)
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
}
