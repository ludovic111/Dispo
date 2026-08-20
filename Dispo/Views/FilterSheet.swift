import SwiftUI

struct FilterSheet: View {
    @EnvironmentObject private var store: AppStore
    @Binding var filters: DiscoveryFilters
    @Environment(\.dismiss) private var dismiss
    @State private var expandedInstrumentCategories: Set<InstrumentCategory> = []
    @State private var expandedGenreFamilies: Set<GenreFamily> = []

    var body: some View {
        NavigationStack {
            Form {
                instrumentsSection
                genresSection
                availabilitySection
                locationSection
                radiusSection
                levelsSection
                relationsSection

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
                    Button("Voir les résultats") { dismiss() }
                        .font(.headline)
                }
            }
            .onAppear { store.requestLocation() }
        }
    }

    private var instrumentsSection: some View {
        Section {
            if !filters.instruments.isEmpty {
                Button("Effacer les instruments") { filters.instruments.removeAll() }
                    .font(.caption.weight(.bold))
            }
            ForEach(InstrumentCategory.allCases) { category in
                DisclosureGroup(isExpanded: Binding(
                    get: { expandedInstrumentCategories.contains(category) },
                    set: { expanded in
                        if expanded {
                            expandedInstrumentCategories.insert(category)
                        } else {
                            expandedInstrumentCategories.remove(category)
                        }
                    }
                )) {
                    FlowLayout(spacing: 8) {
                        ForEach(Instrument.instruments(in: category)) { instrument in
                            ChoiceChip(
                                label: LocalizedStringKey(instrument.rawValue),
                                isSelected: filters.instruments.contains(instrument)
                            ) { toggle(instrument, in: &filters.instruments) }
                        }
                    }
                    .padding(.vertical, 6)
                } label: {
                    Label(LocalizedStringKey(category.rawValue), systemImage: category.symbol)
                        .foregroundStyle(.primary)
                }
            }
        } header: {
            selectionHeader("Instruments", count: filters.instruments.count)
        } footer: {
            Text("Choisis-en plusieurs : un musicien qui joue au moins l'un d'eux reste affiché.")
        }
    }

    private var genresSection: some View {
        Section {
            if !filters.genres.isEmpty {
                Button("Effacer les styles") { filters.genres.removeAll() }
                    .font(.caption.weight(.bold))
            }
            ForEach(GenreFamily.allCases) { family in
                DisclosureGroup(isExpanded: Binding(
                    get: { expandedGenreFamilies.contains(family) },
                    set: { expanded in
                        if expanded {
                            expandedGenreFamilies.insert(family)
                        } else {
                            expandedGenreFamilies.remove(family)
                        }
                    }
                )) {
                    FlowLayout(spacing: 8) {
                        ForEach(Genre.genres(in: family)) { genre in
                            ChoiceChip(
                                label: LocalizedStringKey(genre.rawValue),
                                isSelected: filters.genres.contains(genre)
                            ) { toggle(genre, in: &filters.genres) }
                        }
                    }
                    .padding(.vertical, 6)
                } label: {
                    Text(family.emoji + " ") + Text(LocalizedStringKey(family.rawValue))
                }
            }
        } header: {
            selectionHeader("Styles", count: filters.genres.count)
        }
    }

    private var availabilitySection: some View {
        Section {
            Toggle("Dispo à une date précise", isOn: Binding(
                get: { filters.neededDate != nil },
                set: { on in
                    filters.neededDate = on ? Calendar.current.startOfDay(for: Date()) : nil
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
                .tint(JC.primaryAccent)
            }
        } header: {
            Text("Disponibilité")
        } footer: {
            Text("Seuls les musiciens qui ont coché ce jour restent affichés.")
        }
    }

    private var locationSection: some View {
        Section {
            CountryPostalField(
                country: Binding(
                    get: { filters.placeCountry ?? store.preferredCountry },
                    set: { filters.placeCountry = $0 }
                ),
                postalCode: $filters.placePostalCode,
                city: $filters.place,
                detectedCountry: store.detectedCountry
            )
            if !filters.placePostalCode.isEmpty || !filters.place.isEmpty {
                Button("Chercher partout") {
                    filters.placePostalCode = ""
                    filters.place = ""
                }
                .font(.caption.weight(.bold))
            }
        } header: {
            Text("Où")
        } footer: {
            Text("Entre le code postal. Avec une date, Dispo cherche aussi les musiciens qui seront en séjour sur place.")
        }
    }

    private var radiusSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Rayon")
                    Spacer()
                    Text(verbatim: "\(Int(filters.radiusKm)) km")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(JC.primaryAccent)
                }
                Slider(value: $filters.radiusKm, in: 5...100, step: 5)
                    .tint(JC.primaryAccent)
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
            Text("Les profils sans position connue restent visibles.")
        }
    }

    private var levelsSection: some View {
        Section {
            if store.isPremium {
                FlowLayout(spacing: 8) {
                    ChoiceChip(label: "Tous", isSelected: filters.levels.isEmpty) {
                        filters.levels.removeAll()
                    }
                    ForEach(Level.allCases) { level in
                        ChoiceChip(
                            label: LocalizedStringKey(level.label),
                            isSelected: filters.levels.contains(level)
                        ) { toggle(level, in: &filters.levels) }
                    }
                }
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
            selectionHeader("Niveaux", count: filters.levels.count)
        } footer: {
            if store.isPremium {
                Text("Plusieurs niveaux sont possibles : l'un d'eux suffit.")
            } else {
                Text("Le filtre par niveau fait partie de Dispo Premium.")
            }
        }
    }

    private var relationsSection: some View {
        Section {
            Toggle("Amis uniquement", isOn: $filters.friendsOnly)
            Toggle("A joué avec un ami", isOn: $filters.playedWithAFriend)
            Toggle("Bien notés", isOn: $filters.wellRated)
        } header: {
            Text("Relations")
        }
    }

    private func toggle<Value: Hashable>(_ value: Value, in selection: inout Set<Value>) {
        if selection.contains(value) {
            selection.remove(value)
        } else {
            selection.insert(value)
        }
    }

    private func selectionHeader(_ title: LocalizedStringKey, count: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            if count == 0 {
                Text("Tous")
                    .foregroundStyle(.secondary)
            } else {
                Text(verbatim: "\(count)")
                    .foregroundStyle(JC.primaryAccent)
            }
        }
    }
}
