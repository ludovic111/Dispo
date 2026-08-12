import SwiftUI
import UniformTypeIdentifiers

struct ChatView: View {
    @EnvironmentObject private var store: AppStore
    let conversationID: Conversation.ID
    @State private var draft = ""
    @State private var outgoingAttachment: OutgoingMessageAttachment?
    @State private var importingAttachment = false
    @State private var previewingAttachment: MessageAttachmentPreview?
    @State private var downloadingAttachmentID: String?

    private var conversation: Conversation? {
        store.conversations.first(where: { $0.id == conversationID })
    }

    private var isContactTyping: Bool {
        store.typingConversationIDs.contains(conversationID)
    }

    var body: some View {
        ZStack {
            JCBackground()

            VStack(spacing: 0) {
                if let name = conversation?.contactName, store.isDemoContact(name) {
                    HStack(spacing: 7) {
                        DemoAccountBadge()
                        Text("Compte de démonstration · les réponses peuvent être automatiques")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(JC.bronze.opacity(0.08))
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(conversation?.messages ?? []) { message in
                                MessageBubble(
                                    message: message,
                                    isAttachmentLoading: downloadingAttachmentID == message.attachment?.id,
                                    onOpenAttachment: openAttachment
                                )
                                    .id(message.id)
                            }
                            if isContactTyping {
                                TypingBubble()
                                    .id("typing")
                                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                            }
                        }
                        .padding()
                    }
                    .onChange(of: conversation?.messages.count) {
                        if let lastID = conversation?.messages.last?.id {
                            withAnimation { proxy.scrollTo(lastID, anchor: .bottom) }
                        }
                    }
                    .onChange(of: isContactTyping) {
                        if isContactTyping {
                            withAnimation { proxy.scrollTo("typing", anchor: .bottom) }
                        }
                    }
                    .onAppear {
                        // Différé d'un cycle : la LazyVStack n'a pas encore
                        // posé ses bulles au moment du onAppear.
                        DispatchQueue.main.async {
                            if let lastID = conversation?.messages.last?.id {
                                proxy.scrollTo(lastID, anchor: .bottom)
                            }
                        }
                    }
                }

                VStack(spacing: 8) {
                    if let outgoingAttachment {
                        MessageAttachmentDraftChip(attachment: outgoingAttachment) {
                            self.outgoingAttachment = nil
                        }
                    }
                    HStack(spacing: 10) {
                        Button { importingAttachment = true } label: {
                            Image(systemName: "paperclip")
                                .font(.body.weight(.bold))
                                .foregroundStyle(JC.electric)
                                .frame(width: 36, height: 36)
                                .background(JC.card, in: Circle())
                        }
                        .buttonStyle(PressableStyle())
                        .disabled(store.messageAttachmentUploadInProgress)
                        .accessibilityLabel(Text("Joindre un fichier"))

                        TextField("Ton message…", text: $draft, axis: .vertical)
                            .onChange(of: draft) {
                                if !draft.isEmpty { store.userIsTyping(in: conversationID) }
                            }
                            .lineLimit(1...4)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(JC.card, in: RoundedRectangle(cornerRadius: 20))
                            .overlay(RoundedRectangle(cornerRadius: 20).stroke(JC.cardStroke, lineWidth: 1))
                        Button { send() } label: {
                            Group {
                                if store.messageAttachmentUploadInProgress {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Image(systemName: "arrow.up.circle.fill")
                                        .font(.system(size: 34))
                                }
                            }
                            .foregroundStyle(canSend ? AnyShapeStyle(JC.hero) : AnyShapeStyle(Color.gray))
                        }
                        .disabled(!canSend || store.messageAttachmentUploadInProgress)
                    }
                }
                .padding()
                .background(.ultraThinMaterial)
            }
        }
        .navigationTitle(conversation?.contactName ?? store.tr("Conversation"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .toolbar {
            // Le nom en titre ouvre la fiche du musicien — un tap.
            if let conversation, let musician = store.musician(for: conversation) {
                ToolbarItem(placement: .principal) {
                    NavigationLink(value: musician) {
                        HStack(spacing: 8) {
                            AvatarView(name: musician.name, size: 28, photo: musician.photo)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(musician.name)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                Text("Voir le profil")
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(Text("Voir le profil"))
                }
            }
        }
        .onAppear { store.chatOpened(conversationID) }
        .onDisappear { store.chatClosed(conversationID) }
        .fileImporter(
            isPresented: $importingAttachment,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            do {
                outgoingAttachment = try OutgoingMessageAttachment.load(from: url)
            } catch OutgoingMessageAttachment.ImportError.tooLarge {
                store.backendError = store.tr("Fichier trop lourd — 20 Mo maximum.")
            } catch {
                store.backendError = store.tr("Le fichier n'a pas pu être importé.")
            }
        }
        .sheet(item: $previewingAttachment) { preview in
            NavigationStack {
                DocPreview(url: preview.url)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(preview.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("OK") { previewingAttachment = nil }.font(.headline)
                        }
                    }
            }
        }
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || outgoingAttachment != nil
    }

    private func send() {
        guard let conversation else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || outgoingAttachment != nil else { return }
        let attachment = outgoingAttachment
        draft = ""
        outgoingAttachment = nil
        store.sendMessage(text, attachment: attachment, in: conversation)
    }

    private func openAttachment(_ attachment: MessageAttachment) {
        guard downloadingAttachmentID == nil else { return }
        downloadingAttachmentID = attachment.id
        Task {
            defer { downloadingAttachmentID = nil }
            if let url = await store.localURL(for: attachment) {
                previewingAttachment = MessageAttachmentPreview(
                    title: attachment.fileName,
                    url: url
                )
            }
        }
    }
}

struct MessageBubble: View {
    let message: Message
    var isAttachmentLoading = false
    var onOpenAttachment: ((MessageAttachment) -> Void)? = nil

    var body: some View {
        HStack {
            if message.isFromMe { Spacer(minLength: 56) }
            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 3) {
                VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 6) {
                    if let attachment = message.attachment {
                        MessageAttachmentCard(
                            attachment: attachment,
                            isLoading: isAttachmentLoading
                        ) { onOpenAttachment?(attachment) }
                    }
                    if !message.text.isEmpty {
                        Text(message.text).font(.subheadline)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    message.isFromMe
                        ? AnyShapeStyle(JC.hero)
                        : AnyShapeStyle(JC.card),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(message.isFromMe ? .clear : JC.cardStroke, lineWidth: 1)
                )
                .foregroundStyle(message.isFromMe ? JC.billetInk : Color.primary)
                HStack(spacing: 4) {
                    Text(message.date.formatted(date: .omitted, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    if message.isFromMe {
                        ReceiptChecks(receipt: message.receipt)
                    }
                }
            }
            if !message.isFromMe { Spacer(minLength: 56) }
        }
    }
}

/// Coches façon WhatsApp : ✓ envoyé, ✓✓ reçu, ✓✓ bleues lu.
struct ReceiptChecks: View {
    let receipt: Message.Receipt

    var body: some View {
        ZStack(alignment: .leading) {
            Image(systemName: "checkmark")
            if receipt != .sent {
                Image(systemName: "checkmark").offset(x: 4.5)
            }
        }
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(receipt == .read ? AnyShapeStyle(JC.laiton) : AnyShapeStyle(.tertiary))
        .padding(.trailing, receipt == .sent ? 0 : 4.5)
        .animation(.easeInOut(duration: 0.2), value: receipt)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: Text {
        switch receipt {
        case .sent: Text("Envoyé")
        case .delivered: Text("Reçu")
        case .read: Text("Lu")
        }
    }
}

/// Bulle « … » animée quand le contact est en train d'écrire.
struct TypingBubble: View {
    @State private var phase = 0

    var body: some View {
        HStack {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { dot in
                    Circle()
                        .frame(width: 7, height: 7)
                        .foregroundStyle(.secondary)
                        .opacity(phase == dot ? 1 : 0.35)
                        .offset(y: phase == dot ? -2 : 0)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(JC.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(JC.cardStroke, lineWidth: 1)
            )
            .accessibilityLabel(Text("En train d'écrire…"))
            Spacer(minLength: 56)
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(320))
                withAnimation(.easeInOut(duration: 0.25)) { phase = (phase + 1) % 3 }
            }
        }
    }
}
