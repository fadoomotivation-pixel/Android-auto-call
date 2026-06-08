package com.salesautocall.app.dialer

import com.salesautocall.app.data.Contact
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Observable progress + session statistics, shared between the service and UI. */
data class DialerUiState(
    val isRunning: Boolean = false,
    val total: Int = 0,
    val completed: Int = 0,
    val currentName: String? = null,
    val currentPhone: String? = null,
    val lastOutcome: String? = null,
    val finished: Boolean = false,
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

    private val _state = MutableStateFlow(DialerUiState())
    val state: StateFlow<DialerUiState> = _state.asStateFlow()

    fun prepare(contacts: List<Contact>, config: DialerConfig, campaignName: String) {
        queue = contacts
        this.config = config
        this.campaignName = campaignName
        _state.value = DialerUiState(total = contacts.size)
    }

    internal fun update(transform: (DialerUiState) -> DialerUiState) {
        _state.value = transform(_state.value)
    }

    /** Clears the finished session so the UI returns to the create-campaign form. */
    fun reset() {
        queue = emptyList()
        _state.value = DialerUiState()
    }
}
