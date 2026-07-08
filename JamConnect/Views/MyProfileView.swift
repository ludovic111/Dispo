import SwiftUI

struct MyProfileView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showEdit = false
    @State private var showResetConfirmation = false
    @State private var showAccount = false

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        heroCard
                        if store.isAdmin { adminCard }
                        availabilityCard
                        viewersCard
                        if !store.showsPremium { premiumCard }
                        if store.backend != nil { accountCard }
                        appearanceCard
                        resetButton
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showEdit) {
                EditProfileSheet()
            }
            .sheet(isPresented: $showAccount) {
                AccountSheet()
            }
            .confirmationDialog(
                "Réinitialiser toutes les données de la démo ?",
                isPresented: $showResetConfirmation,
                titleVisibility: .visible
            ) {
                Button("Réinitialiser", role: .destructive) { store.resetDemo() }
            }
        }
    }

    private var heroCard: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(JC.hero)
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)

            VStack(spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    AvatarView(name: store.profile.name, size: 84)
                        .padding(4)
                        .background(.white.opacity(0.2), in: Circle())
                    if store.showsPremium {
                        Image(systemName: "crown.fill")
                            .font(.caption2.weight(.bold))
                            .padding(6)
                            .background(JC.premium, in: Circle())
                            .foregroundStyle(.black)
                            .offset(x: 4, y: 4)
                    }
                }
                VStack(spacing: 4) {
                    HStack(spacing: 8) {
                        Text(store.profile.name)
                            .font(.title2.weight(.bold))
                        if store.showsPremium { PremiumBadge() }
                    }
                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .opacity(0.88)
                        .multilineTextAlignment(.center)
                }
            }
            .foregroundStyle(.white)
            .padding(20)
        }
        .overlay(alignment: .topTrailing) {
            Button {
                showEdit = true
            } label: {
                Image(systemName: "pencil")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.white.opacity(0.18), in: Circle())
            }
            .buttonStyle(PressableStyle(scale: 0.92))
            .padding(10)
        }
    }

    private var subtitle: String {
        let instruments = store.profile.instruments.map(\.rawValue).joined(separator: " · ")
        let genres = store.profile.genres.map(\.rawValue).joined(separator: ", ")
        return "\(instruments) · \(genres) · Genève"
    }

    private var appearanceCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Apparence", systemImage: "circle.lefthalf.filled")
                    .font(.subheadline.weight(.heavy))
                HStack(spacing: 8) {
                    ForEach(AppTheme.allCases) { option in
                        themeChip(option)
                    }
                }
            }
        }
    }

    private func themeChip(_ option: AppTheme) -> some View {
        let isSelected = store.theme == option
        return Button {
            withAnimation(.snappy) { store.setTheme(option) }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: option.symbol)
                    .font(.title3)
                    .foregroundStyle(isSelected ? JC.violet : Color.secondary)
                Text(option.label)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(isSelected ? Color.primary : Color.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                isSelected ? JC.violet.opacity(0.14) : JC.inset,
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isSelected ? JC.violet.opacity(0.5) : JC.cardStroke, lineWidth: 1)
            )
        }
        .buttonStyle(PressableStyle())
    }

    /// Sélection des dates de dispo dans un vrai calendrier. Le statut
    /// affiché aux autres (🚨 Ce soir, 📅 Cette semaine…) en est dérivé.
    private var dateSelection: Binding<Set<DateComponents>> {
        Binding(
            get: {
                Set(store.profile.availableDates.map {
                    Calendar.current.dateComponents([.calendar, .era, .year, .month, .day], from: $0)
                })
            },
            set: { components in
                store.profile.availableDates = components
                    .compactMap { Calendar.current.date(from: $0) }
                    .sorted()
                store.saveProfile()
            }
        )
    }

    private var availabilityCard: some View {
        let derived = store.profile.availability
        return JCCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Mes dates de dispo", systemImage: "bolt.fill")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(JC.coral)
                    Spacer()
                    AvailabilityBadge(availability: derived)
                }
                Text("Coche les jours où tu peux dépanner un concert.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                MultiDatePicker(
                    "Mes dates de dispo",
                    selection: dateSelection,
                    in: Calendar.current.startOfDay(for: Date())...
                )
                .tint(JC.coral)
                .frame(maxHeight: 330)

                if derived == .unavailable {
                    Label("Aucune date cochée — tu apparais comme indisponible.", systemImage: "moon.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Label("Les autres te voient : \(derived.emoji) \(derived.badgeLabel)", systemImage: "eye")
                        .font(.caption2)
                        .foregroundStyle(derived.color)
                }
            }
        }
    }

    /// Lentille admin : prévisualiser l'app comme un utilisateur gratuit ou
    /// premium. N'affecte que l'affichage — le compte et les droits serveur
    /// ne changent pas.
    private var adminCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Label("Mode admin", systemImage: "eye.fill")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(JC.violet)
                    Spacer()
                    if store.adminLens != .reel {
                        TagView(text: "Aperçu \(store.adminLens.rawValue)", color: JC.violet)
                    }
                }
                Text("Voir l'app comme…")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Picker("Lentille", selection: $store.adminLens) {
                    ForEach(AppStore.AdminLens.allCases) { lens in
                        Text(lens.rawValue).tag(lens)
                    }
                }
                .pickerStyle(.segmented)
                if store.adminLens != .reel {
                    Text("Aperçu visuel seulement : tes droits réels (Premium, annonces débloquées côté serveur) restent inchangés.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    /// Compte réseau (mode live) — connexion au backend Supabase.
    private var accountCard: some View {
        Button { showAccount = true } label: {
            JCCard {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill((store.isLive ? Color.green : JC.violet).opacity(0.14))
                            .frame(width: 40, height: 40)
                        Image(systemName: store.isLive ? "checkmark.icloud.fill" : "icloud")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(store.isLive ? .green : JC.violet)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.isLive ? "Mode live" : "Rejoindre le réseau")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                        Text(store.isLive
                             ? (store.liveEmail ?? "Connecté au serveur")
                             : "Profil visible + annonces et messages en temps réel")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .buttonStyle(PressableStyle())
    }

    /// « Qui a vu ton profil » — teaser Premium : avatars floutés pour les
    /// non-abonnés, noms révélés pour les membres Premium.
    private var viewersCard: some View {
        let viewers = store.profileViewers
        return Button {
            if !store.showsPremium { store.showPaywall = true }
        } label: {
            JCCard {
                HStack(spacing: 14) {
                    HStack(spacing: -14) {
                        ForEach(viewers.prefix(3)) { viewer in
                            AvatarView(name: viewer.name, size: 40, photo: viewer.photo)
                                .overlay(Circle().stroke(JC.card, lineWidth: 2))
                                .blur(radius: store.showsPremium ? 0 : 4)
                                .clipShape(Circle())
                        }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(viewers.count + 7) pros ont vu ton profil cette semaine")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                        Text(store.showsPremium
                             ? "Dont \(viewers.prefix(2).map { $0.name.split(separator: " ").first.map(String.init) ?? $0.name }.joined(separator: ", ")) — contacte-les !"
                             : "Découvre qui avec Premium")
                            .font(.caption)
                            .foregroundStyle(store.showsPremium ? .secondary : JC.gold)
                    }
                    Spacer(minLength: 0)
                    if !store.showsPremium {
                        Image(systemName: "lock.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(JC.gold)
                    }
                }
            }
        }
        .buttonStyle(PressableStyle())
    }

    private var premiumCard: some View {
        JCPromoBanner(
            icon: "crown.fill",
            title: store.showsPremium ? "Premium actif" : "Ne rate plus un cachet",
            subtitle: store.showsPremium
                ? "Alertes dépannage prioritaires · gérer mon abonnement"
                : "Alertes dépannage en priorité + profil en tête · dès CHF 4.90/mois"
        ) { store.showPaywall = true }
    }

    private var resetButton: some View {
        VStack(spacing: 6) {
            Button("Réinitialiser la démo", role: .destructive) {
                showResetConfirmation = true
            }
            .font(.caption)
            Text("Dispo v0.3 — données de démo réinitialisables.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.top, 6)
    }
}

// MARK: - Édition du profil

struct EditProfileSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Nom") {
                    TextField("Ton nom", text: Binding(
                        get: { store.profile.name },
                        set: { store.profile.name = $0; store.saveProfile() }
                    ))
                }

                Section("Mes instruments") {
                    ForEach(Instrument.allCases) { instrument in
                        toggleRow(
                            label: instrument.rawValue,
                            isOn: store.profile.instruments.contains(instrument)
                        ) {
                            if let index = store.profile.instruments.firstIndex(of: instrument) {
                                store.profile.instruments.remove(at: index)
                            } else {
                                store.profile.instruments.append(instrument)
                            }
                            store.saveProfile()
                        }
                    }
                }

                Section("Mes genres") {
                    ForEach(Genre.allCases) { genre in
                        toggleRow(
                            label: "\(genre.emoji) \(genre.rawValue)",
                            isOn: store.profile.genres.contains(genre)
                        ) {
                            if let index = store.profile.genres.firstIndex(of: genre) {
                                store.profile.genres.remove(at: index)
                            } else {
                                store.profile.genres.append(genre)
                            }
                            store.saveProfile()
                        }
                    }
                }

                Section("Mon niveau") {
                    Picker("Niveau", selection: Binding(
                        get: { store.profile.level },
                        set: { store.profile.level = $0; store.saveProfile() }
                    )) {
                        ForEach(Level.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Bio") {
                    TextField("Parle de toi…", text: Binding(
                        get: { store.profile.bio },
                        set: { store.profile.bio = $0; store.saveProfile() }
                    ), axis: .vertical)
                    .lineLimit(2...5)
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Modifier mon profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                        .font(.headline)
                }
            }
        }
    }

    private func toggleRow(label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label).foregroundStyle(.primary)
                Spacer()
                if isOn {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(JC.coral)
                }
            }
        }
    }
}
