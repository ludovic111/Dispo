import SwiftUI

struct MyProfileView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showEdit = false
    @State private var showResetConfirmation = false

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        heroCard
                        appearanceCard
                        availabilityCard
                        premiumCard
                        videoCard
                        editButton
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
            VStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    AvatarView(name: store.profile.name, size: 86)
                        .padding(4)
                        .background(.white.opacity(0.25), in: Circle())
                    if store.isPremium {
                        Image(systemName: "crown.fill")
                            .font(.caption)
                            .padding(6)
                            .background(JC.premium, in: Circle())
                            .foregroundStyle(.black)
                    }
                }
                VStack(spacing: 3) {
                    HStack(spacing: 8) {
                        Text(store.profile.name)
                            .font(.title2.weight(.heavy))
                        if store.isPremium { PremiumBadge() }
                    }
                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .opacity(0.9)
                }

                HStack(spacing: 0) {
                    profileStat(value: "12", label: "concerts")
                    divider
                    profileStat(value: "142", label: "notes")
                    divider
                    profileStat(value: "87", label: "abonnés")
                }
                .padding(.vertical, 10)
                .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 18))
            }
            .foregroundStyle(.white)
            .padding(18)
        }
    }

    private var subtitle: String {
        let instruments = store.profile.instruments.map(\.rawValue).joined(separator: " · ")
        let genres = store.profile.genres.map(\.rawValue).joined(separator: ", ")
        return "\(instruments) · \(genres) · Genève"
    }

    private var divider: some View {
        Rectangle().fill(.white.opacity(0.25)).frame(width: 1, height: 26)
    }

    private func profileStat(value: String, label: String) -> some View {
        VStack(spacing: 1) {
            Text(value).font(.headline.weight(.heavy))
            Text(label).font(.caption2).opacity(0.85)
        }
        .frame(maxWidth: .infinity)
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

    private var availabilityCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("🚨 Ma dispo dépannage")
                    .font(.subheadline.weight(.heavy))
                Text("Quand peux-tu remplacer un musicien pour un concert ?")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                VStack(spacing: 6) {
                    ForEach(Availability.allCases) { option in
                        availabilityRow(option)
                    }
                }
            }
        }
    }

    private func availabilityRow(_ option: Availability) -> some View {
        let isSelected = store.profile.availability == option
        return Button {
            store.profile.availability = option
            store.saveProfile()
        } label: {
            HStack(spacing: 10) {
                Text(option.emoji)
                VStack(alignment: .leading, spacing: 1) {
                    Text(option.rawValue)
                        .font(.subheadline.weight(isSelected ? .bold : .regular))
                        .foregroundStyle(.primary)
                    Text(option.explanation)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? option.color : .secondary.opacity(0.4))
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(
                isSelected ? option.color.opacity(0.13) : .clear,
                in: RoundedRectangle(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? option.color.opacity(0.5) : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var premiumCard: some View {
        Button {
            store.showPaywall = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "crown.fill")
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.isPremium ? "Premium actif ✨" : "Ne rate plus un cachet")
                        .font(.subheadline.weight(.heavy))
                    Text(store.isPremium
                         ? "Alertes dépannage prioritaires · gérer mon abonnement"
                         : "Alertes dépannage en priorité + profil en tête · dès CHF 3.25/mois")
                        .font(.caption)
                        .opacity(0.8)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(.black)
            .padding(16)
            .background(JC.premium, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(PressableStyle())
    }

    private var videoCard: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 22)
                .fill(
                    LinearGradient(colors: [JC.violet.opacity(0.5), JC.magenta.opacity(0.4)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .frame(height: 120)
            VStack(spacing: 6) {
                Image(systemName: "video.badge.plus")
                    .font(.system(size: 30))
                Text("Filme ta vidéo de présentation (60–90 sec)")
                    .font(.caption.weight(.bold))
                Text("Disponible en phase 2 — upload et streaming")
                    .font(.caption2)
                    .opacity(0.6)
            }
            .foregroundStyle(.white)
        }
    }

    private var editButton: some View {
        Button {
            showEdit = true
        } label: {
            Label("Modifier mon profil", systemImage: "pencil")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(JC.cardStroke, lineWidth: 1))
                .foregroundStyle(.primary)
        }
        .buttonStyle(PressableStyle())
    }

    private var resetButton: some View {
        VStack(spacing: 6) {
            Button("Réinitialiser la démo", role: .destructive) {
                showResetConfirmation = true
            }
            .font(.caption)
            Text("JamConnect v0.1 — démo sans backend, données fictives.")
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
