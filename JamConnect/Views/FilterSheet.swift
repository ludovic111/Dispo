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
                        ForEach(Instrument.allCases) { instrument in
                            Text(instrument.rawValue).tag(Instrument?.some(instrument))
                        }
                    }
                }

                Section("Genre") {
                    Picker("Genre", selection: $filters.genre) {
                        Text("Tous").tag(Genre?.none)
                        ForEach(Genre.allCases) { genre in
                            Text("\(genre.emoji) \(genre.rawValue)").tag(Genre?.some(genre))
                        }
                    }
                }

                Section {
                    Picker("J'ai besoin d'un musicien", selection: $filters.availability) {
                        Text("Peu importe quand").tag(Availability?.none)
                        Text("🚨 Ce soir").tag(Availability?.some(.tonight))
                        Text("📅 Cette semaine").tag(Availability?.some(.thisWeek))
                        Text("🗓️ Ce week-end").tag(Availability?.some(.weekend))
                        Text("🤙 Avec préavis").tag(Availability?.some(.onRequest))
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
                    if store.isPremium {
                        Picker("Niveau minimum", selection: $filters.minLevel) {
                            Text("Tous").tag(Level?.none)
                            ForEach(Level.allCases) { level in
                                Text(level.rawValue).tag(Level?.some(level))
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
                        Text("Le filtre par niveau fait partie de JamConnect Premium (dès CHF 3.25/mois).")
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
