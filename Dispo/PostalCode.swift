import SwiftUI
import CoreLocation
import Contacts

/// Trouver une ville à partir d'un code postal.
///
/// Personne n'a envie de chercher « Chêne-Bougeries » dans une liste : on tape
/// 1224 et l'app trouve. L'annuaire embarqué répond instantanément et hors
/// ligne pour les codes qu'il connaît ; le géocodeur d'Apple prend le relais
/// pour tous les autres (1201, 1205, 74100…).
@MainActor
final class PostalCodeResolver: ObservableObject {
    enum Status: Equatable {
        case idle
        case searching
        case found(String)
        case notFound
    }

    @Published private(set) var status: Status = .idle

    private var task: Task<Void, Never>?
    /// Codes déjà résolus (« CH-1201 » → « Genève ») — un géocodage suffit.
    private static var cache: [String: String] = [:]

    /// Le code est-il assez complet pour tenter quelque chose ?
    static func isPlausible(_ code: String, in country: Country) -> Bool {
        let trimmed = code.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 3 else { return false }
        // Codes purement numériques (Europe continentale) ou alphanumériques
        // (Royaume-Uni, Canada, Pays-Bas) — on ne juge que la longueur.
        return trimmed.count <= 10
    }

    /// Résout le code après une courte pause : le temps que l'utilisateur
    /// finisse de taper, et on n'appelle le géocodeur qu'une fois.
    func resolve(code: String, country: Country, onFound: @escaping (String) -> Void) {
        task?.cancel()
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard Self.isPlausible(trimmed, in: country) else {
            status = .idle
            return
        }
        // L'annuaire embarqué d'abord : instantané, et juste pour les villes
        // que l'app propose déjà.
        if let known = country.city(forPostalCode: trimmed) {
            status = .found(known.name)
            onFound(known.name)
            return
        }
        let key = "\(country.rawValue)-\(trimmed)"
        if let cached = Self.cache[key] {
            status = .found(cached)
            onFound(cached)
            return
        }
        status = .searching
        task = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            let city = await Self.geocode(postalCode: trimmed, country: country)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self else { return }
                if let city {
                    Self.cache[key] = city
                    self.status = .found(city)
                    onFound(city)
                } else {
                    self.status = .notFound
                }
            }
        }
    }

    func reset() {
        task?.cancel()
        status = .idle
    }

    /// Géocodage Apple d'un code postal, borné au pays choisi.
    private nonisolated static func geocode(postalCode: String, country: Country) async -> String? {
        let address = CNMutablePostalAddress()
        address.postalCode = postalCode
        address.isoCountryCode = country.rawValue
        let placemarks: [CLPlacemark]? = await withCheckedContinuation { continuation in
            CLGeocoder().geocodePostalAddress(address) { placemarks, _ in
                continuation.resume(returning: placemarks)
            }
        }
        guard let placemark = placemarks?.first else { return nil }
        // Le géocodeur renvoie parfois un canton / département quand le code
        // couvre plusieurs communes : la localité reste la bonne réponse.
        return placemark.locality
            ?? placemark.subLocality
            ?? placemark.subAdministrativeArea
            ?? placemark.name
    }
}

extension Country {
    /// La ville de l'annuaire embarqué qui porte exactement ce code postal.
    func city(forPostalCode code: String) -> City? {
        let trimmed = code.trimmingCharacters(in: .whitespaces).uppercased()
        guard !trimmed.isEmpty else { return nil }
        return cities.first { $0.postalCode.uppercased() == trimmed }
    }
}

// MARK: - Champ de saisie

/// « Où ça ? » — on tape le code postal, la ville s'affiche toute seule.
/// La ville reste modifiable à la main : un code partagé entre plusieurs
/// communes, un lieu-dit, un pays exotique — l'app propose, l'utilisateur
/// tranche.
struct PostalCodeField: View {
    @Binding var postalCode: String
    @Binding var city: String
    var country: Country
    var prompt: LocalizedStringKey = "Code postal — ex. 1227"

    @StateObject private var resolver = PostalCodeResolver()
    @State private var editingCity = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                TextField(prompt, text: $postalCode)
                    .keyboardType(.numbersAndPunctuation)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .frame(maxWidth: 150)
                    .onChange(of: postalCode) { _, code in
                        editingCity = false
                        resolver.resolve(code: code, country: country) { found in
                            city = found
                        }
                    }
                Spacer(minLength: 0)
                statusView
            }

            if editingCity || (resolver.status == .notFound && !postalCode.isEmpty) {
                TextField("Ville", text: $city)
                    .textInputAutocapitalization(.words)
            }
        }
        .onAppear {
            // Rouvrir le formulaire ne doit pas effacer ce qui est déjà saisi.
            if !city.isEmpty { resolver.reset() }
        }
    }

    @ViewBuilder
    private var statusView: some View {
        switch resolver.status {
        case .searching:
            ProgressView().controlSize(.small)
        case .found(let name):
            Button {
                editingCity.toggle()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.caption.weight(.bold))
                    Text(verbatim: name)
                        .font(.caption.weight(.heavy))
                        .lineLimit(1)
                }
                .foregroundStyle(JC.feutrine)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Corriger la ville"))
        case .notFound:
            Text("Code inconnu — écris la ville")
                .font(.caption2)
                .foregroundStyle(JC.bronze)
                .multilineTextAlignment(.trailing)
        case .idle:
            if !city.isEmpty {
                HStack(spacing: 5) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.caption.weight(.bold))
                    Text(verbatim: city)
                        .font(.caption.weight(.heavy))
                        .lineLimit(1)
                }
                .foregroundStyle(.secondary)
            }
        }
    }
}
