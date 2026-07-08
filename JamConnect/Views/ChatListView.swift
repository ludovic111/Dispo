import SwiftUI

struct ChatListView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showNewGroup = false

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
                            iconColor: JC.violet
                        )

                        groupsSection

                        if store.conversations.isEmpty {
                            JCEmptyState(
                                icon: "bubble.left.and.bubble.right",
                                title: "Aucune conversation",
                                message: "Contacte un musicien dispo depuis l'accueil pour organiser un dépannage."
                            )
                        }

                        ForEach(store.conversations) { conversation in
                            NavigationLink(value: conversation.id) {
                                JCCard(padding: 13) {
                                    HStack(spacing: 12) {
                                        AvatarView(name: conversation.contactName, size: 50, photo: store.photo(forName: conversation.contactName))
                                        VStack(alignment: .leading, spacing: 3) {
                                            HStack {
                                                Text(conversation.contactName)
                                                    .font(.subheadline.weight(.bold))
                                                Spacer()
                                                if let last = conversation.lastMessage {
                                                    Text(last.date.formatted(.relative(presentation: .named)))
                                                        .font(.caption2)
                                                        .foregroundStyle(.secondary)
                                                }
                                            }
                                            Text(LocalizedStringKey(conversation.contactInstrument.rawValue))
                                                .font(.caption2.weight(.bold))
                                                .foregroundStyle(JC.coral)
                                            if let last = conversation.lastMessage {
                                                Text((last.isFromMe ? store.tr("Toi : ") : "") + last.text)
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                                    .lineLimit(1)
                                            }
                                        }
                                    }
                                }
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Conversation.ID.self) { ChatView(conversationID: $0) }
            .navigationDestination(for: GroupChat.ID.self) { GroupChatView(groupID: $0) }
            .sheet(isPresented: $showNewGroup) { NewGroupSheet() }
        }
    }

    /// Groupes Premium : messages d'équipe, partitions, dates de concert.
    @ViewBuilder
    private var groupsSection: some View {
        if store.groups.isEmpty && !store.showsPremium {
            // Teaser pour les comptes gratuits — la porte d'entrée Premium.
            JCPromoBanner(
                icon: "person.3.fill",
                title: "Crée ton groupe",
                subtitle: "Messages d'équipe, partitions partagées, dates de concert — avec Premium"
            ) { store.showPaywall = true }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    SectionHeader(title: "Groupes")
                    Spacer()
                    Button {
                        if store.showsPremium {
                            showNewGroup = true
                        } else {
                            store.showPaywall = true
                        }
                    } label: {
                        Label("Nouveau", systemImage: store.showsPremium ? "plus.circle.fill" : "lock.fill")
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(JC.violet.opacity(0.14), in: Capsule())
                            .foregroundStyle(JC.violet)
                    }
                    .buttonStyle(PressableStyle())
                }

                ForEach(store.groups) { group in
                    NavigationLink(value: group.id) {
                        JCCard(padding: 13) {
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle()
                                        .fill(JC.violet.opacity(0.15))
                                        .frame(width: 50, height: 50)
                                    Text(group.emoji)
                                        .font(.title3)
                                }
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(group.name)
                                            .font(.subheadline.weight(.bold))
                                            .lineLimit(1)
                                        Spacer()
                                        if let last = group.lastMessage {
                                            Text(last.date.formatted(.relative(presentation: .named)))
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Text("\(group.memberNames.count + 1) membres · \(group.docs.count) partitions · \(group.upcomingConcerts.count) concerts")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(JC.violet)
                                        .lineLimit(1)
                                    if let last = group.lastMessage {
                                        Text((last.isFromMe ? store.tr("Toi : ") : "\(last.sender) : ") + last.text)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                    .buttonStyle(PressableStyle())
                }

                if store.groups.isEmpty {
                    Text("Réunis ton groupe : messages, partitions et agenda des concerts au même endroit.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                SectionHeader(title: "Conversations")
                    .padding(.top, 4)
            }
        }
    }
}
