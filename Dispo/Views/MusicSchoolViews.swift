import SwiftUI

// MARK: - Annuaire et rattachement

/// Annuaire officiel de Dispo. Une école listée n'est pas un partenaire : le
/// badge de vérification n'apparaît que lorsque l'établissement a réellement
/// pris le contrôle de sa page.
struct MusicSchoolDirectoryView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""
    @State private var schoolToJoin: MusicSchool?

    private var joinedIDs: Set<UUID> {
        Set(store.myMusicSchoolCommunities.map(\.school.id))
    }

    private var filteredSchools: [MusicSchool] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return store.musicSchools }
        return store.musicSchools.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed)
                || $0.displayName.localizedCaseInsensitiveContains(trimmed)
                || $0.city.localizedCaseInsensitiveContains(trimmed)
        }
    }

    var body: some View {
        ZStack {
            JCBackground()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    intro
                    searchField

                    if filteredSchools.isEmpty {
                        JCEmptyState(
                            icon: "building.columns",
                            title: "École introuvable",
                            message: "Essaie le nom complet. L'annuaire grandira avec la communauté.",
                            iconColor: JC.bronze
                        )
                    } else {
                        ForEach(filteredSchools) { school in
                            schoolRow(school)
                        }
                    }
                }
                .padding(18)
                .padding(.bottom, 12)
            }
        }
        .navigationTitle("Écoles de musique")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.refreshMusicSchools() }
        .sheet(item: $schoolToJoin) { school in
            MusicSchoolJoinSheet(school: school)
                .presentationDetents([.large])
        }
    }

    private var intro: some View {
        JCCard {
            HStack(alignment: .top, spacing: 13) {
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(JC.bronze.opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: "person.3.sequence.fill")
                        .foregroundStyle(JC.bronze)
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text("Retrouve les musiciens de ton école")
                        .font(.subheadline.weight(.heavy))
                    Text("Ajoute ton établissement au profil : sa communauté et sa conversation apparaissent automatiquement.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("AMR, EPI, HEM…", text: $query)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Effacer la recherche"))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(JC.cardStroke, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func schoolRow(_ school: MusicSchool) -> some View {
        let isJoined = joinedIDs.contains(school.id)
        if isJoined {
            NavigationLink {
                MusicSchoolCommunityView(schoolID: school.id)
            } label: {
                MusicSchoolDirectoryCard(school: school, isJoined: true)
            }
            .buttonStyle(PressableStyle())
        } else {
            Button { schoolToJoin = school } label: {
                MusicSchoolDirectoryCard(school: school, isJoined: false)
            }
            .buttonStyle(PressableStyle())
        }
    }
}

private struct MusicSchoolDirectoryCard: View {
    let school: MusicSchool
    let isJoined: Bool

    var body: some View {
        JCCard(padding: 13) {
            HStack(spacing: 12) {
                MusicSchoolAvatar(school: school, size: 48)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(school.name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                        if school.isVerified {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption)
                                .foregroundStyle(JC.feutrine)
                                .accessibilityLabel(Text("École vérifiée"))
                        }
                    }
                    Text("\(school.city) · \(school.countryCode.uppercased())")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Label(
                    isJoined ? "Membre" : "Ajouter",
                    systemImage: isJoined ? "checkmark.circle.fill" : "plus.circle.fill"
                )
                .labelStyle(.iconOnly)
                .font(.title3)
                .foregroundStyle(isJoined ? JC.feutrine : JC.bronze)
                .accessibilityLabel(Text(isJoined ? "Ouvrir la communauté" : "Ajouter cette école"))
            }
        }
    }
}

struct MusicSchoolJoinSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let school: MusicSchool

    @State private var role: MusicSchoolRole = .student
    @State private var visibility: MusicSchoolVisibility = .schoolOnly
    @State private var customRole = ""
    @State private var isSaving = false
    @State private var saveFailed = false
    @State private var didPrefill = false

    private var existingAffiliation: MusicSchoolAffiliation? {
        store.myMusicSchoolCommunities.first(where: { $0.school.id == school.id })?.affiliation
    }

    private var isEditing: Bool { existingAffiliation != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 13) {
                        MusicSchoolAvatar(school: school, size: 52)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(school.name)
                                .font(.headline)
                            Text("\(school.city) · \(school.countryCode.uppercased())")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 3)
                }

                Section {
                    Picker("Mon rôle", selection: $role) {
                        ForEach(MusicSchoolRole.allCases) { role in
                            Text(LocalizedStringKey(role.label)).tag(role)
                        }
                    }
                    if role == .other {
                        TextField("Précise ton rôle", text: $customRole)
                    }
                } header: {
                    Text("Lien avec l'école")
                } footer: {
                    Text("Le rôle est déclaré par toi. Il ne devient vérifié qu'après validation par l'établissement.")
                }

                Section {
                    Picker("Visibilité", selection: $visibility) {
                        Text("Sur mon profil").tag(MusicSchoolVisibility.profile)
                        Text("Membres de l'école").tag(MusicSchoolVisibility.schoolOnly)
                        Text("Moi uniquement").tag(MusicSchoolVisibility.privateMembership)
                    }
                } header: {
                    Text("Qui voit cette affiliation ?")
                } footer: {
                    Text("Dans tous les cas, seuls les membres actifs accèdent à la conversation de l'école.")
                }

                Section {
                    Label("Une communauté, une liste de membres et un chat privé seront ajoutés.", systemImage: "bubble.left.and.bubble.right.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(JC.bg)
            .navigationTitle(isEditing ? "Modifier mon école" : "Ajouter mon école")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { prefillIfNeeded() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text(isEditing ? "Enregistrer" : "Ajouter").bold()
                        }
                    }
                    .disabled(isSaving || (role == .other && customRole.trimmingCharacters(in: .whitespaces).isEmpty))
                }
            }
            .alert("Impossible d'ajouter l'école", isPresented: $saveFailed) {
                Button("Réessayer") { Task { await save() } }
                Button("Fermer", role: .cancel) {}
            } message: {
                Text("La connexion n'a pas abouti. Rien n'a été modifié.")
            }
        }
    }

    private func prefillIfNeeded() {
        guard !didPrefill, let affiliation = existingAffiliation else { return }
        didPrefill = true
        role = affiliation.role
        visibility = affiliation.visibility
        customRole = affiliation.roleLabel ?? ""
    }

    @MainActor
    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        let label = role == .other
            ? customRole.trimmingCharacters(in: .whitespacesAndNewlines)
            : nil
        let success = await store.joinMusicSchool(
            school.id,
            role: role,
            visibility: visibility,
            roleLabel: label
        )
        isSaving = false
        if success { dismiss() } else { saveFailed = true }
    }
}

// MARK: - Communauté et conversation

struct MusicSchoolCommunityView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let schoolID: UUID

    @State private var draft = ""
    @State private var isSending = false
    @State private var showMembers = false
    @State private var showLeaveConfirmation = false
    @State private var schoolToEdit: MusicSchool?
    @State private var leaveFailed = false
    @State private var messageToBlock: SchoolMessage?
    @State private var messageToEdit: SchoolMessage?
    @State private var messageToDelete: SchoolMessage?
    @State private var safetyMessage: String?

    private var community: MusicSchoolCommunity? {
        store.musicSchoolCommunity(schoolID: schoolID)
    }

    var body: some View {
        ZStack {
            JCBackground()
            if let community {
                VStack(spacing: 0) {
                    communityHeader(community)
                    messages(community)
                    composer(community)
                }
            } else {
                ProgressView("Ouverture de la communauté…")
                    .tint(JC.bronze)
            }
        }
        .navigationTitle(community?.school.displayName ?? "École")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showMembers = true } label: {
                    Image(systemName: "person.2.fill")
                }
                .accessibilityLabel(Text("Voir les membres"))
                Menu {
                    if let school = community?.school {
                        Button { schoolToEdit = school } label: {
                            Label("Modifier mon affiliation", systemImage: "person.crop.circle.badge.checkmark")
                        }
                    }
                    Button(role: .destructive) { showLeaveConfirmation = true } label: {
                        Label("Quitter cette école", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .task(id: schoolID) { await store.refreshMusicSchoolCommunity(schoolID) }
        .onAppear { store.markSchoolSeen(schoolID) }
        .onDisappear { store.markSchoolSeen(schoolID) }
        .sheet(isPresented: $showMembers) {
            if let community {
                MusicSchoolMembersSheet(community: community)
            }
        }
        .sheet(item: $schoolToEdit) { school in
            MusicSchoolJoinSheet(school: school)
        }
        .sheet(item: $messageToEdit) { message in
            MessageEditSheet(text: message.text) { text in
                Task { _ = await store.editSchoolMessage(message.id, text: text) }
            }
        }
        .alert(
            "Supprimer ce message ?",
            isPresented: Binding(
                get: { messageToDelete != nil },
                set: { if !$0 { messageToDelete = nil } }
            )
        ) {
            Button("Annuler", role: .cancel) { messageToDelete = nil }
            Button("Supprimer", role: .destructive) {
                guard let message = messageToDelete else { return }
                Task { _ = await store.deleteSchoolMessage(message.id) }
                messageToDelete = nil
            }
        } message: {
            Text("Le contenu disparaîtra chez tous les participants.")
        }
        .confirmationDialog(
            "Quitter cette communauté ?",
            isPresented: $showLeaveConfirmation,
            titleVisibility: .visible
        ) {
            Button("Quitter l'école", role: .destructive) {
                guard let school = community?.school else { return }
                Task {
                    if await store.leaveMusicSchool(school.id) {
                        dismiss()
                    } else {
                        leaveFailed = true
                    }
                }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Ton affiliation disparaîtra et tu perdras immédiatement l'accès à cette conversation.")
        }
        .alert("Impossible de quitter l'école", isPresented: $leaveFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("La connexion n'a pas abouti. Ton affiliation est toujours active.")
        }
        .confirmationDialog(
            "Bloquer ce membre ?",
            isPresented: Binding(
                get: { messageToBlock != nil },
                set: { if !$0 { messageToBlock = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let target = messageToBlock {
                Button("Bloquer", role: .destructive) {
                    Task {
                        if await store.blockSchoolMessageSender(target.senderID) {
                            safetyMessage = "Ce membre et ses messages sont maintenant masqués."
                        }
                        messageToBlock = nil
                    }
                }
            }
            Button("Annuler", role: .cancel) { messageToBlock = nil }
        } message: {
            Text("Vous ne verrez plus ses messages. Cette personne ne sera pas avertie.")
        }
        .alert("Sécurité", isPresented: Binding(
            get: { safetyMessage != nil },
            set: { if !$0 { safetyMessage = nil } }
        )) {
            Button("OK", role: .cancel) { safetyMessage = nil }
        } message: {
            Text(safetyMessage ?? "")
        }
    }

    private func communityHeader(_ community: MusicSchoolCommunity) -> some View {
        Button { showMembers = true } label: {
            HStack(spacing: 11) {
                MusicSchoolAvatar(school: community.school, size: 42)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(community.school.name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if community.school.isVerified {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption2)
                                .foregroundStyle(JC.feutrine)
                        }
                    }
                    Text(
                        String(
                            format: store.tr("%lld membres · %@"),
                            Int64(community.memberCount),
                            localizedRole(community.affiliation)
                        )
                    )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(JC.card.opacity(0.96))
            .overlay(alignment: .bottom) { Divider().opacity(0.5) }
        }
        .buttonStyle(.plain)
    }

    private func messages(_ community: MusicSchoolCommunity) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if community.messages.isEmpty {
                        JCEmptyState(
                            icon: "bubble.left.and.bubble.right",
                            title: "La conversation commence ici",
                            message: "Présente-toi, retrouve une classe ou monte un ensemble avec les autres membres.",
                            iconColor: JC.bronze
                        )
                        .padding(.top, 42)
                    }
                    ForEach(community.messages) { message in
                        schoolMessage(message)
                            .id(message.id)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 16)
            }
            .onChange(of: community.messages.count) { _, _ in
                guard let id = community.messages.last?.id else { return }
                if reduceMotion {
                    proxy.scrollTo(id, anchor: .bottom)
                } else {
                    withAnimation(.easeOut(duration: 0.22)) { proxy.scrollTo(id, anchor: .bottom) }
                }
            }
            .onAppear {
                guard let id = community.messages.last?.id else { return }
                proxy.scrollTo(id, anchor: .bottom)
            }
        }
    }

    private func schoolMessage(_ message: SchoolMessage) -> some View {
        let mine = message.isMine(userID: store.liveUserID)
        return HStack(alignment: .bottom, spacing: 8) {
            if mine { Spacer(minLength: 48) }
            if !mine {
                AvatarView(
                    name: message.senderName ?? store.tr("Membre"),
                    size: 28,
                    photo: message.senderPhotoURL
                )
            }
            VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                if !mine {
                    Text(message.senderName ?? store.tr("Membre"))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(JC.bronze)
                }
                Text(message.isDeleted ? store.tr("Message supprimé") : message.text)
                    .font(.subheadline)
                    .foregroundStyle(message.isDeleted ? .secondary : (mine ? JC.billetInk : .primary))
                    .italic(message.isDeleted)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(
                        mine ? AnyShapeStyle(JC.hero) : AnyShapeStyle(JC.card),
                        in: RoundedRectangle(cornerRadius: 15, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .stroke(mine ? .clear : JC.cardStroke, lineWidth: 1)
                    )
                HStack(spacing: 4) {
                    Text(message.createdAt.formatted(date: .omitted, time: .shortened))
                    if message.editedAt != nil { Text("· modifié") }
                }
                .font(.system(size: 9))
                .foregroundStyle(.tertiary)
            }
            .contextMenu {
                if mine && !message.isDeleted {
                    Button {
                        messageToEdit = message
                    } label: {
                        Label("Modifier", systemImage: "pencil")
                    }
                    Button(role: .destructive) {
                        messageToDelete = message
                    } label: {
                        Label("Supprimer pour tout le monde", systemImage: "trash")
                    }
                } else if !mine {
                    Button {
                        Task {
                            if await store.reportSchoolMessage(message) {
                                safetyMessage = "Signalement envoyé. Merci de nous aider à protéger la communauté."
                            }
                        }
                    } label: {
                        Label("Signaler", systemImage: "exclamationmark.bubble")
                    }
                    Button(role: .destructive) {
                        messageToBlock = message
                    } label: {
                        Label("Bloquer", systemImage: "hand.raised.fill")
                    }
                }
            }
            if !mine { Spacer(minLength: 48) }
        }
    }

    private func composer(_ community: MusicSchoolCommunity) -> some View {
        HStack(alignment: .bottom, spacing: 9) {
            TextField("Message à la communauté", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 13)
                .padding(.vertical, 10)
                .background(JC.card, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 17, style: .continuous)
                        .stroke(JC.cardStroke, lineWidth: 1)
                )
            Button {
                Task { await send(in: community) }
            } label: {
                Group {
                    if isSending { ProgressView().tint(JC.billetInk) }
                    else { Image(systemName: "arrow.up") }
                }
                .font(.subheadline.weight(.heavy))
                .frame(width: 44, height: 44)
                .background(JC.hero, in: Circle())
                .foregroundStyle(JC.billetInk)
            }
            .buttonStyle(PressableStyle())
            .disabled(isSending || !community.canPost || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel(Text("Envoyer le message"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider().opacity(0.5) }
    }

    @MainActor
    private func send(in community: MusicSchoolCommunity) async {
        guard let channelID = community.channelID else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 4_000 else { return }
        isSending = true
        if await store.sendSchoolMessage(text, channelID: channelID) { draft = "" }
        isSending = false
    }

    private func localizedRole(_ affiliation: MusicSchoolAffiliation) -> String {
        let custom = affiliation.roleLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return custom.isEmpty ? store.tr(affiliation.role.label) : custom
    }
}

private struct MusicSchoolMembersSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let community: MusicSchoolCommunity

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                ScrollView {
                    LazyVStack(spacing: 10) {
                        affiliationNotice
                        ForEach(community.members) { member in
                            memberRow(member)
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle(
                String(format: store.tr("%lld membres"), Int64(community.memberCount))
            )
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Musician.self) { MusicianDetailView(musician: $0) }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
        }
    }

    private var affiliationNotice: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "info.circle.fill")
                .foregroundStyle(JC.bronze)
            Text("Les rôles marqués « déclaré » n'ont pas encore été validés par l'école.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(JC.bronze.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder
    private func memberRow(_ member: MusicSchoolMember) -> some View {
        let musician = store.musicians.first(where: { $0.id == member.profileID })
        let content = JCCard(padding: 11) {
            HStack(spacing: 11) {
                AvatarView(name: member.name, size: 42, photo: member.photoURL)
                VStack(alignment: .leading, spacing: 3) {
                    Text(member.name)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.primary)
                    HStack(spacing: 5) {
                        Text(localizedRole(member))
                        if member.verificationLevel == .verified {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundStyle(JC.feutrine)
                        } else {
                            Text("· déclaré")
                        }
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if musician != nil {
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        if let musician {
            NavigationLink(value: musician) { content }
                .buttonStyle(PressableStyle())
        } else {
            content
        }
    }

    private func localizedRole(_ member: MusicSchoolMember) -> String {
        let custom = member.roleLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return custom.isEmpty ? store.tr(member.role.label) : custom
    }
}

// MARK: - Composants profil / inbox

struct MusicSchoolAvatar: View {
    let school: MusicSchool
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let value = school.logoURL, let url = URL(string: value) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit().padding(size * 0.14)
                } placeholder: {
                    fallback
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .background(JC.inset, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
    }

    private var fallback: some View {
        Text(school.displayName.prefix(3).uppercased())
            .font(JCFont.monoBold(max(9, size * 0.24)))
            .foregroundStyle(JC.bronze)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MusicSchoolAffiliationsCard: View {
    @EnvironmentObject private var store: AppStore
    let affiliations: [MusicSchoolAffiliation]
    var title: LocalizedStringKey = "Écoles de musique"
    var actionTitle: LocalizedStringKey?
    var action: (() -> Void)?

    var body: some View {
        if !affiliations.isEmpty {
            JCCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label(title, systemImage: "building.columns.fill")
                            .font(.subheadline.weight(.heavy))
                            .foregroundStyle(JC.bronze)
                        Spacer()
                        if let actionTitle, let action {
                            Button(action: action) {
                                Text(actionTitle)
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(JC.bronze)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    ForEach(affiliations) { affiliation in
                        HStack(spacing: 11) {
                            MusicSchoolAvatar(school: affiliation.school, size: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 5) {
                                    Text(affiliation.school.name)
                                        .font(.subheadline.weight(.semibold))
                                        .lineLimit(1)
                                    if affiliation.school.isVerified {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.caption2)
                                            .foregroundStyle(JC.feutrine)
                                    }
                                }
                                Text(roleStatus(affiliation))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }

    private func roleStatus(_ affiliation: MusicSchoolAffiliation) -> String {
        let custom = affiliation.roleLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let role = custom.isEmpty ? store.tr(affiliation.role.label) : custom
        guard affiliation.verificationLevel != .verified else { return role }
        return String(format: store.tr("%@ · déclaré"), role)
    }
}
