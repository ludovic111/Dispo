import SwiftUI
import QuickLook
import UniformTypeIdentifiers
import PhotosUI

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
    @State private var previewingMessageAttachment: MessageAttachmentPreview?
    @State private var downloadingMessageAttachmentID: String?
    /// Recherche dans le répertoire (apparaît au-delà de 8 morceaux).
    @State private var songQuery = ""
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

    /// Peut exercer les pouvoirs de leader (leader ET Premium). Un
    /// abonnement expiré fait retomber au rang de membre.
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
        // Le groupe est ouvert : ses messages sont lus (la puce s'éteint).
        .onAppear { store.markGroupSeen(groupID) }
        .onDisappear { store.markGroupSeen(groupID) }
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
                        ForEach(group.messages) { message in
                            GroupMessageBubble(
                                message: message,
                                isAttachmentLoading: downloadingMessageAttachmentID == message.attachment?.id,
                                onOpenAttachment: openMessageAttachment
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
            }

            VStack(spacing: 8) {
                if let outgoingMessageAttachment {
                    MessageAttachmentDraftChip(attachment: outgoingMessageAttachment) {
                        self.outgoingMessageAttachment = nil
                    }
                }
                HStack(spacing: 10) {
                    Button { importingMessageAttachment = true } label: {
                        Image(systemName: "paperclip")
                            .font(.body.weight(.bold))
                            .foregroundStyle(JC.electric)
                            .frame(width: 36, height: 36)
                            .background(JC.card, in: Circle())
                    }
                    .buttonStyle(PressableStyle())
                    .disabled(store.messageAttachmentUploadInProgress)
                    .accessibilityLabel(Text("Joindre un fichier"))

                    TextField("Message au groupe…", text: $draft, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(JC.card, in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(JC.cardStroke, lineWidth: 1))
                    Button { sendGroupMessage(in: group) } label: {
                        Group {
                            if store.messageAttachmentUploadInProgress {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 34))
                            }
                        }
                        .foregroundStyle(canSendGroupMessage ? AnyShapeStyle(JC.hero) : AnyShapeStyle(Color.gray))
                    }
                    .disabled(!canSendGroupMessage || store.messageAttachmentUploadInProgress)
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
        draft = ""
        outgoingMessageAttachment = nil
        store.sendGroupMessage(text, attachment: attachment, in: group)
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
                    // Le bouton de retrait n'apparaît que pour le leader.
                    SongRow(
                        song: song,
                        isLeader: false,
                        onApprove: nil,
                        onReject: isLeader ? { store.rejectSong(song, in: group.id) } : nil,
                        groupID: group.id,
                        attachedDocs: group.docs(for: song.id).count
                    )
                }

                groupDocsSection(group)
            }
            .padding(18)
        }
    }

    /// La couleur du talon d'un événement. L'état du line-up passe devant le
    /// rythme : savoir qu'il manque un musicien change une décision, savoir
    /// que la répé est hebdomadaire non.
    private func talon(for event: GroupEvent, lineup: LineupState) -> LinearGradient {
        switch lineup {
        case .complete: return JC.complet
        case .late: return JC.alerte
        case .forming: return event.isRecurring ? JC.serie : JC.hero
        }
    }

    /// Morceaux validés filtrés par la recherche (titre ou artiste).
    private func matchingSongs(in group: GroupChat) -> [Song] {
        let needle = songQuery
            .trimmingCharacters(in: .whitespaces)
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        guard !needle.isEmpty else { return group.approvedSongs }
        return group.approvedSongs.filter { song in
            "\(song.title) \(song.artist)"
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
                .contains(needle)
        }
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
                                    let available = event.availableNames.count
                                    let total = store.roster(of: group).count
                                    let myStatus = event.status(for: store.profile.name)
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

// MARK: - Ligne d'un morceau (pochette iTunes si trouvée)

struct SongRow: View {
    @Environment(\.openURL) private var openURL
    let song: Song
    /// true = montrer les boutons valider / refuser (suggestion + leader).
    let isLeader: Bool
    let onApprove: (() -> Void)?
    let onReject: (() -> Void)?
    /// Groupe du morceau : ouvre la fiche (partitions, tonalité, commentaires).
    /// nil = ligne d'affichage seule (aperçus, captures).
    let groupID: GroupChat.ID?
    /// Nombre de partitions rattachées — affiché en pastille sur la ligne.
    let attachedDocs: Int
    @State private var showListen = false
    @State private var showDetail = false

    init(
        song: Song,
        isLeader: Bool,
        onApprove: (() -> Void)? = nil,
        onReject: (() -> Void)? = nil,
        groupID: GroupChat.ID? = nil,
        attachedDocs: Int = 0
    ) {
        self.song = song
        self.isLeader = isLeader
        self.onApprove = onApprove
        self.onReject = onReject
        self.groupID = groupID
        self.attachedDocs = attachedDocs
    }

    var body: some View {
        songCard
            // Appui long : les mêmes liens d'écoute, sans chercher le bouton.
            .contextMenu { contextLinks }
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
                                .lineLimit(1)
                            Text(song.artist)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            if !song.isApproved {
                                Text("Suggéré par \(song.suggestedBy)")
                                    .font(.caption2)
                                    .foregroundStyle(JC.bronze)
                                    .lineLimit(1)
                            }
                            if song.keyBadgeLabel != nil || attachedDocs > 0 { detailHints }
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
                    TagView(text: "En attente", color: JC.laiton)
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
        }
    }

    /// La tonalité est une information de jeu immédiate : elle reste visible
    /// sur la tuile. Les partitions sont comptées sans promettre les autres
    /// contenus éventuels de la fiche.
    @ViewBuilder
    private var detailHints: some View {
        HStack(spacing: 5) {
            if let key = song.keyBadgeLabel {
                hint(icon: "tuningfork", label: key)
            }
            if attachedDocs > 0 {
                hint(icon: "doc.richtext.fill", label: "\(attachedDocs)")
            }
        }
    }

    private func hint(icon: String, label: String?) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 8, weight: .bold))
            if let label {
                Text(verbatim: label)
                    .font(.system(size: 9, weight: .bold))
            }
        }
        .foregroundStyle(JC.bronze)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(JC.bronze.opacity(0.12), in: Capsule())
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

    /// Liens du menu contextuel — de vrais boutons (Link dans un menu ne
    /// déclenche pas l'ouverture sur certaines versions d'iOS).
    @ViewBuilder
    private var contextLinks: some View {
        ForEach(StreamingPlatform.allCases) { platform in
            if let url = platform.url(for: song) {
                Button {
                    openURL(url)
                } label: {
                    Label {
                        Text(verbatim: platform.label)
                    } icon: {
                        Image(systemName: platform.symbol)
                    }
                }
            }
        }
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

// MARK: - Feuille « Écouter sur… »

/// Le morceau sur chaque plateforme de streaming, avec son logo — un tap
/// ouvre l'app (ou le site) directement sur le titre ou sa recherche.
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
                                .lineLimit(1)
                            Text(song.artist)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    VStack(spacing: 8) {
                        ForEach(StreamingPlatform.allCases) { platform in
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
                                        if platform.hasDirectLink(for: song) {
                                            TagView(text: store.tr("Lien direct"), color: JC.feutrine)
                                        }
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
    let message: GroupMessage
    var isAttachmentLoading = false
    var onOpenAttachment: ((MessageAttachment) -> Void)? = nil

    var body: some View {
        HStack {
            if message.isFromMe { Spacer(minLength: 56) }
            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 3) {
                if !message.isFromMe {
                    Text(message.sender)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.bronze)
                        .padding(.leading, 6)
                }
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
                    message.isFromMe ? AnyShapeStyle(JC.hero) : AnyShapeStyle(JC.card),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(message.isFromMe ? .clear : JC.cardStroke, lineWidth: 1)
                )
                .foregroundStyle(message.isFromMe ? JC.billetInk : Color.primary)
                Text(message.date.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            if !message.isFromMe { Spacer(minLength: 56) }
        }
    }
}

// MARK: - Membres (invitations, exclusions, leadership)

/// Gestion des membres. Le leader invite, exclut et peut transmettre son
/// rôle — uniquement à un membre Premium.
struct GroupMembersSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    @State private var showInvite = false
    /// Membre en attente de confirmation pour devenir leader.
    @State private var pendingLeader: String?
    /// Fiche du membre qu'on consulte.
    @State private var viewingMusician: Musician?

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }

    /// Peut exercer les pouvoirs de leader (leader ET Premium). Un
    /// abonnement expiré fait retomber au rang de membre.
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

                            // Moi
                            memberRow(
                                name: store.profile.name,
                                isMe: true,
                                isLeaderRow: store.isLeader(of: group),
                                isPremiumMember: store.isPremium,
                                group: group
                            )
                            // Les autres membres
                            ForEach(group.memberNames, id: \.self) { name in
                                memberRow(
                                    name: name,
                                    isMe: false,
                                    isLeaderRow: group.leaderName == name,
                                    isPremiumMember: store.isPremiumMusician(name),
                                    group: group
                                )
                            }

                            // Invités en attente de réponse (le leader peut annuler).
                            ForEach(store.pendingInvitesByGroup[group.id] ?? []) { invite in
                                pendingInviteRow(invite, group: group)
                            }

                            if isLeader {
                                Text("Le leadership ne peut être transmis qu'à un membre Premium. Marque chaque membre Permanent (noyau) ou Occasionnel.")
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
                pendingLeader.map { String(format: store.tr("Nommer %@ leader ? Tu perdras la gestion du groupe."), $0) } ?? "",
                isPresented: Binding(get: { pendingLeader != nil }, set: { if !$0 { pendingLeader = nil } }),
                titleVisibility: .visible
            ) {
                if let name = pendingLeader, let group {
                    Button(String(format: store.tr("Nommer %@ leader"), name)) {
                        store.transferLeadership(of: group, to: name)
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
    private func instruments(of name: String, isMe: Bool) -> [Instrument] {
        isMe
            ? store.profile.instruments
            : (store.musicians.first(where: { $0.name == name })?.instruments ?? [])
    }

    private func memberRow(name: String, isMe: Bool, isLeaderRow: Bool, isPremiumMember: Bool, group: GroupChat) -> some View {
        let kind = group.memberKind(for: name)
        let role = group.role(for: name)
        let played = instruments(of: name, isMe: isMe)
        // Le rôle tenu dans le groupe passe devant, ses autres instruments
        // suivent. Un rôle assigné hors de sa panoplie reste affiché.
        let orderedInstruments: [Instrument] = role.map { [$0] + played.filter { $0 != role } } ?? played
        let profileToOpen = isMe ? nil : store.musicians.first(where: { $0.name == name })
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
                                if isPremiumMember {
                                    Text("Premium")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(JC.laiton)
                                }
                                // Le leader est toujours le noyau ; les autres ont un statut.
                                if !isLeaderRow {
                                    Label(kind.label, systemImage: kind.symbol)
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(kind == .permanent ? JC.bronze : .secondary)
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
                                    name,
                                    kind == .permanent ? .occasional : .permanent,
                                    in: group
                                )
                            } label: {
                                Label(
                                    kind == .permanent ? "Passer en occasionnel" : "Passer en permanent",
                                    systemImage: kind == .permanent
                                        ? GroupMemberKind.occasional.symbol
                                        : GroupMemberKind.permanent.symbol
                                )
                            }
                            Menu {
                                let options = store.musicians.first(where: { $0.name == name })?.instruments ?? Instrument.allCases
                                ForEach(options) { instrument in
                                    Button {
                                        store.setMemberRole(name, instrument, in: group)
                                    } label: {
                                        if group.role(for: name) == instrument {
                                            Label(store.tr(instrument.rawValue), systemImage: "checkmark")
                                        } else {
                                            Text(store.tr(instrument.rawValue))
                                        }
                                    }
                                }
                                if group.role(for: name) != nil {
                                    Button(role: .destructive) {
                                        store.setMemberRole(name, nil, in: group)
                                    } label: {
                                        Label("Retirer le rôle", systemImage: "xmark")
                                    }
                                }
                            } label: {
                                Label("Rôle dans le groupe", systemImage: "guitars")
                            }
                        }
                        if isPremiumMember {
                            Button {
                                pendingLeader = name
                            } label: {
                                Label("Nommer leader", systemImage: "crown")
                            }
                        }
                        Button(role: .destructive) {
                            store.kickMember(name, from: group)
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

                    // Un membre lâche à J-2 : soit tu publies le SOS toi-même,
                    // soit l'app s'en charge dans la seconde.
                    Section {
                        Toggle(
                            "Chercher un remplaçant tout seul",
                            isOn: Binding(
                                get: { group.autoSOSEnabled ?? false },
                                set: { store.setAutoSOS(enabled: $0, levelRule: levelRule, in: group) }
                            )
                        )
                        .tint(JC.signal)
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
            List(candidates) { musician in
                Button {
                    store.inviteMember(musician.name, to: group)
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
                        if store.isPremiumMusician(musician.name) {
                            Text("Premium")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.laiton)
                        }
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

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }
    private var event: GroupEvent? {
        group?.allEvents.first { $0.id == eventID }
    }
    /// Peut exercer les pouvoirs de leader (leader ET Premium). Un
    /// abonnement expiré fait retomber au rang de membre.
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
    }

    private var eventDetail: some View {
            ZStack {
                JCBackground()
                if let group, let event {
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
                                    }, groupID: groupID)
                                }
                            }

                            let approved = event.setlist.filter(\.isApproved)
                            SectionHeader(title: "Setlist", subtitle: "\(approved.count) morceaux")
                            if approved.isEmpty {
                                Text("Setlist vide — pioche dans le répertoire du groupe ou ajoute des morceaux.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            ForEach(Array(approved.enumerated()), id: \.element.id) { index, song in
                                HStack(spacing: 8) {
                                    Text(verbatim: "\(index + 1).")
                                        .font(.caption.weight(.heavy))
                                        .foregroundStyle(.tertiary)
                                        .frame(width: 22, alignment: .trailing)
                                    SongRow(
                                        song: song,
                                        isLeader: false,
                                        onApprove: nil,
                                        onReject: isLeader ? { store.rejectSong(song, in: groupID, eventID: eventID) } : nil,
                                        groupID: groupID,
                                        // En répétition on ouvre la setlist,
                                        // pas le répertoire : l'indice des
                                        // partitions doit être là aussi.
                                        attachedDocs: group.docs(for: song.id).count
                                    )
                                }
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
        if isLeader {
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
        let myStatus = event.status(for: store.profile.name)
        let pending = store.pendingAttendance(for: event, in: group)
        let available = event.availableNames
        let unavailable = event.unavailableNames

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

/// Ajout / suggestion d'un morceau — la pochette est cherchée sur iTunes
/// automatiquement (le morceau vit très bien sans si introuvable).
struct AddSongSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    let eventID: GroupEvent.ID?

    @State private var title = ""
    @State private var artist = ""

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titre — ex. Oye Como Va", text: $title)
                    TextField("Artiste — ex. Santana", text: $artist)
                } footer: {
                    Text("La pochette est récupérée automatiquement si le morceau est trouvé.")
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
                        store.addSong(
                            title: title.trimmingCharacters(in: .whitespaces),
                            artist: artist.trimmingCharacters(in: .whitespaces),
                            to: groupID,
                            eventID: eventID
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
                }

                Section {
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
                    Picker("Prévenir le groupe", selection: $reminderLeadDays) {
                        ForEach(GroupEvent.reminderLeadOptions, id: \.self) { days in
                            Text(store.reminderLeadLabel(days)).tag(days)
                        }
                    }
                } header: {
                    Text("Rappel")
                } footer: {
                    Text("Chaque membre reçoit un rappel à ce moment-là — pour confirmer sa présence, ou juste ne pas oublier.")
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

/// Création d'un groupe — réservée aux Premium. Le créateur devient leader.
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
