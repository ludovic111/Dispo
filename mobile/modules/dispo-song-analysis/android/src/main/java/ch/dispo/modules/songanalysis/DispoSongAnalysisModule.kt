package ch.dispo.modules.songanalysis

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln1p
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

class DispoSongAnalysisModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DispoSongAnalysis")

    AsyncFunction("analyzePreviewAsync") Coroutine { previewUrl: String ->
      withContext(Dispatchers.IO) {
        runCatching {
          val audio = downloadAndDecode(previewUrl)
          mapOf(
            "key" to estimateKey(audio.samples, audio.sampleRate),
            "tempoBpm" to estimateTempo(audio.samples, audio.sampleRate),
          )
        }.getOrElse {
          mapOf<String, Any?>("key" to null, "tempoBpm" to null)
        }
      }
    }
  }

  private data class MonoAudio(val samples: FloatArray, val sampleRate: Double)

  private class FloatAccumulator(initialCapacity: Int = 262_144) {
    private var values = FloatArray(initialCapacity)
    private var size = 0

    val isFull: Boolean
      get() = size >= MAX_SAMPLES

    fun add(value: Float) {
      if (isFull) return
      if (size == values.size) values = values.copyOf(min(MAX_SAMPLES, values.size * 2))
      values[size++] = if (value.isFinite()) value.coerceIn(-1f, 1f) else 0f
    }

    fun toArray(): FloatArray = values.copyOf(size)

    companion object {
      private const val MAX_SAMPLES = 2_000_000
    }
  }

  private fun downloadAndDecode(previewUrl: String): MonoAudio {
    val (connection, finalUrl) = openPreviewConnection(URL(previewUrl))
    val suffix = safeAudioExtension(finalUrl)
    val destination = File.createTempFile("dispo-song-analysis-", ".$suffix", appContext.cacheDirectory)
    try {
      val declaredLength = connection.contentLengthLong
      require(declaredLength <= MAXIMUM_DOWNLOAD_BYTES || declaredLength < 0)
      connection.inputStream.use { input ->
        destination.outputStream().use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          var total = 0L
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            require(total <= MAXIMUM_DOWNLOAD_BYTES)
            output.write(buffer, 0, count)
          }
          require(total > 0)
        }
      }
      return decodeMono(destination)
    } finally {
      connection.disconnect()
      destination.delete()
    }
  }

  private fun openPreviewConnection(initialUrl: URL): Pair<HttpURLConnection, URL> {
    var currentUrl = initialUrl
    var redirects = 0
    while (true) {
      require(isSafePreviewUrl(currentUrl))
      val connection = (currentUrl.openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 15_000
        instanceFollowRedirects = false
        requestMethod = "GET"
        useCaches = false
        setRequestProperty("Accept", "audio/*,application/octet-stream")
        setRequestProperty("Accept-Encoding", "identity")
      }
      val responseCode = try {
        connection.responseCode
      } catch (error: Throwable) {
        connection.disconnect()
        throw error
      }
      if (responseCode in 200..299) return connection to currentUrl
      if (responseCode in REDIRECT_STATUS_CODES && redirects < MAXIMUM_REDIRECTS) {
        val location = connection.getHeaderField("Location")
        connection.disconnect()
        require(!location.isNullOrBlank())
        currentUrl = URL(currentUrl, location)
        redirects++
        continue
      }
      connection.disconnect()
      error("preview_http_status_$responseCode")
    }
  }

  private fun isSafePreviewUrl(url: URL): Boolean {
    if (!url.protocol.equals("https", ignoreCase = true)) return false
    if (url.userInfo != null || (url.port != -1 && url.port != 443)) return false
    val host = url.host.lowercase()
    if (!host.contains('.') || host.endsWith('.') || host.contains(':')) return false
    val labels = host.split('.')
    if (labels.size < 2 || labels.any { label ->
        label.isEmpty() || label.startsWith('-') || label.endsWith('-') ||
          label.any { character -> !character.isLetterOrDigit() && character != '-' }
      }
    ) return false
    if (labels.size == 4 && labels.all { it.toIntOrNull() in 0..255 }) return false
    return BLOCKED_HOST_SUFFIXES.none(host::endsWith)
  }

  private fun safeAudioExtension(url: URL): String {
    val candidate = url.path.substringAfterLast('.', "").lowercase()
    return candidate.takeIf(ALLOWED_AUDIO_EXTENSIONS::contains) ?: "m4a"
  }

  private fun decodeMono(file: File): MonoAudio {
    val extractor = MediaExtractor()
    extractor.setDataSource(file.absolutePath)
    var decoder: MediaCodec? = null
    try {
      val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
        extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: error("audio_track_missing")
      val inputFormat = extractor.getTrackFormat(trackIndex)
      val mime = requireNotNull(inputFormat.getString(MediaFormat.KEY_MIME))
      extractor.selectTrack(trackIndex)
      decoder = MediaCodec.createDecoderByType(mime)
      decoder.configure(inputFormat, null, null, 0)
      decoder.start()

      val samples = FloatAccumulator()
      val info = MediaCodec.BufferInfo()
      var inputEnded = false
      var outputEnded = false
      var sampleRate = inputFormat.integerOr(MediaFormat.KEY_SAMPLE_RATE, 44_100)
      var channels = inputFormat.integerOr(MediaFormat.KEY_CHANNEL_COUNT, 1).coerceAtLeast(1)
      require(sampleRate in 8_000..384_000 && channels in 1..32)
      var pcmEncoding = AudioFormat.ENCODING_PCM_16BIT
      val deadline = System.nanoTime() + DECODE_TIMEOUT_NANOS

      while (!outputEnded && !samples.isFull) {
        require(System.nanoTime() < deadline) { "audio_decode_timeout" }
        if (!inputEnded) {
          val inputIndex = decoder.dequeueInputBuffer(10_000)
          if (inputIndex >= 0) {
            val buffer = requireNotNull(decoder.getInputBuffer(inputIndex))
            val count = extractor.readSampleData(buffer, 0)
            if (count < 0) {
              decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputEnded = true
            } else {
              decoder.queueInputBuffer(inputIndex, 0, count, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        when (val outputIndex = decoder.dequeueOutputBuffer(info, 10_000)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val outputFormat = decoder.outputFormat
            sampleRate = outputFormat.integerOr(MediaFormat.KEY_SAMPLE_RATE, sampleRate)
            channels = outputFormat.integerOr(MediaFormat.KEY_CHANNEL_COUNT, channels).coerceAtLeast(1)
            pcmEncoding = outputFormat.integerOr(MediaFormat.KEY_PCM_ENCODING, pcmEncoding)
            require(sampleRate in 8_000..384_000 && channels in 1..32)
          }
          MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
          else -> if (outputIndex >= 0) {
            decoder.getOutputBuffer(outputIndex)?.let { raw ->
              require(info.offset >= 0 && info.size >= 0 && info.offset <= raw.capacity() - info.size)
              val buffer = raw.duplicate().order(ByteOrder.LITTLE_ENDIAN)
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              appendMonoSamples(buffer.slice().order(ByteOrder.LITTLE_ENDIAN), pcmEncoding, channels, samples)
            }
            outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            decoder.releaseOutputBuffer(outputIndex, false)
          }
        }
      }
      val decoded = samples.toArray()
      require(decoded.size >= 16_384)
      return MonoAudio(decoded, sampleRate.toDouble())
    } finally {
      runCatching { decoder?.stop() }
      decoder?.release()
      extractor.release()
    }
  }

  private fun appendMonoSamples(
    buffer: java.nio.ByteBuffer,
    encoding: Int,
    channels: Int,
    destination: FloatAccumulator,
  ) {
    when (encoding) {
      AudioFormat.ENCODING_PCM_FLOAT -> {
        while (buffer.remaining() >= Float.SIZE_BYTES * channels && !destination.isFull) {
          var total = 0f
          repeat(channels) { total += buffer.float }
          destination.add(total / channels)
        }
      }
      AudioFormat.ENCODING_PCM_8BIT -> {
        while (buffer.remaining() >= channels && !destination.isFull) {
          var total = 0f
          repeat(channels) { total += ((buffer.get().toInt() and 0xff) - 128) / 128f }
          destination.add(total / channels)
        }
      }
      AudioFormat.ENCODING_PCM_16BIT -> {
        while (buffer.remaining() >= Short.SIZE_BYTES * channels && !destination.isFull) {
          var total = 0f
          repeat(channels) { total += buffer.short / 32_768f }
          destination.add(total / channels)
        }
      }
      AudioFormat.ENCODING_PCM_24BIT_PACKED -> {
        while (buffer.remaining() >= 3 * channels && !destination.isFull) {
          var total = 0f
          repeat(channels) {
            val raw = (buffer.get().toInt() and 0xff) or
              ((buffer.get().toInt() and 0xff) shl 8) or
              ((buffer.get().toInt() and 0xff) shl 16)
            val signed = if (raw and 0x80_0000 != 0) raw or -0x100_0000 else raw
            total += signed / 8_388_608f
          }
          destination.add(total / channels)
        }
      }
      AudioFormat.ENCODING_PCM_32BIT -> {
        while (buffer.remaining() >= Int.SIZE_BYTES * channels && !destination.isFull) {
          var total = 0f
          repeat(channels) { total += buffer.int / 2_147_483_648f }
          destination.add(total / channels)
        }
      }
      else -> error("unsupported_pcm_encoding_$encoding")
    }
  }

  private fun MediaFormat.integerOr(key: String, fallback: Int): Int =
    if (containsKey(key)) getInteger(key) else fallback

  private fun estimateKey(samples: FloatArray, sampleRate: Double): String? {
    if (sampleRate <= 0 || samples.size < 16_384) return null
    val sampleStride = max(1, (sampleRate / 11_025.0).roundToInt())
    val reduced = FloatArray((samples.size + sampleStride - 1) / sampleStride)
    var reducedCount = 0
    var source = 0
    while (source < samples.size) {
      reduced[reducedCount++] = samples[source]
      source += sampleStride
    }
    if (reducedCount < 8_192) return null
    val mean = (0 until reducedCount).sumOf { reduced[it].toDouble() } / reducedCount
    for (index in 0 until reducedCount) reduced[index] = (reduced[index] - mean).toFloat()
    val reducedRate = sampleRate / sampleStride

    val frameSize = 4_096
    val hop = 2_048
    val chroma = DoubleArray(12)
    var frameStart = 0
    var frameCount = 0
    while (frameStart + frameSize <= reducedCount && frameCount < 180) {
      var energy = 0.0
      for (index in frameStart until frameStart + frameSize) {
        energy += reduced[index] * reduced[index]
      }
      if (energy / frameSize > 0.000_001) {
        for (midi in 36..95) {
          val frequency = 440.0 * 2.0.pow((midi - 69) / 12.0)
          if (frequency >= reducedRate * 0.46) continue
          val omega = 2.0 * PI * frequency / reducedRate
          val coefficient = 2.0 * cos(omega)
          var previous = 0.0
          var beforePrevious = 0.0
          for (offset in 0 until frameSize) {
            val window = 0.5 - 0.5 * cos(2.0 * PI * offset / (frameSize - 1))
            val current = reduced[frameStart + offset] * window + coefficient * previous - beforePrevious
            beforePrevious = previous
            previous = current
          }
          val power = max(
            0.0,
            beforePrevious * beforePrevious + previous * previous - coefficient * previous * beforePrevious,
          )
          chroma[midi % 12] += ln1p(power) / sqrt(frequency)
        }
        frameCount++
      }
      frameStart += hop
    }
    if (frameCount < 4 || chroma.sum() <= 0) return null

    val major = doubleArrayOf(6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
    val minor = doubleArrayOf(6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
    val candidates = buildList {
      for (root in 0 until 12) {
        add(KeyCandidate(correlation(chroma, major, root), root, false))
        add(KeyCandidate(correlation(chroma, minor, root), root, true))
      }
    }.sortedByDescending { it.score }
    val best = candidates.firstOrNull() ?: return null
    if (best.score < 0.35 || best.score - candidates[1].score < 0.015) return null
    return musicalKeyLabel(best.root, best.isMinor)
  }

  private data class KeyCandidate(val score: Double, val root: Int, val isMinor: Boolean)

  private fun estimateTempo(samples: FloatArray, sampleRate: Double): Int? {
    if (sampleRate <= 0 || samples.size < 16_384) return null
    val sampleStride = max(1, (sampleRate / 11_025.0).roundToInt())
    val reduced = FloatArray((samples.size + sampleStride - 1) / sampleStride)
    var reducedCount = 0
    var source = 0
    while (source < samples.size) {
      reduced[reducedCount++] = samples[source]
      source += sampleStride
    }
    val window = 512
    val hop = 256
    if (reducedCount < window * 8) return null
    val envelope = ArrayList<Double>()
    var previousRms = 0.0
    var start = 0
    while (start + window <= reducedCount) {
      var squared = 0.0
      for (index in start until start + window) squared += reduced[index] * reduced[index]
      val rms = sqrt(squared / window)
      envelope.add(max(0.0, rms - previousRms))
      previousRms = rms
      start += hop
    }
    val envelopeRate = (sampleRate / sampleStride) / hop
    val minimumLag = max(1, (60 * envelopeRate / 200).roundToInt())
    val maximumLag = min(envelope.size / 2, (60 * envelopeRate / 55).roundToInt())
    if (maximumLag <= minimumLag) return null
    val mean = envelope.average()
    val centered = envelope.map { it - mean }
    var bestLag = 0
    var bestScore = Double.NEGATIVE_INFINITY
    for (lag in minimumLag..maximumLag) {
      var numerator = 0.0
      var energyA = 0.0
      var energyB = 0.0
      for (index in lag until centered.size) {
        val a = centered[index]
        val b = centered[index - lag]
        numerator += a * b
        energyA += a * a
        energyB += b * b
      }
      if (energyA <= 0 || energyB <= 0) continue
      val score = numerator / sqrt(energyA * energyB)
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }
    if (bestLag <= 0 || bestScore < 0.08) return null
    var bpm = 60 * envelopeRate / bestLag
    while (bpm < 75) bpm *= 2
    while (bpm > 190) bpm /= 2
    return bpm.roundToInt().takeIf { it in 40..240 }
  }

  private fun correlation(chroma: DoubleArray, profile: DoubleArray, root: Int): Double {
    val xMean = chroma.average()
    val yMean = profile.average()
    var numerator = 0.0
    var xEnergy = 0.0
    var yEnergy = 0.0
    for (pitch in 0 until 12) {
      val x = chroma[pitch] - xMean
      val y = profile[(pitch - root + 12) % 12] - yMean
      numerator += x * y
      xEnergy += x * x
      yEnergy += y * y
    }
    return if (xEnergy > 0 && yEnergy > 0) numerator / sqrt(xEnergy * yEnergy) else -1.0
  }

  private fun musicalKeyLabel(root: Int, isMinor: Boolean): String {
    val flatNames = arrayOf("C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B")
    val sharpNames = arrayOf("C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B")
    val normalized = ((root % 12) + 12) % 12
    val sharpMajors = setOf(7, 2, 9, 4, 11, 6)
    val sharpMinors = setOf(4, 11, 6, 1, 8, 3)
    val preferSharps = if (isMinor) normalized in sharpMinors else normalized in sharpMajors
    val name = (if (preferSharps) sharpNames else flatNames)[normalized]
    return if (isMinor) "${name}m" else name
  }

  private companion object {
    const val MAXIMUM_DOWNLOAD_BYTES = 25_000_000L
    const val MAXIMUM_REDIRECTS = 3
    const val DECODE_TIMEOUT_NANOS = 45_000_000_000L

    val REDIRECT_STATUS_CODES = setOf(301, 302, 303, 307, 308)
    val ALLOWED_AUDIO_EXTENSIONS = setOf("aac", "aif", "aiff", "caf", "m4a", "mp3", "mp4", "wav")
    val BLOCKED_HOST_SUFFIXES = setOf(".local", ".localhost", ".internal", ".lan", ".home", ".corp")
  }
}
