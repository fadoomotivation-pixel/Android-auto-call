package com.salesautocall.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Reads a photographed list ON THE PHONE with ML Kit's bundled Latin model.
 * Nothing is uploaded and it works with no signal.
 *
 * ML Kit returns text in blocks, and a table's name column and number column
 * come back as separate blocks. So every line is re-sorted into visual rows
 * (lines whose vertical centres overlap are one row, joined left to right)
 * before the parser sees it — that is what pairs a name with its number.
 */
object ScanOcr {

    class Result(
        val bitmap: Bitmap,
        /** One string per visual row, top to bottom. */
        val rows: List<String>,
        /** For each row, the boxes (bitmap pixels) of its pieces that hold digits. */
        val numberBoxes: List<List<Rect>>,
    )

    private const val MAX_SIDE = 2048

    suspend fun read(ctx: Context, uri: Uri): Result = withContext(Dispatchers.IO) {
        val bmp = loadUpright(ctx, uri) ?: error("Couldn't open that photo.")
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            val text = suspendCancellableCoroutine { cont ->
                recognizer.process(InputImage.fromBitmap(bmp, 0))
                    .addOnSuccessListener { cont.resume(it) }
                    .addOnFailureListener { cont.resumeWithException(it) }
            }
            val pieces = text.textBlocks.flatMap { b -> b.lines.mapNotNull { l -> l.boundingBox?.let { it to l.text } } }
            val (rows, boxes) = toRows(pieces)
            Result(bmp, rows, boxes)
        } finally {
            recognizer.close()
        }
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

    private fun loadUpright(ctx: Context, uri: Uri): Bitmap? {
        val cr = ctx.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
        val raw = cr.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null
        val deg = runCatching {
            cr.openInputStream(uri)?.use {
                when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } ?: 0
        }.getOrDefault(0)
        if (deg == 0) return raw
        return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(deg.toFloat()) }, true)
    }
}
