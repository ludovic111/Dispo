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
                            iconColor: JC.coral,
                            trailing: AnyView(createButton)
                        )

                        if store.events.isEmpty {
                            JCEmptyState(
                                icon: "bolt.slash",
                                title: "Aucun SOS en cours",
                                message: "Un musicien te lâche ? Publie ton SOS avec le bouton +.",
                                iconColor: JC.coral
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
            .background(JC.hero, in: Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(Text("Publier un SOS"))
    }
}

struct EventCard: View {
    let event: GigRequest

    var body: some View {
        HStack(spacing: 0) {
            // Bloc date coloré par genre
            VStack(spacing: 2) {
                Text(event.date.formatted(.dateTime.day()))
                    .font(.title2.weight(.heavy))
                Text(event.date.formatted(.dateTime.month(.abbreviated)))
                    .font(.caption2.weight(.bold))
                    .textCase(.uppercase)
                Text(event.date.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 10, weight: .semibold))
                    .opacity(0.85)
            }
            .foregroundStyle(.white)
            .frame(width: 68)
            .frame(maxHeight: .infinity)
            .background(event.genre.gradient)

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(event.title)
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if event.isMine {
                        TagView(text: "Mon SOS", color: JC.violet)
                    } else if event.applied {
                        TagView(text: "Postulé", color: .green)
                    }
                }
                Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                // Le cachet ne s'affiche plus sur la carte — il se découvre
                // en ouvrant le SOS. Les pastilles passent à la ligne au
                // besoin (jamais de texte écrasé à la verticale).
                FlowLayout(spacing: 5) {
                    Text("Cherche")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.tertiary)
                    ForEach(event.wantedInstruments.prefix(3)) { instrument in
                        TagView(text: instrument.rawValue, color: .teal)
                    }
                    if event.wantedInstruments.count > 3 {
                        TagView(text: "+\(event.wantedInstruments.count - 3)", color: .teal)
                    }
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(JC.card)
        }
        .fixedSize(horizontal: false, vertical: true)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(JC.cardStroke, lineWidth: 1))
        .shadow(color: JC.cardShadow, radius: 14, x: 0, y: 8)
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
                VStack(spacing: 4) {
                    Image(systemName: "lock.fill")
                        .font(.title3.weight(.bold))
                    Text(event.date.formatted(.dateTime.day().month(.abbreviated)))
                        .font(.caption2.weight(.bold))
                        .textCase(.uppercase)
                }
                .foregroundStyle(.black)
                .frame(width: 68)
                .frame(maxHeight: .infinity)
                .background(JC.premium)

                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text("Nouveau SOS \(store.tr(event.genre.rawValue))")
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        TagView(text: "Nouveau", color: JC.gold)
                    }
                    Label("Lieu révélé aux membres Premium", systemImage: "mappin.slash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    FlowLayout(spacing: 5) {
                        Text("Cherche")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.tertiary)
                        ForEach(event.wantedInstruments.prefix(3)) { instrument in
                            TagView(text: instrument.rawValue, color: .teal)
                        }
                        if event.wantedInstruments.count > 3 {
                            TagView(text: "+\(event.wantedInstruments.count - 3)", color: .teal)
                        }
                    }
                }
                .padding(13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(JC.card)
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
                    .background(.black.opacity(0.85), in: Capsule())
                    .foregroundStyle(JC.gold)
            }
            .foregroundStyle(.black)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(JC.premium)
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(JC.gold.opacity(0.5), lineWidth: 1))
        .shadow(color: JC.cardShadow, radius: 14, x: 0, y: 8)
    }
}

struct EventDetailView: View {
    @EnvironmentObject private var store: AppStore
    let eventID: GigRequest.ID

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
                                Label {
                                    Text("Cachet : \(store.tr(event.feeLabel))")
                                    + Text(verbatim: event.paymentLabel.map { " · \(store.tr($0))" } ?? "")
                                } icon: {
                                    Image(systemName: "banknote")
                                }
                                .foregroundStyle(JC.gold)
                            }
                            .font(.subheadline)
                        }

                        // Le lieu sur la carte — géocodé à la volée.
                        GigPlaceMapCard(event: event)

                        JCCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Musicien recherché")
                                    .font(.subheadline.weight(.heavy))
                                    .foregroundStyle(JC.coral)
                                FlowLayout {
                                    ForEach(event.wantedInstruments) { instrument in
                                        TagView(text: instrument.rawValue, color: .teal)
                                    }
                                }
                            }
                        }

                        if !event.descriptionText.isEmpty {
                            JCCard {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Description")
                                        .font(.subheadline.weight(.heavy))
                                        .foregroundStyle(JC.coral)
                                    Text(event.descriptionText)
                                        .font(.subheadline)
                                        .foregroundStyle(.primary.opacity(0.9))
                                }
                            }
                        }

                        if event.isMine {
                            matchesCard(for: event)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 90)
                }
            }
            .navigationTitle("SOS dépannage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(JC.bg, for: .navigationBar)
            .safeAreaInset(edge: .bottom) {
                bottomBar(for: event)
            }
    }

    /// Musiciens compatibles avec mon annonce — le matching reste consultable
    /// après la publication. Vide : on assume l'attente et on explique quand
    /// des matchs apparaîtront.
    private func matchesCard(for event: GigRequest) -> some View {
        let matches = store.matches(for: event)
        return JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Musiciens compatibles")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.coral)
                if matches.isEmpty {
                    Label {
                        Text("Personne ne matche pour l'instant. Dès qu'un musicien compatible coche le \(event.date.formatted(.dateTime.day().month(.wide))) dans son calendrier, il apparaîtra ici.")
                    } icon: {
                        Image(systemName: "hourglass")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } else {
                    ForEach(matches.prefix(5)) { match in
                        NavigationLink(value: match.musician) {
                            SOSMatchRow(match: match, gig: event)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
        }
    }

    @ViewBuilder
    fileprivate func bottomBar(for event: GigRequest) -> some View {
                if !event.isMine {
                    Button {
                        store.toggleApply(event)
                    } label: {
                        Label(
                            event.applied ? "Retirer ma candidature" : "Je peux dépanner !",
                            systemImage: event.applied ? "xmark.circle" : "bolt.fill"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(
                            event.applied
                                ? AnyShapeStyle(JC.card)
                                : AnyShapeStyle(JC.hero),
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                        )
                        .foregroundStyle(event.applied ? Color.primary : Color.white)
                    }
                    .buttonStyle(PressableStyle())
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
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
                                .tint(JC.coral)
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
                            .foregroundStyle(JC.violet)
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
