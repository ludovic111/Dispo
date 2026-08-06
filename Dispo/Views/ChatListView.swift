import SwiftUI

/// Destinations de l'onglet Messages. Un enum dédié car Conversation.ID et
/// GroupChat.ID sont tous deux des UUID : sans lui, un seul
/// `navigationDestination(for: UUID.self)` gagnerait et l'autre lien casserait.
enum ChatRoute: Hashable {
    case conversation(Conversation.ID)
    case group(GroupChat.ID)
}

struct ChatListView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showNewGroup = false
    @State private var segment: Segment = .conversations

    /// Deux espaces bien séparés : mes conversations 1:1 et mes groupes.
    enum Segment: String, CaseIterable, Identifiable {
        case conversations = "Conversations"
        case groups = "Groupes"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
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
                }
            }
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .sheet(isPresented: $showNewGroup) { NewGroupSheet() }
        }
    }

    /// Bouton « nouveau groupe » (verrouillé Premium pour la création).
    private var newGroupButton: some View {
        Button {
            if store.isPremium {
                showNewGroup = true
            } else {
                store.showPaywall = true
            }
        } label: {
            Label("Nouveau", systemImage: store.isPremium ? "plus.circle.fill" : "lock.fill")
                .font(.caption.weight(.bold))
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(JC.bronze.opacity(0.14), in: Capsule())
                .foregroundStyle(JC.bronze)
        }
        .buttonStyle(PressableStyle())
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
                        AvatarView(name: conversation.contactName, size: 50, photo: store.photo(forName: conversation.contactName))
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
                                Text((last.isFromMe ? store.tr("Toi : ") : "") + last.text)
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

    /// Groupes : rejoindre est gratuit, créer et diriger est Premium.
    @ViewBuilder
    private var groupsSection: some View {
        // Invitations reçues — accepter ou refuser avant d'entrer.
        ForEach(store.myGroupInvitations) { invitation in
            GroupInvitationCard(invitation: invitation)
        }

        if store.groups.isEmpty && store.myGroupInvitations.isEmpty {
            if store.isPremium {
                JCEmptyState(
                    icon: "person.3.fill",
                    title: "Aucun groupe",
                    message: "Réunis ton groupe : messages, partitions et agenda des concerts au même endroit.",
                    iconColor: JC.bronze
                )
            } else {
                JCPromoBanner(
                    icon: "person.3.fill",
                    title: "Crée ton groupe",
                    subtitle: "Rejoindre est gratuit — créer et diriger un groupe est Premium"
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
                            Text("\(group.memberNames.count + 1) membres · \(group.approvedSongs.count) morceaux · \(group.upcomingEvents.count) événements")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.bronze)
                                .lineLimit(1)
                            if let last = group.lastMessage {
                                Text((last.isFromMe ? store.tr("Toi : ") : "\(last.sender) : ") + last.text)
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
                        }
                        Text(String(format: store.tr("%@ t'invite à rejoindre ce groupe"), invitation.invitedByName))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
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
