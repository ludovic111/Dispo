import SwiftUI

struct ChatListView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        NavigationStack {
            ZStack {
                JC.bg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Messages 💬")
                                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                                Text("Cale tes prochains dépannages")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.top, 12)

                        if store.conversations.isEmpty {
                            JCCard {
                                VStack(spacing: 8) {
                                    Text("Aucune conversation")
                                        .font(.headline)
                                    Text("Contacte un musicien dispo depuis l'accueil 🚨")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity)
                            }
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
                            .buttonStyle(.plain)
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
