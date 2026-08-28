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

/// Avatar de l'utilisateur : sa photo choisie si elle existe, sinon sa
/// photo hébergée (nouvel appareil, réinstallation), sinon la pastille
/// dégradée avec initiales.
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
            // AvatarView charge photoURL (https) ou retombe sur les initiales.
            AvatarView(name: profile.name, size: size, photo: profile.photoURL)
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
    @State private var showFollowers = false
    @State private var showPlayedWith = false
    @State private var showSchools = false
    /// Séjour en cours d'ajout ou de modification.
    @State private var editingPlace: AvailabilityPlace?

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        topBar
                        header
                        identity
                        mySchoolsCard
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
            .sheet(isPresented: $showFollowers) {
                FollowersSheet(ownerName: store.profile.name, followers: store.myFollowerMusicians)
            }
            .sheet(isPresented: $showPlayedWith) {
                PlayedWithSheet(ownerName: store.profile.name, collaborators: myCollaboratorMusicians)
            }
            .sheet(isPresented: $showSchools) {
                NavigationStack {
                    MusicSchoolDirectoryView()
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Fermer") { showSchools = false }
                            }
                        }
                }
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
                    if let picked = try? await item.loadTransferable(type: PickedVideo.self) {
                        let added = await store.addDemoVideo(from: picked.url)
                        try? FileManager.default.removeItem(at: picked.url)
                        // Propose de titrer la vidéo juste après l'ajout.
                        if let added { editingVideo = added }
                    }
                    videoItem = nil
                    importingVideo = false
                }
            }
        }
    }

    // MARK: - Écoles

    @ViewBuilder
    private var mySchoolsCard: some View {
        let affiliations = store.myMusicSchoolCommunities.map(\.affiliation)
        if affiliations.isEmpty {
            Button { showSchools = true } label: {
                JCCard {
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .fill(JC.bronze.opacity(0.14))
                                .frame(width: 42, height: 42)
                            Image(systemName: "building.columns.fill")
                                .foregroundStyle(JC.bronze)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Ajouter mon école de musique")
                                .font(.subheadline.weight(.heavy))
                                .foregroundStyle(.primary)
                            Text("Retrouve ses membres et rejoins sa conversation.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                            .foregroundStyle(JC.bronze)
                    }
                }
            }
            .buttonStyle(PressableStyle())
        } else {
            MusicSchoolAffiliationsCard(
                affiliations: affiliations,
                title: "Mes écoles",
                actionTitle: "Gérer",
                action: { showSchools = true }
            )
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
                Button { showFollowers = true } label: {
                    statBlock(value: "\(store.followersCount)", label: "abonnés")
                }
                .buttonStyle(PressableStyle())
                Button { showPlayedWith = true } label: {
                    statBlock(value: "\(store.playedWith.count)", label: "collabs")
                }
                .buttonStyle(PressableStyle())
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

    /// Mes collaborateurs en objets Musician (feuille « A joué avec »).
    private var myCollaboratorMusicians: [Musician] {
        store.musicians
            .filter { store.playedWith.contains($0.name) }
            .sorted { $0.name < $1.name }
    }

    // MARK: - Identité

    private var identity: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(store.profile.name)
                    .font(JCFont.display(21))
                if store.isPremium { PremiumBadge() }
            }
            HStack(spacing: 8) {
                Text(verbatim: store.profile.handle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(JC.bronze)
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
                // Mes instruments avec leur niveau (« Piano · Avancé »).
                FlowLayout {
                    ForEach(store.profile.instruments) { instrument in
                        TagView(text: myInstrumentLabel(instrument), color: JC.bronze)
                    }
                }
                .padding(.top, 1)
            }
            let schoolAffiliations = store.myMusicSchoolCommunities.map(\.affiliation)
            if !schoolAffiliations.isEmpty {
                FlowLayout {
                    ForEach(schoolAffiliations) { affiliation in
                        MusicSchoolAffiliationChip(affiliation: affiliation)
                    }
                }
                .padding(.top, 1)
            }
            SocialLogosRow(socials: store.profile.socials)
                .padding(.top, 4)
        }
    }

    /// « Piano · Avancé » ou juste « Piano » si le niveau n'est pas choisi.
    private func myInstrumentLabel(_ instrument: Instrument) -> String {
        guard let level = store.profile.level(for: instrument) else {
            return store.tr(instrument.rawValue)
        }
        return store.tr(instrument.rawValue) + " · " + store.tr(level.label)
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
            .foregroundStyle(JC.billetInk)
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
                        .foregroundStyle(JC.feutrine)
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
                .tint(JC.feutrine)
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

                Divider()

                // « Dispo, mais pas ici » : en tournée ou en vacances, on
                // reste trouvable — pour des concerts sur place.
                HStack {
                    Label("Je suis ailleurs", systemImage: "airplane.departure")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(JC.bronze)
                    Spacer()
                    Button {
                        editingPlace = AvailabilityPlace(
                            from: Date(),
                            to: Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date(),
                            country: store.profile.country,
                            city: ""
                        )
                    } label: {
                        Label("Ajouter", systemImage: "plus.circle.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(JC.laiton)
                    }
                    .buttonStyle(PressableStyle())
                }
                if store.profile.trips.isEmpty {
                    Text("Rien pour l'instant — tu es cherché·e autour de \(store.profile.cityLabel).")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(store.profile.trips.sorted { $0.from < $1.from }) { trip in
                        HStack(spacing: 8) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.caption)
                                .foregroundStyle(JC.laiton)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(trip.label)
                                    .font(.caption.weight(.bold))
                                Text(verbatim: "\(trip.from.formatted(.dateTime.day().month(.abbreviated))) → \(trip.to.formatted(.dateTime.day().month(.abbreviated).year()))")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button {
                                store.removeAvailabilityPlace(trip)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.body)
                                    .foregroundStyle(.tertiary)
                            }
                            .buttonStyle(PressableStyle())
                            .accessibilityLabel(Text("Supprimer"))
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .sheet(item: $editingPlace) { trip in
            AvailabilityPlaceSheet(place: trip)
                .presentationDetents([.medium, .large])
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
                        .foregroundStyle(JC.bronze)
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
                                .foregroundStyle(JC.bronze)
                                .padding(8)
                                .background(JC.bronze.opacity(0.12), in: Circle())
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
                        .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.bronze)
                    }
                    .disabled(isBusy)
                } else if !store.canUse(.expandedPortfolio) {
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
                        .background(JC.laiton.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.laiton)
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
                            .foregroundStyle(JC.bronze)
                        Spacer()
                        Button {
                            store.selectedTab = .messages
                        } label: {
                            Text("Ouvrir")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(JC.bronze)
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
                                            .foregroundStyle(JC.laiton)
                                    }
                                }
                                Text("\(group.memberNames.count + 1) membres")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            TagView(
                                text: group.isPublic == true ? "Public" : "Privé",
                                color: group.isPublic == true ? JC.feutrine : .gray
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
            title: "Plus de musique. Moins d'organisation.",
            subtitle: "Plusieurs groupes, automatisations et 6 vidéos · via l'App Store"
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
                        .tint(JC.bronze)
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

                Section {
                    NavigationLink {
                        MusicSchoolDirectoryView()
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "building.columns.fill")
                                .foregroundStyle(JC.bronze)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Mes écoles de musique")
                                Text(
                                    store.myMusicSchoolCommunities.isEmpty
                                        ? "Ajouter une école et rejoindre sa communauté"
                                        : "\(store.myMusicSchoolCommunities.count) affiliation·s"
                                )
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            }
                        }
                    }
                } footer: {
                    Text("Ton rôle est déclaré par toi jusqu'à validation par l'établissement.")
                }

                // Mes instruments — une section par famille, avec le niveau
                // PAR instrument sur chaque ligne cochée.
                ForEach(InstrumentCategory.allCases) { category in
                    Section {
                        ForEach(Instrument.instruments(in: category)) { instrument in
                            instrumentRow(instrument)
                        }
                    } header: {
                        if category == InstrumentCategory.allCases.first {
                            Text("Mes instruments — ") + Text(LocalizedStringKey(category.rawValue))
                        } else {
                            Text(LocalizedStringKey(category.rawValue))
                        }
                    } footer: {
                        if category == InstrumentCategory.allCases.first {
                            Text("Coche tes instruments, puis choisis ton niveau pour chacun.")
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
                            SocialLogoView(network: network, size: 24)
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

    /// Ligne d'un instrument : cocher / décocher, et — une fois coché — le
    /// menu du niveau pour CET instrument (le niveau global suit le meilleur).
    private func instrumentRow(_ instrument: Instrument) -> some View {
        let isOn = store.profile.instruments.contains(instrument)
        let level = store.profile.level(for: instrument)
        return HStack(spacing: 10) {
            Button {
                if let index = store.profile.instruments.firstIndex(of: instrument) {
                    store.profile.instruments.remove(at: index)
                    store.profile.removeLevel(for: instrument)
                } else {
                    store.profile.instruments.append(instrument)
                }
                store.saveProfile()
            } label: {
                HStack {
                    Text(LocalizedStringKey(instrument.rawValue))
                        .foregroundStyle(.primary)
                    Spacer()
                    if isOn {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(JC.laiton)
                    }
                }
            }
            .buttonStyle(.plain)

            if isOn {
                Menu {
                    ForEach(Level.allCases) { option in
                        Button {
                            store.profile.setLevel(option, for: instrument)
                            store.saveProfile()
                        } label: {
                            if level == option {
                                Label(LocalizedStringKey(option.label), systemImage: "checkmark")
                            } else {
                                Text(LocalizedStringKey(option.label))
                            }
                        }
                    }
                } label: {
                    Text(LocalizedStringKey(level?.label ?? "Niveau"))
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(
                            (level == nil ? JC.laiton : JC.bronze).opacity(0.14),
                            in: Capsule()
                        )
                        .foregroundStyle(level == nil ? JC.laiton : JC.bronze)
                        .fixedSize()
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
                        .foregroundStyle(JC.laiton)
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
    @State private var country: Country = .switzerland
    @State private var postalCode = ""
    @State private var city = ""

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
                                        .foregroundStyle(JC.laiton)
                                }
                            }
                        }
                    }
                }

                Section("Ville / région") {
                    CountryPostalField(
                        country: $country,
                        postalCode: $postalCode,
                        city: $city,
                        detectedCountry: store.detectedCountry
                    )
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Langue & région")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        store.profile.country = country
                        store.profile.postalCode = postalCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                        store.profile.city = city.trimmingCharacters(in: .whitespacesAndNewlines)
                        store.saveProfile()
                        dismiss()
                    }
                    .font(.headline)
                    .disabled(!PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete)
                }
            }
            .onAppear {
                country = store.profile.country ?? store.preferredCountry
                postalCode = store.profile.postalCode ?? ""
                city = store.profile.city ?? ""
                store.requestLocation()
            }
        }
    }
}

// MARK: - Séjour ailleurs

/// « Je suis dispo, mais à Lisbonne du 12 au 20 » — une période et un lieu.
/// Le pays vient de la liste connue ; la ville est libre, parce qu'on peut
/// être n'importe où.
struct AvailabilityPlaceSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let place: AvailabilityPlace

    @State private var from = Date()
    @State private var to = Date()
    @State private var country: Country = .switzerland
    @State private var postalCode = ""
    @State private var city = ""

    private var isValid: Bool {
        PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Quand") {
                    DatePicker("Du", selection: $from, displayedComponents: .date)
                    DatePicker("Au", selection: $to, in: from..., displayedComponents: .date)
                }
                Section {
                    CountryPostalField(
                        country: $country,
                        postalCode: $postalCode,
                        city: $city,
                        detectedCountry: store.detectedCountry
                    )
                } header: {
                    Text("Où")
                } footer: {
                    Text("Pendant cette période, les musiciens et les groupes de cette ville te trouvent dans leurs recherches — pas ceux de chez toi.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Je suis ailleurs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        var saved = place
                        saved.from = from
                        saved.to = max(to, from)
                        saved.country = country
                        saved.postalCode = postalCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                        saved.city = city.trimmingCharacters(in: .whitespaces)
                        store.saveAvailabilityPlace(saved)
                        dismiss()
                    }
                    .font(.headline)
                    .disabled(!isValid)
                }
            }
            .onAppear {
                from = place.from
                to = place.to
                country = place.country ?? store.preferredCountry
                postalCode = place.postalCode ?? ""
                city = place.city
                store.requestLocation()
            }
        }
    }
}
