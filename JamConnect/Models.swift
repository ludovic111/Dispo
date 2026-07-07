import Foundation
import CoreLocation

// MARK: - Genres

enum Genre: String, Codable, CaseIterable, Identifiable {
    case jazz = "Jazz"
    case latin = "Latin / World"
    case classique = "Classique"
    case rock = "Rock / Pop"
    case electro = "Électronique"
    case soul = "Gospel / Soul / R&B"
    case folk = "Folk / Acoustique"

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .jazz: return "🎷"
        case .latin: return "🪘"
        case .classique: return "🎻"
        case .rock: return "🎸"
        case .electro: return "🎛️"
        case .soul: return "🎤"
        case .folk: return "🪕"
        }
    }

    /// Les « codes » propres à chaque genre, affichés sur les profils.
    var codes: [String] {
        switch self {
        case .jazz: return ["Standards", "Grille + impro"]
        case .latin: return ["Clave", "Groove"]
        case .classique: return ["Partitions", "Niveau conservatoire"]
        case .rock: return ["Impro libre", "Covers"]
        case .electro: return ["Live set", "Collab studio"]
        case .soul: return ["Chœurs", "Feel"]
        case .folk: return ["Storytelling", "Cercle"]
        }
    }
}

// MARK: - Instruments

enum Instrument: String, Codable, CaseIterable, Identifiable {
    case piano = "Piano"
    case guitare = "Guitare"
    case basse = "Basse"
    case contrebasse = "Contrebasse"
    case batterie = "Batterie"
    case percussions = "Percussions"
    case voix = "Voix"
    case saxophone = "Saxophone"
    case trompette = "Trompette"
    case violon = "Violon"
    case violoncelle = "Violoncelle"
    case flute = "Flûte"
    case synthe = "Synthé / MAO"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .piano, .synthe: return "pianokeys"
        case .guitare, .basse, .contrebasse, .violon, .violoncelle: return "guitars"
        case .batterie, .percussions: return "circle.grid.2x2"
        case .voix: return "music.mic"
        case .saxophone, .trompette, .flute: return "wind"
        }
    }
}

// MARK: - Disponibilité

/// Statut de disponibilité pour dépanner un concert. Un seul statut à la
/// fois, du plus urgent (ce soir) au plus souple (sur demande).
enum Availability: String, Codable, CaseIterable, Identifiable {
    case tonight = "Ce soir"
    case thisWeek = "Cette semaine"
    case weekend = "Ce week-end"
    case onRequest = "Sur demande"
    case unavailable = "Indisponible"

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .tonight: return "🚨"
        case .thisWeek: return "📅"
        case .weekend: return "🗓️"
        case .onRequest: return "🤙"
        case .unavailable: return "🌙"
        }
    }

    /// Libellé court des badges.
    var badgeLabel: String {
        switch self {
        case .tonight: return "Dispo ce soir"
        case .thisWeek: return "Cette semaine"
        case .weekend: return "Ce week-end"
        case .onRequest: return "Sur demande"
        case .unavailable: return "Indispo"
        }
    }

    /// Explication affichée dans le sélecteur du profil.
    var explanation: String {
        switch self {
        case .tonight: return "Prêt à foncer ce soir, instrument sous le bras"
        case .thisWeek: return "Dispo dans les prochains jours"
        case .weekend: return "Plutôt du vendredi au dimanche"
        case .onRequest: return "Dispo avec un peu de préavis"
        case .unavailable: return "Pas de dépannage en ce moment"
        }
    }

    var isAvailable: Bool { self != .unavailable }

    /// Rang d'urgence — sert au tri du feed (ce soir en premier).
    var urgencyRank: Int {
        switch self {
        case .tonight: return 4
        case .thisWeek: return 3
        case .weekend: return 2
        case .onRequest: return 1
        case .unavailable: return 0
        }
    }

    /// true si ce statut répond au filtre demandé (« cette semaine »
    /// englobe ce soir et le week-end).
    func satisfies(_ filter: Availability) -> Bool {
        switch filter {
        case .tonight: return self == .tonight
        case .thisWeek: return [.tonight, .thisWeek, .weekend].contains(self)
        case .weekend: return [.tonight, .weekend].contains(self)
        case .onRequest: return isAvailable
        case .unavailable: return true
        }
    }
}

// MARK: - Niveau

enum Level: String, Codable, CaseIterable, Identifiable, Comparable {
    case debutant = "Débutant"
    case intermediaire = "Intermédiaire"
    case avance = "Avancé"
    case pro = "Professionnel"

    var id: String { rawValue }

    private var rank: Int {
        switch self {
        case .debutant: return 0
        case .intermediaire: return 1
        case .avance: return 2
        case .pro: return 3
        }
    }

    static func < (lhs: Level, rhs: Level) -> Bool { lhs.rank < rhs.rank }
}

// MARK: - Premium

/// Plans d'abonnement Premium. L'annuel est l'offre mise en avant :
/// 2 mois offerts (CHF 39 au lieu de 54) pour maximiser la rétention.
enum PremiumPlan: String, Codable, CaseIterable, Identifiable {
    case annual
    case monthly

    var id: String { rawValue }

    var title: String {
        switch self {
        case .annual: return "Annuel"
        case .monthly: return "Mensuel"
        }
    }

    /// Prix affiché en gros sur la carte du plan.
    var priceLine: String {
        switch self {
        case .annual: return "CHF 39/an"
        case .monthly: return "CHF 4.50/mois"
        }
    }

    /// Équivalent mensuel + argument, affiché sous le prix.
    var detailLine: String {
        switch self {
        case .annual: return "soit CHF 3.25/mois · 2 mois offerts"
        case .monthly: return "sans engagement"
        }
    }

    /// Étiquette promo (bandeau sur la carte du plan).
    var promoTag: String? {
        switch self {
        case .annual: return "MEILLEURE OFFRE · −28 %"
        case .monthly: return nil
        }
    }
}

// MARK: - Avis post-concert

struct Review: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var author: String
    var rating: Int // 1...5
    var comment: String

    enum CodingKeys: String, CodingKey { case author, rating, comment }
}

// MARK: - Musicien

struct Musician: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var age: Int
    var neighborhood: String
    var latitude: Double
    var longitude: Double
    var instruments: [Instrument]
    var genres: [Genre]
    var level: Level
    var bio: String
    /// Statut de dispo pour un dépannage concert.
    var availability: Availability
    var repertoire: [String] // standards, morceaux, répertoire selon le genre
    var reviews: [Review]
    /// Nom de l'asset photo de profil (photos libres de droit bundlées).
    var photo: String?

    enum CodingKeys: String, CodingKey {
        case name, age, neighborhood, latitude, longitude
        case instruments, genres, level, bio, availability, repertoire, reviews, photo
    }

    var isAvailable: Bool { availability.isAvailable }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var averageRating: Double {
        guard !reviews.isEmpty else { return 0 }
        return Double(reviews.map(\.rating).reduce(0, +)) / Double(reviews.count)
    }

    var initials: String {
        name.split(separator: " ").compactMap { $0.first.map(String.init) }.prefix(2).joined()
    }

    /// Distance en km depuis le centre de Genève (position simulée de l'utilisateur).
    func distance(from origin: CLLocationCoordinate2D) -> Double {
        let a = CLLocation(latitude: latitude, longitude: longitude)
        let b = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
        return a.distance(from: b) / 1000
    }
}

// MARK: - Annonce SOS dépannage

/// Un groupe / organisateur cherche un musicien pour dépanner un concert.
struct GigRequest: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var title: String
    var hostName: String
    var date: Date
    var place: String
    var neighborhood: String
    var genre: Genre
    var wantedInstruments: [Instrument]
    /// Cachet proposé en CHF (nil = à discuter).
    var fee: Int?
    var descriptionText: String
    /// L'utilisateur a postulé à cette annonce.
    var applied: Bool = false
    var isMine: Bool = false

    enum CodingKeys: String, CodingKey {
        case id, title, hostName, date, place, neighborhood, genre
        case wantedInstruments, fee, descriptionText, applied, isMine
    }

    var feeLabel: String {
        if let fee { return "CHF \(fee)" }
        return "À discuter"
    }
}

// MARK: - Messagerie

struct Message: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var text: String
    var isFromMe: Bool
    var date: Date

    enum CodingKeys: String, CodingKey { case id, text, isFromMe, date }
}

struct Conversation: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var contactName: String
    var contactInstrument: Instrument
    var messages: [Message]

    enum CodingKeys: String, CodingKey { case id, contactName, contactInstrument, messages }

    var lastMessage: Message? { messages.max(by: { $0.date < $1.date }) }
}

// MARK: - Profil utilisateur

struct MyProfile: Codable {
    var name: String
    var instruments: [Instrument]
    var genres: [Genre]
    var level: Level
    var bio: String
    /// Statut de dispo pour un dépannage concert.
    var availability: Availability

    var isAvailable: Bool { availability.isAvailable }
}
