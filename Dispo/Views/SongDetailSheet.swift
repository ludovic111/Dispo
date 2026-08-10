import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers

/// La fiche d'un morceau du répertoire.
///
/// Depuis la 1.7 elle assume une hiérarchie : **iReal Pro est la façon
/// normale de travailler un morceau** — c'est l'app que les musiciens ont
/// déjà, elle joue la grille en boucle avec un accompagnement, et Dispo la
/// lui envoie déjà transposée dans la tonalité du lecteur. Restent deux
/// portes de sortie, clairement à part : les partitions qu'on photographie ou
/// qu'on importe en PDF, et — pour qui y tient — une grille écrite à la main.
struct SongDetailSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let groupID: GroupChat.ID
    let songID: Song.ID

    /// Onglets de la fiche.
    private enum Tab: String, CaseIterable, Identifiable {
        case ireal = "iReal Pro"
        case scores = "Partitions"
        case comments = "Commentaires"
        var id: String { rawValue }
    }

    @State private var tab: Tab = .ireal
    /// Accord de lecture choisi (par défaut celui de mon instrument).
    @State private var transposition: Transposition?
    @State private var showEdit = false
    @State private var showListen = false
    @State private var newComment = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var importingFile = false
    @State private var previewURL: PreviewDoc?
    /// Instrument visé par la partition qu'on ajoute (nil = tout le monde).
    @State private var uploadInstrument: Instrument?
    /// Grille copiée à l'instant (la coche remplace l'icône un moment).
    @State private var copiedGrid = false
    /// iReal Pro n'est pas installé : on le dit au lieu de ne rien faire.
    @State private var missingIReal = false
    /// Suppression du lien iReal Pro en attente de confirmation.
    @State private var confirmIRealDelete = false
    /// Suppression de la grille écrite à la main, en attente de confirmation.
    @State private var confirmGridDelete = false

    private var group: GroupChat? { store.groups.first { $0.id == groupID } }
    private var song: Song? {
        guard let group else { return nil }
        return group.songs.first { $0.id == songID }
            ?? group.allEvents.flatMap(\.setlist).first { $0.id == songID }
    }
    private var isLeader: Bool { group.map { store.canLead($0) } ?? false }

    /// Mon instrument dans ce groupe (rôle assigné, sinon mon premier).
    private var myInstrument: Instrument? {
        group?.role(for: store.profile.name) ?? store.profile.instruments.first
    }

    /// L'accord de lecture effectif : celui choisi, sinon celui de mon
    /// instrument, sinon l'ut (hauteur réelle).
    private var activeTransposition: Transposition {
        transposition ?? myInstrument?.defaultTransposition ?? .c
    }

    var body: some View {
        NavigationStack {
            ZStack {
                JCBackground()
                if let group, let song {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            header(song)
                            Picker("", selection: $tab.animation()) {
                                ForEach(Tab.allCases) { option in
                                    Text(LocalizedStringKey(option.rawValue)).tag(option)
                                }
                            }
                            .pickerStyle(.segmented)

                            switch tab {
                            case .ireal: irealTab(song)
                            case .scores: scoresTab(song, group: group)
                            case .comments: commentsTab(song, group: group)
                            }
                        }
                        .padding(18)
                    }
                }
            }
            .navigationTitle(song?.title ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if isLeader {
                        Button("Modifier") { showEdit = true }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
            .sheet(isPresented: $showEdit) {
                if let song { SongEditSheet(groupID: groupID, song: song) }
            }
            .alert("iReal Pro n'est pas installé", isPresented: $missingIReal) {
                Button("Voir dans l'App Store") { openURL(IRealPro.appStoreURL) }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("La grille s'ouvre dans iReal Pro, l'app de play-along des musiciens. Sans elle, la grille reste lisible ici et se copie d'un tap.")
            }
            .confirmationDialog(
                "Supprimer le lien iReal Pro ?",
                isPresented: $confirmIRealDelete,
                titleVisibility: .visible
            ) {
                Button("Supprimer", role: .destructive) { removeIRealLink() }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Le lien partagé par le groupe est retiré. La grille d'accords et la tonalité, elles, restent en place.")
            }
            .confirmationDialog(
                "Supprimer la grille d'accords ?",
                isPresented: $confirmGridDelete,
                titleVisibility: .visible
            ) {
                Button("Supprimer", role: .destructive) { removeChordGrid() }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Les accords écrits à la main sont effacés pour tout le groupe. La tonalité et le lien iReal Pro restent en place.")
            }
            .sheet(isPresented: $showListen) {
                if let song {
                    ListenSheet(song: song).presentationDetents([.height(380)])
                }
            }
            .sheet(item: $previewURL) { doc in
                NavigationStack {
                    DocPreview(url: doc.url)
                        .ignoresSafeArea(edges: .bottom)
                        .navigationTitle(song?.title ?? "")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("OK") { previewURL = nil }.font(.headline)
                            }
                        }
                }
            }
            .fileImporter(
                isPresented: $importingFile,
                allowedContentTypes: [.pdf, .image, .plainText]
            ) { result in
                guard case .success(let url) = result, let group, let song else { return }
                store.addDoc(
                    from: url,
                    title: partTitle(for: song),
                    to: group,
                    songID: song.id,
                    instrument: uploadInstrument
                )
            }
            .onChange(of: photoItem) { _, item in
                guard let item, let group, let song else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let jpeg = UIImage(data: data)?.resizedJPEG(maxSide: 2200, quality: 0.8) {
                        store.addPhotoDoc(
                            jpeg,
                            title: partTitle(for: song),
                            to: group,
                            songID: song.id,
                            instrument: uploadInstrument
                        )
                    }
                    photoItem = nil
                }
            }
        }
    }

    /// « Autumn Leaves — Saxophone » ou juste le titre si c'est pour tous.
    private func partTitle(for song: Song) -> String {
        guard let uploadInstrument else { return song.title }
        return "\(song.title) — \(store.tr(uploadInstrument.rawValue))"
    }

    // MARK: - En-tête

    private func header(_ song: Song) -> some View {
        JCCard {
            HStack(spacing: 12) {
                if let artwork = song.artworkURL, let url = URL(string: artwork) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.clear
                    }
                    .frame(width: 54, height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(song.title)
                        .font(JCFont.display(19))
                        .lineLimit(2)
                    Text(song.artist)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Button { showListen = true } label: {
                    Image(systemName: "headphones")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(JC.laiton)
                        .padding(9)
                        .background(JC.inset, in: Circle())
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel(Text("Écouter sur…"))
            }
        }
    }

    // MARK: - iReal Pro (la voie normale) et, à part, la grille manuelle

    @ViewBuilder
    private func irealTab(_ song: Song) -> some View {
        let concert = song.musicalKey
        let shift = activeTransposition.semitones

        keyCard(song, concert: concert, shift: shift)

        // iReal Pro d'abord : c'est ce qu'on fait dans 90 % des cas.
        irealSection(song: song, concert: concert, shift: shift)

        // La grille écrite à la main, en dessous et clairement séparée : elle
        // reste possible pour qui n'a pas iReal Pro, mais ce n'est plus la
        // proposition principale.
        manualGridSection(song: song, concert: concert, shift: shift)
    }

    /// Tonalité réelle → ta tonalité, avec le choix de l'accord de lecture.
    private func keyCard(_ song: Song, concert: MusicalKey?, shift: Int) -> some View {
        JCCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Tonalité", systemImage: "tuningfork")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(JC.bronze)
                    Spacer()
                    if let myInstrument {
                        Text(store.tr(myInstrument.rawValue))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }

                if let concert {
                    HStack(spacing: 18) {
                        keyBlock(
                            title: "Réel (concert)",
                            key: concert.label,
                            highlighted: shift == 0
                        )
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                        keyBlock(
                            title: "Ta partition",
                            key: concert.transposed(by: shift).label,
                            highlighted: shift != 0
                        )
                    }
                } else {
                    Text(isLeader
                         ? LocalizedStringKey("Tonalité non renseignée — ajoute-la avec « Modifier », chacun verra la sienne.")
                         : "Tonalité non renseignée par le leader.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Picker("Je lis en", selection: Binding(
                    get: { activeTransposition },
                    set: { transposition = $0 }
                )) {
                    ForEach(Transposition.allCases) { option in
                        Text(LocalizedStringKey(option.rawValue)).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .tint(JC.laiton)
            }
        }
    }

    /// Le bloc iReal Pro : ouvrir, ou expliquer honnêtement pourquoi non.
    @ViewBuilder
    private func irealSection(song: Song, concert: MusicalKey?, shift: Int) -> some View {
        let pasted = song.irealURL.flatMap { IRealPro.appLink($0) }
        let generated = (song.chords?.isEmpty == false)
            ? IRealPro.link(
                title: song.title,
                composer: song.artist,
                style: "",
                key: concert?.transposed(by: shift),
                grid: MusicTheory.transposeGrid(
                    song.chords ?? "",
                    by: shift,
                    preferSharps: concert?.transposed(by: shift).prefersSharps ?? false
                )
            )
            : nil

        if let url = pasted ?? generated {
            VStack(spacing: 8) {
                Button { openIReal(url) } label: {
                    Label("Ouvrir iReal Pro", systemImage: "arrow.up.forward.app.fill")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(JC.premiumTint.opacity(0.16), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(JC.premiumTint)
                }
                .buttonStyle(PressableStyle())

                irealExplainer(pasted: pasted != nil, shift: shift)

                if isLeader {
                    HStack(spacing: 14) {
                        if pasted == nil {
                            Button { showEdit = true } label: {
                                Text("Coller le lien exporté d'iReal Pro")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(JC.bronze)
                            }
                            .buttonStyle(PressableStyle())
                        } else {
                            Button(role: .destructive) { confirmIRealDelete = true } label: {
                                Label("Supprimer le lien iReal Pro", systemImage: "trash")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(JC.signal)
                            }
                            .buttonStyle(PressableStyle())
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        } else {
            // Ni grille ni lien : c'est ici que tout commence.
            VStack(spacing: 8) {
                if isLeader {
                    Button { showEdit = true } label: {
                        Label("Ajouter la grille iReal Pro", systemImage: "link.badge.plus")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(JC.inset, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(JC.premiumTint)
                    }
                    .buttonStyle(PressableStyle())
                } else {
                    JCEmptyState(
                        icon: "arrow.up.forward.app",
                        title: "Pas encore de grille",
                        message: "Le leader n'a pas encore partagé la grille de ce morceau."
                    )
                }
                irealExplainer(pasted: false, shift: shift)
            }
        }
    }

    /// Dire ce qu'est iReal Pro, en français, à quelqu'un qui n'en a jamais
    /// entendu parler — et ce que Dispo lui envoie exactement.
    private func irealExplainer(pasted: Bool, shift: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 7) {
                Image(systemName: "info.circle")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(JC.premiumTint)
                VStack(alignment: .leading, spacing: 3) {
                    Text("iReal Pro est une app à part (payante, ~15 CHF) qui joue une grille d'accords en boucle avec basse, batterie et piano — pour travailler un morceau tout seul.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if pasted {
                        Text("Ici, c'est la grille partagée par le groupe qui s'ouvre.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(shift == 0
                             ? "Dispo envoie la grille du morceau telle quelle."
                             : "Dispo envoie la grille déjà transposée dans ta tonalité (\(store.tr(activeTransposition.rawValue))) — rien à recopier.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text("Sans l'app installée, la grille reste lisible ici et se copie d'un tap.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(10)
        .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    /// La grille d'accords écrite à la main — la porte de sortie pour qui n'a
    /// pas iReal Pro. Volontairement en second, et supprimable d'un tap.
    @ViewBuilder
    private func manualGridSection(song: Song, concert: MusicalKey?, shift: Int) -> some View {
        if let chords = song.chords, !chords.isEmpty {
            // La grille dans MA tonalité — c'est elle qu'on copie, pas celle
            // du piano : coller ça dans un message doit servir tel quel.
            let transposed = MusicTheory.transposeGrid(
                chords,
                by: shift,
                // La grille s'écrit dans l'alphabet de la tonalité
                // d'arrivée : dièses en mi majeur, bémols en si♭.
                preferSharps: concert?.transposed(by: shift).prefersSharps ?? false
            )
            JCCard {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("Grille d'accords", systemImage: "square.grid.2x2")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(JC.bronze)
                        Spacer()
                        if shift != 0 {
                            TagView(text: activeTransposition.rawValue, color: JC.laiton)
                        }
                        Button {
                            UIPasteboard.general.string = transposed
                            withAnimation { copiedGrid = true }
                            Task {
                                try? await Task.sleep(for: .seconds(2))
                                withAnimation { copiedGrid = false }
                            }
                        } label: {
                            Image(systemName: copiedGrid ? "checkmark" : "doc.on.doc")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(copiedGrid ? JC.feutrine : .secondary)
                                .padding(6)
                                .background(JC.inset, in: Circle())
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityLabel(Text("Copier la grille"))
                    }
                    Text(verbatim: transposed)
                        .font(JCFont.mono(15))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if isLeader {
                        Button(role: .destructive) { confirmGridDelete = true } label: {
                            Label("Supprimer la grille d'accords", systemImage: "trash")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(JC.signal)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
        } else if isLeader {
            Button { showEdit = true } label: {
                Label("Écrire la grille à la main", systemImage: "square.grid.2x2")
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(PressableStyle())
        }
    }

    /// Retire le lien iReal Pro partagé par le groupe. La tonalité et la
    /// grille d'accords restent : elles servent à tout le monde, y compris à
    /// ceux qui n'ont pas l'app.
    private func removeIRealLink() {
        guard let group, let song else { return }
        store.updateSongDetails(
            song,
            key: song.key ?? "",
            chords: song.chords ?? "",
            irealURL: "",
            in: group
        )
    }

    /// Efface la grille écrite à la main. Le lien iReal Pro et la tonalité
    /// restent en place — on ne supprime que ce qu'on a demandé.
    private func removeChordGrid() {
        guard let group, let song else { return }
        store.updateSongDetails(
            song,
            key: song.key ?? "",
            chords: "",
            irealURL: song.irealURL ?? "",
            in: group
        )
    }

    /// Ouvre le lien, ou emmène sur l'App Store si iReal Pro n'est pas
    /// installé — un bouton qui ne fait rien est pire que pas de bouton.
    private func openIReal(_ url: URL) {
        let installed = IRealPro.schemes
            .compactMap { URL(string: "\($0)://") }
            .contains { UIApplication.shared.canOpenURL($0) }
        guard installed || UIApplication.shared.canOpenURL(url) else {
            missingIReal = true
            return
        }
        openURL(url)
    }

    private func keyBlock(title: LocalizedStringKey, key: String, highlighted: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(verbatim: key)
                .font(JCFont.display(28))
                .foregroundStyle(highlighted ? JC.laiton : .primary)
        }
    }

    // MARK: - Partitions du morceau

    @ViewBuilder
    private func scoresTab(_ song: Song, group: GroupChat) -> some View {
        let docs = group.docs(for: song.id)

        JCCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ajouter une partition")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(JC.bronze)
                Picker("Pour", selection: $uploadInstrument) {
                    Text("Tout le monde").tag(Instrument?.none)
                    ForEach(Instrument.allCases) { instrument in
                        Text(LocalizedStringKey(instrument.rawValue)).tag(Instrument?.some(instrument))
                    }
                }
                .pickerStyle(.menu)
                .tint(JC.laiton)
                HStack(spacing: 10) {
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Label("Photo", systemImage: "camera.fill")
                            .font(.caption.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .foregroundStyle(JC.laiton)
                    }
                    Button {
                        importingFile = true
                    } label: {
                        Label("Fichier", systemImage: "doc.fill")
                            .font(.caption.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .foregroundStyle(JC.laiton)
                    }
                    .buttonStyle(PressableStyle())
                }
                if store.docUploadInProgress {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Envoi en cours…").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }

        if docs.isEmpty {
            JCEmptyState(
                icon: "doc.text",
                title: "Aucune partition",
                message: "Prends la feuille en photo ou importe le PDF — tout le groupe y aura accès."
            )
        }

        ForEach(docs) { doc in
            Button {
                Task {
                    if let url = await store.localURL(for: doc) {
                        previewURL = PreviewDoc(url: url)
                    }
                }
            } label: {
                JCCard(padding: 11) {
                    HStack(spacing: 11) {
                        Image(systemName: doc.isPhoto ? "photo.fill" : "doc.richtext.fill")
                            .font(.title3)
                            .foregroundStyle(JC.laiton)
                            .frame(width: 30)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(doc.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            HStack(spacing: 6) {
                                if let instrument = doc.instrument {
                                    TagView(text: instrument, color: JC.bronze)
                                }
                                Text(verbatim: doc.addedBy)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer(minLength: 0)
                        if doc.addedBy == store.profile.name || isLeader {
                            Button(role: .destructive) {
                                store.removeDoc(doc, from: group)
                            } label: {
                                Image(systemName: "trash")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                }
            }
            .buttonStyle(PressableStyle())
        }
    }

    // MARK: - Commentaires

    @ViewBuilder
    private func commentsTab(_ song: Song, group: GroupChat) -> some View {
        let comments = group.comments(for: song.id)

        if comments.isEmpty {
            JCEmptyState(
                icon: "bubble.left.and.bubble.right",
                title: "Personne n'a encore parlé de ce morceau",
                message: "Doigtés, intro, tempo, « on la finit comment ? » — tout le monde peut écrire ici."
            )
        }

        ForEach(comments) { comment in
            JCCard(padding: 11) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        AvatarView(
                            name: comment.author,
                            size: 22,
                            photo: store.photo(forName: comment.author)
                        )
                        Text(comment.isMine ? store.tr("Toi") : comment.author)
                            .font(.caption.weight(.bold))
                        Spacer(minLength: 0)
                        Text(comment.date.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        if comment.isMine || isLeader {
                            Button(role: .destructive) {
                                store.removeSongComment(comment, in: group)
                            } label: {
                                Image(systemName: "trash")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                    Text(verbatim: comment.text)
                        .font(.callout)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }

        HStack(spacing: 8) {
            TextField("Ajouter un commentaire…", text: $newComment, axis: .vertical)
                .lineLimit(1...4)
                .padding(11)
                .background(JC.inset, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            Button {
                store.addSongComment(newComment, songID: song.id, in: group)
                newComment = ""
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.body.weight(.bold))
                    .foregroundStyle(JC.billetInk)
                    .padding(11)
                    .background(JC.hero, in: Circle())
            }
            .buttonStyle(PressableStyle())
            .disabled(newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}

/// Fichier prêt à être prévisualisé (wrapper Identifiable).
struct PreviewDoc: Identifiable {
    let url: URL
    var id: URL { url }
}

// MARK: - Édition d'un morceau (leader)

/// Tonalité, grille d'accords et lien iReal Pro — ce que le leader renseigne
/// une fois pour tout le groupe.
struct SongEditSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let groupID: GroupChat.ID
    let song: Song

    @State private var key = ""
    @State private var chords = ""
    @State private var ireal = ""

    private var group: GroupChat? { store.groups.first { $0.id == groupID } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tonalité (réelle)", selection: $key) {
                        Text("Non renseignée").tag("")
                        ForEach(MusicalKey.allKeys, id: \.self) { musicalKey in
                            Text(verbatim: musicalKey.label).tag(musicalKey.label)
                        }
                    }
                } header: {
                    Text("Tonalité")
                } footer: {
                    Text("Indique la tonalité réelle (celle du piano). Chaque membre verra la sienne : un saxophone alto lit une sixte majeure au-dessus, une trompette un ton.")
                }

                Section {
                    TextField("irealb://…", text: $ireal)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !ireal.isEmpty, IRealPro.appLink(ireal) == nil {
                        Label(
                            "Ce lien ne vient pas d'iReal Pro — il doit commencer par irealb:// ou irealbook://.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(JC.signal)
                    }
                } header: {
                    Text("iReal Pro")
                } footer: {
                    Text("La façon normale de partager un morceau. Dans iReal Pro : appui long sur le morceau → Partager → Copier, puis colle ici. Tout le groupe l'ouvre d'un tap. Pour l'enlever, utilise le bouton sur la fiche du morceau.")
                }

                Section {
                    TextField(
                        "Ex.  | Cmaj7 | Am7 | Dm7 | G7 |",
                        text: $chords,
                        axis: .vertical
                    )
                    .font(JCFont.mono(15))
                    .lineLimit(4...14)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                } header: {
                    Text("Grille écrite à la main (facultatif)")
                } footer: {
                    Text("Sans lien iReal Pro, Dispo fabrique la grille à partir de ces accords. Écris-les en lettres (C, Bb, F#m7…) : ils sont transposés tout seuls pour chaque instrument, mise en page et barres de mesure conservées.")
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
                    Button("OK") {
                        if let group {
                            store.updateSongDetails(
                                song,
                                key: key,
                                chords: chords.trimmingCharacters(in: .whitespacesAndNewlines),
                                irealURL: ireal.trimmingCharacters(in: .whitespaces),
                                in: group
                            )
                        }
                        dismiss()
                    }
                    .font(.headline)
                }
            }
            .onAppear {
                key = song.key ?? ""
                chords = song.chords ?? ""
                ireal = song.irealURL ?? ""
            }
        }
    }
}
