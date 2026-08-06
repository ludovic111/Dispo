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
      "T44*AD-7 |G7 |C^7 Z")
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

print(failures == 0 ? "\n✅ tout passe" : "\n❌ \(failures) échec(s)")
