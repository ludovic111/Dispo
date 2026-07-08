import SwiftUI

struct ChatListView: View {
    @EnvironmentObject private var store: AppStore

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
                                            Text(conversation.contactInstrument.rawValue)
                                                .font(.caption2.weight(.bold))
                                                .foregroundStyle(JC.coral)
                                            if let last = conversation.lastMessage {
                                                Text((last.isFromMe ? "Toi : " : "") + last.text)
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
        }
    }
}
