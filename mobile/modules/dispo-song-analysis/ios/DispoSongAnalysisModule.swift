import Accelerate
import AVFoundation
import ExpoModulesCore
import Foundation

private struct SongAnalysisResult: Record, @unchecked Sendable {
  @Field var key: String?
  @Field var tempoBpm: Int?
}

private struct MonoAudio {
  let samples: [Float]
  let sampleRate: Double
}

private enum SongAnalysisLimits {
  static let maximumDownloadBytes: Int64 = 25_000_000
  static let maximumDecodedSamples = 2_000_000
  static let maximumSampleBufferBytes = 8_000_000
}

public final class DispoSongAnalysisModule: Module {
  private final class PreviewSessionDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
      _ session: URLSession,
      task: URLSessionTask,
      willPerformHTTPRedirection response: HTTPURLResponse,
      newRequest request: URLRequest,
      completionHandler: @escaping (URLRequest?) -> Void
    ) {
      completionHandler(request.url.map(DispoSongAnalysisModule.isSafePreviewURL) == true ? request : nil)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("DispoSongAnalysis")

    AsyncFunction("analyzePreviewAsync") { (previewUrl: URL) async -> SongAnalysisResult in
      do {
        let audio = try await Self.downloadAndDecode(previewUrl)
        let result = SongAnalysisResult()
        result.key = Self.estimateKey(samples: audio.samples, sampleRate: audio.sampleRate)
        result.tempoBpm = Self.estimateTempo(samples: audio.samples, sampleRate: audio.sampleRate)
        return result
      } catch {
        // L'analyse est une aide facultative. La saisie manuelle reste toujours disponible.
        return SongAnalysisResult()
      }
    }
  }

  private static func downloadAndDecode(_ remoteUrl: URL) async throws -> MonoAudio {
    guard isSafePreviewURL(remoteUrl) else { throw URLError(.unsupportedURL) }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.requestCachePolicy = .returnCacheDataElseLoad
    configuration.timeoutIntervalForRequest = 15
    configuration.timeoutIntervalForResource = 30
    configuration.urlCache = nil
    let session = URLSession(
      configuration: configuration,
      delegate: PreviewSessionDelegate(),
      delegateQueue: nil
    )
    defer { session.finishTasksAndInvalidate() }

    var request = URLRequest(url: remoteUrl)
    request.timeoutInterval = 15
    request.cachePolicy = .returnCacheDataElseLoad
    request.setValue("audio/*,application/octet-stream", forHTTPHeaderField: "Accept")
    let (downloadedFile, response) = try await session.download(for: request)
    guard let http = response as? HTTPURLResponse,
          (200..<300).contains(http.statusCode),
          let finalURL = http.url,
          isSafePreviewURL(finalURL),
          http.expectedContentLength <= SongAnalysisLimits.maximumDownloadBytes
            || http.expectedContentLength < 0
    else { throw CocoaError(.fileReadCorruptFile) }

    let attributes = try FileManager.default.attributesOfItem(atPath: downloadedFile.path)
    guard let byteCount = attributes[.size] as? NSNumber,
          byteCount.int64Value > 0,
          byteCount.int64Value <= SongAnalysisLimits.maximumDownloadBytes
    else { throw CocoaError(.fileReadTooLarge) }

    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("dispo-song-analysis-\(UUID().uuidString)")
      .appendingPathExtension(safeAudioExtension(from: finalURL))
    try FileManager.default.copyItem(at: downloadedFile, to: file)
    defer { try? FileManager.default.removeItem(at: file) }
    return try await decodeMono(file)
  }

  private static func isSafePreviewURL(_ url: URL) -> Bool {
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

    // Les apercus officiels utilisent des noms DNS. Refuser les IP litterales et
    // suffixes reseau locaux evite que des donnees de catalogue puissent sonder
    // le reseau prive de l'appareil.
    if labels.count == 4 && labels.allSatisfy({ UInt8($0) != nil }) { return false }
    let blockedSuffixes = [".local", ".localhost", ".internal", ".lan", ".home", ".corp"]
    return !blockedSuffixes.contains(where: host.hasSuffix)
  }

  private static func safeAudioExtension(from url: URL) -> String {
    let allowed = Set(["aac", "aif", "aiff", "caf", "m4a", "mp3", "mp4", "wav"])
    let pathExtension = url.pathExtension.lowercased()
    return allowed.contains(pathExtension) ? pathExtension : "m4a"
  }

  private static func decodeMono(_ url: URL) async throws -> MonoAudio {
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
      throw CocoaError(.fileReadCorruptFile)
    }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false
    ])
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw CocoaError(.featureUnsupported) }
    reader.add(output)
    guard reader.startReading() else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }

    var mono: [Float] = []
    mono.reserveCapacity(1_400_000)
    var sampleRate = 44_100.0
    var reachedSampleLimit = false
    while reader.status == .reading, let sampleBuffer = output.copyNextSampleBuffer() {
      defer { CMSampleBufferInvalidate(sampleBuffer) }
      guard let format = CMSampleBufferGetFormatDescription(sampleBuffer),
            let stream = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
            let block = CMSampleBufferGetDataBuffer(sampleBuffer)
      else { continue }
      sampleRate = stream.mSampleRate
      let channels = max(1, Int(stream.mChannelsPerFrame))
      let byteCount = CMBlockBufferGetDataLength(block)
      guard sampleRate.isFinite,
            (8_000...384_000).contains(sampleRate),
            (1...32).contains(channels),
            byteCount >= MemoryLayout<Float>.size,
            byteCount <= SongAnalysisLimits.maximumSampleBufferBytes
      else { throw CocoaError(.fileReadCorruptFile) }
      var interleaved = [Float](repeating: 0, count: byteCount / MemoryLayout<Float>.size)
      let status = interleaved.withUnsafeMutableBytes { bytes in
        CMBlockBufferCopyDataBytes(
          block,
          atOffset: 0,
          dataLength: byteCount,
          destination: bytes.baseAddress!
        )
      }
      guard status == kCMBlockBufferNoErr else { continue }
      if channels == 1 {
        let remaining = SongAnalysisLimits.maximumDecodedSamples - mono.count
        mono.append(contentsOf: interleaved.prefix(remaining).map(sanitizedSample))
      } else {
        for frame in stride(from: 0, to: interleaved.count - channels + 1, by: channels) {
          guard mono.count < SongAnalysisLimits.maximumDecodedSamples else { break }
          var sum: Float = 0
          for channel in 0..<channels { sum += sanitizedSample(interleaved[frame + channel]) }
          mono.append(sanitizedSample(sum / Float(channels)))
        }
      }
      if mono.count >= SongAnalysisLimits.maximumDecodedSamples {
        reachedSampleLimit = true
        reader.cancelReading()
        break
      }
    }
    guard (reader.status == .completed || reachedSampleLimit), mono.count >= 16_384 else {
      throw reader.error ?? CocoaError(.fileReadCorruptFile)
    }
    return MonoAudio(samples: mono, sampleRate: sampleRate)
  }

  private static func sanitizedSample(_ value: Float) -> Float {
    guard value.isFinite else { return 0 }
    return min(1, max(-1, value))
  }

  private static func estimateKey(samples: [Float], sampleRate: Double) -> String? {
    guard sampleRate > 0, samples.count >= 16_384 else { return nil }
    let sampleStride = max(1, Int((sampleRate / 11_025).rounded()))
    var reduced = Swift.stride(from: 0, to: samples.count, by: sampleStride).map { samples[$0] }
    let reducedRate = sampleRate / Double(sampleStride)
    guard reduced.count >= 8_192 else { return nil }

    var mean: Float = 0
    vDSP_meanv(reduced, 1, &mean, vDSP_Length(reduced.count))
    var negativeMean = -mean
    vDSP_vsadd(reduced, 1, &negativeMean, &reduced, 1, vDSP_Length(reduced.count))

    let frameSize = 4_096
    let hop = 2_048
    var chroma = [Double](repeating: 0, count: 12)
    var frameStart = 0
    var frameCount = 0
    while frameStart + frameSize <= reduced.count, frameCount < 180 {
      let frame = reduced[frameStart..<(frameStart + frameSize)]
      var energy: Float = 0
      frame.withUnsafeBufferPointer { pointer in
        vDSP_svesq(pointer.baseAddress!, 1, &energy, vDSP_Length(frameSize))
      }
      if energy / Float(frameSize) > 0.000_001 {
        for midi in 36...95 {
          let frequency = 440.0 * pow(2.0, Double(midi - 69) / 12.0)
          guard frequency < reducedRate * 0.46 else { continue }
          let omega = 2.0 * Double.pi * frequency / reducedRate
          let coefficient = 2.0 * cos(omega)
          var previous = 0.0
          var beforePrevious = 0.0
          var index = 0
          for sample in frame {
            let window = 0.5 - 0.5 * cos(2.0 * Double.pi * Double(index) / Double(frameSize - 1))
            let current = Double(sample) * window + coefficient * previous - beforePrevious
            beforePrevious = previous
            previous = current
            index += 1
          }
          let power = max(
            0,
            beforePrevious * beforePrevious + previous * previous
              - coefficient * previous * beforePrevious
          )
          chroma[midi % 12] += log1p(power) / sqrt(frequency)
        }
        frameCount += 1
      }
      frameStart += hop
    }
    guard frameCount >= 4, chroma.reduce(0, +) > 0 else { return nil }

    let major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    let minor = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    var candidates: [(score: Double, root: Int, isMinor: Bool)] = []
    for root in 0..<12 {
      candidates.append((correlation(chroma, profile: major, root: root), root, false))
      candidates.append((correlation(chroma, profile: minor, root: root), root, true))
    }
    candidates.sort { $0.score > $1.score }
    guard let best = candidates.first,
          candidates.count > 1,
          best.score >= 0.35,
          best.score - candidates[1].score >= 0.015
    else { return nil }
    return musicalKeyLabel(root: best.root, isMinor: best.isMinor)
  }

  private static func estimateTempo(samples: [Float], sampleRate: Double) -> Int? {
    guard sampleRate > 0, samples.count >= 16_384 else { return nil }
    let sampleStride = max(1, Int((sampleRate / 11_025).rounded()))
    let reduced = Swift.stride(from: 0, to: samples.count, by: sampleStride).map { samples[$0] }
    let reducedRate = sampleRate / Double(sampleStride)
    let window = 512
    let hop = 256
    guard reduced.count >= window * 8 else { return nil }

    var envelope: [Double] = []
    var previousRms = 0.0
    for start in Swift.stride(from: 0, through: reduced.count - window, by: hop) {
      var squared: Float = 0
      reduced[start..<(start + window)].withUnsafeBufferPointer { pointer in
        vDSP_svesq(pointer.baseAddress!, 1, &squared, vDSP_Length(window))
      }
      let rms = sqrt(Double(squared) / Double(window))
      envelope.append(max(0, rms - previousRms))
      previousRms = rms
    }
    let envelopeRate = reducedRate / Double(hop)
    let minimumLag = max(1, Int((60 * envelopeRate / 200).rounded()))
    let maximumLag = min(envelope.count / 2, Int((60 * envelopeRate / 55).rounded()))
    guard maximumLag > minimumLag else { return nil }

    let mean = envelope.reduce(0, +) / Double(envelope.count)
    let centered = envelope.map { $0 - mean }
    var bestLag = 0
    var bestScore = -Double.infinity
    for lag in minimumLag...maximumLag {
      var numerator = 0.0
      var energyA = 0.0
      var energyB = 0.0
      for index in lag..<centered.count {
        let a = centered[index]
        let b = centered[index - lag]
        numerator += a * b
        energyA += a * a
        energyB += b * b
      }
      guard energyA > 0, energyB > 0 else { continue }
      let score = numerator / sqrt(energyA * energyB)
      if score > bestScore {
        bestScore = score
        bestLag = lag
      }
    }
    guard bestLag > 0, bestScore >= 0.08 else { return nil }
    var bpm = 60 * envelopeRate / Double(bestLag)
    while bpm < 75 { bpm *= 2 }
    while bpm > 190 { bpm /= 2 }
    let rounded = Int(bpm.rounded())
    return (40...240).contains(rounded) ? rounded : nil
  }

  private static func correlation(_ chroma: [Double], profile: [Double], root: Int) -> Double {
    let xMean = chroma.reduce(0, +) / 12
    let yMean = profile.reduce(0, +) / 12
    var numerator = 0.0
    var xEnergy = 0.0
    var yEnergy = 0.0
    for pitch in 0..<12 {
      let x = chroma[pitch] - xMean
      let y = profile[(pitch - root + 12) % 12] - yMean
      numerator += x * y
      xEnergy += x * x
      yEnergy += y * y
    }
    guard xEnergy > 0, yEnergy > 0 else { return -1 }
    return numerator / sqrt(xEnergy * yEnergy)
  }

  private static func musicalKeyLabel(root: Int, isMinor: Bool) -> String {
    let flatNames = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
    let sharpNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
    let normalized = ((root % 12) + 12) % 12
    let sharpMajors: Set<Int> = [7, 2, 9, 4, 11, 6]
    let sharpMinors: Set<Int> = [4, 11, 6, 1, 8, 3]
    let prefersSharps = isMinor ? sharpMinors.contains(normalized) : sharpMajors.contains(normalized)
    let name = (prefersSharps ? sharpNames : flatNames)[normalized]
    return isMinor ? "\(name)m" : name
  }
}
