package com.salesautocall.app.dialer

import com.salesautocall.app.data.Contact
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first

/** Observable progress + session statistics, shared between the service and UI. */
data class DialerUiState(
    val isRunning: Boolean = false,
    val paused: Boolean = false,
    val total: Int = 0,
    val completed: Int = 0,
    val currentName: String? = null,
    val currentPhone: String? = null,
    val lastOutcome: String? = null,
    val finished: Boolean = false,
    // last completed contact (for after-call review: disposition / WhatsApp)
    val lastContactId: String? = null,
    val lastContactName: String? = null,
    val lastContactPhone: String? = null,
    // session stats
    val sessionStartMillis: Long = 0,
    val sessionEndMillis: Long = 0,
    val dialedCount: Int = 0,
    val talkSeconds: Int = 0,
)

/** Tunable behaviour of the dialer. */
data class DialerConfig(
    val gapSeconds: Int = 5,
    val connectedThresholdSeconds: Int = 8,
    val simSlot: Int? = null,
    /** When true, the dialer pauses after every call for quick review. */
    val reviewAfterEachCall: Boolean = true,
    /** Best-effort SIM call recording (device-dependent). */
    val recordingEnabled: Boolean = true,
)

/**
 * Holds the pending queue and the live UI state. The Activity fills the queue
 * and starts the service; the service mutates [state] as it works through it.
 */
object DialerController {
    @Volatile
    var queue: List<Contact> = emptyList()
        private set

    @Volatile
    var config: DialerConfig = DialerConfig()

    @Volatile
    var campaignName: String = ""

    @Volatile
    var campaignId: String = ""

    private val _paused = MutableStateFlow(false)
    private val _state = MutableStateFlow(DialerUiState())
    val state: StateFlow<DialerUiState> = _state.asStateFlow()

    fun prepare(contacts: List<Contact>, config: DialerConfig, campaignName: String, campaignId: String) {
        queue = contacts
        this.config = config
        this.campaignName = campaignName
        this.campaignId = campaignId
        _paused.value = false
        _state.value = DialerUiState(total = contacts.size)
    }

    fun pause() {
        _paused.value = true
        update { it.copy(paused = true) }
    }

    fun resume() {
        _paused.value = false
        update { it.copy(paused = false) }
    }

    /** Suspends while paused; returns once resumed. */
    suspend fun awaitResume() {
        _paused.first { !it }
    }

    internal fun update(transform: (DialerUiState) -> DialerUiState) {
        _state.value = transform(_state.value)
    }

    /** Clears the finished session so the UI returns to the create-campaign form. */
    fun reset() {
        queue = emptyList()
        _paused.value = false
        _state.value = DialerUiState()
    }
}
