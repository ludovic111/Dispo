import Foundation
import CoreLocation

// MARK: - Genres

/// Familles de genres — structurent les sélecteurs (sections) et portent
/// l'identité visuelle (emoji, couleur, photo de couverture, codes).
enum GenreFamily: String, CaseIterable, Identifiable {
    case jazz = "Jazz"
    case latinWorld = "Latin & World"
    case classique = "Classique"
    case rockPop = "Rock & Pop"
    case bluesCountry = "Blues & Country"
    case soulFunk = "Soul & Funk"
    case urbain = "Hip-hop & Urbain"
    case electro = "Électronique"
    case folk = "Folk & Acoustique"

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .jazz: return "🎷"
        case .latinWorld: return "🪘"
        case .classique: return "🎻"
        case .rockPop: return "🎸"
        case .bluesCountry: return "🤠"
        case .soulFunk: return "🎤"
        case .urbain: return "🎧"
        case .electro: return "🎛️"
        case .folk: return "🪕"
        }
    }

    /// Les « codes » de la famille, affichés sur les profils.
    var codes: [String] {
        switch self {
        case .jazz: return ["Standards", "Grille + impro"]
        case .latinWorld: return ["Clave", "Groove"]
        case .classique: return ["Partitions", "Niveau conservatoire"]
        case .rockPop: return ["Impro libre", "Covers"]
        case .bluesCountry: return ["Blues en 12", "Shuffle"]
        case .soulFunk: return ["Chœurs", "Feel"]
        case .urbain: return ["Flow", "Beats"]
        case .electro: return ["Live set", "Collab studio"]
        case .folk: return ["Storytelling", "Cercle"]
        }
    }
}

/// Les rawValues français sont stockés tels quels (seed, backend) — ne pas
/// renommer un cas existant. Les 7 premiers cas historiques servent de
/// « genre général » de leur famille ; le reste = sous-genres.
enum Genre: String, Codable, CaseIterable, Identifiable {
    // Jazz
    case jazz = "Jazz"
    case bebop = "Bebop / Hard bop"
    case swing = "Swing / Big band"
    case jazzFusion = "Jazz fusion"
    case jazzManouche = "Jazz manouche"
    case freeJazz = "Free jazz"
    case smoothJazz = "Smooth jazz"
    // Latin & World
    case latin = "Latin / World"
    case salsa = "Salsa / Timba"
    case bossa = "Bossa nova / MPB"
    case cumbia = "Cumbia"
    case tango = "Tango"
    case afroCuban = "Afro-cubain"
    case reggae = "Reggae / Ska"
    case afrobeat = "Afrobeat / Highlife"
    case flamenco = "Flamenco"
    case oriental = "Musique orientale"
    case balkan = "Balkan / Klezmer"
    // Classique
    case classique = "Classique"
    case baroque = "Baroque"
    case opera = "Opéra / Lyrique"
    case chambre = "Musique de chambre"
    case contemporaine = "Musique contemporaine"
    // Rock & Pop
    case rock = "Rock / Pop"
    case indie = "Indie / Alternatif"
    case hardRock = "Hard rock / Metal"
    case punk = "Punk / Garage"
    case popVariete = "Pop / Variété"
    case chansonFrancaise = "Chanson française"
    // Blues & Country
    case blues = "Blues"
    case country = "Country / Bluegrass"
    case rocknroll = "Rock'n'roll / Rockabilly"
    // Soul & Funk
    case soul = "Gospel / Soul / R&B"
    case funk = "Funk"
    case disco = "Disco"
    // Hip-hop & Urbain
    case hiphop = "Hip-hop / Rap"
    case rnbModerne = "R&B moderne / Neo-soul"
    // Électronique
    case electro = "Électronique"
    case house = "House"
    case techno = "Techno"
    case drumAndBass = "Drum & bass"
    case ambient = "Ambient / Downtempo"
    // Folk & Acoustique
    case folk = "Folk / Acoustique"
    case singerSongwriter = "Singer-songwriter"
    case celtique = "Musique celtique"

    var id: String { rawValue }

    var family: GenreFamily {
        switch self {
        case .jazz, .bebop, .swing, .jazzFusion, .jazzManouche, .freeJazz, .smoothJazz:
            return .jazz
        case .latin, .salsa, .bossa, .cumbia, .tango, .afroCuban, .reggae,
             .afrobeat, .flamenco, .oriental, .balkan:
            return .latinWorld
        case .classique, .baroque, .opera, .chambre, .contemporaine:
            return .classique
        case .rock, .indie, .hardRock, .punk, .popVariete, .chansonFrancaise:
            return .rockPop
        case .blues, .country, .rocknroll:
            return .bluesCountry
        case .soul, .funk, .disco:
            return .soulFunk
        case .hiphop, .rnbModerne:
            return .urbain
        case .electro, .house, .techno, .drumAndBass, .ambient:
            return .electro
        case .folk, .singerSongwriter, .celtique:
            return .folk
        }
    }

    var emoji: String { family.emoji }

    /// Les « codes » propres à chaque genre, affichés sur les profils.
    var codes: [String] { family.codes }

    /// Genres d'une famille, dans l'ordre de déclaration.
    static func genres(in family: GenreFamily) -> [Genre] {
        allCases.filter { $0.family == family }
    }
}

// MARK: - Instruments

/// Familles d'instruments — structurent les sélecteurs (sections).
enum InstrumentCategory: String, CaseIterable, Identifiable {
    case claviers = "Claviers"
    case cordes = "Cordes"
    case vents = "Vents & cuivres"
    case rythmique = "Batterie & percussions"
    case voix = "Voix"
    case electro = "DJ & électro"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .claviers: return "pianokeys"
        case .cordes: return "guitars"
        case .vents: return "wind"
        case .rythmique: return "circle.grid.2x2"
        case .voix: return "music.mic"
        case .electro: return "hifispeaker.2"
        }
    }
}

/// Les rawValues français sont stockés tels quels (seed, backend) — ne pas
/// renommer un cas existant. L'affichage passe par le catalogue de traductions.
enum Instrument: String, Codable, CaseIterable, Identifiable {
    // Claviers
    case piano = "Piano"
    case synthe = "Synthé / MAO"
    case orgue = "Orgue"
    case accordeon = "Accordéon"
    // Cordes
    case guitare = "Guitare"
    case guitareElectrique = "Guitare électrique"
    case basse = "Basse"
    case contrebasse = "Contrebasse"
    case violon = "Violon"
    case alto = "Alto"
    case violoncelle = "Violoncelle"
    case harpe = "Harpe"
    case banjo = "Banjo"
    case mandoline = "Mandoline"
    case ukulele = "Ukulélé"
    // Vents & cuivres
    case saxophone = "Saxophone"
    case trompette = "Trompette"
    case trombone = "Trombone"
    case clarinette = "Clarinette"
    case flute = "Flûte"
    case cor = "Cor"
    case tuba = "Tuba"
    case harmonica = "Harmonica"
    // Batterie & percussions
    case batterie = "Batterie"
    case percussions = "Percussions"
    case cajon = "Cajón"
    case congas = "Congas"
    case timbales = "Timbales"
    case vibraphone = "Vibraphone"
    // Voix
    case voix = "Voix"
    case choeurs = "Chœurs"
    case beatbox = "Beatbox"
    // DJ & électro
    case dj = "DJ / Platines"

    var id: String { rawValue }

    var category: InstrumentCategory {
        switch self {
        case .piano, .synthe, .orgue, .accordeon:
            return .claviers
        case .guitare, .guitareElectrique, .basse, .contrebasse, .violon,
             .alto, .violoncelle, .harpe, .banjo, .mandoline, .ukulele:
            return .cordes
        case .saxophone, .trompette, .trombone, .clarinette, .flute,
             .cor, .tuba, .harmonica:
            return .vents
        case .batterie, .percussions, .cajon, .congas, .timbales, .vibraphone:
            return .rythmique
        case .voix, .choeurs, .beatbox:
            return .voix
        case .dj:
            return .electro
        }
    }

    var symbol: String { category.symbol }

    /// Instruments d'une catégorie, dans l'ordre de déclaration.
    static func instruments(in category: InstrumentCategory) -> [Instrument] {
        allCases.filter { $0.category == category }
    }

    /// Termes de recherche associés — « pianiste » doit trouver les pianos.
    var searchAliases: [String] {
        switch self {
        case .piano: return ["pianiste", "claviériste", "keys"]
        case .synthe: return ["claviériste", "producteur", "beatmaker", "mao"]
        case .orgue: return ["organiste"]
        case .accordeon: return ["accordéoniste"]
        case .guitare: return ["guitariste"]
        case .guitareElectrique: return ["guitariste"]
        case .basse: return ["bassiste"]
        case .contrebasse: return ["contrebassiste"]
        case .violon: return ["violoniste"]
        case .alto: return ["altiste"]
        case .violoncelle: return ["violoncelliste", "celliste"]
        case .harpe: return ["harpiste"]
        case .banjo: return ["banjoïste"]
        case .mandoline: return ["mandoliniste"]
        case .ukulele: return []
        case .saxophone: return ["saxophoniste", "sax", "saxo"]
        case .trompette: return ["trompettiste"]
        case .trombone: return ["tromboniste"]
        case .clarinette: return ["clarinettiste"]
        case .flute: return ["flûtiste"]
        case .cor: return ["corniste"]
        case .tuba: return ["tubiste"]
        case .harmonica: return ["harmoniciste"]
        case .batterie: return ["batteur", "batteuse", "drummer"]
        case .percussions: return ["percussionniste", "percu"]
        case .cajon: return ["percussionniste"]
        case .congas: return ["conguero", "percussionniste"]
        case .timbales: return ["timbalero", "percussionniste"]
        case .vibraphone: return ["vibraphoniste"]
        case .voix: return ["chanteur", "chanteuse", "vocaliste", "voix"]
        case .choeurs: return ["choriste"]
        case .beatbox: return ["beatboxer"]
        case .dj: return ["deejay", "platines"]
        }
    }
}

// MARK: - Identifiant @ (handle)

extension String {
    /// « Marco Silva » → « marco.silva » — l'identifiant @ des profils.
    var handleized: String {
        let base = folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr"))
            .lowercased()
        let allowed = base.map { char -> Character in
            (char.isLetter || char.isNumber) ? char : " "
        }
        return String(allowed)
            .split(separator: " ")
            .joined(separator: ".")
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

// MARK: - Langue de l'app

/// Langues proposées dans l'app (onboarding + profil). Le français est la
/// langue source ; les autres viennent du catalogue Localizable.xcstrings.
enum AppLanguage: String, Codable, CaseIterable, Identifiable {
    case french = "fr"
    case english = "en"
    case spanish = "es"
    case german = "de"
    case italian = "it"
    case mandarin = "zh-Hans"
    case japanese = "ja"

    var id: String { rawValue }

    /// Nom de la langue, dans cette langue (jamais traduit).
    var nativeName: String {
        switch self {
        case .french: return "Français"
        case .english: return "English"
        case .spanish: return "Español"
        case .german: return "Deutsch"
        case .italian: return "Italiano"
        case .mandarin: return "中文"
        case .japanese: return "日本語"
        }
    }

    var flag: String {
        switch self {
        case .french: return "🇫🇷"
        case .english: return "🇬🇧"
        case .spanish: return "🇪🇸"
        case .german: return "🇩🇪"
        case .italian: return "🇮🇹"
        case .mandarin: return "🇨🇳"
        case .japanese: return "🇯🇵"
        }
    }

    var locale: Locale { Locale(identifier: rawValue) }

    /// Langue par défaut : celle du téléphone si on la propose, sinon anglais.
    static var systemDefault: AppLanguage {
        let preferred = Locale.preferredLanguages.first ?? "en"
        if preferred.hasPrefix("zh") { return .mandarin }
        if let match = AppLanguage.allCases.first(where: { preferred.hasPrefix($0.rawValue) }) {
            return match
        }
        return .english
    }

    /// Bundle de traductions de cette langue (repli : bundle principal).
    var bundle: Bundle {
        guard let path = Bundle.main.path(forResource: rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else { return .main }
        return bundle
    }

    /// Traduit une clé du catalogue dans cette langue (pour les chaînes
    /// construites en code — les `Text` littéraux passent par la locale).
    func tr(_ key: String) -> String {
        bundle.localizedString(forKey: key, value: key, table: nil)
    }
}

// MARK: - Pays & villes

/// Une ville / localité avec son code postal — pour situer précisément le
/// musicien. La liste par pays vit dans Locations.swift.
struct City: Identifiable, Hashable {
    let name: String
    let postalCode: String
    var id: String { "\(postalCode) \(name)" }

    /// « 1227 Carouge » — l'affichage standard.
    var label: String { "\(postalCode) \(name)" }
}

/// Pays proposés (Europe + Amérique du Nord pour l'instant).
/// rawValue = code ISO — stocké dans le profil, ne pas changer.
enum Country: String, Codable, CaseIterable, Identifiable {
    case switzerland = "CH"
    case france = "FR"
    case usa = "US"
    case germany = "DE"
    case italy = "IT"
    case spain = "ES"
    case portugal = "PT"
    case belgium = "BE"
    case netherlands = "NL"
    case luxembourg = "LU"
    case austria = "AT"
    case uk = "GB"
    case ireland = "IE"
    case canada = "CA"

    var id: String { rawValue }

    var flag: String {
        switch self {
        case .switzerland: return "🇨🇭"
        case .france: return "🇫🇷"
        case .usa: return "🇺🇸"
        case .germany: return "🇩🇪"
        case .italy: return "🇮🇹"
        case .spain: return "🇪🇸"
        case .portugal: return "🇵🇹"
        case .belgium: return "🇧🇪"
        case .netherlands: return "🇳🇱"
        case .luxembourg: return "🇱🇺"
        case .austria: return "🇦🇹"
        case .uk: return "🇬🇧"
        case .ireland: return "🇮🇪"
        case .canada: return "🇨🇦"
        }
    }

    /// Clé de traduction du nom du pays.
    var nameKey: String {
        switch self {
        case .switzerland: return "Suisse"
        case .france: return "France"
        case .usa: return "États-Unis"
        case .germany: return "Allemagne"
        case .italy: return "Italie"
        case .spain: return "Espagne"
        case .portugal: return "Portugal"
        case .belgium: return "Belgique"
        case .netherlands: return "Pays-Bas"
        case .luxembourg: return "Luxembourg"
        case .austria: return "Autriche"
        case .uk: return "Royaume-Uni"
        case .ireland: return "Irlande"
        case .canada: return "Canada"
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

    /// Identifiant @ affiché sous le nom (dérivé du nom — unique côté
    /// serveur en phase 2b).
    var handle: String { "@" + name.handleized }

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

// MARK: - Matching SOS ↔ musiciens

/// Un musicien compatible avec un SOS. `dateConfirmed` distingue ceux qui ont
/// explicitement coché la date du concert dans leur calendrier de ceux qui
/// sont seulement joignables « sur demande ».
struct SOSMatch: Identifiable, Hashable {
    let musician: Musician
    let dateConfirmed: Bool
    var id: Musician.ID { musician.id }
}

extension Musician {
    /// true si le musicien joue au moins un des instruments recherchés.
    func plays(any wanted: [Instrument]) -> Bool {
        !Set(instruments).isDisjoint(with: wanted)
    }

    /// true si la date du concert est couverte par le calendrier du musicien.
    /// Sans dates cochées (profils seed), on se rabat sur le statut dérivé :
    /// « ce soir » couvre aujourd'hui, « cette semaine » les 7 prochains
    /// jours, « ce week-end » un samedi/dimanche sous 7 jours.
    func isAvailable(on gigDate: Date, now: Date = Date()) -> Bool {
        let calendar = Calendar.current
        let gigDay = calendar.startOfDay(for: gigDate)
        if !availableDates.isEmpty {
            return availableDates.contains { calendar.startOfDay(for: $0) == gigDay }
        }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: gigDay).day ?? 99
        switch availability {
        case .tonight: return days == 0
        case .thisWeek: return days <= 7
        case .weekend:
            let weekday = calendar.component(.weekday, from: gigDay)
            return days <= 7 && (weekday == 7 || weekday == 1)
        case .onRequest, .unavailable: return false
        }
    }
}

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
    // Champs ajoutés après la v0.3 — optionnels pour décoder les anciens
    // profils sauvegardés sans les perdre.
    var country: Country?
    var city: String?
    /// Code postal de la ville choisie (NPA, CP, ZIP…).
    var postalCode: String?
    /// Photo de profil choisie par l'utilisateur (fichier dans Documents).
    var photoFileName: String?
    /// Vidéos de démo (fichiers dans Documents) — ancien format v0.4, sans
    /// date. Conservé pour décoder les profils existants ; voir demoVideos.
    var videoFileNames: [String]?
    /// Vidéos de démo datées — 1 en gratuit, 6 en Premium.
    var demoVideos: [DemoVideo]?

    /// Statut affiché aux autres, dérivé des dates.
    var availability: Availability { .derived(from: availableDates) }
    var isAvailable: Bool { availability.isAvailable }

    var resolvedCountry: Country { country ?? .switzerland }
    var resolvedCity: String { city ?? resolvedCountry.cities[0].name }
    /// « 1200 Genève » si le code postal est connu, sinon juste la ville.
    var cityLabel: String {
        if let postalCode { return "\(postalCode) \(resolvedCity)" }
        return resolvedCity
    }
    /// Identifiant @ de l'utilisateur (dérivé du nom).
    var handle: String { "@" + name.handleized }
    /// Vidéos de démo — migre à la volée l'ancien format sans dates.
    var videos: [DemoVideo] {
        demoVideos ?? (videoFileNames ?? []).map { DemoVideo(fileName: $0, date: nil) }
    }
}

/// Une vidéo de démo du profil, avec sa date (enregistrement / concert).
struct DemoVideo: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var fileName: String
    /// Date de la vidéo, affichée sous le titre (nil = non renseignée).
    var date: Date?
}

// MARK: - Relations (amis / abonnés)

/// Lien social entre moi et un musicien. « Ami » = on se suit mutuellement.
enum SocialLink: Int, Comparable {
    case none = 0
    case follower = 1   // il me suit
    case following = 2  // je le suis
    case friend = 3     // on se suit mutuellement

    static func < (lhs: SocialLink, rhs: SocialLink) -> Bool { lhs.rawValue < rhs.rawValue }
}
