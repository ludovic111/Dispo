import Foundation
import ImageIO
import UIKit

enum AvatarImagePipelineError: Error, Equatable {
    case invalidResponse
    case httpStatus(Int)
    case imageTooLarge
    case invalidImage
}

/// Chargeur commun aux photos de profil distantes.
///
/// Une seule requête est exécutée pour une URL donnée, même si plusieurs
/// pastilles apparaissent simultanément. URLSession conserve la réponse sur
/// disque selon les en-têtes HTTP, tandis que NSCache évite les redécodages en
/// mémoire pendant la session.
actor AvatarImagePipeline {
    static let shared = AvatarImagePipeline()

    private struct InFlightRequest {
        let id: UUID
        let task: Task<UIImage, Error>
        var subscribers: Set<UUID>
    }

    private static let maximumResponseBytes = 12 * 1_024 * 1_024
    private static let maximumDecodedPixelSize = 512

    private let session: URLSession
    private let retryDelaysNanoseconds: [UInt64]
    private let memoryCache = NSCache<NSURL, UIImage>()
    private var inFlight: [URL: InFlightRequest] = [:]

    init(
        session: URLSession? = nil,
        retryDelaysNanoseconds: [UInt64] = [250_000_000, 850_000_000, 1_800_000_000]
    ) {
        self.session = session ?? Self.makeSession()
        self.retryDelaysNanoseconds = retryDelaysNanoseconds
        memoryCache.totalCostLimit = 32 * 1_024 * 1_024
        memoryCache.countLimit = 180
    }

    func image(for url: URL, subscriber: UUID) async throws -> UIImage {
        if let cached = memoryCache.object(forKey: url as NSURL) {
            return cached
        }
        try Task.checkCancellation()

        let task: Task<UIImage, Error>
        let requestID: UUID
        if var request = inFlight[url] {
            request.subscribers.insert(subscriber)
            inFlight[url] = request
            task = request.task
            requestID = request.id
        } else {
            let session = session
            let retryDelays = retryDelaysNanoseconds
            requestID = UUID()
            task = Task {
                try await Self.downloadImage(
                    from: url,
                    session: session,
                    retryDelaysNanoseconds: retryDelays
                )
            }
            inFlight[url] = InFlightRequest(
                id: requestID,
                task: task,
                subscribers: [subscriber]
            )
        }

        do {
            let image = try await task.value
            try Task.checkCancellation()
            memoryCache.setObject(image, forKey: url as NSURL, cost: Self.memoryCost(of: image))
            if inFlight[url]?.id == requestID {
                inFlight[url] = nil
            }
            return image
        } catch {
            // Une requête annulée peut avoir été remplacée pour la même URL
            // avant que son `catch` ne repasse dans l'acteur. Ne jamais
            // supprimer cette nouvelle génération par erreur.
            if inFlight[url]?.id == requestID {
                inFlight[url] = nil
            }
            throw error
        }
    }

    /// Retire un écran de la requête partagée. Le téléchargement n'est annulé
    /// que si plus aucune pastille visible ne dépend encore de cette URL.
    func cancel(url: URL, subscriber: UUID) {
        guard var request = inFlight[url] else { return }
        request.subscribers.remove(subscriber)
        if request.subscribers.isEmpty {
            request.task.cancel()
            inFlight[url] = nil
        } else {
            inFlight[url] = request
        }
    }

    func removeAllCachedImages() {
        memoryCache.removeAllObjects()
        inFlight.values.forEach { $0.task.cancel() }
        inFlight.removeAll()
        session.configuration.urlCache?.removeAllCachedResponses()
    }

    private static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        let cacheDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("dispo-avatar-images", isDirectory: true)
        configuration.urlCache = URLCache(
            memoryCapacity: 24 * 1_024 * 1_024,
            diskCapacity: 96 * 1_024 * 1_024,
            directory: cacheDirectory
        )
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = true
        configuration.httpMaximumConnectionsPerHost = 4
        return URLSession(configuration: configuration)
    }

    private static func downloadImage(
        from url: URL,
        session: URLSession,
        retryDelaysNanoseconds: [UInt64]
    ) async throws -> UIImage {
        var retryIndex = 0

        while true {
            do {
                var request = URLRequest(url: url)
                request.cachePolicy = .useProtocolCachePolicy
                request.setValue("image/avif,image/webp,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")
                let (data, response) = try await session.data(for: request)
                try Task.checkCancellation()

                guard let response = response as? HTTPURLResponse else {
                    throw AvatarImagePipelineError.invalidResponse
                }
                guard (200...299).contains(response.statusCode) else {
                    throw AvatarImagePipelineError.httpStatus(response.statusCode)
                }
                guard data.count <= maximumResponseBytes else {
                    throw AvatarImagePipelineError.imageTooLarge
                }
                guard let image = downsampledImage(from: data) else {
                    throw AvatarImagePipelineError.invalidImage
                }
                return image
            } catch {
                try Task.checkCancellation()
                guard retryIndex < retryDelaysNanoseconds.count, shouldRetry(error) else {
                    throw error
                }
                let delay = retryDelaysNanoseconds[retryIndex]
                retryIndex += 1
                if delay > 0 {
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }
    }

    private static func shouldRetry(_ error: Error) -> Bool {
        if let pipelineError = error as? AvatarImagePipelineError,
           case let .httpStatus(status) = pipelineError {
            return status == 408 || status == 425 || status == 429 || (500...599).contains(status)
        }
        guard let urlError = error as? URLError else { return false }
        return [
            .timedOut,
            .cannotFindHost,
            .cannotConnectToHost,
            .dnsLookupFailed,
            .networkConnectionLost,
            .notConnectedToInternet,
            .resourceUnavailable,
            .internationalRoamingOff,
            .callIsActive,
            .dataNotAllowed
        ].contains(urlError.code)
    }

    private static func downsampledImage(from data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumDecodedPixelSize
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: image)
    }

    private static func memoryCost(of image: UIImage) -> Int {
        guard let image = image.cgImage else { return 1 }
        return image.bytesPerRow * image.height
    }
}
