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
                    Picker("J'ai besoin d'un musicien", selection: $filters.availability) {
                        Text("Peu importe quand").tag(Availability?.none)
                        Label("Ce soir", systemImage: Availability.tonight.symbol).tag(Availability?.some(.tonight))
                        Label("Cette semaine", systemImage: Availability.thisWeek.symbol).tag(Availability?.some(.thisWeek))
                        Label("Ce week-end", systemImage: Availability.weekend.symbol).tag(Availability?.some(.weekend))
                        Label("Avec préavis", systemImage: Availability.onRequest.symbol).tag(Availability?.some(.onRequest))
                    }
                } header: {
                    Text("Disponibilité")
                } footer: {
                    Text("« Cette semaine » inclut les musiciens dispo ce soir et le week-end.")
                }

                Section("Rayon de recherche") {
                    Picker("Rayon", selection: $filters.radiusKm) {
                        Text("5 km").tag(5.0)
                        Text("10 km").tag(10.0)
                        Text("25 km").tag(25.0)
                    }
                    .pickerStyle(.segmented)
                }

                // Filtre avancé — réservé Premium
                Section {
                    if store.showsPremium {
                        Picker("Niveau minimum", selection: $filters.minLevel) {
                            Text("Tous").tag(Level?.none)
                            ForEach(Level.allCases) { level in
                                Text(LocalizedStringKey(level.rawValue)).tag(Level?.some(level))
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
                    if !store.showsPremium {
                        Text("Le filtre par niveau fait partie de Dispo Premium (dès CHF 6.60/mois).")
                    }
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
