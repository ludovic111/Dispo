import SwiftUI
import MapKit

struct EventsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 18) {
                        ScreenHeader(
                            title: "SOS dépannage",
                            subtitle: "\(store.events.count) concerts cherchent un musicien",
                            icon: "bolt.fill",
                            iconColor: JC.signal,
                            trailing: AnyView(createButton)
                        )

                        if store.events.isEmpty {
                            JCEmptyState(
                                icon: "bolt.slash",
                                title: "Aucun SOS en cours",
                                message: "Un musicien te lâche ? Publie ton SOS avec le bouton +.",
                                iconColor: JC.signal
                            )
                        }

                        // Les annonces fraîches (< 30 min) sont en avant-première
                        // Premium : les non-abonnés voient le cachet mais pas le
                        // lieu — la minuterie rend l'avantage Premium concret.
                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            VStack(spacing: 18) {
                                ForEach(store.events) { event in
                                    if event.isEarlyAccess(now: context.date) && !store.isPremium {
                                        Button { store.showPaywall = true } label: {
                                            LockedEventCard(event: event, now: context.date)
                                        }
                                        .buttonStyle(PressableStyle())
                                    } else {
                                        NavigationLink(value: event) {
                                            EventCard(event: event)
                                        }
                                        .buttonStyle(PressableStyle())
                                    }
                                }
                            }
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
            .sheet(isPresented: $showCreate) {
                CreateEventView()
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

/// Un SOS est un concert : la carte est un billet — papier ivoire, encre
/// fixe, perforation punchée et talon-date. Le cachet ne s'affiche pas
/// sur le billet, il se découvre en ouvrant le SOS.
struct EventCard: View {
    let event: GigRequest

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
                Text(event.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(JC.billetInk)
                    .lineLimit(1)
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

/// Annonce en avant-première Premium : cachet et instrument visibles (le
/// teasing), titre et lieu masqués jusqu'à la fin de la minuterie.
struct LockedEventCard: View {
    @EnvironmentObject private var store: AppStore
    let event: GigRequest
    let now: Date

    /// Minutes restantes avant l'ouverture à tous (arrondi supérieur).
    private var remainingMinutes: Int {
        guard let end = event.earlyAccessEnd else { return 0 }
        return max(1, Int((end.timeIntervalSince(now) / 60).rounded(.up)))
    }

    var body: some View {
        VStack(spacing: 0) {
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
                        TagView(text: "Nouveau", color: JC.billetLaiton)
                    }
                    Text("Nouveau SOS \(store.tr(event.genre.rawValue))")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(JC.billetInk)
                        .lineLimit(1)
                    Label("Lieu révélé aux membres Premium", systemImage: "mappin.slash")
                        .font(.caption)
                        .foregroundStyle(JC.billetInk.opacity(0.62))
                        .lineLimit(1)
                    FlowLayout(spacing: 5) {
                        Text("Cherche")
                            .font(JCFont.mono(9))
                            .textCase(.uppercase)
                            .tracking(1)
                            .foregroundStyle(JC.billetInk.opacity(0.45))
                        ForEach(event.wantedInstruments.prefix(3)) { instrument in
                            TagView(text: instrument.rawValue, color: JC.billetBronze)
                        }
                        if event.wantedInstruments.count > 3 {
                            TagView(text: "+\(event.wantedInstruments.count - 3)", color: JC.billetBronze)
                        }
                    }
                }
                .padding(13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(JC.billetPaper)

                // Talon verrouillé — le pass backstage garde la date.
                VStack(spacing: 4) {
                    Image(systemName: "lock.fill")
                        .font(.subheadline.weight(.bold))
                    Text(event.date.formatted(.dateTime.day()))
                        .font(JCFont.display(22))
                    Text(event.date.formatted(.dateTime.month(.abbreviated)))
                        .font(JCFont.monoBold(10))
                        .textCase(.uppercase)
                        .tracking(1.2)
                }
                .foregroundStyle(JC.billetPaper)
                .frame(width: 74)
                .frame(maxHeight: .infinity)
                .background(JC.premium)
                .overlay(alignment: .leading) { PerforationLine().padding(.vertical, 4) }
            }
            .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Image(systemName: "crown.fill")
                    .font(.caption2.weight(.bold))
                Text("En avant-première Premium · ouvert à tous dans \(remainingMinutes) min")
                    .font(.caption2.weight(.bold))
                Spacer(minLength: 0)
                Text("Débloquer")
                    .font(.caption2.weight(.heavy))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(JC.billetInk.opacity(0.88), in: Capsule())
                    .foregroundStyle(JC.laiton)
            }
            .foregroundStyle(JC.billetPaper)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(JC.premium)
        }
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
                                Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin.and.ellipse")
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

                        // Le lieu sur la carte — géocodé à la volée.
                        GigPlaceMapCard(event: event)

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
            .onAppear { store.loadApplicants(for: event) }
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
                HStack(spacing: 10) {
                    NavigationLink(value: applicant.musician) {
                        HStack(spacing: 10) {
                            AvatarView(name: applicant.musician.name, size: 36, photo: applicant.musician.photo)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(applicant.musician.name)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(.primary)
                                if let summary = store.ratingSummary(for: applicant.musician) {
                                    RatingBadge(summary: summary)
                                }
                            }
                        }
                    }
                    .buttonStyle(PressableStyle())
                    Spacer(minLength: 0)
                    applicantAction(applicant, in: event)
                }
            }
        }
    }

    @ViewBuilder
    private func applicantAction(_ applicant: GigApplicant, in event: GigRequest) -> some View {
        switch applicant.status {
        case .accepted:
            Label("Pris·e", systemImage: "checkmark.seal.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(JC.feutrine)
        case .declined:
            Text("Non retenu·e")
                .font(.caption)
                .foregroundStyle(.secondary)
        case .pending:
            Button {
                store.acceptApplicant(applicant, in: event)
            } label: {
                Text("Accepter")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(JC.hero, in: Capsule())
                    .foregroundStyle(JC.billetInk)
            }
            .buttonStyle(PressableStyle())
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
        if event.myApplicationStatus == .accepted {
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

// MARK: - Carte du lieu du SOS

/// Mini-carte du lieu du concert, géocodée depuis « salle · quartier ».
/// Un tap ouvre Plans pour l'itinéraire. Invisible si le lieu est
/// introuvable — jamais de fausse épingle.
struct GigPlaceMapCard: View {
    let event: GigRequest
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var lookupDone = false

    private var query: String {
        "\(event.place), \(event.neighborhood)"
    }

    var body: some View {
        Group {
            if let coordinate {
                JCCard(padding: 0) {
                    VStack(spacing: 0) {
                        Map(initialPosition: .region(MKCoordinateRegion(
                            center: coordinate,
                            span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
                        ))) {
                            Marker(event.place, systemImage: "music.mic", coordinate: coordinate)
                                .tint(JC.signal)
                        }
                        .frame(height: 150)
                        .allowsHitTesting(false)

                        Button {
                            openInMaps(coordinate)
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                                    .font(.subheadline.weight(.bold))
                                Text("Itinéraire vers \(event.place)")
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
            }
        }
        .task(id: event.id) {
            guard !lookupDone else { return }
            lookupDone = true
            let placemarks = try? await CLGeocoder().geocodeAddressString(query)
            coordinate = placemarks?.first?.location?.coordinate
        }
    }

    private func openInMaps(_ coordinate: CLLocationCoordinate2D) {
        let placemark = MKPlacemark(coordinate: coordinate)
        let item = MKMapItem(placemark: placemark)
        item.name = event.place
        item.openInMaps()
    }
}
