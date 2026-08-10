import SwiftUI
import AVKit

/// Page profil d'un musicien — layout façon Instagram : photo + stats en
/// haut, identité (nom, @pseudo, niveau, bio, réseaux sociaux), boutons
/// d'action, puis la grille de démos en bas.
struct MusicianDetailView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let musician: Musician
    @State private var openedConversation: Conversation?
    @State private var showSOSRequest = false
    @State private var showBlockConfirmation = false
    @State private var safetyMessage: String?
    @State private var playingVideo: PlayableVideo?
    @State private var showPlayedWith = false
    @State private var showFollowers = false

    private var mainGenre: Genre { musician.genres.first ?? .jazz }
    /// Tuiles d'aperçu — uniquement pour la vitrine des profils de démo.
    private var demoCount: Int { 3 + abs(musician.name.stableHash) % 4 }

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    identity
                    actionButtons
                    availabilityRow
                    groupsCard
                    repertoireCard
                    rateCard
                    demosGrid
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .task(id: musician.id) {
            await store.loadPublicGroups(of: musician.id)
        }
        .navigationTitle(Text(verbatim: musician.handle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        Task {
                            let sent = await store.report(musician, reason: "Profil ou contenu inapproprie")
                            if sent {
                                safetyMessage = "Signalement envoyé. Merci de nous aider à protéger la communauté."
                            }
                        }
                    } label: {
                        Label("Signaler", systemImage: "exclamationmark.bubble")
                    }
                    Button(role: .destructive) {
                        showBlockConfirmation = true
                    } label: {
                        Label("Bloquer", systemImage: "hand.raised.fill")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog(
            "Bloquer ce musicien ?",
            isPresented: $showBlockConfirmation,
            titleVisibility: .visible
        ) {
            Button("Bloquer", role: .destructive) {
                Task { if await store.block(musician) { dismiss() } }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Vous ne verrez plus ce profil ni ses messages. Le musicien ne sera pas averti.")
        }
        .alert("Sécurité", isPresented: Binding(
            get: { safetyMessage != nil },
            set: { if !$0 { safetyMessage = nil } }
        )) {
            Button("OK", role: .cancel) { safetyMessage = nil }
        } message: {
            Text(safetyMessage ?? "")
        }
        .sheet(item: $openedConversation) { conversation in
            NavigationStack {
                ChatView(conversationID: conversation.id)
                    .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Fermer") { openedConversation = nil }
                        }
                    }
            }
        }
        .sheet(item: $playingVideo) { video in
            VideoPlayerSheet(url: video.url)
        }
        .sheet(isPresented: $showSOSRequest) {
            SOSRequestSheet(musician: musician)
        }
        .sheet(isPresented: $showPlayedWith) {
            PlayedWithSheet(ownerName: firstName, collaborators: playedWithMusicians)
        }
        .sheet(isPresented: $showFollowers) {
            FollowersSheet(ownerName: firstName, followers: store.followers(of: musician))
        }
    }

    /// Musiciens avec qui ce profil a déjà joué (fiche consultable).
    private var playedWithMusicians: [Musician] {
        let names = store.collaborators(of: musician)
        return names
            .compactMap { name in store.musicians.first(where: { $0.name == name }) }
            .sorted { $0.name < $1.name }
    }

    // MARK: - En-tête (photo + stats, façon Instagram)

    private var header: some View {
        HStack(spacing: 18) {
            AvatarView(name: musician.name, size: 86, photo: musician.photo)
                .overlay(alignment: .bottomTrailing) {
                    if musician.isAvailable {
                        Circle()
                            .fill(musician.availability.color)
                            .frame(width: 16, height: 16)
                            .overlay(Circle().stroke(JC.bg, lineWidth: 2.5))
                    }
                }
            // Trois compteurs réels : note moyenne (pros seulement), abonnés,
            // collaborations « a joué avec » — jamais de chiffres inventés.
            HStack(spacing: 0) {
                if let summary = store.ratingSummary(for: musician) {
                    statBlock(value: "★ \(summary.averageLabel)", label: "note")
                } else {
                    statBlock(value: store.tr(musician.level.label), label: "niveau")
                }
                Button { showFollowers = true } label: {
                    statBlock(value: "\(store.followerCount(of: musician))", label: "abonnés")
                }
                .buttonStyle(PressableStyle())
                Button { showPlayedWith = true } label: {
                    statBlock(value: "\(store.collaborators(of: musician).count)", label: "collabs")
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

    // MARK: - Identité

    private var identity: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(musician.name)
                    .font(JCFont.display(21))
                if musician.isDemo { DemoAccountBadge() }
                SocialLinkBadge(link: store.socialLink(with: musician.name))
            }
            if store.playedWithAFriend(musician) {
                PlayedWithFriendDetailBadge(friends: store.friendsWhoPlayedWith(musician))
            }
            HStack(spacing: 8) {
                Text(verbatim: musician.handle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(JC.bronze)
                AvailabilityBadge(availability: musician.availability)
                // Niveau : avantage Premium.
                if store.isPremium {
                    TagView(text: musician.level.label, color: JC.laiton)
                } else {
                    Button { store.showPaywall = true } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 8, weight: .bold))
                            Text("niveau")
                                .font(.caption2.weight(.bold))
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(JC.laiton.opacity(0.14), in: Capsule())
                        .foregroundStyle(JC.laiton)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
            // La distance ne s'affiche que quand elle est fiable : ma géoloc
            // partagée ET la sienne. « ≈ » quand la position est au niveau
            // ville, précise quand le musicien partage sa position exacte.
            Text({
                let base = String(format: store.tr("%lld ans"), Int64(musician.age)) + " · \(musician.neighborhood)"
                guard let label = store.distanceLabel(to: musician) else { return base }
                return base + " · " + label
            }())
                .font(.caption)
                .foregroundStyle(.secondary)
            if !musician.bio.isEmpty {
                Text(musician.bio)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
                    .padding(.top, 2)
            }
            playedWithRow
            FlowLayout {
                ForEach(musician.genres.prefix(3)) { genre in
                    TagView(text: genre.rawValue, color: genre.color)
                }
            }
            .padding(.top, 2)
            if !musician.instruments.isEmpty {
                // Instruments joués, avec le niveau par instrument
                // (visible pour les membres Premium, comme le niveau global).
                FlowLayout {
                    ForEach(musician.instruments) { instrument in
                        InstrumentChip(
                            instrument: instrument,
                            level: store.isPremium
                                ? (musician.level(for: instrument) ?? musician.level)
                                : nil
                        )
                    }
                }
            }
            SocialLogosRow(socials: musician.socials)
                .padding(.top, 4)
        }
    }

    /// « A joué avec » — les avatars des musiciens avec qui il a déjà joué,
    /// juste sous la bio. Un tap ouvre la liste complète, profils cliquables.
    @ViewBuilder
    private var playedWithRow: some View {
        let collaborators = playedWithMusicians
        if !collaborators.isEmpty {
            Button { showPlayedWith = true } label: {
                HStack(spacing: 9) {
                    HStack(spacing: -10) {
                        ForEach(collaborators.prefix(4)) { collaborator in
                            AvatarView(name: collaborator.name, size: 30, photo: collaborator.photo)
                                .overlay(Circle().stroke(JC.bg, lineWidth: 2))
                        }
                    }
                    Text(playedWithLabel(collaborators))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(PressableStyle())
            .padding(.top, 4)
            .accessibilityLabel(Text("Voir avec qui ce musicien a joué"))
        }
    }

    /// « A joué avec Marco » / « A joué avec Marco +3 ».
    private func playedWithLabel(_ collaborators: [Musician]) -> String {
        guard let first = collaborators.first else { return "" }
        let firstName = first.name.split(separator: " ").first.map(String.init) ?? first.name
        if collaborators.count == 1 {
            return String(format: store.tr("A joué avec %@"), firstName)
        }
        return String(format: store.tr("A joué avec %@ +%lld"), firstName, Int64(collaborators.count - 1))
    }

    // MARK: - Actions

    private var actionButtons: some View {
        VStack(spacing: 8) {
            // La demande de dépannage n'est pas un message : c'est un vrai
            // SOS adressé à cette personne, qu'elle accepte ou refuse d'un tap.
            if musician.isAvailable {
                Button {
                    showSOSRequest = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill")
                            .font(.caption.weight(.bold))
                        Text("Demander un dépannage")
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(AnyShapeStyle(JC.signal), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(Color.white)
                }
                .buttonStyle(PressableStyle())
            }

            HStack(spacing: 8) {
                Button {
                    withAnimation(.snappy) { store.toggleFollow(musician) }
                } label: {
                    Text(store.isFollowing(musician) ? "Suivi" : "Suivre")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            store.isFollowing(musician) ? AnyShapeStyle(JC.card) : AnyShapeStyle(JC.hero),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(store.isFollowing(musician) ? JC.cardStroke : .clear, lineWidth: 1)
                        )
                        .foregroundStyle(store.isFollowing(musician) ? Color.primary : JC.billetInk)
                }
                .buttonStyle(PressableStyle())

                Button {
                    Task { openedConversation = await store.conversation(with: musician) }
                } label: {
                    Text("Contacter")
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(JC.cardStroke, lineWidth: 1)
                        )
                        .foregroundStyle(.primary)
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    // MARK: - Dispo

    /// Prochaines dates de dispo (mode live — le seed n'en a pas).
    private var upcomingDates: [Date] {
        let today = Calendar.current.startOfDay(for: Date())
        return musician.availableDates
            .filter { Calendar.current.startOfDay(for: $0) >= today }
            .sorted()
            .prefix(4)
            .map { $0 }
    }

    @ViewBuilder
    private var availabilityRow: some View {
        if !upcomingDates.isEmpty {
            FlowLayout {
                Image(systemName: "calendar")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                ForEach(upcomingDates, id: \.self) { date in
                    TagView(
                        text: date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)),
                        color: musician.availability.color
                    )
                }
            }
        }
    }

    // MARK: - Groupes publics

    /// Groupes que ce musicien affiche publiquement sur son profil.
    @ViewBuilder
    private var groupsCard: some View {
        if let groups = store.publicGroupsByProfile[musician.id], !groups.isEmpty {
            JCCard {
                VStack(alignment: .leading, spacing: 12) {
                    sectionTitle("Groupes", systemImage: "person.3.fill")
                    ForEach(groups) { group in
                        HStack(spacing: 11) {
                            PublicGroupAvatarView(group: group, size: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(group.name)
                                        .font(.subheadline.weight(.semibold))
                                        .lineLimit(1)
                                    if group.isLeader {
                                        Image(systemName: "crown.fill")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(JC.laiton)
                                            .accessibilityLabel(Text("Leader"))
                                    }
                                }
                                Text("\(group.memberCount) membres")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Répertoire

    @ViewBuilder
    private var repertoireCard: some View {
        if !musician.repertoire.isEmpty {
            JCCard {
                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("Répertoire", systemImage: "music.note.list")
                    ForEach(musician.repertoire, id: \.self) { piece in
                        HStack(spacing: 10) {
                            Image(systemName: "music.note")
                                .font(.caption)
                                .foregroundStyle(mainGenre.color)
                            Text(piece).font(.subheadline)
                        }
                    }
                }
            }
        }
    }

    private var firstName: String {
        musician.name.split(separator: " ").first.map(String.init) ?? musician.name
    }

    // MARK: - Note étoilée (fusion « j'ai joué avec » + note)

    /// Carte interactive : déclarer qu'on a joué ensemble = donner une note
    /// de 1 à 5 étoiles. Les notes sont anonymes ; seule la moyenne et le
    /// nombre d'avis sont visibles.
    private var rateCard: some View {
        let isPro = store.canBeRated(musician)
        let summary = store.ratingSummary(for: musician)
        let mine = store.myRating(for: musician)
        let played = store.hasPlayedWith(musician)
        return JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    sectionTitle(
                        "Tu as joué avec \(firstName) ?",
                        systemImage: isPro ? "star.fill" : "person.2.fill"
                    )
                    Spacer()
                    if let summary {
                        RatingBadge(summary: summary)
                    }
                }

                // Le geste ouvert à tout le monde : déclarer qu'on a joué
                // ensemble. C'est ce qui construit le graphe « a joué avec ».
                Button {
                    withAnimation(.snappy) { store.togglePlayedWith(musician) }
                } label: {
                    Label(
                        played ? "On a joué ensemble" : "Déclarer qu'on a joué ensemble",
                        systemImage: played ? "checkmark.circle.fill" : "plus.circle"
                    )
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        played ? JC.feutrine.opacity(0.16) : JC.bronze.opacity(0.12),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .foregroundStyle(played ? JC.feutrine : JC.bronze)
                }
                .buttonStyle(PressableStyle())

                if isPro {
                    // Les étoiles sont réservées aux professionnels : c'est
                    // leur métier qu'on évalue, pas une soirée entre amis.
                    Divider()
                    if let summary {
                        HStack(spacing: 8) {
                            StarsView(rating: summary.average, size: 13)
                            Text("\(summary.count) avis")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    // On ne note que quelqu'un avec qui on a joué : sans ça,
                    // les étoiles ne valent rien. Le serveur applique la
                    // même règle — ici, on l'explique.
                    Text(played
                         ? (mine == nil
                            ? LocalizedStringKey("\(firstName) est musicien·ne professionnel·le : tu peux aussi noter la prestation. Ta note est anonyme.")
                            : "Ta note (anonyme) — modifie-la ou retire-la quand tu veux.")
                         : "Déclare d'abord que vous avez joué ensemble : on ne note que quelqu'un qu'on a vu jouer.")
                        .font(.caption)
                        .foregroundStyle(played ? .secondary : JC.laiton)
                    HStack(spacing: 6) {
                        ForEach(1...5, id: \.self) { stars in
                            Button {
                                withAnimation(.snappy) { store.rate(musician, stars: stars) }
                            } label: {
                                Image(systemName: (mine ?? 0) >= stars ? "star.fill" : "star")
                                    .font(.system(size: 26, weight: .semibold))
                                    .foregroundStyle((mine ?? 0) >= stars ? JC.laiton : Color.secondary.opacity(0.5))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 6)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(PressableStyle(scale: 0.85))
                            .accessibilityLabel(Text(verbatim: "\(stars)/5"))
                        }
                    }
                    .disabled(!played)
                    .opacity(played ? 1 : 0.45)
                    if mine != nil {
                        Button {
                            withAnimation(.snappy) { store.removeRating(for: musician) }
                        } label: {
                            Label("Retirer ma note", systemImage: "star.slash")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
        }
    }

    // MARK: - Grille de démos (bas de page, façon Instagram)

    /// Vidéos de démo du musicien : les vraies vidéos hébergées quand il y en
    /// a ; vitrine fictive pour les profils de démo ; état vide honnête sinon.
    private var demosGrid: some View {
        let videos = musician.demoVideos.filter { $0.playbackURL != nil }
        return VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Démos", systemImage: "play.square.stack")
            if !videos.isEmpty {
                let columns = [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)]
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(videos) { video in
                        videoTile(video)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else if musician.isDemo {
                let columns = [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)]
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(0..<demoCount, id: \.self) { index in
                        demoTile(index: index)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text("Aperçu de démonstration — profil d'exemple.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else {
                Text("Pas encore de vidéo de démo sur ce profil.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Tuile d'une vraie vidéo hébergée — miniature si disponible, un tap
    /// pour la lire.
    private func videoTile(_ video: DemoVideo) -> some View {
        let index = musician.demoVideos.firstIndex(of: video) ?? 0
        return Button {
            if let url = video.playbackURL {
                playingVideo = PlayableVideo(url: url)
            }
        } label: {
            ZStack(alignment: .bottomLeading) {
                VideoThumbView(video: video, fallbackGenre: mainGenre)
                    .aspectRatio(1, contentMode: .fill)
                Image(systemName: "play.circle.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.95))
                    .shadow(radius: 4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                VStack(alignment: .leading, spacing: 2) {
                    if let title = video.title, !title.isEmpty {
                        Text(title)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(.black.opacity(0.45), in: Capsule())
                    }
                    if let date = video.date {
                        Text(date.formatted(.dateTime.day().month(.abbreviated).year()))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(.black.opacity(0.45), in: Capsule())
                    }
                }
                .padding(5)
            }
            .clipped()
            .accessibilityLabel(Text(verbatim: video.displayTitle(index: index, tr: store.tr)))
        }
        .buttonStyle(PressableStyle(scale: 0.95))
    }

    private func demoTile(index: Int) -> some View {
        // Couverture stable par tuile : alterne les genres du musicien.
        // Repli sur mainGenre si le profil n'a aucun genre (sinon crash).
        let genre = musician.genres.isEmpty ? mainGenre : musician.genres[index % musician.genres.count]
        let seconds = 60 + abs((musician.name + "\(index)").stableHash) % 31
        return ZStack(alignment: .bottomTrailing) {
            GenreCover(genre: genre)
                .aspectRatio(1, contentMode: .fill)
            Image(systemName: "play.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.95))
                .shadow(radius: 4)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Text(verbatim: String(format: "%d:%02d", seconds / 60, seconds % 60))
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(.black.opacity(0.45), in: Capsule())
                .padding(5)
        }
        .clipped()
    }

    private func sectionTitle(_ title: LocalizedStringKey, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.heavy))
            .foregroundStyle(JC.laiton)
    }
}

// MARK: - « A joué avec » : la liste complète

/// Tous les musiciens avec qui ce profil a joué — chaque ligne ouvre la
/// fiche du musicien (navigation dans la feuille).
struct PlayedWithSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let ownerName: String
    let collaborators: [Musician]

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                ScrollView {
                    VStack(spacing: 10) {
                        Text(String(format: store.tr("Les musiciens qui ont joué avec %@ — un tap ouvre leur profil."), ownerName))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(collaborators) { collaborator in
                            NavigationLink(value: collaborator) {
                                JCCard(padding: 11) {
                                    HStack(spacing: 11) {
                                        AvatarView(name: collaborator.name, size: 44, photo: collaborator.photo)
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 6) {
                                                Text(collaborator.name)
                                                    .font(.subheadline.weight(.bold))
                                                    .foregroundStyle(.primary)
                                                    .lineLimit(1)
                                                if collaborator.isDemo { DemoAccountBadge() }
                                            }
                                            Text(verbatim: collaborator.handle)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer(minLength: 0)
                                        if let summary = store.ratingSummary(for: collaborator) {
                                            RatingBadge(summary: summary)
                                        }
                                        Image(systemName: "chevron.right")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("A joué avec")
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

/// Feuille listant les abonnés d'un profil — un tap ouvre chaque fiche.
struct FollowersSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let ownerName: String
    let followers: [Musician]

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                ScrollView {
                    VStack(spacing: 10) {
                        Text(
                            followers.isEmpty
                                ? String(format: store.tr("%@ n'a pas encore d'abonnés."), ownerName)
                                : String(format: store.tr("Les abonnés de %@ — un tap ouvre leur profil."), ownerName)
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(followers) { follower in
                            NavigationLink(value: follower) {
                                JCCard(padding: 11) {
                                    HStack(spacing: 11) {
                                        AvatarView(name: follower.name, size: 44, photo: follower.photo)
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 6) {
                                                Text(follower.name)
                                                    .font(.subheadline.weight(.bold))
                                                    .foregroundStyle(.primary)
                                                    .lineLimit(1)
                                                if follower.isDemo { DemoAccountBadge() }
                                            }
                                            Text(verbatim: follower.handle)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer(minLength: 0)
                                        if let summary = store.ratingSummary(for: follower) {
                                            RatingBadge(summary: summary)
                                        }
                                        Image(systemName: "chevron.right")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Abonnés")
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

// MARK: - Composants vidéos & groupes

/// Miniature d'une vidéo de démo : l'image générée à l'envoi si elle
/// existe, sinon la couverture du genre (vidéos d'avant 0.9.6).
struct VideoThumbView: View {
    let video: DemoVideo
    let fallbackGenre: Genre

    var body: some View {
        if let thumb = video.thumbURL, let url = URL(string: thumb) {
            Color.clear.overlay(
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    GenreCover(genre: fallbackGenre)
                }
            )
        } else {
            GenreCover(genre: fallbackGenre)
        }
    }
}

/// Lecteur vidéo plein écran : lance la lecture tout seul et active la
/// sortie audio même si l'iPhone est en mode silencieux.
struct VideoPlayerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VideoPlayer(player: player)
                .ignoresSafeArea()
            // Une vidéo en plein écran sans bouton de sortie, on s'y sent
            // coincé — le glissement vers le bas ne saute pas aux yeux.
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.45))
                    .padding(16)
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel(Text("Fermer"))
        }
        .presentationDetents([.large])
        .onAppear {
            AppStore.activatePlaybackAudio()
            let player = AVPlayer(url: url)
            self.player = player
            player.play()
        }
        .onDisappear {
            player?.pause()
        }
    }
}

/// Avatar d'un groupe public : photo si le leader en a mis une, sinon emoji.
struct PublicGroupAvatarView: View {
    let group: PublicGroup
    var size: CGFloat = 40

    var body: some View {
        if let photo = group.photoURL, let url = URL(string: photo) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                emojiCircle
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            emojiCircle
        }
    }

    private var emojiCircle: some View {
        ZStack {
            Circle()
                .fill(JC.bronze.opacity(0.15))
                .frame(width: size, height: size)
            Text(group.emoji)
        }
    }
}
