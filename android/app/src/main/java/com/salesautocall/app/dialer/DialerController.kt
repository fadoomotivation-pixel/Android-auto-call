package com.salesautocall.app.dialer

import com.salesautocall.app.data.Contact
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Observable progress of the auto-dial run, shared between the service and UI. */
data class DialerUiState(
    val isRunning: Boolean = false,
    val total: Int = 0,
    val completed: Int = 0,
    val currentName: String? = null,
    val currentPhone: String? = null,
    val lastOutcome: String? = null,
    val finished: Boolean = false,
)

/** Tunable behaviour of the dialer. */
data class DialerConfig(
    /** Seconds to wait between the end of one call and the start of the next. */
    val gapSeconds: Int = 5,
    /** Below this talk time, a call is treated as "no answer" rather than "connected". */
    val connectedThresholdSeconds: Int = 8,
    /** Preferred SIM slot (0 or 1) on dual-SIM devices; null = system default. */
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

    private val _state = MutableStateFlow(DialerUiState())
    val state: StateFlow<DialerUiState> = _state.asStateFlow()

    fun prepare(contacts: List<Contact>, config: DialerConfig) {
        queue = contacts
        this.config = config
        _state.value = DialerUiState(total = contacts.size)
    }

    internal fun update(transform: (DialerUiState) -> DialerUiState) {
        _state.value = transform(_state.value)
    }
}
