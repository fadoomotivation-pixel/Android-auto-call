package com.salesautocall.app.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import androidx.core.content.FileProvider
import com.salesautocall.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Self-update for the side-loaded app — so we never hand-share an APK again.
 *
 * Every push to `main` rebuilds the APK and republishes it (plus a tiny
 * `version.json`) to the rolling public GitHub release `android-latest`. The app
 * reads that manifest, and if its `versionCode` is higher than the running build
 * it offers a one-tap update: download the APK and launch the system installer.
 *
 * Works because the repo is public (the release URLs need no auth) and every CI
 * build is signed with the same committed debug keystore, so the new APK installs
 * straight over the old one.
 */
object AppUpdater {
    private const val OWNER_REPO = "fadoomotivation-pixel/Android-auto-call"
    // Each brand flavor updates from its OWN GitHub release channel (UPDATE_TAG),
    // so an SN Developer install only ever pulls SN Developer builds, etc.
    private val TAG = BuildConfig.UPDATE_TAG
    private val MANIFEST_URL = "https://github.com/$OWNER_REPO/releases/download/$TAG/version.json"
    private val DEFAULT_APK_URL = "https://github.com/$OWNER_REPO/releases/download/$TAG/app-debug.apk"
    private const val APK_FILE = "callpro-update.apk"

    data class Release(
        val versionCode: Int,
        val versionName: String,
        val notes: String,
        val apkUrl: String,
        /** True when this update must be installed (critical fix / min-version). */
        val forced: Boolean = false,
    )

    /** Outcome of an update check, so the UI can tell "no update" apart from
     *  "couldn't reach the server" instead of lying "you're up to date". */
    sealed interface Result {
        data class Available(val release: Release) : Result
        data object UpToDate : Result
        /** The manifest couldn't be fetched/parsed (offline, 404, timeout…). */
        data class Failed(val reason: String) : Result
    }

    /** Fetches the channel manifest and classifies the result. */
    suspend fun check(): Result = withContext(Dispatchers.IO) {
        val body = runCatching {
            val conn = (URL(MANIFEST_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                instanceFollowRedirects = true
            }
            val code = conn.responseCode
            if (code !in 200..299) throw java.io.IOException("HTTP $code")
            conn.inputStream.bufferedReader().use { it.readText() }
        }.getOrElse { e -> return@withContext Result.Failed(e.message ?: "network error") }

        runCatching {
            val o = JSONObject(body)
            val vc = o.optInt("versionCode", 0)
            if (vc <= BuildConfig.VERSION_CODE) return@runCatching Result.UpToDate
            val forced = o.optBoolean("mandatory", false) ||
                BuildConfig.VERSION_CODE < o.optInt("minVersionCode", 0)
            Result.Available(
                Release(
                    versionCode = vc,
                    versionName = o.optString("versionName", ""),
                    notes = o.optString("notes", ""),
                    apkUrl = o.optString("apkUrl", DEFAULT_APK_URL).ifBlank { DEFAULT_APK_URL },
                    forced = forced,
                ),
            )
        }.getOrElse { e -> Result.Failed(e.message ?: "bad manifest") }
    }

    /** The newer release, or null (up-to-date OR failed). Kept for callers that
     *  don't care why — [check] distinguishes the two. */
    suspend fun checkForUpdate(): Release? = (check() as? Result.Available)?.release

    /**
     * Downloads the update APK to app storage in the background, reporting
     * progress (0f..1f). Returns the downloaded file, or null on failure. The
     * caller then hands it to [install] — that's the one unavoidable system tap
     * (Android never allows a fully-silent install for side-loaded apps).
     */
    suspend fun download(context: Context, release: Release, onProgress: (Float) -> Unit): File? = withContext(Dispatchers.IO) {
        val app = context.applicationContext
        val dest = File(app.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_FILE)
        if (dest.exists()) dest.delete()

        val request = DownloadManager.Request(Uri.parse(release.apkUrl))
            .setTitle("Updating…")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(app, Environment.DIRECTORY_DOWNLOADS, APK_FILE)

        val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val id = runCatching { dm.enqueue(request) }.getOrNull() ?: return@withContext null

        while (true) {
            val cursor = dm.query(DownloadManager.Query().setFilterById(id)) ?: break
            var status = -1
            var downloaded = 0L
            var total = 0L
            if (cursor.moveToFirst()) {
                status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            }
            cursor.close()
            if (total > 0) onProgress((downloaded.toFloat() / total).coerceIn(0f, 1f))
            when (status) {
                DownloadManager.STATUS_SUCCESSFUL -> { onProgress(1f); break }
                DownloadManager.STATUS_FAILED -> return@withContext null
            }
            delay(400)
        }
        if (dest.exists() && dest.length() > 0) dest else null
    }

    /** Launches the system installer for a downloaded APK. */
    fun install(context: Context, apk: File) {
        if (!apk.exists()) return
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runCatching { context.startActivity(intent) }
    }
}
