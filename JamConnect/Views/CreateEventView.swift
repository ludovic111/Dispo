import SwiftUI

/// Publication d'une annonce SOS : un concert a besoin d'un musicien.
struct CreateEventView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var place = ""
    @State private var neighborhood = "Carouge"
    @State private var date = Calendar.current.date(byAdding: .day, value: 2, to: Date()) ?? Date()
    @State private var genre: Genre = .latin
    @State private var wanted: Set<Instrument> = []
    @State private var feeText = ""
    @State private var descriptionText = ""

    private let neighborhoods = [
        "Carouge", "Eaux-Vives", "Plainpalais", "Pâquis", "Champel",
        "Servette", "Jonction", "Vieille-Ville", "Meyrin", "Lancy", "Onex", "Vernier"
    ]

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !place.trimmingCharacters(in: .whitespaces).isEmpty &&
        !wanted.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Le concert") {
                    TextField("Titre — ex. Cherche pianiste, soirée salsa", text: $title)
                    DatePicker("Date et heure", selection: $date, in: Date()...)
                    Picker("Genre", selection: $genre) {
                        ForEach(Genre.allCases) { genre in
                            Text("\(genre.emoji) \(genre.rawValue)").tag(genre)
                        }
                    }
                }

                Section("Lieu") {
                    TextField("Salle ou bar — ex. Le Chat Noir", text: $place)
                    Picker("Quartier", selection: $neighborhood) {
                        ForEach(neighborhoods, id: \.self) { Text($0) }
                    }
                }

                Section("Musicien recherché") {
                    ForEach(Instrument.allCases) { instrument in
                        Button {
                            if wanted.contains(instrument) {
                                wanted.remove(instrument)
                            } else {
                                wanted.insert(instrument)
                            }
                        } label: {
                            HStack {
                                Text(instrument.rawValue)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if wanted.contains(instrument) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(JC.coral)
                                }
                            }
                        }
                    }
                }

                Section {
                    TextField("Ex. 150", text: $feeText)
                        .keyboardType(.numberPad)
                } header: {
                    Text("Cachet (CHF)")
                } footer: {
                    Text("Laisse vide pour « à discuter ». Un cachet affiché reçoit plus de candidatures.")
                }

                Section("Description") {
                    TextField(
                        "Ex. Notre pianiste est malade — setlist envoyée à l'avance, balance 18h30…",
                        text: $descriptionText,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Publier un SOS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publier") {
                        let gig = GigRequest(
                            title: title,
                            hostName: store.profile.name,
                            date: date,
                            place: place,
                            neighborhood: neighborhood,
                            genre: genre,
                            wantedInstruments: Array(wanted).sorted { $0.rawValue < $1.rawValue },
                            fee: Int(feeText.trimmingCharacters(in: .whitespaces)),
                            descriptionText: descriptionText.isEmpty
                                ? "On cherche quelqu'un de fiable pour nous dépanner — setlist envoyée à l'avance."
                                : descriptionText,
                            isMine: true
                        )
                        store.addEvent(gig)
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
        }
    }
}
