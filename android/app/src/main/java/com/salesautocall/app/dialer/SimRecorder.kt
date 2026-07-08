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
 * Best-effort SIM-call recorder that always aims for BOTH sides of the call.
 *
 * Strategy (first that works wins):
 *   1. VOICE_CALL — true both-sides (up+down link), native quality, NO
 *      speakerphone. Allowed on permissive OEMs (MIUI/Xiaomi, Realme, Oppo,
 *      Vivo …); throws on locked-down stock Android.
 *   2. VOICE_COMMUNICATION + speakerphone — the remote party is heard through
 *      the loudspeaker, so the mic captures both sides.
 *   3. MIC + speakerphone — last resort, same idea.
 *
 * IMPORTANT: we deliberately do NOT use VOICE_RECOGNITION / plain MIC without
 * the speakerphone. On modern stock Android those "succeed" but capture only
 * the telecaller's side (the downlink is muted from apps since Android 10),
 * which produced silent-remote recordings. If VOICE_CALL is blocked we go
 * straight to the loudspeaker path so the customer is always on the tape.
 * (The cleanest both-sides route stays the phone's own recorder — see
 * NativeRecordingHarvester — which needs no speakerphone.)
 */
object SimRecorder {

    private var recorder: MediaRecorder? = null
    private var outputPath: String? = null
    private var audioManager: AudioManager? = null
    private var prevSpeaker = false

    /** True when the last successful start had to force the loudspeaker on. */
    @Volatile
    var usedSpeaker = false
        private set

    private data class Attempt(val source: Int, val speakerphone: Boolean)

    private val ATTEMPTS = listOf(
        Attempt(MediaRecorder.AudioSource.VOICE_CALL, false),          // clean both-sides where allowed
        Attempt(MediaRecorder.AudioSource.VOICE_COMMUNICATION, true),  // remote via loudspeaker
        Attempt(MediaRecorder.AudioSource.MIC, true),                  // last resort
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
            // Only force the loudspeaker for the mic-based fallbacks; the native
            // VOICE_CALL source captures both sides without disturbing the call.
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
                usedSpeaker = speakerphone
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
