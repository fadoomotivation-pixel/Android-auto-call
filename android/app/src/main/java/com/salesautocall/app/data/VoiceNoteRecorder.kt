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

    val isRecording: Boolean get() = recorder != null

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

    /** Stops and returns (file, seconds) — or null if nothing was captured. */
    fun stop(): Pair<File, Int>? {
        val f = file
        val seconds = (((System.currentTimeMillis() - startedAtMillis) / 1000).toInt()).coerceAtLeast(1)
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
