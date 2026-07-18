import SwiftUI
import QuickLook
import UniformTypeIdentifiers

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

    enum Tab: String, CaseIterable, Identifiable {
        case messages = "Messages"
        case repertoire = "Répertoire"
        case events = "Événements"
        case docs = "Partitions"
        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .messages: return "bubble.left.and.bubble.right.fill"
            case .repertoire: return "music.note.list"
            case .events: return "calendar.badge.clock"
            case .docs: return "doc.richtext.fill"
            }
        }
    }

    @State private var tab: Tab = .messages
    @State private var draft = ""
    @State private var previewingDoc: GroupDoc?
    @State private var importingDoc = false
    @State private var addingEvent = false
    @State private var addingSong = false
    @State private var selectedEvent: GroupEvent?
    @State private var showMembers = false
    /// Concert du groupe pour lequel on publie un SOS (pré-rempli).
    @State private var sosEvent: GroupEvent?
    /// Événement en attente de SOS, présenté après fermeture de sa feuille.
    @State private var pendingSOSEvent: GroupEvent?
    @State private var showDeleteConfirm = false
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
                    case .docs: docsTab(group)
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
                DocPreview(url: AppStore.mediaURL(for: doc.fileName))
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(doc.title)
                    .navigationBarTitleDisplayMode(.inline)
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
        .sheet(item: $selectedEvent, onDismiss: {
            // Enchaîner deux sheets dans la même transaction fait sauter la
            // présentation : on n'ouvre le SOS qu'après fermeture de l'événement.
            if let pending = pendingSOSEvent {
                pendingSOSEvent = nil
                sosEvent = pending
            }
        }) { event in
            if let group {
                GroupEventSheet(groupID: group.id, eventID: event.id, onPublishSOS: { pendingSOSEvent = $0 })
            }
        }
        .sheet(item: $sosEvent) { event in
            // SOS pré-rempli depuis l'événement — connexion groupe ↔ SOS.
            CreateEventView(
                prefillTitle: event.title,
                prefillPlace: event.venue,
                prefillDate: event.date
            )
        }
        .fileImporter(
            isPresented: $importingDoc,
            allowedContentTypes: [.pdf, .image, .text],
            allowsMultipleSelection: false
        ) { result in
            guard let group, case .success(let urls) = result, let url = urls.first else { return }
            store.addDoc(from: url, title: url.deletingPathExtension().lastPathComponent, to: group)
        }
    }

    /// Bandeau d'identité : leader + membres, en un coup d'œil.
    private func groupHeader(_ group: GroupChat) -> some View {
        Button { showMembers = true } label: {
            HStack(spacing: 8) {
                Image(systemName: "crown.fill")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(JC.gold)
                Text(verbatim: store.leaderDisplayName(of: group))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.primary)
                Text("· \(group.memberNames.count + 1) membres")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
                            GroupMessageBubble(message: message)
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

            HStack(spacing: 10) {
                TextField("Message au groupe…", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(JC.card, in: RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(JC.cardStroke, lineWidth: 1))
                Button {
                    let text = draft.trimmingCharacters(in: .whitespaces)
                    guard !text.isEmpty else { return }
                    draft = ""
                    store.sendGroupMessage(text, in: group)
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
                    .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(JC.violet)
                }
                .buttonStyle(PressableStyle())

                // Suggestions en attente — le leader tranche.
                if !group.pendingSongs.isEmpty {
                    SectionHeader(
                        title: "Suggestions",
                        subtitle: isLeader ? "À valider — c'est toi qui décides" : "En attente du leader"
                    )
                    ForEach(group.pendingSongs) { song in
                        SongRow(song: song, isLeader: isLeader) {
                            store.approveSong(song, in: group.id)
                        } onReject: {
                            store.rejectSong(song, in: group.id)
                        }
                    }
                }

                SectionHeader(title: "Répertoire du groupe", subtitle: "\(group.approvedSongs.count) morceaux")
                if group.approvedSongs.isEmpty {
                    JCEmptyState(
                        icon: "music.note.list",
                        title: "Répertoire vide",
                        message: "Ajoute les morceaux du groupe — les membres peuvent en suggérer, le leader valide."
                    )
                }
                ForEach(group.approvedSongs) { song in
                    // Le bouton de retrait n'apparaît que pour le leader.
                    SongRow(
                        song: song,
                        isLeader: false,
                        onApprove: nil,
                        onReject: isLeader ? { store.rejectSong(song, in: group.id) } : nil
                    )
                }
            }
            .padding(18)
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
                            .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(JC.violet)
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
                    Button {
                        selectedEvent = event
                    } label: {
                        JCCard(padding: 0) {
                            HStack(spacing: 0) {
                                VStack(spacing: 2) {
                                    Text(event.kind.emoji)
                                        .font(.body)
                                    Text(event.date.formatted(.dateTime.day()))
                                        .font(.title3.weight(.heavy))
                                    Text(event.date.formatted(.dateTime.month(.abbreviated)))
                                        .font(.caption2.weight(.bold))
                                        .textCase(.uppercase)
                                }
                                .foregroundStyle(.white)
                                .frame(width: 62)
                                .padding(.vertical, 10)
                                .background(JC.hero)

                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) {
                                        Text(event.title)
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                        TagView(text: event.kind.rawValue, color: JC.violet)
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
                                        .foregroundStyle(JC.violet)
                                    let available = event.availableNames.count
                                    let total = store.roster(of: group).count
                                    let myStatus = event.status(for: store.profile.name)
                                    HStack(spacing: 8) {
                                        Text("Présence : \(available)/\(total)")
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                        if myStatus == .pending {
                                            Text("À confirmer")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(JC.coral)
                                        } else if myStatus == .available {
                                            Text("Tu es dispo")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(Color.green)
                                        } else {
                                            Text("Tu es indispo")
                                                .font(.caption2.weight(.heavy))
                                                .foregroundStyle(JC.coral)
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

    // MARK: Partitions

    private func docsTab(_ group: GroupChat) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                Button {
                    importingDoc = true
                } label: {
                    Label("Ajouter une partition", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.violet)
                }
                .buttonStyle(PressableStyle())

                if group.docs.isEmpty {
                    JCEmptyState(
                        icon: "doc.richtext",
                        title: "Aucune partition",
                        message: "Partage les PDF du répertoire — tout le groupe les retrouve ici."
                    )
                }

                ForEach(group.docs) { doc in
                    Button {
                        previewingDoc = doc
                    } label: {
                        JCCard(padding: 12) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(JC.coral.opacity(0.14))
                                        .frame(width: 40, height: 40)
                                    Image(systemName: "doc.richtext.fill")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(JC.coral)
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
                    .buttonStyle(PressableStyle())
                }
            }
            .padding(18)
        }
    }
}

// MARK: - Ligne d'un morceau (pochette iTunes si trouvée)

struct SongRow: View {
    let song: Song
    /// true = montrer les boutons valider / refuser (suggestion + leader).
    let isLeader: Bool
    let onApprove: (() -> Void)?
    let onReject: (() -> Void)?

    init(song: Song, isLeader: Bool, onApprove: (() -> Void)? = nil, onReject: (() -> Void)? = nil) {
        self.song = song
        self.isLeader = isLeader
        self.onApprove = onApprove
        self.onReject = onReject
    }

    var body: some View {
        JCCard(padding: 10) {
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
                VStack(alignment: .leading, spacing: 2) {
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
                            .foregroundStyle(JC.violet)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if !song.isApproved && isLeader {
                    // Le bouton d'acceptation demandé — un tap et c'est validé.
                    Button {
                        onApprove?()
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.green)
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
                    TagView(text: "En attente", color: JC.gold)
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

    private var artworkPlaceholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(JC.violet.opacity(0.14))
            Image(systemName: "music.note")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(JC.violet)
        }
    }
}

/// Bulle de message de groupe — le nom de l'expéditeur au-dessus.
struct GroupMessageBubble: View {
    let message: GroupMessage

    var body: some View {
        HStack {
            if message.isFromMe { Spacer(minLength: 56) }
            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 3) {
                if !message.isFromMe {
                    Text(message.sender)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.violet)
                        .padding(.leading, 6)
                }
                Text(message.text)
                    .font(.subheadline)
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
                    .foregroundStyle(message.isFromMe ? Color.white : Color.primary)
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
                                        .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .foregroundStyle(JC.violet)
                                }
                                .buttonStyle(PressableStyle())
                            }

                            // Moi
                            memberRow(
                                name: store.profile.name,
                                isMe: true,
                                isLeaderRow: store.isLeader(of: group),
                                isPremiumMember: store.showsPremium,
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

    private func memberRow(name: String, isMe: Bool, isLeaderRow: Bool, isPremiumMember: Bool, group: GroupChat) -> some View {
        let kind = group.memberKind(for: name)
        return JCCard(padding: 11) {
            HStack(spacing: 11) {
                AvatarView(name: name, size: 42, photo: store.photo(forName: name))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(isMe ? store.tr("Toi") : name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if isLeaderRow {
                            HStack(spacing: 3) {
                                Image(systemName: "crown.fill")
                                    .font(.system(size: 8, weight: .bold))
                                Text("Leader")
                                    .font(.caption2.weight(.heavy))
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(JC.gold.opacity(0.16), in: Capsule())
                            .foregroundStyle(JC.gold)
                        }
                    }
                    HStack(spacing: 6) {
                        if isPremiumMember {
                            Text("Premium")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.gold)
                        }
                        // Le leader est toujours le noyau ; les autres ont un statut.
                        if !isLeaderRow {
                            Label(kind.label, systemImage: kind.symbol)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(kind == .permanent ? JC.violet : .secondary)
                        }
                    }
                }
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

/// Choix d'un musicien à inviter (leader uniquement).
struct InviteMemberSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let group: GroupChat
    @State private var query = ""

    private var candidates: [Musician] {
        let base = store.musicians.filter { !group.memberNames.contains($0.name) }
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
                            Text(musician.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(verbatim: musician.handle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if store.isPremiumMusician(musician.name) {
                            Text("Premium")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(JC.gold)
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
    let onPublishSOS: (GroupEvent) -> Void
    @State private var addingSong = false

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

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                if let group, let event {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            JCCard {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 8) {
                                        Text(event.kind.emoji).font(.title3)
                                        Text(event.title)
                                            .font(.subheadline.weight(.heavy))
                                        Spacer()
                                        TagView(text: event.kind.rawValue, color: JC.violet)
                                    }
                                    Label(event.date.formatted(date: .complete, time: .shortened), systemImage: "calendar")
                                        .font(.caption)
                                    Label(event.venue, systemImage: "mappin.and.ellipse")
                                        .font(.caption)
                                }
                            }

                            attendanceCard(event: event, group: group)

                            // Un membre lâche ? SOS pré-rempli — le réflexe Dispo.
                            Button {
                                dismiss()
                                onPublishSOS(event)
                            } label: {
                                Label("Un membre lâche ? Publier un SOS", systemImage: "bolt.fill")
                                    .font(.subheadline.weight(.bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(JC.hero, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .foregroundStyle(.white)
                            }
                            .buttonStyle(PressableStyle())

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
                                .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .foregroundStyle(JC.violet)
                            }
                            .buttonStyle(PressableStyle())

                            let pending = event.setlist.filter { !$0.isApproved }
                            if !pending.isEmpty {
                                SectionHeader(
                                    title: "Suggestions",
                                    subtitle: isLeader ? "À valider — c'est toi qui décides" : "En attente du leader"
                                )
                                ForEach(pending) { song in
                                    SongRow(song: song, isLeader: isLeader) {
                                        store.approveSong(song, in: groupID, eventID: eventID)
                                    } onReject: {
                                        store.rejectSong(song, in: groupID, eventID: eventID)
                                    }
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
                                        onReject: isLeader ? { store.rejectSong(song, in: groupID, eventID: eventID) } : nil
                                    )
                                }
                            }

                            if isLeader {
                                Button(role: .destructive) {
                                    if let event = self.event {
                                        store.removeEvent(event, from: group)
                                    }
                                    dismiss()
                                } label: {
                                    Text("Supprimer l'événement")
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
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
            .sheet(isPresented: $addingSong) {
                AddSongSheet(groupID: groupID, eventID: eventID)
                    .presentationDetents([.medium])
            }
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
                HStack {
                    Label("Ta présence", systemImage: "person.crop.circle.badge.questionmark")
                        .font(.subheadline.weight(.bold))
                    Spacer()
                    Text("\(available.count)/\(store.roster(of: group).count)")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(JC.violet)
                }

                HStack(spacing: 10) {
                    attendanceButton(
                        title: "Dispo",
                        symbol: "checkmark.circle.fill",
                        color: Color.green,
                        selected: myStatus == .available
                    ) {
                        store.setAttendance(.available, eventID: eventID, in: groupID)
                    }
                    attendanceButton(
                        title: "Indispo",
                        symbol: "xmark.circle.fill",
                        color: JC.coral,
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
                    Text("Le leader sera alerté 2 jours avant pour trouver un remplaçant.")
                        .font(.caption2)
                        .foregroundStyle(JC.coral)
                }

                Divider().opacity(0.4)

                attendanceSummaryRow(title: "Dispo", names: available, color: Color.green)
                attendanceSummaryRow(title: "Indispo", names: unavailable, color: JC.coral)
                attendanceSummaryRow(title: "En attente", names: pending, color: .secondary)
            }
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
    @State private var date = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !venue.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("L'événement") {
                    Picker("Type", selection: $kind) {
                        ForEach(GroupEventKind.allCases) { kind in
                            (Text(kind.emoji + " ") + Text(LocalizedStringKey(kind.rawValue))).tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)
                    TextField("Titre — ex. Soirée salsa", text: $title)
                    TextField("Salle ou bar — ex. Le Chat Noir", text: $venue)
                    DatePicker("Date et heure", selection: $date, in: Date()...)
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
                        store.addEvent(
                            GroupEvent(
                                kind: kind,
                                title: title.trimmingCharacters(in: .whitespaces),
                                venue: venue.trimmingCharacters(in: .whitespaces),
                                date: date
                            ),
                            to: group
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
                                            emoji == option ? JC.violet.opacity(0.2) : .clear,
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
                                    Text(musician.name)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Text(verbatim: musician.handle)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if members.contains(musician.name) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(JC.coral)
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
