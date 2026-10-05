package com.salesautocall.app.ui

import com.salesautocall.app.data.FocusPick
import com.salesautocall.app.data.LeadMemory
import com.salesautocall.app.data.LeadWork

/**
 * What the phone is allowed to say from memory the server already stored.
 *
 * lead_memory is one line per lead, rewritten when a new conversation lands.
 * focus-five is a session snapshot of five openers. A promise is already on
 * the work-state row. None of these is a second knowledge store.
 *
 * Labels here are the chrome. The text after the colon is whatever was said
 * (often Hindi or Hinglish) and is shown unchanged.
 */
internal fun isDueNow(work: LeadWork?): Boolean =
    work?.actionState == "overdue" || work?.actionState == "call_now"

/** The thread to pick up. One line. Empty memory is not a line. */
internal fun rowMemoryLine(memory: LeadMemory?): String? {
    val left = memory?.whereWeLeftIt?.trim().orEmpty()
    val wants = memory?.buyerWants?.trim().orEmpty()
    val stopped = memory?.objection?.trim().orEmpty()
    return when {
        left.isNotEmpty() -> "Left at: $left"
        wants.isNotEmpty() -> "They want: $wants"
        stopped.isNotEmpty() && memory?.objectionCode != "none" -> "Stopped by: $stopped"
        else -> null
    }
}

/** The opener focus-five wrote for this lead, if it named them. */
internal fun focusSayLine(picks: List<FocusPick>, contactId: String?): String? {
    if (contactId.isNullOrBlank()) return null
    val opener = picks.firstOrNull { it.contactId == contactId }?.opener?.trim().orEmpty()
    return opener.takeIf { it.isNotEmpty() }?.let { "Say this: $it" }
}

/** Full stored facts for the lead page. The row only has room for one line. */
internal data class StoredCoach(
    val leftAt: String?,
    val theyWant: String?,
    val stoppedBy: String?,
    val stillOwe: String?,
    val sayThis: String?,
) {
    fun isEmpty(): Boolean =
        leftAt == null && theyWant == null && stoppedBy == null && stillOwe == null && sayThis == null
}

internal fun storedCoach(
    memory: LeadMemory?,
    work: LeadWork?,
    picks: List<FocusPick>,
    contactId: String?,
): StoredCoach {
    val left = memory?.whereWeLeftIt?.trim()?.takeIf { it.isNotEmpty() }
    val wants = memory?.buyerWants?.trim()?.takeIf { it.isNotEmpty() }
    val stopped = memory?.objection?.trim()?.takeIf { it.isNotEmpty() && memory.objectionCode != "none" }
    val owe = work?.promiseText?.trim()?.takeIf { work.promiseDueSince != null && it.isNotEmpty() }
    val say = focusSayLine(picks, contactId)?.removePrefix("Say this: ")?.trim()?.takeIf { it.isNotEmpty() }
    return StoredCoach(left, wants, stopped, owe, say)
}
