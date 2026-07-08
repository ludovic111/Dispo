import SwiftUI

struct BandDetailView: View {
    @EnvironmentObject private var store: AppStore
    let band: Band
    @State private var openedConversation: Conversation?

    private var mainGenre: Genre { band.genres.first ?? .jazz }
    private var gigsPlayed: Int { 8 + abs(band.name.stableHash) % 55 }
    private var followers: Int { 80 + abs(band.name.stableHash) % 420 }

    var body: some View {
        ZStack {
            JCBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    heroBanner
                    identity
                    statsRow
                    if band.isRecruiting { recruitingCard }
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
        .navigationTitle(band.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                Button {
                    store.toggleFavorite(band)
                } label: {
                    Image(systemName: store.isFavorite(band) ? "heart.fill" : "heart")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(store.isFavorite(band) ? JC.magenta : Color.primary)
                        .padding(15)
                        .background(JC.card, in: Circle())
                        .overlay(Circle().stroke(JC.cardStroke, lineWidth: 1))
                }
                .buttonStyle(PressableStyle())

                Button {
                    openedConversation = store.conversation(with: band)
                } label: {
                    Label(
                        band.isRecruiting ? "Postuler au groupe" : "Contacter le groupe",
                        systemImage: band.isRecruiting ? "person.badge.plus" : "bubble.left.fill"
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

    private var heroBanner: some View {
        ZStack {
            GenreCover(genre: mainGenre)
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            VStack(spacing: 8) {
                Image(systemName: "person.3.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.white)
                    .shadow(radius: 10)
                Text("\(band.memberCount) musiciens")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.95))
                if let year = band.foundedYear {
                    Text("Depuis \(year)")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .padding(.top, 8)
    }

    private var identity: some View {
        HStack(spacing: 14) {
            AvatarView(name: band.name, size: 62, photo: band.photo)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(band.name).font(.title3.weight(.heavy))
                    AvailabilityBadge(availability: band.availability)
                }
                Text("\(band.neighborhood) · \(String(format: "%.1f km", band.distance(from: AppStore.geneva)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            statBox(value: "\(gigsPlayed)", label: "concerts")
            statBox(value: store.noteCount(for: band) == 0 ? "—" : "\(store.noteCount(for: band))", label: "notes")
            statBox(value: "\(band.memberCount)", label: "membres")
            statBox(value: band.level.rawValue, label: "niveau", compact: true)
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
        .background(JC.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(JC.cardStroke, lineWidth: 1))
    }

    private var recruitingCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("Recrute en ce moment", systemImage: "person.badge.plus")
                Text("Ce groupe cherche à compléter sa formation :")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    ForEach(band.lookingFor) { instrument in
                        TagView(text: instrument.rawValue, color: JC.coral)
                    }
                }
            }
        }
    }

    private var genresCard: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Styles & niveau", systemImage: "music.quarternote.3")
                TagView(text: band.level.rawValue, color: .teal)
                ForEach(band.genres) { genre in
                    HStack(spacing: 6) {
                        Text("\(genre.emoji) \(genre.rawValue)")
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
                ForEach(band.repertoire, id: \.self) { piece in
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
                sectionTitle("À propos", systemImage: "person.3")
                Text(band.bio)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
            }
        }
    }

    private var rateCard: some View {
        let given = store.appreciation(for: band)
        return JCCard {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Tu as joué avec eux ?", systemImage: "hand.thumbsup.fill")
                Text("Laisse une note de musique au groupe — ou une note dorée si c'était un coup de cœur. Comme pour les musiciens solo, seul le positif compte.")
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
                store.setAppreciation(isSelected ? nil : appreciation, for: band)
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
                    if store.noteCount(for: band) > 0 {
                        NoteRatingView(
                            notes: store.noteCount(for: band),
                            golden: store.goldenCount(for: band)
                        )
                    }
                }
                if band.reviews.isEmpty {
                    Text("Pas encore de note — sois le premier à jouer avec \(band.name) !")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(band.reviews) { review in
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
