package com.salesautocall.app.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.salesautocall.app.BuildConfig
import kotlinx.coroutines.Dispatchers
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
    private const val TAG = "android-latest"
    private const val MANIFEST_URL = "https://github.com/$OWNER_REPO/releases/download/$TAG/version.json"
    private const val DEFAULT_APK_URL = "https://github.com/$OWNER_REPO/releases/download/$TAG/app-debug.apk"
    private const val APK_FILE = "callpro-update.apk"

    data class Release(
        val versionCode: Int,
        val versionName: String,
        val notes: String,
        val apkUrl: String,
    )

    /** The latest published release if it's newer than this build, else null. */
    suspend fun checkForUpdate(): Release? = withContext(Dispatchers.IO) {
        runCatching {
            val conn = (URL(MANIFEST_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                instanceFollowRedirects = true
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val o = JSONObject(body)
            val vc = o.optInt("versionCode", 0)
            Release(
                versionCode = vc,
                versionName = o.optString("versionName", ""),
                notes = o.optString("notes", ""),
                apkUrl = o.optString("apkUrl", DEFAULT_APK_URL).ifBlank { DEFAULT_APK_URL },
            ).takeIf { vc > BuildConfig.VERSION_CODE }
        }.getOrNull()
    }

    /** Downloads the update APK and, when finished, launches the system installer. */
    fun downloadAndInstall(context: Context, release: Release) {
        val app = context.applicationContext
        val dest = File(app.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_FILE)
        if (dest.exists()) dest.delete()

        val request = DownloadManager.Request(Uri.parse(release.apkUrl))
            .setTitle("Call Pro AI update")
            .setDescription("Downloading v${release.versionName}…")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(app, Environment.DIRECTORY_DOWNLOADS, APK_FILE)

        val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadId = runCatching { dm.enqueue(request) }.getOrNull() ?: return

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) return
                runCatching { app.unregisterReceiver(this) }
                install(app, dest)
            }
        }
        // ACTION_DOWNLOAD_COMPLETE is a system broadcast → must be exported on API 33+.
        ContextCompat.registerReceiver(
            app, receiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED,
        )
    }

    private fun install(context: Context, apk: File) {
        if (!apk.exists()) return
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runCatching { context.startActivity(intent) }
    }
}
