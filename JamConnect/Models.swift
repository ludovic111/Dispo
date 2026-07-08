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

/// Statut de disponibilité affiché (badges, tri, filtres). Depuis la v0.3,
/// il est **dérivé** des dates concrètes cochées par le musicien dans son
/// calendrier — plus personne ne choisit un statut abstrait à la main.
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

    /// Icône SF Symbol pour l'interface (badges, filtres, listes).
    var symbol: String {
        switch self {
        case .tonight: return "bolt.fill"
        case .thisWeek: return "calendar"
        case .weekend: return "calendar.badge.clock"
        case .onRequest: return "hand.wave.fill"
        case .unavailable: return "moon.fill"
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

    /// Dérive le statut affiché depuis les dates cochées : aujourd'hui →
    /// « Ce soir » ; première date sous 7 jours → « Cette semaine » (ou
    /// « Ce week-end » si elle tombe un samedi/dimanche) ; plus loin →
    /// « Sur demande » ; rien → « Indisponible ».
    static func derived(from dates: [Date], now: Date = Date()) -> Availability {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)
        let upcoming = dates.map { calendar.startOfDay(for: $0) }.filter { $0 >= today }.sorted()
        guard let first = upcoming.first else { return .unavailable }
        if first == today { return .tonight }
        let days = calendar.dateComponents([.day], from: today, to: first).day ?? 99
        if days <= 7 {
            let weekday = calendar.component(.weekday, from: first)
            return (weekday == 7 || weekday == 1) ? .weekend : .thisWeek
        }
        return .onRequest
    }

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
        // « Dispo cette semaine » couvre les prochains jours, week-end compris.
        case .weekend: return [.tonight, .thisWeek, .weekend].contains(self)
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
/// CHF 59 au lieu de 82.80 (−29 %) pour maximiser la rétention.
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
        case .annual: return "CHF 59/an"
        case .monthly: return "CHF 6.90/mois"
        }
    }

    /// Équivalent mensuel + argument, affiché sous le prix.
    var detailLine: String {
        switch self {
        case .annual: return "soit CHF 4.90/mois · économise CHF 24"
        case .monthly: return "sans engagement"
        }
    }

    /// Étiquette promo (bandeau sur la carte du plan).
    var promoTag: String? {
        switch self {
        case .annual: return "MEILLEURE OFFRE · −29 %"
        case .monthly: return nil
        }
    }
}

// MARK: - Thème (clair / sombre)

/// Préférence d'apparence de l'utilisateur.
enum AppTheme: String, Codable, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "Système"
        case .light: return "Clair"
        case .dark: return "Sombre"
        }
    }

    var symbol: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.stars.fill"
        }
    }
}

// MARK: - Appréciation post-concert

/// Système d'appréciation positif : soit une note de musique (« j'ai aimé »),
/// soit une note dorée animée (« coup de cœur »). Pas de note négative possible.
enum Appreciation: String, Codable, Hashable, CaseIterable, Identifiable {
    case note   // j'ai aimé
    case golden // j'ai adoré (coup de cœur)

    var id: String { rawValue }

    var label: String {
        switch self {
        case .note: return "J'ai aimé"
        case .golden: return "Coup de cœur"
        }
    }
}

struct Review: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var author: String
    var appreciation: Appreciation
    var comment: String

    enum CodingKeys: String, CodingKey { case author, appreciation, comment }
}

// MARK: - Rateable (musiciens & groupes partagent notes + favoris)

/// Toute entité pouvant recevoir des appréciations (musicien solo ou groupe).
protocol Rateable {
    var name: String { get }
    var reviews: [Review] { get }
}

extension Rateable {
    /// Nombre total de notes de musique reçues (appréciations positives).
    var noteCount: Int { reviews.count }
    /// Nombre de notes dorées reçues (coups de cœur).
    var goldenCount: Int { reviews.filter { $0.appreciation == .golden }.count }
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
    /// Statut de dispo affiché (dérivé des dates en mode live ; le seed
    /// fournit directement un statut).
    var availability: Availability
    /// Dates concrètes de dispo (mode live ; vide pour le seed).
    var availableDates: [Date] = []
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

extension Musician: Rateable {}

// MARK: - Groupe / formation

/// Un groupe de musique (formation, band) présent sur JamConnect. Comme les
/// musiciens solo, un groupe a un niveau d'expérience et un système de notes.
struct Band: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var neighborhood: String
    var latitude: Double
    var longitude: Double
    var genres: [Genre]
    /// Niveau d'expérience de la formation (comme pour les musiciens solo).
    var level: Level
    var bio: String
    /// Statut de dispo pour jouer / répéter.
    var availability: Availability
    var memberCount: Int
    /// Année de formation du groupe (optionnel).
    var foundedYear: Int?
    /// Instruments recherchés pour compléter le groupe (recrutement).
    var lookingFor: [Instrument]
    var repertoire: [String]
    var reviews: [Review]
    /// Nom de l'asset photo du groupe ; à défaut, pastille dégradée avec initiales.
    var photo: String?

    enum CodingKeys: String, CodingKey {
        case name, neighborhood, latitude, longitude, genres, level, bio
        case availability, memberCount, foundedYear, lookingFor, repertoire, reviews, photo
    }

    var isAvailable: Bool { availability.isAvailable }
    var isRecruiting: Bool { !lookingFor.isEmpty }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var initials: String {
        name.split(separator: " ").compactMap { $0.first.map(String.init) }.prefix(2).joined()
    }

    func distance(from origin: CLLocationCoordinate2D) -> Double {
        let a = CLLocation(latitude: latitude, longitude: longitude)
        let b = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
        return a.distance(from: b) / 1000
    }
}

extension Band: Rateable {}

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
    /// Date de publication — les 30 premières minutes sont réservées aux
    /// membres Premium (la killer feature « alerte en avance »).
    var postedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, hostName, date, place, neighborhood, genre
        case wantedInstruments, fee, descriptionText, applied, isMine, postedAt
    }

    var feeLabel: String {
        if let fee { return "CHF \(fee)" }
        return "À discuter"
    }

    /// Durée de l'avant-première Premium après publication.
    static let earlyAccessWindow: TimeInterval = 30 * 60

    /// Fin de la fenêtre d'avant-première (nil si l'annonce n'en a pas).
    var earlyAccessEnd: Date? {
        postedAt.map { $0.addingTimeInterval(Self.earlyAccessWindow) }
    }

    /// true si l'annonce est encore en avant-première Premium.
    func isEarlyAccess(now: Date = Date()) -> Bool {
        guard let earlyAccessEnd, !isMine else { return false }
        return now < earlyAccessEnd
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
    /// Dates concrètes où je peux dépanner un concert (cochées au calendrier).
    var availableDates: [Date] = []

    /// Statut affiché aux autres, dérivé des dates.
    var availability: Availability { .derived(from: availableDates) }
    var isAvailable: Bool { availability.isAvailable }
}
