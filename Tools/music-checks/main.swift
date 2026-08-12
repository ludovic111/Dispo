import Foundation

var failures = 0
func check(_ label: String, _ got: String, _ want: String) {
    let ok = got == want
    if !ok { failures += 1 }
    print("\(ok ? "OK  " : "ECHEC")  \(label)  →  \(got)\(ok ? "" : "   (attendu \(want))")")
}

// Une trompette (si♭) lit un ton au-dessus du réel.
let concertC = MusicalKey("C")!
check("Do réel → trompette (si♭)", concertC.transposed(by: Transposition.bFlat.semitones).label, "D")
// Un sax alto (mi♭) lit une sixte majeure au-dessus.
check("Do réel → sax alto (mi♭)", concertC.transposed(by: Transposition.eFlat.semitones).label, "A")
// Un cor (fa) lit une quinte au-dessus.
check("Do réel → cor (fa)", concertC.transposed(by: Transposition.f.semitones).label, "G")
// Cas classique du jazz : Autumn Leaves en sol mineur.
let gMinor = MusicalKey("Gm")!
check("Sol mineur → sax alto", gMinor.transposed(by: 9).label, "Em")
check("Sol mineur → trompette", gMinor.transposed(by: 2).label, "Am")
// Bouclage par-dessus l'octave.
check("Si♭ + 2 demi-tons", MusicalKey("Bb")!.transposed(by: 2).label, "C")
// Le ténor sonne une neuvième majeure sous la note écrite : à l'octave près,
// il lit donc comme la trompette (si♭).
check("Do réel → sax ténor (si♭)", concertC.transposed(by: Transposition.bFlat.semitones).label, "D")
// Le morceau en mi♭ : l'alto le lit en ut, le ténor en fa.
let concertEFlat = MusicalKey("Eb")!
check("Mi♭ réel → sax alto", concertEFlat.transposed(by: Transposition.eFlat.semitones).label, "C")
check("Mi♭ réel → sax ténor", concertEFlat.transposed(by: Transposition.bFlat.semitones).label, "F")

// Grille : la mise en page et la couleur des accords sont conservées.
check("Grille ii-V-I (+2)",
      MusicTheory.transposeGrid("| Dm7 | G7 | Cmaj7 | Cmaj7 |", by: 2),
      "| Em7 | A7 | Dmaj7 | Dmaj7 |")
check("Accord slash",
      MusicTheory.transposeChord("Bbmaj7/D", by: 2), "Cmaj7/E")
check("Altérations complexes",
      MusicTheory.transposeChord("F#7b9", by: 3), "A7b9")
// La ré majeur → mi majeur : côté dièse, donc F♯ et non G♭.
check("Grille multiligne (dièses)",
      MusicTheory.transposeGrid("| Am7 | D7 |\n| Gmaj7 | % |", by: 9, preferSharps: true),
      "| F♯m7 | B7 |\n| Emaj7 | % |")
check("Orthographe bémol par défaut",
      MusicTheory.transposeGrid("| Fmaj7 |", by: 1), "| G♭maj7 |")
check("Mi majeur préfère les dièses", MusicalKey("E")!.prefersSharps ? "oui" : "non", "oui")
check("Si♭ majeur préfère les bémols", MusicalKey("Bb")!.prefersSharps ? "oui" : "non", "non")
check("Transposition nulle inchangée",
      MusicTheory.transposeGrid("| Cmaj7 | Am7 |", by: 0), "| Cmaj7 | Am7 |")

// MARK: - Export iReal Pro (format irealbook://, en clair)

check("Accord majeur 7 → iReal", IRealPro.chord("Cmaj7"), "C^7")
check("Accord mineur 7 → iReal", IRealPro.chord("Am7"), "A-7")
check("Demi-diminué → iReal", IRealPro.chord("Bø7"), "Bh7")
check("Diminué → iReal", IRealPro.chord("C°7"), "Co7")
check("Bémol Unicode → iReal", IRealPro.chord("B♭maj7"), "Bb^7")
check("Accord slash conservé", IRealPro.chord("Bbmaj7/D"), "Bb^7/D")
check("Altération intacte", IRealPro.chord("G7#5"), "G7#5")
check("Mesures depuis les barres",
      IRealPro.measures(from: "| Dm7 | G7 | Cmaj7 |").joined(separator: "/"),
      "Dm7/G7/Cmaj7")
check("Mesures depuis les lignes (sans barre)",
      IRealPro.measures(from: "Dm7\nG7").joined(separator: "/"), "Dm7/G7")
check("Corps du chart",
      IRealPro.body(from: "| Dm7 | G7 | Cmaj7 |"),
      "[*AT44D-7   |G7   |C^7   Z")
// Deux accords dans la mesure : quatre cellules quand même.
check("Mesure à deux accords",
      IRealPro.body(from: "| Dm7 G7 |"),
      "[*AT44D-7 G7 Z")
// Les barres de structure tapées à la main ne doivent pas doubler les nôtres.
check("Structure saisie à la main nettoyée",
      IRealPro.body(from: "{ Cmaj7 | Am7 }"),
      "[*AT44C^7   |A-7   Z")

// --- Listes fermées : hors liste, iReal Pro ouvre un morceau VIDE ---
// Fa♯ majeur n'existe pas dans les 24 tonalités admises : c'est « Gb ».
check("Fa♯ majeur → Gb", IRealPro.keyLabel(for: MusicalKey(pitchClass: 6, isMinor: false)), "Gb")
// Ré♯ mineur non plus : c'est « Eb- ».
check("Ré♯ mineur → Eb-", IRealPro.keyLabel(for: MusicalKey(pitchClass: 3, isMinor: true)), "Eb-")
check("Do♯ mineur reste C#-", IRealPro.keyLabel(for: MusicalKey(pitchClass: 1, isMinor: true)), "C#-")
check("Si♭ majeur", IRealPro.keyLabel(for: MusicalKey("Bb")!), "Bb")
check("Tonalité absente → C", IRealPro.keyLabel(for: nil), "C")
// « sus4 » et « alt » ne sont pas des qualités valides.
check("Csus4 → Csus", IRealPro.chord("Csus4"), "Csus")
check("C7sus4 → C7sus", IRealPro.chord("C7sus4"), "C7sus")
check("Calt → C7alt", IRealPro.chord("Calt"), "C7alt")
check("C6/9 → C69", IRealPro.chord("C6/9"), "C69")
check("Qualité inconnue encadrée", IRealPro.chord("C7b9b11"), "C*7b9b11*")
check("Qualité valide intacte", IRealPro.chord("Cm7b5"), "C-7b5")
check("Accord nu intact", IRealPro.chord("C"), "C")
// Le plafond de 192 cellules : 60 mesures d'un accord = 240 cellules.
check("Grille trop longue tronquée sur une mesure entière",
      "\(IRealPro.body(from: Array(repeating: "C", count: 60).joined(separator: "\n")).components(separatedBy: "|").count)",
      "48")
// L'URL doit être encodée : ni espace ni dièse ne survivent en clair.
let sample = IRealPro.link(
    title: "Blue Bossa", composer: "Dorham Kenny", style: "",
    key: MusicalKey("C")!, grid: "| Cm7 | Fm7 | Dm7b5 | G7#5 |"
)
check("Lien iReal généré", sample?.scheme ?? "(nil)", "irealbook")
check("Lien sans espace brut", (sample?.absoluteString.contains(" ") ?? true) ? "oui" : "non", "non")
check("Dièse encodé", (sample?.absoluteString.contains("%23") ?? false) ? "oui" : "non", "oui")
check("Titre présent dans le lien",
      (sample?.absoluteString.contains("Blue%20Bossa") ?? false) ? "oui" : "non", "oui")
check("Grille vide → pas de lien",
      IRealPro.link(title: "X", composer: "", style: "", key: nil, grid: "   ") == nil ? "nil" : "url",
      "nil")

// Recherche documentée et échange HTML officiel.
check("Recherche iReal Pro encodée",
      IRealPro.searchURL("All The Things You Are")?.absoluteString ?? "nil",
      "irealb://search?All%20The%20Things%20You%20Are")
if let sample, let html = IRealPro.htmlDocument(title: "Blue & Bossa", chartURL: sample) {
    check("HTML échappe le titre",
          String(data: html, encoding: .utf8)?.contains("Blue &amp; Bossa") == true ? "oui" : "non",
          "oui")
    let imported = try? IRealPro.charts(fromHTML: html)
    check("HTML réimporte une grille", "\(imported?.count ?? 0)", "1")
    check("HTML conserve le lien", imported?.first?.url.absoluteString ?? "nil", sample.absoluteString)
} else {
    check("Document HTML généré", "nil", "document")
}
check("HTML sans grille refusé",
      (try? IRealPro.charts(fromHTML: Data("<html></html>".utf8))) == nil ? "oui" : "non",
      "oui")

print(failures == 0 ? "\n✅ tout passe" : "\n❌ \(failures) échec(s)")
