import SwiftUI

// MARK: - Onglet Groupes

struct BandsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var genreFilter: Genre?

    private var filtered: [Band] {
        let list = genreFilter == nil
            ? store.bands
            : store.bands.filter { $0.genres.contains(genreFilter!) }
        return list.sorted {
            if $0.availability.urgencyRank != $1.availability.urgencyRank {
                return $0.availability.urgencyRank > $1.availability.urgencyRank
            }
            return $0.distance(from: AppStore.geneva) < $1.distance(from: AppStore.geneva)
        }
    }

    /// Groupes qui recrutent un musicien.
    private var recruiting: [Band] {
        store.bands.filter(\.isRecruiting)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 22) {
                        header
                        if !recruiting.isEmpty { recruitingRow }
                        genreChips
                        bandFeed
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Band.self) { BandDetailView(band: $0) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Groupes 🎸")
                .font(.system(size: 26, weight: .heavy, design: .rounded))
            Text("\(store.bands.count) formations actives à Genève")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 12)
    }

    private var recruitingRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("🔍 Recrutent en ce moment")
                    .font(.headline)
                Spacer()
                Text("\(recruiting.count)")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(JC.coral)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(recruiting) { band in
                        NavigationLink(value: band) {
                            recruitingChip(band)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
        }
    }

    private func recruitingChip(_ band: Band) -> some View {
        let genre = band.genres.first ?? .jazz
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                AvatarView(name: band.name, size: 44, photo: band.photo)
                VStack(alignment: .leading, spacing: 2) {
                    Text(band.name)
                        .font(.caption.weight(.bold))
                        .lineLimit(1)
                    Text("Cherche \(band.lookingFor.map(\.rawValue).joined(separator: ", "))")
                        .font(.system(size: 10))
                        .foregroundStyle(JC.coral)
                }
            }
            TagView(text: genre.emoji + " " + genre.rawValue, color: genre.color)
        }
        .padding(12)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(JC.coral.opacity(0.35), lineWidth: 1))
    }

    private var genreChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                genreChip(nil, label: "Tous")
                ForEach(Genre.allCases) { genre in
                    genreChip(genre, label: "\(genre.emoji) \(genre.rawValue)")
                }
            }
        }
    }

    private func genreChip(_ genre: Genre?, label: String) -> some View {
        let isSelected = genreFilter == genre
        return Button {
            withAnimation(.snappy) { genreFilter = genre }
        } label: {
            Text(label)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    isSelected ? JC.violet.opacity(0.2) : JC.card,
                    in: Capsule()
                )
                .overlay(Capsule().stroke(isSelected ? JC.violet.opacity(0.5) : JC.cardStroke, lineWidth: 1))
                .foregroundStyle(isSelected ? JC.violet : .primary)
        }
        .buttonStyle(PressableStyle(scale: 0.96))
    }

    private var bandFeed: some View {
        LazyVStack(spacing: 18) {
            SectionHeader(
                title: "Formations près de toi",
                subtitle: "Niveau d'expérience et notes de musique comme pour les solos"
            )
            if filtered.isEmpty {
                JCCard {
                    VStack(spacing: 8) {
                        Text("😶 Aucun groupe avec ce filtre")
                            .font(.headline)
                        Text("Essaie un autre style musical.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            ForEach(filtered) { band in
                NavigationLink(value: band) {
                    BandCard(band: band)
                }
                .buttonStyle(PressableStyle())
            }
        }
    }
}

// MARK: - Carte groupe (feed)

struct BandCard: View {
    @EnvironmentObject private var store: AppStore
    let band: Band

    private var mainGenre: Genre { band.genres.first ?? .jazz }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                GenreCover(genre: mainGenre)
                Image(systemName: "person.3.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.white.opacity(0.9))
                    .shadow(radius: 8)

                VStack {
                    HStack {
                        if band.isRecruiting {
                            TagView(text: "🔍 Recrute", color: JC.coral)
                        }
                        AvailabilityBadge(availability: band.availability)
                        Spacer()
                        Button {
                            store.toggleFavorite(band)
                        } label: {
                            Image(systemName: store.isFavorite(band) ? "heart.fill" : "heart")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(store.isFavorite(band) ? JC.magenta : .white)
                                .padding(9)
                                .background(.black.opacity(0.35), in: Circle())
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    HStack {
                        Label("\(band.memberCount) musiciens", systemImage: "person.3")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.45), in: Capsule())
                            .foregroundStyle(.white)
                        Spacer()
                    }
                }
                .padding(12)
            }
            .frame(height: 140)

            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 10) {
                    AvatarView(name: band.name, size: 42, photo: band.photo)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(band.name)
                            .font(.headline)
                        Text("\(band.memberCount) membres · \(band.level.rawValue)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        let notes = store.noteCount(for: band)
                        if notes == 0 {
                            Text("Nouveau")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.violet)
                        } else {
                            NoteRatingView(notes: notes, golden: store.goldenCount(for: band))
                            Text(notes > 1 ? "\(notes) notes" : "1 note")
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                HStack(spacing: 6) {
                    ForEach(band.genres.prefix(2)) { genre in
                        TagView(text: "\(genre.emoji) \(genre.rawValue)", color: genre.color)
                    }
                    if band.isRecruiting {
                        ForEach(band.lookingFor.prefix(1)) { instrument in
                            TagView(text: "Cherche \(instrument.rawValue)", color: JC.coral)
                        }
                    }
                }

                HStack {
                    Label(
                        String(format: "%.1f km · %@", band.distance(from: AppStore.geneva), band.neighborhood),
                        systemImage: "location.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Spacer()
                    Text("Voir le groupe")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.coral)
                }
            }
            .padding(14)
            .background(JC.card)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(JC.cardStroke, lineWidth: 1))
        .shadow(color: JC.cardShadow, radius: 16, x: 0, y: 10)
    }
}
