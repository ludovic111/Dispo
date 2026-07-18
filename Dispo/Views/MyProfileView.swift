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
    @State private var showLanguageRegion = false
    @State private var showFavorites = false
    @State private var showNotifications = false
    /// Vidéo dont on est en train d'éditer la date.
    @State private var datingVideo: DemoVideo?

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
                        favoritesCard
                        // Vitrine démo uniquement : en live, aucun compteur de
                        // vues n'existe encore côté serveur — on n'invente rien.
                        if !store.isLive { viewersCard }
                        if !store.showsPremium { premiumCard }
                        settingsCard
                        footer
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
            .sheet(isPresented: $showLanguageRegion) {
                LanguageRegionSheet()
            }
            .sheet(isPresented: $showFavorites) {
                FavoritesSheet()
            }
            .sheet(isPresented: $showNotifications) {
                NotificationsSettingsView()
            }
            .sheet(item: $playingVideo) { video in
                VideoPlayer(player: AVPlayer(url: video.url))
                    .ignoresSafeArea()
                    .presentationDetents([.large])
            }
            .sheet(item: $datingVideo) { video in
                VideoDateSheet(video: video)
                    .presentationDetents([.medium])
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
        let profileSnapshot = store.profile
        let premiumSnapshot = store.showsPremium
        return ZStack {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(JC.hero)
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)

            VStack(spacing: 14) {
                // La photo de profil se change d'un tap sur l'avatar.
                PhotosPicker(selection: $photoItem, matching: .images) {
                    ZStack(alignment: .bottomTrailing) {
                        MyAvatarView(profile: profileSnapshot, size: 84)
                            .padding(4)
                            .background(.white.opacity(0.2), in: Circle())
                        Image(systemName: premiumSnapshot ? "crown.fill" : "camera.fill")
                            .font(.caption2.weight(.bold))
                            .padding(6)
                            .background(
                                premiumSnapshot
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
                    Text(verbatim: store.profile.handle)
                        .font(.caption.weight(.semibold))
                        .opacity(0.85)
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
                    socialChips
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

    /// Logos réseaux sociaux du hero — cliquables (vrais logos dessinés).
    private var socialChips: some View {
        SocialLogosRow(socials: store.profile.socials, size: 28)
            .padding(.top, 4)
    }

    // MARK: - Favoris

    /// Mes musiciens favoris (cœurs) — accès rapide à leurs profils.
    private var favoritesCard: some View {
        Button { showFavorites = true } label: {
            JCCard {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(JC.magenta.opacity(0.14))
                            .frame(width: 40, height: 40)
                        Image(systemName: "heart.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(JC.magenta)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mes favoris")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                        Text("\(store.favorites.count) musiciens sous le coude")
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

    // MARK: - Réglages (regroupés)

    /// Tous les réglages au même endroit : compte, notifications, langue &
    /// région, apparence, nouveautés, réinitialisation.
    private var settingsCard: some View {
        JCCard(padding: 8) {
            VStack(spacing: 0) {
                if store.backend != nil {
                    settingsRow(
                        icon: store.isLive ? "checkmark.icloud.fill" : "icloud",
                        color: store.isLive ? .green : JC.violet,
                        title: store.isLive ? Text("Mode live") : Text("Rejoindre le réseau"),
                        detail: store.isLive ? Text(verbatim: store.liveEmail ?? "") : nil
                    ) { showAccount = true }
                    Divider().padding(.leading, 52)
                }

                settingsRow(
                    icon: "bell.badge.fill",
                    color: JC.coral,
                    title: Text("Notifications"),
                    detail: Text(store.notificationStatusLabel)
                ) { showNotifications = true }
                Divider().padding(.leading, 52)

                settingsRow(
                    icon: "globe",
                    color: JC.violet,
                    title: Text("Langue & région"),
                    detail: Text(verbatim: "\(store.language.flag) \(store.profile.cityLabel)")
                ) { showLanguageRegion = true }
                Divider().padding(.leading, 52)

                // Apparence — menu direct, pas d'écran intermédiaire.
                HStack(spacing: 12) {
                    settingsIcon(store.theme.symbol, JC.gold)
                    Text("Apparence")
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 0)
                    Menu {
                        ForEach(AppTheme.allCases) { option in
                            Button {
                                withAnimation(.snappy) { store.setTheme(option) }
                            } label: {
                                if store.theme == option {
                                    Label(LocalizedStringKey(option.label), systemImage: "checkmark")
                                } else {
                                    Text(LocalizedStringKey(option.label))
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Text(LocalizedStringKey(store.theme.label))
                                .font(.subheadline.weight(.semibold))
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(JC.gold)
                    }
                }
                .padding(10)
                Divider().padding(.leading, 52)

                settingsRow(
                    icon: "sparkles",
                    color: JC.violet,
                    title: Text("Nouveautés"),
                    detail: Text(verbatim: "v\(Bundle.main.appVersion) · ") + Text("BÊTA")
                ) { showPatchNotes = true }

                // Réservé au bac à sable local : sur un compte connecté, ce
                // reset écraserait l'état réel (profil serveur compris).
                if !store.isLive {
                    Divider().padding(.leading, 52)
                    settingsRow(
                        icon: "arrow.counterclockwise",
                        color: .red,
                        title: Text("Réinitialiser la démo"),
                        detail: nil,
                        destructive: true
                    ) { showResetConfirmation = true }
                }
            }
        }
    }

    private func settingsIcon(_ symbol: String, _ color: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(color.opacity(0.14))
                .frame(width: 34, height: 34)
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
        }
    }

    private func settingsRow(
        icon: String,
        color: Color,
        title: Text,
        detail: Text?,
        destructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                settingsIcon(icon, color)
                title
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(destructive ? Color.red : Color.primary)
                Spacer(minLength: 0)
                if let detail {
                    detail
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(10)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
    }

    private var footer: some View {
        Text(store.isLive
             ? "Dispo v\(Bundle.main.appVersion) (bêta) — connecté au réseau Dispo."
             : "Dispo v\(Bundle.main.appVersion) (bêta) — données de démo réinitialisables.")
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .padding(.top, 4)
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

                ForEach(store.profile.videos) { video in
                    HStack(spacing: 11) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(JC.violet.opacity(0.14))
                                .frame(width: 40, height: 40)
                            Image(systemName: "play.fill")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(JC.violet)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Vidéo \((store.profile.videos.firstIndex(of: video) ?? 0) + 1)")
                                .font(.subheadline.weight(.semibold))
                            // Date de la vidéo — un tap pour la changer.
                            Button {
                                datingVideo = video
                            } label: {
                                if let date = video.date {
                                    Label(
                                        date.formatted(date: .abbreviated, time: .omitted),
                                        systemImage: "calendar"
                                    )
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(JC.violet)
                                } else {
                                    Label("Ajouter une date", systemImage: "calendar.badge.plus")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(PressableStyle())
                        }
                        Spacer(minLength: 0)
                        Button {
                            store.removeDemoVideo(video)
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
                        playingVideo = PlayableVideo(url: AppStore.mediaURL(for: video.fileName))
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
                : "Alertes en priorité, groupes, 6 vidéos · via l'App Store"
        ) { store.showPaywall = true }
    }

}

// MARK: - Date d'une vidéo de démo

/// Petite feuille pour dater une vidéo (date du concert / enregistrement).
struct VideoDateSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let video: DemoVideo
    @State private var date: Date = Date()

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                VStack(spacing: 14) {
                    DatePicker(
                        "Date de la vidéo",
                        selection: $date,
                        in: ...Date(),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                    .tint(JC.violet)
                    .padding(.horizontal, 12)

                    if video.date != nil {
                        Button(role: .destructive) {
                            store.setVideoDate(nil, for: video)
                            dismiss()
                        } label: {
                            Text("Retirer la date")
                                .font(.caption.weight(.bold))
                        }
                    }
                }
                .padding(.top, 6)
            }
            .navigationTitle("Date de la vidéo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        store.setVideoDate(date, for: video)
                        dismiss()
                    }
                    .font(.headline)
                }
            }
            .onAppear { date = video.date ?? Date() }
        }
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

                // Mes instruments — une section par famille.
                ForEach(InstrumentCategory.allCases) { category in
                    Section {
                        ForEach(Instrument.instruments(in: category)) { instrument in
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
                    } header: {
                        if category == InstrumentCategory.allCases.first {
                            Text("Mes instruments — ") + Text(LocalizedStringKey(category.rawValue))
                        } else {
                            Text(LocalizedStringKey(category.rawValue))
                        }
                    }
                }

                // Mes genres — une section par famille, sous-genres inclus.
                ForEach(GenreFamily.allCases) { family in
                    Section {
                        ForEach(Genre.genres(in: family)) { genre in
                            toggleRow(
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
                    } header: {
                        if family == GenreFamily.allCases.first {
                            Text("Mes genres — \(family.emoji) ") + Text(LocalizedStringKey(family.rawValue))
                        } else {
                            Text(family.emoji + " ") + Text(LocalizedStringKey(family.rawValue))
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

                Section {
                    ForEach(SocialNetwork.allCases) { network in
                        HStack(spacing: 10) {
                            Image(systemName: network.icon)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(JC.violet)
                                .frame(width: 24)
                            Text(verbatim: network.label)
                                .font(.subheadline)
                            TextField("pseudo", text: Binding(
                                get: { store.profile.socialHandle(network) ?? "" },
                                set: { newValue in
                                    store.profile.setSocialHandle(newValue, for: network)
                                    store.saveProfile()
                                }
                            ))
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Réseaux sociaux")
                } footer: {
                    Text("Ton pseudo suffit (sans @) — il devient un lien cliquable sur ton profil.")
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

// MARK: - Langue & région (réglages)

/// Réglage de la langue de l'interface + pays et ville (code postal).
struct LanguageRegionSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var showCityPicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Langue") {
                    ForEach(AppLanguage.allCases) { lang in
                        Button {
                            store.setLanguage(lang)
                        } label: {
                            HStack {
                                Text(verbatim: "\(lang.flag) \(lang.nativeName)")
                                    .foregroundStyle(.primary)
                                Spacer()
                                if store.language == lang {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(JC.coral)
                                }
                            }
                        }
                    }
                }

                Section("Ville / région") {
                    Picker("Pays", selection: Binding(
                        get: { store.profile.resolvedCountry },
                        set: { newCountry in
                            store.profile.country = newCountry
                            if !newCountry.cities.contains(where: { $0.name == store.profile.resolvedCity }) {
                                store.profile.city = newCountry.cities[0].name
                                store.profile.postalCode = newCountry.cities[0].postalCode
                            }
                            store.saveProfile()
                        }
                    )) {
                        ForEach(Country.allCases) { country in
                            Text(verbatim: "\(country.flag) \(store.tr(country.nameKey))").tag(country)
                        }
                    }
                    Button {
                        showCityPicker = true
                    } label: {
                        HStack {
                            Text("Ville / région")
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(store.profile.cityLabel)
                                .foregroundStyle(JC.violet)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Langue & région")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
            .sheet(isPresented: $showCityPicker) {
                CityPickerSheet(
                    country: store.profile.resolvedCountry,
                    selected: store.profile.resolvedCountry.cities.first {
                        $0.name == store.profile.resolvedCity
                    }
                ) { city in
                    store.profile.city = city.name
                    store.profile.postalCode = city.postalCode
                    store.saveProfile()
                }
            }
        }
    }
}

// MARK: - Mes favoris

/// Liste des musiciens mis en favori (cœur) — accès direct aux profils.
struct FavoritesSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    private var favoriteMusicians: [Musician] {
        store.musicians
            .filter { store.favorites.contains($0.name) }
            .sorted { store.rank($0, $1) }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                ScrollView {
                    VStack(spacing: 12) {
                        if favoriteMusicians.isEmpty {
                            JCEmptyState(
                                icon: "heart",
                                title: "Aucun favori",
                                message: "Mets un cœur aux musiciens fiables pour les retrouver ici en un tap."
                            )
                        }
                        ForEach(favoriteMusicians) { musician in
                            NavigationLink(value: musician) {
                                SearchMusicianRow(musician: musician)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Mes favoris")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
        }
    }
}
