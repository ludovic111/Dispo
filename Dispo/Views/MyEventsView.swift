import SwiftUI

/// « Sessions » — tout ce que je joue, au même endroit.
///
/// Un musicien ne se demande pas « qui est autour de moi ? » (le fil et la
/// recherche répondent déjà), il se demande « qu'est-ce que j'ai, et à quoi
/// dois-je répondre ? ». Cette page rassemble donc ce qui était éparpillé :
/// les dates de mes groupes, les dépannages qu'on m'a confiés, les SOS que
/// j'organise et les candidatures en attente — avec, en tête, ce qui attend
/// une réponse de ma part.
///
/// Depuis la 1.7 elle absorbe aussi « Je joue » (ex-onglet SOS) : les
/// demandes de dépannage qu'on m'adresse se répondent ici. Une date se
/// consulte à un seul endroit.
struct MyEventsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var scope: Scope = .upcoming

    enum Scope: String, CaseIterable, Identifiable {
        case upcoming = "À venir"
        case past = "Passés"
        var id: String { rawValue }
    }

    private var items: [AgendaItem] {
        scope == .upcoming ? store.agenda : store.pastAgenda
    }

    /// Les mois, dans l'ordre d'affichage (à venir : chronologique ; passés :
    /// du plus récent au plus ancien).
    private var months: [(key: Date, items: [AgendaItem])] {
        let grouped = Dictionary(grouping: items) { $0.monthKey() }
        return grouped
            .map { (key: $0.key, items: $0.value) }
            .sorted { scope == .upcoming ? $0.key < $1.key : $0.key > $1.key }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 18) {
                        ScreenHeader(
                            title: "Sessions",
                            subtitle: headerSubtitle,
                            icon: "calendar",
                            iconColor: JC.laiton
                        )

                        Picker("Période", selection: $scope.animation(.snappy)) {
                            ForEach(Scope.allCases) { option in
                                Text(LocalizedStringKey(option.rawValue)).tag(option)
                            }
                        }
                        .pickerStyle(.segmented)

                        if scope == .upcoming {
                            toConfirmSection
                            nextDateSection
                        }

                        if items.isEmpty {
                            emptyState
                        } else {
                            ForEach(months, id: \.key) { month in
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(verbatim: monthLabel(month.key))
                                        .font(JCFont.monoBold(11))
                                        .textCase(.uppercase)
                                        .tracking(1.4)
                                        .foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    ForEach(month.items) { item in
                                        AgendaRow(item: item, isPast: scope == .past)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
                .refreshable { await store.refreshLiveData() }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: GigRequest.self) { EventDetailView(eventID: $0.id) }
            .navigationDestination(for: GroupEventRoute.self) { route in
                GroupEventSheet(
                    groupID: route.groupID,
                    eventID: route.eventID,
                    presentedModally: false
                )
            }
        }
    }

    private var headerSubtitle: LocalizedStringKey {
        if scope == .past {
            return "\(items.count) date·s jouée·s"
        }
        let waiting = store.sessionsTodoCount
        if waiting > 0 { return "\(waiting) réponse·s attendue·s" }
        return "\(store.agenda.count) date·s à venir"
    }

    // MARK: Ce qui attend une réponse

    /// Le premier bloc de la page : tout ce sur quoi quelqu'un attend un mot
    /// de moi. Les dépannages qu'on me demande et les dates de groupe non
    /// confirmées sont la même chose du point de vue du musicien — ils se
    /// répondent côte à côte, sans changer d'onglet.
    @ViewBuilder
    private var toConfirmSection: some View {
        let requests = store.incomingRequests.filter { $0.targetStatus == .pending }
        let waiting = store.agendaToConfirm
        if !requests.isEmpty || !waiting.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(
                    title: "On attend ta réponse",
                    subtitle: "Un tap suffit — en face, on sait tout de suite s'il faut chercher quelqu'un d'autre"
                )
                ForEach(requests) { request in
                    IncomingRequestCard(request: request)
                }
                ForEach(waiting) { item in
                    if case .group(let groupID, let name, let emoji, let event) = item.source {
                        AnswerCard(groupID: groupID, groupName: name, emoji: emoji, event: event)
                    }
                }
            }
        }
    }

    // MARK: La prochaine date, en grand

    @ViewBuilder
    private var nextDateSection: some View {
        if let next = store.nextAgendaItem {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "Prochaine date", subtitle: nil)
                NextDateCard(item: next)
            }
        }
    }

    private var emptyState: some View {
        JCEmptyState(
            icon: scope == .upcoming ? "calendar.badge.plus" : "clock.arrow.circlepath",
            title: scope == .upcoming ? "Rien de prévu" : "Aucune date passée",
            message: scope == .upcoming
                ? "Tes concerts de groupe, les dépannages qu'on te confie, tes candidatures et les SOS que tu publies apparaissent ici."
                : "Les dates que tu auras jouées se rangent ici, mois par mois.",
            iconColor: JC.laiton
        )
    }

    /// « Août 2026 », dans la langue choisie dans l'app.
    private func monthLabel(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle(locale: store.language.locale).month(.wide).year()
        )
    }
}

// MARK: - Une ligne d'agenda

/// Une date, quelle que soit son origine : talon coloré, titre, lieu, et ce
/// qu'il reste à faire dessus.
struct AgendaRow: View {
    @EnvironmentObject private var store: AppStore
    let item: AgendaItem
    var isPast = false

    var body: some View {
        Group {
            switch item.source {
            case .group(let groupID, _, _, let event):
                NavigationLink(value: GroupEventRoute(groupID: groupID, eventID: event.id)) { card }
                    .buttonStyle(PressableStyle())
            case .playing(let gig), .hosting(let gig), .applied(let gig):
                NavigationLink(value: gig) { card }
                    .buttonStyle(PressableStyle())
            }
        }
    }

    private var card: some View {
        JCCard {
            HStack(spacing: 12) {
                stub
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(verbatim: subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    FlowLayout(spacing: 5) { tags }
                }
                Spacer(minLength: 0)
                trailing
            }
        }
        .opacity(isPast ? 0.75 : 1)
    }

    /// Le talon de billet : jour et mois, sur la couleur de la nature de la date.
    private var stub: some View {
        VStack(spacing: 1) {
            Text(item.date.formatted(.dateTime.day()))
                .font(JCFont.display(20))
            Text(item.date.formatted(.dateTime.month(.abbreviated)))
                .font(JCFont.monoBold(9))
                .textCase(.uppercase)
        }
        .foregroundStyle(JC.billetInk)
        .frame(width: 46)
        .padding(.vertical, 8)
        .background(stubStyle)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private var stubStyle: AnyShapeStyle {
        switch item.source {
        case .group(let groupID, _, _, let event):
            guard let group = store.groups.first(where: { $0.id == groupID }) else {
                return AnyShapeStyle(JC.serie)
            }
            switch store.lineupState(event, in: group) {
            case .complete: return AnyShapeStyle(JC.complet)
            case .late: return AnyShapeStyle(JC.alerte)
            case .forming: return AnyShapeStyle(JC.serie)
            }
        case .playing: return AnyShapeStyle(JC.serie)
        case .hosting: return AnyShapeStyle(JC.hero)
        case .applied: return AnyShapeStyle(JC.hero)
        }
    }

    private var subtitle: String {
        let time = item.date.formatted(date: .omitted, time: .shortened)
        return item.place.isEmpty ? time : "\(time) · \(item.place)"
    }

    @ViewBuilder
    private var tags: some View {
        switch item.source {
        case .group(let groupID, let name, let emoji, let event):
            Text(verbatim: "\(emoji) \(name)")
                .font(.caption2.weight(.bold))
                .foregroundStyle(JC.bronze)
                .lineLimit(1)
            EventKindBadge(kind: event.kind)
            // Sans ça, une série hebdomadaire donne cinquante-deux lignes
            // rigoureusement identiques et rien ne dit que c'est la même.
            if let recurrence = event.recurrence, event.isRecurring {
                TagView(text: recurrence.shortLabel, color: JC.feutrine)
            }
            if let group = store.groups.first(where: { $0.id == groupID }),
               let role = group.role(for: store.profile.name) {
                TagView(text: role.rawValue, color: JC.laiton)
            }
        case .playing(let gig):
            TagView(text: "Je dépanne", color: JC.feutrine)
            Text(verbatim: store.tr("avec") + " \(gig.hostName)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if let instrument = gig.myApplicationInstrument ?? gig.wantedInstruments.first {
                TagView(text: instrument.rawValue, color: JC.bronze)
            }
        case .hosting(let gig):
            TagView(text: "J'organise", color: JC.laiton)
            let waiting = store.pendingApplicants(for: gig).count
            if waiting > 0 {
                // Typé explicitement : sans ça l'interpolation devient une
                // String et la clé de traduction est perdue.
                let todo: LocalizedStringKey = "\(waiting) à traiter"
                TagView(text: todo, color: JC.signal)
            } else if gig.isFilled {
                TagView(text: "Complet", color: JC.feutrine)
            }
        case .applied:
            TagView(text: "Candidature envoyée", color: JC.bronze)
        }
    }

    @ViewBuilder
    private var trailing: some View {
        switch item.source {
        case .group(_, _, _, let event):
            let mine = store.myAttendance(for: event)
            if isPast {
                EmptyView()
            } else if mine == .pending {
                ConfirmCountdownBadge(event: event)
            } else {
                Image(systemName: mine == .available ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(mine == .available ? JC.feutrine : JC.signal)
            }
        default:
            if !isPast, let left = store.countdown(to: item.date) {
                Text(String(format: store.tr("dans %@"), left))
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(JC.laiton)
            }
        }
    }
}

// MARK: - La prochaine date, en grand

/// La carte de tête : ce qui arrive, avec le compte à rebours et l'état du
/// line-up. C'est la première chose qu'on veut voir en ouvrant l'agenda.
struct NextDateCard: View {
    @EnvironmentObject private var store: AppStore
    let item: AgendaItem

    var body: some View {
        Group {
            switch item.source {
            case .group(let groupID, _, _, let event):
                NavigationLink(value: GroupEventRoute(groupID: groupID, eventID: event.id)) { card }
                    .buttonStyle(PressableStyle())
            case .playing(let gig), .hosting(let gig), .applied(let gig):
                NavigationLink(value: gig) { card }.buttonStyle(PressableStyle())
            }
        }
    }

    private var card: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 2) {
                        Text(item.date.formatted(.dateTime.day()))
                            .font(JCFont.display(30))
                        Text(item.date.formatted(.dateTime.month(.abbreviated)))
                            .font(JCFont.monoBold(10))
                            .textCase(.uppercase)
                            .tracking(1.1)
                    }
                    .foregroundStyle(JC.billetInk)
                    .frame(width: 62)
                    .padding(.vertical, 12)
                    .background(JC.hero)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(JCFont.display(21))
                            .lineLimit(2)
                        Label(
                            item.place.isEmpty
                                ? item.date.formatted(date: .omitted, time: .shortened)
                                : "\(item.date.formatted(date: .omitted, time: .shortened)) · \(item.place)",
                            systemImage: "mappin.and.ellipse"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        if let left = store.countdown(to: item.date) {
                            Text(String(format: store.tr("dans %@"), left))
                                .font(.caption.weight(.heavy))
                                .foregroundStyle(JC.laiton)
                        }
                    }
                    Spacer(minLength: 0)
                }

                if case .group(let groupID, _, _, let event) = item.source,
                   let group = store.groups.first(where: { $0.id == groupID }) {
                    lineupLine(event: event, group: group)
                }
            }
        }
    }

    /// L'état du line-up, dit en une ligne (complet, en retard, en cours).
    @ViewBuilder
    private func lineupLine(event: GroupEvent, group: GroupChat) -> some View {
        let missing = store.missingRoles(event, in: group)
        HStack(spacing: 6) {
            switch store.lineupState(event, in: group) {
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
}

// MARK: - Répondre en un tap

/// Une date qui attend ma réponse : dispo ou pas, sans quitter l'agenda.
struct AnswerCard: View {
    @EnvironmentObject private var store: AppStore
    let groupID: UUID
    let groupName: String
    let emoji: String
    let event: GroupEvent

    var body: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(verbatim: "\(emoji) \(groupName)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.bronze)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    ConfirmCountdownBadge(event: event)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(event.title)
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                    Text(verbatim: "\(event.date.formatted(date: .abbreviated, time: .shortened))"
                         + (event.venue.isEmpty ? "" : " · \(event.venue)"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                HStack(spacing: 10) {
                    Button {
                        store.setAttendance(.unavailable, eventID: event.id, in: groupID)
                    } label: {
                        Text("Indispo")
                            .font(.caption.weight(.heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(JC.inset, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                            .foregroundStyle(Color.primary)
                    }
                    .buttonStyle(PressableStyle())
                    Button {
                        store.setAttendance(.available, eventID: event.id, in: groupID)
                    } label: {
                        Text("Je suis dispo")
                            .font(.caption.weight(.heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(JC.hero, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                            .foregroundStyle(JC.billetInk)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }
}
