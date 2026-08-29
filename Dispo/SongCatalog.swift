import Accelerate
import AVFoundation
import Foundation

/// Un résultat exact du catalogue musical. `catalogID` identifie
/// l'enregistrement, tandis que `Song.id` continue d'identifier sa carte dans
/// un répertoire ou une setlist.
struct SongCatalogMatch: Identifiable, Hashable, Sendable {
    let trackID: Int64
    let title: String
    let artist: String
    let albumTitle: String?
    let artworkURL: String?
    let appleMusicURL: String?
    let previewURL: String?
    let durationMilliseconds: Int?
    let releaseYear: Int?
    let genre: String?

    var id: String { catalogID }
    var catalogID: String { "apple:\(trackID)" }

    var durationLabel: String? {
        guard let durationMilliseconds, durationMilliseconds > 0 else { return nil }
        let seconds = durationMilliseconds / 1_000
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

/// Recherche/autocomplétion gratuite dans le catalogue iTunes. La sélection
/// d'un résultat fournit immédiatement un identifiant stable, le vrai artiste,
/// l'album, la pochette, l'extrait et le lien Apple Music exact.
enum SongCatalog {
    nonisolated static func search(_ query: String, limit: Int = 10) async -> [SongCatalogMatch] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }

        var components = URLComponents(string: "https://itunes.apple.com/search")
        components?.queryItems = [
            URLQueryItem(name: "term", value: trimmed),
            URLQueryItem(name: "country", value: "CH"),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "attribute", value: "songTerm"),
            URLQueryItem(name: "limit", value: String(max(1, min(limit, 25))))
        ]
        guard let url = components?.url else { return [] }

        struct Response: Decodable {
            struct Item: Decodable {
                let trackId: Int64?
                let trackName: String?
                let artistName: String?
                let collectionName: String?
                let artworkUrl100: String?
                let trackViewUrl: String?
                let previewUrl: String?
                let trackTimeMillis: Int?
                let releaseDate: String?
                let primaryGenreName: String?
            }
            let results: [Item]
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .returnCacheDataElseLoad
        request.timeoutInterval = 12
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let decoded = try? JSONDecoder().decode(Response.self, from: data)
        else { return [] }

        var seen = Set<Int64>()
        return decoded.results.compactMap { item in
            guard let trackID = item.trackId,
                  seen.insert(trackID).inserted,
                  let title = item.trackName?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty,
                  let artist = item.artistName?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !artist.isEmpty
            else { return nil }
            let year = item.releaseDate.flatMap { value in
                Int(value.prefix(4))
            }
            return SongCatalogMatch(
                trackID: trackID,
                title: title,
                artist: artist,
                albumTitle: item.collectionName,
                artworkURL: item.artworkUrl100?.replacingOccurrences(of: "100x100", with: "600x600"),
                appleMusicURL: item.trackViewUrl,
                previewURL: item.previewUrl,
                durationMilliseconds: item.trackTimeMillis,
                releaseYear: year,
                genre: item.primaryGenreName
            )
        }
    }

    /// Retrouve un morceau saisi manuellement uniquement si le premier
    /// résultat correspond bien au titre et, lorsqu'il est fourni, à l'artiste.
    /// Cela évite d'attacher la pochette ou les liens d'un homonyme au hasard.
    nonisolated static func exactMatch(title: String, artist: String) async -> SongCatalogMatch? {
        let results = await search("\(title) \(artist)", limit: 8)
        let wantedTitle = normalized(title)
        let wantedArtist = normalized(artist)
        return results.first { result in
            guard normalized(result.title) == wantedTitle else { return false }
            return wantedArtist.isEmpty || normalized(result.artist) == wantedArtist
        }
    }

    nonisolated private static func normalized(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Détection locale de tonalité à partir de l'extrait officiel. C'est une
/// proposition (modifiable dans le formulaire), jamais une vérité imposée :
/// certains morceaux modulent ou ont un extrait trop court.
struct SongAudioAnalysis: Sendable, Equatable {
    let key: MusicalKey?
    let tempoBPM: Int?
}

enum SongKeyDetector {
    nonisolated static func detect(from previewURL: String?) async -> MusicalKey? {
        await analyze(from: previewURL)?.key
    }

    nonisolated static func analyze(from previewURL: String?) async -> SongAudioAnalysis? {
        guard let previewURL, let remoteURL = URL(string: previewURL) else { return nil }
        var request = URLRequest(url: remoteURL)
        request.timeoutInterval = 15
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              !data.isEmpty
        else { return nil }

        let localURL = URL.temporaryDirectory
            .appendingPathComponent("dispo-key-\(UUID().uuidString)")
            .appendingPathExtension(remoteURL.pathExtension.isEmpty ? "m4a" : remoteURL.pathExtension)
        do {
            try data.write(to: localURL, options: .atomic)
            defer { try? FileManager.default.removeItem(at: localURL) }
            let audio = try await readMonoSamples(from: localURL)
            return SongAudioAnalysis(
                key: estimateKey(samples: audio.samples, sampleRate: audio.sampleRate),
                tempoBPM: estimateTempo(samples: audio.samples, sampleRate: audio.sampleRate)
            )
        } catch {
            return nil
        }
    }

    private struct MonoAudio: Sendable {
        let samples: [Float]
        let sampleRate: Double
    }

    nonisolated private static func readMonoSamples(from url: URL) async throws -> MonoAudio {
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
        var sampleRate = 44_100.0
        while reader.status == .reading, let sampleBuffer = output.copyNextSampleBuffer() {
            defer { CMSampleBufferInvalidate(sampleBuffer) }
            guard let format = CMSampleBufferGetFormatDescription(sampleBuffer),
                  let stream = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
                  let block = CMSampleBufferGetDataBuffer(sampleBuffer)
            else { continue }
            sampleRate = stream.mSampleRate
            let channels = max(1, Int(stream.mChannelsPerFrame))
            let byteCount = CMBlockBufferGetDataLength(block)
            guard byteCount >= MemoryLayout<Float>.size else { continue }
            var interleaved = [Float](repeating: 0, count: byteCount / MemoryLayout<Float>.size)
            let status = interleaved.withUnsafeMutableBytes { bytes in
                CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: bytes.baseAddress!)
            }
            guard status == kCMBlockBufferNoErr else { continue }
            if channels == 1 {
                mono.append(contentsOf: interleaved)
            } else {
                for frame in stride(from: 0, to: interleaved.count - channels + 1, by: channels) {
                    var sum: Float = 0
                    for channel in 0..<channels { sum += interleaved[frame + channel] }
                    mono.append(sum / Float(channels))
                }
            }
        }
        guard reader.status == .completed, mono.count >= 16_384 else {
            throw reader.error ?? CocoaError(.fileReadCorruptFile)
        }
        return MonoAudio(samples: mono, sampleRate: sampleRate)
    }

    /// Chromagramme Goertzel puis profils de Krumhansl-Schmuckler. Le signal
    /// est sous-échantillonné à ~11 kHz : assez pour l'harmonie, beaucoup plus
    /// léger qu'une FFT temps réel sur l'extrait complet.
    nonisolated static func estimateKey(samples: [Float], sampleRate: Double) -> MusicalKey? {
        guard sampleRate > 0, samples.count >= 16_384 else { return nil }
        let strideValue = max(1, Int((sampleRate / 11_025).rounded()))
        var reduced = Swift.stride(from: 0, to: samples.count, by: strideValue).map { samples[$0] }
        let reducedRate = sampleRate / Double(strideValue)
        guard reduced.count >= 8_192 else { return nil }

        var mean: Float = 0
        vDSP_meanv(reduced, 1, &mean, vDSP_Length(reduced.count))
        var negativeMean = -mean
        vDSP_vsadd(reduced, 1, &negativeMean, &reduced, 1, vDSP_Length(reduced.count))

        let frameSize = 4_096
        let hop = 2_048
        let maxFrames = 180
        var chroma = [Double](repeating: 0, count: 12)
        var frameStart = 0
        var frameCount = 0
        while frameStart + frameSize <= reduced.count, frameCount < maxFrames {
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
                    let power = max(0, beforePrevious * beforePrevious + previous * previous - coefficient * previous * beforePrevious)
                    chroma[midi % 12] += log1p(power) / sqrt(frequency)
                }
                frameCount += 1
            }
            frameStart += hop
        }
        guard frameCount >= 4, chroma.reduce(0, +) > 0 else { return nil }

        let major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
        let minor = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
        var candidates: [(score: Double, key: MusicalKey)] = []
        for root in 0..<12 {
            candidates.append((correlation(chroma, profile: major, root: root), MusicalKey(pitchClass: root, isMinor: false)))
            candidates.append((correlation(chroma, profile: minor, root: root), MusicalKey(pitchClass: root, isMinor: true)))
        }
        candidates.sort { $0.score > $1.score }
        guard let best = candidates.first,
              candidates.count > 1,
              best.score >= 0.35,
              best.score - candidates[1].score >= 0.015
        else { return nil }
        return best.key
    }

    /// Estimation de tempo par enveloppe d'attaques et autocorrélation. Le
    /// résultat est volontairement borné aux tempos musicaux usuels ; le
    /// formulaire permet toujours de le corriger.
    nonisolated static func estimateTempo(samples: [Float], sampleRate: Double) -> Int? {
        guard sampleRate > 0, samples.count >= 16_384 else { return nil }
        let strideValue = max(1, Int((sampleRate / 11_025).rounded()))
        let reduced = Swift.stride(from: 0, to: samples.count, by: strideValue).map { samples[$0] }
        let reducedRate = sampleRate / Double(strideValue)
        let window = 512
        let hop = 256
        guard reduced.count >= window * 8 else { return nil }

        var envelope: [Double] = []
        var previousRMS = 0.0
        for start in Swift.stride(from: 0, through: reduced.count - window, by: hop) {
            var squared: Float = 0
            reduced[start..<(start + window)].withUnsafeBufferPointer { pointer in
                vDSP_svesq(pointer.baseAddress!, 1, &squared, vDSP_Length(window))
            }
            let rms = sqrt(Double(squared) / Double(window))
            envelope.append(max(0, rms - previousRMS))
            previousRMS = rms
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

    nonisolated private static func correlation(_ chroma: [Double], profile: [Double], root: Int) -> Double {
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
}
