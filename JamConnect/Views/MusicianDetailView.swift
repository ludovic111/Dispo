import SwiftUI

struct MusicianDetailView: View {
    @EnvironmentObject private var store: AppStore
    let musician: Musician
    @State private var openedConversation: Conversation?

    private var mainGenre: Genre { musician.genres.first ?? .jazz }
    /// Stats sociales fictives, stables entre lancements.
    private var followers: Int { 40 + abs(musician.name.stableHash) % 320 }
    private var jamsPlayed: Int { 3 + abs(musician.name.stableHash) % 40 }

    /// Durée fictive de la vidéo (60–90 s) — la même que sur la carte du feed.
    private var videoDuration: String {
        let seconds = 60 + abs(musician.name.stableHash) % 31
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    videoHero
                    identity
                    statsRow
                    genresCard
                    repertoireCard
                    bioCard
                    rateCard
                    reviewsCard
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 90)
            }
        }
        .navigationTitle(musician.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                Button {
                    store.toggleFavorite(musician)
                } label: {
                    Image(systemName: store.isFavorite(musician) ? "heart.fill" : "heart")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(store.isFavorite(musician) ? JC.magenta : Color.primary)
                        .padding(15)
                        .background(JC.card, in: Circle())
                        .overlay(Circle().stroke(JC.cardStroke, lineWidth: 1))
                }
                .buttonStyle(PressableStyle())

                Button {
                    openedConversation = store.conversation(with: musician)
                } label: {
                    Label(
                        musician.isAvailable ? "Demander un dépannage" : "Contacter",
                        systemImage: musician.isAvailable ? "bolt.fill" : "bubble.left.fill"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(JC.hero, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(.white)
                }
                .buttonStyle(PressableStyle())
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
        }
        .sheet(item: $openedConversation) { conversation in
            NavigationStack {
                ChatView(conversationID: conversation.id)
            }
        }
    }

    private var videoHero: some View {
        ZStack {
            GenreCover(genre: mainGenre)
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: 26))
            VStack(spacing: 10) {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 58))
                    .foregroundStyle(.white)
                    .shadow(radius: 10)
                Text("Vidéo de présentation · \(videoDuration)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.95))
                Text("Lecteur réel en phase 2")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
        .padding(.top, 8)
    }

    private var identity: some View {
        HStack(spacing: 14) {
            AvatarView(name: musician.name, size: 62, photo: musician.photo)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(musician.name).font(.title3.weight(.heavy))
                    AvailabilityBadge(availability: musician.availability)
                }
                Text("\(musician.age) ans · \(musician.neighborhood) · \(String(format: "%.1f km", musician.distance(from: AppStore.geneva)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            statBox(value: "\(jamsPlayed)", label: "concerts")
            statBox(value: store.noteCount(for: musician) == 0 ? "—" : "\(store.noteCount(for: musician))", label: "notes")
            statBox(value: "\(followers)", label: "abonnés")
            statBox(value: musician.level.rawValue, label: "niveau", compact: true)
        }
    }

    private func statBox(value: String, label: String, compact: Bool = false) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(compact ? .caption.weight(.heavy) : .headline.weight(.heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(JC.cardStroke, lineWidth: 1))
    }

    private var genresCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Instruments & styles", systemImage: "music.quarternote.3")
                HStack(spacing: 6) {
                    ForEach(musician.instruments) { instrument in
                        TagView(text: instrument.rawValue, color: .teal)
                    }
                }
                ForEach(musician.genres) { genre in
                    HStack(spacing: 6) {
                        Text(genre.rawValue)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(genre.color)
                        ForEach(genre.codes, id: \.self) { code in
                            TagView(text: code, color: genre.color)
                        }
                        Spacer()
                    }
                }
            }
        }
    }

    private var repertoireCard: some View {
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

    private var bioCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 8) {
                sectionTitle("À propos", systemImage: "person.text.rectangle")
                Text(musician.bio)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
            }
        }
    }

    private var firstName: String {
        musician.name.split(separator: " ").first.map(String.init) ?? musician.name
    }

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

    private func sectionTitle(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.heavy))
            .foregroundStyle(JC.coral)
    }
}
