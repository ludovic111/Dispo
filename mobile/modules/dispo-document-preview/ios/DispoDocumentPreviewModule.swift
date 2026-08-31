import ExpoModulesCore
import Foundation
import QuickLook
import UIKit

private enum DocumentPreviewLimits {
  static let maximumDownloadBytes: Int64 = 25 * 1_024 * 1_024
  static let maximumRedirects = 5
  static let staleCacheAge: TimeInterval = 24 * 60 * 60
}

private struct DocumentPreviewResult: Record {
  @Field var localUri = ""
  @Field var status = "viewerUnavailable"
}

private final class DocumentDownloadDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let lock = NSLock()
  private var redirectCounts: [Int: Int] = [:]

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    lock.lock()
    let redirectCount = (redirectCounts[task.taskIdentifier] ?? 0) + 1
    redirectCounts[task.taskIdentifier] = redirectCount
    lock.unlock()
    guard redirectCount <= DocumentPreviewLimits.maximumRedirects,
          request.url.map(DispoDocumentPreviewModule.isSafeRemoteURL) == true else {
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }
}

private final class QuickLookCoordinator: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  let fileURL: URL
  var onDismiss: (() -> Void)?

  init(fileURL: URL) {
    self.fileURL = fileURL
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

  func previewController(
    _ controller: QLPreviewController,
    previewItemAt index: Int
  ) -> QLPreviewItem {
    fileURL as NSURL
  }

  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    onDismiss?()
  }
}

public final class DispoDocumentPreviewModule: Module {
  private var previewCoordinator: QuickLookCoordinator?

  public func definition() -> ModuleDefinition {
    Name("DispoDocumentPreview")

    AsyncFunction("openAsync") {
      (signedUrl: URL, requestedFileName: String, _: String) async throws -> DocumentPreviewResult in
      guard self.previewCoordinator == nil else {
        throw Self.error("document_preview_in_progress")
      }
      let fileURL = try await Self.download(signedUrl, requestedFileName: requestedFileName)

      return await MainActor.run {
        let result = DocumentPreviewResult()
        result.localUri = fileURL.absoluteString

        guard QLPreviewController.canPreview(fileURL as NSURL),
              let currentViewController = self.appContext?.utilities?.currentViewController()
        else {
          result.status = "viewerUnavailable"
          return result
        }

        let coordinator = QuickLookCoordinator(fileURL: fileURL)
        let previewController = QLPreviewController()
        previewController.dataSource = coordinator
        previewController.delegate = coordinator
        coordinator.onDismiss = { [weak self, weak coordinator] in
          guard let coordinator else { return }
          try? Self.removeCachedFile(coordinator.fileURL)
          if self?.previewCoordinator === coordinator {
            self?.previewCoordinator = nil
          }
        }
        self.previewCoordinator = coordinator
        currentViewController.present(previewController, animated: true)
        result.status = "opened"
        return result
      }
    }

    AsyncFunction("releaseAsync") { (localUri: URL) in
      try? Self.removeCachedFile(localUri)
    }
  }

  fileprivate static func isSafeSignedURL(_ url: URL) -> Bool {
    guard isSafeRemoteURL(url),
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return false }
    return components.queryItems?.contains(where: {
      $0.name == "token" && !($0.value ?? "").isEmpty
    }) == true
  }

  fileprivate static func isSafeRemoteURL(_ url: URL) -> Bool {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          components.scheme?.lowercased() == "https",
          components.user == nil,
          components.password == nil,
          components.port == nil || components.port == 443,
          let rawHost = components.host,
          !rawHost.isEmpty
    else { return false }

    let host = rawHost.lowercased()
    guard host.contains("."),
          !host.hasSuffix("."),
          !host.contains(":"),
          host.unicodeScalars.allSatisfy({
            CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-.").contains($0)
          })
    else { return false }

    let labels = host.split(separator: ".", omittingEmptySubsequences: false)
    guard labels.count >= 2,
          labels.allSatisfy({ !$0.isEmpty && !$0.hasPrefix("-") && !$0.hasSuffix("-") })
    else { return false }
    if labels.count == 4 && labels.allSatisfy({ UInt8($0) != nil }) { return false }
    return ![".local", ".localhost", ".internal", ".lan", ".home", ".corp"]
      .contains(where: host.hasSuffix)
  }

  private static func download(_ remoteURL: URL, requestedFileName: String) async throws -> URL {
    guard isSafeSignedURL(remoteURL) else { throw error("document_preview_url_invalid") }
    let safeFileName = try sanitizedFileName(requestedFileName)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieAcceptPolicy = .never
    configuration.httpCookieStorage = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 20
    configuration.timeoutIntervalForResource = 45
    configuration.urlCache = nil
    let session = URLSession(
      configuration: configuration,
      delegate: DocumentDownloadDelegate(),
      delegateQueue: nil
    )
    defer { session.finishTasksAndInvalidate() }

    var request = URLRequest(url: remoteURL)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.setValue("application/pdf,image/*,text/plain,application/octet-stream", forHTTPHeaderField: "Accept")
    let (temporaryFile, response) = try await session.download(for: request)
    guard let http = response as? HTTPURLResponse,
          (200..<300).contains(http.statusCode),
          http.url.map(isSafeRemoteURL) == true,
          http.expectedContentLength <= DocumentPreviewLimits.maximumDownloadBytes
            || http.expectedContentLength < 0
    else { throw error("document_preview_download_failed") }

    let attributes = try FileManager.default.attributesOfItem(atPath: temporaryFile.path)
    guard let size = attributes[.size] as? NSNumber,
          size.int64Value > 0,
          size.int64Value <= DocumentPreviewLimits.maximumDownloadBytes
    else { throw error("document_preview_file_invalid") }

    let root = try cacheRoot()
    removeStaleCache(in: root)
    let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent(safeFileName, isDirectory: false)
    do {
      try FileManager.default.moveItem(at: temporaryFile, to: destination)
      return destination
    } catch {
      try? FileManager.default.removeItem(at: directory)
      throw error
    }
  }

  private static func sanitizedFileName(_ requested: String) throws -> String {
    let lastComponent = URL(fileURLWithPath: requested).lastPathComponent
    let extensionValue = (lastComponent as NSString).pathExtension.lowercased()
    guard ["jpeg", "jpg", "pdf", "png", "txt"].contains(extensionValue) else {
      throw error("document_preview_type_invalid")
    }
    let rawStem = (lastComponent as NSString).deletingPathExtension
    let forbidden = CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "/\\:*?\"<>|%"))
    let cleaned = rawStem.components(separatedBy: forbidden).joined(separator: " ")
      .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
      .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
    let stem = String((cleaned.isEmpty ? "Document" : cleaned).prefix(100))
    return "\(stem).\(extensionValue)"
  }

  private static func cacheRoot() throws -> URL {
    guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw error("document_preview_cache_unavailable")
    }
    let root = caches.appendingPathComponent("dispo-document-preview", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
  }

  private static func removeStaleCache(in root: URL) {
    guard let entries = try? FileManager.default.contentsOfDirectory(
      at: root,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    ) else { return }
    let cutoff = Date().addingTimeInterval(-DocumentPreviewLimits.staleCacheAge)
    for entry in entries {
      let modified = try? entry.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
      if modified.map({ $0 < cutoff }) != false { try? FileManager.default.removeItem(at: entry) }
    }
  }

  private static func removeCachedFile(_ fileURL: URL) throws {
    guard fileURL.isFileURL else { return }
    let root = try cacheRoot().standardizedFileURL
    let file = fileURL.standardizedFileURL
    guard file.path.hasPrefix(root.path + "/") else { return }
    try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
  }

  private static func error(_ code: String) -> NSError {
    NSError(
      domain: "ch.dispo.document-preview",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: code]
    )
  }
}
