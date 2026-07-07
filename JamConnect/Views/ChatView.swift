import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var store: AppStore
    let conversationID: Conversation.ID
    @State private var draft = ""

    private var conversation: Conversation? {
        store.conversations.first(where: { $0.id == conversationID })
    }

    var body: some View {
        ZStack {
            JC.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(conversation?.messages ?? []) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: conversation?.messages.count) {
                        if let lastID = conversation?.messages.last?.id {
                            withAnimation { proxy.scrollTo(lastID, anchor: .bottom) }
                        }
                    }
                    .onAppear {
                        if let lastID = conversation?.messages.last?.id {
                            proxy.scrollTo(lastID, anchor: .bottom)
                        }
                    }
                }

                HStack(spacing: 10) {
                    TextField("Ton message…", text: $draft, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(JC.cardStroke, lineWidth: 1))
                    Button {
                        send()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(
                                draft.trimmingCharacters(in: .whitespaces).isEmpty
                                    ? AnyShapeStyle(Color.gray)
                                    : AnyShapeStyle(JC.hero)
                            )
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding()
                .background(.ultraThinMaterial)
            }
        }
        .navigationTitle(conversation?.contactName ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
    }

    private func send() {
        guard let conversation else { return }
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        draft = ""
        store.sendMessage(text, in: conversation)
    }
}

struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.isFromMe { Spacer(minLength: 50) }
            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 2) {
                Text(message.text)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        message.isFromMe
                            ? AnyShapeStyle(JC.hero)
                            : AnyShapeStyle(JC.card),
                        in: RoundedRectangle(cornerRadius: 19)
                    )
                    .foregroundStyle(.white)
                Text(message.date.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            if !message.isFromMe { Spacer(minLength: 50) }
        }
    }
}
