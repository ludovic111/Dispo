import AVFoundation
import ExpoModulesCore
import Foundation

private struct VideoTranscodeResult: Record, @unchecked Sendable {
  @Field var durationMs: Double = 0
  @Field var fileSize: Double = 0
  @Field var hasAudio: Bool = false
  @Field var height: Int = 0
  @Field var mimeType: String = "video/mp4"
  @Field var uri: URL?
  @Field var width: Int = 0
}

private enum VideoTranscodeFailure: LocalizedError {
  case cancelled
  case failed
  case invalidSource

  var errorDescription: String? {
    switch self {
    case .cancelled: "video_transcode_cancelled"
    case .failed: "video_transcode_failed"
    case .invalidSource: "video_transcode_invalid_source"
    }
  }
}

private actor VideoTranscodeJobs {
  private var tasks: [String: Task<VideoTranscodeResult, Error>] = [:]

  func insert(_ task: Task<VideoTranscodeResult, Error>, id: String) -> Bool {
    guard tasks[id] == nil else { return false }
    tasks[id] = task
    return true
  }

  func remove(id: String) {
    tasks[id] = nil
  }

  func cancel(id: String) {
    tasks.removeValue(forKey: id)?.cancel()
  }

  func cancelAll() {
    let running = Array(tasks.values)
    tasks.removeAll()
    running.forEach { $0.cancel() }
  }
}

private final class FoundationCancellationBox: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  private weak var reader: AVAssetReader?
  private weak var writer: AVAssetWriter?

  func install(reader: AVAssetReader, writer: AVAssetWriter) {
    lock.lock()
    self.reader = reader
    self.writer = writer
    let shouldCancel = cancelled
    lock.unlock()
    if shouldCancel {
      reader.cancelReading()
      writer.cancelWriting()
    }
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let reader = reader
    let writer = writer
    lock.unlock()
    reader?.cancelReading()
    writer?.cancelWriting()
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }
}

public final class DispoVideoTranscoderModule: Module {
  private let jobs = VideoTranscodeJobs()

  public func definition() -> ModuleDefinition {
    Name("DispoVideoTranscoder")

    AsyncFunction("transcodeAsync") { (sourceUri: URL, jobId: String) async throws -> VideoTranscodeResult in
      guard sourceUri.isFileURL, !jobId.isEmpty, jobId.count <= 128 else {
        throw VideoTranscodeFailure.invalidSource
      }
      let cancellation = FoundationCancellationBox()
      let task = Task {
        try await Self.transcode(sourceUri, cancellation: cancellation)
      }
      guard await jobs.insert(task, id: jobId) else {
        task.cancel()
        throw VideoTranscodeFailure.invalidSource
      }
      do {
        let result = try await task.value
        await jobs.remove(id: jobId)
        return result
      } catch {
        await jobs.remove(id: jobId)
        if error is CancellationError || cancellation.isCancelled {
          throw VideoTranscodeFailure.cancelled
        }
        throw error
      }
    }

    AsyncFunction("cancelAsync") { (jobId: String) async in
      await jobs.cancel(id: jobId)
    }

    AsyncFunction("removeOutputAsync") { (outputUri: URL) in
      Self.removeOutput(outputUri)
    }

    OnDestroy {
      Task { await self.jobs.cancelAll() }
    }
  }

  private static func removeOutput(_ output: URL) {
    guard output.isFileURL,
          output.deletingLastPathComponent().standardizedFileURL
            == FileManager.default.temporaryDirectory.standardizedFileURL,
          output.lastPathComponent.hasPrefix("dispo-video-transcoder-"),
          output.pathExtension.lowercased() == "mp4"
    else { return }
    try? FileManager.default.removeItem(at: output)
  }

  private static func transcode(
    _ source: URL,
    cancellation: FoundationCancellationBox
  ) async throws -> VideoTranscodeResult {
    try await withTaskCancellationHandler {
      try Task.checkCancellation()
      guard FileManager.default.fileExists(atPath: source.path) else {
        throw VideoTranscodeFailure.invalidSource
      }
      let asset = AVURLAsset(url: source)
      let duration = try await asset.load(.duration)
      guard duration.isValid,
            duration.isNumeric,
            duration.seconds > 0,
            duration.seconds <= 181
      else { throw VideoTranscodeFailure.invalidSource }
      return try await export(asset, duration: duration, cancellation: cancellation)
    } onCancel: {
      cancellation.cancel()
    }
  }

  private static func export(
    _ asset: AVURLAsset,
    duration: CMTime,
    cancellation: FoundationCancellationBox
  ) async throws -> VideoTranscodeResult {
    guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
      throw VideoTranscodeFailure.invalidSource
    }
    let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
    let (naturalSize, preferredTransform, nominalFrameRate) = try await videoTrack.load(
      .naturalSize,
      .preferredTransform,
      .nominalFrameRate
    )
    let sourceRect = CGRect(origin: .zero, size: naturalSize)
    let transformedRect = sourceRect.applying(preferredTransform)
    let displayWidth = abs(transformedRect.width)
    let displayHeight = abs(transformedRect.height)
    guard displayWidth > 0, displayHeight > 0 else {
      throw VideoTranscodeFailure.invalidSource
    }
    let scale = min(
      1,
      1_280 / max(displayWidth, displayHeight),
      720 / min(displayWidth, displayHeight)
    )
    let renderWidth = max(2, Int((displayWidth * scale / 2).rounded(.down)) * 2)
    let renderHeight = max(2, Int((displayHeight * scale / 2).rounded(.down)) * 2)
    let fps = max(1, min(30, nominalFrameRate > 0 ? nominalFrameRate : 30))

    let composition = AVMutableVideoComposition()
    composition.renderSize = CGSize(width: renderWidth, height: renderHeight)
    composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    let normalizedTransform = preferredTransform
      .concatenating(
        CGAffineTransform(
          translationX: -transformedRect.minX,
          y: -transformedRect.minY
        )
      )
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
    layer.setTransform(normalizedTransform, at: .zero)
    instruction.layerInstructions = [layer]
    composition.instructions = [instruction]

    let reader = try AVAssetReader(asset: asset)
    let videoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: [videoTrack],
      videoSettings: [
        kCVPixelBufferPixelFormatTypeKey as String:
          kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
      ]
    )
    videoOutput.videoComposition = composition
    videoOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(videoOutput) else { throw VideoTranscodeFailure.failed }
    reader.add(videoOutput)

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("dispo-video-transcoder-\(UUID().uuidString)")
      .appendingPathExtension("mp4")
    try? FileManager.default.removeItem(at: outputURL)
    var succeeded = false
    defer {
      if !succeeded { try? FileManager.default.removeItem(at: outputURL) }
    }
    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: renderWidth,
      AVVideoHeightKey: renderHeight,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 2_000_000,
        AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
        AVVideoMaxKeyFrameIntervalKey: 60,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
      ]
    ])
    videoInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoInput) else { throw VideoTranscodeFailure.failed }
    writer.add(videoInput)

    var audioOutput: AVAssetReaderTrackOutput?
    var audioInput: AVAssetWriterInput?
    if let audioTrack {
      let sourceFormat = try await audioTrack.load(.formatDescriptions).first
      let passthroughOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: nil)
      let passthroughInput = sourceFormat.map {
        AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: $0)
      }
      if let passthroughInput,
         reader.canAdd(passthroughOutput),
         writer.canAdd(passthroughInput) {
        passthroughOutput.alwaysCopiesSampleData = false
        passthroughInput.expectsMediaDataInRealTime = false
        reader.add(passthroughOutput)
        writer.add(passthroughInput)
        audioOutput = passthroughOutput
        audioInput = passthroughInput
      } else {
        let pcmOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
          AVFormatIDKey: kAudioFormatLinearPCM,
          AVLinearPCMBitDepthKey: 16,
          AVLinearPCMIsBigEndianKey: false,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMIsNonInterleaved: false
        ])
        let descriptions = try await audioTrack.load(.formatDescriptions)
        let stream = descriptions.first.flatMap {
          CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee
        }
        let sampleRate = stream?.mSampleRate ?? 44_100
        let channels = max(1, Int(stream?.mChannelsPerFrame ?? 2))
        let aacInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVEncoderBitRateKey: 128_000,
          AVSampleRateKey: sampleRate,
          AVNumberOfChannelsKey: channels
        ])
        guard reader.canAdd(pcmOutput), writer.canAdd(aacInput) else {
          throw VideoTranscodeFailure.failed
        }
        pcmOutput.alwaysCopiesSampleData = false
        aacInput.expectsMediaDataInRealTime = false
        reader.add(pcmOutput)
        writer.add(aacInput)
        audioOutput = pcmOutput
        audioInput = aacInput
      }
    }

    cancellation.install(reader: reader, writer: writer)
    try Task.checkCancellation()
    guard reader.startReading(), writer.startWriting() else {
      reader.cancelReading()
      throw VideoTranscodeFailure.failed
    }
    writer.startSession(atSourceTime: .zero)

    await withTaskGroup(of: Void.self) { group in
      group.addTask {
        await pump(from: videoOutput, to: videoInput, cancellation: cancellation)
      }
      if let audioOutput, let audioInput {
        group.addTask {
          await pump(from: audioOutput, to: audioInput, cancellation: cancellation)
        }
      }
    }
    try Task.checkCancellation()
    guard reader.status == .completed else {
      writer.cancelWriting()
      if cancellation.isCancelled { throw VideoTranscodeFailure.cancelled }
      throw reader.error ?? VideoTranscodeFailure.failed
    }
    await writer.finishWriting()
    guard writer.status == .completed else {
      if cancellation.isCancelled { throw VideoTranscodeFailure.cancelled }
      throw writer.error ?? VideoTranscodeFailure.failed
    }

    let attributes = try FileManager.default.attributesOfItem(atPath: outputURL.path)
    guard let byteCount = attributes[.size] as? NSNumber, byteCount.int64Value > 0 else {
      throw VideoTranscodeFailure.failed
    }
    succeeded = true
    var result = VideoTranscodeResult()
    result.durationMs = duration.seconds * 1_000
    result.fileSize = byteCount.doubleValue
    result.hasAudio = audioTrack != nil
    result.height = renderHeight
    result.uri = outputURL
    result.width = renderWidth
    return result
  }

  private final class PumpBox: @unchecked Sendable {
    let cancellation: FoundationCancellationBox
    var finished = false
    let input: AVAssetWriterInput
    let output: AVAssetReaderOutput

    init(
      output: AVAssetReaderOutput,
      input: AVAssetWriterInput,
      cancellation: FoundationCancellationBox
    ) {
      self.output = output
      self.input = input
      self.cancellation = cancellation
    }
  }

  private static func pump(
    from output: AVAssetReaderOutput,
    to input: AVAssetWriterInput,
    cancellation: FoundationCancellationBox
  ) async {
    let queue = DispatchQueue(label: "ch.dispo.video-transcoder.pump")
    let box = PumpBox(output: output, input: input, cancellation: cancellation)
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      box.input.requestMediaDataWhenReady(on: queue) {
        guard !box.finished else { return }
        while box.input.isReadyForMoreMediaData {
          if box.cancellation.isCancelled {
            box.finished = true
            box.input.markAsFinished()
            continuation.resume()
            return
          }
          guard let sample = box.output.copyNextSampleBuffer() else {
            box.finished = true
            box.input.markAsFinished()
            continuation.resume()
            return
          }
          if !box.input.append(sample) {
            box.finished = true
            box.input.markAsFinished()
            continuation.resume()
            return
          }
        }
      }
    }
  }
}
