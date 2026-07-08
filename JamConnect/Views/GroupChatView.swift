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

// MARK: - Groupe

/// Un groupe Premium : messages d'équipe, partitions partagées et agenda
/// des concerts (relié aux SOS — un membre lâche ? SOS pré-rempli).
struct GroupChatView: View {
    @EnvironmentObject private var store: AppStore
    let groupID: GroupChat.ID

    enum Tab: String, CaseIterable, Identifiable {
        case messages = "Messages"
        case docs = "Partitions"
        case concerts = "Concerts"
        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .messages: return "bubble.left.and.bubble.right.fill"
            case .docs: return "doc.richtext.fill"
            case .concerts: return "calendar.badge.clock"
            }
        }
    }

    @State private var tab: Tab = .messages
    @State private var draft = ""
    @State private var previewingDoc: GroupDoc?
    @State private var importingDoc = false
    @State private var addingConcert = false
    /// Concert du groupe pour lequel on publie un SOS (pré-rempli).
    @State private var sosConcert: GroupConcert?
    @State private var showDeleteConfirm = false
    @Environment(\.dismiss) private var dismiss

    private var group: GroupChat? {
        store.groups.first { $0.id == groupID }
    }

    var body: some View {
        ZStack {
            JCBackground()
            if let group {
                VStack(spacing: 0) {
                    tabPicker
                    switch tab {
                    case .messages: messagesTab(group)
                    case .docs: docsTab(group)
                    case .concerts: concertsTab(group)
                    }
                }
            }
        }
        .navigationTitle("\(group?.emoji ?? "🎶") \(group?.name ?? "")")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(JC.bg, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
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
        .confirmationDialog(
            "Supprimer ce groupe (messages, partitions et concerts) ?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Supprimer", role: .destructive) {
                if let group { store.deleteGroup(group) }
                dismiss()
            }
        }
        .sheet(item: $previewingDoc) { doc in
            NavigationStack {
                DocPreview(url: AppStore.mediaURL(for: doc.fileName))
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(doc.title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .sheet(isPresented: $addingConcert) {
            if let group {
                AddConcertSheet(group: group)
                    .presentationDetents([.medium])
            }
        }
        .sheet(item: $sosConcert) { concert in
            // SOS pré-rempli depuis le concert du groupe — connexion
            // agenda ↔ tableau SOS.
            CreateEventView(
                prefillTitle: concert.title,
                prefillPlace: concert.venue,
                prefillDate: concert.date
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

    private var tabPicker: some View {
        Picker("Onglet", selection: $tab) {
            ForEach(Tab.allCases) { tab in
                Label(LocalizedStringKey(tab.rawValue), systemImage: tab.symbol).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
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

    // MARK: Concerts

    private func concertsTab(_ group: GroupChat) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                Button {
                    addingConcert = true
                } label: {
                    Label("Ajouter un concert", systemImage: "calendar.badge.plus")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(JC.violet.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.violet)
                }
                .buttonStyle(PressableStyle())

                if group.upcomingConcerts.isEmpty {
                    JCEmptyState(
                        icon: "calendar",
                        title: "Aucun concert planifié",
                        message: "Ajoute les dates du groupe — et si un membre lâche, publie un SOS pré-rempli en un tap."
                    )
                }

                ForEach(group.upcomingConcerts) { concert in
                    JCCard(padding: 0) {
                        VStack(spacing: 0) {
                            HStack(spacing: 0) {
                                VStack(spacing: 2) {
                                    Text(concert.date.formatted(.dateTime.day()))
                                        .font(.title3.weight(.heavy))
                                    Text(concert.date.formatted(.dateTime.month(.abbreviated)))
                                        .font(.caption2.weight(.bold))
                                        .textCase(.uppercase)
                                }
                                .foregroundStyle(.white)
                                .frame(width: 58)
                                .frame(maxHeight: .infinity)
                                .background(JC.hero)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(concert.title)
                                        .font(.subheadline.weight(.bold))
                                        .lineLimit(1)
                                    Label(
                                        "\(concert.venue) · \(concert.date.formatted(date: .omitted, time: .shortened))",
                                        systemImage: "mappin.and.ellipse"
                                    )
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                }
                                .padding(12)
                                Spacer(minLength: 0)
                                Button {
                                    store.removeConcert(concert, from: group)
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.secondary)
                                        .padding(10)
                                }
                                .buttonStyle(PressableStyle())
                            }
                            .fixedSize(horizontal: false, vertical: true)

                            // Un membre lâche ? SOS pré-rempli avec la date du concert.
                            Button {
                                sosConcert = concert
                            } label: {
                                Label("Un membre lâche ? Publier un SOS", systemImage: "bolt.fill")
                                    .font(.caption.weight(.bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 9)
                                    .background(JC.coral.opacity(0.12))
                                    .foregroundStyle(JC.coral)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                }
            }
            .padding(18)
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

// MARK: - Ajouter un concert

struct AddConcertSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let group: GroupChat

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
                Section("Le concert") {
                    TextField("Titre — ex. Soirée salsa", text: $title)
                    TextField("Salle ou bar — ex. Le Chat Noir", text: $venue)
                    DatePicker("Date et heure", selection: $date, in: Date()...)
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle("Ajouter un concert")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        store.addConcert(
                            GroupConcert(
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
                Section("Le groupe") {
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
