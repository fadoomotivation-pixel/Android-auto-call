package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadWork
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space

/**
 * Today's funnel for the person making the calls.
 *
 * Six steps, one lead in one step, the furthest deal stage she actually
 * reached today (IST). The bucket is the stage, not the last call outcome:
 * a no-answer does not pull an Interested lead back into Contacted.
 * Token paid today is Booked — that is the step reps reach. New means the
 * lead is still in the New stage. A failed read says so. A zero is only
 * drawn after a read that succeeded — a blank morning and a dead connection
 * are different.
 *
 * Call now is [callNowContacts], the same list Home, Leads, and Follow-ups
 * already share. This card does not invent a second queue.
 */
internal data class TodayFunnel(
    /** False until leads have loaded. The six numbers must not render. */
    val ready: Boolean,
    /** Shown in place of the six numbers. Loading, or the read failed. */
    val message: String?,
    val newCount: Int = 0,
    val contacted: Int = 0,
    val interested: Int = 0,
    val visitAsked: Int = 0,
    val visitDone: Int = 0,
    val booked: Int = 0,
    /**
     * Null when the work-state read failed and there is no earlier copy.
     * The card draws "—". A real empty queue is 0.
     */
    val callNow: Int? = null,
    /**
     * People who promised a visit and still have no day on the lead.
     * Null when the work-state read is unknown. A real zero stays quiet —
     * the sentence only appears when there is someone to book.
     */
    val agreedVisitNoDate: Int? = null,
)

private val IST: java.time.ZoneId = java.time.ZoneId.of("Asia/Kolkata")

private val CONTACTED_STATUSES = setOf(
    "called", "no_answer", "busy", "wrong_person", "callback", "follow_up",
)

/** Deal stages that are already past Contacted. A missed call must not
 *  drop one of these into the Contacted count. */
private val PAST_CONTACTED = setOf(
    "interested", "site_visit", "negotiation", "token_paid", "won", "lost", "dnc", "invalid",
)

private val TERMINAL_STAGES = setOf("won", "lost", "dnc", "invalid")

internal fun isVisitPromise(text: String?): Boolean {
    val p = text?.lowercase() ?: return false
    return "visit" in p || "site" in p
}

/** Same clock as PickWhenDialog's visit chips. Tomorrow 4 PM, device zone. */
internal fun visitTomorrow4pm(now: java.time.ZonedDateTime = java.time.ZonedDateTime.now()): Long =
    now.plusDays(1).withHour(16).withMinute(0).withSecond(0).toInstant().toEpochMilli()

/** Same Sunday math as PickWhenDialog: if today is Sunday, next Sunday. */
internal fun visitSunday11am(now: java.time.ZonedDateTime = java.time.ZonedDateTime.now()): Long {
    val toSunday = ((7 - now.dayOfWeek.value) % 7).let { if (it == 0) 7 else it }
    return now.plusDays(toSunday.toLong()).withHour(11).withMinute(0).withSecond(0).toInstant().toEpochMilli()
}

private fun isTodayIst(iso: String?, today: java.time.LocalDate): Boolean {
    val ms = isoMillis(iso) ?: return false
    return java.time.Instant.ofEpochMilli(ms).atZone(IST).toLocalDate() == today
}

internal fun buildTodayFunnel(
    leads: List<Contact>,
    workByLead: Map<String, LeadWork>,
    leadsFetched: Boolean,
    leadsFetchFailed: Boolean,
    workStatesError: String?,
    now: java.time.Instant = java.time.Instant.now(),
): TodayFunnel {
    val callNowKnown = !(workStatesError != null && workByLead.isEmpty())
    val callNow = if (callNowKnown) callNowContacts(leads, workByLead).size else null
    val agreed = if (!callNowKnown) null else leads.count { c ->
        val work = c.id?.let { workByLead[it] } ?: return@count false
        val text = work.promiseText
        work.promiseDueSince != null &&
            isVisitPromise(text) &&
            c.siteVisitAt.isNullOrBlank() &&
            !isTerminalDisposition(c.status) &&
            c.stage !in TERMINAL_STAGES
    }
    if (!leadsFetched) {
        return TodayFunnel(
            ready = false,
            message = if (leadsFetchFailed) "Could not load today's funnel."
            else "Loading today's funnel",
            callNow = callNow,
            agreedVisitNoDate = agreed,
        )
    }
    val today = now.atZone(IST).toLocalDate()
    var fresh = 0
    var contacted = 0
    var interested = 0
    var visitAsked = 0
    var visitDone = 0
    var booked = 0
    for (c in leads) {
        val handledToday = isTodayIst(c.handledAt, today)
        val contactedToday = isTodayIst(c.lastContactedAt, today)
        val arrivedToday = isTodayIst(c.siteVisitArrivedAt, today)
        val tokenToday = isTodayIst(c.tokenPaidAt, today)
        val assignedToday = isTodayIst(c.assignedAt, today)
        val createdToday = isTodayIst(c.createdAt, today)
        val workedToday = handledToday || contactedToday
        val stage = c.stage
        // Booked is won, or a token paid today. Reps close on token_paid;
        // the six-step card has no separate token column.
        val bookedToday = (c.status == "booked" || stage == "won") &&
            (handledToday || tokenToday || arrivedToday)
        val tokenPaidToday = (c.status == "token_paid" || stage == "token_paid") &&
            (tokenToday || handledToday || arrivedToday)
        when {
            bookedToday || tokenPaidToday -> booked++
            arrivedToday -> visitDone++
            (stage == "site_visit" || c.status == "site_visit") &&
                !c.siteVisitAt.isNullOrBlank() &&
                c.siteVisitArrivedAt == null &&
                workedToday -> visitAsked++
            // Stage wins over today's outcome. no_answer on an interested
            // lead stays Interested. Status is only the fallback when the
            // stage write has not caught up yet.
            (stage == "interested" ||
                (c.status == "interested" && stage !in PAST_CONTACTED)) &&
                workedToday -> interested++
            stage !in PAST_CONTACTED && workedToday &&
                (stage == "contacted" || c.status in CONTACTED_STATUSES) -> contacted++
            // New is the New stage, among leads who arrived or were still
            // there today. It is not "assigned today" under a New label.
            stage == "new" && c.status !in CONTACTED_STATUSES &&
                (assignedToday || createdToday || workedToday) -> fresh++
        }
    }
    return TodayFunnel(
        ready = true,
        message = null,
        newCount = fresh,
        contacted = contacted,
        interested = interested,
        visitAsked = visitAsked,
        visitDone = visitDone,
        booked = booked,
        callNow = callNow,
        agreedVisitNoDate = agreed,
    )
}

/**
 * One visit whose day has passed and nobody has written what happened.
 *
 * Membership is `v_pending_site_visit_outcomes` — the same list Pulse and
 * the admin Action Center already read. [timesAsked] and [needsManager] are
 * counted on the phone from `rep_prompts.kind = visit_check`, because the
 * live view still counts a kind the app cannot insert (migration 0218, not
 * applied). Null means that prompt read failed: the row stays, the number
 * is "—", never a made-up zero.
 */
data class PendingVisit(
    val contactId: String,
    val name: String,
    val phone: String,
    val daysWaiting: Int,
    val timesAsked: Int?,
    val needsManager: Boolean?,
)

data class PendingVisitBoard(
    val rows: List<PendingVisit> = emptyList(),
    /** True after a visit-list read succeeded, including a real empty list. */
    val loaded: Boolean = false,
    /** Set on a failed read. Last good [rows] stay. Never paint this as 0. */
    val error: String? = null,
)

@Composable
internal fun TodayFunnelCard(
    funnel: TodayFunnel,
    onOpenFollowUps: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().clipCard().padding(Space.l),
    ) {
        Text("Today", style = AppType.rowTitle, color = AppColors.TextPrimary)
        Spacer(Modifier.height(10.dp))
        if (!funnel.ready) {
            Text(
                funnel.message ?: "Loading today's funnel",
                style = AppType.meta,
                color = if (funnel.message?.startsWith("Could not") == true) AppColors.Danger
                else AppColors.TextSecondary,
            )
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FunnelStep("New", funnel.newCount, Modifier.weight(1f))
                FunnelStep("Contacted", funnel.contacted, Modifier.weight(1f))
                FunnelStep("Interested", funnel.interested, Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FunnelStep("Visit asked", funnel.visitAsked, Modifier.weight(1f))
                FunnelStep("Visit done", funnel.visitDone, Modifier.weight(1f))
                FunnelStep("Booked", funnel.booked, Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth().clickable { onOpenFollowUps() },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Call now", style = AppType.metaStrong, color = AppColors.TextPrimary, modifier = Modifier.weight(1f))
            Text(
                funnel.callNow?.toString() ?: "—",
                style = AppType.rowTitle,
                color = if (funnel.callNow == null) AppColors.Danger else AppColors.Indigo,
            )
        }
        val owed = funnel.agreedVisitNoDate
        if (owed != null && owed > 0) {
            Spacer(Modifier.height(8.dp))
            Text(
                if (owed == 1) "1 agreed a visit and has no day yet."
                else "$owed agreed a visit and have no day yet.",
                style = AppType.meta,
                color = AppColors.Warning,
            )
        }
    }
}

@Composable
private fun FunnelStep(label: String, count: Int, modifier: Modifier = Modifier) {
    Column(
        modifier.background(AppColors.SurfaceSunken, RoundedCornerShape(10.dp)).padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            count.toString(),
            style = AppType.rowTitle,
            color = AppColors.TextPrimary,
            maxLines = 1,
        )
        Text(
            label,
            style = AppType.meta,
            color = AppColors.TextSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

private fun Modifier.clipCard(): Modifier = this
    .background(AppColors.Surface, Radii.card)

