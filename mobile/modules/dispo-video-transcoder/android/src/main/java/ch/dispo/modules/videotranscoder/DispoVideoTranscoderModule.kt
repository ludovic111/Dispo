package ch.dispo.modules.videotranscoder

import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

@UnstableApi
class DispoVideoTranscoderModule : Module() {
  private data class SourceMetadata(
    val durationMs: Long,
    val hasAudio: Boolean,
    val outputHeight: Int,
    val outputWidth: Int,
  )

  private data class ActiveExport(
    val cancel: () -> Unit,
    val output: File,
    val transformer: Transformer,
  )

  private val activeExports = ConcurrentHashMap<String, ActiveExport>()
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("DispoVideoTranscoder")

    AsyncFunction("transcodeAsync") Coroutine { sourceUri: String, jobId: String ->
      require(jobId.isNotBlank() && jobId.length <= 128) { "video_transcode_invalid_source" }
      val uri = Uri.parse(sourceUri)
      require(uri.scheme == "file" || uri.scheme == "content") { "video_transcode_invalid_source" }
      val context = appContext.reactContext ?: error("video_transcoder_unavailable")
      val metadata = withContext(Dispatchers.IO) { readMetadata(uri) }
      val output = File.createTempFile("dispo-video-transcoder-", ".mp4", context.cacheDir)
      check(output.delete()) { "video_transcode_failed" }
      try {
        withContext(Dispatchers.Main.immediate) {
          export(uri, output, jobId, metadata)
        }
      } catch (error: Throwable) {
        output.delete()
        throw error
      }
    }

    AsyncFunction("cancelAsync") Coroutine { jobId: String ->
      withContext(Dispatchers.Main.immediate) { cancelExport(jobId) }
    }

    AsyncFunction("removeOutputAsync") Coroutine { outputUri: String ->
      withContext(Dispatchers.IO) { removeOutput(outputUri) }
    }

    OnDestroy {
      mainHandler.post {
        activeExports.keys.toList().forEach(::cancelExport)
      }
    }
  }

  private fun readMetadata(uri: Uri): SourceMetadata {
    val context = appContext.reactContext ?: error("video_transcoder_unavailable")
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, uri)
      val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        ?: error("video_transcode_invalid_source")
      require(duration in 1..MAX_DURATION_MS) { "video_transcode_invalid_source" }
      val rawWidth = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
        ?: error("video_transcode_invalid_source")
      val rawHeight = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
        ?: error("video_transcode_invalid_source")
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val displayWidth = if (rotation.mod(180) == 0) rawWidth else rawHeight
      val displayHeight = if (rotation.mod(180) == 0) rawHeight else rawWidth
      require(displayWidth > 0 && displayHeight > 0) { "video_transcode_invalid_source" }
      val scale = min(
        1.0,
        min(MAX_LONG_SIDE.toDouble() / max(displayWidth, displayHeight), MAX_SHORT_SIDE.toDouble() / min(displayWidth, displayHeight)),
      )
      val outputWidth = evenDimension(displayWidth * scale)
      val outputHeight = evenDimension(displayHeight * scale)
      return SourceMetadata(
        durationMs = duration,
        hasAudio = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes",
        outputHeight = outputHeight,
        outputWidth = outputWidth,
      )
    } catch (error: Throwable) {
      if (error.message?.contains("video_transcode_invalid_source") == true) throw error
      throw IllegalArgumentException("video_transcode_invalid_source", error)
    } finally {
      retriever.release()
    }
  }

  private fun evenDimension(value: Double): Int = max(2, (floor(value / 2.0) * 2.0).toInt())

  private suspend fun export(
    source: Uri,
    output: File,
    jobId: String,
    metadata: SourceMetadata,
  ): Map<String, Any> = suspendCancellableCoroutine { continuation ->
    if (activeExports.containsKey(jobId)) {
      continuation.resumeWithException(IllegalStateException("video_transcode_invalid_source"))
      return@suspendCancellableCoroutine
    }

    val videoSettings = VideoEncoderSettings.Builder()
      .setBitrate(TARGET_BIT_RATE)
      .setiFrameIntervalSeconds(2f)
      .build()
    val encoderFactory = DefaultEncoderFactory.Builder(requireNotNull(appContext.reactContext))
      .setRequestedVideoEncoderSettings(videoSettings)
      .build()
    lateinit var transformer: Transformer

    fun fail(error: Throwable) {
      val active = activeExports.remove(jobId) ?: return
      active.output.delete()
      if (continuation.isActive) continuation.resumeWithException(error)
    }

    val listener = object : Transformer.Listener {
      override fun onCompleted(composition: Composition, exportResult: ExportResult) {
        activeExports.remove(jobId) ?: return
        val fileSize = output.length()
        val duration = exportResult.approximateDurationMs.takeIf { it > 0 } ?: metadata.durationMs
        val width = exportResult.width
        val height = exportResult.height
        val valid = output.isFile && fileSize > 0 &&
          duration in 1..MAX_DURATION_MS &&
          width > 0 && height > 0 &&
          max(width, height) <= MAX_LONG_SIDE && min(width, height) <= MAX_SHORT_SIDE &&
          exportResult.videoMimeType == MimeTypes.VIDEO_H264 &&
          (!metadata.hasAudio || exportResult.audioMimeType != null)
        if (!valid) {
          output.delete()
          if (continuation.isActive) {
            continuation.resumeWithException(IllegalStateException("video_transcode_failed"))
          }
          return
        }
        if (continuation.isActive) {
          continuation.resume(
            mapOf(
              "durationMs" to duration.toDouble(),
              "fileSize" to fileSize.toDouble(),
              "hasAudio" to (exportResult.audioMimeType != null),
              "height" to height,
              "mimeType" to "video/mp4",
              "uri" to Uri.fromFile(output).toString(),
              "width" to width,
            ),
          )
        }
      }

      override fun onError(
        composition: Composition,
        exportResult: ExportResult,
        exportException: ExportException,
      ) {
        fail(IllegalStateException("video_transcode_failed", exportException))
      }
    }

    transformer = Transformer.Builder(requireNotNull(appContext.reactContext))
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setEncoderFactory(encoderFactory)
      .addListener(listener)
      .build()

    val active = ActiveExport(
      cancel = {
        transformer.cancel()
        output.delete()
        if (continuation.isActive) {
          continuation.resumeWithException(IllegalStateException("video_transcode_cancelled"))
        }
      },
      output = output,
      transformer = transformer,
    )
    activeExports[jobId] = active
    continuation.invokeOnCancellation {
      mainHandler.post { cancelExport(jobId) }
    }
    try {
      val presentation = Presentation.createForWidthAndHeight(
        metadata.outputWidth,
        metadata.outputHeight,
        Presentation.LAYOUT_SCALE_TO_FIT,
      )
      val editedMedia = EditedMediaItem.Builder(MediaItem.fromUri(source))
        .setEffects(Effects(emptyList(), listOf(presentation)))
        .build()
      transformer.start(editedMedia, output.absolutePath)
    } catch (error: Throwable) {
      fail(IllegalStateException("video_transcode_failed", error))
    }
  }

  private fun cancelExport(jobId: String) {
    activeExports.remove(jobId)?.cancel?.invoke()
  }

  private fun removeOutput(outputUri: String) {
    val context = appContext.reactContext ?: return
    val uri = Uri.parse(outputUri)
    if (uri.scheme != "file") return
    val output = uri.path?.let(::File) ?: return
    val cache = context.cacheDir.canonicalFile
    val candidate = runCatching { output.canonicalFile }.getOrNull() ?: return
    if (
      candidate.parentFile == cache &&
      candidate.name.startsWith("dispo-video-transcoder-") &&
      candidate.extension.equals("mp4", ignoreCase = true)
    ) {
      candidate.delete()
    }
  }

  companion object {
    private const val MAX_DURATION_MS = 181_000L
    private const val MAX_LONG_SIDE = 1_280
    private const val MAX_SHORT_SIDE = 720
    private const val TARGET_BIT_RATE = 2_000_000
  }
}
