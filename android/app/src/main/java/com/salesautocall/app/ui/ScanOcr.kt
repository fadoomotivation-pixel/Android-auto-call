package com.salesautocall.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Reads a photographed list ON THE PHONE with ML Kit's bundled Latin model.
 * Nothing is uploaded and it works with no signal.
 *
 * Image path (each step exists because a real phone failed without it):
 *  1. Copy the uri's bytes into our own cache file first. Gallery content
 *     uris can lose their read grant once the picker is gone, and some camera
 *     apps return RESULT_OK a moment before the file is fully written, so we
 *     wait briefly for a non-empty, size-stable file.
 *  2. Decode from that file, scaled so the long side is at most ~2000 px:
 *     ImageDecoder on Android 9+ (HEIC/WEBP/PNG/JPEG, EXIF rotation applied),
 *     BitmapFactory with a correct bounds pass + EXIF rotation below that.
 *  3. Retry the decode once, then hand ML Kit a software bitmap.
 *
 * ML Kit returns text in blocks, and a table's name column and number column
 * come back as separate blocks. So every line is re-sorted into visual rows
 * (lines whose vertical centres overlap are one row, joined left to right)
 * before the parser sees it — that is what pairs a name with its number.
 */
object ScanOcr {

    /** A failure the screen can explain in plain words. */
    class ScanError(val kind: Kind, message: String) : Exception(message) {
        enum class Kind { EMPTY, UNREADABLE, NO_TEXT }
    }

    class Result(
        val bitmap: Bitmap,
        /** One string per visual row, top to bottom. */
        val rows: List<String>,
        /** For each row, the boxes (bitmap pixels) of its pieces that hold digits. */
        val numberBoxes: List<List<Rect>>,
    )

    internal const val MAX_SIDE = 2000

    suspend fun read(ctx: Context, uri: Uri): Result {
        val file = withContext(Dispatchers.IO) { copyToCache(ctx, uri) }
        val bmp = withContext(Dispatchers.IO) {
            decode(file) ?: run { delay(400); decode(file) }
        } ?: throw ScanError(ScanError.Kind.UNREADABLE, "Couldn't read this photo's format. Try another photo or a screenshot.")
        val text = withContext(Dispatchers.Default) {
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            try {
                suspendCancellableCoroutine { cont ->
                    recognizer.process(InputImage.fromBitmap(bmp, 0))
                        .addOnSuccessListener { cont.resume(it) }
                        .addOnFailureListener { cont.resumeWithException(it) }
                }
            } finally {
                recognizer.close()
            }
        }
        val pieces = text.textBlocks.flatMap { b -> b.lines.mapNotNull { l -> l.boundingBox?.let { it to l.text } } }
        val (rows, boxes) = toRows(pieces)
        if (rows.none { it.isNotBlank() }) {
            // Keep the photo so the rep sees what was read.
            throw NoText(bmp)
        }
        return Result(bmp, rows, boxes)
    }

    /** No text at all; carries the decoded photo so the preview still shows. */
    class NoText(val bitmap: Bitmap) : Exception("No text found in this photo. Hold the phone straight over the list, in good light.")

    /** Copies the image into cache/scans, waiting for a camera app that is still writing. */
    private suspend fun copyToCache(ctx: Context, uri: Uri): File {
        val dir = File(ctx.cacheDir, "scans").apply { mkdirs() }
        val out = File(dir, "in_${System.currentTimeMillis()}")
        var lastSize = -1L
        repeat(8) {
            val n = runCatching {
                ctx.contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } } ?: -1L
            }.getOrDefault(-1L)
            if (n > 0 && n == lastSize) return out
            lastSize = n
            delay(250)
        }
        if (lastSize > 0) return out
        out.delete()
        throw ScanError(ScanError.Kind.EMPTY, "The photo came back empty. Please take it again.")
    }

    private fun decode(file: File): Bitmap? = runCatching {
        val b = if (Build.VERSION.SDK_INT >= 28) decodeP(file) else decodeLegacy(file)
        b?.takeIf { it.width > 1 && it.height > 1 }
    }.getOrNull() ?: runCatching { decodeLegacy(file) }.getOrNull()

    @androidx.annotation.RequiresApi(28)
    private fun decodeP(file: File): Bitmap =
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(file)) { decoder, info, _ ->
            val (w, h) = info.size.width to info.size.height
            val s = sampleFor(w, h)
            decoder.setTargetSize(maxOf(1, w / s), maxOf(1, h / s))
            // ML Kit and Bitmap.createBitmap need a software bitmap, not HARDWARE.
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            decoder.isMutableRequired = false
        }

    private fun decodeLegacy(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        // With inJustDecodeBounds the decoder returns null by design; read the
        // size from the options. (Treating that null as failure was the bug.)
        BitmapFactory.decodeFile(file.path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val raw = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply {
            inSampleSize = sampleFor(bounds.outWidth, bounds.outHeight)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }) ?: return null
        val deg = runCatching {
            when (ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        }.getOrDefault(0)
        if (deg == 0) return raw
        return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(deg.toFloat()) }, true)
    }

    /** Power-of-two sample so the long side lands at or under [MAX_SIDE]. */
    internal fun sampleFor(w: Int, h: Int): Int {
        var s = 1
        while (maxOf(w, h) / s > MAX_SIDE) s *= 2
        return s
    }

    /** Groups OCR lines into visual rows. Pure so it stays easy to reason about. */
    internal fun toRows(pieces: List<Pair<Rect, String>>): Pair<List<String>, List<List<Rect>>> {
        val sorted = pieces.sortedBy { it.first.centerY() }
        val groups = ArrayList<MutableList<Pair<Rect, String>>>()
        for (p in sorted) {
            val g = groups.lastOrNull()
            val ref = g?.let { gr -> gr.sumOf { it.first.centerY() } / gr.size }
            val half = p.first.height() / 2
            if (g != null && ref != null && kotlin.math.abs(p.first.centerY() - ref) <= maxOf(half, 8)) g += p
            else groups += mutableListOf(p)
        }
        val rows = groups.map { g -> g.sortedBy { it.first.left }.joinToString("   ") { it.second } }
        val boxes = groups.map { g -> g.filter { it.second.count(Char::isDigit) >= 7 }.map { it.first } }
        return rows to boxes
    }
}
