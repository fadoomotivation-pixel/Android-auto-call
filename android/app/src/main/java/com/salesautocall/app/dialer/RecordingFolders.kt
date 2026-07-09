package com.salesautocall.app.dialer

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import java.io.File

/**
 * Finds where the phone's built-in call recorder saves its files, so the rep
 * doesn't have to hunt for the folder — we detect it and pre-open the picker
 * right there (exactly how GoDial suggests the path).
 *
 * Two signals, best first:
 *   1. MediaStore audio — ask the OS for any audio file whose path looks like a
 *      call recording; its parent folder IS the recording folder. Works without
 *      broad storage access on Android 10+.
 *   2. Known OEM folders — a fallback table of the usual locations, checked with
 *      File.exists() for older devices.
 */
object RecordingFolders {

    /** Common relative paths OEM & third-party call recorders use
     *  (label → path under shared storage), best-known first. */
    val KNOWN = listOf(
        "oDialer / Music" to "Music/Recordings/Call Recording",
        "oDialer (plural)" to "Music/Recordings/Call Recordings",
        "Music / Call Recording" to "Music/Call Recording",
        "Recordings/Call Recording" to "Recordings/Call Recording",
        "Samsung" to "Recordings/Call",
        "Xiaomi / MIUI" to "MIUI/sound_recorder/call_rec",
        "Xiaomi (new)" to "Recordings/call_rec",
        "Realme / Oppo" to "Recordings/Call Recordings",
        "Vivo" to "Record/Call",
        "OnePlus" to "Recordings/Call",
        "Truecaller" to "Truecaller",
        "Android 13+ stock" to "Recordings/Call",
    )

    /** A human display path like "Recordings/Call", or null if nothing detected. */
    fun detectDisplayPath(context: Context): String? {
        mediaStoreFolder(context)?.let { return it }
        // Fallback: first known folder that physically exists.
        val root = Environment.getExternalStorageDirectory()
        return KNOWN.firstOrNull { File(root, it.second).isDirectory }?.second
    }

    /** Ask MediaStore for a call-recording audio file and return its folder. */
    private fun mediaStoreFolder(context: Context): String? {
        val proj = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            arrayOf(MediaStore.Audio.Media.RELATIVE_PATH, MediaStore.Audio.Media.DISPLAY_NAME)
        else
            @Suppress("DEPRECATION") arrayOf(MediaStore.Audio.Media.DATA)
        // Look for paths that read like a call recording.
        val sel = "(lower(${proj[0]}) LIKE '%call%' AND lower(${proj[0]}) LIKE '%rec%') " +
            "OR lower(${proj[0]}) LIKE '%call_rec%'"
        return runCatching {
            context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, proj, sel, null,
                "${MediaStore.Audio.Media.DATE_ADDED} DESC",
            )?.use { c ->
                if (c.moveToFirst()) {
                    val raw = c.getString(0) ?: return null
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        raw.trim('/') // RELATIVE_PATH e.g. "Recordings/Call/"
                    } else {
                        // DATA is an absolute file path — return its parent folder,
                        // relative to shared storage.
                        val parent = File(raw).parent ?: return null
                        val rootPath = Environment.getExternalStorageDirectory().absolutePath
                        parent.removePrefix(rootPath).trim('/')
                    }.takeIf { it.isNotBlank() }
                } else null
            }
        }.getOrNull()
    }

    /** Builds an initial tree URI to seed the SAF folder picker at [relativePath]
     *  on the primary volume, so the picker opens right on the recording folder. */
    fun initialPickerUri(relativePath: String?): Uri? {
        if (relativePath.isNullOrBlank() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        return runCatching {
            DocumentsContract.buildDocumentUri(
                "com.android.externalstorage.documents",
                "primary:${relativePath.trim('/')}",
            )
        }.getOrNull()
    }
}
