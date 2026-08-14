import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers

/// La fiche d'un morceau du répertoire.
///
/// iReal Pro reste volontairement minimal : un titre, puis une recherche dans
/// l'app installée. Les partitions et commentaires vivent dans leurs onglets.
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
    @State private var showListen = false
    @State private var newComment = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var importingFile = false
    @State private var previewURL: PreviewDoc?
    /// Instrument visé par la partition qu'on ajoute (nil = tout le monde).
    @State private var uploadInstrument: Instrument?
    /// iReal Pro n'est pas installé : on le dit au lieu de ne rien faire.
    @State private var missingIReal = false
    /// Recherche officielle dans la bibliothèque iReal Pro installée.
    @State private var irealSearch = ""

    private var group: GroupChat? { store.groups.first { $0.id == groupID } }
    private var song: Song? {
        guard let group else { return nil }
        return group.songs.first { $0.id == songID }
            ?? group.allEvents.flatMap(\.setlist).first { $0.id == songID }
    }
    private var isLeader: Bool { group.map { store.canLead($0) } ?? false }

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
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }.font(.headline)
                }
            }
            .alert("iReal Pro n'est pas installé", isPresented: $missingIReal) {
                Button("Voir dans l'App Store") { openURL(IRealPro.appStoreURL) }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Installe iReal Pro pour rechercher ce morceau dans ta bibliothèque.")
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
            .onAppear {
                if irealSearch.isEmpty { irealSearch = song?.title ?? "" }
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

    // MARK: - iReal Pro

    /// Le seul parcours iReal Pro : saisir un titre et lancer sa recherche
    /// locale. Aucun import, export, lien ou réglage intermédiaire.
    private func irealTab(_ song: Song) -> some View {
        JCCard {
            VStack(spacing: 10) {
                TextField("Titre du morceau", text: $irealSearch)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.search)
                    .onSubmit { searchInIReal(song) }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(JC.inset, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                Button { searchInIReal(song) } label: {
                    Label("Chercher dans iReal Pro", systemImage: "magnifyingglass")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(JC.hero, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .foregroundStyle(JC.billetInk)
                }
                .buttonStyle(PressableStyle())
                .disabled(irealSearch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private func searchInIReal(_ song: Song) {
        let query = irealSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = IRealPro.searchURL(query.isEmpty ? song.title : query) else { return }
        openIReal(url)
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
