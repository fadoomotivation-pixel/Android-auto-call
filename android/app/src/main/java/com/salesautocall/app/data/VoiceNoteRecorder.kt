package com.salesautocall.app.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Records the telecaller's own voice note (plain mic — no call-audio
 * restrictions apply) into a small AAC/m4a cache file.
 */
object VoiceNoteRecorder {

    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAtMillis: Long = 0

    /**
     * Shorter than this and it isn't a note, it's a mis-tap. Reps were producing
     * dozens of 1-2 second takes a day — long enough to save, far too short to
     * say anything — and the server then had to throw them away. Nothing below
     * this ever gets saved now, so the rep never sees a note they can't use.
     */
    const val MIN_MS = 3_000L

    val isRecording: Boolean get() = recorder != null

    /** How long the current take has been running; 0 when idle. */
    val elapsedMs: Long get() = if (recorder == null) 0L else System.currentTimeMillis() - startedAtMillis

    /** Starts recording; returns false if mic permission is missing or busy. */
    fun start(context: Context): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        if (recorder != null) return false
        val out = File(context.cacheDir, "voicenote_${System.currentTimeMillis()}.m4a")
        return runCatching {
            val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context)
            else @Suppress("DEPRECATION") MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioEncodingBitRate(64_000)
            r.setAudioSamplingRate(44_100)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = out
            startedAtMillis = System.currentTimeMillis()
        }.isSuccess.also { ok -> if (!ok) cleanup() }
    }

    /**
     * Stops and returns (file, seconds) — or null if nothing was captured.
     *
     * Rounds rather than truncates: a 1.9s take used to be filed as "1s", which
     * made every short note look even shorter than it was and sent honest ones
     * under the server's minimum.
     */
    fun stop(): Pair<File, Int>? {
        val f = file
        val seconds = Math.round((System.currentTimeMillis() - startedAtMillis) / 1000.0)
            .toInt().coerceAtLeast(1)
        runCatching { recorder?.stop() }
        cleanup()
        return if (f != null && f.exists() && f.length() > 0) f to seconds else null
    }

    /** Discards the take. */
    fun cancel() {
        runCatching { recorder?.stop() }
        file?.let { runCatching { it.delete() } }
        cleanup()
    }

    private fun cleanup() {
        runCatching { recorder?.release() }
        recorder = null
        file = null
    }
}
