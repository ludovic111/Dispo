import SwiftUI

/// Page profil d'un musicien — layout façon Instagram : photo + stats en
/// haut, identité (nom, @pseudo, niveau, bio, réseaux sociaux), boutons
/// d'action, puis la grille de démos en bas.
struct MusicianDetailView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let musician: Musician
    @State private var openedConversation: Conversation?
    @State private var showBlockConfirmation = false
    @State private var safetyMessage: String?

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
                    reviewsCard
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
            // Trois compteurs réels : appréciations reçues, abonnés,
            // collaborations « a joué avec » — jamais de chiffres inventés.
            HStack(spacing: 0) {
                statBlock(value: "\(store.noteCount(for: musician))", label: "notes")
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
                if store.showsPremium {
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
            // En live, les coordonnées serveur sont encore des positions par
            // défaut (géoloc en phase 2b) : afficher un « x.x km » serait faux.
            Text(store.isLive
                 ? "\(musician.age) ans · \(musician.neighborhood)"
                 : "\(musician.age) ans · \(musician.neighborhood) · \(String(format: "%.1f km", musician.distance(from: AppStore.geneva)))")
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
                    Text(musician.isAvailable ? "Demander un dépannage" : "Contacter")
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

                Button {
                    withAnimation(.snappy) { store.toggleFavorite(musician) }
                } label: {
                    Image(systemName: store.isFavorite(musician) ? "heart.fill" : "heart")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(store.isFavorite(musician) ? JC.magenta : Color.primary)
                        .padding(10)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(JC.cardStroke, lineWidth: 1)
                        )
                }
                .buttonStyle(PressableStyle())
            }

            Button {
                withAnimation(.snappy) { store.togglePlayedWith(musician) }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: store.hasPlayedWith(musician) ? "person.2.fill" : "person.2")
                        .font(.caption.weight(.bold))
                    Text(store.hasPlayedWith(musician) ? "Vous avez joué ensemble" : "J'ai déjà joué avec")
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    store.hasPlayedWith(musician) ? AnyShapeStyle(JC.coral.opacity(0.16)) : AnyShapeStyle(JC.card),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(store.hasPlayedWith(musician) ? JC.coral.opacity(0.45) : JC.cardStroke, lineWidth: 1)
                )
                .foregroundStyle(store.hasPlayedWith(musician) ? JC.coral : Color.primary)
            }
            .buttonStyle(PressableStyle())
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

    // MARK: - Appréciations

    /// Carte interactive : l'utilisateur donne une note de musique ou une note dorée.
    private var rateCard: some View {
        let given = store.appreciation(for: musician)
        return JCCard {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Tu as joué avec \(firstName) ?", systemImage: "hand.thumbsup.fill")
                Text("Laisse-lui une note de musique — ou une note dorée si c'était un coup de cœur. Ici on ne partage que le positif : pas de mauvaise note.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    appreciationButton(.note, given: given)
                    appreciationButton(.golden, given: given)
                }
            }
        }
    }

    private func appreciationButton(_ appreciation: Appreciation, given: Appreciation?) -> some View {
        let isSelected = given == appreciation
        let isGolden = appreciation == .golden
        let accent = isGolden ? JC.gold : JC.violet
        return Button {
            withAnimation(.snappy) {
                store.setAppreciation(isSelected ? nil : appreciation, for: musician)
            }
        } label: {
            VStack(spacing: 8) {
                if isGolden {
                    GoldenNoteView(size: 26)
                } else {
                    Image(systemName: "music.note")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(isSelected ? JC.violet : Color.primary)
                }
                Text(isGolden ? "J'ai adoré" : "J'ai aimé")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(isSelected ? accent : Color.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                isSelected ? accent.opacity(0.16) : JC.inset,
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isSelected ? accent.opacity(0.6) : JC.cardStroke, lineWidth: 1)
            )
        }
        .buttonStyle(PressableStyle())
    }

    private var reviewsCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    sectionTitle("Ce qu'ils en disent", systemImage: "music.note")
                    Spacer()
                    if store.noteCount(for: musician) > 0 {
                        NoteRatingView(
                            notes: store.noteCount(for: musician),
                            golden: store.goldenCount(for: musician)
                        )
                    }
                }
                if musician.reviews.isEmpty {
                    Text("Pas encore de note — sois le premier à jouer avec \(firstName) !")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(musician.reviews) { review in
                        HStack(alignment: .top, spacing: 10) {
                            AvatarView(name: review.author, size: 32, photo: store.photo(forName: review.author))
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(review.author).font(.caption.weight(.bold))
                                    reviewMark(review.appreciation)
                                }
                                Text(review.comment)
                                    .font(.caption)
                                    .foregroundStyle(.primary.opacity(0.85))
                            }
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(JC.inset, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func reviewMark(_ appreciation: Appreciation) -> some View {
        switch appreciation {
        case .golden:
            GoldenNoteView(size: 12)
        case .note:
            Image(systemName: "music.note")
                .font(.caption2.weight(.bold))
                .foregroundStyle(JC.violet)
        }
    }

    // MARK: - Grille de démos (bas de page, façon Instagram)

    /// Vitrine de tuiles fictives pour les profils de démo uniquement.
    /// Un vrai profil sans vidéos affiche un état vide honnête.
    private var demosGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Démos", systemImage: "play.square.stack")
            if musician.isDemo {
                let columns = [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)]
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(0..<demoCount, id: \.self) { index in
                        demoTile(index: index)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text("Aperçu de démonstration — lecture des vraies vidéos en phase 2.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else {
                Text("Pas encore de vidéo de démo sur ce profil.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
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
