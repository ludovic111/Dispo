import SwiftUI

struct FilterSheet: View {
    @EnvironmentObject private var store: AppStore
    @Binding var filters: DiscoveryFilters
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Instrument") {
                    Picker("Instrument", selection: $filters.instrument) {
                        Text("Tous").tag(Instrument?.none)
                        ForEach(InstrumentCategory.allCases) { category in
                            Section {
                                ForEach(Instrument.instruments(in: category)) { instrument in
                                    Text(LocalizedStringKey(instrument.rawValue)).tag(Instrument?.some(instrument))
                                }
                            } header: {
                                Text(LocalizedStringKey(category.rawValue))
                            }
                        }
                    }
                }

                Section("Genre") {
                    Picker("Genre", selection: $filters.genre) {
                        Text("Tous").tag(Genre?.none)
                        ForEach(GenreFamily.allCases) { family in
                            Section {
                                ForEach(Genre.genres(in: family)) { genre in
                                    Text(LocalizedStringKey(genre.rawValue)).tag(Genre?.some(genre))
                                }
                            } header: {
                                Text(family.emoji + " ") + Text(LocalizedStringKey(family.rawValue))
                            }
                        }
                    }
                }

                Section {
                    Toggle("Dispo à une date précise", isOn: Binding(
                        get: { filters.neededDate != nil },
                        set: { on in
                            filters.neededDate = on
                                ? Calendar.current.startOfDay(for: Date())
                                : nil
                        }
                    ))
                    if filters.neededDate != nil {
                        DatePicker(
                            "Date recherchée",
                            selection: Binding(
                                get: { filters.neededDate ?? Date() },
                                set: { filters.neededDate = $0 }
                            ),
                            in: Calendar.current.startOfDay(for: Date())...,
                            displayedComponents: .date
                        )
                        .datePickerStyle(.graphical)
                        .tint(JC.laiton)
                    }
                } header: {
                    Text("Disponibilité")
                } footer: {
                    Text("Choisis le jour où tu as besoin d'un musicien — seuls ceux qui l'ont coché dans leur calendrier restent affichés.")
                }

                Section {
                    TextField("Ville ou pays — ex. Lisbonne", text: $filters.place)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                } header: {
                    Text("Où")
                } footer: {
                    Text("Un musicien en tournée ou en vacances déclare où il se trouve : avec une date, on cherche ceux qui seront sur place ce jour-là.")
                }

                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Rayon")
                            Spacer()
                            Text(verbatim: "\(Int(filters.radiusKm)) km")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(JC.laiton)
                        }
                        Slider(value: $filters.radiusKm, in: 5...100, step: 5)
                            .tint(JC.laiton)
                        HStack {
                            Text(verbatim: "5 km")
                            Spacer()
                            Text(verbatim: "100 km")
                        }
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    }
                } header: {
                    Text("Rayon de recherche")
                } footer: {
                    Text("Le rayon s'applique aux musiciens dont la position est connue — les autres restent affichés.")
                }

                // Filtre avancé — réservé Premium
                Section {
                    if store.isPremium {
                        Picker("Niveau minimum", selection: $filters.minLevel) {
                            Text("Tous").tag(Level?.none)
                            ForEach(Level.allCases) { level in
                                Text(LocalizedStringKey(level.label)).tag(Level?.some(level))
                            }
                        }
                        .pickerStyle(.segmented)
                    } else {
                        Button {
                            dismiss()
                            store.showPaywall = true
                        } label: {
                            HStack {
                                Label("Filtrer par niveau", systemImage: "lock.fill")
                                    .foregroundStyle(.primary)
                                Spacer()
                                PremiumBadge()
                            }
                        }
                    }
                } header: {
                    Text("Niveau minimum")
                } footer: {
                    if !store.isPremium {
                        Text("Le filtre par niveau fait partie de Dispo Premium.")
                    }
                }

                Section {
                    Toggle("Amis uniquement", isOn: $filters.friendsOnly)
                    Toggle("A joué avec un ami", isOn: $filters.playedWithAFriend)
                    Toggle("Bien notés", isOn: $filters.wellRated)
                } header: {
                    Text("Relations")
                }

                Section {
                    Button("Réinitialiser les filtres", role: .destructive) {
                        filters = DiscoveryFilters()
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Filtres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                        .font(.headline)
                }
            }
        }
    }
}
