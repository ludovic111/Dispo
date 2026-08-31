package ch.dispo.modules.documentpreview

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.UUID

class DispoDocumentPreviewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DispoDocumentPreview")

    AsyncFunction("openAsync") Coroutine { signedUrl: String, requestedFileName: String, _: String ->
      val file = withContext(Dispatchers.IO) {
        downloadDocument(signedUrl, requestedFileName)
      }
      withContext(Dispatchers.Main) { openNativeViewer(file) }
    }

    AsyncFunction("releaseAsync") Coroutine { localUri: String ->
      withContext(Dispatchers.IO) { removeCachedFile(localUri) }
    }
  }

  private fun openNativeViewer(file: File): Map<String, String> {
    val localUri = file.toURI().toString()
    val activity = appContext.currentActivity
      ?: return mapOf("localUri" to localUri, "status" to "viewerUnavailable")
    val contentUri = FileProvider.getUriForFile(
      activity,
      "${activity.packageName}.dispo.documentpreview",
      file,
    )
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(contentUri, mimeTypeFor(file.extension))
      clipData = ClipData.newRawUri(file.name, contentUri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_DOCUMENT)
    }
    return try {
      activity.startActivity(intent)
      mapOf("localUri" to localUri, "status" to "opened")
    } catch (_: ActivityNotFoundException) {
      mapOf("localUri" to localUri, "status" to "viewerUnavailable")
    }
  }

  private fun downloadDocument(signedUrl: String, requestedFileName: String): File {
    val initialUrl = URL(signedUrl)
    require(isSafeSignedUrl(initialUrl)) { "document_preview_url_invalid" }
    val safeFileName = sanitizedFileName(requestedFileName)
    val (connection, _) = openConnection(initialUrl)
    val root = File(appContext.cacheDirectory, CACHE_DIRECTORY).apply {
      require(isDirectory || mkdirs()) { "document_preview_cache_unavailable" }
    }
    removeStaleCache(root)
    val directory = File(root, UUID.randomUUID().toString()).apply {
      require(mkdirs()) { "document_preview_cache_unavailable" }
    }
    val destination = File(directory, safeFileName)
    try {
      val declaredLength = connection.contentLengthLong
      require(declaredLength <= MAXIMUM_DOWNLOAD_BYTES || declaredLength < 0) {
        "document_preview_file_too_large"
      }
      connection.inputStream.use { input ->
        destination.outputStream().use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          var total = 0L
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            require(total <= MAXIMUM_DOWNLOAD_BYTES) { "document_preview_file_too_large" }
            output.write(buffer, 0, count)
          }
          require(total > 0) { "document_preview_file_invalid" }
        }
      }
      return destination
    } catch (error: Throwable) {
      directory.deleteRecursively()
      throw error
    } finally {
      connection.disconnect()
    }
  }

  private fun openConnection(initialUrl: URL): Pair<HttpURLConnection, URL> {
    var currentUrl = initialUrl
    var redirects = 0
    while (true) {
      require(isSafeRemoteUrl(currentUrl)) { "document_preview_url_invalid" }
      val connection = (currentUrl.openConnection() as HttpURLConnection).apply {
        connectTimeout = 20_000
        readTimeout = 45_000
        instanceFollowRedirects = false
        requestMethod = "GET"
        useCaches = false
        setRequestProperty(
          "Accept",
          "application/pdf,image/*,text/plain,application/octet-stream",
        )
        setRequestProperty("Accept-Encoding", "identity")
      }
      val status = try {
        connection.responseCode
      } catch (error: Throwable) {
        connection.disconnect()
        throw error
      }
      if (status in 200..299) return connection to currentUrl
      if (status in REDIRECT_STATUS_CODES && redirects < MAXIMUM_REDIRECTS) {
        val location = connection.getHeaderField("Location")
        connection.disconnect()
        require(!location.isNullOrBlank()) { "document_preview_redirect_invalid" }
        currentUrl = URL(currentUrl, location)
        require(isSafeRemoteUrl(currentUrl)) { "document_preview_redirect_invalid" }
        redirects++
        continue
      }
      connection.disconnect()
      error("document_preview_http_status_$status")
    }
  }

  private fun isSafeSignedUrl(url: URL): Boolean {
    if (!isSafeRemoteUrl(url)) return false
    return runCatching {
      android.net.Uri.parse(url.toString()).getQueryParameter("token").orEmpty().isNotEmpty()
    }.getOrDefault(false)
  }

  private fun isSafeRemoteUrl(url: URL): Boolean {
    if (!url.protocol.equals("https", ignoreCase = true)) return false
    if (url.userInfo != null || (url.port != -1 && url.port != 443)) return false
    val host = url.host.lowercase()
    if (!host.contains('.') || host.endsWith('.') || host.contains(':')) return false
    val labels = host.split('.')
    if (labels.size < 2 || labels.any { label ->
        label.isEmpty() || label.startsWith('-') || label.endsWith('-') ||
          label.any { character ->
            character !in 'a'..'z' && character !in '0'..'9' && character != '-'
          }
      }
    ) return false
    if (labels.size == 4 && labels.all { it.toIntOrNull() in 0..255 }) return false
    return BLOCKED_HOST_SUFFIXES.none(host::endsWith)
  }

  private fun sanitizedFileName(requested: String): String {
    val lastComponent = requested.substringAfterLast('/').substringAfterLast('\\')
    val extension = lastComponent.substringAfterLast('.', "").lowercase()
    require(extension in ALLOWED_EXTENSIONS) { "document_preview_type_invalid" }
    val rawStem = lastComponent.removeSuffix(".$extension")
    val stem = rawStem
      .replace(Regex("[\\u0000-\\u001f\\u007f/\\\\:*?\"<>|%]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
      .trimEnd('.', ' ')
      .ifEmpty { "Document" }
      .take(100)
    return "$stem.$extension"
  }

  private fun mimeTypeFor(extension: String): String = when (extension.lowercase()) {
    "jpeg", "jpg" -> "image/jpeg"
    "pdf" -> "application/pdf"
    "png" -> "image/png"
    "txt" -> "text/plain"
    else -> "application/octet-stream"
  }

  private fun removeStaleCache(root: File) {
    val cutoff = System.currentTimeMillis() - STALE_CACHE_AGE_MILLIS
    root.listFiles()?.forEach { entry ->
      if (entry.lastModified() <= 0L || entry.lastModified() < cutoff) entry.deleteRecursively()
    }
  }

  private fun removeCachedFile(localUri: String) {
    val file = runCatching { File(URI(localUri)).canonicalFile }.getOrNull() ?: return
    val root = File(appContext.cacheDirectory, CACHE_DIRECTORY).canonicalFile
    if (!file.path.startsWith(root.path + File.separator)) return
    file.parentFile?.deleteRecursively()
  }

  companion object {
    private const val CACHE_DIRECTORY = "dispo-document-preview"
    private const val MAXIMUM_DOWNLOAD_BYTES = 25L * 1_024L * 1_024L
    private const val MAXIMUM_REDIRECTS = 5
    private const val STALE_CACHE_AGE_MILLIS = 24L * 60L * 60L * 1_000L
    private val ALLOWED_EXTENSIONS = setOf("jpeg", "jpg", "pdf", "png", "txt")
    private val BLOCKED_HOST_SUFFIXES = setOf(
      ".local",
      ".localhost",
      ".internal",
      ".lan",
      ".home",
      ".corp",
    )
    private val REDIRECT_STATUS_CODES = setOf(301, 302, 303, 307, 308)
  }
}
