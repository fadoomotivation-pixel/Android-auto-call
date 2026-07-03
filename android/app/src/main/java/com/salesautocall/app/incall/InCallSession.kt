package com.salesautocall.app.incall

import android.annotation.SuppressLint
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.VideoProfile
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Repository
import com.salesautocall.app.dialer.SimRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/** UI-facing snapshot of the live telecom call. */
data class InCallUiState(
    val phone: String = "",
    val displayName: String? = null,
    /** One of [Call.STATE_DIALING], STATE_RINGING, STATE_ACTIVE, STATE_DISCONNECTED … */
    val callState: Int = Call.STATE_NEW,
    val incoming: Boolean = false,
    /** Epoch millis when the call went active (0 = not yet connected). */
    val connectedAtMillis: Long = 0,
    val muted: Boolean = false,
    val speakerOn: Boolean = false,
    val recording: Boolean = false,
    val dtmfDigits: String = "",
)

/**
 * Marks outgoing calls that [com.salesautocall.app.dialer.AutoDialerService] /
 * [com.salesautocall.app.dialer.ManualCallService] already own (they watch the
 * telephony state, record and log). For those, [InCallSession] only renders the
 * UI — otherwise the same call would be recorded and logged twice.
 */
object ServiceManagedCalls {
    private val expected = ConcurrentHashMap<String, Long>()
    private const val TTL_MS = 90_000L

    fun expect(phone: String) {
        expected[normalizePhone(phone)] = System.currentTimeMillis()
    }

    fun isManaged(phone: String): Boolean {
        val t = expected[normalizePhone(phone)] ?: return false
        return System.currentTimeMillis() - t < TTL_MS
    }

    fun clear(phone: String) {
        expected.remove(normalizePhone(phone))
    }
}

/** Last-10-digit comparison key — tolerant of +91 / spaces / dashes. */
internal fun normalizePhone(p: String) = p.filter { it.isDigit() }.takeLast(10)

/**
 * Bridges the telecom [Call] owned by [CrmInCallService] to the Compose in-call
 * screen, and — for calls no dialer service is already tracking (incoming
 * calls, callbacks from Recent Calls when dialed externally) — records and logs
 * them itself.
 */
object InCallSession {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var service: CrmInCallService? = null
    private var call: Call? = null
    private var callback: Call.Callback? = null

    private var startedAt: Instant = Instant.now()
    private var wentActive = false
    private var serviceManaged = false
    private var recordingStarted = false

    private val _state = MutableStateFlow<InCallUiState?>(null)
    val state: StateFlow<InCallUiState?> = _state.asStateFlow()

    /** Applies [transform] to the live UI state (no-op once the call is gone). */
    private fun update(transform: (InCallUiState) -> InCallUiState) {
        _state.value = _state.value?.let(transform)
    }

    // ---------- lifecycle (driven by CrmInCallService) ----------

    fun bind(svc: CrmInCallService, c: Call) {
        // Single-call model: a second concurrent call replaces the tracked one.
        unbindCallback()
        service = svc
        call = c
        startedAt = Instant.now()
        wentActive = false
        recordingStarted = false

        val phone = c.details?.handle?.schemeSpecificPart ?: ""
        val incoming = isIncoming(c)
        serviceManaged = !incoming && ServiceManagedCalls.isManaged(phone)

        _state.value = InCallUiState(
            phone = phone,
            callState = currentState(c),
            incoming = incoming,
        )

        val cb = object : Call.Callback() {
            override fun onStateChanged(call: Call, newState: Int) = onCallState(newState)
        }
        callback = cb
        c.registerCallback(cb)
        onCallState(currentState(c))
        lookupName(phone)
    }

    /** Best-effort: show the lead's name instead of the bare number. */
    private fun lookupName(phone: String) {
        if (phone.isBlank()) return
        scope.launch {
            val key = normalizePhone(phone)
            val name = runCatching { Repository.fetchLeads() }.getOrNull()
                ?.firstOrNull { !it.name.isNullOrBlank() && normalizePhone(it.phone) == key }
                ?.name
            if (name != null && _state.value?.phone == phone) setDisplayName(name)
        }
    }

    fun unbind(c: Call) {
        if (call !== c) return
        finishCall()
    }

    fun onAudioState(audio: CallAudioState) {
        update {
            it.copy(
                muted = audio.isMuted,
                speakerOn = audio.route == CallAudioState.ROUTE_SPEAKER,
            )
        }
    }

    fun serviceDestroyed(svc: CrmInCallService) {
        if (service === svc) {
            finishCall()
            service = null
        }
    }

    // ---------- user actions (invoked by InCallActivity) ----------

    fun answer() {
        call?.answer(VideoProfile.STATE_AUDIO_ONLY)
    }

    fun reject() {
        call?.reject(false, null)
    }

    fun hangup() {
        call?.disconnect()
    }

    fun toggleMute() {
        val svc = service ?: return
        svc.setMuted(!(_state.value?.muted ?: false))
    }

    fun toggleSpeaker() {
        val svc = service ?: return
        val speakerOn = _state.value?.speakerOn ?: false
        svc.setAudioRoute(if (speakerOn) CallAudioState.ROUTE_WIRED_OR_EARPIECE else CallAudioState.ROUTE_SPEAKER)
    }

    fun playDtmf(digit: Char) {
        val c = call ?: return
        runCatching {
            c.playDtmfTone(digit)
            c.stopDtmfTone()
        }
        update { it.copy(dtmfDigits = it.dtmfDigits + digit) }
    }

    fun setDisplayName(name: String?) = update { it.copy(displayName = name) }

    // ---------- internals ----------

    private fun onCallState(newState: Int) {
        update { it.copy(callState = newState) }
        when (newState) {
            Call.STATE_ACTIVE -> {
                if (!wentActive) {
                    wentActive = true
                    startedAt = Instant.now()
                    update { it.copy(connectedAtMillis = System.currentTimeMillis()) }
                    if (!serviceManaged) startRecording()
                }
            }
            Call.STATE_DISCONNECTED -> finishCall()
        }
    }

    private fun startRecording() {
        val ctx = service?.applicationContext ?: return
        scope.launch {
            val enabled = runCatching { Repository.myCompany()?.recordingEnabled ?: true }.getOrDefault(true)
            if (enabled && call != null && runCatching { SimRecorder.start(ctx) }.getOrDefault(false)) {
                recordingStarted = true
                update { it.copy(recording = true) }
            }
        }
    }

    private fun finishCall() {
        val snapshot = _state.value ?: return
        val ctx = service?.applicationContext
        unbindCallback()
        call = null
        _state.value = null

        val recordingPath = if (recordingStarted) runCatching { SimRecorder.stop() }.getOrNull() else null
        recordingStarted = false

        if (!serviceManaged && ctx != null && snapshot.phone.isNotBlank()) {
            persist(snapshot, recordingPath)
        } else {
            ServiceManagedCalls.clear(snapshot.phone)
        }
    }

    private fun unbindCallback() {
        val c = call
        val cb = callback
        if (c != null && cb != null) runCatching { c.unregisterCallback(cb) }
        callback = null
    }

    /** Logs incoming / externally-dialed calls (outgoing campaign calls are logged by the services). */
    private fun persist(s: InCallUiState, recordingPath: String?) {
        val connected = wentActive
        val callStart = startedAt
        val callEnd = Instant.now()
        val durationSec =
            if (connected) (callEnd.epochSecond - callStart.epochSecond).toInt().coerceAtLeast(0) else 0
        val outcome = when {
            connected -> "connected"
            s.incoming -> "missed"
            else -> "no_answer"
        }
        scope.launch(Dispatchers.IO) {
            runCatching {
                val company = Repository.myCompany()?.id ?: return@runCatching
                val uid = Repository.currentUserId() ?: return@runCatching
                val logId = Repository.logCall(
                    CallLog(
                        companyId = company,
                        salespersonId = uid,
                        phone = s.phone,
                        direction = if (s.incoming) "incoming" else "outgoing",
                        outcome = outcome,
                        startedAt = callStart.toString(),
                        endedAt = callEnd.toString(),
                        durationSeconds = durationSec,
                        recordingStatus = if (recordingPath != null) "uploading" else "none",
                        recordingSource = if (recordingPath != null) "sim" else null,
                    ),
                )
                if (logId != null && recordingPath != null) {
                    val f = File(recordingPath)
                    if (f.exists() && f.length() > 0) {
                        runCatching { Repository.uploadRecording(logId, "sim", durationSec, f.readBytes()) }
                        runCatching { f.delete() }
                    }
                }
            }
        }
    }

    private fun isIncoming(c: Call): Boolean =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            c.details.callDirection == Call.Details.DIRECTION_INCOMING
        } else {
            currentState(c) == Call.STATE_RINGING
        }

    @SuppressLint("NewApi")
    @Suppress("DEPRECATION")
    private fun currentState(c: Call): Int =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) c.details.state else c.state
}
