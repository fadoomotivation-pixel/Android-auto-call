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
 * Best-effort SIM-call recorder that always aims for BOTH sides of the call and
 * — critically — never settles for a source that is silently recording nothing.
 *
 * Strategy (first that PROVES it is capturing audio wins):
 *   1. VOICE_CALL — true both-sides (up+down link), native quality, NO
 *      speakerphone. Allowed on permissive OEMs (MIUI/Xiaomi, Realme, Oppo,
 *      Vivo …). On locked-down stock Android 10+ it does NOT throw — it opens
 *      fine and records pure silence. So after starting it we listen to the
 *      live amplitude for ~1.5s; if the stream is dead we tear it down and move
 *      on instead of shipping a silent file.
 *   2. VOICE_COMMUNICATION + speakerphone — the remote party is heard through
 *      the loudspeaker, so the mic captures both sides. Universal fallback.
 *   3. MIC + speakerphone — last resort, same idea.
 *
 * The silence check is what makes recording actually work everywhere: without
 * it the chain "succeeded" on VOICE_CALL on every phone and the loudspeaker
 * path — the only route that captures the customer on stock Android — was never
 * reached. (The cleanest both-sides route stays the phone's own recorder — see
 * NativeRecordingHarvester — which needs no speakerphone and no silence guard.)
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

    private data class Attempt(
        val source: Int,
        val speakerphone: Boolean,
        /** When true, confirm the stream is live before accepting it. */
        val verify: Boolean,
    )

    private val ATTEMPTS = listOf(
        // Clean both-sides where the OEM allows it — but only if it is really
        // capturing (stock Android opens it and records silence).
        Attempt(MediaRecorder.AudioSource.VOICE_CALL, speakerphone = false, verify = true),
        // Remote via loudspeaker — the mic hears both sides. Works everywhere.
        Attempt(MediaRecorder.AudioSource.VOICE_COMMUNICATION, speakerphone = true, verify = false),
        // Last resort, same idea.
        Attempt(MediaRecorder.AudioSource.MIC, speakerphone = true, verify = false),
    )

    /** Starts recording; returns true if it actually began capturing audio. */
    fun start(context: Context): Boolean {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        if (recorder != null) return false

        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager = am
        prevSpeaker = am.isSpeakerphoneOn

        val file = File(context.cacheDir, "simrec_${System.currentTimeMillis()}.m4a")
        for ((source, speakerphone, verify) in ATTEMPTS) {
            // Only force the loudspeaker for the mic-based fallbacks; the native
            // VOICE_CALL source captures both sides without disturbing the call.
            runCatching { am.isSpeakerphoneOn = speakerphone }
            val r = runCatching {
                newRecorder(context).apply {
                    setAudioSource(source)
                    setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                    setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                    setAudioEncodingBitRate(96_000)
                    setAudioSamplingRate(44_100)
                    setOutputFile(file.absolutePath)
                    prepare()
                    start()
                }
            }.getOrNull()

            if (r == null) continue  // this source refused outright — try the next

            // If the source can be a silent no-op (VOICE_CALL on locked-down
            // phones), make sure the stream is actually alive before we commit
            // to it. A dead stream stays at amplitude 0; a live call — even the
            // ringback tone — pushes the meter well above the noise floor.
            if (verify && !streamIsLive(r)) {
                runCatching { r.stop() }
                runCatching { r.release() }
                continue
            }

            recorder = r
            outputPath = file.absolutePath
            usedSpeaker = speakerphone
            return true
        }
        runCatching { am.isSpeakerphoneOn = prevSpeaker }
        return false
    }

    /**
     * Polls the live max-amplitude for a short window right after start. Returns
     * true as soon as a non-trivial reading appears (the stream is capturing).
     * The very first getMaxAmplitude() call always reads 0 (it is a since-last
     * baseline), so we sample several times.
     */
    private fun streamIsLive(r: MediaRecorder): Boolean {
        val deadline = System.currentTimeMillis() + VERIFY_WINDOW_MS
        while (System.currentTimeMillis() < deadline) {
            val amp = runCatching { r.getMaxAmplitude() }.getOrDefault(0)
            if (amp > SILENCE_FLOOR) return true
            try { Thread.sleep(VERIFY_STEP_MS) } catch (_: InterruptedException) { break }
        }
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

    // Amplitude below this (out of a 32767 max) is treated as a dead stream.
    private const val SILENCE_FLOOR = 150
    private const val VERIFY_WINDOW_MS = 1_500L
    private const val VERIFY_STEP_MS = 120L
}
