import SwiftUI
import MapKit

/// L'onglet SOS ne parle que de dépannage, et en deux temps : les SOS des
/// autres (« SOS »), et les miens avec leurs candidats (« Mes SOS »).
///
/// Ce que je joue — dépannages acceptés, candidatures en attente, demandes
/// reçues — a rejoint l'onglet Sessions en 1.7 : une date est une date, elle
/// n'a pas à vivre dans deux écrans.
struct EventsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showCreate = false
    @State private var segment: Segment = .feed
    /// Annonces dépliées dans « Mes SOS ».
    @State private var expanded: Set<UUID> = []
    /// Annonce dont le retrait est en cours de confirmation.
    @State private var gigToCancel: GigRequest?

    enum Segment: String, CaseIterable, Identifiable {
        case feed = "SOS"
        case hosting = "Mes SOS"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 18) {
                        ScreenHeader(
                            title: "SOS dépannage",
                            subtitle: headerSubtitle,
                            icon: "bolt.fill",
                            iconColor: JC.signal,
                            trailing: AnyView(createButton)
                        )

                        Picker("Espace", selection: $segment.animation(.snappy)) {
                            ForEach(Segment.allCases) { item in
                                label(for: item).tag(item)
                            }
                        }
                        .pickerStyle(.segmented)

                        switch segment {
                        case .feed: feedSection
                        case .hosting: hostingSection
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
            .navigationDestination(for: GigRequest.self) { EventDetailView(eventID: $0.id) }
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .navigationDestination(for: GroupChat.ID.self) { GroupChatView(groupID: $0) }
            .sheet(isPresented: $showCreate) {
                CreateEventView()
            }
            .onAppear { store.loadAllApplicants() }
            .confirmationDialog(
                "Retirer cette annonce ?",
                isPresented: Binding(get: { gigToCancel != nil }, set: { if !$0 { gigToCancel = nil } }),
                titleVisibility: .visible
            ) {
                Button("Retirer l'annonce", role: .destructive) {
                    if let gig = gigToCancel { store.cancelGig(gig) }
                    gigToCancel = nil
                }
                Button("Annuler", role: .cancel) { gigToCancel = nil }
            } message: {
                Text("Les candidatures reçues seront supprimées.")
            }
        }
    }

    /// Libellé d'un segment, avec le nombre de choses à traiter.
    private func label(for item: Segment) -> Text {
        switch item {
        case .feed:
            let fresh = store.unseenGigCount
            return fresh > 0
                ? Text(LocalizedStringKey(item.rawValue)) + Text(verbatim: " · \(fresh)")
                : Text(LocalizedStringKey(item.rawValue))
        case .hosting:
            let todo = store.myGigs.reduce(0) { $0 + store.pendingApplicants(for: $1).count }
            return todo > 0
                ? Text(LocalizedStringKey(item.rawValue)) + Text(verbatim: " · \(todo)")
                : Text(LocalizedStringKey(item.rawValue))
        }
    }

    private var headerSubtitle: LocalizedStringKey {
        switch segment {
        case .feed: return "\(store.visibleGigs.count) concerts cherchent un musicien"
        case .hosting: return "Accepte ou écarte tes candidats"
        }
    }

    // MARK: Le fil des annonces

    @ViewBuilder
    private var feedSection: some View {
        let feed = store.visibleGigs
        scopeSwitch
        // Le fil ne montre plus mes annonces (1.7) : sans ça, on les cherche.
        mineElsewhereHint
        if feed.isEmpty {
            JCEmptyState(
                icon: "bolt.slash",
                title: store.sosShowAll ? "Aucun SOS en cours" : "Aucun SOS pour toi",
                message: store.sosShowAll
                    ? "Un musicien te lâche ? Publie ton SOS avec le bouton +."
                    : "Rien à ton instrument et à ton niveau pour l'instant. Passe sur « Tout » pour voir le reste.",
                iconColor: JC.signal
            )
        }
        // Tous les musiciens voient les SOS au même moment. Premium vend des
        // outils d'organisation, jamais une priorité artificielle sur un
        // cachet ni un avantage qui assèche le réseau gratuit.
        VStack(spacing: 18) {
            ForEach(feed) { event in
                NavigationLink(value: event) {
                    EventCard(event: event, isNew: store.isUnseenGig(event))
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    /// Mes propres annonces ne sont plus dans le fil : on dit où elles sont,
    /// et un tap y emmène. Une chose qui disparaît sans explication, on la
    /// cherche — et on finit par la republier.
    @ViewBuilder
    private var mineElsewhereHint: some View {
        let mine = store.myGigs.count
        if mine > 0 {
            Button { withAnimation(.snappy) { segment = .hosting } } label: {
                HStack(spacing: 7) {
                    Image(systemName: "megaphone.fill")
                        .font(.caption2.weight(.bold))
                    Text(String(
                        format: store.tr("Tes %lld annonce·s sont dans « Mes SOS »"),
                        Int64(mine)
                    ))
                    .font(.caption.weight(.semibold))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.bold))
                }
                .foregroundStyle(JC.laiton)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(JC.laiton.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(PressableStyle())
        }
    }

    /// « Pour moi » / « Tout » — le fil est filtré par défaut sur mon
    /// instrument et mon niveau, mais rien n'est caché de force : le nombre
    /// d'annonces écartées est écrit noir sur blanc.
    private var scopeSwitch: some View {
        HStack(spacing: 10) {
            ForEach([false, true], id: \.self) { showAll in
                Button {
                    withAnimation(.snappy) { store.sosShowAll = showAll }
                } label: {
                    Text(showAll ? LocalizedStringKey("Tout") : "Pour moi")
                        .font(.caption.weight(.heavy))
                        .padding(.horizontal, 13)
                        .padding(.vertical, 7)
                        .background(
                            store.sosShowAll == showAll ? JC.laiton.opacity(0.2) : JC.inset,
                            in: Capsule()
                        )
                        .overlay(
                            Capsule().stroke(
                                store.sosShowAll == showAll ? JC.laiton.opacity(0.5) : .clear,
                                lineWidth: 1
                            )
                        )
                        .foregroundStyle(store.sosShowAll == showAll ? JC.laiton : .secondary)
                }
                .buttonStyle(PressableStyle())
            }
            Spacer(minLength: 0)
            if store.filteredOutCount > 0 {
                Text(String(format: store.tr("%lld autre·s dans « Tout »"), Int64(store.filteredOutCount)))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    // MARK: Ce que j'organise

    @ViewBuilder
    private var hostingSection: some View {
        VStack(spacing: 16) {
            if store.myGigs.isEmpty && store.mySentRequests.isEmpty {
                JCEmptyState(
                    icon: "megaphone",
                    title: "Tu n'organises rien pour l'instant",
                    message: "Publie un SOS avec le bouton + : les candidats arrivent ici, tu acceptes ou tu écartes en un tap.",
                    iconColor: JC.signal
                )
            }

            ForEach(store.myGigs) { gig in
                ManagedGigCard(
                    gig: gig,
                    isExpanded: expanded.contains(gig.id)
                        || !store.pendingApplicants(for: gig).isEmpty,
                    onToggle: {
                        withAnimation(.snappy) {
                            if expanded.contains(gig.id) { expanded.remove(gig.id) } else { expanded.insert(gig.id) }
                        }
                    },
                    onCancel: { gigToCancel = gig }
                )
            }

            if !store.mySentRequests.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader(
                        title: "Demandes envoyées",
                        subtitle: "Un musicien précis, à qui tu as demandé de dépanner"
                    )
                    ForEach(store.mySentRequests) { request in
                        SentRequestRow(request: request) { gigToCancel = request }
                    }
                }
            }
        }
    }

    /// Publier un SOS — bouton compact du header, l'écran reste épuré.
    private var createButton: some View {
        Button { showCreate = true } label: {
            HStack(spacing: 5) {
                Image(systemName: "plus")
                    .font(.caption.weight(.heavy))
                Text("SOS")
                    .font(.caption.weight(.heavy))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .background(JC.signal, in: Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(Text("Publier un SOS"))
    }
}

// MARK: - Gestion d'une de mes annonces (côté organisateur)

/// Une de mes annonces avec sa gestion en ligne : postes, candidats, décisions.
/// Tout se fait ici — pas d'écran de plus, pas de message à écrire.
struct ManagedGigCard: View {
    @EnvironmentObject private var store: AppStore
    let gig: GigRequest
    let isExpanded: Bool
    let onToggle: () -> Void
    let onCancel: () -> Void

    private var applicants: [GigApplicant] { store.applicantsByGig[gig.id] ?? [] }
    private var pending: [GigApplicant] { applicants.filter { $0.status == .pending } }

    private func accepted(for instrument: Instrument) -> GigApplicant? {
        applicants.first { $0.status == .accepted && $0.instrument == instrument }
    }

    var body: some View {
        JCCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                header
                slots
                if isExpanded && !applicants.isEmpty { candidates }
                footer
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 1) {
                Text(gig.date.formatted(.dateTime.day()))
                    .font(JCFont.display(22))
                Text(gig.date.formatted(.dateTime.month(.abbreviated)))
                    .font(JCFont.monoBold(9))
                    .textCase(.uppercase)
                    .tracking(1.1)
            }
            .foregroundStyle(JC.billetInk)
            .frame(width: 52)
            .padding(.vertical, 10)
            .background(gig.isFilled ? AnyShapeStyle(JC.serie) : AnyShapeStyle(JC.hero))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(gig.title)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                Label("\(gig.place) · \(gig.date.formatted(date: .omitted, time: .shortened))", systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if gig.isFilled {
                        TagView(text: "Complet", color: JC.feutrine)
                    } else if pending.isEmpty {
                        TagView(text: "En attente de candidats", color: JC.bronze)
                    } else {
                        // Typé explicitement : sans ça l'interpolation devient
                        // une String et la clé de traduction est perdue.
                        let todo: LocalizedStringKey = "\(pending.count) à traiter"
                        TagView(text: todo, color: JC.signal)
                    }
                    if gig.eventId != nil {
                        TagView(text: "Groupe", color: JC.bronze)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
    }

    /// Les postes de l'annonce : ouvert, ou tenu par un musicien nommé.
    private var slots: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(gig.wantedInstruments) { instrument in
                HStack(spacing: 8) {
                    Image(systemName: accepted(for: instrument) == nil ? "circle.dashed" : "checkmark.circle.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(accepted(for: instrument) == nil ? JC.bronze : JC.feutrine)
                    Text(LocalizedStringKey(instrument.rawValue))
                        .font(.caption.weight(.bold))
                    if let taken = accepted(for: instrument) {
                        Text(verbatim: "· \(taken.musician.name)")
                            .font(.caption)
                            .foregroundStyle(JC.feutrine)
                            .lineLimit(1)
                    } else {
                        let waiting = applicants.filter { $0.status == .pending && $0.instrument == instrument }.count
                        Text(waiting == 0
                             ? store.tr("aucun candidat")
                             : String(format: store.tr("%lld candidat·e·s"), Int64(waiting)))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }

    private var candidates: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider().opacity(0.4)
            ForEach(applicants) { applicant in
                ApplicantDecisionRow(applicant: applicant, gig: gig)
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if !applicants.isEmpty {
                Button(action: onToggle) {
                    HStack(spacing: 5) {
                        Image(systemName: isExpanded ? "chevron.up" : "person.2.fill")
                            .font(.caption2.weight(.bold))
                        Text(isExpanded ? LocalizedStringKey("Replier") : "\(applicants.count) candidatures")
                            .font(.caption.weight(.heavy))
                    }
                    .foregroundStyle(JC.bronze)
                }
                .buttonStyle(PressableStyle())
            }
            Spacer(minLength: 0)
            NavigationLink(value: gig) {
                Text("Voir l'annonce")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.laiton)
            }
            .buttonStyle(PressableStyle())
            Button(action: onCancel) {
                Image(systemName: "trash")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.signal)
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel(Text("Retirer l'annonce"))
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
    }
}

/// Un candidat et la décision qui va avec — accepter, écarter, ou revenir
/// dessus. Partagé entre « J'organise » et le détail d'une annonce.
struct ApplicantDecisionRow: View {
    @EnvironmentObject private var store: AppStore
    let applicant: GigApplicant
    let gig: GigRequest

    var body: some View {
        HStack(spacing: 10) {
            NavigationLink(value: applicant.musician) {
                HStack(spacing: 10) {
                    AvatarView(name: applicant.musician.name, size: 38, photo: applicant.musician.photo)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(applicant.musician.name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        HStack(spacing: 5) {
                            if let instrument = applicant.instrument {
                                Text(LocalizedStringKey(instrument.rawValue))
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(JC.bronze)
                            }
                            if applicant.musician.isDemo { DemoAccountBadge() }
                        }
                    }
                }
            }
            .buttonStyle(PressableStyle())

            Spacer(minLength: 0)

            switch applicant.status {
            case .pending:
                Button {
                    store.declineApplicant(applicant, in: gig)
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(JC.signal)
                        .frame(width: 30, height: 30)
                        .background(JC.signal.opacity(0.14), in: Circle())
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel(Text("Écarter"))
                Button {
                    store.acceptApplicant(applicant, in: gig)
                } label: {
                    Text("Accepter")
                        .font(.caption.weight(.heavy))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(JC.hero, in: Capsule())
                        .foregroundStyle(JC.billetInk)
                }
                .buttonStyle(PressableStyle())
            case .accepted:
                Menu {
                    Button("Libérer le poste", systemImage: "arrow.uturn.backward") {
                        store.reopenApplicant(applicant, in: gig)
                    }
                } label: {
                    Label("Pris·e", systemImage: "checkmark.seal.fill")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(JC.feutrine)
                }
            case .declined:
                Menu {
                    Button("Revenir dessus", systemImage: "arrow.uturn.backward") {
                        store.reopenApplicant(applicant, in: gig)
                    }
                } label: {
                    Text("Écarté·e")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Demandes de dépannage adressées à une personne

/// Une demande reçue : j'accepte ou je refuse, tout le reste est automatique.
struct IncomingRequestCard: View {
    @EnvironmentObject private var store: AppStore
    let request: GigRequest

    var body: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "bolt.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.signal)
                    Text("\(request.hostName) te demande de dépanner")
                        .font(.subheadline.weight(.bold))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
                VStack(alignment: .leading, spacing: 5) {
                    if let instrument = request.wantedInstruments.first {
                        Label(LocalizedStringKey(instrument.rawValue), systemImage: "music.note")
                    }
                    Label(request.date.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                    Label(request.place, systemImage: "mappin.and.ellipse")
                    if store.profile.level == .pro {
                        Label {
                            Text("Cachet : \(store.tr(request.feeLabel))")
                        } icon: {
                            Image(systemName: "banknote")
                        }
                        .foregroundStyle(JC.laiton)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                if !request.descriptionText.isEmpty {
                    Text(request.descriptionText)
                        .font(.caption)
                        .foregroundStyle(.primary.opacity(0.9))
                }

                HStack(spacing: 10) {
                    Button {
                        store.respondToDirectRequest(request, accept: false)
                    } label: {
                        Text("Je ne peux pas")
                            .font(.caption.weight(.heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(JC.inset, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(Color.primary)
                    }
                    .buttonStyle(PressableStyle())
                    Button {
                        store.respondToDirectRequest(request, accept: true)
                    } label: {
                        Text("J'accepte")
                            .font(.caption.weight(.heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(JC.hero, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(JC.billetInk)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }
}

/// Une demande que j'ai envoyée à quelqu'un, et où elle en est.
struct SentRequestRow: View {
    @EnvironmentObject private var store: AppStore
    let request: GigRequest
    let onCancel: () -> Void

    private var statusTag: (text: String, color: Color) {
        switch request.targetStatus {
        case .accepted: return ("Acceptée", JC.feutrine)
        case .declined: return ("Refusée", JC.signal)
        default: return ("En attente", JC.bronze)
        }
    }

    var body: some View {
        JCCard {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(request.title)
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                    Text(verbatim: "\(request.date.formatted(date: .abbreviated, time: .shortened)) · \(request.place)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    TagView(text: statusTag.text, color: statusTag.color)
                }
                Spacer(minLength: 0)
                if request.targetStatus != .accepted {
                    Button(action: onCancel) {
                        Image(systemName: "trash")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(JC.signal)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(Text("Retirer la demande"))
                }
            }
        }
    }
}

// MARK: - Le billet d'un SOS dans le fil

/// Une annonce du fil, en billet de concert : talon-date, postes ouverts,
/// pastille « nouveau » tant qu'elle n'a pas été ouverte.
struct EventCard: View {
    let event: GigRequest
    /// Annonce jamais ouverte : une pastille laiton devant le titre, comme
    /// une conversation non lue.
    var isNew = false

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(JC.billetSignal)
                        .frame(width: 7, height: 7)
                    Text(LocalizedStringKey(event.genre.rawValue))
                        .font(JCFont.monoBold(9))
                        .textCase(.uppercase)
                        .tracking(1.4)
                        .foregroundStyle(JC.billetSignal)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if event.isMine {
                        TagView(text: "Mon SOS", color: JC.billetBronze)
                    } else if event.applied {
                        TagView(text: "Postulé", color: JC.billetFeutrine)
                    }
                }
                HStack(spacing: 6) {
                    if isNew {
                        Circle()
                            .fill(JC.billetLaiton)
                            .frame(width: 8, height: 8)
                            .accessibilityLabel(Text("Nouveau"))
                    }
                    Text(event.title)
                        .font(.subheadline.weight(isNew ? .heavy : .bold))
                        .foregroundStyle(JC.billetInk)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .foregroundStyle(JC.billetInk.opacity(0.62))
                    .lineLimit(1)
                // Les pastilles passent à la ligne au besoin (jamais de
                // texte écrasé à la verticale).
                FlowLayout(spacing: 5) {
                    if event.openInstruments.isEmpty {
                        TagView(text: "Complet", color: JC.billetFeutrine)
                    } else {
                        Text("Cherche")
                            .font(JCFont.mono(9))
                            .textCase(.uppercase)
                            .tracking(1)
                            .foregroundStyle(JC.billetInk.opacity(0.45))
                        ForEach(event.openInstruments.prefix(3)) { instrument in
                            TagView(text: instrument.rawValue, color: JC.billetBronze)
                        }
                        if event.openInstruments.count > 3 {
                            TagView(text: "+\(event.openInstruments.count - 3)", color: JC.billetBronze)
                        }
                    }
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)

            // Talon-date, séparé par la perforation.
            VStack(spacing: 2) {
                Text(event.date.formatted(.dateTime.day()))
                    .font(JCFont.display(24))
                Text(event.date.formatted(.dateTime.month(.abbreviated)))
                    .font(JCFont.monoBold(10))
                    .textCase(.uppercase)
                    .tracking(1.2)
                Text(event.date.formatted(date: .omitted, time: .shortened))
                    .font(JCFont.mono(10))
                    .opacity(0.6)
                BarcodeStrip(seed: event.title.stableHash)
                    .padding(.top, 4)
            }
            .foregroundStyle(JC.billetInk)
            .frame(width: 74)
            .frame(maxHeight: .infinity)
            .overlay(alignment: .leading) { PerforationLine().padding(.vertical, 4) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(JC.billetPaper)
        .clipShape(TicketShape(cornerRadius: 18, notchFromTrailing: 74), style: FillStyle(eoFill: true))
        .shadow(color: .black.opacity(0.28), radius: 12, x: 0, y: 7)
    }
}

struct EventDetailView: View {
    @EnvironmentObject private var store: AppStore
    let eventID: GigRequest.ID
    @State private var showInstrumentPicker = false

    private var event: GigRequest? {
        store.events.first(where: { $0.id == eventID })
    }

    var body: some View {
        if let event {
            detail(for: event)
        } else {
            ZStack {
                JCBackground()
                JCEmptyState(
                    icon: "bolt.slash",
                    title: "Annonce introuvable",
                    message: "Ce SOS n'existe plus — le concert est passé ou l'annonce a été retirée."
                )
                .padding(.horizontal, 18)
            }
            .navigationTitle("SOS dépannage")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func detail(for event: GigRequest) -> some View {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // En-tête épuré — plus de photo de couverture.
                        VStack(alignment: .leading, spacing: 6) {
                            Text(event.title)
                                .font(.title2.weight(.heavy))
                                .tracking(-0.4)
                            HStack(spacing: 8) {
                                Text("Publié par \(event.hostName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                TagView(text: event.genre.rawValue, color: event.genre.color)
                            }
                        }
                        .padding(.top, 8)

                        JCCard {
                            VStack(alignment: .leading, spacing: 11) {
                                Label(event.date.formatted(date: .complete, time: .shortened), systemImage: "calendar")
                                Label("\(event.place) · \(event.neighborhood)", systemImage: "map")
                                Label("\(store.tr(event.genre.rawValue)) — \(event.genre.codes.map { store.tr($0) }.joined(separator: ", "))", systemImage: "music.quarternote.3")
                                // Le serveur ne renvoie le cachet qu'aux
                                // professionnels : pour les autres, la ligne
                                // n'existe pas plutôt que d'afficher un
                                // « à discuter » trompeur.
                                if store.profile.level == .pro {
                                    Label {
                                        Text("Cachet : \(store.tr(event.feeLabel))")
                                        + Text(verbatim: event.paymentLabel.map { " · \(store.tr($0))" } ?? "")
                                    } icon: {
                                        Image(systemName: "banknote")
                                    }
                                    .foregroundStyle(JC.laiton)
                                }
                            }
                            .font(.subheadline)
                        }

                        // Le rendez-vous précis vient d'une RPC privée : le
                        // serveur ne le renvoie qu'aux personnes autorisées.
                        GigPrivateLocationCard(event: event)

                        JCCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Musicien recherché")
                                    .font(.subheadline.weight(.heavy))
                                    .foregroundStyle(JC.signal)
                                if event.openInstruments.isEmpty {
                                    Label("Tous les postes sont pourvus.", systemImage: "checkmark.circle")
                                        .font(.caption)
                                        .foregroundStyle(JC.feutrine)
                                } else {
                                    FlowLayout {
                                        ForEach(event.openInstruments) { instrument in
                                            TagView(text: instrument.rawValue, color: JC.bronze)
                                        }
                                    }
                                }
                                // Le niveau demandé, quand l'organisateur en
                                // a choisi un : c'est ce qui décide qui voit
                                // l'annonce dans son fil.
                                if let levels = event.levelsLabel {
                                    FlowLayout(spacing: 5) {
                                        Text("Niveau demandé")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.secondary)
                                        ForEach(event.levels.sorted(), id: \.self) { level in
                                            TagView(text: level.label, color: JC.laiton)
                                        }
                                    }
                                    .accessibilityLabel(Text(verbatim: levels))
                                }
                                if let filled = event.filledInstruments, !filled.isEmpty {
                                    FlowLayout(spacing: 5) {
                                        Text("Pourvu")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(JC.feutrine)
                                        ForEach(filled) { instrument in
                                            TagView(text: instrument.rawValue, color: JC.feutrine)
                                        }
                                    }
                                }
                            }
                        }

                        if !event.descriptionText.isEmpty {
                            JCCard {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Description")
                                        .font(.subheadline.weight(.heavy))
                                        .foregroundStyle(JC.signal)
                                    Text(event.descriptionText)
                                        .font(.subheadline)
                                        .foregroundStyle(.primary.opacity(0.9))
                                }
                            }
                        }

                        if event.isMine {
                            applicantsCard(for: event)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 90)
                }
            }
            .navigationTitle("SOS dépannage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(JC.bg, for: .navigationBar)
            .onAppear {
                store.loadApplicants(for: event)
                // L'annonce est ouverte : sa pastille « nouveau » s'éteint.
                store.markGigOpened(event.id)
            }
            .safeAreaInset(edge: .bottom) {
                bottomBar(for: event)
            }
    }

    /// Musiciens compatibles avec mon annonce — le matching reste consultable
    /// après la publication. Vide : on assume l'attente et on explique quand
    /// des matchs apparaîtront.
    /// Candidatures reçues, groupées par instrument — l'organisateur accepte
    /// qui il veut pour chaque poste ; le poste pourvu disparaît des annonces.
    private func applicantsCard(for event: GigRequest) -> some View {
        let applicants = store.applicantsByGig[event.id] ?? []
        return JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Candidatures")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.signal)
                if applicants.isEmpty {
                    Label {
                        Text("Personne n'a encore postulé. Dès qu'un musicien se propose, tu choisiras ici qui prend chaque poste.")
                    } icon: {
                        Image(systemName: "hourglass")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } else {
                    ForEach(event.wantedInstruments) { instrument in
                        let group = applicants.filter { $0.instrument == instrument }
                        if !group.isEmpty {
                            applicantsGroup(
                                title: store.tr(instrument.rawValue),
                                filled: (event.filledInstruments ?? []).contains(instrument),
                                applicants: group,
                                event: event
                            )
                        }
                    }
                    let unspecified = applicants.filter { $0.instrument == nil }
                    if !unspecified.isEmpty {
                        applicantsGroup(title: store.tr("Autre"), filled: false, applicants: unspecified, event: event)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func applicantsGroup(title: String, filled: Bool, applicants: [GigApplicant], event: GigRequest) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(verbatim: title)
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.bronze)
                if filled { TagView(text: "Pourvu", color: JC.feutrine) }
            }
            ForEach(applicants) { applicant in
                ApplicantDecisionRow(applicant: applicant, gig: event)
            }
        }
    }

    @ViewBuilder
    fileprivate func bottomBar(for event: GigRequest) -> some View {
        if !event.isMine {
            applyControl(for: event)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial)
        }
    }

    @ViewBuilder
    private func applyControl(for event: GigRequest) -> some View {
        // Demande adressée à moi : je réponds, je ne « postule » pas.
        if event.isDirect, event.targetStatus == .pending {
            HStack(spacing: 10) {
                Button {
                    store.respondToDirectRequest(event, accept: false)
                } label: {
                    Text("Je ne peux pas")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .foregroundStyle(Color.primary)
                }
                .buttonStyle(PressableStyle())
                Button {
                    store.respondToDirectRequest(event, accept: true)
                } label: {
                    Text("J'accepte")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(JC.hero, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .foregroundStyle(JC.billetInk)
                }
                .buttonStyle(PressableStyle())
            }
        } else if event.isDirect, event.targetStatus == .declined {
            Label("Tu as décliné cette demande", systemImage: "xmark.circle")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .foregroundStyle(.secondary)
        } else if event.myApplicationStatus == .accepted {
            Label(
                event.myApplicationInstrument.map {
                    String(format: store.tr("Tu es pris·e ! (%@)"), store.tr($0.rawValue))
                } ?? store.tr("Tu es pris·e !"),
                systemImage: "checkmark.seal.fill"
            )
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(JC.feutrine.opacity(0.18), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .foregroundStyle(JC.feutrine)
        } else if event.applied {
            Button {
                store.withdrawApplication(event)
            } label: {
                Label("Retirer ma candidature", systemImage: "xmark.circle")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(Color.primary)
            }
            .buttonStyle(PressableStyle())
        } else if event.openInstruments.isEmpty {
            Label("Tous les postes sont pourvus", systemImage: "checkmark.circle")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .foregroundStyle(.secondary)
        } else {
            Button {
                if event.openInstruments.count == 1 {
                    store.applyToGig(event, instrument: event.openInstruments.first)
                } else {
                    showInstrumentPicker = true
                }
            } label: {
                Label("Je peux dépanner !", systemImage: "bolt.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(JC.hero, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(JC.billetInk)
            }
            .buttonStyle(PressableStyle())
            .confirmationDialog(
                "Quel poste peux-tu tenir ?",
                isPresented: $showInstrumentPicker,
                titleVisibility: .visible
            ) {
                ForEach(event.openInstruments) { instrument in
                    Button(store.tr(instrument.rawValue)) {
                        store.applyToGig(event, instrument: instrument)
                    }
                }
            }
        }
    }
}

// MARK: - Rendez-vous privé du SOS

/// Adresse et itinéraire ne sont jamais déduits du libellé public. La présence
/// de `exactAddress` est la preuve que la RLS a autorisé ce compte.
struct GigPrivateLocationCard: View {
    let event: GigRequest
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var lookupDone = false

    var body: some View {
        JCCard(padding: event.resolvedPrivateLocationState == .available ? 0 : 14) {
            if let exactAddress = event.exactAddress,
               event.resolvedPrivateLocationState == .available {
                VStack(spacing: 0) {
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: "lock.open.fill")
                            .foregroundStyle(JC.feutrine)
                            .frame(width: 24, height: 24)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Rendez-vous privé")
                                .font(.subheadline.weight(.heavy))
                            Text(verbatim: exactAddress)
                                .font(.subheadline)
                            Text("Partagé uniquement avec l'organisateur et les personnes acceptées.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(14)

                    if let coordinate {
                        Map(initialPosition: .region(MKCoordinateRegion(
                            center: coordinate,
                            span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
                        ))) {
                            Marker("Rendez-vous", systemImage: "music.mic", coordinate: coordinate)
                                .tint(JC.signal)
                        }
                        .frame(height: 150)
                        .allowsHitTesting(false)

                        Button {
                            openInMaps(coordinate, address: exactAddress)
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                                    .font(.subheadline.weight(.bold))
                                Text("Ouvrir l'itinéraire")
                                    .font(.caption.weight(.bold))
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                                Image(systemName: "arrow.up.right")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(12)
                            .foregroundStyle(JC.bronze)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            } else {
                HStack(alignment: .top, spacing: 11) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(JC.feutrine.opacity(0.12))
                            .frame(width: 38, height: 38)
                        Image(systemName: protectedSymbol)
                            .foregroundStyle(JC.feutrine)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(LocalizedStringKey(protectedTitle))
                            .font(.subheadline.weight(.heavy))
                        Text(LocalizedStringKey(protectedMessage))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .task(id: event.exactAddress) {
            guard !lookupDone else { return }
            lookupDone = true
            guard event.resolvedPrivateLocationState == .available,
                  let exactAddress = event.exactAddress else { return }
            let placemarks = try? await CLGeocoder().geocodeAddressString(
                "\(exactAddress), \(event.neighborhood)"
            )
            coordinate = placemarks?.first?.location?.coordinate
        }
    }

    private var protectedTitle: String {
        switch event.resolvedPrivateLocationState {
        case .unknown: return "Adresse privée non chargée"
        case .absent: return "Aucune adresse privée"
        case .restricted, .available: return "Adresse protégée"
        }
    }

    private var protectedMessage: String {
        switch event.resolvedPrivateLocationState {
        case .unknown:
            return "Le chargement a échoué. L'adresse serveur n'a pas été modifiée."
        case .absent:
            return "Aucune adresse privée n'a encore été renseignée."
        case .restricted:
            return "Elle apparaîtra ici si ta candidature ou ta demande est acceptée."
        case .available:
            return "Partagée uniquement avec les personnes autorisées."
        }
    }

    private var protectedSymbol: String {
        event.resolvedPrivateLocationState == .unknown
            ? "exclamationmark.arrow.triangle.2.circlepath"
            : "lock.shield.fill"
    }

    private func openInMaps(_ coordinate: CLLocationCoordinate2D, address: String) {
        let placemark = MKPlacemark(coordinate: coordinate)
        let item = MKMapItem(placemark: placemark)
        item.name = address
        item.openInMaps()
    }
}
