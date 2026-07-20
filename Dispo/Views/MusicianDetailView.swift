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
                    repertoireCard
                    rateCard
                    demosGrid
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
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
            }
        }
        .sheet(item: $playingVideo) { video in
            VideoPlayer(player: AVPlayer(url: video.url))
                .ignoresSafeArea()
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showSOSRequest) {
            SOSRequestSheet(musician: musician) { conversation in
                // Laisser la feuille se refermer avant d'ouvrir la conversation.
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(450))
                    openedConversation = conversation
                }
            }
        }
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
            // Trois compteurs réels : note moyenne, abonnés, collaborations
            // « a joué avec » — jamais de chiffres inventés.
            HStack(spacing: 0) {
                statBlock(
                    value: store.ratingSummary(for: musician).map { "★ \($0.averageLabel)" } ?? "—",
                    label: "note"
                )
                statBlock(value: "\(store.followerCount(of: musician))", label: "abonnés")
                statBlock(value: "\(store.collaborators(of: musician).count)", label: "collabs")
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
                    .font(.title3.weight(.heavy))
                if musician.isDemo { DemoAccountBadge() }
                SocialLinkBadge(link: store.socialLink(with: musician.name))
            }
            if store.playedWithAFriend(musician) {
                PlayedWithFriendDetailBadge(friends: store.friendsWhoPlayedWith(musician))
            }
            HStack(spacing: 8) {
                Text(verbatim: musician.handle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(JC.violet)
                AvailabilityBadge(availability: musician.availability)
                // Niveau : avantage Premium.
                if store.isPremium {
                    TagView(text: musician.level.rawValue, color: JC.gold)
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
                        .background(JC.gold.opacity(0.14), in: Capsule())
                        .foregroundStyle(JC.gold)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
            // La distance ne s'affiche que quand elle est fiable : ma géoloc
            // partagée ET la sienne (toujours vrai en démo).
            Text({
                let base = "\(musician.age) ans · \(musician.neighborhood)"
                guard let distance = store.distance(to: musician) else { return base }
                return base + " · " + String(format: "%.1f km", distance)
            }())
                .font(.caption)
                .foregroundStyle(.secondary)
            if !musician.bio.isEmpty {
                Text(musician.bio)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
                    .padding(.top, 2)
            }
            HStack(spacing: 6) {
                ForEach(musician.genres.prefix(3)) { genre in
                    TagView(text: genre.rawValue, color: genre.color)
                }
            }
            .padding(.top, 2)
            SocialLogosRow(socials: musician.socials)
                .padding(.top, 4)
        }
    }

    // MARK: - Actions

    private var actionButtons: some View {
        VStack(spacing: 8) {
            // La demande de dépannage n'est pas un simple message : c'est un
            // formulaire (instrument, date, lieu, cachet) envoyé balisé 🚨.
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
                    .background(AnyShapeStyle(JC.hero), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                        .foregroundStyle(store.isFollowing(musician) ? Color.primary : Color.white)
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
            HStack(spacing: 6) {
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
        let summary = store.ratingSummary(for: musician)
        let mine = store.myRating(for: musician)
        return JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    sectionTitle("Tu as joué avec \(firstName) ?", systemImage: "star.fill")
                    Spacer()
                    if let summary {
                        RatingBadge(summary: summary)
                    }
                }
                if let summary {
                    HStack(spacing: 8) {
                        StarsView(rating: summary.average, size: 13)
                        Text("\(summary.count) avis")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Pas encore de note — sois le premier à jouer avec \(firstName) !")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Divider()
                Text(mine == nil
                     ? "Note ton expérience de jeu avec \(firstName) — ta note est anonyme et compte comme « on a joué ensemble »."
                     : "Ta note (anonyme) — modifie-la ou retire-la quand tu veux.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    ForEach(1...5, id: \.self) { stars in
                        Button {
                            withAnimation(.snappy) { store.rate(musician, stars: stars) }
                        } label: {
                            Image(systemName: (mine ?? 0) >= stars ? "star.fill" : "star")
                                .font(.system(size: 26, weight: .semibold))
                                .foregroundStyle((mine ?? 0) >= stars ? JC.gold : Color.secondary.opacity(0.5))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressableStyle(scale: 0.85))
                        .accessibilityLabel(Text(verbatim: "\(stars)/5"))
                    }
                }
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

    /// Tuile d'une vraie vidéo hébergée — un tap pour la lire.
    private func videoTile(_ video: DemoVideo) -> some View {
        Button {
            if let url = video.playbackURL {
                playingVideo = PlayableVideo(url: url)
            }
        } label: {
            ZStack(alignment: .bottomLeading) {
                GenreCover(genre: mainGenre)
                    .aspectRatio(1, contentMode: .fill)
                Image(systemName: "play.circle.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.95))
                    .shadow(radius: 4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if let date = video.date {
                    Text(date.formatted(.dateTime.day().month(.abbreviated).year()))
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(.black.opacity(0.45), in: Capsule())
                        .padding(5)
                }
            }
            .clipped()
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
            .foregroundStyle(JC.coral)
    }
}
