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
    case saxAlto = "Saxophone alto"
    case saxTenor = "Saxophone ténor"
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
        case .saxophone, .saxAlto, .saxTenor, .trompette, .trombone, .clarinette,
             .flute, .cor, .tuba, .harmonica:
            return .vents
        case .batterie, .percussions, .cajon, .congas, .timbales, .vibraphone:
            return .rythmique
        case .voix, .choeurs, .beatbox:
            return .voix
        case .dj:
            return .electro
        }
    }

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
        case .saxAlto: return ["saxophoniste", "sax", "saxo", "alto", "eb"]
        case .saxTenor: return ["saxophoniste", "sax", "saxo", "ténor", "tenor", "bb"]
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

// MARK: - Réseaux sociaux

/// Réseaux sociaux affichés en liens cliquables sur les profils.
enum SocialNetwork: String, Codable, CaseIterable, Identifiable {
    case instagram
    case tiktok
    case youtube
    case x

    var id: String { rawValue }

    var label: String {
        switch self {
        case .instagram: return "Instagram"
        case .tiktok: return "TikTok"
        case .youtube: return "YouTube"
        case .x: return "X"
        }
    }

    var icon: String {
        switch self {
        case .instagram: return "camera.fill"
        case .tiktok: return "music.note"
        case .youtube: return "play.rectangle.fill"
        case .x: return "at"
        }
    }

    /// Nettoie ce que l'utilisateur colle (@, URL complète…) → pseudo nu.
    func cleanHandle(_ raw: String) -> String {
        var handle = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in ["https://", "http://", "www.", "instagram.com/", "tiktok.com/",
                       "youtube.com/", "x.com/", "twitter.com/"] {
            if handle.lowercased().hasPrefix(prefix) {
                handle = String(handle.dropFirst(prefix.count))
            }
        }
        return handle.trimmingCharacters(in: CharacterSet(charactersIn: "@/ "))
    }

    /// Lien du profil sur ce réseau.
    func url(for handle: String) -> URL? {
        let clean = cleanHandle(handle)
        guard !clean.isEmpty else { return nil }
        switch self {
        case .instagram: return URL(string: "https://instagram.com/\(clean)")
        case .tiktok: return URL(string: "https://tiktok.com/@\(clean)")
        case .youtube: return URL(string: "https://youtube.com/@\(clean)")
        case .x: return URL(string: "https://x.com/\(clean)")
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

    /// Libellé court des badges. Attention : le rawValue « Ce soir » est
    /// persisté (SeedData, Supabase) et ne bouge pas ; seul l'affichage dit
    /// « aujourd'hui », qui est la vérité — le filtre travaille au jour près,
    /// pas à l'heure près.
    var badgeLabel: String {
        switch self {
        case .tonight: return "Dispo aujourd'hui"
        case .thisWeek: return "Cette semaine"
        case .weekend: return "Ce week-end"
        case .onRequest: return "Sur demande"
        case .unavailable: return "Indispo"
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

// MARK: - Partage de position

/// Ce que les autres voient de ma position. Par défaut, tout le monde est
/// au « niveau ville » (grille ~5 km) ; la position exacte (~100 m) est un
/// choix explicite, pour tous ou pour les amis (suivi mutuel) seulement.
enum LocationPrecision: String, Codable, CaseIterable, Identifiable {
    /// Aucune position publiée : pas d'épingle sur la carte, pas de distance.
    case hidden = "hidden"
    case city = "city"
    case exactFriends = "exact_friends"
    case exactEveryone = "exact_everyone"

    var id: String { rawValue }

    /// Clé de traduction du libellé.
    var label: String {
        switch self {
        case .hidden: return "Ne pas partager ma position"
        case .city: return "Approximative (ville)"
        case .exactFriends: return "Exacte pour mes amis"
        case .exactEveryone: return "Exacte pour tous"
        }
    }

    var symbol: String {
        switch self {
        case .hidden: return "eye.slash.fill"
        case .city: return "building.2"
        case .exactFriends: return "person.2.fill"
        case .exactEveryone: return "location.fill"
        }
    }

    /// Publie-t-on une position (même approximative) ?
    var sharesLocation: Bool { self != .hidden }
}

// MARK: - Moyen de versement du cachet

/// Moyens de versement proposés pour un cachet SOS. Un token connu est
/// stocké tel quel (`twint`, `transfer`…) ; tout autre texte est un moyen
/// personnalisé saisi par l'utilisateur.
enum PaymentMethod: String, CaseIterable, Identifiable {
    case twint
    case transfer
    case cash
    case cashapp

    var id: String { rawValue }

    /// Clé de traduction du libellé (les noms propres restent tels quels).
    var label: String {
        switch self {
        case .twint: return "Twint"
        case .transfer: return "Virement"
        case .cash: return "Espèces"
        case .cashapp: return "Cash App"
        }
    }

    var symbol: String {
        switch self {
        case .twint: return "iphone.gen3"
        case .transfer: return "building.columns"
        case .cash: return "banknote"
        case .cashapp: return "dollarsign.circle"
        }
    }

    /// Libellé (clé de traduction) d'une valeur stockée : token connu →
    /// libellé standard, sinon le texte libre de l'utilisateur.
    static func displayLabel(for stored: String) -> String {
        PaymentMethod(rawValue: stored)?.label ?? stored
    }
}

// MARK: - Niveau

enum Level: String, Codable, CaseIterable, Identifiable, Comparable {
    case debutant = "Débutant"
    case intermediaire = "Intermédiaire"
    case avance = "Avancé"
    case pro = "Professionnel"

    var id: String { rawValue }

    /// Ce qu'on lit à l'écran. Le rawValue reste « Professionnel » (il est
    /// stocké tel quel en base et dans les profils sauvegardés) — mais entre
    /// musiciens, on dit « pro ».
    var label: String {
        self == .pro ? "Pro" : rawValue
    }

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

/// Deux periodicites pour un seul niveau Premium. Les prix affiches viennent
/// exclusivement de StoreKit afin de respecter la devise du compte Apple.
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

    /// Étiquette promo (bandeau sur la carte du plan).
    var promoTag: String? {
        switch self {
        case .annual: return "MEILLEURE OFFRE · −33 %"
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

    /// Bundle de traductions de cette langue, s'il existe. Le français est la
    /// langue source du catalogue : Xcode ne produit donc pas de `fr.lproj`,
    /// et cette propriété vaut nil pour lui.
    var bundle: Bundle? {
        guard let path = Bundle.main.path(forResource: rawValue, ofType: "lproj") else { return nil }
        return Bundle(path: path)
    }

    /// Traduit une clé du catalogue dans cette langue (pour les chaînes
    /// construites en code — les `Text` littéraux passent par la locale).
    ///
    /// Sans bundle dédié, on rend la clé telle quelle : elle EST la chaîne
    /// française. Retomber sur `Bundle.main` reviendrait à afficher la langue
    /// du téléphone, pas celle choisie dans l'app — un iPhone en anglais
    /// affichait ainsi des bouts d'anglais alors que l'app était en français.
    func tr(_ key: String) -> String {
        guard let bundle else { return key }
        return bundle.localizedString(forKey: key, value: key, table: nil)
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

    /// Convertit le code ISO fourni par iOS ou le backend sans exposer les
    /// écrans à la casse ni à une valeur non prise en charge.
    init?(isoCode: String?) {
        guard let isoCode else { return nil }
        self.init(rawValue: isoCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased())
    }

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

// MARK: - Avis (historique seed)

/// Ancien système d'appréciation (notes de musique / notes dorées) — conservé
/// uniquement pour décoder SeedData.json ; les avis seed alimentent la note
/// étoilée simulée des profils de démo.
enum Appreciation: String, Codable, Hashable, CaseIterable, Identifiable {
    case note   // j'ai aimé  → 4 étoiles
    case golden // coup de cœur → 5 étoiles

    var id: String { rawValue }

    /// Équivalent étoiles du système historique.
    var stars: Int { self == .golden ? 5 : 4 }
}

struct Review: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var author: String
    var appreciation: Appreciation
    var comment: String

    enum CodingKeys: String, CodingKey { case author, appreciation, comment }
}

/// Moyenne + nombre d'avis d'un profil. Les notes individuelles sont
/// anonymes : personne ne voit qui a mis combien d'étoiles.
struct RatingSummary: Hashable {
    var average: Double
    var count: Int

    /// « 4,6 » dans la locale de l'utilisateur.
    var averageLabel: String {
        average.formatted(.number.precision(.fractionLength(1)))
    }
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
    /// Pseudos réseaux sociaux (clé = SocialNetwork.rawValue).
    var socials: [String: String]?
    /// Niveau par instrument (clé = Instrument.rawValue) — nil pour les
    /// profils d'avant la 1.0 (14) ou sans niveau renseigné.
    var instrumentLevels: [String: String]? = nil
    /// Noms des musiciens avec qui cette personne a déjà joué (graphe « a joué avec »).
    var collaborators: [String] = []
    /// Compte échantillon clairement distingué des profils réels.
    var isDemo: Bool = false
    /// Statut Premium réel (serveur) — false pour les profils seed.
    var isPremium: Bool = false
    /// false quand les coordonnées sont un simple placeholder (profil live
    /// sans géoloc partagée) : ni distance affichée, ni filtre rayon.
    var hasLocation: Bool = true
    /// true quand la position affichée est la position exacte partagée par
    /// ce musicien (avec tous, ou avec moi en tant qu'ami) — sinon la
    /// position est au niveau ville et les distances restent approximatives.
    var hasExactLocation: Bool = false
    /// Note moyenne (1–5 étoiles) reçue sur le serveur — nil sans avis.
    var ratingAvg: Double?
    /// Nombre d'avis étoilés reçus sur le serveur.
    var ratingCount: Int = 0
    /// Vidéos de démo hébergées (mode live) — lisibles par tous.
    var demoVideos: [DemoVideo] = []
    /// Séjours ailleurs : « dispo, mais à Lisbonne du 12 au 20 ».
    var availabilityPlaces: [AvailabilityPlace] = []

    /// Où ce musicien se trouve ce jour-là : le séjour qui couvre la date,
    /// sinon nil (= il est chez lui, dans son quartier habituel).
    func place(on date: Date) -> AvailabilityPlace? {
        availabilityPlaces.first { $0.covers(date) }
    }

    /// Libellé du lieu pour une date donnée — séjour si voyage, quartier sinon.
    func placeLabel(on date: Date?) -> String {
        guard let date, let trip = place(on: date) else { return neighborhood }
        return trip.label
    }

    enum CodingKeys: String, CodingKey {
        case name, age, neighborhood, latitude, longitude
        case instruments, genres, level, bio, availability, repertoire, reviews, photo
        case socials, collaborators, isDemo, isPremium, instrumentLevels
    }

    init(
        id: UUID = UUID(),
        name: String,
        age: Int,
        neighborhood: String,
        latitude: Double,
        longitude: Double,
        instruments: [Instrument],
        genres: [Genre],
        level: Level,
        bio: String,
        availability: Availability,
        availableDates: [Date] = [],
        repertoire: [String],
        reviews: [Review],
        photo: String? = nil,
        socials: [String: String]? = nil,
        instrumentLevels: [String: String]? = nil,
        collaborators: [String] = [],
        isDemo: Bool = false,
        isPremium: Bool = false,
        hasLocation: Bool = true,
        ratingAvg: Double? = nil,
        ratingCount: Int = 0,
        demoVideos: [DemoVideo] = [],
        availabilityPlaces: [AvailabilityPlace] = []
    ) {
        self.id = id
        self.name = name
        self.age = age
        self.neighborhood = neighborhood
        self.latitude = latitude
        self.longitude = longitude
        self.instruments = instruments
        self.genres = genres
        self.level = level
        self.bio = bio
        self.availability = availability
        self.availableDates = availableDates
        self.repertoire = repertoire
        self.reviews = reviews
        self.photo = photo
        self.socials = socials
        self.instrumentLevels = instrumentLevels
        self.collaborators = collaborators
        self.isDemo = isDemo
        self.isPremium = isPremium
        self.hasLocation = hasLocation
        self.ratingAvg = ratingAvg
        self.ratingCount = ratingCount
        self.demoVideos = demoVideos
        self.availabilityPlaces = availabilityPlaces
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = UUID()
        name = try c.decode(String.self, forKey: .name)
        age = try c.decode(Int.self, forKey: .age)
        neighborhood = try c.decode(String.self, forKey: .neighborhood)
        latitude = try c.decode(Double.self, forKey: .latitude)
        longitude = try c.decode(Double.self, forKey: .longitude)
        instruments = try c.decode([Instrument].self, forKey: .instruments)
        genres = try c.decode([Genre].self, forKey: .genres)
        level = try c.decode(Level.self, forKey: .level)
        bio = try c.decode(String.self, forKey: .bio)
        availability = try c.decode(Availability.self, forKey: .availability)
        repertoire = try c.decode([String].self, forKey: .repertoire)
        reviews = try c.decode([Review].self, forKey: .reviews)
        photo = try c.decodeIfPresent(String.self, forKey: .photo)
        socials = try c.decodeIfPresent([String: String].self, forKey: .socials)
        instrumentLevels = try c.decodeIfPresent([String: String].self, forKey: .instrumentLevels)
        // Absent du JSON (backend live, anciennes seeds) → liste vide.
        collaborators = try c.decodeIfPresent([String].self, forKey: .collaborators) ?? []
        isDemo = try c.decodeIfPresent(Bool.self, forKey: .isDemo) ?? false
        isPremium = try c.decodeIfPresent(Bool.self, forKey: .isPremium) ?? false
    }

    /// Pseudo sur un réseau, s'il est renseigné.
    func socialHandle(_ network: SocialNetwork) -> String? {
        guard let handle = socials?[network.rawValue],
              !handle.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return handle
    }

    /// Niveau renseigné pour un instrument précis (nil = inconnu — le
    /// niveau global `level` sert alors de repli).
    func level(for instrument: Instrument) -> Level? {
        instrumentLevels?[instrument.rawValue].flatMap(Level.init(rawValue:))
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

// MARK: - Groupes de musique

/// Fichier joint à un message. `remotePath` pointe vers le bucket privé
/// `message-files`; en démo il commence par `local:` et vise le cache local.
struct MessageAttachment: Codable, Identifiable, Hashable {
    var id: String { remotePath }
    var remotePath: String
    var fileName: String
    var contentType: String
    var byteCount: Int64

    var fileExtension: String {
        let ext = URL(fileURLWithPath: fileName).pathExtension.lowercased()
        return ext.isEmpty ? "dat" : ext
    }

    var iconName: String {
        if contentType.hasPrefix("image/") { return "photo.fill" }
        if contentType.hasPrefix("video/") { return "video.fill" }
        switch fileExtension {
        case "pdf": return "doc.richtext.fill"
        case "html", "htm": return "music.note.list"
        case "musicxml", "xml", "mxl": return "music.quarternote.3"
        case "mid", "midi": return "pianokeys"
        default: return "doc.fill"
        }
    }

    var sizeLabel: String {
        ByteCountFormatter.string(fromByteCount: byteCount, countStyle: .file)
    }

    /// Texte court pour les bannières locales et les pushes sans message.
    var notificationLabel: String {
        if contentType.hasPrefix("image/") { return "📷 Photo" }
        if contentType.hasPrefix("video/") { return "🎥 Vidéo" }
        return "📎 \(fileName)"
    }
}

/// Réaction agrégée affichée sous une bulle. Une personne ne peut choisir
/// qu'un emoji par message, mais peut le remplacer d'un geste.
struct MessageReaction: Codable, Identifiable, Hashable {
    var emoji: String
    var count: Int
    var isMine: Bool

    var id: String { emoji }

    static let choices = ["👍", "❤️", "😂", "😮", "😢", "🙌"]
}

/// Un message dans un groupe.
struct GroupMessage: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var sender: String
    var isFromMe: Bool
    var text: String
    var date: Date
    var attachment: MessageAttachment? = nil
    var editedAt: Date? = nil
    var deletedAt: Date? = nil
    /// Optionnel pour continuer à décoder les conversations mises en cache
    /// avant la 2.3. L'UI passe toujours par `reactionSummaries`.
    var reactions: [MessageReaction]? = nil

    var reactionSummaries: [MessageReaction] { reactions ?? [] }
}

/// Une partition (ou tout document) partagée dans un groupe. En mode live
/// elle est hébergée sur le serveur (bucket privé `group-docs`) : tous les
/// membres peuvent l'ouvrir et la télécharger.
struct GroupDoc: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    /// Fichier copié dans Documents (mode démo / anciens documents locaux).
    var fileName: String
    var title: String
    var addedBy: String
    var date: Date
    /// Chemin Storage (`<groupID>/<uuid>.<ext>`) — nil si document local.
    var remotePath: String? = nil
    /// Extension du fichier hébergé (pdf, jpg, png…), pour l'ouvrir avec le
    /// bon type une fois téléchargé.
    var ext: String? = nil
    /// Morceau auquel la partition est rattachée — nil = partition libre du
    /// groupe (contrat, plan de scène…), rangée hors des morceaux.
    var songID: UUID? = nil
    /// Instrument visé (« la partie d'alto ») — nil = pour tout le monde.
    var instrument: String? = nil

    /// La partition est-elle une photo (feuille prise en photo) ?
    var isPhoto: Bool {
        ["jpg", "jpeg", "png", "heic"].contains((ext ?? "").lowercased())
    }

    /// Nom de fichier utilisé dans le cache local pour la copie téléchargée.
    var cacheFileName: String {
        "groupdoc_\(id.uuidString.lowercased()).\(ext ?? "pdf")"
    }
}

/// Un commentaire laissé sur un morceau. Tout le monde peut en écrire —
/// c'est là que se règlent les doigtés, les intros et les « on la finit
/// comment déjà ? ».
struct SongComment: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var songID: UUID
    var author: String
    var isMine: Bool
    var text: String
    var date: Date
}

/// Un morceau du répertoire (du groupe ou d'un événement). Tant que le
/// leader ne l'a pas validé, c'est une suggestion en attente.
struct Song: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var title: String
    var artist: String
    /// Pochette (iTunes Search) — nil si introuvable, le morceau vit sans.
    var artworkURL: String?
    /// Lien direct Apple Music (iTunes Search) — nil si introuvable.
    var trackURL: String?
    /// Liens directs par plateforme (StreamingPlatform.rawValue → URL),
    /// résolus via Odesli (song.link). nil → repli sur la recherche.
    var platformLinks: [String: String]?
    var suggestedBy: String
    var isApproved: Bool
    /// Tonalité réelle (« concert ») du morceau, en lettres : « Bb », « F#m ».
    /// Sert à afficher à chacun la tonalité de SON instrument.
    var key: String?
    /// Grille d'accords en toutes lettres — transposée automatiquement pour
    /// chaque instrument transpositeur.
    var chords: String?
    /// Lien iReal Pro partagé par le groupe (`irealbook://` ou `irealb://`),
    /// exporté depuis iReal Pro.
    var irealURL: String?
    /// Le leader a volontairement retiré la grille iReal Pro. On conserve la
    /// grille texte pour les membres sans iReal, sans la régénérer aussitôt.
    var irealDisabled: Bool? = nil
    /// Ordre de passage des solos, stocké avec le morceau dans le JSON du
    /// répertoire / de la setlist. Les UUID sont ceux des profils du groupe :
    /// iOS et Android partagent ainsi une donnée stable, jamais un nom mutable.
    /// Optionnel pour décoder les morceaux enregistrés avant cette fonction.
    var solos: [UUID]? = nil

    /// Tonalité relue, nil si non renseignée ou illisible.
    var musicalKey: MusicalKey? { key.flatMap(MusicalKey.init) }

    /// Libellé court affiché directement sur la tuile du morceau.
    var keyBadgeLabel: String? { musicalKey?.label }

    /// Vue non optionnelle utilisée par l'interface. Une ancienne ligne sans
    /// clé `solos` équivaut simplement à un ordre vide.
    var soloProfileIDs: [UUID] { solos ?? [] }
}

/// Membre proposé dans l'ordre des solos. Le nom est résolu à partir du groupe
/// courant tandis que l'UUID reste la seule valeur persistée.
struct SoloistOption: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
}

/// Plateformes d'écoute proposées sur les morceaux (répertoire, setlists).
/// Apple Music profite du lien direct d'iTunes Search quand on l'a ; les
/// autres ouvrent la recherche du morceau dans l'app ou le site.
enum StreamingPlatform: String, CaseIterable, Identifiable {
    case appleMusic
    case spotify
    case youtubeMusic
    case deezer

    var id: String { rawValue }

    /// Nom propre de la plateforme — jamais traduit.
    var label: String {
        switch self {
        case .appleMusic: return "Apple Music"
        case .spotify: return "Spotify"
        case .youtubeMusic: return "YouTube Music"
        case .deezer: return "Deezer"
        }
    }

    var symbol: String {
        switch self {
        case .appleMusic: return "applelogo"
        case .spotify: return "waveform"
        case .youtubeMusic: return "play.rectangle.fill"
        case .deezer: return "music.note.list"
        }
    }

    /// Lien d'écoute du morceau sur cette plateforme.
    func url(for song: Song) -> URL? {
        // Lien direct résolu (Odesli) prioritaire — pour toutes les plateformes.
        if let direct = song.platformLinks?[rawValue], let url = URL(string: direct) {
            return url
        }
        if self == .appleMusic, let track = song.trackURL, let url = URL(string: track) {
            return url
        }
        let query = "\(song.title) \(song.artist)"
        guard let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            return nil
        }
        switch self {
        case .appleMusic: return URL(string: "https://music.apple.com/search?term=\(encoded)")
        case .spotify: return URL(string: "https://open.spotify.com/search/\(encoded)")
        case .youtubeMusic: return URL(string: "https://music.youtube.com/search?q=\(encoded)")
        case .deezer: return URL(string: "https://www.deezer.com/search/\(encoded)")
        }
    }

    /// Vrai si on a un lien direct vers le morceau (pas juste une recherche).
    func hasDirectLink(for song: Song) -> Bool {
        if song.platformLinks?[rawValue] != nil { return true }
        if self == .appleMusic, song.trackURL != nil { return true }
        return false
    }
}

/// Type d'événement d'un groupe.
enum GroupEventKind: String, Codable, CaseIterable, Identifiable {
    case concert = "Concert"
    case repetition = "Répétition"
    case jam = "Jam"

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .concert: return "🎤"
        case .repetition: return "🎧"
        case .jam: return "🔥"
        }
    }

    /// Symbole stable utilisé partout dans l'interface. Le libellé reste
    /// toujours visible : la forme aide à reconnaître, elle ne remplace pas.
    var symbol: String {
        switch self {
        case .concert: return "music.mic"
        case .repetition: return "repeat"
        case .jam: return "person.3.fill"
        }
    }
}

/// « Je suis dispo, mais ailleurs » — un séjour daté avec son lieu. Un
/// musicien en vacances à Lisbonne du 12 au 20 reste trouvable, mais pour
/// des concerts à Lisbonne : le fil sait où il est, pas seulement quand.
struct AvailabilityPlace: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var from: Date
    var to: Date
    var country: Country?
    var postalCode: String? = nil
    var city: String

    enum CodingKeys: String, CodingKey { case id, from, to, country, postalCode, city }

    /// « Lisbonne (PT) » — ce qu'on lit sur la carte du musicien.
    var label: String {
        let parts = [postalCode?.trimmingCharacters(in: .whitespacesAndNewlines), city]
            .compactMap { value -> String? in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
        let place = parts.joined(separator: " ")
        guard let country else { return place }
        return place.isEmpty ? country.rawValue : "\(place) · \(country.rawValue)"
    }

    /// Ce séjour couvre-t-il ce jour-là ? (bornes incluses, à la journée)
    func covers(_ date: Date, calendar: Calendar = .current) -> Bool {
        let day = calendar.startOfDay(for: date)
        return calendar.startOfDay(for: from) <= day && day <= calendar.startOfDay(for: to)
    }

    /// Le libellé contient-il ce que l'on cherche ? (ville ou code pays)
    func matches(_ query: String) -> Bool {
        let needle = query.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        guard !needle.isEmpty else { return true }
        return label
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .contains(needle)
    }
}

/// Rythme d'un événement de groupe. `ponctuel` = une seule date ; les autres
/// génèrent une série de dates (une répétition hebdomadaire, par exemple).
/// Chaque occurrence reste un événement à part entière — sa propre setlist,
/// sa propre feuille de présence — reliée aux autres par `seriesID`.
enum EventRecurrence: String, Codable, CaseIterable, Identifiable {
    case once = "Ponctuel"
    case weekly = "Chaque semaine"
    case biweekly = "Toutes les 2 semaines"
    case monthly = "Chaque mois"

    var id: String { rawValue }

    /// Pas entre deux occurrences, appliqué au calendrier (nil = pas de suite).
    var step: (component: Calendar.Component, value: Int)? {
        switch self {
        case .once: return nil
        case .weekly: return (.weekOfYear, 1)
        case .biweekly: return (.weekOfYear, 2)
        case .monthly: return (.month, 1)
        }
    }

    /// Libellé court pour la pastille des cartes (« Hebdo », « 2 sem. »…).
    var shortLabel: String {
        switch self {
        case .once: return "Ponctuel"
        case .weekly: return "Hebdo"
        case .biweekly: return "2 sem."
        case .monthly: return "Mensuel"
        }
    }
}

/// Niveau demandé par un SOS automatique. Deux règles seulement, parce que
/// c'est la seule question qui se pose vraiment quand un membre lâche :
/// « n'importe qui fait l'affaire » ou « il me faut quelqu'un du calibre de
/// celui qui manque ».
enum AutoSOSLevelRule: String, CaseIterable, Identifiable {
    case any
    case sameAsAbsent = "same"

    var id: String { rawValue }

    /// Clé de traduction du libellé.
    var label: String {
        switch self {
        case .any: return "Peu importe"
        case .sameAsAbsent: return "Identique à l'absent"
        }
    }

    var symbol: String {
        switch self {
        case .any: return "person.fill.questionmark"
        case .sameAsAbsent: return "equal.circle.fill"
        }
    }

    /// Valeur écrite dans `music_groups.auto_sos_min_level` (nil = `any`).
    var stored: String? { self == .any ? nil : rawValue }

    /// Relit la valeur stockée. Les groupes réglés avant la 1.4 portent un
    /// niveau fixe (« Avancé ») : c'est « identique à l'absent » qui traduit
    /// le mieux leur intention, on les y bascule.
    static func fromStored(_ raw: String?) -> AutoSOSLevelRule {
        guard let raw, !raw.isEmpty else { return .any }
        return AutoSOSLevelRule(rawValue: raw) ?? .sameAsAbsent
    }
}

/// Invitation à un groupe reçue — l'invité doit accepter avant de devenir
/// membre. Les infos du groupe sont dénormalisées (RLS : l'invité ne peut
/// pas encore lire `music_groups`).
struct GroupInvitation: Codable, Identifiable, Hashable {
    var id: UUID
    var groupID: UUID
    var groupName: String
    var groupEmoji: String
    var groupPhotoURL: String?
    var invitedByName: String
    var kind: GroupMemberKind
    var date: Date
}

/// Invité en attente de réponse, vu par les membres du groupe.
struct PendingGroupInvite: Codable, Identifiable, Hashable {
    /// id de l'invitation (pour l'annuler).
    var id: UUID
    var profileID: UUID
    var name: String
    var kind: GroupMemberKind
}

/// Statut d'un membre dans le noyau du groupe : permanent (base fixe) ou
/// occasionnel (remplaçant / invité ponctuel).
enum GroupMemberKind: String, Codable, CaseIterable, Identifiable {
    case permanent = "Permanent"
    case occasional = "Occasionnel"

    var id: String { rawValue }

    var label: String { rawValue }

    /// Valeur stockée côté Supabase (`group_members.kind`).
    var dbValue: String {
        switch self {
        case .permanent: return "permanent"
        case .occasional: return "occasional"
        }
    }

    init?(dbValue: String) {
        switch dbValue {
        case "permanent": self = .permanent
        case "occasional": self = .occasional
        default: return nil
        }
    }

    var symbol: String {
        switch self {
        case .permanent: return "person.fill.checkmark"
        case .occasional: return "person.badge.clock"
        }
    }
}

/// Réponse de présence à un événement de groupe.
enum AttendanceStatus: String, Codable, CaseIterable, Identifiable {
    case pending = "En attente"
    case available = "Dispo"
    case unavailable = "Indispo"

    var id: String { rawValue }

    /// Valeur stockée côté Supabase (`event_attendance.status`).
    var dbValue: String {
        switch self {
        case .pending: return "pending"
        case .available: return "available"
        case .unavailable: return "unavailable"
        }
    }

    init?(dbValue: String) {
        switch dbValue {
        case "pending": self = .pending
        case "available": self = .available
        case "unavailable": self = .unavailable
        default: return nil
        }
    }

    var shortLabel: String {
        switch self {
        case .pending: return "?"
        case .available: return "Oui"
        case .unavailable: return "Non"
        }
    }
}

/// Un événement du groupe (concert, répé, jam) avec sa propre setlist.
/// Créé par le leader ; les membres suggèrent des morceaux qu'il valide.
/// Relié aux SOS : si un membre lâche, SOS pré-rempli en un tap.
struct GroupEvent: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var kind: GroupEventKind
    var title: String
    var venue: String
    var date: Date
    var setlist: [Song] = []
    /// Présence par nom de membre (et le leader). Absent = pas encore répondu.
    var attendance: [String: AttendanceStatus]?
    /// Série à laquelle appartient l'événement — nil pour un événement
    /// ponctuel. Toutes les occurrences d'une répétition hebdomadaire
    /// partagent le même identifiant, ce qui permet de les colorer ensemble
    /// et de supprimer toute la série d'un coup.
    var seriesID: UUID?
    /// Rythme de la série (nil / `.once` = ponctuel). Conservé sur chaque
    /// occurrence pour l'afficher sans avoir à relire les autres dates.
    var recurrence: EventRecurrence?
    /// Combien de jours avant l'événement le rappel part — choisi par le
    /// leader. nil = valeur par défaut (`GroupEvent.defaultReminderLeadDays`).
    var reminderLeadDays: Int?

    /// 2 jours avant, sauf choix contraire du leader.
    static let defaultReminderLeadDays = 2
    /// Délais proposés au leader (en jours).
    static let reminderLeadOptions = [0, 1, 2, 3, 7, 14]

    /// Fait partie d'une série récurrente (couleur et pastille distinctes).
    var isRecurring: Bool { seriesID != nil && (recurrence ?? .once) != .once }

    /// Délai de rappel effectif, borné pour ne jamais planifier n'importe quoi.
    var reminderLead: Int {
        min(max(reminderLeadDays ?? Self.defaultReminderLeadDays, 0), 60)
    }

    var responses: [String: AttendanceStatus] { attendance ?? [:] }

    func status(for name: String) -> AttendanceStatus {
        responses[name] ?? .pending
    }

    var availableNames: [String] {
        responses.filter { $0.value == .available }.map(\.key).sorted()
    }

    var unavailableNames: [String] {
        responses.filter { $0.value == .unavailable }.map(\.key).sorted()
    }

    /// Une série ne va jamais plus loin qu'un an après sa première date :
    /// au-delà, personne ne sait où il sera, et le serveur (comme le centre
    /// de notifications) se retrouve avec des centaines de dates fantômes.
    static let maxSeriesSpan = DateComponents(year: 1)

    /// Nombre maximum d'occurrences pour un rythme donné — la borne d'un an,
    /// exprimée en dates : 52 semaines, 26 quinzaines, 12 mois.
    static func maxOccurrences(for recurrence: EventRecurrence) -> Int {
        switch recurrence {
        case .once: return 1
        case .weekly: return 52
        case .biweekly: return 26
        case .monthly: return 12
        }
    }

    /// Garde-fou global (le plus permissif des rythmes).
    static let maxOccurrences = 52

    /// Dates d'une série : la première date, puis un pas régulier. L'heure de
    /// la première date est conservée (le calendrier gère l'heure d'été et
    /// les mois courts — un 31 devient le dernier jour du mois suivant).
    /// Rien n'est généré au-delà d'un an après la première date.
    static func occurrenceDates(
        from start: Date,
        recurrence: EventRecurrence,
        count: Int,
        calendar: Calendar = .current
    ) -> [Date] {
        guard let step = recurrence.step, count > 1 else { return [start] }
        let total = min(max(count, 1), maxOccurrences(for: recurrence))
        let horizon = calendar.date(byAdding: maxSeriesSpan, to: start) ?? start
        return (0..<total).compactMap { index -> Date? in
            guard index > 0 else { return start }
            guard let date = calendar.date(
                byAdding: step.component,
                value: step.value * index,
                to: start
            ) else { return nil }
            return date <= horizon ? date : nil
        }
    }

    /// Date limite de réponse : le jour où le rappel part. Au-delà, le leader
    /// doit pouvoir compter sur les présences pour chercher un remplaçant.
    var confirmDeadline: Date {
        date.addingTimeInterval(-Double(reminderLead) * 24 * 3600)
    }

    /// Temps qu'il reste pour confirmer sa présence (nil = délai dépassé).
    func timeLeftToConfirm(now: Date = Date()) -> TimeInterval? {
        let left = confirmDeadline.timeIntervalSince(now)
        return left > 0 ? left : nil
    }

    /// Décline cet événement en une série complète : même titre, même lieu,
    /// même setlist de départ, un identifiant de série partagé.
    func occurrences(recurrence: EventRecurrence, count: Int) -> [GroupEvent] {
        let dates = Self.occurrenceDates(from: date, recurrence: recurrence, count: count)
        guard dates.count > 1 else {
            var single = self
            single.seriesID = nil
            single.recurrence = .once
            return [single]
        }
        let series = seriesID ?? UUID()
        return dates.map { occurrenceDate in
            var copy = self
            copy.id = occurrenceDate == date ? id : UUID()
            copy.date = occurrenceDate
            copy.seriesID = series
            copy.recurrence = recurrence
            return copy
        }
    }
}

/// L'état d'un événement de groupe, lu d'un coup d'œil : tout le monde est là
/// (vert), il manque du monde alors que la date limite est passée (rouge), ou
/// les réponses arrivent encore (couleur habituelle).
enum LineupState {
    case complete
    case late
    case forming

    var isComplete: Bool { self == .complete }
    var isLate: Bool { self == .late }
}

/// Un groupe de musique : le leader (créateur, forcément Premium) gère les
/// membres, le répertoire et les événements ; les membres — Premium ou non —
/// discutent, partagent des partitions et font des suggestions.
/// Synchronisé via Supabase en mode live, pièces jointes privées comprises.
struct GroupChat: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var emoji: String = "🎶"
    /// Photo du groupe (URL hébergée) — optionnelle, choisie par le leader.
    var photoURL: String?
    /// Groupe visible sur les profils publics de ses membres (nil = privé,
    /// optionnel pour décoder les groupes sauvegardés avant la 0.9.6).
    var isPublic: Bool?
    /// Leader du groupe (rôle transférable à un membre Premium uniquement).
    /// Optionnel pour décoder les groupes v0.7 — nil = moi.
    var leaderName: String?
    /// Membres (par nom) — moi en plus, implicitement.
    var memberNames: [String]
    /// Identités stables du roster live, leader inclus. Optionnel pour rester
    /// compatible avec la démo et les caches créés avant l'ordre des solos.
    /// Contrairement aux dictionnaires historiques indexés par nom, ce champ
    /// conserve correctement deux membres homonymes.
    var rosterProfiles: [SoloistOption]? = nil
    /// Permanent vs occasionnel, par nom. Absent = permanent (noyau par défaut).
    var memberKinds: [String: GroupMemberKind]?
    /// Rôle (instrument) de chaque membre dans le groupe, par nom.
    var memberRoles: [String: String]?
    /// Remplacement automatique : quand un membre se déclare indisponible,
    /// un SOS part tout seul pour son poste. nil = désactivé.
    var autoSOSEnabled: Bool?
    /// Règle de niveau des SOS automatiques (nil = peu importe, « same » =
    /// identique au membre absent).
    var autoSOSMinLevel: String?

    /// La règle de niveau relue.
    var autoSOSLevelRule: AutoSOSLevelRule { .fromStored(autoSOSMinLevel) }
    var messages: [GroupMessage] = []
    var docs: [GroupDoc] = []
    /// Commentaires de morceaux, tous morceaux confondus.
    var songComments: [SongComment]?

    /// Les partitions rattachées à un morceau.
    func docs(for songID: UUID) -> [GroupDoc] {
        docs.filter { $0.songID == songID }
    }

    /// Les partitions libres (non rattachées à un morceau).
    var looseDocs: [GroupDoc] { docs.filter { $0.songID == nil } }

    /// Les commentaires d'un morceau, du plus ancien au plus récent.
    func comments(for songID: UUID) -> [SongComment] {
        (songComments ?? []).filter { $0.songID == songID }.sorted { $0.date < $1.date }
    }
    /// Répertoire du groupe (morceaux validés + suggestions en attente).
    var repertoire: [Song]?
    /// Événements (concerts, répés, jams) avec leur setlist.
    var events: [GroupEvent]?

    var songs: [Song] { repertoire ?? [] }
    var allEvents: [GroupEvent] { events ?? [] }

    var lastMessage: GroupMessage? { messages.max(by: { $0.date < $1.date }) }
    /// Événements à venir, les plus proches d'abord.
    var upcomingEvents: [GroupEvent] {
        var seen = Set<GroupEvent.ID>()
        return allEvents
            .filter { $0.date > Date() && seen.insert($0.id).inserted }
            .sorted { $0.date < $1.date }
    }
    /// Suggestions de morceaux en attente de validation du leader.
    var pendingSongs: [Song] { songs.filter { !$0.isApproved } }
    var approvedSongs: [Song] { songs.filter { $0.isApproved } }

    func memberKind(for name: String) -> GroupMemberKind {
        memberKinds?[name] ?? .permanent
    }

    /// Rôle (instrument) d'un membre dans le groupe, si défini.
    func role(for name: String) -> Instrument? {
        memberRoles?[name].flatMap(Instrument.init(rawValue:))
    }

    /// Rôles présents dans le groupe (l'instrumentation).
    var roleInstruments: [Instrument] {
        let set = Set((memberRoles ?? [:]).values.compactMap(Instrument.init(rawValue:)))
        return set.sorted { $0.rawValue < $1.rawValue }
    }

    /// Rôles NON couverts par un membre disponible pour l'événement — le cœur
    /// de « dispo en fonction des rôles » : ce qu'un SOS de groupe doit chercher.
    func uncoveredRoles(for event: GroupEvent) -> [Instrument] {
        let roles = memberRoles ?? [:]
        let all = Set(roles.values.compactMap(Instrument.init(rawValue:)))
        var covered = Set<Instrument>()
        for (name, raw) in roles {
            guard let role = Instrument(rawValue: raw) else { continue }
            if event.attendance?[name] == .available { covered.insert(role) }
        }
        return all.subtracting(covered).sorted { $0.rawValue < $1.rawValue }
    }

    /// Postes encore découverts pour l'événement, une fois comptés les
    /// remplaçants trouvés par SOS (`replacements` = instruments pourvus).
    func missingRoles(for event: GroupEvent, replacements: [Instrument] = []) -> [Instrument] {
        let covered = Set(replacements)
        return uncoveredRoles(for: event).filter { !covered.contains($0) }
    }

    /// Le line-up est-il au complet ? Tous les postes du groupe sont tenus ce
    /// jour-là — par un membre qui a confirmé, ou par un remplaçant accepté
    /// sur un SOS. Sans rôles définis, on retombe sur la règle simple : tout
    /// le monde a répondu « dispo ».
    func isLineupComplete(
        for event: GroupEvent,
        roster: [String],
        replacements: [Instrument] = []
    ) -> Bool {
        let hasRoles = (memberRoles ?? [:]).values.contains { Instrument(rawValue: $0) != nil }
        if hasRoles {
            return missingRoles(for: event, replacements: replacements).isEmpty
        }
        guard !roster.isEmpty else { return false }
        return roster.allSatisfy { event.status(for: $0) == .available }
    }

    /// L'état du line-up, tel qu'il se lit d'un coup d'œil sur la carte.
    func lineupState(
        for event: GroupEvent,
        roster: [String],
        replacements: [Instrument] = [],
        now: Date = Date()
    ) -> LineupState {
        if isLineupComplete(for: event, roster: roster, replacements: replacements) {
            return .complete
        }
        return event.timeLeftToConfirm(now: now) == nil ? .late : .forming
    }

    var permanentMembers: [String] {
        memberNames.filter { memberKind(for: $0) == .permanent }
    }

    var occasionalMembers: [String] {
        memberNames.filter { memberKind(for: $0) == .occasional }
    }
}

/// Un groupe public affiché sur le profil d'un musicien (le sien ou celui
/// d'un autre) — lecture seule, données servies par le serveur.
struct PublicGroup: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var emoji: String
    var photoURL: String?
    var memberCount: Int
    var isLeader: Bool
}

// MARK: - Annonce SOS dépannage

/// Un groupe / organisateur cherche un musicien pour dépanner un concert.
struct GigRequest: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var title: String
    var hostName: String
    /// Identifiant serveur de l'organisateur (pour ouvrir la conversation).
    var hostId: UUID?
    var date: Date
    var place: String
    var neighborhood: String
    var genre: Genre
    var wantedInstruments: [Instrument]
    /// Niveaux acceptés pour ce SOS (nil ou vide = tous les niveaux). Sert à
    /// ne montrer l'annonce qu'aux musiciens du bon calibre. Optionnel — les
    /// annonces d'avant la 1.6 n'en ont pas.
    var wantedLevels: [Level]?
    /// Instruments déjà pourvus (candidat accepté) — retirés des postes
    /// ouverts. Optionnel : absent de SeedData.json et des caches d'avant 1.2
    /// (le décodeur synthétisé ignore les valeurs par défaut).
    var filledInstruments: [Instrument]?
    /// Cachet proposé en CHF (nil = à discuter).
    var fee: Int?
    /// Moyen de versement du cachet (token PaymentMethod ou texte libre).
    var paymentMethod: String?
    var descriptionText: String
    /// L'utilisateur a postulé à cette annonce.
    var applied: Bool = false
    /// Si j'ai postulé : l'instrument proposé et l'état de ma candidature.
    var myApplicationInstrument: Instrument?
    var myApplicationStatus: GigApplicationStatus?
    var isMine: Bool = false
    /// Date de publication — les 30 premières minutes sont réservées aux
    /// membres Premium (la killer feature « alerte en avance »).
    var postedAt: Date?
    /// Groupe et événement à l'origine du SOS (remplacement d'un membre).
    /// Le lien sert au groupe : dès que le poste est pourvu, le line-up de
    /// l'événement redevient complet, sans que personne ait à le dire.
    var groupId: UUID?
    var eventId: UUID?
    /// SOS adressé à UN musicien précis (« Demander un dépannage ») : lui seul
    /// le voit, et il l'accepte ou le refuse. nil = annonce ouverte à tous.
    var targetId: UUID?
    var targetStatus: DirectRequestStatus?

    /// Postes encore à pourvoir (recherchés moins déjà pourvus).
    var openInstruments: [Instrument] {
        let filled = filledInstruments ?? []
        return wantedInstruments.filter { !filled.contains($0) }
    }

    /// Tous les postes sont pourvus.
    var isFilled: Bool { !wantedInstruments.isEmpty && openInstruments.isEmpty }

    /// Demande adressée à une personne, plutôt qu'une annonce publique.
    var isDirect: Bool { targetId != nil }

    enum CodingKeys: String, CodingKey {
        case id, title, hostName, hostId, date, place, neighborhood, genre
        case wantedInstruments, wantedLevels, filledInstruments, fee, paymentMethod
        case descriptionText
        case applied, myApplicationInstrument, myApplicationStatus, isMine, postedAt
        case groupId, eventId, targetId, targetStatus
    }

    /// Les niveaux demandés, prêts à l'emploi (vide = tous les niveaux).
    var levels: [Level] { wantedLevels ?? [] }

    /// Libellé des niveaux demandés (nil = ouvert à tous).
    var levelsLabel: String? {
        guard !levels.isEmpty, levels.count < Level.allCases.count else { return nil }
        return levels.sorted().map(\.label).joined(separator: " · ")
    }

    /// Ce SOS me correspond-il ? Deux questions, celles qu'on se pose vraiment
    /// en regardant une annonce : « est-ce que je joue de cet instrument ? »
    /// et « est-ce que je suis du niveau demandé ? ». Un poste déjà pourvu ne
    /// compte pas, et un profil sans instrument voit tout (il n'a rien dit de
    /// lui, on ne va pas décider à sa place).
    func matches(instruments myInstruments: [Instrument], levelFor: (Instrument) -> Level) -> Bool {
        // Mes annonces, celles qui me sont adressées et celles où j'ai posé
        // ma candidature restent visibles quoi qu'il arrive : on ne fait pas
        // disparaître quelque chose que la personne suit déjà.
        if isMine || isDirect || applied { return true }
        guard !myInstruments.isEmpty else { return true }
        let open = openInstruments.isEmpty ? wantedInstruments : openInstruments
        guard !open.isEmpty else { return true }
        let mine = Set(myInstruments)
        let playable = open.filter { mine.contains($0) }
        guard !playable.isEmpty else { return false }
        guard !levels.isEmpty else { return true }
        return playable.contains { levels.contains(levelFor($0)) }
    }

    var feeLabel: String {
        if let fee { return fee == 0 ? "Sans cachet" : "CHF \(fee)" }
        return "À discuter"
    }

    /// Clé de traduction du moyen de versement affiché, nil si non renseigné.
    var paymentLabel: String? {
        guard let paymentMethod, !paymentMethod.isEmpty else { return nil }
        return PaymentMethod.displayLabel(for: paymentMethod)
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

/// État d'une candidature à un SOS.
enum GigApplicationStatus: String, Codable, Hashable {
    case pending, accepted, declined
}

/// État d'une demande de dépannage adressée à un musicien précis.
enum DirectRequestStatus: String, Codable, Hashable {
    case pending, accepted, declined
}

/// Une ligne de l'agenda « Mes événements » : tout ce qui m'attend, d'où que
/// ça vienne — une date de mes groupes, un dépannage qu'on m'a confié, un SOS
/// que j'organise, une candidature en attente de réponse.
struct AgendaItem: Identifiable, Hashable {
    enum Source: Hashable {
        /// Une date d'un de mes groupes (concert, répé, jam).
        case group(groupID: UUID, name: String, emoji: String, event: GroupEvent)
        /// Un dépannage accepté : je joue chez quelqu'un.
        case playing(gig: GigRequest)
        /// Un SOS que j'ai publié et que je gère.
        case hosting(gig: GigRequest)
        /// J'ai postulé, j'attends la réponse de l'organisateur.
        case applied(gig: GigRequest)
    }

    var source: Source
    var date: Date

    var id: String {
        switch source {
        case .group(_, _, _, let event): return "group-\(event.id.uuidString)"
        case .playing(let gig): return "playing-\(gig.id.uuidString)"
        case .hosting(let gig): return "hosting-\(gig.id.uuidString)"
        case .applied(let gig): return "applied-\(gig.id.uuidString)"
        }
    }

    var title: String {
        switch source {
        case .group(_, _, _, let event): return event.title
        case .playing(let gig), .hosting(let gig), .applied(let gig): return gig.title
        }
    }

    var place: String {
        switch source {
        case .group(_, _, _, let event): return event.venue
        case .playing(let gig), .hosting(let gig), .applied(let gig):
            return [gig.place, gig.neighborhood].filter { !$0.isEmpty }.joined(separator: " · ")
        }
    }

    /// Le mois d'appartenance, pour grouper la liste.
    func monthKey(calendar: Calendar = .current) -> Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }

    /// La carte « Prochaine date » est déjà une représentation complète de
    /// l'élément vedette. On la retire donc de la liste mensuelle par identité
    /// stricte, sans fusionner deux vraies sessions simplement parce qu'elles
    /// ont lieu le même jour ou à la même heure.
    static func listItems(
        from items: [AgendaItem],
        excludingFeatured featured: AgendaItem?,
        excludingIDs: Set<AgendaItem.ID> = []
    ) -> [AgendaItem] {
        items.filter { item in
            !excludingIDs.contains(item.id) && item.id != featured?.id
        }
    }

    /// Un SOS rattaché à une date de groupe n'est qu'un moyen de compléter
    /// son line-up : si cette date est déjà visible dans l'agenda du membre,
    /// afficher aussi le SOS créerait une fausse deuxième session. Pour un
    /// non-membre qui ne voit pas l'événement de groupe, le SOS reste visible.
    static func shouldIncludeGig(
        linkedEventID: GroupEvent.ID?,
        visibleGroupEventIDs: Set<GroupEvent.ID>
    ) -> Bool {
        guard let linkedEventID else { return true }
        return !visibleGroupEventIDs.contains(linkedEventID)
    }
}

/// Destination typée vers UNE date de groupe. Transporter les deux UUID
/// empêche l'agenda de retomber sur l'écran complet du groupe.
struct GroupEventRoute: Hashable {
    let groupID: GroupChat.ID
    let eventID: GroupEvent.ID
}

/// Un musicien qui joue UN soir avec le groupe : trouvé par SOS, accepté par
/// le leader. Il n'entre pas dans le groupe — il n'apparaît que dans cet
/// événement-là, avec son badge « Invité ».
struct EventGuest: Identifiable, Hashable {
    var eventID: UUID
    var groupID: UUID
    var musicianID: UUID
    var name: String
    var instrument: Instrument?
    var photoURL: String?

    var id: String { "\(eventID.uuidString)-\(musicianID.uuidString)" }
}

/// Un candidat à un SOS, vu par l'organisateur (liste groupée par instrument).
struct GigApplicant: Identifiable, Hashable {
    /// Identifiant de la candidature (gig_applications.id).
    let id: UUID
    var musician: Musician
    var instrument: Instrument?
    var status: GigApplicationStatus
}

// MARK: - Messagerie

struct Message: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var text: String
    var isFromMe: Bool
    var date: Date
    /// Accusés de réception (mes envois uniquement) — nil = simple « envoyé ».
    var deliveredAt: Date?
    var readAt: Date?
    var attachment: MessageAttachment? = nil
    var editedAt: Date? = nil
    var deletedAt: Date? = nil
    /// Optionnel pour la rétrocompatibilité des caches pré-2.3.
    var reactions: [MessageReaction]? = nil

    enum CodingKeys: String, CodingKey {
        case id, text, isFromMe, date, deliveredAt, readAt, attachment, editedAt, deletedAt, reactions
    }

    var reactionSummaries: [MessageReaction] { reactions ?? [] }

    /// État de la coche affichée sous mes messages.
    enum Receipt { case sent, delivered, read }
    var receipt: Receipt {
        if readAt != nil { return .read }
        if deliveredAt != nil { return .delivered }
        return .sent
    }
}

struct Conversation: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var contactName: String
    var contactInstrument: Instrument
    var messages: [Message]
    /// UUID du contact côté serveur (nil pour les conversations de démo).
    var contactID: UUID?

    enum CodingKeys: String, CodingKey { case id, contactName, contactInstrument, messages, contactID }

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
    /// Mes séjours ailleurs : « dispo, mais à Lisbonne du 12 au 20 ».
    /// Optionnel à dessein : le décodeur synthétisé n'applique PAS les
    /// valeurs par défaut, un champ non-optionnel rendrait indécodables les
    /// profils enregistrés avant la 1.3 (cf. le crash de la 1.2).
    var availabilityPlaces: [AvailabilityPlace]?

    /// Mes séjours, prêts à l'emploi.
    var trips: [AvailabilityPlace] { availabilityPlaces ?? [] }

    /// Le séjour qui couvre ce jour-là, s'il y en a un.
    func place(on date: Date) -> AvailabilityPlace? {
        trips.first { $0.covers(date) }
    }
    // Champs ajoutés après la v0.3 — optionnels pour décoder les anciens
    // profils sauvegardés sans les perdre.
    var country: Country?
    var city: String?
    /// Code postal de la ville choisie (NPA, CP, ZIP…).
    var postalCode: String?
    /// Photo de profil choisie par l'utilisateur (fichier dans Documents).
    var photoFileName: String?
    /// URL publique de ma photo hébergée — repli d'affichage quand le
    /// fichier local manque (nouvel appareil, réinstallation).
    var photoURL: String?
    /// Vidéos de démo (fichiers dans Documents) — ancien format v0.4, sans
    /// date. Conservé pour décoder les profils existants ; voir demoVideos.
    var videoFileNames: [String]?
    /// Vidéos de démo datées — 1 en gratuit, 6 en Premium.
    var demoVideos: [DemoVideo]?
    /// Pseudos réseaux sociaux (clé = SocialNetwork.rawValue).
    var socials: [String: String]?
    /// Niveau par instrument (clé = Instrument.rawValue, valeur =
    /// Level.rawValue). Le niveau global `level` reste le meilleur des
    /// niveaux — filtres et anciens clients continuent de marcher.
    var instrumentLevels: [String: String]?

    /// Statut affiché aux autres, dérivé des dates.
    var availability: Availability { .derived(from: availableDates) }
    var isAvailable: Bool { availability.isAvailable }

    var resolvedCountry: Country { country ?? .switzerland }
    var resolvedCity: String {
        guard let city = city?.trimmingCharacters(in: .whitespacesAndNewlines), !city.isEmpty else {
            return resolvedCountry.cities[0].name
        }
        return city
    }
    /// « 1200 Genève · CH » : un seul format dans toute l'app.
    var cityLabel: String {
        PlaceDraft(
            country: resolvedCountry,
            postalCode: postalCode ?? "",
            city: resolvedCity
        ).label
    }
    /// Identifiant @ de l'utilisateur (dérivé du nom).
    var handle: String { "@" + name.handleized }

    /// Pseudo sur un réseau, s'il est renseigné.
    func socialHandle(_ network: SocialNetwork) -> String? {
        guard let handle = socials?[network.rawValue],
              !handle.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return handle
    }

    mutating func setSocialHandle(_ handle: String, for network: SocialNetwork) {
        var updated = socials ?? [:]
        let clean = network.cleanHandle(handle)
        if clean.isEmpty {
            updated.removeValue(forKey: network.rawValue)
        } else {
            updated[network.rawValue] = clean
        }
        socials = updated
    }

    /// Niveau choisi pour un instrument (nil = pas encore renseigné).
    func level(for instrument: Instrument) -> Level? {
        instrumentLevels?[instrument.rawValue].flatMap(Level.init(rawValue:))
    }

    /// Pose le niveau d'un instrument et aligne le niveau global sur le
    /// meilleur niveau renseigné.
    mutating func setLevel(_ newLevel: Level, for instrument: Instrument) {
        var updated = instrumentLevels ?? [:]
        updated[instrument.rawValue] = newLevel.rawValue
        instrumentLevels = updated
        syncGlobalLevel()
    }

    /// Retire le niveau d'un instrument (quand l'instrument est décoché).
    mutating func removeLevel(for instrument: Instrument) {
        guard instrumentLevels?[instrument.rawValue] != nil else { return }
        instrumentLevels?.removeValue(forKey: instrument.rawValue)
        syncGlobalLevel()
    }

    private mutating func syncGlobalLevel() {
        let levels = (instrumentLevels ?? [:]).values.compactMap(Level.init(rawValue:))
        if let best = levels.max() { level = best }
    }
    /// Vidéos de démo — migre à la volée l'ancien format sans dates.
    var videos: [DemoVideo] {
        demoVideos ?? (videoFileNames ?? []).map { DemoVideo(fileName: $0, date: nil) }
    }
}

/// Une vidéo de démo du profil, avec sa date (enregistrement / concert).
/// En mode live elle est hébergée sur le serveur (`path` + `url`) et visible
/// par tous ; en démo elle reste un fichier local (`fileName`).
struct DemoVideo: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    /// Fichier local dans Documents (mode démo / anciens profils).
    var fileName: String
    /// Titre donné par le musicien (nil = « Vidéo N »).
    var title: String?
    /// Date de la vidéo, affichée sous le titre (nil = non renseignée).
    var date: Date?
    /// Chemin dans le bucket Supabase `demo-videos` (mode live).
    var storagePath: String?
    /// URL publique de lecture (mode live).
    var remoteURL: String?
    /// URL publique de la miniature (mode live, générée à l'envoi).
    var thumbURL: String?

    /// URL de lecture : le serveur d'abord, sinon le fichier local.
    var playbackURL: URL? {
        if let remoteURL, let url = URL(string: remoteURL) { return url }
        guard !fileName.isEmpty else { return nil }
        return AppStore.mediaURL(for: fileName)
    }

    /// Titre affiché : celui du musicien, sinon « Vidéo N » (1-indexé).
    func displayTitle(index: Int, tr: (String) -> String) -> String {
        if let title, !title.trimmingCharacters(in: .whitespaces).isEmpty { return title }
        return String(format: tr("Vidéo %lld"), Int64(index + 1))
    }
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
