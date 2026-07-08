import Foundation
import CoreLocation
import SwiftUI

/// État global de la démo. Charge les données fictives depuis SeedData.json
/// et persiste les actions de l'utilisateur (événements créés, messages,
/// profil, participations) dans UserDefaults.
@MainActor
final class AppStore: ObservableObject {

    /// Position simulée de l'utilisateur : centre de Genève (place du Molard).
    nonisolated static let geneva = CLLocationCoordinate2D(latitude: 46.2044, longitude: 6.1432)

    @Published var musicians: [Musician] = []
    @Published var bands: [Band] = []
    @Published var events: [GigRequest] = []
    @Published var conversations: [Conversation] = []
    @Published var profile: MyProfile

    /// Favoris (par nom — les ids des musiciens seed changent à chaque lancement).
    @Published var favorites: Set<String> = []
    /// Appréciations données par l'utilisateur (par nom de musicien). Positif uniquement :
    /// note de musique (« aimé ») ou note dorée (« coup de cœur »).
    @Published var myAppreciations: [String: Appreciation] = [:]
    /// Abonnement Premium — simulé dans la démo.
    @Published var isPremium: Bool = false
    /// Plan choisi (mensuel / annuel), nil si non abonné.
    @Published var premiumPlan: PremiumPlan?
    @Published var showPaywall: Bool = false
    @Published var hasOnboarded: Bool = false
    /// Préférence d'apparence (système / clair / sombre).
    @Published var theme: AppTheme = .system

    private static let eventsKey = "jamconnect.events"
    private static let conversationsKey = "jamconnect.conversations"
    private static let profileKey = "jamconnect.profile"
    private static let favoritesKey = "jamconnect.favorites"
    private static let appreciationsKey = "jamconnect.appreciations"
    private static let premiumKey = "jamconnect.premium"
    private static let premiumPlanKey = "jamconnect.premiumPlan"
    private static let onboardedKey = "jamconnect.onboarded"
    private static let themeKey = "jamconnect.theme"

    init() {
        let seed = Self.loadSeed()
        musicians = seed.musicians
        bands = seed.bands

        // Les dates du seed sont relatives : on les projette sur les prochains jours.
        let seededEvents = seed.events.enumerated().map { index, event -> GigRequest in
            var e = event
            e.date = Calendar.current.date(byAdding: .day, value: index + 1, to: Date().addingTimeInterval(3600 * 4)) ?? e.date
            return e
        }

        if let saved: [GigRequest] = Self.load(key: Self.eventsKey) {
            events = saved
        } else {
            events = seededEvents
        }
        if let saved: [Conversation] = Self.load(key: Self.conversationsKey) {
            conversations = saved
        } else {
            conversations = seed.conversations
        }
        if let saved: MyProfile = Self.load(key: Self.profileKey) {
            profile = saved
        } else {
            profile = MyProfile(
                name: "Ludovic",
                instruments: [.piano],
                genres: [.latin, .jazz],
                level: .avance,
                bio: "Pianiste latin jazz à Genève. Toujours partant pour une descarga !",
                availability: .tonight
            )
        }
        events.sort { $0.date < $1.date }

        if let saved: Set<String> = Self.load(key: Self.favoritesKey) {
            favorites = saved
        }
        if let saved: [String: Appreciation] = Self.load(key: Self.appreciationsKey) {
            myAppreciations = saved
        }
        isPremium = UserDefaults.standard.bool(forKey: Self.premiumKey)
        premiumPlan = UserDefaults.standard.string(forKey: Self.premiumPlanKey).flatMap(PremiumPlan.init)
        hasOnboarded = UserDefaults.standard.bool(forKey: Self.onboardedKey)
        theme = UserDefaults.standard.string(forKey: Self.themeKey).flatMap(AppTheme.init) ?? .system
    }

    /// Change et persiste la préférence d'apparence.
    func setTheme(_ newTheme: AppTheme) {
        theme = newTheme
        UserDefaults.standard.set(newTheme.rawValue, forKey: Self.themeKey)
    }

    // MARK: - Social & Premium

    /// Photo d'un musicien ou groupe seed par nom (avis, conversations).
    func photo(forName name: String) -> String? {
        if let exact = musicians.first(where: { $0.name == name }) { return exact.photo }
        if let musician = musicians.first(where: { $0.name.hasPrefix(name + " ") }) { return musician.photo }
        if let band = bands.first(where: { $0.name == name }) { return band.photo }
        return bands.first(where: { $0.name.hasPrefix(name + " ") })?.photo
    }

    /// Favori (musicien ou groupe — géré par nom).
    func isFavorite(_ item: Rateable) -> Bool {
        favorites.contains(item.name)
    }

    func toggleFavorite(_ item: Rateable) {
        if favorites.contains(item.name) {
            favorites.remove(item.name)
        } else {
            favorites.insert(item.name)
        }
        Self.save(favorites, key: Self.favoritesKey)
    }

    // MARK: - Appréciations (notes de musique)

    /// L'appréciation donnée par l'utilisateur à ce musicien / groupe, s'il y en a une.
    func appreciation(for item: Rateable) -> Appreciation? {
        myAppreciations[item.name]
    }

    /// Donne (ou retire, si nil) une appréciation. Positif uniquement.
    func setAppreciation(_ appreciation: Appreciation?, for item: Rateable) {
        if let appreciation {
            myAppreciations[item.name] = appreciation
        } else {
            myAppreciations.removeValue(forKey: item.name)
        }
        Self.save(myAppreciations, key: Self.appreciationsKey)
    }

    /// Total des notes de musique reçues (avis seed + appréciation de l'utilisateur).
    func noteCount(for item: Rateable) -> Int {
        item.noteCount + (myAppreciations[item.name] != nil ? 1 : 0)
    }

    /// Total des notes dorées reçues (coups de cœur, seed + utilisateur).
    func goldenCount(for item: Rateable) -> Int {
        item.goldenCount + (myAppreciations[item.name] == .golden ? 1 : 0)
    }

    /// Souscription simulée — le vrai paiement passera par StoreKit / App Store en phase 2.
    func subscribePremium(plan: PremiumPlan) {
        isPremium = true
        premiumPlan = plan
        UserDefaults.standard.set(true, forKey: Self.premiumKey)
        UserDefaults.standard.set(plan.rawValue, forKey: Self.premiumPlanKey)
    }

    func cancelPremium() {
        isPremium = false
        premiumPlan = nil
        UserDefaults.standard.set(false, forKey: Self.premiumKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
    }

    func completeOnboarding() {
        hasOnboarded = true
        UserDefaults.standard.set(true, forKey: Self.onboardedKey)
    }

    // MARK: - Actions

    func addEvent(_ event: GigRequest) {
        events.append(event)
        events.sort { $0.date < $1.date }
        persistEvents()
    }

    func toggleApply(_ event: GigRequest) {
        guard let index = events.firstIndex(where: { $0.id == event.id }) else { return }
        events[index].applied.toggle()
        persistEvents()
    }

    func saveProfile() {
        Self.save(profile, key: Self.profileKey)
    }

    /// Envoie un message et déclenche une réponse scriptée pour rendre la démo vivante.
    func sendMessage(_ text: String, in conversation: Conversation) {
        guard let index = conversations.firstIndex(where: { $0.id == conversation.id }) else { return }
        conversations[index].messages.append(Message(text: text, isFromMe: true, date: Date()))
        persistConversations()

        let conversationID = conversation.id
        let reply = Self.scriptedReplies.randomElement() ?? "Super, à bientôt !"
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Double.random(in: 1.2...2.2)))
            guard let self, let i = self.conversations.firstIndex(where: { $0.id == conversationID }) else { return }
            withAnimation {
                self.conversations[i].messages.append(Message(text: reply, isFromMe: false, date: Date()))
            }
            self.persistConversations()
        }
    }

    /// Ouvre (ou retrouve) une conversation avec un musicien depuis sa fiche.
    func conversation(with musician: Musician) -> Conversation {
        openConversation(name: musician.name, instrument: musician.instruments.first ?? .voix)
    }

    /// Ouvre (ou retrouve) une conversation avec un groupe depuis sa fiche.
    func conversation(with band: Band) -> Conversation {
        openConversation(name: band.name, instrument: band.lookingFor.first ?? .voix)
    }

    private func openConversation(name: String, instrument: Instrument) -> Conversation {
        if let existing = conversations.first(where: { $0.contactName == name }) {
            return existing
        }
        let new = Conversation(contactName: name, contactInstrument: instrument, messages: [])
        conversations.insert(new, at: 0)
        persistConversations()
        return new
    }

    /// Réinitialise la démo (utile pour les présentations).
    func resetDemo() {
        UserDefaults.standard.removeObject(forKey: Self.eventsKey)
        UserDefaults.standard.removeObject(forKey: Self.conversationsKey)
        UserDefaults.standard.removeObject(forKey: Self.profileKey)
        UserDefaults.standard.removeObject(forKey: Self.favoritesKey)
        UserDefaults.standard.removeObject(forKey: Self.appreciationsKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumKey)
        UserDefaults.standard.removeObject(forKey: Self.premiumPlanKey)
        favorites = []
        myAppreciations = [:]
        isPremium = false
        premiumPlan = nil
        let seed = Self.loadSeed()
        musicians = seed.musicians
        bands = seed.bands
        events = seed.events.enumerated().map { index, event -> GigRequest in
            var e = event
            e.date = Calendar.current.date(byAdding: .day, value: index + 1, to: Date().addingTimeInterval(3600 * 4)) ?? e.date
            return e
        }
        conversations = seed.conversations
        profile = MyProfile(
            name: "Ludovic",
            instruments: [.piano],
            genres: [.latin, .jazz],
            level: .avance,
            bio: "Pianiste latin jazz à Genève. Toujours partant pour une descarga !",
            availability: .tonight
        )
    }

    // MARK: - Persistance

    private func persistEvents() { Self.save(events, key: Self.eventsKey) }
    private func persistConversations() { Self.save(conversations, key: Self.conversationsKey) }

    private static func save<T: Encodable>(_ value: T, key: String) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private static func load<T: Decodable>(key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Seed

    private struct Seed: Decodable {
        var musicians: [Musician]
        var bands: [Band]?
        var events: [GigRequest]
        var conversations: [Conversation]
    }

    private static func loadSeed() -> (musicians: [Musician], bands: [Band], events: [GigRequest], conversations: [Conversation]) {
        guard let url = Bundle.main.url(forResource: "SeedData", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            assertionFailure("SeedData.json introuvable dans le bundle")
            return ([], [], [], [])
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            let seed = try decoder.decode(Seed.self, from: data)
            return (seed.musicians, seed.bands ?? [], seed.events, seed.conversations)
        } catch {
            assertionFailure("SeedData.json invalide : \(error)")
            return ([], [], [], [])
        }
    }

    private static let scriptedReplies: [String] = [
        "Parfait, tu me sauves ! Je t'envoie la setlist tout de suite.",
        "Top. Balance à 18h30, concert à 20h30 — ça joue pour toi ?",
        "Génial 🙏 Le cachet c'est CHF 150, payé le soir même.",
        "Super ! Tu as besoin d'un ampli sur place ou tu amènes le tien ?",
        "Merci mille fois. Je te briefe sur le répertoire par téléphone ?",
        "Nickel. Je te mets sur la liste des musiciens, entrée par les artistes."
    ]
}
