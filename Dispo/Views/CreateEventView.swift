import SwiftUI

/// Publication d'une annonce SOS : un concert a besoin d'un musicien.
struct CreateEventView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var place: String
    @State private var neighborhood = "Carouge"
    @State private var date: Date
    @State private var genre: Genre = .latin
    @State private var wanted: Set<Instrument> = []
    @State private var feeMode: FeeMode = .negotiable
    @State private var feeText = ""
    @State private var paymentMethod: PaymentMethod?
    @State private var customPayment = ""
    @State private var useCustomPayment = false
    @State private var descriptionText = ""

    /// Comment le cachet est annoncé : un montant, « à discuter », ou pas
    /// de cachet du tout (jam, bœuf, concert bénévole…).
    enum FeeMode: String, CaseIterable, Identifiable {
        case negotiable = "À discuter"
        case amount = "Montant"
        case none = "Sans cachet"
        var id: String { rawValue }
    }
    /// L'annonce venant d'être publiée — déclenche l'écran de matching.
    @State private var published: GigRequest?

    /// Groupe et événement à l'origine du SOS — le lien reste attaché à
    /// l'annonce : le remplaçant trouvé rejoint ce concert-là (et seulement
    /// celui-là), et le line-up du groupe redevient complet tout seul.
    private let groupID: UUID?
    private let eventID: UUID?

    /// Pré-remplissage (ex. SOS lancé depuis un concert de groupe).
    init(
        prefillTitle: String = "",
        prefillPlace: String = "",
        prefillDate: Date? = nil,
        prefillInstruments: [Instrument] = [],
        groupID: UUID? = nil,
        eventID: UUID? = nil
    ) {
        _title = State(initialValue: prefillTitle)
        _place = State(initialValue: prefillPlace)
        _date = State(initialValue: prefillDate
            ?? Calendar.current.date(byAdding: .day, value: 2, to: Date())
            ?? Date())
        _wanted = State(initialValue: Set(prefillInstruments))
        self.groupID = groupID
        self.eventID = eventID
    }

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
            if let published {
                SOSMatchView(gig: published) { dismiss() }
            } else {
                form
            }
        }
    }

    private var form: some View {
            Form {
                Section("Le concert") {
                    TextField("Titre — ex. Cherche pianiste, soirée salsa", text: $title)
                    DatePicker("Date et heure", selection: $date, in: Date()...)
                    Picker("Genre", selection: $genre) {
                        ForEach(GenreFamily.allCases) { family in
                            Section {
                                ForEach(Genre.genres(in: family)) { genre in
                                    Text(LocalizedStringKey(genre.rawValue)).tag(genre)
                                }
                            } header: {
                                Text(family.emoji + " ") + Text(LocalizedStringKey(family.rawValue))
                            }
                        }
                    }
                }

                Section("Lieu") {
                    TextField("Salle ou bar — ex. Le Chat Noir", text: $place)
                    Picker("Quartier", selection: $neighborhood) {
                        ForEach(neighborhoods, id: \.self) { Text($0) }
                    }
                }

                // Musicien recherché — une section par famille d'instruments.
                ForEach(InstrumentCategory.allCases) { category in
                    Section {
                        ForEach(Instrument.instruments(in: category)) { instrument in
                            Button {
                                if wanted.contains(instrument) {
                                    wanted.remove(instrument)
                                } else {
                                    wanted.insert(instrument)
                                }
                            } label: {
                                HStack {
                                    Text(LocalizedStringKey(instrument.rawValue))
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if wanted.contains(instrument) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(JC.signal)
                                    }
                                }
                            }
                        }
                    } header: {
                        if category == InstrumentCategory.allCases.first {
                            Text("Musicien recherché — ") + Text(LocalizedStringKey(category.rawValue))
                        } else {
                            Text(LocalizedStringKey(category.rawValue))
                        }
                    }
                }

                // Les cachets se règlent entre professionnels : un amateur ne
                // les annonce pas et ne les voit pas.
                if store.profile.level == .pro {
                    Section {
                        Picker("Cachet", selection: $feeMode.animation()) {
                            ForEach(FeeMode.allCases) { mode in
                                Text(LocalizedStringKey(mode.rawValue)).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        if feeMode == .amount {
                            TextField("Ex. 150", text: $feeText)
                                .keyboardType(.numberPad)
                        }
                        if feeMode != .none {
                            PaymentMethodField(
                                method: $paymentMethod,
                                custom: $customPayment,
                                useCustom: $useCustomPayment
                            )
                        }
                    } header: {
                        Text("Cachet (CHF)")
                    } footer: {
                        Text(feeMode == .none
                             ? "Le SOS s'affiche « Sans cachet » — parfait pour une jam ou un concert bénévole."
                             : "Le cachet reste discret : il ne s'affiche qu'en ouvrant le SOS, et seulement pour les professionnels.")
                    }
                }

                Section {
                    TextField(
                        "Ex. Notre pianiste est malade — setlist envoyée à l'avance, balance 18h30…",
                        text: $descriptionText,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                } header: {
                    Text("Description (optionnel)")
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
                            fee: {
                                switch feeMode {
                                case .amount: return Int(feeText.trimmingCharacters(in: .whitespaces))
                                case .negotiable: return nil
                                case .none: return 0
                                }
                            }(),
                            paymentMethod: feeMode == .none ? nil : PaymentMethodField.storedValue(
                                method: paymentMethod,
                                custom: customPayment,
                                useCustom: useCustomPayment
                            ),
                            descriptionText: descriptionText.trimmingCharacters(in: .whitespacesAndNewlines),
                            isMine: true,
                            groupId: groupID,
                            eventId: eventID
                        )
                        store.addEvent(gig)
                        withAnimation { published = gig }
                    }
                    .disabled(!isValid)
                }
            }
    }
}

// MARK: - Moyen de versement du cachet

/// Sélecteur du moyen de versement : Twint, virement, espèces, Cash App —
/// ou un moyen personnalisé saisi librement. Partagé entre la publication
/// d'un SOS et la demande de dépannage directe.
struct PaymentMethodField: View {
    @Binding var method: PaymentMethod?
    @Binding var custom: String
    @Binding var useCustom: Bool

    /// Valeur stockée : token connu, texte libre, ou nil si rien de choisi.
    static func storedValue(method: PaymentMethod?, custom: String, useCustom: Bool) -> String? {
        if useCustom {
            let trimmed = custom.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return method?.rawValue
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Versé par")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(PaymentMethod.allCases) { option in
                        chip(
                            label: option.label,
                            icon: option.symbol,
                            isOn: !useCustom && method == option
                        ) {
                            useCustom = false
                            method = (method == option) ? nil : option
                        }
                    }
                    chip(label: "Autre…", icon: "square.and.pencil", isOn: useCustom) {
                        useCustom.toggle()
                        if useCustom { method = nil }
                    }
                }
            }
            if useCustom {
                TextField("Ex. PayPal, Revolut…", text: $custom)
                    .textInputAutocapitalization(.words)
            }
        }
        .padding(.vertical, 2)
    }

    private func chip(label: String, icon: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .bold))
                Text(LocalizedStringKey(label))
                    .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(isOn ? JC.laiton.opacity(0.2) : JC.inset, in: Capsule())
            .overlay(Capsule().stroke(isOn ? JC.laiton.opacity(0.5) : .clear, lineWidth: 1))
            .foregroundStyle(isOn ? JC.laiton : .primary)
        }
        .buttonStyle(.plain)
    }
}
