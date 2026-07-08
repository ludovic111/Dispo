import SwiftUI
import PhotosUI
import AVKit

/// Vidéo prête à être lue (wrapper Identifiable pour sheet(item:)).
struct PlayableVideo: Identifiable {
    let url: URL
    var id: URL { url }
}

extension UIImage {
    /// Redimensionne et compresse en JPEG (photo de profil).
    func resizedJPEG(maxSide: CGFloat, quality: CGFloat = 0.85) -> Data? {
        let scale = min(1, maxSide / max(size.width, size.height))
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}

/// Vidéo importée depuis la photothèque (copie temporaire sur disque).
struct PickedVideo: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            let copy = URL.temporaryDirectory.appendingPathComponent("import_\(UUID().uuidString).mov")
            try? FileManager.default.removeItem(at: copy)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return Self(url: copy)
        }
    }
}

/// Avatar de l'utilisateur : sa photo choisie si elle existe, sinon la
/// pastille dégradée avec initiales.
struct MyAvatarView: View {
    let profile: MyProfile
    var size: CGFloat = 84

    var body: some View {
        if let fileName = profile.photoFileName,
           let image = UIImage(contentsOfFile: AppStore.mediaURL(for: fileName).path) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
        } else {
            AvatarView(name: profile.name, size: size)
        }
    }
}

struct MyProfileView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showEdit = false
    @State private var showResetConfirmation = false
    @State private var showAccount = false
    @State private var photoItem: PhotosPickerItem?
    @State private var videoItem: PhotosPickerItem?
    @State private var playingVideo: PlayableVideo?
    @State private var importingVideo = false
    @State private var showPatchNotes = false

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        heroCard
                        if store.isAdmin { adminCard }
                        availabilityCard
                        videosCard
                        viewersCard
                        if !store.showsPremium { premiumCard }
                        if store.backend != nil { accountCard }
                        notificationsCard
                        languageCard
                        appearanceCard
                        patchNotesCard
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
            .sheet(isPresented: $showPatchNotes) {
                PatchNotesView()
            }
            .sheet(item: $playingVideo) { video in
                VideoPlayer(player: AVPlayer(url: video.url))
                    .ignoresSafeArea()
                    .presentationDetents([.large])
            }
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let jpeg = UIImage(data: data)?.resizedJPEG(maxSide: 800) {
                        store.setProfilePhoto(jpeg)
                    }
                    photoItem = nil
                }
            }
            .onChange(of: videoItem) { _, item in
                guard let item else { return }
                importingVideo = true
                Task {
                    if let video = try? await item.loadTransferable(type: PickedVideo.self) {
                        store.addDemoVideo(from: video.url)
                        try? FileManager.default.removeItem(at: video.url)
                    }
                    videoItem = nil
                    importingVideo = false
                }
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
                // La photo de profil se change d'un tap sur l'avatar.
                PhotosPicker(selection: $photoItem, matching: .images) {
                    ZStack(alignment: .bottomTrailing) {
                        MyAvatarView(profile: store.profile, size: 84)
                            .padding(4)
                            .background(.white.opacity(0.2), in: Circle())
                        Image(systemName: store.showsPremium ? "crown.fill" : "camera.fill")
                            .font(.caption2.weight(.bold))
                            .padding(6)
                            .background(
                                store.showsPremium
                                    ? AnyShapeStyle(JC.premium)
                                    : AnyShapeStyle(.white.opacity(0.9)),
                                in: Circle()
                            )
                            .foregroundStyle(.black)
                            .offset(x: 4, y: 4)
                    }
                }
                .buttonStyle(PressableStyle())
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
                    HStack(spacing: 14) {
                        Text("**\(store.followersCount)** abonnés")
                        Text("**\(store.followingCount)** suivis")
                    }
                    .font(.caption)
                    .opacity(0.92)
                    .padding(.top, 2)
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
        let instruments = store.profile.instruments.map { store.tr($0.rawValue) }.joined(separator: " · ")
        let genres = store.profile.genres.map { store.tr($0.rawValue) }.joined(separator: ", ")
        return "\(instruments) · \(genres) · \(store.profile.resolvedCity)"
    }

    /// Vidéos de démo : 1 en gratuit, jusqu'à 6 en Premium. C'est la vitrine
    /// du profil — on écoute avant d'engager.
    private var videosCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Mes vidéos de démo", systemImage: "video.fill")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(JC.violet)
                    Spacer()
                    Text("\(store.profile.videos.count)/\(store.videoLimit)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
                Text("C'est ce que les organisateurs regardent avant de t'engager — 60 à 90 secondes suffisent.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                ForEach(store.profile.videos, id: \.self) { fileName in
                    HStack(spacing: 11) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(JC.violet.opacity(0.14))
                                .frame(width: 40, height: 40)
                            Image(systemName: "play.fill")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(JC.violet)
                        }
                        Text("Vidéo \((store.profile.videos.firstIndex(of: fileName) ?? 0) + 1)")
                            .font(.subheadline.weight(.semibold))
                        Spacer(minLength: 0)
                        Button {
                            store.removeDemoVideo(fileName)
                        } label: {
                            Image(systemName: "trash")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                                .padding(8)
                        }
                        .buttonStyle(PressableStyle())
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        playingVideo = PlayableVideo(url: AppStore.mediaURL(for: fileName))
                    }
                }

                if store.canAddVideo {
                    PhotosPicker(selection: $videoItem, matching: .videos) {
                        Label(
                            importingVideo ? "Import en cours…" : "Ajouter une vidéo",
                            systemImage: importingVideo ? "arrow.triangle.2.circlepath" : "plus.circle.fill"
                        )
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.violet)
                    }
                    .disabled(importingVideo)
                } else if !store.showsPremium {
                    // Limite gratuite atteinte : l'ajout passe par Premium.
                    Button { store.showPaywall = true } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "crown.fill")
                            Text("Jusqu'à 6 vidéos avec Premium")
                                .font(.caption.weight(.bold))
                            Spacer(minLength: 0)
                            Image(systemName: "lock.fill")
                        }
                        .font(.caption.weight(.bold))
                        .padding(11)
                        .background(JC.gold.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.gold)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }

    /// Notifications locales : nouveaux SOS compatibles et messages reçus.
    /// Les alertes serveur (push APNs) arrivent avec TestFlight en phase 2b.
    private var notificationsCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                Toggle(isOn: Binding(
                    get: { store.notificationsEnabled },
                    set: { enabled in Task { await store.setNotifications(enabled) } }
                )) {
                    Label("Notifications", systemImage: "bell.badge.fill")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(JC.coral)
                }
                .tint(JC.coral)
                Text("Nouveaux SOS compatibles avec tes instruments et messages reçus.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if store.notificationsEnabled {
                    Button {
                        store.sendTestNotification()
                    } label: {
                        Label("Envoyer une notification de test", systemImage: "paperplane.fill")
                            .font(.caption.weight(.bold))
                    }
                    .buttonStyle(PressableStyle())
                } else {
                    Text("Si l'interrupteur retombe, autorise Dispo dans Réglages > Notifications.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    /// Historique des mises à jour (bêta) — le numéro de version est cliquable.
    private var patchNotesCard: some View {
        Button { showPatchNotes = true } label: {
            JCCard {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(JC.violet.opacity(0.14))
                            .frame(width: 40, height: 40)
                        Image(systemName: "sparkles")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(JC.violet)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text("Nouveautés")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(.primary)
                            TagView(text: "BÊTA", color: JC.coral)
                        }
                        Text(verbatim: "v\(Bundle.main.appVersion)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
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

    /// Langue de l'app + pays et ville — modifiables à tout moment.
    private var languageCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Langue & région", systemImage: "globe")
                    .font(.subheadline.weight(.heavy))

                HStack {
                    Text("Langue")
                        .font(.subheadline)
                    Spacer()
                    Menu {
                        ForEach(AppLanguage.allCases) { lang in
                            Button {
                                store.setLanguage(lang)
                            } label: {
                                if store.language == lang {
                                    Label("\(lang.flag) \(lang.nativeName)", systemImage: "checkmark")
                                } else {
                                    Text("\(lang.flag) \(lang.nativeName)")
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text("\(store.language.flag) \(store.language.nativeName)")
                                .font(.subheadline.weight(.semibold))
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(JC.violet)
                    }
                }

                Divider()

                HStack {
                    Text("Pays")
                        .font(.subheadline)
                    Spacer()
                    Picker("Pays", selection: Binding(
                        get: { store.profile.resolvedCountry },
                        set: { newCountry in
                            store.profile.country = newCountry
                            // La ville doit appartenir au pays choisi.
                            if !newCountry.cities.contains(store.profile.resolvedCity) {
                                store.profile.city = newCountry.cities[0]
                            }
                            store.saveProfile()
                        }
                    )) {
                        ForEach(Country.allCases) { country in
                            Text("\(country.flag) \(store.tr(country.nameKey))").tag(country)
                        }
                    }
                    .tint(JC.violet)
                }

                HStack {
                    Text("Ville / région")
                        .font(.subheadline)
                    Spacer()
                    Picker("Ville / région", selection: Binding(
                        get: { store.profile.resolvedCity },
                        set: { store.profile.city = $0; store.saveProfile() }
                    )) {
                        ForEach(store.profile.resolvedCountry.cities, id: \.self) { Text($0) }
                    }
                    .tint(JC.violet)
                }
            }
        }
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
                Text(LocalizedStringKey(option.label))
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
                    Label("Les autres te voient : \(derived.emoji) \(store.tr(derived.badgeLabel))", systemImage: "eye")
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
                Divider()
                // Retester le parcours d'accueil sans toucher aux données.
                Button {
                    store.replayOnboarding()
                } label: {
                    Label("Revoir l'onboarding", systemImage: "arrow.counterclockwise.circle.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.violet)
                }
                .buttonStyle(PressableStyle())
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
            Text("Dispo v\(Bundle.main.appVersion) (bêta) — données de démo réinitialisables.")
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
                            label: LocalizedStringKey(instrument.rawValue),
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
                            emoji: genre.emoji,
                            label: LocalizedStringKey(genre.rawValue),
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
                        ForEach(Level.allCases) { Text(LocalizedStringKey($0.rawValue)).tag($0) }
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

    private func toggleRow(emoji: String? = nil, label: LocalizedStringKey, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                ((emoji.map { Text($0 + " ") } ?? Text("")) + Text(label)).foregroundStyle(.primary)
                Spacer()
                if isOn {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(JC.coral)
                }
            }
        }
    }
}
