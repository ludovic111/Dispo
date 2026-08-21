import SwiftUI
import UIKit
import UniformTypeIdentifiers
import PhotosUI

/// Fichier sélectionné dans Fichiers, gardé en mémoire jusqu'à l'envoi.
struct OutgoingMessageAttachment: Identifiable, Sendable {
    static let maxBytes = 20 * 1024 * 1024

    let id = UUID()
    let data: Data
    let fileName: String
    let contentType: String
    let fileExtension: String

    var byteCount: Int64 { Int64(data.count) }

    static func load(from url: URL) throws -> OutgoingMessageAttachment {
        let secured = url.startAccessingSecurityScopedResource()
        defer { if secured { url.stopAccessingSecurityScopedResource() } }

        let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
        if let size = values?.fileSize, size > maxBytes {
            throw ImportError.tooLarge
        }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard !data.isEmpty else { throw ImportError.empty }
        guard data.count <= maxBytes else { throw ImportError.tooLarge }

        let name = String(url.lastPathComponent.prefix(255))
        guard !name.isEmpty else { throw ImportError.unreadable }
        let type = values?.contentType
            ?? UTType(filenameExtension: url.pathExtension)
            ?? .data
        let ext = url.pathExtension.isEmpty
            ? (type.preferredFilenameExtension ?? "dat")
            : url.pathExtension.lowercased()
        return OutgoingMessageAttachment(
            data: data,
            fileName: name,
            contentType: type.preferredMIMEType ?? "application/octet-stream",
            fileExtension: ext
        )
    }

    /// Les photos de la photothèque partent en JPEG 2 048 px : assez nettes
    /// pour une affiche ou une partition, sans envoyer le fichier caméra.
    static func compressedPhoto(from data: Data) throws -> OutgoingMessageAttachment {
        guard let image = UIImage(data: data),
              let jpeg = image.resizedJPEG(maxSide: 2_048, quality: 0.72),
              !jpeg.isEmpty else {
            throw ImportError.unreadable
        }
        guard jpeg.count <= maxBytes else { throw ImportError.tooLarge }
        return OutgoingMessageAttachment(
            data: jpeg,
            fileName: "Photo.jpg",
            contentType: "image/jpeg",
            fileExtension: "jpg"
        )
    }

    enum ImportError: Error {
        case tooLarge
        case empty
        case unreadable
    }
}

/// Fichier local prêt à être remis à Quick Look.
struct MessageAttachmentPreview: Identifiable {
    let id = UUID()
    let title: String
    let url: URL
}

extension PhotosPickerItem {
    /// Charge puis compresse une photo ou une vidéo sélectionnée dans la
    /// photothèque avant qu'elle ne touche le réseau.
    func compressedMessageAttachment() async throws -> OutgoingMessageAttachment {
        if supportedContentTypes.contains(where: { $0.conforms(to: .image) }) {
            guard let data = try await loadTransferable(type: Data.self) else {
                throw OutgoingMessageAttachment.ImportError.unreadable
            }
            return try OutgoingMessageAttachment.compressedPhoto(from: data)
        }
        guard let video = try await loadTransferable(type: PickedVideo.self) else {
            throw OutgoingMessageAttachment.ImportError.unreadable
        }
        defer { try? FileManager.default.removeItem(at: video.url) }
        return try await AppStore.compressedMessageVideo(from: video.url)
    }
}

/// Fichier choisi, juste au-dessus du champ de saisie.
struct MessageAttachmentDraftChip: View {
    let attachment: OutgoingMessageAttachment
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: iconName)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(JC.electric)
                .frame(width: 30, height: 30)
                .background(JC.electric.opacity(0.12), in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 1) {
                Text(attachment.fileName)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Text(ByteCountFormatter.string(fromByteCount: attachment.byteCount, countStyle: .file))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel(Text("Retirer le fichier"))
        }
        .padding(9)
        .background(JC.card, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(JC.electric.opacity(0.24), lineWidth: 1)
        )
    }

    private var iconName: String {
        if attachment.contentType.hasPrefix("image/") { return "photo.fill" }
        if attachment.contentType.hasPrefix("video/") { return "video.fill" }
        switch attachment.fileExtension {
        case "pdf": return "doc.richtext.fill"
        case "html", "htm": return "music.note.list"
        case "musicxml", "xml", "mxl": return "music.quarternote.3"
        default: return "doc.fill"
        }
    }
}

/// Carte de pièce jointe dans une bulle. Le parent télécharge puis ouvre le
/// fichier : la vue reste identique en conversation privée et en groupe.
struct MessageAttachmentCard: View {
    let attachment: MessageAttachment
    var isLoading = false
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(JC.electric.opacity(0.14))
                        .frame(width: 38, height: 38)
                    if isLoading {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: attachment.iconName)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(JC.electric)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.fileName)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    Text(attachment.sizeLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Image(systemName: "arrow.down.circle")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(JC.electric)
            }
            .padding(10)
            .frame(minWidth: 210, alignment: .leading)
            .background(JC.inset, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(JC.electric.opacity(0.22), lineWidth: 1)
            )
        }
        .buttonStyle(PressableStyle())
        .disabled(isLoading)
        .accessibilityLabel(
            Text("Ouvrir le fichier") + Text(verbatim: " \(attachment.fileName)")
        )
    }
}
