import SwiftUI

/// Recherche libre : musiciens (nom, @, instrument, genre, quartier, dispo)
/// et annonces SOS — en complément des filtres de l'accueil.
struct SearchView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""
    @FocusState private var focused: Bool

    private var results: AppStore.SearchResults { store.search(query) }
    private var hasQuery: Bool {
        !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ZStack {
            JCBackground()

            VStack(spacing: 0) {
                searchField
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        if !hasQuery {
                            hints
                        } else if results.isEmpty {
                            JCEmptyState(
                                icon: "magnifyingglass",
                                title: "Aucun résultat",
                                message: "Essaie un instrument (« pianiste »), un quartier, un genre ou un @pseudo."
                            )
                        } else {
                            if !results.musicians.isEmpty {
                                SectionHeader(title: "Musiciens", subtitle: "\(results.musicians.count) profils")
                                ForEach(results.musicians) { musician in
                                    NavigationLink(value: musician) {
                                        SearchMusicianRow(musician: musician)
                                    }
                                    .buttonStyle(PressableStyle())
                                }
                            }
                            if !results.gigs.isEmpty {
                                SectionHeader(title: "SOS dépannage", subtitle: "\(results.gigs.count) annonces")
                                ForEach(results.gigs) { gig in
                                    NavigationLink(value: gig) {
                                        EventCard(event: gig)
                                    }
                                    .buttonStyle(PressableStyle())
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.immediately)
            }
        }
        .navigationTitle("Recherche")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .onAppear { focused = true }
    }

    private var searchField: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            TextField("Musicien, @pseudo, instrument, lieu…", text: $query)
                .font(.subheadline)
                .focused($focused)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(JC.cardStroke, lineWidth: 1)
        )
    }

    /// Suggestions affichées avant la première frappe.
    private var hints: some View {
        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                Label("Cherche tout, librement", systemImage: "sparkle.magnifyingglass")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(JC.violet)
                Text("Combine ce que tu veux : instrument, quartier, genre, nom ou @pseudo.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 6) {
                    hintRow("pianiste Carouge")
                    hintRow("salsa ce soir")
                    hintRow("@marco")
                    hintRow("batteur jazz")
                }
            }
        }
    }

    private func hintRow(_ example: String) -> some View {
        Button {
            query = example
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.up.left")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.tertiary)
                Text(verbatim: "« \(example) »")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(JC.coral)
            }
        }
        .buttonStyle(PressableStyle())
    }
}

/// Ligne de résultat musicien : identité, @pseudo, instruments et abonnés.
struct SearchMusicianRow: View {
    @EnvironmentObject private var store: AppStore
    let musician: Musician

    var body: some View {
        JCCard(padding: 12) {
            HStack(spacing: 12) {
                AvatarView(name: musician.name, size: 48, photo: musician.photo)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(musician.name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        SocialLinkBadge(link: store.socialLink(with: musician.name))
                    }
                    if store.playedWithAFriend(musician) {
                        PlayedWithFriendCompactBadge(friends: store.friendsWhoPlayedWith(musician))
                    }
                    Text(verbatim: musician.handle)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(JC.violet)
                    Text(verbatim: "\(musician.instruments.map { store.tr($0.rawValue) }.joined(separator: " · ")) · \(musician.neighborhood)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text("\(store.followerCount(of: musician)) abonnés")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 6) {
                    AvailabilityBadge(availability: musician.availability)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }
}

/// Badge compact « a joué avec un ami » — appui long pour voir quels amis.
struct PlayedWithFriendCompactBadge: View {
    let friends: [Musician]

    private var friendNames: String {
        friends.map(\.name).joined(separator: ", ")
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 9, weight: .bold))
            Text("A joué avec un ami")
                .font(.caption2.weight(.bold))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(JC.coral.opacity(0.14), in: Capsule())
        .overlay(Capsule().stroke(JC.coral.opacity(0.35), lineWidth: 1))
        .foregroundStyle(JC.coral)
        .contextMenu {
            ForEach(friends) { friend in
                Label(friend.name, systemImage: "person.fill")
            }
        }
        .accessibilityLabel(Text("A joué avec un ami"))
        .accessibilityHint(Text(verbatim: friendNames))
        .help(friendNames)
    }
}

/// Badge détaillé sur le profil : « A joué avec Marco (ton ami) » / « +N ».
struct PlayedWithFriendDetailBadge: View {
    @EnvironmentObject private var store: AppStore
    let friends: [Musician]

    private var label: String {
        guard let first = friends.first else { return store.tr("A joué avec un ami") }
        let firstName = first.name.split(separator: " ").first.map(String.init) ?? first.name
        if friends.count > 1 {
            return String(
                format: store.tr("A joué avec %@ +%lld (ton ami)"),
                firstName,
                Int64(friends.count - 1)
            )
        }
        return String(format: store.tr("A joué avec %@ (ton ami)"), firstName)
    }

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 10, weight: .bold))
            Text(verbatim: label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(JC.coral.opacity(0.14), in: Capsule())
        .overlay(Capsule().stroke(JC.coral.opacity(0.35), lineWidth: 1))
        .foregroundStyle(JC.coral)
        .contextMenu {
            ForEach(friends) { friend in
                Label(friend.name, systemImage: "person.fill")
            }
        }
        .accessibilityLabel(Text(verbatim: label))
    }
}
