package com.salesautocall.app.dialer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.telecom.TelecomManager
import androidx.core.app.ActivityCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Snapshot of the live SIM call shown on the in-app call screen. */
data class SimCallUi(
    val phone: String,
    val name: String? = null,
    /** "dialing" | "active" | "ended" */
    val phase: String = "dialing",
    /** Epoch millis when the call went off-hook (0 = not yet). */
    val activeAtMillis: Long = 0,
    /** Our own MediaRecorder is capturing right now. */
    val recording: Boolean = false,
    /** The phone's built-in recorder will capture this call (harvested after). */
    val nativeRec: Boolean = false,
    val speakerOn: Boolean = false,
    val muted: Boolean = false,
    /** Collapsed to a floating chip so the rep can browse the CRM mid-call. */
    val minimized: Boolean = false,
)

/**
 * Bridges ManualCallService / AutoDialerService to the in-app call screen —
 * WITHOUT making the app the phone's default dialer. The system dialer still
 * owns the call; we mirror its state (via the services' telephony listeners)
 * and offer REC / speaker / mute / end-call controls on top.
 */
object SimCallMonitor {

    private val _state = MutableStateFlow<SimCallUi?>(null)
    val state: StateFlow<SimCallUi?> = _state.asStateFlow()

    /** Recording captured via the manual REC toggle; the owning service consumes it. */
    @Volatile
    var manualRecordingPath: String? = null
        private set

    /** Consumes (and clears) the manual REC toggle's capture, if any. */
    fun takeManualRecording(): String? {
        val p = manualRecordingPath
        manualRecordingPath = null
        return p
    }

    private fun update(transform: (SimCallUi) -> SimCallUi) {
        _state.value = _state.value?.let(transform)
    }

    // ---------- lifecycle (driven by the dialer services) ----------

    fun begin(phone: String, name: String?, nativeRec: Boolean) {
        manualRecordingPath = null
        _state.value = SimCallUi(phone = phone, name = name, nativeRec = nativeRec)
    }

    /**
     * Call went off-hook. [recording] = the service auto-started the MediaRecorder;
     * [speakerForced] = that recorder had to switch the loudspeaker on to capture
     * the remote party, so the call screen's Speaker toggle must reflect it (else
     * the rep taps "Speaker" to turn it on, actually turns it OFF, and the
     * customer drops out of the recording).
     */
    fun onActive(recording: Boolean, speakerForced: Boolean = false) = update {
        it.copy(
            phase = "active",
            activeAtMillis = System.currentTimeMillis(),
            recording = it.recording || recording,
            speakerOn = it.speakerOn || speakerForced,
        )
    }

    fun end(context: Context?) {
        _state.value = null
        // Leave the phone how we found it.
        context?.let { ctx ->
            runCatching {
                val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                am.isMicrophoneMute = false
            }
        }
    }

    fun setName(name: String?) {
        if (!name.isNullOrBlank()) update { it.copy(name = name) }
    }

    // ---------- controls (invoked from the in-app call screen) ----------

    fun setMinimized(min: Boolean) = update { it.copy(minimized = min) }

    /** Manual REC toggle. Start = best-effort MediaRecorder; stop stashes the file. */
    fun toggleRecord(context: Context) {
        val s = _state.value ?: return
        if (s.recording) {
            manualRecordingPath = runCatching { SimRecorder.stop() }.getOrNull() ?: manualRecordingPath
            update { it.copy(recording = false) }
        } else {
            val ok = runCatching { SimRecorder.start(context.applicationContext) }.getOrDefault(false)
            if (ok) update { it.copy(recording = true, speakerOn = it.speakerOn || SimRecorder.usedSpeaker) }
        }
    }

    fun toggleSpeaker(context: Context) {
        runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.isSpeakerphoneOn = !am.isSpeakerphoneOn
            update { it.copy(speakerOn = am.isSpeakerphoneOn) }
        }
    }

    fun toggleMute(context: Context) {
        runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.isMicrophoneMute = !am.isMicrophoneMute
            update { it.copy(muted = am.isMicrophoneMute) }
        }
    }

    /** Hangs up via Telecom (needs ANSWER_PHONE_CALLS). Returns false if not allowed. */
    @Suppress("DEPRECATION")
    fun endCall(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        return runCatching {
            val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecom.endCall()
        }.getOrDefault(false)
    }
}
