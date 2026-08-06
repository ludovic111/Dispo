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
/// iReal Pro lit deux formats : `irealb://` (le sien, obfusqué, exporté depuis
/// l'app) et `irealbook://`, l'ancien format en clair — que l'éditeur continue
/// d'accepter à l'import justement parce que des milliers de grilles circulent
/// comme ça. C'est celui qu'on écrit :
///
///   irealbook://Titre=Compositeur=Style=Tonalité=n=T44*A{C^7 |A-7 |D-9 |G7 }
///
/// Le groupe n'a donc plus rien à coller : sa grille Dispo s'ouvre dans iReal
/// Pro, déjà transposée dans la tonalité de celui qui l'ouvre.
enum IRealPro {
    /// Schéma d'URL de l'app (pour savoir si elle est installée).
    static let scheme = "irealbook"
    /// La fiche App Store, quand l'app n'est pas installée.
    static let appStoreURL = URL(string: "https://apps.apple.com/app/ireal-pro/id409035833")!

    /// Traduit un accord dans l'alphabet d'iReal Pro : `Cmaj7` → `C^7`,
    /// `Am7` → `A-7`, `Bø` → `Bh`, `C♯` → `C#`.
    static func chord(_ raw: String) -> String {
        let text = raw
            .replacingOccurrences(of: "♭", with: "b")
            .replacingOccurrences(of: "♯", with: "#")
            .replacingOccurrences(of: "∆", with: "^")
            .replacingOccurrences(of: "Δ", with: "^")
            .replacingOccurrences(of: "ø", with: "h")
            .replacingOccurrences(of: "°", with: "o")
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
        // Du plus long au plus court : « maj7 » avant « maj », « min » avant « m ».
        let table: [(String, String)] = [
            ("majeur", "^"), ("maj", "^"), ("Maj", "^"), ("MAJ", "^"), ("M", "^"),
            ("mineur", "-"), ("min", "-"), ("mi", "-"), ("m", "-"),
            ("dim", "o"), ("aug", "+"), ("halfdim", "h")
        ]
        for (from, to) in table where tail.hasPrefix(from) {
            tail = to + tail.dropFirst(from.count)
            break
        }
        return head + tail + bass
    }

    /// Découpe la grille en mesures. Les barres `|` font foi ; sans barre, une
    /// ligne vaut une mesure (c'est ainsi que les grilles se collent souvent).
    static func measures(from grid: String) -> [String] {
        let cleaned = grid.replacingOccurrences(of: "\n", with: " | ")
        let parts: [String] = cleaned.contains("|")
            ? cleaned.split(separator: "|").map(String.init)
            : grid.split(separator: "\n").map(String.init)
        return parts
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    /// Le corps du chart : signature rythmique, section A, puis les mesures.
    static func body(from grid: String) -> String {
        let bars = measures(from: grid).map { bar -> String in
            let chords = bar.split(separator: " ").map { chord(String($0)) }
            return chords.isEmpty ? " " : chords.joined(separator: " ")
        }
        guard !bars.isEmpty else { return "" }
        return "T44*A" + bars.map { $0 + " " }.joined(separator: "|") + "Z"
    }

    /// Le lien complet, prêt à ouvrir. nil si la grille ne donne rien.
    static func link(title: String, composer: String, style: String, key: MusicalKey?, grid: String) -> URL? {
        let chart = body(from: grid)
        guard !chart.isEmpty else { return nil }
        // Le compositeur est rangé « Nom Prénom » dans iReal Pro ; on passe le
        // nom d'artiste tel quel, c'est ce que le groupe a saisi.
        let keyName = (key?.name ?? "C")
            .replacingOccurrences(of: "♭", with: "b")
            .replacingOccurrences(of: "♯", with: "#")
        let fields = [
            title.replacingOccurrences(of: "=", with: "-"),
            composer.replacingOccurrences(of: "=", with: "-"),
            style.isEmpty ? "Jazz-Medium Swing" : style,
            key?.isMinor == true ? keyName + "-" : keyName,
            "n",
            chart
        ]
        let payload = fields.joined(separator: "=")
        // Tout ce qui n'est pas alphanumérique est encodé : l'espace (%20) et
        // le dièse (%23) casseraient l'URL sinon.
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
