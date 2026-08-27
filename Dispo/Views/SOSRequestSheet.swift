import SwiftUI

/// Demande de dépannage adressée à un musicien précis — un vrai SOS, visible
/// de lui seul, qu'il accepte ou refuse d'un tap. Rien ne part dans la
/// messagerie : la réponse revient dans « SOS → J'organise ».
struct SOSRequestSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let musician: Musician

    @State private var instrument: Instrument?
    @State private var date: Date = SOSRequestSheet.defaultDate
    /// Repère public volontairement vague.
    @State private var place: String = ""
    /// Rendez-vous révélé seulement si le musicien accepte.
    @State private var exactAddress: String = ""
    @State private var postalCode: String = ""
    @State private var city: String = ""
    @State private var country: Country = .switzerland
    @State private var feeText: String = ""
    @State private var paymentMethod: PaymentMethod?
    @State private var customPayment = ""
    @State private var useCustomPayment = false
    @State private var note: String = ""
    @State private var isSending = false

    /// Demain 20 h — l'heure type d'un concert à dépanner.
    private static var defaultDate: Date {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        return Calendar.current.date(bySettingHour: 20, minute: 0, second: 0, of: tomorrow) ?? tomorrow
    }

    /// Prochaines dates où le musicien s'est déclaré dispo.
    private var availableDates: [Date] {
        let today = Calendar.current.startOfDay(for: Date())
        return musician.availableDates
            .filter { Calendar.current.startOfDay(for: $0) >= today }
            .sorted()
    }

    private var isValid: Bool {
        instrument != nil
            && PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete
    }

    private var privateAddressValue: String? {
        let value = exactAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Instrument recherché") {
                    Picker("Instrument", selection: $instrument) {
                        ForEach(musician.instruments) { item in
                            Text(LocalizedStringKey(item.rawValue)).tag(Instrument?.some(item))
                        }
                    }
                }

                Section {
                    DatePicker("Date du concert", selection: $date, in: Date()...)
                    if !availableDates.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(availableDates.prefix(6), id: \.self) { dispo in
                                    Button {
                                        // Reprend le jour dispo en gardant l'heure choisie.
                                        let time = Calendar.current.dateComponents([.hour, .minute], from: date)
                                        date = Calendar.current.date(
                                            bySettingHour: time.hour ?? 20,
                                            minute: time.minute ?? 0,
                                            second: 0,
                                            of: dispo
                                        ) ?? dispo
                                    } label: {
                                        Text(dispo.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                                            .font(.caption.weight(.semibold))
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(
                                                Calendar.current.isDate(dispo, inSameDayAs: date)
                                                    ? JC.signal.opacity(0.2) : JC.inset,
                                                in: Capsule()
                                            )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Date")
                } footer: {
                    if !availableDates.isEmpty {
                        Text("Pastilles : les jours où \(musician.name) s'est déclaré·e dispo.")
                    }
                }

                Section {
                    TextField("Quartier ou repère public (optionnel)", text: $place)
                    CountryPostalField(
                        country: $country,
                        postalCode: $postalCode,
                        city: $city,
                        detectedCountry: store.detectedCountry
                    )
                } header: {
                    Text("Zone visible avant la réponse")
                } footer: {
                    Text("Le musicien voit la zone générale pour décider, jamais l'adresse précise.")
                }

                Section {
                    TextField("Rue, numéro, entrée, étage…", text: $exactAddress, axis: .vertical)
                        .lineLimit(1...3)
                    Label("Révélée seulement si la demande est acceptée.", systemImage: "lock.shield.fill")
                        .font(.caption)
                        .foregroundStyle(JC.feutrine)
                } header: {
                    Text("Rendez-vous privé")
                } footer: {
                    Text("Tu peux laisser vide si le lieu n'est pas encore fixé.")
                }

                // Cachet entre professionnels uniquement.
                if store.profile.level == .pro {
                    Section {
                        TextField("Montant en CHF (vide = à discuter)", text: $feeText)
                            .keyboardType(.numberPad)
                        PaymentMethodField(
                            method: $paymentMethod,
                            custom: $customPayment,
                            useCustom: $useCustomPayment
                        )
                    } header: {
                        Text("Cachet proposé")
                    }
                }

                Section {
                    TextField("Contexte, répertoire, matériel…", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                } header: {
                    Text("Message (optionnel)")
                } footer: {
                    Text("\(musician.name) reçoit la demande et répond d'un tap. Tu verras sa réponse dans SOS → J'organise.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Demande de dépannage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        send()
                    } label: {
                        if isSending {
                            ProgressView()
                        } else {
                            Text("Envoyer").bold()
                        }
                    }
                    .disabled(isSending || !isValid)
                }
            }
            .onAppear {
                if instrument == nil { instrument = musician.instruments.first }
                if postalCode.isEmpty && city.isEmpty {
                    postalCode = store.profile.postalCode ?? ""
                    city = store.profile.city ?? ""
                }
                country = store.profile.country ?? store.preferredCountry
                store.requestLocation()
            }
        }
    }

    private func send() {
        guard let instrument, !isSending else { return }
        isSending = true
        let fee = Int(feeText.trimmingCharacters(in: .whitespaces))
        store.sendDirectSOS(
            to: musician,
            instrument: instrument,
            date: date,
            place: place.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? PlaceDraft(country: country, postalCode: postalCode, city: city).label
                : place.trimmingCharacters(in: .whitespacesAndNewlines),
            exactAddress: privateAddressValue,
            neighborhood: PlaceDraft(country: country, postalCode: postalCode, city: city).label,
            fee: fee,
            paymentMethod: PaymentMethodField.storedValue(
                method: paymentMethod,
                custom: customPayment,
                useCustom: useCustomPayment
            ),
            note: note
        )
        dismiss()
    }
}
