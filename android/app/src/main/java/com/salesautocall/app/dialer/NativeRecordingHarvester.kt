package com.salesautocall.app.dialer

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.salesautocall.app.data.AppPrefs
import kotlinx.coroutines.delay

/**
 * Harvests the phone's OWN native call recording instead of trying (and failing,
 * on modern stock Android) to capture call audio ourselves.
 *
 * How the good call-recorder apps (e.g. GoDial) actually do it:
 *   1. The user turns on their phone's built-in call recording (Samsung, MIUI,
 *      Realme, Oppo, Vivo …). The OS then writes a both-sides, native-quality
 *      file into a folder after every call.
 *   2. The app is pointed at that folder once via the Storage Access Framework
 *      (ACTION_OPEN_DOCUMENT_TREE → a persistable tree URI).
 *   3. After a call ends, the app finds the newest recording that appeared in
 *      the call's time window and uploads it.
 *
 * This captures the remote party (which MediaRecorder cannot on Android 10+),
 * needs no accessibility hack, and is Play-Store safe. Uses only framework
 * DocumentsContract (no extra dependency).
 */
object NativeRecordingHarvester {

    /** Audio file extensions OEM recorders use, in rough order of prevalence. */
    private val AUDIO_EXT = setOf("m4a", "mp3", "amr", "wav", "3gp", "aac", "ogg", "opus")

    /** True when the rep has pointed us at a native recording folder. */
    fun isConfigured(context: Context): Boolean = AppPrefs.getRecordingFolder(context).isNotBlank()

    private data class Candidate(val docId: String, val name: String, val lastModified: Long, val size: Long)

    /** A recording found in the configured folder — for the setup "Test" button. */
    data class Found(val name: String, val lastModified: Long, val size: Long)

    /**
     * The newest audio file currently sitting in the configured folder, or null.
     * Lets the setup screen prove — before any call — that we can actually see the
     * dialer's recordings (oDialer / Truecaller / OEM), so the rep isn't guessing.
     */
    fun latest(context: Context): Found? {
        val folder = AppPrefs.getRecordingFolder(context).ifBlank { return null }
        val treeUri = runCatching { Uri.parse(folder) }.getOrNull() ?: return null
        val best = newestMatch(context, treeUri, 0L, "") ?: return null
        return Found(best.name, best.lastModified, best.size)
    }

    /** A file in the configured folder — for the one-tap bulk "Sync recordings". */
    data class FileRef(val docId: String, val name: String, val lastModified: Long, val size: Long)

    /** Every audio file in the configured folder (root + one nesting level). */
    fun listAudioFiles(context: Context): List<FileRef> {
        val folder = AppPrefs.getRecordingFolder(context).ifBlank { return emptyList() }
        val treeUri = runCatching { Uri.parse(folder) }.getOrNull() ?: return emptyList()
        val rootId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull() ?: return emptyList()
        val all = mutableListOf<Candidate>()
        val subDirs = mutableListOf<String>()
        collect(context, treeUri, rootId, all, subDirs)
        for (dir in subDirs.take(12)) collect(context, treeUri, dir, all, null)
        return all.filter { it.size > 0 }.map { FileRef(it.docId, it.name, it.lastModified, it.size) }
    }

    /** Reads one file's bytes by the document id from [listAudioFiles]. */
    fun bytesOf(context: Context, docId: String): ByteArray? {
        val folder = AppPrefs.getRecordingFolder(context).ifBlank { return null }
        val treeUri = runCatching { Uri.parse(folder) }.getOrNull() ?: return null
        return readBytes(context, treeUri, docId)
    }

    /**
     * Waits briefly for the OEM to flush the recording, then returns the bytes of
     * the file that best matches this call, or null if none appeared.
     *
     * @param startedAtMillis when the call went off-hook (recording window start)
     * @param phone           the number dialed, used to prefer a filename match
     */
    suspend fun harvest(context: Context, startedAtMillis: Long, phone: String): ByteArray? {
        val folder = AppPrefs.getRecordingFolder(context).ifBlank { return null }
        val treeUri = runCatching { Uri.parse(folder) }.getOrNull() ?: return null
        val phoneDigits = phone.filter { it.isDigit() }.takeLast(10)
        // Allow the file to have started a hair before we armed, and to land a
        // while after hang-up (third-party dialers like oDialer flush lazily).
        val windowStart = startedAtMillis - 20_000L

        // Poll for ~18s: some dialers write the file several seconds after the
        // call ends (finalising the MP4/M4A container).
        repeat(12) { attempt ->
            if (attempt > 0) delay(1_500L)
            val best = newestMatch(context, treeUri, windowStart, phoneDigits)
            if (best != null) {
                val bytes = readBytes(context, treeUri, best.docId)
                if (bytes != null && bytes.isNotEmpty()) return bytes
            }
        }
        return null
    }

    /** Scans the tree (root + one level of sub-folders) for the best recent audio file. */
    private fun newestMatch(context: Context, treeUri: Uri, windowStart: Long, phoneDigits: String): Candidate? {
        val rootId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull() ?: return null
        val all = mutableListOf<Candidate>()
        val subDirs = mutableListOf<String>()
        collect(context, treeUri, rootId, all, subDirs)
        // One level of nesting (e.g. MIUI keeps call_rec under a dated folder).
        for (dir in subDirs.take(6)) collect(context, treeUri, dir, all, null)

        val recent = all.filter { it.lastModified >= windowStart && it.size > 0 }
        if (recent.isEmpty()) return null
        // Prefer a filename that contains the dialed number; else the newest file.
        val byPhone = if (phoneDigits.length >= 7) {
            recent.filter { it.name.filter { c -> c.isDigit() }.contains(phoneDigits.takeLast(8)) }
        } else emptyList()
        return (byPhone.ifEmpty { recent }).maxByOrNull { it.lastModified }
    }

    /** Lists one folder's audio files into [out]; appends child directories to [dirsOut]. */
    private fun collect(
        context: Context,
        treeUri: Uri,
        parentDocId: String,
        out: MutableList<Candidate>,
        dirsOut: MutableList<String>?,
    ) {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val proj = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
        )
        runCatching {
            context.contentResolver.query(childrenUri, proj, null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getString(0)
                    val name = c.getString(1) ?: ""
                    val modified = c.getLong(2)
                    val mime = c.getString(3) ?: ""
                    val size = if (c.isNull(4)) 0L else c.getLong(4)
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                        dirsOut?.add(id)
                    } else if (mime.startsWith("audio") || name.substringAfterLast('.', "").lowercase() in AUDIO_EXT) {
                        out.add(Candidate(id, name, modified, size))
                    }
                }
            }
        }
    }

    private fun readBytes(context: Context, treeUri: Uri, docId: String): ByteArray? {
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        return runCatching {
            context.contentResolver.openInputStream(docUri)?.use { it.readBytes() }
        }.getOrNull()
    }
}
