import SwiftUI
import MapKit

/// Onglet Carte : tous les musiciens localisés autour de soi, plein écran.
/// Les positions sont approximatives (niveau ville) sauf pour ceux qui
/// partagent leur position exacte — le badge de la fiche fait foi.
struct MapTabView: View {
    @EnvironmentObject private var store: AppStore
    @State private var selected: Musician?
    @State private var position: MapCameraPosition = .automatic

    /// Jamais d'épingle à une position placeholder — ni pour ceux qui ont
    /// choisi de ne pas apparaître (leur profil n'a alors plus de
    /// coordonnées côté serveur, `hasLocation` est faux).
    private var locatedMusicians: [Musician] {
        store.musicians.filter(\.hasLocation)
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Map(position: $position) {
                    UserAnnotation()
                    ForEach(locatedMusicians) { musician in
                        Annotation(musician.name, coordinate: musician.coordinate) {
                            Button {
                                selected = musician
                            } label: {
                                MapMusicianPin(musician: musician)
                            }
                        }
                    }
                }
                .mapControls {
                    MapUserLocationButton()
                    MapCompass()
                }

                header
            }
            .toolbar(.hidden, for: .navigationBar)
            .onAppear {
                if store.isLive { store.requestLocation() }
                centerOnReference()
            }
            .sheet(item: $selected) { musician in
                NavigationStack {
                    MusicianDetailView(musician: musician)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("OK") { selected = nil }.font(.headline)
                            }
                        }
                }
                .presentationDetents([.large])
            }
        }
    }

    /// Cadre initial : ma position (ou Genève), assez large pour voir du monde.
    private func centerOnReference() {
        let center = store.referenceCoordinate ?? AppStore.geneva
        position = .region(MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.25, longitudeDelta: 0.25)
        ))
    }

    /// Bandeau flottant : compteur + rappel de confidentialité.
    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "map.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(JC.bronze)
                Text("\(locatedMusicians.count) musiciens sur la carte")
                    .font(.subheadline.weight(.bold))
                Spacer(minLength: 0)
            }
            HStack(spacing: 6) {
                let hidden = !store.locationPrecision.sharesLocation
                Image(systemName: hidden ? "eye.slash.fill" : "shield.lefthalf.filled")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(hidden ? JC.laiton : .secondary)
                Text(hidden
                     ? "Tu n'apparais pas sur la carte — Réglages → Ma position pour changer."
                     : "Positions approximatives (niveau ville), sauf partage exact choisi dans les réglages.")
                    .font(.caption2)
                    .foregroundStyle(hidden ? JC.laiton : .secondary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(JC.cardStroke, lineWidth: 1)
        )
        .padding(.horizontal, 18)
        .padding(.top, 8)
    }
}

/// Épingle d'un musicien : avatar cerclé + pastille d'horizon de dispo.
struct MapMusicianPin: View {
    let musician: Musician

    var body: some View {
        AvatarView(name: musician.name, size: 38, photo: musician.photo)
            .overlay(Circle().stroke(.white, lineWidth: 2))
            .overlay(alignment: .topTrailing) {
                if musician.isAvailable {
                    Circle()
                        .fill(musician.availability.color)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(.white, lineWidth: 1.5))
                }
            }
            .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
    }
}
