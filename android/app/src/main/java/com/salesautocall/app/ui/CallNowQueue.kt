package com.salesautocall.app.ui

import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadStage
import com.salesautocall.app.data.LeadWork

/**
 * Who to ring, and in what order. One definition for Home, the Leads deck,
 * and Follow-ups. Two copies of this is how those screens disagreed.
 *
 * Membership is `v_lead_workstate.action_state` of `overdue` or `call_now`.
 * That column is `v_lead_action_state`: a buyer who wrote and got no reply, a
 * promise that was not kept, a lead still in New, a number that was not
 * answered, and a diary time that has arrived. A finished lead is `none`, so
 * a leftover follow-up row cannot put them back on the list. A diary time
 * that is still in the future cannot keep a waiting buyer off it.
 *
 * Order is five tiers. Sorting by the diary time put a 43-day "11 AM" the
 * app invented ahead of a buyer who messaged this morning.
 *
 *   0  waiting_since is set        the buyer wrote, nobody answered
 *   1  promise_due_since is set    a promise was not kept
 *   2  best_call_seconds >= 30     someone has actually spoken to them
 *   3  calls_total < 4             rung a few times, never answered
 *   4  otherwise                   rung 4 or more times, never answered
 *
 * Tier 2's 30 must stay equal to the WhatsApp sentinel in migration 0217.
 * That migration raises best_call_seconds to 30 to mean "someone spoke".
 * Move this threshold and leave the sentinel, and a buyer who picked up on
 * WhatsApp falls back into tier 4.
 *
 * Inside tier 2 the warmest comes first (most recent real talk). Everywhere
 * else, oldest due time, then when the lead arrived.
 */
internal fun isCallNowAction(action: String?): Boolean =
    action == "overdue" || action == "call_now"

internal fun callNowTier(work: LeadWork?): Int = when {
    work?.waitingSince != null -> 0
    work?.promiseDueSince != null -> 1
    (work?.bestCallSeconds ?: 0) >= 30 -> 2
    (work?.callsTotal ?: 0) < 4 -> 3
    else -> 4
}

internal fun isoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
        .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
        .getOrNull()
}

internal fun callNowTieKey(work: LeadWork?, createdAt: String?): Long {
    if (callNowTier(work) == 2) return -(isoMillis(work?.lastCallAt) ?: 0L)
    return isoMillis(work?.dueAt) ?: isoMillis(createdAt) ?: Long.MAX_VALUE
}

internal fun callNowContacts(
    leads: List<Contact>,
    workByLead: Map<String, LeadWork>,
): List<Contact> = leads
    .filter { c -> isCallNowAction(c.id?.let { workByLead[it]?.actionState }) }
    .sortedWith(callNowOrder(workByLead))

/** Same order as [callNowContacts], for a list that is already the due set
 *  (the Overdue chip, or the Call now chip, on their own). */
internal fun callNowOrder(workByLead: Map<String, LeadWork>): Comparator<Contact> =
    compareBy(
        { c -> callNowTier(c.id?.let { workByLead[it] }) },
        { c -> callNowTieKey(c.id?.let { workByLead[it] }, c.createdAt) },
    )

/**
 * The stage `contacts_stage_sync` will store for this disposition.
 *
 * Migration 0143, `lead_stage_for`: the seven call outcomes collapse to
 * contacted, and a booking / loss / do-not-call / bad number is terminal.
 * The trigger then refuses to move a lead backwards unless the new stage is
 * terminal. Copying `status` and leaving `stage` put a lost lead back in
 * Interested until the next full reload.
 */
internal fun stageForDisposition(status: String): String? = when (status) {
    "new", "queued" -> "new"
    "called", "no_answer", "busy", "wrong_person", "callback", "follow_up" -> "contacted"
    "interested" -> "interested"
    "site_visit" -> "site_visit"
    "proposal", "negotiation" -> "negotiation"
    "token_paid" -> "token_paid"
    "booked" -> "won"
    "not_interested", "lost" -> "lost"
    "dnc" -> "dnc"
    "invalid" -> "invalid"
    else -> null
}

private val TERMINAL_STAGE_CODES = setOf("won", "lost", "dnc", "invalid")

internal fun isTerminalDisposition(status: String): Boolean =
    stageForDisposition(status) in TERMINAL_STAGE_CODES

internal fun stageAfterDisposition(
    currentStage: String,
    status: String,
    stages: List<LeadStage>,
): String {
    val candidate = stageForDisposition(status) ?: return currentStage
    val cand = stages.firstOrNull { it.code == candidate }
    val cur = stages.firstOrNull { it.code == currentStage }
    if (cand?.isTerminal == true || candidate in TERMINAL_STAGE_CODES) return candidate
    if (cand != null && cur != null) {
        return if (cand.sortOrder >= cur.sortOrder) candidate else currentStage
    }
    // The stage table has not arrived. Only move a lead that is still New.
    // A no-answer must not knock an interested lead backwards on a guess.
    return if (currentStage.isBlank() || currentStage == "new") candidate else currentStage
}
