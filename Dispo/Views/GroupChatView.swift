import SwiftUI
import QuickLook
import UniformTypeIdentifiers
import PhotosUI
import UIKit

// MARK: - Aperçu de document (partitions PDF / images)

/// Aperçu natif QuickLook d'un fichier local (partition, setlist…).
struct DocPreview: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}

// MARK: - Groupe de musique

/// La page d'un groupe : messages, répertoire (validé par le leader),
/// événements avec setlist, partitions. Le leader gère les membres.
struct GroupChatView: View {
    @EnvironmentObject private var store: AppStore
    let groupID: GroupChat.ID

    /// Trois onglets seulement : les partitions ne sont plus un rayon à part,
    /// elles vivent sous leur morceau, dans le répertoire — c'est là qu'on
    /// les cherche quand on répète.
    enum Tab: String, CaseIterable, Identifiable {
        case messages = "Messages"
        case repertoire = "Répertoire"
        case events = "Événements"
        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .messages: return "bubble.left.and.bubble.right.fill"
            case .repertoire: return "music.note.list"
            case .events: return "calendar.badge.clock"
            }
        }
    }

    @State private var tab: Tab = .messages
    /// Ouvre directement sur un onglet donné (l'agenda arrive sur les dates).
    init(groupID: GroupChat.ID, initialTab: Tab = .messages) {
        self.groupID = groupID
        _tab = State(initialValue: initialTab)
    }

    @State private var draft = ""
    @State private var outgoingMessageAttachment: OutgoingMessageAttachment?
    @State private var importingMessageAttachment = false
    @State private var messageMediaItem: PhotosPickerItem?
    @State private var preparingMessageMedia = false
    @State private var previewingMessageAttachment: MessageAttachmentPreview?
    @State private var downloadingMessageAttachmentID: String?
    @State private var editingGroupMessage: GroupMessage?
    @State private var deletingGroupMessage: GroupMessage?
    @State private var sendingGroupMessage = false
    /// Recherche dans le répertoire (apparaît au-delà de 8 morceaux).
    @State private var songQuery = ""
    /// Ordre local pendant le glisser-déposer. La persistance ne part qu'au
    /// lâcher du doigt pour éviter des écritures réseau concurrentes.
    @State private var repertoireOrder: [Song.ID] = []
    @State private var repertoireDragSession = OrderedUUIDDragSession()
    @State private var repertoireRowFrames: [UUID: CGRect] = [:]
    @State private var repertoireViewportHeight: CGFloat = 0
    /// Document prêt à être affiché (fichier local ou copie téléchargée).
    @State private var previewingDoc: PreviewableDoc?
    /// Document en cours de téléchargement (spinner sur sa ligne).
    @State private var downloadingDocID: GroupDoc.ID?
    @State private var importingDoc = false
    @State private var addingEvent = false
    @State private var addingSong = false
    @State private var selectedEvent: GroupEvent?
    @State private var showMembers = false
    @State private var showDeleteConfirm = false
    @State private var showGroupSettings = false
    @Environment(\.dismiss) private var dismiss

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }

    /// Le leader garde toujours les commandes de son groupe. Premium ouvre
    /// des outils avancés, il ne rend jamais un groupe existant inutilisable.
    private var isLeader: Bool {
        group.map { store.canLead($0) } ?? false
    }

    var body: some View {
        ZStack {
            JCBackground()
            if let group {
                VStack(spacing: 0) {
                    groupHeader(group)
                    tabPicker
                    switch tab {
                    case .messages: messagesTab(group)
                    case .repertoire: repertoireTab(group)
                    case .events: eventsTab(group)
                    }
                }
            }
        }
        .navigationTitle("\(group?.emoji ?? "🎶") \(group?.name ?? "")")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showMembers = true } label: {
                    Image(systemName: "person.3.fill")
                        .font(.caption)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if isLeader {
                    Menu {
                        Button {
                            showGroupSettings = true
                        } label: {
                            Label("Réglages du groupe", systemImage: "gearshape")
                        }
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("Supprimer le groupe", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .onAppear {
            if let group { repertoireOrder = group.approvedSongs.map(\.id) }
        }
        .onChange(of: group?.approvedSongs.map(\.id) ?? []) { _, ids in
            guard repertoireDragSession.draggingID == nil else { return }
            repertoireOrder = ids
        }
        .sheet(isPresented: $showGroupSettings) {
            if let group {
                GroupSettingsSheet(groupID: group.id)
                    .presentationDetents([.medium])
            }
        }
        .confirmationDialog(
            "Supprimer ce groupe (messages, répertoire, événements, partitions) ?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Supprimer", role: .destructive) {
                if let group { store.deleteGroup(group) }
                dismiss()
            }
        }
        .sheet(isPresented: $showMembers) {
            if let group { GroupMembersSheet(groupID: group.id) }
        }
        .sheet(item: $previewingDoc) { doc in
            NavigationStack {
                DocPreview(url: doc.url)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(doc.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("OK") { previewingDoc = nil }.font(.headline)
                        }
                    }
            }
        }
        .sheet(item: $previewingMessageAttachment) { preview in
            NavigationStack {
                DocPreview(url: preview.url)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(preview.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("OK") { previewingMessageAttachment = nil }.font(.headline)
                        }
                    }
            }
        }
        .sheet(isPresented: $addingEvent) {
            if let group {
                AddGroupEventSheet(group: group)
                    .presentationDetents([.medium])
            }
        }
        .sheet(isPresented: $addingSong) {
            if let group {
                AddSongSheet(groupID: group.id, eventID: nil)
                    .presentationDetents([.medium])
            }
        }
        .sheet(item: $selectedEvent) { event in
            if let group {
                GroupEventSheet(groupID: group.id, eventID: event.id)
            }
        }
        .fileImporter(
            isPresented: $importingDoc,
            allowedContentTypes: [.pdf, .image, .text],
            allowsMultipleSelection: false
        ) { result in
            guard let group, case .success(let urls) = result, let url = urls.first else { return }
            store.addDoc(from: url, title: url.deletingPathExtension().lastPathComponent, to: group)
        }
        .fileImporter(
            isPresented: $importingMessageAttachment,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            do {
                outgoingMessageAttachment = try OutgoingMessageAttachment.load(from: url)
            } catch OutgoingMessageAttachment.ImportError.tooLarge {
                store.backendError = store.tr("Fichier trop lourd — 20 Mo maximum.")
            } catch {
                store.backendError = store.tr("Le fichier n'a pas pu être importé.")
            }
        }
        .onChange(of: messageMediaItem) { _, item in
            guard let item else { return }
            preparingMessageMedia = true
            Task {
                defer {
                    preparingMessageMedia = false
                    messageMediaItem = nil
                }
                do {
                    outgoingMessageAttachment = try await item.compressedMessageAttachment()
                } catch AppStore.VideoImportError.tooLong {
                    store.backendError = store.tr("Vidéo trop longue — 2 minutes maximum.")
                } catch OutgoingMessageAttachment.ImportError.tooLarge {
                    store.backendError = store.tr("Photo ou vidéo trop lourde — 20 Mo maximum.")
                } catch {
                    store.backendError = store.tr("La photo ou la vidéo n'a pas pu être importée.")
                }
            }
        }
        .sheet(item: $editingGroupMessage) { message in
            MessageEditSheet(text: message.text) {
                store.editGroupMessage(message, text: $0, groupID: groupID)
            }
        }
        .alert(
            groupMessageDeleteTitle,
            isPresented: Binding(
                get: { deletingGroupMessage != nil },
                set: { if !$0 { deletingGroupMessage = nil } }
            )
        ) {
            Button("Annuler", role: .cancel) { deletingGroupMessage = nil }
            Button("Supprimer", role: .destructive) {
                if let deletingGroupMessage {
                    store.deleteGroupMessage(deletingGroupMessage, groupID: groupID)
                }
                deletingGroupMessage = nil
            }
        } message: {
            Text("Le contenu disparaîtra chez tous les membres.")
        }
        // Le groupe est ouvert : ses messages sont lus (la puce s'éteint).
        .onAppear { store.markGroupSeen(groupID) }
        .onDisappear { store.markGroupSeen(groupID) }
    }

    private var groupMessageDeleteTitle: String {
        guard let attachment = deletingGroupMessage?.attachment else {
            return store.tr("Supprimer ce message ?")
        }
        if attachment.contentType.hasPrefix("video/") {
            return store.tr("Supprimer cette vidéo ?")
        }
        if attachment.contentType.hasPrefix("image/") {
            return store.tr("Supprimer cette photo ?")
        }
        return store.tr("Supprimer ce fichier ?")
    }

    /// Bandeau d'identité : photo, leader + membres, en un coup d'œil.
    private func groupHeader(_ group: GroupChat) -> some View {
        Button { showMembers = true } label: {
            HStack(spacing: 10) {
                GroupAvatarView(group: group, size: 34)
                HStack(spacing: 8) {
                    Image(systemName: "crown.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.laiton)
                    Text(verbatim: store.leaderDisplayName(of: group))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.primary)
                    Text("· \(group.memberNames.count + 1) membres")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if group.isPublic == true {
                        TagView(text: "Public", color: JC.feutrine)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 8)
        }
        .buttonStyle(PressableStyle())
    }

    private var tabPicker: some View {
        Picker("Onglet", selection: $tab) {
            ForEach(Tab.allCases) { tab in
                Image(systemName: tab.symbol).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 18)
        .padding(.bottom, 10)
    }

    // MARK: Messages

    private func messagesTab(_ group: GroupChat) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        if group.messages.isEmpty {
                            JCEmptyState(
                                icon: "bubble.left.and.bubble.right",
                                title: "Lance la discussion",
                                message: "Premier message au groupe — répé, setlist, horaires…"
                            )
                            .padding(.top, 20)
                        }
                        ForEach(Array(group.messages.enumerated()), id: \.element.id) { index, message in
                            if index == 0 || !Calendar.autoupdatingCurrent.isDate(
                                message.date,
                                inSameDayAs: group.messages[index - 1].date
                            ) {
                                MessageDayDivider(date: message.date)
                            }
                            GroupMessageBubble(
                                message: message,
                                isSpecialGuest: store.isSpecialGuest(message, in: group),
                                isAttachmentLoading: downloadingMessageAttachmentID == message.attachment?.id,
                                onOpenAttachment: openMessageAttachment,
                                onReact: {
                                    store.toggleGroupReaction($0, on: message, groupID: group.id)
                                },
                                onEdit: { editingGroupMessage = message },
                                onDelete: { deletingGroupMessage = message }
                            )
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: group.messages.count) {
                    if let lastID = group.messages.last?.id {
                        withAnimation { proxy.scrollTo(lastID, anchor: .bottom) }
                    }
                }
                .onAppear {
                    DispatchQueue.main.async {
                        if let lastID = group.messages.last?.id {
                            proxy.scrollTo(lastID, anchor: .bottom)
                        }
                    }
                }
            }

            VStack(spacing: 8) {
                if let outgoingMessageAttachment {
                    MessageAttachmentDraftChip(attachment: outgoingMessageAttachment) {
                        self.outgoingMessageAttachment = nil
                    }
                }
                HStack(spacing: 10) {
                    PhotosPicker(selection: $messageMediaItem, matching: .any(of: [.images, .videos])) {
                        Group {
                            if preparingMessageMedia {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "photo.on.rectangle.angled")
                                    .font(.body.weight(.bold))
                            }
                        }
                        .foregroundStyle(JC.electric)
                        .frame(width: 36, height: 36)
                        .background(JC.card, in: Circle())
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                    }
                    .buttonStyle(PressableStyle())
                    .disabled(preparingMessageMedia || store.messageAttachmentUploadInProgress)
                    .accessibilityLabel(Text("Joindre une photo ou une vidéo"))

                    Button { importingMessageAttachment = true } label: {
                        Image(systemName: "paperclip")
                            .font(.body.weight(.bold))
                            .foregroundStyle(JC.electric)
                            .frame(width: 36, height: 36)
                            .background(JC.card, in: Circle())
                            .frame(width: 44, height: 44)
                            .contentShape(Circle())
                    }
                    .buttonStyle(PressableStyle())
                    .disabled(preparingMessageMedia || store.messageAttachmentUploadInProgress)
                    .accessibilityLabel(Text("Joindre un fichier"))

                    TextField("Message au groupe…", text: $draft, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(JC.cardStroke, lineWidth: 1))
                    Button { sendGroupMessage(in: group) } label: {
                        Group {
                            if store.messageAttachmentUploadInProgress || sendingGroupMessage {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 34))
                            }
                        }
                        .foregroundStyle(canSendGroupMessage ? AnyShapeStyle(JC.hero) : AnyShapeStyle(Color.gray))
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                    }
                    .disabled(
                        !canSendGroupMessage
                            || store.messageAttachmentUploadInProgress
                            || sendingGroupMessage
                    )
                    .accessibilityLabel(Text("Envoyer le message"))
                }
            }
            .padding()
            .background(.ultraThinMaterial)
        }
    }

    private var canSendGroupMessage: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || outgoingMessageAttachment != nil
    }

    private func sendGroupMessage(in group: GroupChat) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || outgoingMessageAttachment != nil else { return }
        let attachment = outgoingMessageAttachment
        sendingGroupMessage = true
        store.sendGroupMessage(text, attachment: attachment, in: group) { sent in
            sendingGroupMessage = false
            guard sent else { return }
            if draft.trimmingCharacters(in: .whitespacesAndNewlines) == text {
                draft = ""
            }
            if outgoingMessageAttachment?.id == attachment?.id {
                outgoingMessageAttachment = nil
            }
        }
    }

    private func openMessageAttachment(_ attachment: MessageAttachment) {
        guard downloadingMessageAttachmentID == nil else { return }
        downloadingMessageAttachmentID = attachment.id
        Task {
            defer { downloadingMessageAttachmentID = nil }
            if let url = await store.localURL(for: attachment) {
                previewingMessageAttachment = MessageAttachmentPreview(
                    title: attachment.fileName,
                    url: url
                )
            }
        }
    }

    // MARK: Répertoire du groupe

    private func repertoireTab(_ group: GroupChat) -> some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    addingSong = true
                } label: {
                    Label(
                        isLeader ? "Ajouter un morceau" : "Suggérer un morceau",
                        systemImage: "plus.circle.fill"
                    )
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(JC.bronze)
                }
                .buttonStyle(PressableStyle())

                // Suggestions en attente — le leader tranche.
                if !group.pendingSongs.isEmpty {
                    SectionHeader(
                        title: "Suggestions",
                        subtitle: isLeader ? "À valider — c'est toi qui décides" : "En attente du leader"
                    )
                    ForEach(group.pendingSongs) { song in
                        SongRow(song: song, isLeader: isLeader, onApprove: {
                            store.approveSong(song, in: group.id)
                        }, onReject: {
                            store.rejectSong(song, in: group.id)
                        }, groupID: group.id)
                    }
                }

                SectionHeader(title: "Répertoire du groupe", subtitle: "\(group.approvedSongs.count) morceaux")
                if isLeader, group.approvedSongs.count > 1, !isSongSearchActive {
                    Label("Maintiens une tuile puis glisse-la pour changer l'ordre.", systemImage: "hand.draw")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                // Au-delà d'une dizaine de titres, retrouver « Autumn
                // Leaves » au doigt devient pénible.
                if group.approvedSongs.count > 8 {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        TextField("Chercher un morceau…", text: $songQuery)
                            .font(.subheadline)
                            .autocorrectionDisabled()
                        if !songQuery.isEmpty {
                            Button { songQuery = "" } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                if group.approvedSongs.isEmpty {
                    JCEmptyState(
                        icon: "music.note.list",
                        title: "Répertoire vide",
                        message: "Ajoute les morceaux du groupe — les membres peuvent en suggérer, le leader valide."
                    )
                }
                let songs = matchingSongs(in: group)
                if songs.isEmpty && !group.approvedSongs.isEmpty {
                    Text("Aucun morceau ne correspond.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ForEach(songs) { song in
                    Group {
                        if isLeader, !isSongSearchActive {
                            OrderedUUIDDragHandle(
                                id: song.id,
                                accessibilityLabel: "Déplacer le morceau",
                                coordinateSpace: "group-repertoire-reorder",
                                orderedIDs: $repertoireOrder,
                                session: $repertoireDragSession,
                                rowFrames: repertoireRowFrames,
                                viewportHeight: repertoireViewportHeight,
                                onAutoScroll: { id, anchor in
                                    withAnimation(.snappy(duration: 0.2)) {
                                        scrollProxy.scrollTo(id, anchor: anchor)
                                    }
                                },
                                onCommit: { ids in
                                    store.reorderApprovedRepertoire(ids, in: group.id)
                                }
                            ) {
                                SongRow(
                                    song: song,
                                    isLeader: false,
                                    onApprove: nil,
                                    onReject: { store.rejectSong(song, in: group.id) },
                                    groupID: group.id
                                )
                            }
                        } else {
                            // Le bouton de retrait n'apparaît que pour le leader.
                            SongRow(
                                song: song,
                                isLeader: false,
                                onApprove: nil,
                                onReject: isLeader ? { store.rejectSong(song, in: group.id) } : nil,
                                groupID: group.id
                            )
                        }
                    }
                    .orderedUUIDFrame(song.id, in: "group-repertoire-reorder")
                    .id(song.id)
                    .opacity(repertoireDragSession.draggingID == song.id ? 0.58 : 1)
                    .scaleEffect(repertoireDragSession.draggingID == song.id ? 0.985 : 1)
                    .animation(.snappy(duration: 0.18), value: repertoireDragSession.draggingID)
                }

                groupDocsSection(group)
            }
                .padding(18)
            }
            .coordinateSpace(name: "group-repertoire-reorder")
            .background {
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: OrderedUUIDViewportHeightPreferenceKey.self,
                        value: proxy.size.height
                    )
                }
            }
            .onPreferenceChange(OrderedUUIDFramePreferenceKey.self) { frames in
                repertoireRowFrames = frames
            }
            .onPreferenceChange(OrderedUUIDViewportHeightPreferenceKey.self) { height in
                repertoireViewportHeight = height
            }
        }
    }

    /// La couleur du talon d'un événement. L'état du line-up passe devant le
    /// rythme : savoir qu'il manque un musicien change une décision, savoir
    /// que la répé est hebdomadaire non.
    private func talon(for event: GroupEvent, lineup: LineupState) -> LinearGradient {
        switch lineup {
        case .complete: return JC.complet
        case .late: return JC.alerte
        case .forming: return event.kind.ticketGradient
        }
    }

    /// Morceaux validés filtrés par la recherche (titre ou artiste).
    private func matchingSongs(in group: GroupChat) -> [Song] {
        let ordered = orderedApprovedSongs(in: group)
        let needle = songQuery
            .trimmingCharacters(in: .whitespaces)
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        guard !needle.isEmpty else { return ordered }
        return ordered.filter { song in
            "\(song.title) \(song.artist)"
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
                .contains(needle)
        }
    }

    private var isSongSearchActive: Bool {
        !songQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// L'ordre serveur sert de repli au premier rendu ; pendant le drag, la
    /// liste locale suit immédiatement le doigt sans attendre Supabase.
    private func orderedApprovedSongs(in group: GroupChat) -> [Song] {
        let approved = group.approvedSongs
        guard !repertoireOrder.isEmpty else { return approved }
        let byID = Dictionary(uniqueKeysWithValues: approved.map { ($0.id, $0) })
        let ordered = repertoireOrder.compactMap { byID[$0] }
        let known = Set(ordered.map(\.id))
        return ordered + approved.filter { !known.contains($0.id) }
    }

    /// Repli VoiceOver du drag : les actions du rotor déplacent d'un cran,
    /// avec la même sauvegarde automatique que le geste au doigt.
    private func moveRepertoireSong(
        _ songID: Song.ID,
        by offset: Int,
        in group: GroupChat
    ) {
        var ids = repertoireOrder.isEmpty ? group.approvedSongs.map(\.id) : repertoireOrder
        guard let source = ids.firstIndex(of: songID) else { return }
        let destination = source + offset
        guard ids.indices.contains(destination) else { return }
        ids.swapAt(source, destination)
        repertoireOrder = ids
        UISelectionFeedbackGenerator().selectionChanged()
        store.reorderApprovedRepertoire(ids, in: group.id)
    }

    // MARK: Événements

    private func eventsTab(_ group: GroupChat) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                if isLeader {
                    Button {
                        addingEvent = true
                    } label: {
                        Label("Créer un événement", systemImage: "calendar.badge.plus")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(JC.bronze)
                    }
                    .buttonStyle(PressableStyle())
                } else {
                    Text("Seul le leader crée les événements — suggère-lui en message.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if group.upcomingEvents.isEmpty {
                    JCEmptyState(
                        icon: "calendar",
                        title: "Aucun événement planifié",
                        message: "Concert, répé ou jam : chaque événement a sa setlist — et si un membre lâche, SOS pré-rempli en un tap."
                    )
                }

                ForEach(group.upcomingEvents) { event in
                    let lineup = store.lineupState(event, in: group)
                    Button {
                        selectedEvent = event
                    } label: {
                        JCCard(padding: 0) {
                            HStack(spacing: 0) {
                                VStack(spacing: 2) {
                                    Image(systemName: event.kind.symbol)
                                        .font(.body.weight(.bold))
                                    Text(event.date.formatted(.dateTime.day()))
                                        .font(.title3.weight(.heavy))
                                    Text(event.date.formatted(.dateTime.month(.abbreviated)))
                                        .font(.caption2.weight(.bold))
                                        .textCase(.uppercase)
                                }
                                .foregroundStyle(JC.billetInk)
                                .frame(width: 62)
                                .padding(.vertical, 10)
                                // Le talon dit l'essentiel avant même la
                                // lecture : vert quand tout le monde est là,
                                // rouge quand le délai est passé et qu'il
                                // manque du monde, sinon la couleur du rythme.
                                .background(talon(for: event, lineup: lineup))

                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) {
                                        Text(event.title)
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                        EventKindBadge(kind: event.kind)
                                        if let recurrence = event.recurrence, event.isRecurring {
                                            TagView(text: recurrence.shortLabel, color: JC.feutrine)
                                        }
                                    }
                                    Label(
                                        "\(event.venue) · \(event.date.formatted(date: .omitted, time: .shortened))",
                                        systemImage: "mappin.and.ellipse"
                                    )
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    Text("Setlist : \(event.setlist.filter(\.isApproved).count) morceaux")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(JC.bronze)
                                    let available = store.availableNames(for: event, in: group).count
                                    let total = store.roster(of: group).count
                                    let myStatus = store.myAttendance(for: event)
                                    HStack(spacing: 6) {
                                        switch lineup {
                                        case .complete:
                                            Label("Line-up complet", systemImage: "checkmark.seal.fill")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(JC.feutrine)
                                        case .late:
                                            Label("Il manque du monde", systemImage: "exclamationmark.triangle.fill")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(JC.signal)
                                        case .forming:
                                            Text("Présence : \(available)/\(total)")
                                                .font(.caption2.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                        }
                                        let guests = store.guests(for: event).count
                                        if guests > 0 {
                                            let label: LocalizedStringKey = "+\(guests) invité·e·s"
                                            TagView(text: label, color: JC.laiton)
                                        }
                                    }
                                    HStack(spacing: 8) {
                                        if lineup != .forming {
                                            Text("Présence : \(available)/\(total)")
                                                .font(.caption2.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                        }
                                        if myStatus == .pending {
                                            ConfirmCountdownBadge(event: event)
                                        } else if myStatus == .available {
                                            Text("Tu es dispo")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(JC.feutrine)
                                        } else {
                                            Text("Tu es indispo")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(JC.signal)
                                        }
                                    }
                                }
                                .padding(12)
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.tertiary)
                                    .padding(.trailing, 12)
                            }
                        }
                    }
                    .buttonStyle(PressableStyle())
                }
            }
            .padding(18)
        }
    }

    // MARK: Documents du groupe (bas du répertoire)

    /// Ce qui n'appartient à aucun morceau : contrat, plan de scène, fiche
    /// technique. Les partitions, elles, sont rangées sous leur morceau —
    /// c'est là qu'on les cherche quand on répète.
    @ViewBuilder
    private func groupDocsSection(_ group: GroupChat) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: "Documents du groupe",
                subtitle: "Contrat, plan de scène, fiche technique — hors morceaux"
            )

            Button {
                importingDoc = true
            } label: {
                Label(
                    store.docUploadInProgress ? "Envoi en cours…" : "Ajouter un document",
                    systemImage: store.docUploadInProgress ? "arrow.triangle.2.circlepath" : "plus.circle.fill"
                )
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .foregroundStyle(JC.bronze)
            }
            .buttonStyle(PressableStyle())
            .disabled(store.docUploadInProgress)

            if store.isLive {
                Text("Partagés avec tout le groupe — chacun peut les ouvrir et les télécharger.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Les partitions rattachées à un morceau vivent sous ce morceau :
            // on ne les répète pas ici, on dit juste où elles sont.
            let attached = group.docs.count - group.looseDocs.count
            if attached > 0 {
                Label(
                    String(format: store.tr("%lld partitions sont rangées sous leurs morceaux — ouvre le morceau juste au-dessus."), attached),
                    systemImage: "music.note.list"
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if group.looseDocs.isEmpty && attached == 0 {
                JCEmptyState(
                    icon: "doc.richtext",
                    title: "Aucun document",
                    message: "Les partitions s'ajoutent depuis un morceau ; ici, tout ce qui concerne le groupe entier."
                )
            }

            ForEach(group.looseDocs) { doc in
                    Button {
                        openDoc(doc, in: group)
                    } label: {
                        JCCard(padding: 12) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(JC.laiton.opacity(0.14))
                                        .frame(width: 40, height: 40)
                                    if downloadingDocID == doc.id {
                                        ProgressView()
                                            .controlSize(.small)
                                    } else {
                                        Image(systemName: "doc.richtext.fill")
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(JC.laiton)
                                    }
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(doc.title)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Text("\(doc.addedBy) · \(doc.date.formatted(date: .abbreviated, time: .omitted))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                if canRemove(doc) {
                                    Button {
                                        store.removeDoc(doc, from: group)
                                    } label: {
                                        Image(systemName: "trash")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.secondary)
                                            .padding(8)
                                    }
                                    .buttonStyle(PressableStyle())
                                }
                            }
                        }
                    }
                    .buttonStyle(PressableStyle())
                    .disabled(downloadingDocID == doc.id)
            }
        }
        .padding(.top, 6)
    }

    /// Puis-je retirer cette partition ? Leader, ou celui qui l'a ajoutée
    /// (la RLS serveur applique la même règle).
    private func canRemove(_ doc: GroupDoc) -> Bool {
        isLeader || doc.addedBy == store.profile.name || !store.isLive
    }

    /// Ouvre une partition : fichier local direct, ou téléchargement (avec
    /// cache) pour un document hébergé — puis l'aperçu QuickLook, qui
    /// permet aussi de la partager / l'enregistrer dans Fichiers.
    private func openDoc(_ doc: GroupDoc, in group: GroupChat) {
        if doc.remotePath == nil {
            previewingDoc = PreviewableDoc(id: doc.id, title: doc.title, url: AppStore.mediaURL(for: doc.fileName))
            return
        }
        guard downloadingDocID == nil else { return }
        downloadingDocID = doc.id
        Task {
            defer { downloadingDocID = nil }
            if let url = await store.localURL(for: doc) {
                previewingDoc = PreviewableDoc(id: doc.id, title: doc.title, url: url)
            }
        }
    }
}

/// Décompte de réponse à un événement de groupe. Tant que je n'ai pas dit
/// si je viens, il montre le temps qu'il reste avant que le leader ait
/// besoin de savoir (le jour où part le rappel) — et il vire au rouge quand
/// le délai est dépassé.
struct ConfirmCountdownBadge: View {
    @EnvironmentObject private var store: AppStore
    let event: GroupEvent
    /// Compact = une seule pastille (cartes de liste) ; sinon une ligne.
    var compact: Bool = true

    var body: some View {
        let left = store.countdown(to: event.confirmDeadline)
        let urgent = left == nil || event.confirmDeadline.timeIntervalSinceNow < 24 * 3600
        HStack(spacing: 4) {
            Image(systemName: left == nil ? "exclamationmark.circle.fill" : "timer")
                .font(.system(size: compact ? 9 : 11, weight: .bold))
            Text(verbatim: label(left))
                .font(compact
                      ? .system(size: 10, weight: .heavy)
                      : .caption.weight(.heavy))
        }
        .foregroundStyle(urgent ? JC.signal : JC.laiton)
        .padding(.horizontal, compact ? 7 : 10)
        .padding(.vertical, compact ? 3 : 5)
        .background((urgent ? JC.signal : JC.laiton).opacity(0.14), in: Capsule())
    }

    private func label(_ left: String?) -> String {
        guard let left else { return store.tr("Réponse attendue") }
        return String(format: store.tr("Réponds sous %@"), left)
    }
}

/// Document prêt à être prévisualisé (local ou fraîchement téléchargé).
struct PreviewableDoc: Identifiable {
    let id: GroupDoc.ID
    let title: String
    let url: URL
}

/// État minimal du geste direct. Contrairement au glisser-déposer système, la
/// fin du geste arrive toujours ici, même quand le doigt quitte les lignes.
struct OrderedUUIDDragSession {
    var draggingID: UUID?
    var initialOrder: [UUID]

    init(
        draggingID: UUID? = nil,
        initialOrder: [UUID] = []
    ) {
        self.draggingID = draggingID
        self.initialOrder = initialOrder
    }
}

/// Cadres des lignes dans l'espace du ScrollView. Ils permettent à la tuile
/// de suivre réellement le doigt sans dépendre d'un `performDrop` aléatoire.
struct OrderedUUIDFramePreferenceKey: PreferenceKey {
    static var defaultValue: [UUID: CGRect] = [:]

    static func reduce(value: inout [UUID: CGRect], nextValue: () -> [UUID: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

struct OrderedUUIDViewportHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

extension View {
    func orderedUUIDFrame(_ id: UUID, in coordinateSpace: String) -> some View {
        background {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: OrderedUUIDFramePreferenceKey.self,
                    value: [id: proxy.frame(in: .named(coordinateSpace))]
                )
            }
        }
    }
}

/// Surface entière pilotée par un maintien puis glisser. L'ordre visuel suit
/// le doigt et la persistance part exactement une fois dans `onEnded`.
struct OrderedUUIDDragHandle<Content: View>: View {
    let id: UUID
    let accessibilityLabel: LocalizedStringKey
    let coordinateSpace: String
    @Binding var orderedIDs: [UUID]
    @Binding var session: OrderedUUIDDragSession
    let rowFrames: [UUID: CGRect]
    var viewportHeight: CGFloat = 0
    var onAutoScroll: ((UUID, UnitPoint) -> Void)?
    let onCommit: ([UUID]) -> Void
    let content: Content

    @State private var edgeDirection = 0
    @State private var autoScrollTask: Task<Void, Never>?
    @State private var lastVerticalTranslation: CGFloat = 0
    @State private var initialRowStep: CGFloat = 72
    @State private var didAutoScroll = false

    init(
        id: UUID,
        accessibilityLabel: LocalizedStringKey,
        coordinateSpace: String,
        orderedIDs: Binding<[UUID]>,
        session: Binding<OrderedUUIDDragSession>,
        rowFrames: [UUID: CGRect],
        viewportHeight: CGFloat = 0,
        onAutoScroll: ((UUID, UnitPoint) -> Void)? = nil,
        onCommit: @escaping ([UUID]) -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.id = id
        self.accessibilityLabel = accessibilityLabel
        self.coordinateSpace = coordinateSpace
        _orderedIDs = orderedIDs
        _session = session
        self.rowFrames = rowFrames
        self.viewportHeight = viewportHeight
        self.onAutoScroll = onAutoScroll
        self.onCommit = onCommit
        self.content = content()
    }

    var body: some View {
        content
            .contentShape(Rectangle())
            .accessibilityLabel(Text(accessibilityLabel))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: Text("Déplacer avant")) { move(by: -1) }
            .accessibilityAction(named: Text("Déplacer après")) { move(by: 1) }
            .highPriorityGesture(reorderGesture)
            .onDisappear {
                if session.draggingID == id {
                    finishDrag(verticalTranslation: lastVerticalTranslation)
                } else {
                    stopEdgeScroll()
                }
            }
    }

    /// Le court maintien donne explicitement la priorité à la tuile sur le
    /// pan vertical du ScrollView, puis le glissement réordonne directement.
    private var reorderGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.12, maximumDistance: 18)
            .sequenced(before: DragGesture(
                minimumDistance: 0,
                coordinateSpace: .named(coordinateSpace)
            ))
            .onChanged { value in
                switch value {
                case .first(let pressed):
                    if pressed { beginDrag() }
                case .second(_, let drag):
                    if let drag { updateDrag(drag) }
                }
            }
            .onEnded { value in
                switch value {
                case .second(_, let drag):
                    if let drag {
                        endDrag(drag)
                    } else {
                        cancelDrag()
                    }
                case .first:
                    cancelDrag()
                }
            }
    }

    private func beginDrag() {
        guard session.draggingID == nil, orderedIDs.contains(id) else { return }
        initialRowStep = estimatedRowStep(for: orderedIDs)
        session = OrderedUUIDDragSession(draggingID: id, initialOrder: orderedIDs)
        lastVerticalTranslation = 0
        didAutoScroll = false
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func updateDrag(_ value: DragGesture.Value) {
        beginDrag()
        guard session.draggingID == id else { return }
        lastVerticalTranslation = value.translation.height
        updateEdgeScroll(for: value.location.y)
        if let targetID = nearestTarget(to: value.location.y), targetID != id {
            applyOrder(Self.moving(id, beforeOrAt: targetID, in: orderedIDs))
        } else if !hasCompleteRowFrames,
                  let fallback = translatedOrder(for: value.translation.height) {
            // Au tout premier rendu, SwiftUI peut livrer le geste avant les
            // préférences GeometryReader. La translation reste disponible :
            // elle évite alors qu'un vrai glisser soit silencieusement perdu.
            applyOrder(fallback)
        }
    }

    private func endDrag(_ value: DragGesture.Value) {
        beginDrag()
        lastVerticalTranslation = value.translation.height
        finishDrag(verticalTranslation: value.translation.height)
    }

    private func finishDrag(verticalTranslation: CGFloat) {
        guard session.draggingID == id else { return }
        stopEdgeScroll()

        let initialOrder = session.initialOrder
        var finalOrder = orderedIDs
        if let fallback = translatedOrder(for: verticalTranslation),
           fallback != finalOrder,
           !didAutoScroll || dragDistance(in: fallback) > dragDistance(in: finalOrder) {
            // Les frames bougent pendant l'animation et peuvent laisser un
            // déplacement partiel (par exemple un rang sur les deux demandés).
            // La translation finale reste alors la source de vérité stable,
            // même si les préférences sont absentes ou périmées. Après un
            // auto-scroll, on conserve toutefois l'ordre qui a parcouru le
            // plus de lignes afin de ne pas annuler la progression hors écran.
            finalOrder = fallback
            withAnimation(.snappy(duration: 0.18)) { orderedIDs = fallback }
        }
        if finalOrder != initialOrder {
            onCommit(finalOrder)
        }
        session = OrderedUUIDDragSession()
        lastVerticalTranslation = 0
        initialRowStep = 72
        didAutoScroll = false
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func dragDistance(in order: [UUID]) -> Int {
        guard let source = session.initialOrder.firstIndex(of: id),
              let destination = order.firstIndex(of: id)
        else { return 0 }
        return abs(destination - source)
    }

    private func cancelDrag() {
        guard session.draggingID == id else { return }
        finishDrag(verticalTranslation: lastVerticalTranslation)
    }

    private func nearestTarget(to y: CGFloat) -> UUID? {
        orderedIDs
            .compactMap { candidate in
                rowFrames[candidate].map { (candidate, abs($0.midY - y)) }
            }
            .min(by: { $0.1 < $1.1 })?
            .0
    }

    private var hasCompleteRowFrames: Bool {
        !orderedIDs.isEmpty && orderedIDs.allSatisfy { id in
            guard let frame = rowFrames[id] else { return false }
            return frame.midY.isFinite && frame.height > 1
        }
    }

    /// Ordre estimé uniquement depuis la translation du geste. Il sert de
    /// repli quand les préférences de géométrie n'ont pas encore été livrées.
    private func translatedOrder(for verticalTranslation: CGFloat) -> [UUID]? {
        let initialOrder = session.initialOrder
        guard let source = initialOrder.firstIndex(of: id), initialOrder.count > 1 else {
            return nil
        }
        let delta = Int((verticalTranslation / initialRowStep).rounded())
        guard delta != 0 else { return initialOrder }
        let destination = min(max(source + delta, 0), initialOrder.count - 1)
        guard destination != source else { return initialOrder }

        var reordered = initialOrder
        let moved = reordered.remove(at: source)
        reordered.insert(moved, at: min(destination, reordered.count))
        return reordered
    }

    private func estimatedRowStep(for order: [UUID]) -> CGFloat {
        let mids = order.compactMap { rowFrames[$0]?.midY }
        let spacings = zip(mids, mids.dropFirst())
            .map { pair in abs(pair.1 - pair.0) }
            .filter { $0.isFinite && $0 > 8 }
            .sorted()
        if !spacings.isEmpty { return spacings[spacings.count / 2] }

        let heights = order
            .compactMap { rowFrames[$0]?.height }
            .filter { $0.isFinite && $0 > 8 }
            .sorted()
        if !heights.isEmpty { return max(56, heights[heights.count / 2] + 12) }
        return 72
    }

    private func applyOrder(_ reordered: [UUID]) {
        guard reordered != orderedIDs else { return }
        withAnimation(.snappy(duration: 0.18)) { orderedIDs = reordered }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    nonisolated static func moving(
        _ draggingID: UUID,
        beforeOrAt targetID: UUID,
        in orderedIDs: [UUID]
    ) -> [UUID] {
        guard draggingID != targetID,
              let source = orderedIDs.firstIndex(of: draggingID),
              let destination = orderedIDs.firstIndex(of: targetID)
        else { return orderedIDs }
        var reordered = orderedIDs
        let moved = reordered.remove(at: source)
        reordered.insert(moved, at: min(destination, reordered.count))
        return reordered
    }

    private func move(by offset: Int) {
        guard let source = orderedIDs.firstIndex(of: id) else { return }
        let destination = source + offset
        guard orderedIDs.indices.contains(destination) else { return }
        orderedIDs.swapAt(source, destination)
        UISelectionFeedbackGenerator().selectionChanged()
        onCommit(orderedIDs)
    }

    private func updateEdgeScroll(for y: CGFloat) {
        guard viewportHeight > 0, onAutoScroll != nil else { return }
        let edge: CGFloat = 64
        let direction = y < edge ? -1 : (y > viewportHeight - edge ? 1 : 0)
        guard direction != edgeDirection else { return }
        stopEdgeScroll()
        edgeDirection = direction
        guard direction != 0 else { return }

        autoScrollTask = Task { @MainActor in
            while !Task.isCancelled, session.draggingID == id {
                try? await Task.sleep(for: .milliseconds(240))
                guard !Task.isCancelled,
                      session.draggingID == id,
                      let source = orderedIDs.firstIndex(of: id)
                else { break }
                let destination = source + direction
                guard orderedIDs.indices.contains(destination) else { break }
                let targetID = orderedIDs[destination]
                let reordered = Self.moving(id, beforeOrAt: targetID, in: orderedIDs)
                guard reordered != orderedIDs else { continue }
                didAutoScroll = true
                withAnimation(.snappy(duration: 0.18)) { orderedIDs = reordered }
                onAutoScroll?(id, direction < 0 ? .top : .bottom)
                UISelectionFeedbackGenerator().selectionChanged()
            }
        }
    }

    private func stopEdgeScroll() {
        autoScrollTask?.cancel()
        autoScrollTask = nil
        edgeDirection = 0
    }
}

// MARK: - Ligne d'un morceau (pochette iTunes si trouvée)

struct SongRow: View {
    @EnvironmentObject private var store: AppStore
    let song: Song
    /// true = montrer les boutons valider / refuser (suggestion + leader).
    let isLeader: Bool
    let onApprove: (() -> Void)?
    let onReject: (() -> Void)?
    /// Groupe du morceau : ouvre la fiche (partitions, tonalité, commentaires).
    /// nil = ligne d'affichage seule (aperçus, captures).
    let groupID: GroupChat.ID?
    /// Événement source lorsque la tuile vient d'une setlist. nil signifie
    /// que le morceau vient du répertoire du groupe.
    let eventID: GroupEvent.ID?
    @State private var showListen = false
    @State private var showDetail = false

    init(
        song: Song,
        isLeader: Bool,
        onApprove: (() -> Void)? = nil,
        onReject: (() -> Void)? = nil,
        groupID: GroupChat.ID? = nil,
        eventID: GroupEvent.ID? = nil
    ) {
        self.song = song
        self.isLeader = isLeader
        self.onApprove = onApprove
        self.onReject = onReject
        self.groupID = groupID
        self.eventID = eventID
    }

    var body: some View {
        songCard
            .sheet(isPresented: $showListen) {
                ListenSheet(song: song)
                    .presentationDetents([.height(380)])
            }
            .sheet(isPresented: $showDetail) {
                if let groupID {
                    SongDetailSheet(groupID: groupID, songID: song.id)
                }
            }
    }

    private var songCard: some View {
        JCCard(padding: 10) {
            HStack(spacing: 11) {
                // Seule la partie « identité » ouvre la fiche du morceau :
                // les boutons de droite (écouter, valider, refuser) doivent
                // rester cliquables — deux boutons imbriqués se volent le tap.
                Button {
                    if groupID != nil { showDetail = true }
                } label: {
                    HStack(spacing: 11) {
                        // Pochette — repli : vignette note de musique.
                        if let artwork = song.artworkURL, let url = URL(string: artwork) {
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                artworkPlaceholder
                            }
                            .frame(width: 46, height: 46)
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        } else {
                            artworkPlaceholder
                                .frame(width: 46, height: 46)
                                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(song.title)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                                .lineLimit(1)
                                .minimumScaleFactor(0.82)
                            compactMetadata(song)
                        }
                        Spacer(minLength: 0)
                        // Les trois petits points : ce morceau a une fiche
                        // (tonalité, grille, partitions, commentaires).
                        if groupID != nil {
                            Image(systemName: "ellipsis")
                                .font(.caption.weight(.black))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableStyle())
                .disabled(groupID == nil)
                .accessibilityHint(Text("Ouvre la fiche du morceau"))
                listenMenu
                if !song.isApproved && isLeader {
                    // Le bouton d'acceptation demandé — un tap et c'est validé.
                    Button {
                        onApprove?()
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(JC.feutrine)
                    }
                    .buttonStyle(PressableStyle())
                    Button {
                        onReject?()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(PressableStyle())
                } else if !song.isApproved {
                    Image(systemName: "clock.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(JC.laiton)
                        .accessibilityLabel(Text("En attente"))
                } else if let onReject {
                    Button {
                        onReject()
                    } label: {
                        Image(systemName: "trash")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                            .padding(6)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
            .frame(minHeight: 48, maxHeight: 48)
        }
    }

    @ViewBuilder
    private func compactMetadata(_ song: Song) -> some View {
        let values = [
            song.keyBadgeLabel,
            song.tempoBPM.map { "\($0) BPM" },
            song.form?.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        HStack(spacing: 5) {
            Image(systemName: "metronome")
                .font(.system(size: 9, weight: .bold))
            Text(verbatim: values.isEmpty ? "—" : values.joined(separator: " · "))
                .font(.caption2.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .foregroundStyle(JC.bronze)
    }

    /// Bouton d'écoute discret : un casque, et une feuille propose le
    /// morceau sur chaque plateforme avec son vrai logo (lien direct Apple
    /// Music quand on l'a, recherche pré-remplie sinon). Aussi disponible
    /// par appui long sur la ligne.
    private var listenMenu: some View {
        Button {
            showListen = true
        } label: {
            Image(systemName: "headphones")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .padding(7)
                .background(JC.inset, in: Circle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(Text("Écouter ce morceau"))
    }

    private var artworkPlaceholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(JC.bronze.opacity(0.14))
            Image(systemName: "music.note")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(JC.bronze)
        }
    }
}

// MARK: - Copie d'un morceau entre répertoires et événements

/// Destination explicite pour éviter l'ancien malentendu entre « copier le
/// titre » (presse-papiers) et copier réellement toute la tuile musicale.
struct CopySongSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let song: Song
    let sourceGroupID: GroupChat.ID
    let sourceEventID: GroupEvent.ID?

    @State private var resultMessage: String?
    @State private var copyError: String?
    @State private var copyingDestinationID: String?

    private struct Destination: Identifiable {
        let group: GroupChat
        let event: GroupEvent?

        var id: String {
            if let event { return "event:\(event.id.uuidString.lowercased())" }
            return "group:\(group.id.uuidString.lowercased())"
        }

        var songs: [Song] { event?.setlist ?? group.songs }
        var title: String { event?.title ?? group.name }
        var subtitle: String {
            event == nil ? "Répertoire · \(group.name)" : "Événement · \(group.name)"
        }
        var symbol: String { event == nil ? "music.note.list" : "calendar" }
    }

    private var destinations: [Destination] {
        store.groups
            .sorted {
                if store.canLead($0) != store.canLead($1) {
                    return store.canLead($0) && !store.canLead($1)
                }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
            .flatMap { group in
                var result: [Destination] = []
                if group.id != sourceGroupID || sourceEventID != nil {
                    result.append(Destination(group: group, event: nil))
                }
                result.append(contentsOf: group.upcomingEvents.compactMap { event in
                    guard group.id != sourceGroupID || event.id != sourceEventID else { return nil }
                    return Destination(group: group, event: event)
                })
                return result
            }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        JCCard {
                            HStack(spacing: 11) {
                                Image(systemName: "music.note")
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(JC.bronze)
                                    .frame(width: 42, height: 42)
                                    .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(song.title)
                                        .font(.subheadline.weight(.bold))
                                    Text(song.artist)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                        }

                        Text("Choisis un répertoire ou un événement. L'identité catalogue, la pochette, l'artiste, la tonalité, le tempo, la forme, la grille et les liens exacts sont copiés ; les solos restent propres à chaque groupe.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if destinations.isEmpty {
                            JCEmptyState(
                                icon: "rectangle.stack.badge.minus",
                                title: "Aucune autre destination",
                                message: "Crée un événement ou rejoins un autre groupe pour y copier ce morceau."
                            )
                        } else {
                            ForEach(destinations) { destination in
                                let duplicate = containsSong(in: destination)
                                Button {
                                    copy(to: destination)
                                } label: {
                                    JCCard(padding: 12) {
                                        HStack(spacing: 11) {
                                            Image(systemName: destination.symbol)
                                                .font(.headline.weight(.bold))
                                                .foregroundStyle(JC.bronze)
                                                .frame(width: 40, height: 40)
                                                .background(JC.inset, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                            VStack(alignment: .leading, spacing: 3) {
                                                Text(destination.title)
                                                    .font(.subheadline.weight(.bold))
                                                    .foregroundStyle(.primary)
                                                Text(destination.subtitle)
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                                Text(copyHint(for: destination, duplicate: duplicate))
                                                    .font(.caption2)
                                                    .foregroundStyle(duplicate ? .secondary : JC.bronze)
                                            }
                                            Spacer(minLength: 0)
                                            if copyingDestinationID == destination.id {
                                                ProgressView()
                                                    .tint(JC.bronze)
                                            } else {
                                                Image(systemName: duplicate ? "checkmark.circle.fill" : "arrow.right.circle.fill")
                                                    .font(.title3)
                                                    .foregroundStyle(duplicate ? .secondary : JC.bronze)
                                            }
                                        }
                                    }
                                }
                                .buttonStyle(PressableStyle())
                                .disabled(duplicate || copyingDestinationID != nil)
                            }
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Copier le morceau")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
            .alert("Morceau copié", isPresented: Binding(
                get: { resultMessage != nil },
                set: { if !$0 { resultMessage = nil } }
            )) {
                Button("OK") { dismiss() }
            } message: {
                Text(resultMessage ?? "")
            }
            .alert("Copie impossible", isPresented: Binding(
                get: { copyError != nil },
                set: { if !$0 { copyError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(copyError ?? "")
            }
        }
    }

    private func containsSong(in destination: Destination) -> Bool {
        destination.songs.contains {
            AppStore.normalizedSongIdentity($0) == AppStore.normalizedSongIdentity(song)
        }
    }

    private func copyHint(for destination: Destination, duplicate: Bool) -> String {
        if duplicate { return store.tr("Déjà dans cette destination") }
        return store.canLead(destination.group)
            ? store.tr("Ajouté directement")
            : store.tr("Envoyé comme suggestion")
    }

    private func copy(to destination: Destination) {
        copyingDestinationID = destination.id
        let immediateResult = store.copySong(
            song,
            from: sourceGroupID,
            sourceEventID: sourceEventID,
            to: destination.group.id,
            eventID: destination.event?.id
        ) { finalResult in
            copyingDestinationID = nil
            switch finalResult {
            case .copied(let approved):
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                let format = approved
                    ? store.tr("%@ a été copié vers %@.")
                    : store.tr("%@ a été envoyé vers %@ pour validation.")
                resultMessage = String(
                    format: format,
                    locale: store.language.locale,
                    song.title,
                    destination.title
                )
            case .alreadyExists:
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                copyError = store.tr("Déjà dans cette destination")
            case .unavailable:
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                copyError = store.tr("Ce répertoire n'est plus disponible.")
            case .failed:
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                copyError = store.tr("Le morceau n'a pas pu être copié. Vérifie le réseau puis réessaie.")
            }
        }
        switch immediateResult {
        case .copied:
            break
        case .alreadyExists:
            copyingDestinationID = nil
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            copyError = store.tr("Déjà dans cette destination")
        case .unavailable:
            copyingDestinationID = nil
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            copyError = store.tr("Ce répertoire n'est plus disponible.")
        case .failed:
            copyingDestinationID = nil
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            copyError = store.tr("Le morceau n'a pas pu être copié. Vérifie le réseau puis réessaie.")
        }
    }
}

// MARK: - Feuille « Écouter sur… »

/// Le morceau sur chaque plateforme de streaming, avec son logo — un tap
/// ouvre l'app (ou le site) directement sur cet enregistrement précis.
struct ListenSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let song: Song

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        if let artwork = song.artworkURL, let url = URL(string: artwork) {
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(JC.bronze.opacity(0.14))
                            }
                            .frame(width: 54, height: 54)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        } else {
                            ZStack {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(JC.bronze.opacity(0.14))
                                Image(systemName: "music.note")
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(JC.bronze)
                            }
                            .frame(width: 54, height: 54)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(song.title)
                                .font(.headline.weight(.heavy))
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(song.artist)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    let directPlatforms = StreamingPlatform.allCases.filter {
                        $0.hasDirectLink(for: song)
                    }
                    VStack(spacing: 8) {
                        ForEach(directPlatforms) { platform in
                            if let url = platform.url(for: song) {
                                Button {
                                    openURL(url)
                                    dismiss()
                                } label: {
                                    HStack(spacing: 12) {
                                        StreamingLogoView(platform: platform, size: 34)
                                        Text(verbatim: platform.label)
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(.primary)
                                        TagView(text: store.tr("Lien direct"), color: JC.feutrine)
                                        Spacer(minLength: 0)
                                        Image(systemName: "arrow.up.right")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.tertiary)
                                    }
                                    .padding(12)
                                    .background(JC.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .stroke(JC.cardStroke, lineWidth: 1)
                                    )
                                }
                                .buttonStyle(PressableStyle())
                            }
                        }
                        if directPlatforms.isEmpty {
                            Text("Aucun lien exact n'est encore disponible pour ce morceau.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(JC.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(18)
            }
            .navigationTitle("Écouter sur…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
        }
    }
}

/// Bulle de message de groupe — le nom de l'expéditeur au-dessus.
struct GroupMessageBubble: View {
    @EnvironmentObject private var store: AppStore
    let message: GroupMessage
    var isSpecialGuest = false
    var isAttachmentLoading = false
    var onOpenAttachment: ((MessageAttachment) -> Void)? = nil
    var onReact: ((String) -> Void)? = nil
    var onEdit: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isFromMe { Spacer(minLength: 56) }
            if !message.isFromMe {
                ZStack(alignment: .bottomTrailing) {
                    AvatarView(
                        name: message.sender,
                        size: 30,
                        photo: message.senderPhotoURL
                    )
                    if isSpecialGuest {
                        Text(verbatim: "🌠")
                            .font(.system(size: 11))
                            .offset(x: 4, y: 3)
                            .accessibilityLabel(Text("Special guest"))
                    }
                }
                .padding(.bottom, 22)
            }
            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 3) {
                if !message.isFromMe {
                    HStack(spacing: 4) {
                        Text(message.sender)
                        if isSpecialGuest { Text(verbatim: "🌠") }
                    }
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(JC.bronze)
                    .padding(.leading, 6)
                }
                VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 6) {
                    if message.deletedAt != nil {
                        Label("Message supprimé", systemImage: "nosign")
                            .font(.subheadline.italic())
                            .foregroundStyle(.secondary)
                    } else if let attachment = message.attachment {
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
                    message.isFromMe ? AnyShapeStyle(JC.hero) : AnyShapeStyle(JC.card),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(message.isFromMe ? .clear : JC.cardStroke, lineWidth: 1)
                )
                .foregroundStyle(message.isFromMe ? JC.billetInk : Color.primary)
                .contextMenu {
                    if message.deletedAt == nil {
                        MessageActionsMenu(
                            isMine: message.isFromMe,
                            canEdit: message.isFromMe && !message.text.isEmpty,
                            onReact: { onReact?($0) },
                            onEdit: { onEdit?() },
                            onDelete: { onDelete?() }
                        )
                    }
                }
                MessageReactionBar(reactions: message.reactionSummaries) {
                    onReact?($0)
                }
                HStack(spacing: 4) {
                    if message.editedAt != nil, message.deletedAt == nil {
                        Text("Modifié")
                    }
                    Text(
                        message.date.formatted(
                            Date.FormatStyle(date: .omitted, time: .shortened)
                                .locale(store.language.locale)
                        )
                    )
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
            if !message.isFromMe { Spacer(minLength: 56) }
        }
    }
}

// MARK: - Membres (invitations, exclusions, leadership)

/// Gestion des membres. Le leader invite, exclut et peut transmettre son
/// rôle à un autre membre éligible.
struct GroupMembersSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    @State private var showInvite = false
    /// Membre en attente de confirmation pour devenir leader.
    @State private var pendingLeader: SoloistOption?
    /// Fiche du membre qu'on consulte.
    @State private var viewingMusician: Musician?

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }

    /// Le leader reste administrateur même si son abonnement expire.
    private var isLeader: Bool {
        group.map { store.canLead($0) } ?? false
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                if let group {
                    ScrollView {
                        VStack(spacing: 10) {
                            if isLeader {
                                Button {
                                    showInvite = true
                                } label: {
                                    Label("Inviter un musicien", systemImage: "person.badge.plus")
                                        .font(.subheadline.weight(.bold))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                        .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .foregroundStyle(JC.bronze)
                                }
                                .buttonStyle(PressableStyle())
                            }

                            // Le roster est rendu et manipulé par UUID. Deux
                            // homonymes restent deux lignes et deux actions.
                            ForEach(store.soloistOptions(for: group)) { member in
                                memberRow(member: member, group: group)
                            }

                            // Invités en attente de réponse (le leader peut annuler).
                            ForEach(store.pendingInvitesByGroup[group.id] ?? []) { invite in
                                pendingInviteRow(invite, group: group)
                            }

                            if isLeader {
                                Text("Le leadership peut être transmis à un membre permanent. Les Special guests 🌠 restent clairement temporaires jusqu'à ce que tu les passes en permanent ou les retires.")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 4)
                            }
                        }
                        .padding(18)
                    }
                }
            }
            .navigationTitle("Membres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
            .sheet(isPresented: $showInvite) {
                if let group { InviteMemberSheet(group: group) }
            }
            .sheet(item: $viewingMusician) { musician in
                NavigationStack {
                    MusicianDetailView(musician: musician)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("OK") { viewingMusician = nil }.font(.headline)
                            }
                        }
                }
                .presentationDetents([.large])
            }
            .confirmationDialog(
                pendingLeader.map { String(format: store.tr("Nommer %@ leader ? Tu perdras la gestion du groupe."), $0.name) } ?? "",
                isPresented: Binding(get: { pendingLeader != nil }, set: { if !$0 { pendingLeader = nil } }),
                titleVisibility: .visible
            ) {
                if let member = pendingLeader, let group {
                    Button(String(format: store.tr("Nommer %@ leader"), member.name)) {
                        store.transferLeadership(of: group, to: member)
                        pendingLeader = nil
                    }
                }
                Button("Annuler", role: .cancel) { pendingLeader = nil }
            }
        }
    }

    /// Invité en attente : avatar grisé, pastille « Invitation en attente »,
    /// et l'annulation pour le leader.
    private func pendingInviteRow(_ invite: PendingGroupInvite, group: GroupChat) -> some View {
        JCCard(padding: 11) {
            HStack(spacing: 11) {
                AvatarView(name: invite.name, size: 42, photo: store.photo(forName: invite.name))
                    .opacity(0.55)
                VStack(alignment: .leading, spacing: 2) {
                    Text(invite.name)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Label("Invitation en attente", systemImage: "hourglass")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(JC.laiton)
                    if invite.kind == .specialGuest {
                        Text(verbatim: "🌠 Special guest")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(JC.bronze)
                    }
                }
                Spacer(minLength: 0)
                if isLeader {
                    Button {
                        store.cancelGroupInvitation(invite, in: group)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(Text("Annuler l'invitation"))
                }
            }
        }
    }

    /// Instruments joués par un membre — les miens viennent de mon profil,
    /// ceux des autres de leur fiche serveur.
    private func instruments(of member: SoloistOption, isMe: Bool) -> [Instrument] {
        isMe
            ? store.profile.instruments
            : (store.musician(for: member)?.instruments ?? [])
    }

    private func memberRow(member: SoloistOption, group: GroupChat) -> some View {
        let name = member.name
        let isMe = store.isCurrentProfile(member)
        let isLeaderRow = store.isLeader(member, in: group)
        let kind = group.memberKind(for: member)
        let role = group.role(for: member)
        let played = instruments(of: member, isMe: isMe)
        // Le rôle tenu dans le groupe passe devant, ses autres instruments
        // suivent. Un rôle assigné hors de sa panoplie reste affiché.
        let orderedInstruments: [Instrument] = role.map { [$0] + played.filter { $0 != role } } ?? played
        let profileToOpen = isMe ? nil : store.musician(for: member)
        return JCCard(padding: 11) {
            HStack(spacing: 11) {
                // Toute la ligne ouvre la fiche du membre.
                Button {
                    guard let profileToOpen else { return }
                    viewingMusician = profileToOpen
                } label: {
                    HStack(spacing: 11) {
                        AvatarView(name: name, size: 42, photo: store.photo(forName: name))
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(isMe ? store.tr("Toi") : name)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                if !isMe && store.isDemoContact(name) { DemoAccountBadge() }
                                if isLeaderRow {
                                    HStack(spacing: 3) {
                                        Image(systemName: "crown.fill")
                                            .font(.system(size: 8, weight: .bold))
                                        Text("Leader")
                                            .font(.caption2.weight(.heavy))
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(JC.laiton.opacity(0.16), in: Capsule())
                                    .foregroundStyle(JC.laiton)
                                }
                            }
                            HStack(spacing: 6) {
                                // Le leader est toujours le noyau ; les autres ont un statut.
                                if !isLeaderRow {
                                    if kind == .specialGuest {
                                        Text(verbatim: "🌠 Special guest")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(JC.bronze)
                                    } else {
                                        Label(kind.label, systemImage: kind.symbol)
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(JC.bronze)
                                    }
                                }
                            }
                            // Ce que joue chaque membre — le rôle tenu dans le
                            // groupe est en laiton, ses autres instruments en
                            // bronze : on lit la formation d'un coup d'œil.
                            if !orderedInstruments.isEmpty {
                                FlowLayout(spacing: 5) {
                                    ForEach(orderedInstruments) { instrument in
                                        TagView(
                                            text: instrument.rawValue,
                                            color: instrument == role ? JC.laiton : JC.bronze
                                        )
                                    }
                                }
                            }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableStyle())
                .disabled(profileToOpen == nil)
                .accessibilityLabel(Text("Voir le profil"))
                Spacer(minLength: 0)
                if isLeader && !isMe {
                    Menu {
                        if !isLeaderRow {
                            Button {
                                store.setMemberKind(
                                    member,
                                    kind == .permanent ? .specialGuest : .permanent,
                                    in: group
                                )
                            } label: {
                                Label(
                                    kind == .permanent ? "Passer en Special guest 🌠" : "Passer en permanent",
                                    systemImage: kind == .permanent
                                        ? GroupMemberKind.specialGuest.symbol
                                        : GroupMemberKind.permanent.symbol
                                )
                            }
                            Menu {
                                let options = store.musician(for: member)?.instruments ?? Instrument.allCases
                                ForEach(options) { instrument in
                                    Button {
                                        store.setMemberRole(member, instrument, in: group)
                                    } label: {
                                        if group.role(for: member) == instrument {
                                            Label(store.tr(instrument.rawValue), systemImage: "checkmark")
                                        } else {
                                            Text(store.tr(instrument.rawValue))
                                        }
                                    }
                                }
                                if group.role(for: member) != nil {
                                    Button(role: .destructive) {
                                        store.setMemberRole(member, nil, in: group)
                                    } label: {
                                        Label("Retirer le rôle", systemImage: "xmark")
                                    }
                                }
                            } label: {
                                Label("Rôle dans le groupe", systemImage: "guitars")
                            }
                        }
                        if kind == .permanent {
                            Button {
                                pendingLeader = member
                            } label: {
                                Label("Nommer leader", systemImage: "crown")
                            }
                        }
                        Button(role: .destructive) {
                            store.kickMember(member, from: group)
                        } label: {
                            Label("Exclure du groupe", systemImage: "person.badge.minus")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .padding(6)
                    }
                }
            }
        }
    }
}

// MARK: - Réglages du groupe (leader)

/// Nom, photo et visibilité du groupe — réservé au leader. Un groupe public
/// s'affiche sur les profils de ses membres ; un groupe privé reste
/// invisible du reste du réseau.
struct GroupSettingsSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    @State private var photoItem: PhotosPickerItem?
    @State private var name = ""

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }

    /// Nom prêt à être enregistré (saisi, nettoyé, différent de l'actuel).
    private var cleanedNewName: String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != group?.name else { return nil }
        return trimmed
    }

    var body: some View {
        NavigationStack {
            Form {
                if let group {
                    Section {
                        TextField("Nom du groupe", text: $name)
                            .font(.body.weight(.semibold))
                            .submitLabel(.done)
                            .onSubmit(commitRename)
                    } header: {
                        Text("Nom du groupe")
                    } footer: {
                        Text("Le nouveau nom s'affiche chez tous les membres.")
                    }

                    Section("Photo du groupe") {
                        HStack(spacing: 14) {
                            GroupAvatarView(group: group, size: 64)
                            PhotosPicker(selection: $photoItem, matching: .images) {
                                Label(
                                    group.photoURL == nil ? "Ajouter une photo" : "Changer la photo",
                                    systemImage: "camera.fill"
                                )
                                .font(.subheadline.weight(.semibold))
                            }
                        }
                    }

                    Section {
                        Toggle(
                            "Groupe public",
                            isOn: Binding(
                                get: { group.isPublic ?? false },
                                set: { store.setGroupVisibility($0, in: group) }
                            )
                        )
                        .tint(JC.laiton)
                    } header: {
                        Text("Visibilité")
                    } footer: {
                        Text("Public : le groupe apparaît sur les profils de ses membres (nom, photo, effectif). Privé : il reste entre vous.")
                    }

                    // L'automatisation est Premium, mais elle reste toujours
                    // désactivable si l'abonnement expire.
                    Section {
                        if store.canUse(.autoSOS) || group.autoSOSEnabled == true {
                            Toggle(
                                "Chercher un remplaçant tout seul",
                                isOn: Binding(
                                    get: { group.autoSOSEnabled ?? false },
                                    set: { store.setAutoSOS(enabled: $0, levelRule: levelRule, in: group) }
                                )
                            )
                            .tint(JC.signal)
                        } else {
                            Button { store.showPaywall = true } label: {
                                HStack {
                                    Label("Chercher un remplaçant tout seul", systemImage: "wand.and.stars")
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    Text("Premium")
                                        .font(.caption2.weight(.heavy))
                                        .foregroundStyle(JC.laiton)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(Text("Ouvre les offres Premium"))
                        }
                        if group.autoSOSEnabled == true {
                            Picker("Niveau demandé", selection: Binding(
                                get: { levelRule },
                                set: { store.setAutoSOS(enabled: true, levelRule: $0, in: group) }
                            )) {
                                ForEach(AutoSOSLevelRule.allCases) { rule in
                                    Label(
                                        LocalizedStringKey(rule.label),
                                        systemImage: rule.symbol
                                    )
                                    .tag(rule)
                                }
                            }
                            .pickerStyle(.inline)
                        }
                    } header: {
                        Text("Remplacement automatique")
                    } footer: {
                        Text(group.autoSOSEnabled == true
                             ? "Dès qu'un membre se déclare indisponible, un SOS part pour son poste — tu es prévenu·e à chaque fois. « Identique à l'absent » reprend le niveau du musicien qui manque."
                             : "Désactivé : tu es prévenu·e du désistement, et c'est toi qui publies le SOS quand tu veux.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Réglages du groupe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        commitRename()
                        dismiss()
                    }
                    .font(.headline)
                }
            }
            .onAppear { name = group?.name ?? "" }
            .onChange(of: photoItem) { _, item in
                guard let item, let group else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let jpeg = UIImage(data: data)?.resizedJPEG(maxSide: 600) {
                        store.setGroupPhoto(jpeg, in: group)
                    }
                    photoItem = nil
                }
            }
        }
    }

    /// Règle de niveau retenue pour les SOS automatiques du groupe.
    private var levelRule: AutoSOSLevelRule {
        group?.autoSOSLevelRule ?? .any
    }

    private func commitRename() {
        guard let group, let newName = cleanedNewName else { return }
        store.renameGroup(newName, in: group)
    }
}

/// Choix d'un musicien à inviter (leader uniquement).
struct InviteMemberSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let group: GroupChat
    @State private var query = ""
    @State private var kind: GroupMemberKind = .specialGuest

    private var candidates: [Musician] {
        // Ni les membres actuels, ni les invités en attente de réponse.
        let pendingIDs = Set((store.pendingInvitesByGroup[group.id] ?? []).map(\.profileID))
        let base = store.musicians.filter {
            !group.memberNames.contains($0.name) && !pendingIDs.contains($0.id)
        }
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return base.sorted { store.rank($0, $1) } }
        return base
            .filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
            .sorted { store.rank($0, $1) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Type d'invitation", selection: $kind) {
                        Text(verbatim: "🌠 Special guest").tag(GroupMemberKind.specialGuest)
                        Text("Membre permanent").tag(GroupMemberKind.permanent)
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text(kind == .specialGuest
                         ? "Le Special guest est identifié par 🌠 et reste un membre temporaire jusqu'à ce que tu le passes en permanent ou le retires."
                         : "Le membre permanent rejoint le noyau fixe du groupe.")
                }

                Section("Musiciens") {
                    ForEach(candidates) { musician in
                        Button {
                            store.inviteMember(musician.name, to: group, kind: kind)
                            dismiss()
                        } label: {
                            HStack(spacing: 10) {
                                AvatarView(name: musician.name, size: 38, photo: musician.photo)
                                VStack(alignment: .leading, spacing: 1) {
                                    HStack(spacing: 6) {
                                        Text(musician.name)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(.primary)
                                        if musician.isDemo { DemoAccountBadge() }
                                    }
                                    Text(verbatim: musician.handle)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if kind == .specialGuest {
                                    Text(verbatim: "🌠")
                                        .font(.title3)
                                        .accessibilityLabel(Text("Special guest"))
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .searchable(text: $query, prompt: Text("Nom du musicien…"))
            .navigationTitle("Inviter un musicien")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Détail d'un événement (setlist)

/// La setlist d'un événement : le leader ajoute et valide, les membres
/// suggèrent. Bouton SOS pré-rempli si un membre lâche.
struct GroupEventSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    let eventID: GroupEvent.ID
    /// En sheet, la vue fournit sa propre NavigationStack et un bouton OK.
    /// Depuis Sessions ou l'accueil elle s'insère dans la pile existante :
    /// on ne montre alors que le détail de cette date.
    var presentedModally = true
    @State private var addingSong = false
    /// Série : on demande si on annule cette date ou toutes les suivantes.
    @State private var confirmingDelete = false
    /// Édition de la date (heure, jour, lieu, titre) — leader.
    @State private var editing = false
    /// Musicien en cours d'invitation (un tap).
    @State private var invitingName: String?
    /// SOS pré-rempli depuis cette date précise.
    @State private var sosEvent: GroupEvent?
    /// Ordre optimiste pendant le drag ; sauvegardé dans `group_events.setlist`
    /// au lâcher du doigt.
    @State private var setlistOrder: [Song.ID] = []
    @State private var setlistDragSession = OrderedUUIDDragSession()
    @State private var setlistRowFrames: [UUID: CGRect] = [:]
    @State private var setlistViewportHeight: CGFloat = 0

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }
    private var event: GroupEvent? {
        group?.allEvents.first { $0.id == eventID }
    }
    /// Le leader reste administrateur même si son abonnement expire.
    private var isLeader: Bool {
        group.map { store.canLead($0) } ?? false
    }

    private var cancellationTitle: LocalizedStringKey {
        event?.isRecurring == true
            ? "Cette date ou toute la série ?"
            : "Annuler cette session ?"
    }

    var body: some View {
        Group {
            if presentedModally {
                NavigationStack { eventDetail }
            } else {
                eventDetail
            }
        }
        .onAppear {
            setlistOrder = event?.setlist.filter(\.isApproved).map(\.id) ?? []
        }
        .onChange(of: event?.setlist.filter(\.isApproved).map(\.id) ?? []) { _, ids in
            guard setlistDragSession.draggingID == nil else { return }
            setlistOrder = ids
        }
    }

    private var eventDetail: some View {
            ZStack {
                JCBackground()
                if let group, let event {
                    ScrollViewReader { scrollProxy in
                        ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            JCCard {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 8) {
                                        Image(systemName: event.kind.symbol)
                                            .font(.title3.weight(.bold))
                                            .foregroundStyle(JC.primaryAccent)
                                        Text(event.title)
                                            .font(.subheadline.weight(.heavy))
                                        Spacer()
                                        EventKindBadge(kind: event.kind)
                                    }
                                    Label(event.date.formatted(date: .complete, time: .shortened), systemImage: "calendar")
                                        .font(.caption)
                                    Label(event.venue, systemImage: "mappin.and.ellipse")
                                        .font(.caption)
                                    if let exactAddress = event.exactAddress,
                                       event.resolvedPrivateLocationState == .available {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Label("Rendez-vous privé", systemImage: "lock.open.fill")
                                                .font(.caption.weight(.bold))
                                                .foregroundStyle(JC.feutrine)
                                            Text(verbatim: exactAddress)
                                                .font(.caption)
                                        }
                                        .padding(10)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(
                                            JC.feutrine.opacity(0.10),
                                            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        )
                                    } else if event.resolvedPrivateLocationState == .unknown {
                                        Label(
                                            "Adresse privée non chargée — réessaie dans un instant",
                                            systemImage: "exclamationmark.arrow.triangle.2.circlepath"
                                        )
                                        .font(.caption)
                                        .foregroundStyle(JC.signal)
                                    } else {
                                        Label(
                                            store.isLeader(of: group)
                                                && event.resolvedPrivateLocationState == .absent
                                                ? "Aucune adresse privée renseignée"
                                                : "Adresse révélée après confirmation de présence",
                                            systemImage: "lock.shield.fill"
                                        )
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    }
                                    if let recurrence = event.recurrence, event.isRecurring {
                                        let remaining = store.remainingOccurrences(of: event, in: group)
                                        Label(
                                            String(
                                                format: store.tr("%@ · %lld dates à venir"),
                                                store.tr(recurrence.rawValue), remaining
                                            ),
                                            systemImage: "repeat"
                                        )
                                        .font(.caption)
                                        .foregroundStyle(JC.feutrine)
                                    }
                                    reminderRow(event: event, isLeader: isLeader)
                                }
                            }

                            attendanceCard(event: event, group: group)

                            // Des musiciens ont déjà coché ce jour-là : on les
                            // propose là où le trou se voit — dans l'événement,
                            // pas sur l'accueil comme jusqu'en 1.6.
                            availableInviteRow(event: event, group: group)

                            // Les SOS de ce concert se gèrent ici même : le
                            // leader accepte le remplaçant sans changer d'écran.
                            sosCard(event: event)

                            // Un membre lâche ? SOS pré-rempli — le réflexe
                            // Dispo. Publier au nom du groupe engage le
                            // groupe : c'est au leader de le faire. (Un SOS
                            // personnel, lui, reste ouvert à tout le monde
                            // depuis l'onglet SOS.)
                            if isLeader {
                            Button {
                                sosEvent = event
                            } label: {
                                Label("Un membre lâche ? Publier un SOS", systemImage: "bolt.fill")
                                    .font(.subheadline.weight(.bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(JC.signal, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .foregroundStyle(.white)
                            }
                            .buttonStyle(PressableStyle())
                            }

                            Button {
                                addingSong = true
                            } label: {
                                Label(
                                    isLeader ? "Ajouter à la setlist" : "Suggérer pour la setlist",
                                    systemImage: "plus.circle.fill"
                                )
                                .font(.subheadline.weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(JC.bronze.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .foregroundStyle(JC.bronze)
                            }
                            .buttonStyle(PressableStyle())

                            let pending = event.setlist.filter { !$0.isApproved }
                            if !pending.isEmpty {
                                SectionHeader(
                                    title: "Suggestions",
                                    subtitle: isLeader ? "À valider — c'est toi qui décides" : "En attente du leader"
                                )
                                ForEach(pending) { song in
                                    SongRow(song: song, isLeader: isLeader, onApprove: {
                                        store.approveSong(song, in: groupID, eventID: eventID)
                                    }, onReject: {
                                        store.rejectSong(song, in: groupID, eventID: eventID)
                                    }, groupID: groupID, eventID: eventID)
                                }
                            }

                            let approved = orderedApprovedSongs(in: event)
                            SectionHeader(title: "Setlist", subtitle: "\(approved.count) morceaux")
                            if isLeader, approved.count > 1 {
                                Label("Maintiens une tuile puis glisse-la pour changer l'ordre.", systemImage: "hand.draw")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            if approved.isEmpty {
                                Text("Setlist vide — pioche dans le répertoire du groupe ou ajoute des morceaux.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            ForEach(Array(approved.enumerated()), id: \.element.id) { index, song in
                                Group {
                                    if isLeader {
                                        OrderedUUIDDragHandle(
                                            id: song.id,
                                            accessibilityLabel: "Déplacer le morceau",
                                            coordinateSpace: "event-setlist-reorder",
                                            orderedIDs: $setlistOrder,
                                            session: $setlistDragSession,
                                            rowFrames: setlistRowFrames,
                                            viewportHeight: setlistViewportHeight,
                                            onAutoScroll: { id, anchor in
                                                withAnimation(.snappy(duration: 0.2)) {
                                                    scrollProxy.scrollTo(id, anchor: anchor)
                                                }
                                            },
                                            onCommit: { ids in
                                                store.reorderApprovedSetlist(ids, eventID: eventID, in: groupID)
                                            }
                                        ) {
                                            HStack(spacing: 8) {
                                                Text(verbatim: "\(index + 1).")
                                                    .font(.caption.weight(.heavy))
                                                    .foregroundStyle(.tertiary)
                                                    .frame(width: 22, alignment: .trailing)
                                                SongRow(
                                                    song: song,
                                                    isLeader: false,
                                                    onApprove: nil,
                                                    onReject: { store.rejectSong(song, in: groupID, eventID: eventID) },
                                                    groupID: groupID,
                                                    eventID: eventID
                                                )
                                            }
                                        }
                                    } else {
                                        HStack(spacing: 8) {
                                            Text(verbatim: "\(index + 1).")
                                                .font(.caption.weight(.heavy))
                                                .foregroundStyle(.tertiary)
                                                .frame(width: 22, alignment: .trailing)
                                            SongRow(
                                                song: song,
                                                isLeader: false,
                                                groupID: groupID,
                                                eventID: eventID
                                            )
                                        }
                                    }
                                }
                                .orderedUUIDFrame(song.id, in: "event-setlist-reorder")
                                .id(song.id)
                                .opacity(setlistDragSession.draggingID == song.id ? 0.58 : 1)
                                .scaleEffect(setlistDragSession.draggingID == song.id ? 0.985 : 1)
                                .animation(.snappy(duration: 0.18), value: setlistDragSession.draggingID)
                            }

                            if isLeader {
                                Button(role: .destructive) {
                                    confirmingDelete = true
                                } label: {
                                    Label("Annuler la session", systemImage: "calendar.badge.minus")
                                        .font(.caption.weight(.bold))
                                        .frame(maxWidth: .infinity)
                                }
                                .padding(.top, 8)
                            }
                        }
                            .padding(18)
                        }
                        .coordinateSpace(name: "event-setlist-reorder")
                        .background {
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: OrderedUUIDViewportHeightPreferenceKey.self,
                                    value: proxy.size.height
                                )
                            }
                        }
                        .onPreferenceChange(OrderedUUIDFramePreferenceKey.self) { frames in
                            setlistRowFrames = frames
                        }
                        .onPreferenceChange(OrderedUUIDViewportHeightPreferenceKey.self) { height in
                            setlistViewportHeight = height
                        }
                    }
                }
            }
            .navigationTitle("Événement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if isLeader {
                        Button("Modifier") { editing = true }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if presentedModally {
                        Button("OK") { dismiss() }.font(.headline)
                    }
                }
            }
            .sheet(isPresented: $editing) {
                if let group, let event {
                    EditGroupEventSheet(group: group, event: event)
                }
            }
            .sheet(isPresented: $addingSong) {
                AddSongSheet(groupID: groupID, eventID: eventID)
                    .presentationDetents([.medium])
            }
            .sheet(item: $sosEvent) { event in
                CreateEventView(
                    prefillTitle: event.title,
                    prefillPlace: event.venue,
                    prefillDate: event.date,
                    prefillInstruments: group.map { store.missingRoles(event, in: $0) } ?? [],
                    groupID: groupID,
                    eventID: event.id
                )
            }
            .confirmationDialog(
                cancellationTitle,
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                if let group, let event {
                    if event.isRecurring {
                        Button("Annuler cette date seulement", role: .destructive) {
                            store.cancelEvent(event, from: group)
                            dismiss()
                        }
                        Button("Annuler toutes les dates à venir", role: .destructive) {
                            store.cancelSeries(of: event, from: group)
                            dismiss()
                        }
                    } else {
                        Button("Annuler et prévenir les membres", role: .destructive) {
                            store.cancelEvent(event, from: group)
                            dismiss()
                        }
                    }
                }
                Button("Ne rien annuler", role: .cancel) {}
            } message: {
                Text("La session disparaîtra des agendas et les autres membres recevront une notification.")
            }
    }

    private func orderedApprovedSongs(in event: GroupEvent) -> [Song] {
        let approved = event.setlist.filter(\.isApproved)
        guard !setlistOrder.isEmpty else { return approved }
        let byID = Dictionary(uniqueKeysWithValues: approved.map { ($0.id, $0) })
        let ordered = setlistOrder.compactMap { byID[$0] }
        let known = Set(ordered.map(\.id))
        return ordered + approved.filter { !known.contains($0.id) }
    }

    private func moveSetlistSong(
        _ songID: Song.ID,
        by offset: Int,
        in event: GroupEvent
    ) {
        var ids = setlistOrder.isEmpty
            ? event.setlist.filter(\.isApproved).map(\.id)
            : setlistOrder
        guard let source = ids.firstIndex(of: songID) else { return }
        let destination = source + offset
        guard ids.indices.contains(destination) else { return }
        ids.swapAt(source, destination)
        setlistOrder = ids
        UISelectionFeedbackGenerator().selectionChanged()
        store.reorderApprovedSetlist(ids, eventID: eventID, in: groupID)
    }

    /// Musiciens hors du groupe qui ont déjà coché ce jour-là — invitation en
    /// un tap. N'apparaît que pour le leader et que s'il manque du monde :
    /// une proposition qui tombe quand il n'y a rien à combler est du bruit.
    @ViewBuilder
    private func availableInviteRow(event: GroupEvent, group: GroupChat) -> some View {
        if isLeader, !store.isLineupComplete(event, in: group) {
            let invitees = store.availableInvitees(for: event, in: group)
            if !invitees.isEmpty {
                JCCard {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: "person.badge.plus")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(JC.bronze)
                            Text("Dispos ce jour-là")
                                .font(.subheadline.weight(.bold))
                            Spacer(minLength: 0)
                            Text(verbatim: "\(invitees.count)")
                                .font(JCFont.monoBold(11))
                                .foregroundStyle(JC.bronze)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(JC.bronze.opacity(0.14), in: Capsule())
                        }
                        Text("Un tap pour inviter — la personne rejoint cet événement, pas le groupe.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(invitees.prefix(12)) { musician in
                                    VStack(spacing: 8) {
                                        AvatarView(name: musician.name, size: 48, photo: musician.photo)
                                        Text(musician.name.split(separator: " ").first.map(String.init) ?? musician.name)
                                            .font(.caption2.weight(.semibold))
                                            .lineLimit(1)
                                            .frame(width: 68)
                                        if musician.isDemo { DemoAccountBadge() }
                                        Button {
                                            guard invitingName == nil else { return }
                                            invitingName = musician.name
                                            Task {
                                                await store.inviteAvailable(musician, to: event, in: group)
                                                invitingName = nil
                                            }
                                        } label: {
                                            HStack(spacing: 4) {
                                                if invitingName == musician.name {
                                                    ProgressView().controlSize(.mini)
                                                } else {
                                                    Image(systemName: "paperplane.fill")
                                                        .font(.system(size: 9, weight: .bold))
                                                }
                                                Text("Inviter")
                                                    .font(.caption2.weight(.heavy))
                                            }
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(JC.bronze, in: Capsule())
                                        }
                                        .buttonStyle(PressableStyle())
                                        .disabled(invitingName != nil)
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
        }
    }

    /// Quand le rappel part — et, pour le leader, de quoi le changer. Le
    /// délai vaut pour tout le groupe : chaque appareil planifie le sien.
    @ViewBuilder
    private func reminderRow(event: GroupEvent, isLeader: Bool) -> some View {
        if isLeader && store.canUse(.configurableReminders) {
            Menu {
                ForEach(GroupEvent.reminderLeadOptions, id: \.self) { days in
                    Button {
                        store.setReminderLead(days, forEventID: event.id, in: groupID)
                    } label: {
                        if event.reminderLead == days {
                            Label(store.reminderLeadLabel(days), systemImage: "checkmark")
                        } else {
                            Text(store.reminderLeadLabel(days))
                        }
                    }
                }
            } label: {
                Label(
                    String(format: store.tr("Rappel : %@"), store.reminderLeadLabel(event.reminderLead)),
                    systemImage: "bell.badge"
                )
                .font(.caption)
                .foregroundStyle(JC.laiton)
            }
        } else if isLeader {
            Button { store.showPaywall = true } label: {
                HStack(spacing: 6) {
                    Label(
                        String(format: store.tr("Rappel : %@"), store.reminderLeadLabel(event.reminderLead)),
                        systemImage: "bell.badge"
                    )
                    Spacer(minLength: 4)
                    Text("Premium")
                        .font(.caption2.weight(.heavy))
                }
                .font(.caption)
                .foregroundStyle(JC.laiton)
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text("Ouvre les offres Premium pour personnaliser le rappel"))
        } else {
            Label(
                String(format: store.tr("Rappel : %@"), store.reminderLeadLabel(event.reminderLead)),
                systemImage: "bell"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    /// Confirmation de présence — un tap Oui / Non, plus le tableau pour le leader.
    @ViewBuilder
    private func attendanceCard(event: GroupEvent, group: GroupChat) -> some View {
        let myStatus = store.myAttendance(for: event)
        let pending = store.pendingAttendance(for: event, in: group)
        let available = store.availableNames(for: event, in: group)
        let unavailable = store.unavailableMembers(for: event, in: group).map(\.name)

        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                lineupBanner(event: event, group: group)

                HStack {
                    Label("Ta présence", systemImage: "person.crop.circle.badge.questionmark")
                        .font(.subheadline.weight(.bold))
                    Spacer()
                    Text("\(available.count)/\(store.roster(of: group).count)")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(JC.bronze)
                }

                // Le décompte : combien de temps il reste pour répondre.
                if myStatus == .pending {
                    HStack(spacing: 8) {
                        ConfirmCountdownBadge(event: event, compact: false)
                        Text(String(
                            format: store.tr("Réponse attendue avant le %@"),
                            event.confirmDeadline.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute())
                        ))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                }

                HStack(spacing: 10) {
                    attendanceButton(
                        title: "Dispo",
                        symbol: "checkmark.circle.fill",
                        color: JC.feutrine,
                        selected: myStatus == .available
                    ) {
                        store.setAttendance(.available, eventID: eventID, in: groupID)
                    }
                    attendanceButton(
                        title: "Indispo",
                        symbol: "xmark.circle.fill",
                        color: JC.signal,
                        selected: myStatus == .unavailable
                    ) {
                        store.setAttendance(.unavailable, eventID: eventID, in: groupID)
                    }
                }

                if myStatus == .pending {
                    Text("Un rappel te sera envoyé pour confirmer.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else if myStatus == .unavailable {
                    Text("Le leader est alerté pour trouver un remplaçant.")
                        .font(.caption2)
                        .foregroundStyle(JC.signal)
                }

                Divider().opacity(0.4)

                attendanceSummaryRow(title: "Dispo", names: available, color: JC.feutrine)
                attendanceSummaryRow(title: "Indispo", names: unavailable, color: JC.signal)
                attendanceSummaryRow(title: "En attente", names: pending, color: .secondary)

                // Les invités d'un soir : trouvés par SOS, ils jouent CE
                // concert et n'entrent pas dans le groupe.
                let guests = store.guests(for: event)
                if !guests.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Circle().fill(JC.laiton).frame(width: 7, height: 7)
                            Text("Invités")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(JC.laiton)
                            Text(verbatim: "· \(guests.count)")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        ForEach(guests) { guest in
                            HStack(spacing: 8) {
                                AvatarView(name: guest.name, size: 26, photo: guest.photoURL)
                                Text(guest.name)
                                    .font(.caption.weight(.semibold))
                                if let instrument = guest.instrument {
                                    Text(LocalizedStringKey(instrument.rawValue))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                TagView(text: "Invité", color: JC.laiton)
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
            }
        }
    }

    /// L'état du line-up en tête de la carte de présence : vert quand tout le
    /// monde est là (remplaçants compris), rouge quand la date limite est
    /// passée et qu'il manque encore quelqu'un.
    @ViewBuilder
    private func lineupBanner(event: GroupEvent, group: GroupChat) -> some View {
        let state = store.lineupState(event, in: group)
        let missing = store.missingRoles(event, in: group)
        if state != .forming {
            HStack(spacing: 8) {
                Image(systemName: state == .complete ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.bold))
                VStack(alignment: .leading, spacing: 1) {
                    Text(state == .complete
                         ? LocalizedStringKey("Line-up complet")
                         : LocalizedStringKey("Il manque du monde"))
                        .font(.caption.weight(.heavy))
                    Text(state == .complete
                         ? "Tout le monde est là — le concert peut se jouer."
                         : (missing.isEmpty
                            ? "La date limite de réponse est passée."
                            : "Postes à pourvoir : \(missing.map { store.tr($0.rawValue) }.joined(separator: ", "))"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(state == .complete ? JC.feutrine : JC.signal)
            .padding(10)
            .background(
                (state == .complete ? JC.feutrine : JC.signal).opacity(0.12),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
        }
    }

    /// Les SOS lancés pour ce concert, avec leurs candidats : le leader
    /// accepte ou écarte sans quitter l'événement.
    @ViewBuilder
    private func sosCard(event: GroupEvent) -> some View {
        let gigs = store.gigs(for: event).filter(\.isMine)
        if !gigs.isEmpty {
            JCCard {
                VStack(alignment: .leading, spacing: 12) {
                    Label("SOS en cours pour ce concert", systemImage: "bolt.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(JC.signal)
                    ForEach(gigs) { gig in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Text(gig.wantedInstruments.map { store.tr($0.rawValue) }.joined(separator: " · "))
                                    .font(.caption.weight(.bold))
                                Spacer(minLength: 0)
                                if gig.isFilled {
                                    TagView(text: "Pourvu", color: JC.feutrine)
                                } else {
                                    let waiting = store.pendingApplicants(for: gig).count
                                    // Typage explicite : une interpolation non
                                    // typée deviendrait une String et perdrait
                                    // sa clé de traduction.
                                    let todo: LocalizedStringKey = "\(waiting) à traiter"
                                    TagView(
                                        text: waiting == 0 ? LocalizedStringKey("En attente de candidats") : todo,
                                        color: waiting == 0 ? JC.bronze : JC.signal
                                    )
                                }
                            }
                            ForEach(store.applicantsByGig[gig.id] ?? []) { applicant in
                                ApplicantDecisionRow(applicant: applicant, gig: gig)
                            }
                        }
                    }
                }
            }
            .task { for gig in gigs { store.loadApplicants(for: gig) } }
        }
    }

    private func attendanceButton(
        title: LocalizedStringKey,
        symbol: String,
        color: Color,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                Text(title)
                    .font(.subheadline.weight(.bold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                selected ? color.opacity(0.18) : JC.cardStroke.opacity(0.35),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .foregroundStyle(selected ? color : .secondary)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(selected ? color.opacity(0.55) : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(PressableStyle())
    }

    private func attendanceSummaryRow(title: LocalizedStringKey, names: [String], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(color)
                Text(verbatim: "· \(names.count)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            if names.isEmpty {
                Text("—")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else {
                Text(names.map { $0 == store.profile.name ? store.tr("Toi") : $0 }.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Ajouter un morceau

/// Ajout / suggestion d'un morceau avec autocomplétion catalogue. Choisir un
/// résultat remplit l'artiste, l'identifiant stable, la pochette, l'album, la
/// durée et les liens exacts ; la tonalité est proposée depuis l'extrait.
struct AddSongSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    let eventID: GroupEvent.ID?

    @State private var title = ""
    @State private var artist = ""
    @State private var key = ""
    @State private var tempo = ""
    @State private var form = ""
    @State private var matches: [SongCatalogMatch] = []
    @State private var selectedMatch: SongCatalogMatch?
    @State private var isSearching = false
    @State private var isDetectingKey = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }

    private var searchQuery: String {
        "\(title.trimmingCharacters(in: .whitespacesAndNewlines)) \(artist.trimmingCharacters(in: .whitespacesAndNewlines))"
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titre", text: $title)
                        .textInputAutocapitalization(.words)
                        .onChange(of: title) { _, value in
                            if value != selectedMatch?.title { selectedMatch = nil }
                        }
                    TextField("Artiste", text: $artist)
                        .textInputAutocapitalization(.words)
                        .onChange(of: artist) { _, value in
                            if value != selectedMatch?.artist { selectedMatch = nil }
                        }
                    Picker("Tonalité", selection: $key) {
                        Text("Non renseignée").tag("")
                        ForEach(MusicalKey.allKeys, id: \.self) { musicalKey in
                            Text(verbatim: musicalKey.label).tag(musicalKey.label)
                        }
                    }
                    TextField("Tempo (BPM)", text: $tempo)
                        .keyboardType(.numberPad)
                    TextField("Forme", text: $form)
                        .textInputAutocapitalization(.characters)
                    if isDetectingKey {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Analyse de la tonalité…")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    Text("Choisis le bon enregistrement : l'artiste, la pochette, les liens et les métadonnées se remplissent automatiquement. La tonalité proposée reste modifiable.")
                }

                if isSearching || !matches.isEmpty {
                    Section("Morceaux trouvés") {
                        if isSearching && matches.isEmpty {
                            HStack(spacing: 9) {
                                ProgressView()
                                Text("Recherche du morceau…")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        ForEach(matches) { match in
                            Button { select(match) } label: {
                                HStack(spacing: 11) {
                                    if let artwork = match.artworkURL, let url = URL(string: artwork) {
                                        AsyncImage(url: url) { image in
                                            image.resizable().scaledToFill()
                                        } placeholder: {
                                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                .fill(JC.inset)
                                        }
                                        .frame(width: 46, height: 46)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    }
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(match.title)
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(.primary)
                                        Text(match.artist)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text(metadataLine(for: match))
                                            .font(.caption2)
                                            .foregroundStyle(.tertiary)
                                            .lineLimit(1)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: selectedMatch?.id == match.id ? "checkmark.circle.fill" : "plus.circle")
                                        .foregroundStyle(JC.bronze)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let selectedMatch {
                    Section("Enregistrement sélectionné") {
                        LabeledContent("ID catalogue", value: selectedMatch.catalogID)
                        if let album = selectedMatch.albumTitle, !album.isEmpty {
                            LabeledContent("Album", value: album)
                        }
                        if let year = selectedMatch.releaseYear {
                            LabeledContent("Année", value: String(year))
                        }
                        if let duration = selectedMatch.durationLabel {
                            LabeledContent("Durée", value: duration)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Ajouter un morceau")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        save()
                    }
                    .font(.headline)
                    .disabled(!isValid)
                }
            }
            .task(id: searchQuery) {
                guard selectedMatch == nil, searchQuery.count >= 2 else {
                    matches = []
                    isSearching = false
                    return
                }
                isSearching = true
                do {
                    try await Task.sleep(for: .milliseconds(350))
                    guard !Task.isCancelled else { return }
                    matches = await SongCatalog.search(searchQuery)
                } catch {
                    return
                }
                isSearching = false
            }
            .alert("Morceau non ajouté", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func select(_ match: SongCatalogMatch) {
        selectedMatch = match
        title = match.title
        artist = match.artist
        matches = []
        isSearching = false
        isDetectingKey = match.previewURL != nil
        Task {
            let analysis = await SongKeyDetector.analyze(from: match.previewURL)
            guard selectedMatch?.id == match.id else { return }
            if let detected = analysis?.key { key = detected.label }
            if let detectedTempo = analysis?.tempoBPM { tempo = String(detectedTempo) }
            isDetectingKey = false
        }
    }

    private func metadataLine(for match: SongCatalogMatch) -> String {
        [
            match.albumTitle,
            match.releaseYear.map(String.init),
            match.durationLabel
        ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: " · ")
    }

    private func save() {
        isSaving = true
        let immediate = store.addSong(
                            title: title.trimmingCharacters(in: .whitespaces),
                            artist: artist.trimmingCharacters(in: .whitespaces),
                            key: key.isEmpty ? nil : key,
                            tempoBPM: Int(tempo).flatMap { (30...300).contains($0) ? $0 : nil },
                            form: form,
                            catalogMatch: selectedMatch,
                            to: groupID,
                            eventID: eventID
        ) { outcome in
            isSaving = false
            switch outcome {
            case .succeeded:
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                dismiss()
            case .alreadyExists:
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                errorMessage = store.tr("Ce morceau est déjà dans cette destination.")
            case .failed:
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                errorMessage = store.tr("Le morceau n'a pas pu être ajouté. Vérifie le réseau puis réessaie.")
            }
        }
        if immediate == .alreadyExists {
            isSaving = false
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            errorMessage = store.tr("Ce morceau est déjà dans cette destination.")
        } else if immediate == .failed {
            isSaving = false
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            errorMessage = store.tr("Le morceau n'a pas pu être ajouté. Vérifie le réseau puis réessaie.")
        }
    }
}

/// Édition d'un morceau existant. Réservée au leader : le changement est
/// propagé au répertoire et à toutes les setlists qui utilisent ce morceau.
struct EditSongSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    let song: Song

    @State private var title: String
    @State private var artist: String
    @State private var key: String
    @State private var tempo: String
    @State private var form: String

    init(groupID: GroupChat.ID, song: Song) {
        self.groupID = groupID
        self.song = song
        _title = State(initialValue: song.title)
        _artist = State(initialValue: song.artist)
        _key = State(initialValue: song.keyBadgeLabel ?? "")
        _tempo = State(initialValue: song.tempoBPM.map(String.init) ?? "")
        _form = State(initialValue: song.form ?? "")
    }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titre", text: $title)
                    TextField("Artiste", text: $artist)
                    Picker("Tonalité", selection: $key) {
                        Text("Non renseignée").tag("")
                        ForEach(MusicalKey.allKeys, id: \.self) { musicalKey in
                            Text(verbatim: musicalKey.label).tag(musicalKey.label)
                        }
                    }
                    TextField("Tempo (BPM)", text: $tempo)
                        .keyboardType(.numberPad)
                    TextField("Forme", text: $form)
                        .textInputAutocapitalization(.characters)
                } header: {
                    Text("Morceau")
                } footer: {
                    Text("Le changement apparaît aussi dans les setlists où ce morceau est déjà prévu.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Modifier le morceau")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        guard let group = store.groups.first(where: { $0.id == groupID }) else { return }
                        store.editSong(
                            song,
                            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                            artist: artist.trimmingCharacters(in: .whitespacesAndNewlines),
                            key: key.isEmpty ? nil : key,
                            tempoBPM: Int(tempo).flatMap { (30...300).contains($0) ? $0 : nil },
                            form: form,
                            in: group
                        )
                        dismiss()
                    }
                    .font(.headline)
                    .disabled(!isValid)
                }
            }
        }
    }
}

// MARK: - Créer un événement

struct AddGroupEventSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let group: GroupChat

    @State private var kind: GroupEventKind = .concert
    @State private var title = ""
    @State private var venue = ""
    @State private var exactAddress = ""
    @State private var country: Country = .switzerland
    @State private var postalCode = ""
    @State private var city = ""
    @State private var date = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    /// Rythme : ponctuel, ou une série (répétition hebdomadaire…).
    @State private var recurrence: EventRecurrence = .once
    /// Nombre de dates générées quand l'événement se répète.
    @State private var occurrences = 8
    /// Combien de jours avant l'événement chacun est prévenu.
    @State private var reminderLeadDays = GroupEvent.defaultReminderLeadDays

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !venue.trimmingCharacters(in: .whitespaces).isEmpty &&
        PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete
    }

    /// Les dates réellement créées — affichées avant validation, pour qu'on
    /// voie ce qu'on ajoute au calendrier du groupe.
    private var plannedDates: [Date] {
        GroupEvent.occurrenceDates(from: date, recurrence: recurrence, count: occurrences)
    }

    /// Plafond du rythme choisi : une série ne dépasse jamais un an.
    private var maxOccurrences: Int {
        max(2, GroupEvent.maxOccurrences(for: recurrence))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("L'événement") {
                    FlowLayout(spacing: 8) {
                        ForEach(GroupEventKind.allCases) { kind in
                            ChoiceChip(
                                label: LocalizedStringKey(kind.rawValue),
                                symbol: kind.symbol,
                                isSelected: self.kind == kind
                            ) { self.kind = kind }
                        }
                    }
                    TextField("Titre — ex. Soirée salsa", text: $title)
                    TextField("Salle ou bar — ex. Le Chat Noir", text: $venue)
                    CountryPostalField(
                        country: $country,
                        postalCode: $postalCode,
                        city: $city,
                        detectedCountry: store.detectedCountry
                    )
                    DatePicker("Date et heure", selection: $date, in: Date()...)
                    TextField("Adresse privée — rue, numéro, entrée…", text: $exactAddress, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section {
                    Label("L'adresse exacte n'est visible que par le leader et les personnes qui confirment leur présence.", systemImage: "lock.shield.fill")
                        .font(.caption)
                        .foregroundStyle(JC.feutrine)
                } header: {
                    Text("Confidentialité du rendez-vous")
                }

                Section {
                    if store.canUse(.recurringEvents) {
                        Picker("Ça se répète", selection: $recurrence) {
                            ForEach(EventRecurrence.allCases) { option in
                                Text(LocalizedStringKey(option.rawValue)).tag(option)
                            }
                        }
                        // Passer d'hebdomadaire à mensuel réduit le plafond :
                        // on ramène le compteur dans les clous.
                        .onChange(of: recurrence) { _, _ in
                            occurrences = min(occurrences, maxOccurrences)
                        }
                    } else {
                        LabeledContent("Ça se répète", value: "Une seule fois")
                        Button { store.showPaywall = true } label: {
                            HStack {
                                Label("Planifier toute une série", systemImage: "repeat")
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text("Premium")
                                    .font(.caption2.weight(.heavy))
                                    .foregroundStyle(JC.laiton)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(Text("Ouvre les offres Premium"))
                    }
                    if recurrence != .once {
                        Stepper(value: $occurrences, in: 2...maxOccurrences) {
                            Text(String(format: store.tr("%lld dates"), occurrences))
                        }
                        if occurrences >= maxOccurrences {
                            Label("Maximum : un an de dates.", systemImage: "info.circle")
                                .font(.caption)
                                .foregroundStyle(JC.laiton)
                        }
                        if let last = plannedDates.last {
                            Label(
                                String(
                                    format: store.tr("Jusqu'au %@"),
                                    last.formatted(.dateTime.weekday(.wide).day().month(.wide).year())
                                ),
                                systemImage: "calendar.badge.clock"
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Rythme")
                } footer: {
                    Text(recurrence == .once
                         ? "Une date unique. Les événements qui reviennent sont affichés dans une autre couleur."
                         : "Chaque date a sa propre setlist et sa propre feuille de présence — tu pourras en annuler une sans toucher aux autres. Une série va au maximum jusqu'à un an.")
                }

                Section {
                    if store.canUse(.configurableReminders) {
                        Picker("Prévenir le groupe", selection: $reminderLeadDays) {
                            ForEach(GroupEvent.reminderLeadOptions, id: \.self) { days in
                                Text(store.reminderLeadLabel(days)).tag(days)
                            }
                        }
                    } else {
                        LabeledContent(
                            "Prévenir le groupe",
                            value: store.reminderLeadLabel(GroupEvent.defaultReminderLeadDays)
                        )
                        Button { store.showPaywall = true } label: {
                            HStack {
                                Label("Choisir le moment du rappel", systemImage: "bell.badge")
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text("Premium")
                                    .font(.caption2.weight(.heavy))
                                    .foregroundStyle(JC.laiton)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(Text("Ouvre les offres Premium"))
                    }
                } header: {
                    Text("Rappel")
                } footer: {
                    Text(store.canUse(.configurableReminders)
                         ? "Chaque membre reçoit un rappel à ce moment-là — pour confirmer sa présence, ou juste ne pas oublier."
                         : "Le rappel gratuit part deux jours avant. Premium permet de choisir le moment exact.")
                }

                if recurrence != .once {
                    Section("Les dates") {
                        ForEach(plannedDates.prefix(12), id: \.self) { planned in
                            Text(planned.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute()))
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                        if plannedDates.count > 12 {
                            Text(String(format: store.tr("+ %lld autres"), plannedDates.count - 12))
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Créer un événement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        let template = GroupEvent(
                            kind: kind,
                            title: title.trimmingCharacters(in: .whitespaces),
                            venue: VenueDraft(
                                name: venue,
                                place: PlaceDraft(country: country, postalCode: postalCode, city: city)
                            ).label,
                            exactAddress: {
                                let value = exactAddress.trimmingCharacters(in: .whitespacesAndNewlines)
                                return value.isEmpty ? nil : value
                            }(),
                            privateLocationState: exactAddress.trimmingCharacters(
                                in: .whitespacesAndNewlines
                            ).isEmpty ? .absent : .available,
                            date: date,
                            reminderLeadDays: reminderLeadDays
                        )
                        store.addEvents(
                            template.occurrences(recurrence: recurrence, count: occurrences),
                            to: group
                        )
                        dismiss()
                    }
                    .font(.headline)
                    .disabled(!isValid)
                }
            }
            .onAppear {
                country = store.profile.country ?? store.preferredCountry
                postalCode = store.profile.postalCode ?? ""
                city = store.profile.city ?? ""
                store.requestLocation()
            }
        }
    }

}

// MARK: - Modifier une date

/// Changer l'heure, le jour, le lieu ou le titre d'une date déjà créée
/// (leader). Sur une série, on choisit si ça vaut pour cette date seulement
/// ou pour toutes les suivantes — auquel cas seule l'HEURE est reportée, les
/// jours de la série ne bougent pas.
struct EditGroupEventSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let group: GroupChat
    let event: GroupEvent

    @State private var title: String
    @State private var venue: String
    @State private var exactAddress: String
    @State private var clearExactAddress = false
    @State private var country: Country
    @State private var postalCode: String
    @State private var city: String
    @State private var date: Date
    @State private var scope: AppStore.EventEditScope = .thisDate

    init(group: GroupChat, event: GroupEvent) {
        self.group = group
        self.event = event
        let parsedVenue = VenueDraft(storageLabel: event.venue, fallbackCountry: .switzerland)
        _title = State(initialValue: event.title)
        _venue = State(initialValue: parsedVenue.name)
        _exactAddress = State(initialValue: event.exactAddress ?? "")
        _country = State(initialValue: parsedVenue.place.country)
        _postalCode = State(initialValue: parsedVenue.place.postalCode)
        _city = State(initialValue: parsedVenue.place.city)
        _date = State(initialValue: event.date)
    }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !venue.trimmingCharacters(in: .whitespaces).isEmpty &&
        PlaceDraft(country: country, postalCode: postalCode, city: city).isComplete
    }

    /// Le jour change-t-il ? C'est ce qui décide si les réponses de présence
    /// sont redemandées.
    private var dayChanges: Bool {
        !Calendar.current.isDate(date, inSameDayAs: event.date)
    }

    /// Combien de dates seront touchées.
    private var affectedCount: Int {
        guard scope == .futureOccurrences else { return 1 }
        return store.remainingOccurrences(of: event, in: group)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("La date") {
                    DatePicker("Date et heure", selection: $date)
                    TextField("Titre", text: $title)
                    TextField("Salle ou bar", text: $venue)
                    CountryPostalField(
                        country: $country,
                        postalCode: $postalCode,
                        city: $city,
                        detectedCountry: store.detectedCountry
                    )
                    TextField("Adresse privée — rue, numéro, entrée…", text: $exactAddress, axis: .vertical)
                        .lineLimit(1...3)
                        .onChange(of: exactAddress) { _, value in
                            if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                clearExactAddress = false
                            }
                        }
                }

                Section {
                    Label("L'adresse exacte reste invisible aux membres qui n'ont pas confirmé leur présence.", systemImage: "lock.shield.fill")
                        .font(.caption)
                        .foregroundStyle(JC.feutrine)
                    switch event.resolvedPrivateLocationState {
                    case .unknown:
                        Label(
                            "L'adresse existante n'a pas pu être chargée. Elle sera conservée si tu ne la remplaces pas.",
                            systemImage: "exclamationmark.arrow.triangle.2.circlepath"
                        )
                        .font(.caption)
                        .foregroundStyle(JC.signal)
                    case .restricted:
                        Label(
                            "L'adresse privée n'est pas accessible. Une saisie vide conservera la valeur serveur.",
                            systemImage: "lock.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    case .absent:
                        Label("Aucune adresse privée enregistrée.", systemImage: "mappin.slash")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    case .available:
                        if clearExactAddress {
                            HStack {
                                Label("L'adresse sera supprimée.", systemImage: "trash.fill")
                                    .font(.caption)
                                    .foregroundStyle(JC.signal)
                                Spacer()
                                Button("Annuler la suppression") {
                                    clearExactAddress = false
                                    exactAddress = event.exactAddress ?? ""
                                }
                                .font(.caption.weight(.semibold))
                            }
                        } else {
                            Button(role: .destructive) {
                                exactAddress = ""
                                clearExactAddress = true
                            } label: {
                                Label("Supprimer l'adresse privée", systemImage: "trash")
                            }
                        }
                    }
                } header: {
                    Text("Rendez-vous privé")
                } footer: {
                    Text("Effacer simplement le champ ne supprime rien : utilise l'action dédiée.")
                }

                if event.isRecurring {
                    Section {
                        Picker("Ça s'applique à", selection: $scope) {
                            Text("Cette date seulement").tag(AppStore.EventEditScope.thisDate)
                            Text("Toutes les dates à venir").tag(AppStore.EventEditScope.futureOccurrences)
                        }
                        .pickerStyle(.inline)
                    } header: {
                        Text("Portée")
                    } footer: {
                        Text(scope == .thisDate
                             ? "Seule cette date bouge. Les autres répétitions gardent leur horaire."
                             : "Le nouvel horaire, le titre et le lieu sont reportés sur les dates à venir. Les jours de la série, eux, ne changent pas.")
                    }
                }

                Section {
                    if dayChanges {
                        Label(
                            "Le jour change : les réponses de présence seront redemandées.",
                            systemImage: "arrow.triangle.2.circlepath"
                        )
                        .font(.caption)
                        .foregroundStyle(JC.signal)
                    }
                    Label(
                        affectedCount > 1
                            ? String(format: store.tr("%lld dates seront modifiées."), Int64(affectedCount))
                            : store.tr("Le groupe est prévenu du changement."),
                        systemImage: "bell.badge"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } footer: {
                    Text("Une seule notification part, même si toute la série se déplace.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Modifier la date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        store.updateEvent(
                            event,
                            in: group,
                            date: date,
                            title: title.trimmingCharacters(in: .whitespaces),
                            venue: VenueDraft(
                                name: venue,
                                place: PlaceDraft(country: country, postalCode: postalCode, city: city)
                            ).label,
                            exactAddressMutation: .editing(
                                currentState: event.resolvedPrivateLocationState,
                                currentAddress: event.exactAddress,
                                draft: exactAddress,
                                clearRequested: clearExactAddress
                            ),
                            scope: scope
                        )
                        dismiss()
                    }
                    .font(.headline)
                    .disabled(!isValid)
                }
            }
            .onAppear {
                if postalCode.isEmpty && city.isEmpty {
                    country = store.profile.country ?? store.preferredCountry
                    postalCode = store.profile.postalCode ?? ""
                    city = store.profile.city ?? ""
                }
                store.requestLocation()
            }
        }
    }
}

extension AppStore {
    /// Libellé lisible d'un délai de rappel — « La veille », « 2 jours avant ».
    func reminderLeadLabel(_ days: Int) -> String {
        switch days {
        case 0: return tr("Le jour même")
        case 1: return tr("La veille")
        case 7: return tr("Une semaine avant")
        case 14: return tr("Deux semaines avant")
        default: return String(format: tr("%lld jours avant"), days)
        }
    }
}

// MARK: - Nouveau groupe

/// Création d'un groupe. Le premier groupe dirigé est gratuit ; Premium
/// permet d'en diriger plusieurs. Le créateur devient leader.
struct NewGroupSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var emoji = "🎶"
    @State private var members: Set<String> = []

    private let emojis = ["🎶", "🎷", "🪘", "🎸", "🎹", "🎺", "🥁", "🎻", "🎤", "⚡"]

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !members.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nom — ex. Latin Vibes Quartet", text: $name)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(emojis, id: \.self) { option in
                                Button {
                                    emoji = option
                                } label: {
                                    Text(option)
                                        .font(.title3)
                                        .padding(8)
                                        .background(
                                            emoji == option ? JC.bronze.opacity(0.2) : .clear,
                                            in: Circle()
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } header: {
                    Text("Le groupe")
                } footer: {
                    Text("Tu seras le leader : membres, répertoire et événements passent par toi.")
                }

                Section {
                    ForEach(store.musicians.sorted { store.rank($0, $1) }) { musician in
                        Button {
                            if members.contains(musician.name) {
                                members.remove(musician.name)
                            } else {
                                members.insert(musician.name)
                            }
                        } label: {
                            HStack(spacing: 10) {
                                AvatarView(name: musician.name, size: 34, photo: musician.photo)
                                VStack(alignment: .leading, spacing: 1) {
                                    HStack(spacing: 6) {
                                        Text(musician.name)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(.primary)
                                        if musician.isDemo { DemoAccountBadge() }
                                    }
                                    Text(verbatim: musician.handle)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if members.contains(musician.name) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(JC.laiton)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Membres (\(members.count))")
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Nouveau groupe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") {
                        store.createGroup(
                            name: name.trimmingCharacters(in: .whitespaces),
                            emoji: emoji,
                            members: Array(members).sorted()
                        )
                        dismiss()
                    }
                    .font(.headline)
                    .disabled(!isValid)
                }
            }
        }
    }
}
