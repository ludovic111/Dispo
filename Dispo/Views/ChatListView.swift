import SwiftUI

/// Destinations de l'onglet Messages. Un enum dédié car Conversation.ID et
/// GroupChat.ID sont tous deux des UUID : sans lui, un seul
/// `navigationDestination(for: UUID.self)` gagnerait et l'autre lien casserait.
enum ChatRoute: Hashable {
    case conversation(Conversation.ID)
    case group(GroupChat.ID)
    case school(UUID)
}

struct ChatListView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showNewGroup = false
    @State private var segment: Segment = .conversations
    @State private var path = NavigationPath()

    /// Deux espaces bien séparés : mes conversations 1:1 et mes groupes.
    enum Segment: String, CaseIterable, Identifiable {
        case conversations = "Conversations"
        case groups = "Groupes"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                JCBackground()

                ScrollView {
                    VStack(spacing: 14) {
                        ScreenHeader(
                            title: "Messages",
                            subtitle: "Cale tes prochains dépannages",
                            icon: "bubble.left.and.bubble.right.fill",
                            iconColor: JC.bronze,
                            trailing: segment == .groups ? AnyView(newGroupButton) : nil
                        )

                        Picker("Espace", selection: $segment) {
                            ForEach(Segment.allCases) { segment in
                                Text(LocalizedStringKey(segment.rawValue)).tag(segment)
                            }
                        }
                        .pickerStyle(.segmented)

                        switch segment {
                        case .conversations: conversationsSection
                        case .groups: groupsSection
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: ChatRoute.self) { route in
                switch route {
                case .conversation(let id): ChatView(conversationID: id)
                case .group(let id): GroupChatView(groupID: id)
                case .school(let id): MusicSchoolCommunityView(schoolID: id)
                }
            }
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .sheet(isPresented: $showNewGroup) { NewGroupSheet() }
            .onAppear { openPendingSchoolIfNeeded() }
            .onChange(of: store.pendingSchoolCommunityID) { _, _ in
                openPendingSchoolIfNeeded()
            }
        }
    }

    /// Bouton « nouveau groupe » (verrouillé Premium pour la création).
    private var newGroupButton: some View {
        Button {
            if canCreateGroup {
                showNewGroup = true
            } else {
                store.showPaywall = true
            }
        } label: {
            Label("Nouveau", systemImage: canCreateGroup ? "plus.circle.fill" : "lock.fill")
                .font(.caption.weight(.bold))
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(JC.bronze.opacity(0.14), in: Capsule())
                .foregroundStyle(JC.bronze)
        }
        .buttonStyle(PressableStyle())
    }

    /// Le premier groupe dirigé est gratuit : il crée la boucle réseau. Les
    /// groupes supplémentaires deviennent un outil d'organisation Premium.
    private var canCreateGroup: Bool {
        store.canCreateGroup
    }

    private func openPendingSchoolIfNeeded() {
        guard let schoolID = store.pendingSchoolCommunityID else { return }
        segment = .groups
        path.append(ChatRoute.school(schoolID))
        store.pendingSchoolCommunityID = nil
    }

    // MARK: - Conversations 1:1

    @ViewBuilder
    private var conversationsSection: some View {
        if store.conversations.isEmpty {
            JCEmptyState(
                icon: "bubble.left.and.bubble.right",
                title: "Aucune conversation",
                message: "Contacte un musicien dispo depuis l'accueil pour organiser un dépannage."
            )
        }

        ForEach(store.conversations) { conversation in
            let unread = store.unreadCount(in: conversation)
            NavigationLink(value: ChatRoute.conversation(conversation.id)) {
                JCCard(padding: 13) {
                    HStack(spacing: 12) {
                        AvatarView(
                            name: conversation.contactName,
                            size: 50,
                            photo: conversation.contactPhotoURL
                                ?? store.photo(forName: conversation.contactName)
                        )
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(conversation.contactName)
                                    .font(.subheadline.weight(unread > 0 ? .heavy : .bold))
                                if store.isDemoContact(conversation.contactName) {
                                    DemoAccountBadge()
                                }
                                Spacer()
                                if let last = conversation.lastMessage {
                                    Text(last.date.formatted(.relative(presentation: .named)))
                                        .font(.caption2)
                                        .foregroundStyle(unread > 0 ? JC.laiton : .secondary)
                                }
                            }
                            Text(LocalizedStringKey(conversation.contactInstrument.rawValue))
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.laiton)
                            if let last = conversation.lastMessage {
                                let preview = last.deletedAt != nil
                                    ? store.tr("Message supprimé")
                                    : (!last.text.isEmpty
                                        ? last.text
                                        : (last.attachment?.notificationLabel ?? store.tr("Fichier")))
                                Text((last.isFromMe ? store.tr("Toi : ") : "") + preview)
                                    .font(.caption.weight(unread > 0 ? .semibold : .regular))
                                    .foregroundStyle(unread > 0 ? .primary : .secondary)
                                    .lineLimit(1)
                            }
                        }
                        UnreadDot(count: unread)
                    }
                }
            }
            .buttonStyle(PressableStyle())
        }
    }

    // MARK: - Groupes

    /// Groupes : rejoindre et diriger son premier groupe restent gratuits ;
    /// Premium débloque les groupes dirigés supplémentaires.
    @ViewBuilder
    private var groupsSection: some View {
        if !store.myMusicSchoolCommunities.isEmpty {
            schoolCommunitiesSection
        }

        // Invitations reçues — accepter ou refuser avant d'entrer.
        ForEach(store.myGroupInvitations) { invitation in
            GroupInvitationCard(invitation: invitation)
        }

        if store.groups.isEmpty
            && store.myGroupInvitations.isEmpty
            && store.myMusicSchoolCommunities.isEmpty {
            if canCreateGroup {
                JCEmptyState(
                    icon: "person.3.sequence.fill",
                    title: "Ton collectif commence ici",
                    message: "Ajoute ton école ou crée ton premier groupe : messages, membres et prochaines dates seront réunis ici.",
                    iconColor: JC.bronze
                )
            } else {
                JCPromoBanner(
                    icon: "person.3.fill",
                    title: "Crée ton groupe",
                    subtitle: "Ton premier groupe est gratuit — Premium sert à en diriger plusieurs"
                ) { store.showPaywall = true }
            }
        }

        ForEach(store.groups) { group in
            let unread = store.unreadCount(in: group)
            NavigationLink(value: ChatRoute.group(group.id)) {
                JCCard(padding: 13) {
                    HStack(spacing: 12) {
                        GroupAvatarView(group: group, size: 50)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(group.name)
                                    .font(.subheadline.weight(unread > 0 ? .heavy : .bold))
                                    .lineLimit(1)
                                if group.isPublic == true {
                                    TagView(text: "Public", color: JC.feutrine)
                                }
                                Spacer()
                                if let last = group.lastMessage {
                                    Text(last.date.formatted(.relative(presentation: .named)))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Text(
                                String(
                                    format: store.tr("%lld membres · %lld morceaux · %lld événements"),
                                    Int64(group.memberNames.count + 1),
                                    Int64(group.approvedSongs.count),
                                    Int64(group.upcomingEvents.count)
                                )
                            )
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.bronze)
                                .lineLimit(1)
                            if let last = group.lastMessage {
                                let preview = last.deletedAt != nil
                                    ? store.tr("Message supprimé")
                                    : (!last.text.isEmpty
                                        ? last.text
                                        : (last.attachment?.notificationLabel ?? store.tr("Fichier")))
                                Text((last.isFromMe ? store.tr("Toi : ") : "\(last.sender) : ") + preview)
                                    .font(.caption.weight(unread > 0 ? .semibold : .regular))
                                    .foregroundStyle(unread > 0 ? .primary : .secondary)
                                    .lineLimit(1)
                            }
                        }
                        UnreadDot(count: unread)
                    }
                }
            }
            .buttonStyle(PressableStyle())
        }
    }

    private var schoolCommunitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Écoles")
                    .font(.caption2.weight(.heavy))
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(.secondary)
                Spacer()
                NavigationLink {
                    MusicSchoolDirectoryView()
                } label: {
                    Label("Ajouter", systemImage: "plus")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.bronze)
                }
            }
            ForEach(store.myMusicSchoolCommunities) { community in
                let unread = store.unreadCount(in: community)
                NavigationLink(value: ChatRoute.school(community.school.id)) {
                    JCCard(padding: 13) {
                        HStack(spacing: 12) {
                            MusicSchoolAvatar(school: community.school, size: 50)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(community.school.displayName)
                                        .font(.subheadline.weight(unread > 0 ? .heavy : .bold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    if community.school.isVerified {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.caption2)
                                            .foregroundStyle(JC.feutrine)
                                    }
                                    Spacer(minLength: 0)
                                    if let last = community.messages.last {
                                        Text(last.createdAt.formatted(.relative(presentation: .named)))
                                            .font(.caption2)
                                            .foregroundStyle(unread > 0 ? JC.laiton : .secondary)
                                    }
                                }
                                Text(
                                    String(
                                        format: store.tr("%lld membres · %@"),
                                        Int64(community.memberCount),
                                        localizedRole(community.affiliation)
                                    )
                                )
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(JC.bronze)
                                    .lineLimit(1)
                                if let last = community.messages.last {
                                    Text(
                                        last.isDeleted
                                            ? store.tr("Message supprimé")
                                            : "\(last.senderName ?? store.tr("Membre")) : \(last.text)"
                                    )
                                    .font(.caption)
                                    .fontWeight(unread > 0 ? .semibold : .regular)
                                    .foregroundStyle(unread > 0 ? .primary : .secondary)
                                    .lineLimit(1)
                                } else {
                                    Text("Présente-toi à la communauté")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            UnreadDot(count: unread)
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    private func localizedRole(_ affiliation: MusicSchoolAffiliation) -> String {
        let custom = affiliation.roleLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return custom.isEmpty ? store.tr(affiliation.role.label) : custom
    }
}

/// La puce « pas encore lu » : une pastille laiton avec le nombre de
/// messages en attente. Invisible quand tout est lu.
struct UnreadDot: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(verbatim: count > 99 ? "99+" : "\(count)")
                .font(JCFont.monoBold(11))
                .foregroundStyle(JC.billetInk)
                .frame(minWidth: 22, minHeight: 22)
                .padding(.horizontal, count > 9 ? 5 : 0)
                .background(JC.hero, in: Capsule())
                .accessibilityLabel(Text("\(count) messages non lus"))
        }
    }
}

/// Avatar d'un groupe : sa photo si le leader en a mis une, sinon l'emoji.
struct GroupAvatarView: View {
    let group: GroupChat
    var size: CGFloat = 50

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
                .font(size >= 50 ? .title3 : .body)
        }
    }
}

// MARK: - Invitation à un groupe

/// Carte d'invitation reçue : le groupe, qui invite, et deux boutons —
/// accepter ou refuser. On n'entre jamais dans un groupe sans dire oui.
struct GroupInvitationCard: View {
    @EnvironmentObject private var store: AppStore
    let invitation: GroupInvitation

    var body: some View {
        JCCard(padding: 13) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    if let photo = invitation.groupPhotoURL, let url = URL(string: photo) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            emojiCircle
                        }
                        .frame(width: 50, height: 50)
                        .clipShape(Circle())
                    } else {
                        emojiCircle
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(invitation.groupName)
                                .font(.subheadline.weight(.bold))
                                .lineLimit(1)
                            TagView(text: "Invitation", color: JC.laiton)
                            if invitation.kind == .specialGuest {
                                Text(verbatim: "🌠")
                                    .accessibilityLabel(Text("Special guest"))
                            }
                        }
                        Text(String(format: store.tr("%@ t'invite à rejoindre ce groupe"), invitation.invitedByName))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                        if invitation.kind == .specialGuest {
                            Text(verbatim: "🌠 Special guest · membre temporaire")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.bronze)
                        }
                    }
                    Spacer(minLength: 0)
                }
                HStack(spacing: 8) {
                    Button {
                        store.acceptGroupInvitation(invitation)
                    } label: {
                        Label("Accepter", systemImage: "checkmark")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(AnyShapeStyle(JC.hero), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .foregroundStyle(JC.billetInk)
                    }
                    .buttonStyle(PressableStyle())

                    Button {
                        store.declineGroupInvitation(invitation)
                    } label: {
                        Text("Refuser")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(JC.card, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 11, style: .continuous)
                                    .stroke(JC.cardStroke, lineWidth: 1)
                            )
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }

    private var emojiCircle: some View {
        ZStack {
            Circle()
                .fill(JC.laiton.opacity(0.15))
                .frame(width: 50, height: 50)
            Text(invitation.groupEmoji)
                .font(.title3)
        }
    }
}
