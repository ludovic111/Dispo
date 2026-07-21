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

/// Mon profil — même layout que la fiche d'un autre musicien (photo + stats,
/// identité, dispo, démos), avec en plus l'édition et l'accès aux réglages.
struct MyProfileView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showEdit = false
    @State private var showSettings = false
    @State private var photoItem: PhotosPickerItem?
    @State private var videoItem: PhotosPickerItem?
    @State private var playingVideo: PlayableVideo?
    @State private var importingVideo = false
    /// Vidéo dont on édite le titre et la date.
    @State private var editingVideo: DemoVideo?

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        topBar
                        header
                        identity
                        editButton
                        availabilityCard
                        videosCard
                        myGroupsCard
                        if !store.isPremium { premiumCard }
                        footer
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showEdit) {
                EditProfileSheet()
            }
            .sheet(isPresented: $showSettings) {
                SettingsSheet()
            }
            .sheet(item: $playingVideo) { video in
                VideoPlayerSheet(url: video.url)
            }
            .sheet(item: $editingVideo) { video in
                VideoDetailsSheet(video: video)
                    .presentationDetents([.medium, .large])
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
                        await store.addDemoVideo(from: video.url)
                        try? FileManager.default.removeItem(at: video.url)
                    }
                    videoItem = nil
                    importingVideo = false
                }
            }
        }
    }

    // MARK: - Barre du haut (titre + réglages)

    private var topBar: some View {
        HStack {
            Text("Mon profil")
                .font(.title3.weight(.heavy))
            Spacer(minLength: 0)
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
                    .padding(10)
                    .background(JC.card, in: Circle())
                    .overlay(Circle().stroke(JC.cardStroke, lineWidth: 1))
            }
            .buttonStyle(PressableStyle(scale: 0.92))
            .accessibilityLabel(Text("Réglages"))
        }
    }

    // MARK: - En-tête (photo + stats, comme la fiche des autres)

    private var header: some View {
        // Snapshot : le label de PhotosPicker n'est pas isolé au MainActor.
        let profileSnapshot = store.profile
        return HStack(spacing: 18) {
            // La photo de profil se change d'un tap sur l'avatar.
            PhotosPicker(selection: $photoItem, matching: .images) {
                ZStack(alignment: .bottomTrailing) {
                    MyAvatarView(profile: profileSnapshot, size: 86)
                        .overlay(alignment: .bottomTrailing) {
                            if profileSnapshot.isAvailable {
                                Circle()
                                    .fill(profileSnapshot.availability.color)
                                    .frame(width: 16, height: 16)
                                    .overlay(Circle().stroke(JC.bg, lineWidth: 2.5))
                            }
                        }
                    Image(systemName: "camera.fill")
                        .font(.system(size: 9, weight: .bold))
                        .padding(5)
                        .background(.white.opacity(0.95), in: Circle())
                        .foregroundStyle(.black)
                        .offset(x: 2, y: -20)
                }
            }
            .buttonStyle(PressableStyle())

            HStack(spacing: 0) {
                statBlock(
                    value: store.myRatingSummary.map { "★ \($0.averageLabel)" } ?? "—",
                    label: "note"
                )
                statBlock(value: "\(store.followersCount)", label: "abonnés")
                statBlock(value: "\(store.playedWith.count)", label: "collabs")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statBlock(value: String, label: LocalizedStringKey) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline.weight(.heavy))
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Identité

    private var identity: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(store.profile.name)
                    .font(.title3.weight(.heavy))
                if store.isPremium { PremiumBadge() }
            }
            HStack(spacing: 8) {
                Text(verbatim: store.profile.handle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(JC.violet)
                AvailabilityBadge(availability: store.profile.availability)
            }
            Text(verbatim: "\(store.profile.resolvedCountry.flag) \(store.profile.cityLabel)")
                .font(.caption)
                .foregroundStyle(.secondary)
            if !store.profile.bio.isEmpty {
                Text(store.profile.bio)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
                    .padding(.top, 2)
            }
            HStack(spacing: 6) {
                ForEach(store.profile.genres.prefix(3)) { genre in
                    TagView(text: genre.rawValue, color: genre.color)
                }
            }
            .padding(.top, 2)
            if !store.profile.instruments.isEmpty {
                Text(verbatim: store.profile.instruments.map { store.tr($0.rawValue) }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 1)
            }
            SocialLogosRow(socials: store.profile.socials)
                .padding(.top, 4)
        }
    }

    /// Bouton principal — comme « Suivre / Contacter » sur les autres profils.
    private var editButton: some View {
        Button {
            showEdit = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "pencil")
                    .font(.caption.weight(.bold))
                Text("Modifier mon profil")
                    .font(.subheadline.weight(.bold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(AnyShapeStyle(JC.hero), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .foregroundStyle(Color.white)
        }
        .buttonStyle(PressableStyle())
    }

    private var footer: some View {
        Text(verbatim: "Dispo v\(Bundle.main.appVersion)")
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
    }

    // MARK: - Dates de dispo

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

    // MARK: - Démos (vidéos)

    /// Vidéos de démo : 1 en gratuit, jusqu'à 6 en Premium. C'est la vitrine
    /// du profil — on écoute avant d'engager.
    private var videosCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Mes démos", systemImage: "play.square.stack")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(JC.violet)
                    Spacer()
                    Text(verbatim: "\(store.profile.videos.count)/\(store.videoLimit)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
                Text("C'est ce que les organisateurs regardent avant de t'engager — 60 à 90 secondes suffisent.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if store.isLive {
                    Text("Tes vidéos sont visibles par les autres musiciens sur ton profil.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                ForEach(store.profile.videos) { video in
                    let index = store.profile.videos.firstIndex(of: video) ?? 0
                    HStack(spacing: 11) {
                        ZStack {
                            VideoThumbView(
                                video: video,
                                fallbackGenre: store.profile.genres.first ?? .jazz
                            )
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            Image(systemName: "play.fill")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                                .shadow(radius: 3)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: video.displayTitle(index: index, tr: store.tr))
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                            if let date = video.date {
                                Label(
                                    date.formatted(date: .abbreviated, time: .omitted),
                                    systemImage: "calendar"
                                )
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                            } else {
                                Text("Titre et date : bouton crayon")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        Spacer(minLength: 0)
                        // Édite titre + date.
                        Button {
                            editingVideo = video
                        } label: {
                            Image(systemName: "pencil")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(JC.violet)
                                .padding(8)
                                .background(JC.violet.opacity(0.12), in: Circle())
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityLabel(Text("Modifier le titre et la date"))
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
                        if let url = video.playbackURL {
                            playingVideo = PlayableVideo(url: url)
                        }
                    }
                }

                if store.canAddVideo {
                    PhotosPicker(selection: $videoItem, matching: .videos) {
                        Label(
                            isBusy ? "Envoi en cours…" : "Ajouter une vidéo",
                            systemImage: isBusy ? "arrow.triangle.2.circlepath" : "plus.circle.fill"
                        )
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.violet)
                    }
                    .disabled(isBusy)
                } else if !store.isPremium {
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

    private var isBusy: Bool { importingVideo || store.videoUploadInProgress }

    // MARK: - Mes groupes

    /// Mes groupes, avec leur visibilité : un groupe public s'affiche sur
    /// les profils de ses membres, un groupe privé reste entre vous.
    @ViewBuilder
    private var myGroupsCard: some View {
        if !store.groups.isEmpty {
            JCCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Mes groupes", systemImage: "person.3.fill")
                            .font(.subheadline.weight(.heavy))
                            .foregroundStyle(JC.violet)
                        Spacer()
                        Button {
                            store.selectedTab = .messages
                        } label: {
                            Text("Ouvrir")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(JC.violet)
                        }
                        .buttonStyle(PressableStyle())
                    }
                    ForEach(store.groups) { group in
                        HStack(spacing: 11) {
                            GroupAvatarView(group: group, size: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(group.name)
                                        .font(.subheadline.weight(.semibold))
                                        .lineLimit(1)
                                    if store.isLeader(of: group) {
                                        Image(systemName: "crown.fill")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(JC.gold)
                                    }
                                }
                                Text("\(group.memberNames.count + 1) membres")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            TagView(
                                text: group.isPublic == true ? "Public" : "Privé",
                                color: group.isPublic == true ? .teal : .gray
                            )
                        }
                    }
                    Text("Le leader choisit dans le groupe s'il est public (visible sur vos profils) ou privé.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    private var premiumCard: some View {
        JCPromoBanner(
            icon: "crown.fill",
            title: "Ne rate plus un cachet",
            subtitle: "Alertes en priorité, groupes, 6 vidéos · via l'App Store"
        ) { store.showPaywall = true }
    }
}

// MARK: - Titre & date d'une vidéo de démo

/// Feuille d'édition d'une vidéo : titre (affiché sur la grille de démos)
/// et date du concert / de l'enregistrement.
struct VideoDetailsSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let video: DemoVideo
    @State private var title: String = ""
    @State private var hasDate = false
    @State private var date: Date = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("Titre") {
                    TextField("Ex. Solo au Chat Noir", text: $title)
                }
                Section {
                    Toggle("Dater la vidéo", isOn: $hasDate.animation())
                    if hasDate {
                        DatePicker(
                            "Date de la vidéo",
                            selection: $date,
                            in: ...Date(),
                            displayedComponents: .date
                        )
                        .datePickerStyle(.graphical)
                        .tint(JC.violet)
                    }
                } header: {
                    Text("Date")
                } footer: {
                    Text("Le titre et la date s'affichent sur ta grille de démos.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Ma vidéo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        store.setVideoTitle(title, for: video)
                        store.setVideoDate(hasDate ? date : nil, for: video)
                        dismiss()
                    }
                    .font(.headline)
                }
            }
            .onAppear {
                title = video.title ?? ""
                hasDate = video.date != nil
                date = video.date ?? Date()
            }
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
