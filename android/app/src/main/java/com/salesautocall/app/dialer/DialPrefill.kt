package com.salesautocall.app.dialer

import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Number handed to us via ACTION_DIAL / tel: links (we're a dialer app now).
 * MainActivity publishes it; the Dialer tab consumes it as its prefill.
 */
object DialPrefill {
    val pending = MutableStateFlow<String?>(null)

    fun consume(): String? {
        val v = pending.value
        pending.value = null
        return v
    }
}
