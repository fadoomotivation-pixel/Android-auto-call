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
 * Best-effort SIM-call recorder.
 *
 * Strategy (first that works wins):
 *   1. VOICE_CALL        — true both-sides (up+down link), native quality, NO
 *                          speakerphone. Allowed on many OEMs (MIUI/Xiaomi,
 *                          Realme, Oppo, Vivo …); throws on locked-down stock.
 *   2. VOICE_RECOGNITION — clean mic capture, no speakerphone.
 *   3. VOICE_COMMUNICATION + speakerphone — mic hears the remote via loudspeaker.
 *   4. MIC + speakerphone — last resort.
 *
 * Android restricts call-audio capture since Android 10, so the remote party
 * may only be captured on permissive devices — every step is wrapped so a
 * failure never disrupts the dial loop.
 */
object SimRecorder {

    private var recorder: MediaRecorder? = null
    private var outputPath: String? = null
    private var audioManager: AudioManager? = null
    private var prevSpeaker = false

    private data class Attempt(val source: Int, val speakerphone: Boolean)

    private val ATTEMPTS = listOf(
        Attempt(MediaRecorder.AudioSource.VOICE_CALL, false),
        Attempt(MediaRecorder.AudioSource.VOICE_RECOGNITION, false),
        Attempt(MediaRecorder.AudioSource.VOICE_COMMUNICATION, true),
        Attempt(MediaRecorder.AudioSource.MIC, true),
    )

    /** Starts recording; returns true if it actually began. */
    fun start(context: Context): Boolean {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        if (recorder != null) return false

        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager = am
        prevSpeaker = am.isSpeakerphoneOn

        val file = File(context.cacheDir, "simrec_${System.currentTimeMillis()}.m4a")
        for ((source, speakerphone) in ATTEMPTS) {
            // Only force the loudspeaker for the mic-based fallbacks; native call
            // sources capture both sides without disturbing the call.
            runCatching { am.isSpeakerphoneOn = speakerphone }
            val ok = runCatching {
                val r = newRecorder(context)
                r.setAudioSource(source)
                r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                r.setAudioEncodingBitRate(96_000)
                r.setAudioSamplingRate(44_100)
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

    @Suppress("DEPRECATION")
    private fun newRecorder(context: Context): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()

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
