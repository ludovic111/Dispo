import Foundation

// MARK: - Tonalités et instruments transpositeurs

/// La tonalité d'un morceau, en hauteur réelle (« concert »). On la note en
/// lettres (C, B♭, F♯…) : c'est ce qu'il y a sur les grilles d'accords,
/// dans toutes les langues.
struct MusicalKey: Hashable {
    /// 0 = C, 1 = C♯/D♭ … 11 = B.
    var pitchClass: Int
    var isMinor: Bool

    /// Noms préférés, en privilégiant les bémols — l'usage des grilles jazz.
    static let flatNames = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
    static let sharpNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]

    var name: String { name(preferSharps: prefersSharps) }

    func name(preferSharps: Bool) -> String {
        let table = preferSharps ? Self.sharpNames : Self.flatNames
        return table[((pitchClass % 12) + 12) % 12]
    }

    /// Les tonalités du côté dièse du cycle des quintes s'écrivent avec des
    /// dièses : en mi majeur on lit F♯m7, pas G♭m7. Ailleurs, les bémols —
    /// l'usage des grilles.
    var prefersSharps: Bool {
        let sharpMajors: Set<Int> = [7, 2, 9, 4, 11, 6]      // G D A E B F♯
        let sharpMinors: Set<Int> = [4, 11, 6, 1, 8, 3]      // Em Bm F♯m C♯m G♯m D♯m
        return isMinor ? sharpMinors.contains(pitchClass) : sharpMajors.contains(pitchClass)
    }

    /// « B♭ » ou « B♭m ».
    var label: String { isMinor ? name + "m" : name }

    /// Décale la tonalité de n demi-tons (transposition).
    func transposed(by semitones: Int) -> MusicalKey {
        MusicalKey(pitchClass: (((pitchClass + semitones) % 12) + 12) % 12, isMinor: isMinor)
    }

    /// Les 24 tonalités proposées au leader.
    static var allKeys: [MusicalKey] {
        (0..<12).flatMap { [MusicalKey(pitchClass: $0, isMinor: false),
                           MusicalKey(pitchClass: $0, isMinor: true)] }
    }

    /// Relit une tonalité écrite en lettres (« Bb », « F#m », « A »…).
    init?(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard let parsed = MusicTheory.parseRoot(trimmed) else { return nil }
        pitchClass = parsed.pitchClass
        let rest = String(trimmed.dropFirst(parsed.length))
        isMinor = rest.hasPrefix("m") && !rest.hasPrefix("maj")
    }

    init(pitchClass: Int, isMinor: Bool) {
        self.pitchClass = (((pitchClass % 12) + 12) % 12)
        self.isMinor = isMinor
    }
}

/// Comment un instrument est accordé. Une trompette qui lit un C sonne un
/// B♭ : sa partition est donc écrite un ton au-dessus du réel.
enum Transposition: String, Codable, CaseIterable, Identifiable {
    case c = "En ut (do)"
    case bFlat = "En si♭"
    case eFlat = "En mi♭"
    case f = "En fa"

    var id: String { rawValue }

    /// Demi-tons à ajouter à la hauteur réelle pour obtenir la note écrite.
    var semitones: Int {
        switch self {
        case .c: return 0
        case .bFlat: return 2
        case .eFlat: return 9
        case .f: return 7
        }
    }
}

extension Instrument {
    /// Accord habituel de l'instrument. « Saxophone » sans plus de précision
    /// est proposé en mi♭ (l'alto, le plus courant) ; alto et ténor, eux,
    /// sont désormais des instruments à part entière et n'ont plus à être
    /// corrigés à la main.
    var defaultTransposition: Transposition {
        switch self {
        // Le ténor sonne une neuvième majeure sous la note écrite : la
        // tonalité, elle, se lit un ton au-dessus du réel comme la trompette.
        case .trompette, .clarinette, .saxTenor: return .bFlat
        case .saxophone, .saxAlto: return .eFlat
        case .cor: return .f
        default: return .c
        }
    }

    /// Vrai si l'instrument lit dans une autre tonalité que le réel.
    var isTransposing: Bool { defaultTransposition != .c }
}

// MARK: - Export iReal Pro

/// Fabrique un lien iReal Pro à partir d'une grille d'accords.
///
/// iReal Pro lit deux formats : `irealb://`, le sien — obfusqué, non
/// documenté, ce que l'app produit à l'export — et `irealbook://`, le format
/// en clair que l'éditeur documente publiquement et s'engage à continuer de
/// supporter. C'est celui qu'on écrit, six champs séparés par `=` :
///
///   irealbook://Titre=Compositeur=Style=Tonalité=n=[*AT44C^7   |A-7   |G7   Z
///
/// Le groupe n'a donc rien à coller : sa grille Dispo s'ouvre dans iReal Pro,
/// déjà transposée dans la tonalité de celui qui l'ouvre.
///
/// Trois règles de la doc officielle font toute la différence entre un lien
/// qui marche et un morceau qui s'ouvre vide, sans le moindre message :
/// la tonalité doit appartenir à une liste fermée de 24 valeurs, la qualité
/// d'accord à une liste fermée elle aussi, et le `#` doit être encodé (sinon
/// tout ce qui suit passe pour un fragment d'URL et disparaît).
enum IRealPro {
    /// Schéma d'URL utilisé pour les grilles qu'on fabrique.
    static let scheme = "irealbook"
    /// Les deux schémas que l'app enregistre (déclarés dans
    /// `LSApplicationQueriesSchemes`, project.yml) — un lien exporté depuis
    /// iReal Pro utilise `irealb://`, les grilles écrites à la main
    /// `irealbook://`.
    static let schemes = ["irealbook", "irealb"]
    /// La fiche App Store, quand l'app n'est pas installée.
    static let appStoreURL = URL(string: "https://apps.apple.com/app/ireal-pro/id409035833")!

    /// Relit un lien collé par l'utilisateur — et refuse tout ce qui ne vient
    /// pas d'iReal Pro.
    ///
    /// Sans ce filtre, un lien `https://` collé par erreur passe `canOpenURL`
    /// et ouvre Safari : le bouton « Ouvrir iReal Pro » ment. On rattrape au
    /// passage les liens dont les espaces n'ont pas été encodés, ce que
    /// `URL(string:)` refuse.
    static func appLink(_ raw: String?) -> URL? {
        guard let raw else { return nil }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let lower = text.lowercased()
        guard schemes.contains(where: { lower.hasPrefix("\($0)://") }) else { return nil }
        if let url = URL(string: text) { return url }
        return URL(string: text.replacingOccurrences(of: " ", with: "%20"))
    }

    // MARK: Listes fermées de la doc officielle
    //
    // iReal Pro n'accepte que 24 tonalités et une liste finie de qualités
    // d'accord. Tout ce qui en sort fait ouvrir un morceau VIDE, sans message
    // d'erreur — c'est la cause la plus probable des « parfois ça ne marche
    // pas » : « F# » n'est pas une tonalité valide (c'est « Gb »), et
    // « Csus4 » n'est pas une qualité valide (c'est « Csus »).

    /// Les 12 tonalités majeures acceptées, par hauteur — que des bémols.
    private static let majorKeys = [
        "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"
    ]
    /// Les 12 tonalités mineures acceptées — trois dièses seulement.
    private static let minorKeys = [
        "C-", "C#-", "D-", "Eb-", "E-", "F-", "F#-", "G-", "G#-", "A-", "Bb-", "B-"
    ]

    /// Les qualités d'accord de la doc officielle. Ce qui n'y figure pas doit
    /// être écrit entre astérisques, sinon l'accord casse la grille.
    private static let qualities: Set<String> = [
        "5", "2", "add9", "+", "o", "h", "sus", "^", "-", "^7", "-7", "7", "7sus",
        "h7", "o7", "^9", "^13", "6", "69", "^7#11", "^9#11", "^7#5", "-6", "-69",
        "-^7", "-^9", "-9", "-11", "-7b5", "h9", "-b6", "-#5", "9", "7b9", "7#9",
        "7#11", "7b5", "7#5", "9#11", "9b5", "9#5", "7b13", "7#9#5", "7#9b5",
        "7#9#11", "7b9#11", "7b9b5", "7b9#5", "7b9#9", "7b9b13", "7alt", "13",
        "13#11", "13b9", "13#9", "7b9sus", "7susadd3", "9sus", "13sus", "7b13sus",
        "11", "min13", "min^11", "min^13", "maj13#11", "maj7b5", "maj7#9",
        "min7b6", "min9b6", "maj(add4)", "min(add4)", "7(add13)"
    ]

    /// La tonalité, écrite comme iReal Pro l'attend. Hors des 24 valeurs
    /// admises l'import s'ouvre vide : on ramène donc toujours la hauteur sur
    /// l'orthographe officielle (fa♯ majeur → « Gb », ré♯ mineur → « Eb- »).
    static func keyLabel(for key: MusicalKey?) -> String {
        guard let key else { return "C" }
        let pitch = ((key.pitchClass % 12) + 12) % 12
        return key.isMinor ? minorKeys[pitch] : majorKeys[pitch]
    }

    /// Traduit un accord dans l'alphabet d'iReal Pro : `Cmaj7` → `C^7`,
    /// `Am7` → `A-7`, `Bø` → `Bh`, `C♯` → `C#`, `Csus4` → `Csus`.
    static func chord(_ raw: String) -> String {
        let text = raw
            .replacingOccurrences(of: "♭", with: "b")
            .replacingOccurrences(of: "♯", with: "#")
            .replacingOccurrences(of: "∆", with: "^")
            .replacingOccurrences(of: "Δ", with: "^")
            .replacingOccurrences(of: "ø", with: "h")
            .replacingOccurrences(of: "°", with: "o")
            // Avant tout découpage : la barre de « C6/9 » n'est pas une basse.
            .replacingOccurrences(of: "6/9", with: "69")
        guard let root = MusicTheory.parseRoot(text) else { return text }
        let head = String(text.prefix(root.length))
        var tail = String(text.dropFirst(root.length))
        // La basse d'un accord slash garde sa notation, on ne traite que la
        // couleur de l'accord.
        var bass = ""
        if let slash = tail.firstIndex(of: "/") {
            bass = String(tail[slash...])
            tail = String(tail[..<slash])
        }
        // Du plus long au plus court : « maj7 » avant « maj », « min » avant
        // « m ». L'ordre porte le sens, ne pas le réarranger.
        let table: [(String, String)] = [
            ("majeur", "^"), ("maj", "^"), ("Maj", "^"), ("MAJ", "^"), ("M", "^"),
            ("mineur", "-"), ("min", "-"), ("mi", "-"), ("m", "-"),
            ("dim", "o"), ("aug", "+"), ("halfdim", "h")
        ]
        for (from, to) in table where tail.hasPrefix(from) {
            tail = to + tail.dropFirst(from.count)
            break
        }
        return head + normalizedQuality(tail) + bass
    }

    /// Ramène une couleur d'accord dans la liste officielle. Les écritures
    /// courantes (`sus4`, `alt`, `6/9`) y ont leur équivalent ; le reste part
    /// entre astérisques — la façon documentée d'écrire une qualité qu'iReal
    /// Pro ne connaît pas, plutôt que de casser la grille entière.
    static func normalizedQuality(_ quality: String) -> String {
        var text = quality.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return "" }
        // « 7sus4 » → « 7sus », « C6/9 » → « C69 », « alt » → « 7alt ».
        let aliases: [(String, String)] = [("6/9", "69"), ("sus4", "sus"), ("sus2", "2"), ("alt", "7alt")]
        for (from, to) in aliases where text.hasSuffix(from) {
            text = String(text.dropLast(from.count)) + to
            break
        }
        return qualities.contains(text) ? text : "*\(text)*"
    }

    /// Découpe la grille en mesures. Les barres `|` font foi ; sans barre, une
    /// ligne vaut une mesure (c'est ainsi que les grilles se collent souvent).
    /// Les symboles de structure tapés à la main (`{ } [ ] Z`) sont retirés :
    /// `body(from:)` en réécrit une propre.
    static func measures(from grid: String) -> [String] {
        var stripped = grid
        for symbol in ["{", "}", "[", "]"] {
            stripped = stripped.replacingOccurrences(of: symbol, with: "")
        }
        let cleaned = stripped.replacingOccurrences(of: "\n", with: " | ")
        let parts: [String] = cleaned.contains("|")
            ? cleaned.split(separator: "|").map(String.init)
            : stripped.split(separator: "\n").map(String.init)
        return parts
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    /// Une grille tient dans 16 cellules par ligne et 12 lignes — 192 cellules.
    /// Au-delà, iReal Pro ne promet rien : on s'arrête sur une mesure entière
    /// plutôt que de livrer un chart coupé au milieu.
    static let maxCells = 192

    /// Le corps du chart : barre ouvrante, section A, mesure à 4 temps, puis
    /// les mesures — chacune calée sur quatre cellules, ce qui donne les
    /// quatre mesures par ligne attendues par iReal Pro.
    static func body(from grid: String) -> String {
        var cells = 0
        var bars: [String] = []
        for bar in measures(from: grid) {
            let chords = bar.split(separator: " ").map { chord(String($0)) }
            guard !chords.isEmpty else { continue }
            // Un accord = une cellule, un espace = une cellule. Une mesure
            // occupe au minimum les quatre cellules d'une mesure à 4 temps.
            let written = chords.count * 2 - 1
            let used = max(4, written)
            if cells + used > maxCells { break }
            cells += used
            let padding = String(repeating: " ", count: max(1, 4 - written))
            bars.append(chords.joined(separator: " ") + padding)
        }
        guard !bars.isEmpty else { return "" }
        return "[*AT44" + bars.joined(separator: "|") + "Z"
    }

    /// Le lien complet, prêt à ouvrir. nil si la grille ne donne rien.
    static func link(title: String, composer: String, style: String, key: MusicalKey?, grid: String) -> URL? {
        let chart = body(from: grid)
        guard !chart.isEmpty else { return nil }
        // Le `=` sépare les six champs : la doc interdit noir sur blanc qu'il
        // apparaisse dans les données elles-mêmes.
        func field(_ text: String) -> String {
            text.replacingOccurrences(of: "=", with: "-")
        }
        let fields = [
            field(title),
            // Le compositeur est rangé « Nom Prénom » dans iReal Pro ; on passe
            // le nom d'artiste tel quel, c'est ce que le groupe a saisi.
            field(composer),
            field(style.isEmpty ? "Medium Swing" : style),
            keyLabel(for: key),
            // Cinquième champ : « no longer used », mais les six sont exigés.
            "n",
            chart
        ]
        let payload = fields.joined(separator: "=")
        // Un seul passage d'encodage, jeu strict (les « unreserved » de la
        // RFC 3986). iReal Pro percent-décode toute la chaîne AVANT de
        // découper sur les `=` — l'éditeur encode d'ailleurs ses propres
        // séparateurs en %3D dans ses exemples officiels. Sur-encoder est donc
        // sans danger ; laisser un `#` en clair, lui, tronque l'URL au
        // fragment et fait ouvrir un morceau vide.
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        guard let encoded = payload.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "\(scheme)://" + encoded)
    }
}

// MARK: - Transposition d'une grille d'accords

/// Décale une grille d'accords écrite en toutes lettres. On ne touche qu'aux
/// fondamentales (et à la basse après un `/`) : la couleur de l'accord
/// (m7, 7♭9, sus4…) et la mise en page sont laissées telles quelles.
enum MusicTheory {

    /// Lit la fondamentale au début d'une chaîne. Renvoie sa hauteur et le
    /// nombre de caractères consommés, ou nil si ça ne commence pas par un
    /// nom de note.
    static func parseRoot(_ text: String) -> (pitchClass: Int, length: Int)? {
        guard let first = text.first else { return nil }
        let naturals: [Character: Int] = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11]
        guard let base = naturals[Character(first.uppercased())] else { return nil }
        var pitch = base
        var length = 1
        if let second = text.dropFirst().first {
            switch second {
            case "#", "♯": pitch += 1; length = 2
            case "b", "♭": pitch -= 1; length = 2
            default: break
            }
        }
        return ((pitch % 12 + 12) % 12, length)
    }

    /// Transpose un accord isolé (« Bbmaj7/D » → « Cmaj7/E »). `preferSharps`
    /// vient de la tonalité d'arrivée, pour que toute la grille s'écrive
    /// dans le même alphabet.
    static func transposeChord(_ chord: String, by semitones: Int, preferSharps: Bool = false) -> String {
        guard let root = parseRoot(chord) else { return chord }
        let newRoot = MusicalKey(pitchClass: root.pitchClass + semitones, isMinor: false)
            .name(preferSharps: preferSharps)
        var rest = String(chord.dropFirst(root.length))
        // La basse d'un accord slash se transpose aussi.
        if let slash = rest.firstIndex(of: "/") {
            let bass = String(rest[rest.index(after: slash)...])
            if let bassRoot = parseRoot(bass) {
                let newBass = MusicalKey(pitchClass: bassRoot.pitchClass + semitones, isMinor: false)
                    .name(preferSharps: preferSharps)
                rest = String(rest[..<slash]) + "/" + newBass + String(bass.dropFirst(bassRoot.length))
            }
        }
        return newRoot + rest
    }

    /// Transpose une grille entière en conservant sauts de ligne, barres de
    /// mesure et espacement — on veut relire la même grille, un ton plus haut.
    /// `preferSharps` : passer la préférence de la tonalité d'arrivée, pour
    /// que la grille entière s'écrive en dièses ou en bémols, pas les deux.
    static func transposeGrid(_ grid: String, by semitones: Int, preferSharps: Bool = false) -> String {
        guard semitones % 12 != 0 else { return grid }
        var result = ""
        var token = ""
        // Un « mot » est une suite de caractères d'accord ; tout le reste
        // (espaces, barres, retours à la ligne, parenthèses) est recopié.
        func flush() {
            if !token.isEmpty {
                result += transposeChord(token, by: semitones, preferSharps: preferSharps)
                token = ""
            }
        }
        for character in grid {
            if character.isLetter || character.isNumber
                || "#♯b♭/+-°ø∆".contains(character) {
                token.append(character)
            } else {
                flush()
                result.append(character)
            }
        }
        flush()
        return result
    }
}
