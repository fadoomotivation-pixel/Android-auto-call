package com.salesautocall.app.dialer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import androidx.core.app.ActivityCompat
import java.io.File

/**
 * Best-effort SIM-call recorder. Android restricts capturing call audio since
 * Android 10, so this records through the microphone with the loudspeaker forced
 * on, which picks up both sides. Quality and availability are device-dependent —
 * every call here is wrapped so a failure never disrupts the dial loop.
 */
object SimRecorder {

    private var recorder: MediaRecorder? = null
    private var outputPath: String? = null
    private var audioManager: AudioManager? = null
    private var prevSpeaker = false

    /** Starts recording; returns true if it actually began. */
    fun start(context: Context): Boolean {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        if (recorder != null) return false

        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager = am
        prevSpeaker = am.isSpeakerphoneOn
        runCatching { am.isSpeakerphoneOn = true } // so the mic hears the remote party

        val file = File(context.cacheDir, "simrec_${System.currentTimeMillis()}.m4a")
        // Try the richer call-oriented source first, then fall back to the plain mic.
        for (source in intArrayOf(MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.MIC)) {
            val ok = runCatching {
                val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
                r.setAudioSource(source)
                r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                r.setAudioEncodingBitRate(32_000)
                r.setAudioSamplingRate(16_000)
                r.setOutputFile(file.absolutePath)
                r.prepare()
                r.start()
                recorder = r
            }.isSuccess
            if (ok) {
                outputPath = file.absolutePath
                return true
            }
            runCatching { recorder?.release() }
            recorder = null
        }
        runCatching { am.isSpeakerphoneOn = prevSpeaker }
        return false
    }

    /** Stops recording and returns the file path (or null if nothing was captured). */
    fun stop(): String? {
        val path = outputPath
        runCatching { recorder?.stop() }
        runCatching { recorder?.release() }
        recorder = null
        runCatching { audioManager?.isSpeakerphoneOn = prevSpeaker }
        audioManager = null
        outputPath = null
        val f = path?.let { File(it) }
        return if (f != null && f.exists() && f.length() > 0) path else null
    }
}
