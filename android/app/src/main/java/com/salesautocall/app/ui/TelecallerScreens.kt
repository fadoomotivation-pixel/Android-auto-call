package com.salesautocall.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.People
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Star
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.data.LeadStage
import com.salesautocall.app.data.LeadWork
import com.salesautocall.app.data.Teammate
import com.salesautocall.app.data.WhatsAppMessage
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import com.salesautocall.app.data.LeaderboardRow
import kotlin.math.abs
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AiChip
import com.salesautocall.app.ui.design.AiPanel
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.AppSearchField
import com.salesautocall.app.ui.design.InitialsAvatar
import com.salesautocall.app.ui.design.StatusTag
import com.salesautocall.app.ui.design.StatusTone
import com.salesautocall.app.ui.design.*

// ════════════════════════════════════════════════════════════
//  Design system — colours, helpers, atoms
// ════════════════════════════════════════════════════════════

// Paper & ink discipline: ONE palette, anchored on jade. Neutrals are warm
// (green-tinted, never blue-cold); the pipeline reads as a single story —
// slate (unknown) → sea (talking) → amber (interest heating) → plum (visit)
// → bronze (money forming) → jade (money). Every hue sits in the same muted
// saturation band, so nothing shouts and nothing looks odd next to anything.
// This file's own semantic palette, now read from the design system instead of
// eight private hex literals. The names stay so the ~200 usages below are
// untouched; only the values move. Green was 0xFF4353B8 — the OLD indigo — so
// "success" on this screen was rendering in the previous theme's primary while
// the rest of the app had moved on.
private val Green = AppColors.Positive   // success
private val Amber = AppColors.Warning    // attention / "warm"
private val Red = AppColors.Danger       // urgency / "hot" / overdue
private val Purple = AppColors.Violet    // site visit
private val Cyan = AppColors.Teal        // conversation flowing
private val Indigo = AppColors.Info      // working / in progress
private val Slate = AppColors.Slate      // neutral / cold
private val Bronze = AppColors.Warning   // negotiation, value
private val WaGreen = Color(0xFF25D366) // WhatsApp brand — kept recognisable

/**
 * A chip on the "What to do now" row.
 *
 * Mirrors v_lead_action_state one-for-one. The database decides which state a
 * lead is in; this only decides how to say it and what colour to use. `none`
 * (a finished lead) has no chip — there is nothing to do.
 */
private data class ActionChip(val code: String, val label: String, val color: Color, val hint: String)

/**
 * A lead's derived action state, or null if it has none yet.
 *
 * Contact.id is nullable (a row not yet round-tripped through the server), so
 * this cannot be a bare map lookup.
 */
private fun AppState.actionOf(c: Contact): String? = c.id?.let { workByLead[it]?.actionState }

/**
 * When the lead arrived, to the minute: "Today 9:12 am" · "Yest 4:30 pm" ·
 * "3 Aug 11:05 am".
 *
 * The day word alone was useless on a busy morning — thirty leads all said
 * "Today". The clock is what lets a rep say "the one that came in just before
 * lunch" and find it.
 */
private fun arrivedLabel(iso: String): String {
    val ms = instantMillis(iso) ?: return ""
    val d = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
    val today = java.time.LocalDate.now()
    val day = when (d.toLocalDate()) {
        today -> "Today"
        today.minusDays(1) -> "Yest"
        else -> "${d.dayOfMonth} ${d.month.name.take(3).lowercase().replaceFirstChar { it.uppercase() }}"
    }
    return "$day ${timeOnly(iso)}"
}

/** A past instant as "just now" / "12m ago" / "3h ago" / "2d ago".
 *  relativeDue() renders the past as "Overdue 2h 30m", which is the right words
 *  for a missed callback and the wrong ones for "when did we last speak". */
private fun agoLabel(iso: String): String {
    val ms = instantMillis(iso) ?: return ""
    val min = (System.currentTimeMillis() - ms) / 60_000
    return when {
        min < 1 -> "just now"
        min < 60 -> "${min}m ago"
        min < 1440 -> "${min / 60}h ago"
        else -> "${min / 1440}d ago"
    }
}

/** Seconds → "8s" · "4m 12s" · "1h 2m". CallsScreen has its own, but it is
 *  file-private and renders a ring-out as "0m 08s", which reads like a bug. */
private fun callLen(sec: Int): String {
    if (sec < 60) return "${sec}s"
    val m = sec / 60
    if (m < 60) return "${m}m ${sec % 60}s"
    return "${m / 60}h ${m % 60}m"
}

/**
 * The last real call, as one line a rep can act on.
 *
 * Under 30 seconds is not a conversation — it is a ring-out, a voicemail or a
 * misdial, and calling it "called" is how a lead gets left alone for a week on
 * the strength of a call nobody had. The two are coloured differently on
 * purpose: green means someone spoke, amber means nobody did.
 */
private fun lastCallLine(work: LeadWork?): Pair<String, Color>? {
    val at = work?.lastCallAt ?: return null
    val secs = work.lastCallSeconds
    val ago = agoLabel(at)
    val many = if (work.callsTotal > 1) " · ${work.callsTotal} calls" else ""
    return if (secs >= 30) {
        // Quiet grey: success needs no colour on a list. Only "No talk" is tinted.
        "Talked ${callLen(secs)} · $ago$many" to AppColors.TextSecondary
    } else {
        "No talk (${callLen(secs)}) · $ago$many" to Amber
    }
}

/** This lead's row from v_lead_workstate — action state plus the last real call. */
private fun AppState.workOf(c: Contact): LeadWork? = c.id?.let { workByLead[it] }

/** Today's focus line for this lead, if focus-five named them. Blank is not a reason. */
private fun AppState.focusReason(contactId: String?): String? =
    contactId?.let { id -> coachPicks.firstOrNull { it.contactId == id }?.reason }?.trim()?.takeIf { it.isNotEmpty() }

/**
 * Why a due row is due, from fields the server already computed.
 *
 * Order matches [callNowTier]: a buyer waiting, then a promise not kept,
 * then today's focus line, then a number rung four times that has never
 * been answered. Null when none of those is true — the diary note still
 * speaks. Never a count, never a reason we invented.
 */
internal fun dueSignal(work: LeadWork?, focusReason: String?): String? {
    val waiting = work?.waitingSince
    if (waiting != null) return "They wrote ${agoLabel(waiting)} — no reply yet"
    val owedSince = work?.promiseDueSince
    val owedWhat = work?.promiseText
    if (owedSince != null && !owedWhat.isNullOrBlank()) {
        return "You said: $owedWhat · ${agoLabel(owedSince)}"
    }
    if (!focusReason.isNullOrBlank()) return focusReason
    val calls = work?.callsTotal ?: 0
    if ((work?.bestCallSeconds ?: 1) == 0 && calls >= 4) {
        return "Rung $calls times — never picked up"
    }
    return null
}

/** A buyer is waiting, or she still owes what she said on a call. */
private fun owesMessage(work: LeadWork?): Boolean =
    work?.waitingSince != null || (work?.promiseDueSince != null && !work.promiseText.isNullOrBlank())

private fun openRowWhatsApp(
    context: android.content.Context,
    vm: MainViewModel,
    contactId: String?,
    phone: String,
    work: LeadWork?,
    template: String?,
) {
    if (contactId != null && owesMessage(work)) vm.sendOwedWhatsApp(contactId, phone)
    else openWhatsApp(context, phone, template)
}

/**
 * Call now sits FIRST and is what the screen opens on. A telecaller's job is
 * calling; the row they land in should already be the one they work from.
 * Overdue follows it in red — late work still shouts, it just does not have to
 * be first to do that.
 *
 * Labels are short on purpose. "Visit coming" and "No next step" were the two
 * that pushed the row off the edge of a phone.
 */
private val ACTIONS = listOf(
    ActionChip("call_now", "Call now", AppColors.Warning,
        "Everyone to ring now. Late callbacks, brand-new leads, and numbers nobody picked up. One list."),
    ActionChip("overdue", "Overdue", AppColors.Danger,
        "Already inside Call now. Only the ones whose booked time has passed."),
    ActionChip("due_today", "Due today", AppColors.Teal,
        "Booked for later today. They come to Call now on their own, at their time."),
    ActionChip("scheduled", "Later", AppColors.Indigo,
        "Booked for another day. Nothing to do now."),
    ActionChip("awaiting_visit", "Visit", AppColors.Violet,
        "Site visit is booked. Waiting for them to come."),
    ActionChip("no_next_step", "No step", AppColors.Slate,
        "You talked to them but nothing is booked. These go cold if you leave them."),
)

/**
 * One filter row: a single scrolling line of chips. Nothing else.
 *
 * The row used to carry a 56dp label column ("What to do now" / "Where the
 * deal is"). It cost width twice over — the words themselves, and then the
 * first chip was pushed off the left edge, so the most important control on
 * the screen rendered as a stray "5" where "Call now 95" should have been.
 *
 * The chips say what they are. Call now / Overdue / Due today cannot be
 * mistaken for New / Contacted / Interested, and the line under the rows still
 * explains whichever one is selected — so nothing is left to guess.
 */
@Composable
private fun CompactFilterRow(chips: @Composable () -> Unit) {
    Box {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            chips()
            Spacer(Modifier.width(14.dp))
        }
        Box(
            Modifier.align(Alignment.CenterEnd).width(20.dp).height(40.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, MaterialTheme.colorScheme.background),
                    ),
                ),
        )
    }
}

// The two row tints are gone with the blocks they filled. The rows are told
// apart by their labels and by their chips' own colours now, which is all the
// distinction they ever needed and costs no height.

/**
 * One plain line per stage. Only the sentences live here — the label, colour
 * and order all come from lead_stages, so a stage added tomorrow still shows
 * up, just without a bespoke sentence until someone writes one.
 */
private val STAGE_HINTS = mapOf(
    "new" to "Nobody has called them yet.",
    "contacted" to "You have called them. Nothing decided yet.",
    "interested" to "They want to know more. Next step is a site visit.",
    "site_visit" to "Site visit booked or done.",
    "negotiation" to "Talking about price.",
    "token_paid" to "Token money taken. Booking is still not done.",
    "won" to "Booking done.",
    "lost" to "They said no, or the deal is dead.",
    "dnc" to "They asked us not to call. Do not call.",
)

/** "#RRGGBB" from lead_stages -> Compose Color. The stage table owns the
 *  palette so the phone and the dashboard cannot drift to different greens. */
private fun parseHex(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrElse { AppColors.Slate }


/**
 * A clock the screen can trust.
 *
 * Every "is this callback due yet" test read System.currentTimeMillis() once,
 * at composition, and Compose had no reason to run that code again. So a 3 PM
 * callback stayed sitting in "Booked for later" while the rep watched the
 * screen at 3:05 — it only moved when something else forced a recompose, or
 * when the rep left the screen and came back. That is the "follow-up late
 * process ho raha hai" report: the callback was on time, the clock on the
 * screen was not.
 *
 * One tick a minute is enough — callbacks are booked to the minute, never to
 * the second — and it costs one recomposition of the list.
 */
@Composable
private fun rememberNowTick(periodMs: Long = 60_000L): Long {
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(periodMs) {
        while (true) {
            kotlinx.coroutines.delay(periodMs)
            now = System.currentTimeMillis()
        }
    }
    return now
}

private val Teal = AppColors.Violet     // token money (named Teal historically)

// The seven-stage STAGES list and stageOf() that used to live here are gone.
// They were this file's private funnel, disagreeing with the eight tab buckets
// forty lines down AND with the dashboard's nine chips. The vocabulary now
// arrives from lead_stages (AppState.leadStages) and is only rendered here.

/** Stages a rep can move a lead into, from the action sheet. */
private val SETTABLE_STAGES = listOf(
    "interested" to "Interested",
    "site_visit" to "Site Visit",
    "negotiation" to "Negotiation",
    "token_paid" to "Token Paid 💰",
    "booked" to "Booked / Won",
    "callback" to "Callback",
    "not_interested" to "Not interested",
    "lost" to "Lost",
    "dnc" to "Do Not Call",
)

private val TEMPERATURES = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

/** The deck's four counters, computed together and cached as one value. */
private data class DeckStats(
    val dueNow: Int,
    val hotCount: Int,
    val reviveCount: Int,
    val pipelineValue: Double,
)

/** Everything Home counts off the lead list, computed once per load. */
private data class HomeStats(
    val newLeads: Int,
    val stageCounts: List<Pair<LeadStage, Int>>,
    val pipelineValue: Double,
    val tokenCollected: Double,
    val hotUncontacted: Int,
    val unprotected: List<Contact>,
)

// Status sets that live INSIDE per-lead filters.
//
// Written inline, `it.status !in setOf("lost", "not_interested", "dnc")` builds
// a brand-new set for every lead it tests — on a 900-lead list that is hundreds
// of throwaway sets per pass, and Home and the deck run several such passes each
// time they recompose. It is invisible on a fast phone and it is exactly the
// kind of work that makes an older one feel like it is dragging. Hoisted here,
// they are allocated once for the life of the process.
private val DEAD_STATUSES = setOf("lost", "not_interested", "dnc")
/**
 * A lead nobody should be chasing: finished, either way.
 *
 * This was a status list and disagreed with the four other "closed" lists in
 * the codebase — notably it excluded `invalid`, so a bad number kept showing up
 * as live work. It is now the STAGE question `is_terminal`, asked of the same
 * table the dashboard asks. Kept as a helper on the stage code rather than a
 * set, so there is nothing to fall out of date.
 */
private fun isFinished(stages: List<LeadStage>, stage: String): Boolean =
    stages.firstOrNull { it.code == stage }?.isTerminal ?: false
private val SAID_NO = setOf("lost", "not_interested")
private val BOOKED_OR_DNC = setOf("booked", "dnc")
/** Never dialled — the same meaning as the New tab. */
// UNCALLED was setOf("new","queued") — the New stage, spelled out. It is now
// just `stage == "new"`, which is the same question asked of the canonical
// column instead of guessed from the disposition.
private val NEEDS_REMINDER = setOf("interested", "callback")
/** Stages a lead only reaches AFTER a site visit really happened. */
private val AFTER_VISIT = setOf("negotiation", "proposal", "token_paid")

private fun leadScore(c: Contact): Int {
    val base = when (c.status) {
        "booked" -> 100
        "proposal" -> 92
        "site_visit" -> 85
        "interested" -> 72
        "callback", "follow_up" -> 60
        "called", "no_answer", "busy", "wrong_person" -> 48
        "not_interested", "lost", "dnc" -> 8
        else -> 32
    }
    val adj = when (c.temperature) { "hot" -> 12; "warm" -> 4; "cold" -> -8; else -> 0 }
    return (base + adj).coerceIn(0, 100)
}

private fun fmtSec(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return when {
        h > 0 -> "${h}h ${m}m"
        m > 0 -> "${m}m ${s}s"
        else -> "${s}s"
    }
}

/**
 * Milliseconds from an ISO timestamp — the single most-called helper in the
 * list. Every card asks it for a follow-up due time and a site-visit date, the
 * deck asks it for every follow-up, and the sorts ask it once per comparison.
 *
 * It used to try Instant.parse ONLY, which wants a "Z". Postgres sends
 * "+00:00", and isToday() right below already documents that and parses
 * OffsetDateTime first for exactly this reason. So on the format the API
 * actually returns, this took the failure path: runCatching means every single
 * one of those calls THREW and caught a DateTimeParseException, and filling in
 * a stack trace is one of the most expensive things you can do per frame — on a
 * long list, thousands of times a scroll.
 *
 * Same order as isToday now, so the common format is a clean parse with no
 * exception at all, and the two helpers can never disagree about a timestamp.
 */
private fun instantMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
        .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
        .getOrNull()
}

/** True if an ISO timestamp falls on today's local date (for the "Added today"
 *  filter). Handles both "…Z" and Postgres "…+00:00" offsets. */
private fun isToday(iso: String?): Boolean {
    if (iso.isNullOrBlank()) return false
    val date = runCatching { java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDate() }
        .recoverCatching { java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }
        .getOrNull() ?: return false
    return date == java.time.LocalDate.now()
}

private fun timeOnly(iso: String?): String {
    val ms = instantMillis(iso) ?: return "—"
    return java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(ms), java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))
}

private fun dayLabel(iso: String?): String {
    val ms = instantMillis(iso) ?: return ""
    val d = java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(ms), java.time.ZoneId.systemDefault()).toLocalDate()
    val today = java.time.LocalDate.now()
    return when (d) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        today.plusDays(1) -> "Tomorrow"
        else -> d.format(java.time.format.DateTimeFormatter.ofPattern("d MMM"))
    }
}

private fun relativeDue(iso: String): String {
    val due = instantMillis(iso) ?: return "—"
    val diff = due - System.currentTimeMillis()
    val absMin = abs(diff) / 60_000
    val txt = when {
        absMin < 1 -> "now"
        absMin < 60 -> "${absMin}m"
        absMin < 1440 -> "${absMin / 60}h ${absMin % 60}m"
        else -> "${absMin / 1440}d"
    }
    return if (diff <= 0) (if (absMin < 1) "Due now" else "Overdue $txt") else "in $txt"
}

// The round, name-coloured Avatar and its hash palette are gone with the last
// screen that used one. Every card now draws the same 40dp squared initials
// block in one neutral ink — see initialsOf(). Two avatar styles across two
// lists of the same leads was a difference that carried no information.

private fun openWhatsApp(context: android.content.Context, phone: String, message: String? = null) {
    com.salesautocall.app.data.WhatsAppLauncher.open(context, phone, message)
}

/** A ready-to-send opener so the rep doesn't retype the same intro 100x/day.
 *  Simple Indian English — the plain, polite register a property advisor
 *  actually writes on WhatsApp. [speaksAs] is kept on the signature so every
 *  call site is unchanged; English does not inflect the first person, so the
 *  gendered Hindi conjugation this used to need is gone. */
private fun waTemplate(name: String?, project: String?, agent: String?, company: String?, speaksAs: String? = null): String {
    val hi = name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji," } ?: "Namaste,"
    val who = agent?.trim()?.ifBlank { null } ?: "your property advisor"
    val co = company?.trim()?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    val ref = project?.trim()?.takeIf { it.isNotBlank() }?.let { " You had enquired about $it." }
        ?: " This is regarding your property enquiry."
    return "$hi I am $who$co.$ref " +
        "I would like to share the details and our best offer — can we talk now?"
}

/**
 * A number, and what it counts. Nothing else.
 *
 * Was an elevated Card with an emoji sticker on top of the value. Six of them
 * stacked three rows deep gave Home a wall of 📞⏱️✨💰🧾🏆 competing with the
 * figures underneath, and the glyphs carried no information the label did not
 * already give in words. The tile is now a hairlined surface with the value
 * first in the metric style and the label beneath, which is what makes a row
 * of them scan as one set of numbers instead of six separate cards.
 *
 * The value takes the accent; the label stays muted. Signature unchanged so
 * every call site is untouched — the emoji argument is deliberately ignored.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
private fun StatTile(emoji: String, value: String, label: String, accent: Color, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(Radii.card)
            .background(AppColors.Surface)

            .padding(horizontal = Space.l, vertical = Space.m),
    ) {
        Text(value, style = AppType.metric, color = accent, maxLines = 1)
        Spacer(Modifier.height(Space.xxs))
        Text(label, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1)
    }
}

/**
 * Group heading. Small, uppercase, tertiary ink — the same one the whole app
 * uses now, so a section on Home looks like a section on Lead detail.
 *
 * It was bold titleMedium, which at 16sp semibold competed with the lead names
 * and metric values underneath it: the label announcing a group was heavier
 * than the content inside it.
 */
@Composable
private fun SectionHeader(title: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(title.uppercase(), style = AppType.sectionLabel, color = AppColors.TextTertiary)
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel, style = AppType.label, color = AppColors.Indigo,
                modifier = Modifier.clip(Radii.tag).clickable { onAction() }
                    .padding(horizontal = Space.s, vertical = Space.xxs),
            )
        }
    }
}

@Composable
private fun Pill(text: String, fg: Color, bg: Color) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 9.dp, vertical = 3.dp)) {
        Text(text, color = fg, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FilterTab(
    label: String,
    count: Int,
    selected: Boolean,
    accent: Color,
    /** When the count is unknown. "0" would read as a quiet list. */
    countLabel: String? = null,
    onClick: () -> Unit,
) {
    // EVERY chip is the same height and carries its count in the same place, at
    // the same size. Chips that grew and shrank with their label — and lost the
    // badge entirely at zero — made a tidy row look ragged, which is most of
    // why this screen read as unfinished.
    //
    // An empty chip is shown but not offered: faded, grey badge, no ripple, not
    // clickable. Hiding it would make the row jump around as counts change
    // during the day; leaving it live invites a tap that does nothing.
    // A CONTROL, NOT A DASHBOARD TILE.
    //
    // These were 34dp fully-rounded pills with 13dp padding and a badge in a
    // capsule of its own — five of them filled a phone's width. A filter is
    // something a rep hits on the way to a call, so it is now 28dp, softly
    // squared rather than pill-shaped, and the count rides as plain text
    // instead of a second bubble.
    // A dash is not zero. Zero fades the chip; an unknown count stays tappable
    // and must not look like a quiet empty list.
    val empty = countLabel == null && count == 0 && !selected
    // The app's one chip (design/IosKit). A dash is not zero: an unknown count
    // stays tappable and never reads as a quiet empty list.
    IosChip(label = label, count = countLabel ?: "$count", selected = selected, empty = empty, accent = accent, onClick = onClick)
}

@Composable
private fun ActionButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(12.dp))
            .background(tint.copy(alpha = 0.12f))
            .clickable { onClick() }
            .padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(19.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = tint, fontWeight = FontWeight.SemiBold)
    }
}

/** A quiet, neutral icon button — secondary action, no fill colour competing for attention. */
@Composable
private fun GhostIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, contentDescription: String, size: Int = 42, onClick: () -> Unit) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size((size * 0.45).dp))
    }
}

// ageLabel is gone: the card now shows the exact arrival clock (arrivedLabel)
// rather than the day word, because thirty leads all saying "Today" told a rep
// nothing about which one they were looking at.


/** "Rahul Sharma" → "RS", "Priya" → "PR", no name → "#". For lead avatars. */
private fun initialsOf(name: String?): String {
    val parts = name?.trim()?.split(Regex("\\s+"))?.filter { it.isNotBlank() } ?: emptyList()
    return when {
        parts.size >= 2 -> "${parts[0].first().uppercaseChar()}${parts[1].first().uppercaseChar()}"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> "#"
    }
}

/** Group an Indian 10-digit number as "98765 43210" for easy reading; otherwise return as-is. */
/** The last four digits — how a person actually tells two same-named leads
 *  apart, out loud and on paper. Falls back to whatever the number is when it
 *  is too short to have four. */
private fun last4(raw: String): String {
    val d = raw.filter { it.isDigit() }
    return if (d.length >= 4) d.takeLast(4) else d.ifBlank { "?" }
}

private fun prettyPhone(raw: String): String {
    val d = raw.filter { it.isDigit() }
    return when {
        d.length == 10 -> "${d.substring(0, 5)} ${d.substring(5)}"
        d.length == 12 && d.startsWith("91") -> "+91 ${d.substring(2, 7)} ${d.substring(7)}"
        else -> raw
    }
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
// ── premium dashboard helpers ──
/**
 * The buyer's own form answer, in the English a telecaller reads.
 *
 * The Facebook lead forms are written in Hindi, so 1,546 leads in this database
 * carry a budget like "₹3_–_5_लाख" or "₹12_लाख_से_ऊपर" and that is what the
 * lead card printed. Devanagari on an otherwise English screen is the one place
 * left where the app made a rep switch scripts mid-glance.
 *
 * "Lakh" and "Crore" are Indian English, not a translation — they are the words
 * a telecaller says out loud. This is a closed vocabulary of money units and
 * comparators, checked against every distinct value in the table; it is not a
 * general translator and must not grow into one.
 *
 * NAMES ARE NEVER PUT THROUGH THIS. A customer wrote "श्याम लाडला" and that is
 * their name, not a string to be processed. The only callers are the budget
 * label and the form-answer chips, and leadAnswers drops every name field
 * before it gets here.
 */
private val HINDI_UNITS: List<Pair<Regex, String>> = listOf(
    // Longest first: "से ऊपर" has to go before anything inside it.
    Regex("अभी\\s*जानकारी\\s*चाहिए") to "Wants details now",
    Regex("से\\s*(ऊपर|अधिक|ज़्यादा|ज्यादा)") to "+",
    Regex("करोड़?") to "Crore",
    Regex("लाख") to "Lakh",
    Regex("ह(ज़|ज)ार") to "Thousand",
    // No \b here on purpose. Java's \b is ASCII-only unless the pattern asks
    // for UNICODE_CHARACTER_CLASS, so "\\bतक\\b" matches nothing at all on a
    // phone — it only looks right when tested in a regex engine whose \b is
    // Unicode-aware. Anchored to the end instead, which is where it appears.
    Regex("\\s*तक\\s*$") to " or less",
    Regex("^ह(ाँ|ां)$") to "Yes",
    Regex("^नहीं$") to "No",
)

internal fun indianEnglish(s: String): String {
    // Nothing Devanagari in it — hand back the exact string, untouched.
    if (s.none { it in 'ऀ'..'ॿ' }) return s
    var t = s
    for ((hindi, english) in HINDI_UNITS) t = t.replace(hindi, english)
    // "12 Lakh +" is not how anyone writes it.
    return t.replace(Regex("\\s+\\+"), "+").replace(Regex("\\s+"), " ").trim()
}

private fun parseBudgetRupees(s: String?): Double {
    if (s.isNullOrBlank()) return 0.0
    // Normalised FIRST so the units are readable. "₹1 करोड़" used to fall past
    // every unit test below and land on the "<1000 means lakhs" fallback — one
    // crore counted into the pipeline total as one lakh, a hundredfold miss.
    // The lakh values only ever came out right by accident, through that same
    // fallback; now they match on the word.
    val t = indianEnglish(s).lowercase().replace(",", "").trim()
    val num = Regex("[0-9]+(\\.[0-9]+)?").find(t)?.value?.toDoubleOrNull() ?: return 0.0
    return when {
        "cr" in t || "crore" in t -> num * 10_000_000
        "lakh" in t || "lac" in t || Regex("[0-9]\\s*l\\b").containsMatchIn(t) || t.endsWith("l") -> num * 100_000
        t.endsWith("k") -> num * 1_000
        // No unit on a small number ("12", "50") almost always means lakhs in
        // real estate — treat <1000 as lakhs so the pipeline ₹ isn't ~₹12.
        num < 1000 -> num * 100_000
        else -> num
    }
}

private fun formatRupees(v: Double): String = when {
    v >= 10_000_000 -> "₹%.2f Cr".format(v / 10_000_000)
    v >= 100_000 -> "₹%.1f L".format(v / 100_000)
    v >= 1_000 -> "₹%.0f K".format(v / 1_000)
    v <= 0 -> "₹0"
    else -> "₹%.0f".format(v)
}

/** Tidy a raw, human-entered budget for display: drop any leading ₹ (the row
 *  prints its own), turn underscores into spaces, collapse whitespace and put
 *  the units into Indian English, so an imported "₹5–10_लाख" reads as a clean
 *  "5–10 Lakh". Ranges stay intact. Null/blank in → null out. */
internal fun budgetLabel(s: String?): String? =
    s?.replace('_', ' ')?.replace(Regex("\\s+"), " ")?.trim()
        ?.trimStart('₹', ' ')?.trim()
        ?.let { indianEnglish(it) }?.takeIf { it.isNotBlank() }

/**
 * "GaneshChauhan" → "Ganesh Chauhan".
 *
 * Facebook hands back whatever the customer typed into one box, and on a phone
 * keyboard that is regularly two names run together. Split only where a
 * lowercase letter meets an uppercase one, which leaves "AJAY MEHAK",
 * "phoolmati" and "Dr R K Gupta" exactly as they are. Display only — the
 * customer's own spelling is never rewritten in the database.
 */
internal fun prettyName(s: String?): String? =
    s?.trim()?.takeIf { it.isNotBlank() }
        ?.replace(Regex("(?<=\\p{Ll})(?=\\p{Lu})"), " ")

/**
 * WHAT THE CUSTOMER TOLD US WHEN THEY FILLED THE FORM.
 *
 * Every answer is already in extra.raw_fields — the CRM has been storing the
 * whole lead form since facebook-poll was written, and the phone showed one
 * field of it. On the "dholera vishesh" form that meant a rep saw "₹15–25l" and
 * never saw "industrial" or "just information", which is the difference between
 * a site visit this month and a brochure.
 *
 * Read generically, never by field name. Forms are created by whoever runs the
 * ads; a hardcoded `purpose` would show nothing the day somebody adds a
 * question, and every company here already asks a different set.
 *
 * Skipped: the name and phone (they are the card's headline), and whatever
 * answer already appears as the budget — compared on the cleaned VALUE rather
 * than the key, because the same question is asked in Hindi by one company and
 * English by another.
 */
internal fun leadAnswers(c: Contact): List<Pair<String?, String>> {
    val raw = (c.extra?.get("raw_fields") as? JsonObject) ?: return emptyList()
    val budget = budgetLabel(c.budget)?.lowercase()
    val out = mutableListOf<Pair<String?, String>>()
    for ((key, v) in raw) {
        val k = key.lowercase()
        if (k.contains("name") || k.contains("phone") || k.contains("email")) continue
        // Same Indian-English pass the budget gets, and it has to be the same
        // one: the duplicate check below compares this against budgetLabel, so
        // if only one side were normalised the budget would print twice — once
        // as the money line and again as a chip.
        val value = (v as? JsonPrimitive)?.contentOrNull
            ?.replace('_', ' ')?.replace(Regex("\\s+"), " ")?.trim()
            ?.let { indianEnglish(it) }
            ?.takeIf { it.isNotBlank() } ?: continue
        if (budget != null && value.trimStart('₹', ' ').trim().lowercase() == budget) continue
        // An ASCII key is a usable label ("site_visit?" → "Site visit"). A
        // question written in Hindi is a whole sentence and would swamp a chip,
        // so those show the answer alone — "₹3 – 5 लाख" says what it is.
        val ascii = key.all { it.code < 128 }
        val label = if (!ascii) null else key.trimEnd('?', ' ').replace('_', ' ').trim()
            .replaceFirstChar { it.uppercase() }.takeIf { it.isNotBlank() }
        // Both branches must be String — `it.uppercase()` is a String and a bare
        // `it` is a Char, and that mix resolves to neither replaceFirstChar
        // overload.
        out += label to value.replaceFirstChar { if (it.isLowerCase()) it.uppercase() else it.toString() }
    }
    return out
}

/** 0-100 composite of calls-vs-goal and connect rate for the Today gauge. */
private fun perfScore(app: AppState): Int {
    val callPart = if (app.dailyGoal > 0) (app.todayCalls.toFloat() / app.dailyGoal).coerceIn(0f, 1f) else 0f
    val connPart = if (app.todayCalls > 0) (app.todayConnected.toFloat() / app.todayCalls).coerceIn(0f, 1f) else 0f
    return ((callPart * 0.6f + connPart * 0.4f) * 100).toInt()
}

@Composable
private fun ScoreGauge(score: Int, modifier: Modifier = Modifier) {
    val color = when { score >= 75 -> Green; score >= 50 -> Amber; else -> Red }
    val track = MaterialTheme.colorScheme.surfaceVariant
    Box(modifier.size(104.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(104.dp)) {
            val stroke = 11.dp.toPx()
            drawArc(color = track, startAngle = 135f, sweepAngle = 270f, useCenter = false, style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(color = color, startAngle = 135f, sweepAngle = 270f * (score.coerceIn(0, 100) / 100f), useCenter = false, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$score", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
            Text("Score", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PerfBar(label: String, value: Int, target: Int, color: Color) {
    val pct = if (target > 0) (value.toFloat() / target).coerceIn(0f, 1f) else 0f
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = AppType.meta, color = AppColors.TextSecondary)
            Text("$value / $target", style = AppType.metaStrong, color = color)
        }
        Spacer(Modifier.height(Space.xs + Space.xxs))
        Box(Modifier.fillMaxWidth().height(6.dp).clip(Radii.tag).background(AppColors.SurfaceMuted)) {
            Box(Modifier.fillMaxWidth(pct).height(6.dp).clip(Radii.tag).background(color))
        }
    }
}

@Composable
private fun PerformanceCard(app: AppState) {
    // A hairlined surface rather than an elevated Card. Home stacked five
    // elevated cards down one scroll and the shadows, not the content, were
    // what the eye followed.
    Column(
        Modifier.fillMaxWidth()
            .clip(Radii.card)
            .background(AppColors.Surface)
,
    ) {
        Column(Modifier.padding(Space.l)) {
            Text("TODAY'S PERFORMANCE", style = AppType.sectionLabel, color = AppColors.TextTertiary)
            Spacer(Modifier.height(Space.m))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PerfBar("Calls made", app.todayCalls, app.dailyGoal, MaterialTheme.colorScheme.primary)
                    PerfBar("Connected", app.todayConnected, app.todayCalls.coerceAtLeast(1), Green)
                    PerfBar("Follow-ups", app.followUpList.size, (app.followUpList.size).coerceAtLeast(1), Amber)
                }
                Spacer(Modifier.width(16.dp))
                ScoreGauge(perfScore(app))
            }
        }
    }
}

/**
 * Home's AI surface — now the SAME panel the Calls screen and Lead detail use.
 *
 * It was a one-off: its own tinted box, its own 22dp spark, its own bold
 * "AI Insight" title and a "View your leads →" text link. Three screens each
 * inventing their own idea of what the assistant looks like is precisely why
 * the AI read as a scattering of features rather than one thing working for
 * the rep. AiPanel + AiChip give it the identity it shares everywhere else.
 *
 * Same sentence, same single callback, same hotUncontacted input — the CTA is
 * now a chip instead of an underlined-looking link, so it is obviously
 * tappable rather than obviously text.
 */
@Composable
private fun AiInsightCard(onOpenLeads: () -> Unit, hotUncontacted: Int) {
    AiPanel(
        title = "Your assistant",
        footer = {
            AiChip(
                if (hotUncontacted > 0) "Show me these $hotUncontacted leads" else "Open my leads",
                onOpenLeads,
            )
        },
    ) {
        Text(
            if (hotUncontacted > 0)
                "$hotUncontacted hot leads have not been called yet. They are the quickest wins on your list today."
            else "You're on top of your hot leads. Keep the follow-ups flowing.",
            style = AppType.body,
            color = AppColors.TextPrimary,
        )
    }
}

@Composable
fun HomeScreen(vm: MainViewModel, onOpenFollowUps: () -> Unit, onOpenLeads: () -> Unit, onNavigate: (String) -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadHome(); vm.loadLeads() }

    val firstName = app.profile?.fullName?.substringBefore(' ')?.takeIf { it.isNotBlank() } ?: "there"
    // Home is the screen a rep opens fifty times a day, and every one of these
    // walks the whole lead list. They only change when the leads do, so they are
    // computed once per load instead of on every recomposition — and the status
    // sets are hoisted out of the per-lead lambdas, which were each building a
    // fresh set for every lead they tested.
    val home = remember(app.leads, app.followUpList) {
        val protectedIds = app.followUpList.mapNotNull { it.contactId }.toSet()
        val protectedPhones = app.followUpList.map { it.phone }.toSet()
        HomeStats(
            newLeads = app.leads.count { it.stage == "new" },
            // Home used to count with STAGES while the Leads screen counted with
            // its own tab buckets — two groupings of the same leads, one app.
            // Both now count the stage column against the canonical rows.
            stageCounts = app.leadStages.filter { it.repVisible }
                .map { st -> st to app.leads.count { c -> c.stage == st.code } },
            pipelineValue = app.leads.filter { it.status !in DEAD_STATUSES }.sumOf { parseBudgetRupees(it.budget) },
            tokenCollected = app.leads.sumOf { it.tokenAmount ?: 0.0 },
            hotUncontacted = app.leads.count { it.temperature == "hot" && it.stage == "new" },
            // Safety net: interested/callback leads with NO pending follow-up are
            // "unprotected" — one tap gives each a reminder so none can slip away.
            unprotected = app.leads.filter {
                it.status in NEEDS_REMINDER && it.id !in protectedIds && it.phone !in protectedPhones
            },
        )
    }
    val newLeads = home.newLeads
    val stageCounts = home.stageCounts
    val pipelineValue = home.pipelineValue
    val tokenCollected = home.tokenCollected
    val hotUncontacted = home.hotUncontacted
    val unprotected = home.unprotected
    // Today's Plan — who is due now, whose visit is fixed, whose visit
    // already happened. The due count is Call now, not every future callback.
    val nowMs = System.currentTimeMillis()
    // Today's Plan callbacks are the due list. The title count, the three
    // rows, and "+N more" all come from this. followUpList includes callbacks
    // booked for next week, and that is how the title said 320 due over rows
    // that were not due.
    val dueContacts = remember(app.leads, app.workByLead) {
        callNowContacts(app.leads, app.workByLead)
    }
    val fuByDueId = remember(app.followUpList) {
        buildMap {
            for (f in app.followUpList) {
                val id = f.contactId ?: continue
                put(id, f)
            }
        }
    }
    val visitsPlanned = app.leads
        .mapNotNull { c -> c.siteVisitAt?.let { instantMillis(it) }?.let { ms -> c to ms } }
        .filter { it.second >= nowMs }.sortedBy { it.second }
    // A date that has gone by is NOT proof anybody turned up.
    //
    // Reported exactly this way: "Rajbir aur Rajesh ne bola shayad site visit
    // karenge, par app ne dikha diya site visit ho gayi." A voice note had
    // pencilled a visit in for a day, that day passed, and Home then listed
    // them under "Visit done — close them". Nobody had confirmed anything. The
    // rep is then told to close a customer who may never have come.
    //
    // Something has to actually SAY it happened: the rep tapped Arrived on site
    // (the geofenced check-in), or the lead moved further down the funnel,
    // which only happens after a real visit. Everything else is just a day that
    // went past, and the app asks about it instead of asserting it.
    val pastVisits = app.leads
        .mapNotNull { c -> c.siteVisitAt?.let { instantMillis(it) }?.let { ms -> c to ms } }
        .filter { it.second < nowMs && !isFinished(app.leadStages, it.first.stage) }
        .sortedByDescending { it.second }
    val (visitsDone, visitsUnconfirmed) = pastVisits.partition {
        it.first.siteVisitArrivedAt != null || it.first.status in AFTER_VISIT
    }
    // The pending-visit view is the same list Pulse reads. When that read
    // succeeded, it replaces the local "did they come?" guess. A failed read
    // keeps the local question and says the list did not load — never a 0.
    val visitBoard = app.pendingVisits
    val visitServerReady = visitBoard.loaded && visitBoard.error == null
    val showServerVisits = visitBoard.rows.isNotEmpty()
    val pendingIds = if (visitServerReady || showServerVisits) visitBoard.rows.map { it.contactId }.toSet() else emptySet()
    val visitsDoneShown = visitsDone.filter { it.first.id !in pendingIds }
    val showLocalUnconfirmed = !visitServerReady && !showServerVisits
    val funnel = remember(
        app.leads, app.workByLead, app.leadsFetched, app.leadsFetchFailed, app.workStatesError,
    ) {
        buildTodayFunnel(
            app.leads, app.workByLead, app.leadsFetched, app.leadsFetchFailed, app.workStatesError,
        )
    }

    Refreshable(onRefresh = { vm.loadHome(force = true); vm.loadLeads(force = true) }, modifier = Modifier.fillMaxSize()) {
    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Greeting hero
        item { GreetingCard(app, firstName, onOpenAttendance = { onNavigate("attendance") }) }
        // Morning greeting from the coach: first open of the day before 1 PM,
        // closed with one tap. See CoachMoments.kt.
        if (app.morningVisible) {
            item(key = "coach-morning") {
                val morningById = remember(app.leads) { app.leads.associateBy { it.id } }
                MorningGreetingCard(vm, app, morningById)
            }
        }

        app.workStatesError?.let { msg ->
            item {
                Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }
        }

        item { TodayFunnelCard(funnel, onOpenFollowUps) }

        // Calling Score — front and centre. The AI listens to the rep's calls and
        // gives an honest average score, so they see their calling quality first.
        app.callingScore?.let { score ->
            item {
                val stars = Math.round(score).toInt().coerceIn(1, 5)
                Column(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.Surface)

                        .padding(Space.l),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).clip(CircleShape).background(AppColors.IndigoSoft), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Star, contentDescription = null, tint = AppColors.Indigo, modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Calling Score", style = AppType.rowTitle, color = AppColors.TextPrimary)
                            Text("AI listened to your ${app.callingScoreCount} call${if (app.callingScoreCount == 1) "" else "s"}",
                                style = AppType.meta, color = AppColors.TextSecondary)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(String.format(java.util.Locale.US, "%.1f", score),
                                style = AppType.metric, color = AppColors.TextPrimary)
                            Text("$stars of 5", style = AppType.meta, color = AppColors.TextSecondary)
                        }
                    }
                }
            }
        }

        // THE COACH. Collapsed; opens on a tap, or by itself only when the
        // rep is idle (see CoachCard.kt). The visit list is the same one
        // Today's Plan asks about below: the server's pending-visit view when
        // it loaded, the local "visit day gone" guess when it did not.
        item {
            val byId = remember(app.leads) { app.leads.associateBy { it.id } }
            val coachVisits = if (visitServerReady || showServerVisits) {
                visitBoard.rows.mapNotNull { v ->
                    val lead = byId[v.contactId] ?: return@mapNotNull null
                    val phone = v.phone.ifBlank { lead.phone }
                    if (lead.siteVisitArrivedAt != null || phone.isBlank()) return@mapNotNull null
                    CoachVisit(v.contactId, phone, v.name.ifBlank { prettyName(lead.name) ?: phone },
                        lead.siteVisitProject, if (v.daysWaiting <= 0) "Today" else "${v.daysWaiting}d ago")
                }
            } else {
                visitsUnconfirmed.mapNotNull { (c, _) ->
                    val id = c.id ?: return@mapNotNull null
                    CoachVisit(id, c.phone, prettyName(c.name) ?: c.phone, c.siteVisitProject, dayLabel(c.siteVisitAt))
                }
            }
            HomeCoachCard(vm, app, coachVisits, byId)
        }

        // "No lead left behind" — interested leads without a reminder, fixed in one tap.
        if (unprotected.isNotEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.WarningSoft)
                        .border(1.dp, Amber.copy(alpha = 0.35f), Radii.card)
                        .clickable { vm.protectLeads(unprotected) }
                        .padding(Space.l),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Shield, contentDescription = null, tint = Amber, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                "${unprotected.size} interested lead${if (unprotected.size == 1) "" else "s"} without a reminder",
                                style = AppType.rowTitle, color = AppColors.TextPrimary,
                            )
                            Text("Tap to protect all — follow-up tomorrow 10 AM",
                                style = AppType.meta, color = AppColors.TextSecondary)
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Amber)
                    }
                }
            }
        }

        // TODAY'S PLAN — the rep's whole day, by what the customer said:
        // who asked for a callback, whose site visit is fixed, whose visit
        // happened (and now needs closing). Names first, statuses never.
        if (dueContacts.isNotEmpty() || visitsPlanned.isNotEmpty() || visitsDoneShown.isNotEmpty() ||
            (showLocalUnconfirmed && visitsUnconfirmed.isNotEmpty()) ||
            showServerVisits || visitBoard.error != null
        ) {
            item {
                Column(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.Surface)

                        .padding(Space.l),
                ) {
                    Column {
                        SectionHeader(
                            if (dueContacts.isNotEmpty()) "Today's Plan · ${dueContacts.size} due now" else "Today's Plan",
                            "All follow-ups", onOpenFollowUps,
                        )
                        PlanBucket(
                            icon = Icons.Outlined.Refresh, title = "Call now", color = Indigo,
                            rows = dueContacts.take(3).map { c ->
                                val work = c.id?.let { app.workByLead[it] }
                                val fu = c.id?.let { fuByDueId[it] }
                                val whenIso = work?.dueAt ?: fu?.dueAt
                                val why = dueSignal(work, app.focusReason(c.id))
                                val extra = focusSayLine(app.coachPicks, c.id)
                                    ?: rowMemoryLine(c.id?.let { app.memoryByLead[it] })
                                // Two lines, not one run-on: WHY first (short), then
                                // what they said last time, smaller. Same words as
                                // before; they were joined with " · " into three grey
                                // lines that read as one block.
                                val reason = why ?: extra ?: fu?.note
                                val secondary = if (why != null) extra ?: fu?.note else if (extra != null) fu?.note else null
                                PlanRow(
                                    prettyName(c.name) ?: c.phone,
                                    if (whenIso.isNullOrBlank()) "Due now" else relativeDue(whenIso),
                                    reason,
                                    c.phone,
                                    overdue = whenIso.isNullOrBlank() || (instantMillis(whenIso) ?: Long.MAX_VALUE) <= nowMs,
                                    secondary = secondary?.takeIf { it != reason },
                                    contactId = c.id,
                                )
                            },
                            more = dueContacts.size - 3, onCall = { vm.dialManual(it) }, onOpen = { vm.openLeadDetail(it) },
                        )
                        PlanBucket(
                            icon = Icons.Outlined.LocationOn, title = "Site visit fixed", color = Purple,
                            rows = visitsPlanned.take(3).map { (c, _) ->
                                PlanRow(prettyName(c.name) ?: c.phone, dayLabel(c.siteVisitAt), c.siteVisitProject, c.phone, contactId = c.id)
                            },
                            more = visitsPlanned.size - 3, onCall = { vm.dialManual(it) }, onOpen = { vm.openLeadDetail(it) },
                        )
                        PlanBucket(
                            icon = Icons.Outlined.CheckCircle, title = "Visit done — close them", color = Teal,
                            rows = visitsDoneShown.take(3).map { (c, _) ->
                                PlanRow(prettyName(c.name) ?: c.phone, dayLabel(c.siteVisitAt), c.siteVisitProject, c.phone, contactId = c.id)
                            },
                            more = visitsDoneShown.size - 3, onCall = { vm.dialManual(it) }, onOpen = { vm.openLeadDetail(it) },
                        )
                        visitBoard.error?.let { msg ->
                            Spacer(Modifier.height(10.dp))
                            Text(msg, color = MaterialTheme.colorScheme.error, style = AppType.meta)
                        }
                        if (showServerVisits) {
                            val waiting = pendingVisitRows(visitBoard, app.leads) { id, phone, name, came ->
                                vm.answerVisitHappened(id, phone, name, came)
                            }
                            PlanBucket(
                                icon = Icons.AutoMirrored.Outlined.HelpOutline,
                                title = "Waiting on an outcome",
                                color = Amber,
                                rows = waiting.take(3),
                                more = waiting.size - 3,
                                onCall = { vm.dialManual(it) }, onOpen = { vm.openLeadDetail(it) },
                            )
                        }
                        // Asked, never asserted. Shown only when the pending-visit
                        // view did not load — that view is the list when it did.
                        if (showLocalUnconfirmed) PlanBucket(
                            icon = Icons.AutoMirrored.Outlined.HelpOutline, title = "Visit day gone — did they come?", color = Amber,
                            rows = visitsUnconfirmed.take(3).map { (c, _) ->
                                PlanRow(
                                    c.name ?: c.phone, dayLabel(c.siteVisitAt), c.siteVisitProject, c.phone,
                                    // Answering here is the whole point. A visit
                                    // nobody confirms still counts as QUALIFIED
                                    // in the ad report, so an unanswered question
                                    // is not a gap in the UI — it is a number the
                                    // owner is making ad decisions on.
                                    onYes = c.id?.let { id -> { vm.answerVisitHappened(id, c.phone, c.name, true) } },
                                    onNo = c.id?.let { id -> { vm.answerVisitHappened(id, c.phone, c.name, false) } },
                                    contactId = c.id,
                                )
                            },
                            more = visitsUnconfirmed.size - 3, onCall = { vm.dialManual(it) }, onOpen = { vm.openLeadDetail(it) },
                        )
                    }
                }
            }
        }

        // Stat tiles 2×2
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile("📞", app.todayCalls.toString(), "Calls today", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                StatTile("⏱️", fmtSec(app.todayTalk), "Talk time", Cyan, Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile("✨", newLeads.toString(), "New leads", Amber, Modifier.weight(1f))
                StatTile("💰", formatRupees(pipelineValue), "Pipeline value", Green, Modifier.weight(1f))
            }
        }
        // Token / booking money actually collected — the bottom of the funnel.
        if (tokenCollected > 0) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("🧾", formatRupees(tokenCollected), "Token collected", Teal, Modifier.weight(1f))
                    StatTile("🏆", app.leads.count { it.status == "booked" }.toString(), "Booked", Green, Modifier.weight(1f))
                }
            }
        }

        // Today's performance (gauge + progress bars)
        item { PerformanceCard(app) }

        // Lead pipeline
        //
        // Drawn only when there ARE stages. stageCounts comes from
        // app.leadStages, which is empty in two ordinary situations: the split
        // second after login before fetchLeadStages() returns, and any time
        // that fetch fails (it returns emptyList on error). A pipeline with no
        // stages has nothing to show anyway — and drawing it crashed the app.
        //
        // devansh singh cleared his app data, signed in, and Home died on
        // NoSuchElementException at the maxOf below: maxOf throws on an empty
        // list. He had no cached stages because the install was fresh, so the
        // very first composition after his first successful login was the one
        // that hit it.
        if (stageCounts.isNotEmpty()) item {
            Column(
                Modifier.fillMaxWidth().clip(Radii.card)
                    .background(AppColors.Surface)

                    .padding(Space.l),
            ) {
                Column {
                    SectionHeader("Lead Pipeline", "View all", onOpenLeads)
                    Spacer(Modifier.height(14.dp))
                    // One row per stage — full label, count, and a bar you can
                    // actually read. No wrapped words, no 7-way squeeze.
                    // maxOfOrNull, not maxOf: the guard above already keeps an
                    // empty list out, and this makes sure a future caller
                    // cannot reintroduce the crash by dropping it.
                    val maxCount = (stageCounts.maxOfOrNull { it.second } ?: 0).coerceAtLeast(1)
                    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                        stageCounts.forEach { (stage, n) ->
                            val stageColor = parseHex(stage.color)
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(8.dp).clip(CircleShape).background(stageColor))
                                    Spacer(Modifier.width(8.dp))
                                    Text(stage.label, style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                                    Text(n.toString(), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold,
                                        color = if (n > 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Spacer(Modifier.height(5.dp))
                                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)) {
                                    if (n > 0) {
                                        Box(Modifier.fillMaxWidth(n / maxCount.toFloat()).fillMaxHeight()
                                            .clip(RoundedCornerShape(50)).background(stageColor))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Quick actions
        item {
            Column {
                SectionHeader("Quick Actions")
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val accent = MaterialTheme.colorScheme.primary
                    QuickAction("Add Lead", Icons.Default.PersonAdd, accent, Modifier.weight(1f)) { onNavigate("add_lead") }
                    QuickAction("Calendar", Icons.Default.CalendarMonth, accent, Modifier.weight(1f)) { onNavigate("calendar") }
                    QuickAction("AI Coach", Icons.Default.AutoAwesome, accent, Modifier.weight(1f)) { onNavigate("ai") }
                    QuickAction("Attendance", Icons.Default.AccessTime, accent, Modifier.weight(1f)) { onNavigate("attendance") }
                }
            }
        }

        // AI insight
        item { AiInsightCard(onOpenLeads = onOpenLeads, hotUncontacted = hotUncontacted) }

        // Team peek
        item { LeaderboardCard(vm, app, compact = true) }

        app.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
    }
    }
}

/** Parse an optional "#RRGGBB" brand colour into a Compose Color (null if unset/invalid). */
private fun brandColorOf(hex: String?): Color? {
    val h = hex?.trim()?.removePrefix("#") ?: return null
    if (h.length != 6) return null
    return runCatching {
        val v = h.toLong(16)
        Color(
            red = ((v shr 16) and 0xFF).toInt() / 255f,
            green = ((v shr 8) and 0xFF).toInt() / 255f,
            blue = (v and 0xFF).toInt() / 255f,
        )
    }.getOrNull()
}
@Composable
private fun GreetingCard(app: AppState, firstName: String, onOpenAttendance: () -> Unit) {
    val a = app.attendance
    val onShift = a?.punchInAt != null && a.punchOutAt == null
    val done = a?.punchOutAt != null
    // White-label stays, as a thin mark and the one button — not a painted
    // banner. The company's own brandColor is still the colour of Check in.
    val brand = brandColorOf(app.company?.brandColor)
    val action = brand ?: AppColors.Indigo
    Column(
        Modifier.fillMaxWidth().clip(Radii.card)
            .background(AppColors.Surface)
,
    ) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(action))
        Column(Modifier.padding(Space.l)) {
            app.company?.name?.takeIf { it.isNotBlank() }?.let { company ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    app.company?.logoUrl?.takeIf { it.isNotBlank() }?.let { logo ->
                        coil.compose.AsyncImage(
                            model = logo,
                            contentDescription = "$company logo",
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                            modifier = Modifier.size(28.dp).clip(RoundedCornerShape(8.dp))
                                .background(AppColors.SurfaceMuted),
                        )
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(company, style = AppType.metaStrong, color = AppColors.TextSecondary, maxLines = 1)
                }
                Spacer(Modifier.height(10.dp))
            }
            Text("Good day, $firstName", style = AppType.display, color = AppColors.TextPrimary)
            Text("Real estate sales, simplified. Let's close some deals.",
                style = AppType.meta, color = AppColors.TextSecondary)
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val label = when { done -> "Shift done"; onShift -> "Punch out"; else -> "Check in" }
                Box(
                    Modifier.heightIn(min = 44.dp).clip(Radii.control).background(action)
                        .clickable { onOpenAttendance() }
                        .padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(label, color = AppColors.OnIndigo, style = AppType.label)
                }
                Spacer(Modifier.width(12.dp))
                if (onShift) {
                    Text("On shift since ${timeOnly(a?.punchInAt)}",
                        style = AppType.meta, color = AppColors.TextSecondary)
                }
            }
        }
    }
}

@Composable
private fun QuickAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, accent: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface)
            .clickable { onClick() }.padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(accent.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = accent, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

/** One line of Today's Plan: who, when, and (if captured) what they said. */
private data class PlanRow(
    val name: String,
    val whenLabel: String,
    /** The one short reason line under the name. */
    val detail: String?,
    val phone: String,
    val overdue: Boolean = false,
    /** A quieter second line (what they said last time). Never merged into the reason. */
    val secondary: String? = null,
    /** Set when the row can open the lead page, where every line is shown in full. */
    val contactId: String? = null,
    /**
     * A yes/no the row is ASKING. Set only on "Visit day gone — did they come?",
     * where a Call button alone left the most important question in the funnel
     * unanswerable from the one screen a rep actually opens.
     */
    val onYes: (() -> Unit)? = null,
    val onNo: (() -> Unit)? = null,
)

/**
 * Rows for visits whose day passed and nobody wrote an outcome.
 * Yes / No only when this phone's copy of the lead has no arrival. If they
 * already came, the line says the outcome is still missing.
 */
private fun pendingVisitRows(
    board: PendingVisitBoard,
    leads: List<Contact>,
    onAnswer: (id: String, phone: String, name: String?, came: Boolean) -> Unit,
): List<PlanRow> {
    val byId = leads.associateBy { it.id }
    return board.rows.map { v ->
        val lead = byId[v.contactId]
        val phone = v.phone.ifBlank { lead?.phone.orEmpty() }
        val arrived = lead?.siteVisitArrivedAt != null
        val asked = if (v.timesAsked == null) "Asked —" else "Asked ${v.timesAsked}×"
        val detail = when {
            v.needsManager == true -> "You said not yet, twice. Your manager can see this."
            arrived -> "They came. The outcome is not written. $asked"
            else -> asked
        }
        val canAsk = !arrived && phone.isNotBlank() && lead != null
        PlanRow(
            name = v.name.ifBlank { lead?.name ?: phone.ifBlank { "Lead" } },
            whenLabel = if (v.daysWaiting <= 0) "Today" else "${v.daysWaiting}d",
            detail = detail,
            phone = phone,
            overdue = v.daysWaiting > 0,
            onYes = if (canAsk) ({ onAnswer(v.contactId, phone, v.name, true) }) else null,
            onNo = if (canAsk) ({ onAnswer(v.contactId, phone, v.name, false) }) else null,
            contactId = lead?.id,
        )
    }
}

/**
 * A titled bucket inside Today's Plan (callbacks / visits fixed / visits done).
 *
 * DRAWN LIKE AN iOS GROUPED LIST. Each row used to be its own tinted box with
 * a 13sp bold name, a coloured label and up to three lines of 11sp grey text
 * run together with " · ", next to a 48dp solid blue disc. Three of those
 * stacked read as one dense grey block, which is what the founder pointed at.
 *
 * Now: rows sit on the card itself, split by an inset hairline. The name is
 * the heaviest thing on the row (16sp semibold), the status is a small
 * tinted tag beside it, then ONE short reason line, then a quieter second
 * line. The Call button is a soft 40dp circle inside a 48dp touch target, so
 * it is still easy to hit one-handed but no longer shouts over the names.
 * Tapping the row opens the lead, where every line is shown in full.
 */
@Composable
private fun PlanBucket(
    icon: ImageVector,
    title: String,
    color: Color,
    rows: List<PlanRow>,
    more: Int,
    onCall: (String) -> Unit,
    /** Opens the lead page. Null keeps rows non-tappable (only Call works). */
    onOpen: ((String) -> Unit)? = null,
) {
    if (rows.isEmpty()) return
    Spacer(Modifier.height(Space.l))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(6.dp))
        Text(title, style = AppType.metaStrong, color = color)
    }
    Spacer(Modifier.height(Space.xs))
    rows.forEachIndexed { i, r ->
        if (i > 0) Box(Modifier.fillMaxWidth().padding(start = Space.xs).height(0.5.dp).background(AppColors.Border))
        Column(
            Modifier.fillMaxWidth()
                .then(
                    if (onOpen != null && r.contactId != null) Modifier.clip(RoundedCornerShape(10.dp)).clickable { onOpen(r.contactId) }
                    else Modifier,
                )
                .padding(start = Space.xs, top = Space.m, bottom = Space.m),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.name, style = AppType.rowTitle, color = AppColors.TextPrimary,
                            maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false))
                        if (r.whenLabel.isNotBlank()) {
                            Spacer(Modifier.width(Space.s))
                            val tagColor = if (r.overdue) Red else color
                            Box(
                                Modifier.clip(RoundedCornerShape(6.dp)).background(tagColor.copy(alpha = 0.10f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                            ) {
                                Text(r.whenLabel, style = AppType.tag, color = tagColor, maxLines = 1)
                            }
                        }
                    }
                    r.detail?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(3.dp))
                        Text(it, style = AppType.meta, color = AppColors.TextPrimary.copy(alpha = 0.78f),
                            maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                    r.secondary?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(2.dp))
                        Text(it, style = AppType.meta.copy(fontSize = 12.sp, lineHeight = 16.sp),
                            color = AppColors.TextSecondary,
                            maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                }
                Spacer(Modifier.width(Space.s))
                // 48dp touch target, 40dp soft disc. Small to the eye, not to the thumb.
                Box(
                    Modifier.size(48.dp).clip(CircleShape).clickable { onCall(r.phone) },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(AppColors.IndigoSoft),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Call, contentDescription = "Call ${r.name}", tint = AppColors.Indigo, modifier = Modifier.size(19.dp))
                    }
                }
            }
            // The answer, right where the question is asked. Two taps' worth of
            // information — did they turn up, and what now — collapsed into one.
            if (r.onYes != null && r.onNo != null) {
                Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.weight(1f).heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp))
                            .background(AppColors.PositiveSoft)
                            .clickable { r.onYes.invoke() }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("Yes, they came", style = AppType.label,
                            color = Green, maxLines = 1)
                    }
                    Box(
                        Modifier.weight(1f).heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp))
                            .background(AppColors.SurfaceMuted)
                            .clickable { r.onNo.invoke() }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("Didn't come", style = AppType.label,
                            color = AppColors.TextPrimary, maxLines = 1)
                    }
                }
            }
        }
    }
    if (more > 0) {
        Box(Modifier.fillMaxWidth().padding(start = Space.xs).height(0.5.dp).background(AppColors.Border))
        Text("+$more more", style = AppType.meta, color = AppColors.TextSecondary,
            modifier = Modifier.padding(start = Space.xs, top = Space.s))
    }
}

// ════════════════════════════════════════════════════════════
//  LEADS
// ════════════════════════════════════════════════════════════

/**
 * The Leads page hero — a brand-gradient "command deck". One big honest number
 * (the ₹ value sitting in this rep's pipeline) plus three live counters that are
 * also one-tap filters: Due now / Hot / New. Wears the company's brand colour,
 * same visual family as the Home hero, so the whole app reads as one product.
 */
@Composable
private fun LeadsDeck(
    app: AppState,
    pipelineValue: Double,
    scoring: Boolean,
    onRefresh: () -> Unit,
    onScore: () -> Unit,
    onSelect: () -> Unit,
    onToday: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val brand = brandColorOf(app.company?.brandColor) ?: AppColors.Indigo
    // A grouped summary, not a painted banner. Same five facts, large number
    // first. The company's brand colour is a hairline, so a white-label tenant
    // is still marked without the card becoming a billboard.
    Column(
        Modifier.fillMaxWidth().clip(Radii.card)
            .background(AppColors.Surface)
,
    ) {
        Column(Modifier.padding(horizontal = Space.l, vertical = Space.m)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // The tenant's brand colour, as a small dot instead of a banner stripe.
                        Box(Modifier.size(8.dp).clip(CircleShape).background(brand))
                        Spacer(Modifier.width(6.dp))
                        Text("${app.leads.size} leads", style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1)
                    }
                    Text(
                        if (pipelineValue > 0) formatRupees(pipelineValue) else "${app.leads.size}",
                        style = AppType.display, color = AppColors.TextPrimary, maxLines = 1,
                    )
                    Text(if (pipelineValue > 0) "On the table" else "With you",
                        style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1)
                }
                Box(
                    Modifier.size(36.dp).clip(CircleShape).background(IosColors.Fill)
                        .iosPress(scaleTo = 0.92f) { onRefresh() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Outlined.Refresh, contentDescription = "Refresh", tint = IosColors.Blue, modifier = Modifier.size(18.dp)) }
                Spacer(Modifier.width(8.dp))
                Box {
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).background(IosColors.Fill)
                            .iosPress(scaleTo = 0.92f) { menuOpen = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (scoring) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = AppColors.Indigo)
                        else Icon(Icons.Default.MoreHoriz, contentDescription = "More", tint = IosColors.Blue, modifier = Modifier.size(18.dp))
                    }
                    // iOS action sheet instead of Material's (purple) dropdown.
                    // Same three actions, same order.
                    if (menuOpen) {
                        IosActionSheet(
                            onDismiss = { menuOpen = false },
                            actions = listOf(
                                SheetAction(if (scoring) "Scoring…" else "AI Score leads", enabled = !scoring) { onScore() },
                                SheetAction("Select leads") { onSelect() },
                                // The rep's own day, on the screen where they spend it.
                                SheetAction("What I did today") { onToday() },
                            ),
                        )
                    }
                }
            }
            // The Due / Hot / New / Revive counters that sat here moved into
            // the one filter row under the search box. Due was the same number
            // as the Call now tile AND the Next call card, so a rep read 362
            // three times before reaching a lead. Every count is still on the
            // screen, once.
        }
    }
}

/**
 * NEXT CALL — the one answer a telecaller needs on a screen with 439 leads.
 *
 * "Telecaller bohot confuse hote h jab lead 400, 500 hoti h."
 *
 * They should be. Until now this screen opened with a pipeline figure, four
 * counters, six tiles and four hundred cards, and every one of those asks the
 * rep a question instead of answering one. A telecaller does not want to browse
 * a database; they want to know who to ring, ring them, say what happened, and
 * be handed the next one. Choosing, four hundred times a day, IS the confusion.
 *
 * So the screen now opens by naming one person and why they are first. The
 * queue behind it is EXACTLY the deck's "Due" rule — overdue plus call_now,
 * soonest first — so the number on this card and the number on the counter
 * above it can never disagree. No new taxonomy, no second opinion about what is
 * urgent; this only renders what v_lead_workstate already decided.
 *
 * Two ways out, in the order a rep wants them: ring this one, or hand the whole
 * queue to the auto-dialler. The second is the same callList the Follow Ups
 * screen has used all along, worded the same way, because a rep who has learnt
 * "call all 26 due, one after another" there should not have to learn a second
 * phrase here.
 */
@Composable
private fun UpNextCard(
    lead: Contact,
    reason: String,
    queueSize: Int,
    onCall: () -> Unit,
    onOpen: () -> Unit,
    onCallAll: () -> Unit,
    /** Where the last conversation stopped. Null when there is no memory. */
    coachLine: String? = null,
    /** Today's focus opener, only when this lead is one of the five. */
    sayLine: String? = null,
) {
    val who = prettyName(lead.name) ?: prettyPhone(lead.phone)
    // "Call Rahul", not "Call" — a named button is a decision already made.
    val firstName = who.trim().substringBefore(' ').take(14)
    Column(
        Modifier.fillMaxWidth().clip(Radii.card)
            .background(AppColors.Surface)
            .clickable { onOpen() }
            .padding(Space.l),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The count is NOT repeated here. It lives once, on "Call all N".
            Text("Next call", style = AppType.footnote.copy(fontWeight = FontWeight.SemiBold), color = IosColors.Blue,
                modifier = Modifier.weight(1f), maxLines = 1)
        }
        Spacer(Modifier.height(Space.s))
        Row(verticalAlignment = Alignment.CenterVertically) {
            InitialsAvatar(lead.name ?: lead.phone)
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(who, style = AppType.headline.copy(fontSize = 20.sp), color = AppColors.TextPrimary,
                    maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                // Why this one and not another. A queue that will not explain
                // itself is a queue a rep second-guesses, and then ignores.
                Text(reason, style = AppType.meta, color = AppColors.TextSecondary,
                    maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                coachLine?.let {
                    Text(it, style = AppType.meta, color = AppColors.TextPrimary,
                        maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
                sayLine?.let {
                    Text(it, style = AppType.meta, color = AppColors.Indigo,
                        maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
            }
            budgetLabel(lead.budget)?.let {
                Spacer(Modifier.width(Space.s))
                Text("₹ $it", style = AppType.metaStrong, color = AppColors.TextPrimary, maxLines = 1)
            }
        }
        Spacer(Modifier.height(Space.m))
        // ONE hero, two buttons: ring this person, or hand the whole Call now
        // list to the auto-dialler. "Call all N" is the only place the Call
        // now count appears while this card is on screen.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
            Row(
                Modifier.weight(1f).heightIn(min = 50.dp).clip(RoundedCornerShape(50))
                    .background(IosColors.Blue)
                    .iosPress(scaleTo = 0.96f) { onCall() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Default.Call, contentDescription = null, tint = AppColors.OnIndigo,
                    modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(7.dp))
                Text("Call $firstName", style = AppType.label, color = AppColors.OnIndigo, maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            }
            if (queueSize > 1) Column(
                Modifier.weight(1f).heightIn(min = 50.dp).clip(RoundedCornerShape(50))
                    .background(IosColors.Blue.copy(alpha = 0.12f))
                    .iosPress(scaleTo = 0.96f) { onCallAll() }
                    .padding(horizontal = Space.s, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("Call all $queueSize", style = AppType.label, color = IosColors.Blue, maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                Text("one after another", style = AppType.tag, color = AppColors.Indigo.copy(alpha = 0.75f), maxLines = 1)
            }
        }
    }
}

/**
 * THE ONE FILTER ROW. Every count on the Leads page, once.
 *
 * This replaces two things that said the same numbers: the deck's Due / Hot /
 * New / Revive counters and the six-tile work grid under the search box. "Due"
 * on the deck and "Call now" in the grid were the same list (callNowContacts),
 * and the Next call card said it a third time ("362 waiting") — the founder's
 * screenshot showed 362 three times before a single lead.
 *
 * Now there is one row of compact chips, wrapped so none of them hides off the
 * right edge (the reason the old chip row was replaced by the grid). Count
 * first in the chip's colour, label after. Call now leaves out its count while
 * the Next call card is showing, because "Call all N" on that card is the
 * same number. When the card is not there (searching, selecting, or nothing
 * due) the chip shows it. A failed read shows "—", never 0. A 0 chip is shown
 * faded and is not tappable, exactly like the grid tiles were.
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun LeadSegments(
    actionCounts: List<Pair<ActionChip, Int>>,
    unknown: Boolean,
    hideCallNowCount: Boolean,
    selectedAct: String?,
    onPickAct: (String?) -> Unit,
    newCount: Int,
    newSelected: Boolean,
    onNew: () -> Unit,
    hotCount: Int,
    hotSelected: Boolean,
    onHot: () -> Unit,
    reviveCount: Int,
    onRevive: () -> Unit,
) {
    val byCode = actionCounts.associate { (a, n) -> a.code to (a to n) }
    @Composable
    fun act(code: String) {
        val (a, n) = byCode[code] ?: return
        val on = selectedAct == code
        SegChip(
            label = a.label,
            count = when {
                unknown -> "—"
                code == "call_now" && hideCallNowCount -> null
                else -> n.toString()
            },
            empty = !unknown && n == 0,
            selected = on,
            accent = if (code == "call_now" || code == "overdue") a.color else AppColors.Indigo,
            onClick = { onPickAct(if (on) null else code) },
        )
    }
    // ONE horizontally scrolling row of iOS capsules (no more 3 wrapped rows).
    // Selected = filled systemBlue. Every count stays on its chip. The row
    // A chip half-cut at the right edge shows the row scrolls sideways.
    val scroll = rememberScrollState()
    Row(
        Modifier.fillMaxWidth().horizontalScroll(scroll).padding(end = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Work first (what to do now), then the two browsing filters a rep
        // reaches for most, then the rest of the plan.
        act("call_now")
        act("overdue")
        SegChip("New", newCount.toString(), empty = newCount == 0, selected = newSelected, accent = AppColors.Indigo, onClick = onNew)
        SegChip("Hot", hotCount.toString(), empty = hotCount == 0, selected = hotSelected, accent = AppColors.Danger, onClick = onHot)
        act("due_today")
        act("no_next_step")
        act("scheduled")
        act("awaiting_visit")
        if (reviveCount > 0) SegChip("Revive", reviveCount.toString(), empty = false, selected = false, accent = AppColors.Indigo, onClick = onRevive)
    }
}

/** One compact filter chip: count (or nothing) then label. iOS-style soft fill. */
@Composable
private fun SegChip(
    label: String,
    count: String?,
    empty: Boolean,
    selected: Boolean,
    accent: Color,
    onClick: () -> Unit,
) {
    // The app's one chip (design/IosKit). Same colours and rules as before:
    // solid when selected, count in the accent, a 0 chip faded and inert.
    IosChip(label = label, count = count, selected = selected, empty = empty, accent = accent,
        selectedColor = IosColors.Blue, onClick = onClick)
}

// FollowUpSection and FollowUpSubHead are gone with the in-page Follow-up
// split. The three groups they drew — Call now / Done today / Booked for later
// — are first-class chips on the action row now, counted by the database
// rather than by this screen.

@Composable
private fun FollowUpAllClear(laterCount: Int) {
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Green.copy(alpha = 0.10f))
            .padding(horizontal = 16.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Green, modifier = Modifier.size(28.dp))
        Spacer(Modifier.height(8.dp))
        Text("All follow-ups done", style = AppType.rowTitle, color = AppColors.TextPrimary)
        Spacer(Modifier.height(3.dp))
        Text(
            if (laterCount > 0)
                "No call is due right now. $laterCount are booked for later — they show up here on their own, at their time."
            else "No call is due right now. Nothing is booked for later either.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/**
 * "What you did today" — the rep's own day, in one sheet.
 *
 * THE COMPLAINT THIS ANSWERS: "jo telecaller update kara vo kaha gya."
 *
 * Recording an outcome is the one thing this app asks a rep to do all day, and
 * it is the one thing that leaves no trace on screen. The update is correct and
 * its effect is to make the lead LEAVE: it moves stage, so it drops out of the
 * bucket being looked at; or the next callback books itself for Friday, so it
 * disappears from Call now. From the rep's chair a saved update and a lost
 * update look identical — which is how a rep who had worked all afternoon came
 * to believe the app was eating their work.
 *
 * Nothing here is new data. Every one of those writes already logs a row to
 * lead_activities and the lead page already draws them one lead at a time. This
 * is the same rows, for one day, across all of the rep's leads, with the lead's
 * name on them and a tap to go back.
 *
 * The AI and the call-log importer write under the rep's own actor_id, so their
 * entries arrive too — and they should: "the AI moved this to Interested from
 * your voice note" is exactly the kind of thing a rep suspects did not happen.
 * They are labelled so it is never mistaken for something the rep typed.
 */
@Composable
private fun TodayWorkSheet(app: AppState, onOpenLead: (String) -> Unit) {
    // Named per lead, from the list the screen already has in memory. A lead
    // the rep worked today is a lead assigned to them, so it is loaded.
    val nameById = remember(app.leads) {
        app.leads.mapNotNull { l -> l.id?.let { it to (prettyName(l.name) ?: prettyPhone(l.phone)) } }.toMap()
    }
    // Grouped by lead, most recently touched first. A rep who called the same
    // person three times wants one entry with three lines, not three entries
    // scattered down a list.
    val groups = remember(app.todayActivities, nameById) {
        app.todayActivities
            .groupBy { it.contactId }
            .entries
            .sortedByDescending { e -> e.value.firstOrNull()?.createdAt ?: "" }
    }
    val me = app.profile?.fullName?.trim()

    Column(Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(bottom = Space.xl)) {
        Text("What you did today", style = AppType.title, color = AppColors.TextPrimary)
        Spacer(Modifier.height(Space.xxs))
        Text(
            when {
                app.todayActivitiesLoading && app.todayActivities.isEmpty() -> "Loading your day…"
                groups.isEmpty() -> "Nothing recorded yet today."
                else -> "${app.todayActivities.size} updates on ${groups.size} leads"
            },
            style = AppType.meta, color = AppColors.TextSecondary,
        )
        Spacer(Modifier.height(Space.m))

        if (groups.isEmpty() && !app.todayActivitiesLoading) {
            Text(
                "Every update you make gets saved here with the time — the stage you set, the note you wrote, the callback you booked. Update a lead and come back to see it.",
                style = AppType.body, color = AppColors.TextSecondary,
            )
            return@Column
        }

        // Capped against the SCREEN, not a fixed dp. A busy rep logs a few dozen
        // updates a day, and a flat 460dp cap is taller than the whole usable
        // area of a 4-inch phone — the header above would have been pushed out
        // of the sheet on exactly the handsets this app has to work on.
        val maxList = (LocalConfiguration.current.screenHeightDp * 0.55f).dp
        LazyColumn(
            Modifier.fillMaxWidth().heightIn(max = maxList),
            verticalArrangement = Arrangement.spacedBy(Space.s),
        ) {
            items(groups, key = { it.key }) { (cid, acts) ->
                Column(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.SurfaceMuted)
                        .clickable { onOpenLead(cid) }
                        .padding(horizontal = Space.m, vertical = Space.s),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            // A lead the rep worked today is assigned to them, so
                            // it is in the loaded list — but a hand-over between
                            // the update and now would take it out, and a blank
                            // row is worse than a plain word.
                            nameById[cid] ?: "Lead",
                            style = AppType.rowTitle, color = AppColors.TextPrimary,
                            maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(Space.s))
                        Text(timeOnly(acts.firstOrNull()?.createdAt), style = AppType.tag,
                            color = AppColors.TextTertiary, maxLines = 1)
                    }
                    // Four lines is a whole conversation's worth of updates on
                    // one lead. Past that the lead's own page is the right place
                    // to read it, and the row says so.
                    acts.take(4).forEach { a ->
                        val byOther = me.isNullOrBlank() || a.actorName?.trim() != me
                        Spacer(Modifier.height(Space.xxs))
                        Text(
                            if (byOther && !a.actorName.isNullOrBlank()) "${a.detail}  ·  ${a.actorName}"
                            else a.detail,
                            style = AppType.meta, color = AppColors.TextSecondary,
                            maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        )
                    }
                    if (acts.size > 4) {
                        Spacer(Modifier.height(Space.xxs))
                        Text("+${acts.size - 4} more — open the lead to read them all",
                            style = AppType.tag, color = AppColors.TextTertiary)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun LeadsScreen(vm: MainViewModel, onStartCampaign: () -> Unit, onMenu: () -> Unit = {}) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadLeads(); vm.loadFollowUps() }
    // Pending follow-up per lead, so every card can say "call back · Today 4 PM".
    val fuByContact = remember(app.followUpList) { app.followUpList.filter { it.contactId != null }.associateBy { it.contactId } }
    val fuByPhone = remember(app.followUpList) { app.followUpList.associateBy { it.phone } }
    // Calls that ended with nothing written down. Hoisted out of the row so the
    // lookup is a set hit per lead, not a list scan on every recomposition.
    val pendingUpdateIds = remember(app.pendingUpdates) { app.pendingUpdates.map { it.contactId }.toSet() }

    var query by remember { mutableStateOf("") }
    // One simple question on screen: "which bucket?" — the fine-grained stage /
    // temperature / sort controls live in the Filters sheet, not the page.
    // TWO AXES, TWO ROWS. "act:<state>" is WHAT TO DO NOW (derived, from the
    // database); "stage:<code>" is WHERE THE DEAL IS (canonical, from
    // lead_stages). They are never mixed, which is what made the old tab row —
    // New / Today / Follow-up / Working / Pipeline / Booked / Closed — look
    // like the same lead was in several places at once. It usually was.
    //
    // Opens on the action queue, because a rep's first question is never "how
    // many leads are at Negotiation", it is "who do I ring now".
    // Opens on NEW.
    //
    // This was "act:call_now" an hour ago, on the reasoning that a rep's first
    // question is who to ring. Changed on instruction: the day starts with the
    // leads nobody has touched, and a rep who wants the due pile is one tap
    // away on the row above.
    // THREE LANES, ONE QUESTION EACH (founder, Oct 2026). Nine chips in one
    // sideways-scrolling row got missed: Later, Visit and No step sat off the
    // edge. Now: Call now / Waiting / Revive cards, always on screen, and the
    // old filters as a segmented control inside the chosen lane. Every old
    // filter maps to exactly one lane + segment (see LANE_SUBS). Opens on
    // Call now › New, which keeps the earlier "day starts on New" instruction.
    var lane by remember { mutableStateOf("call") }
    var sub by remember { mutableStateOf("new") }
    val bucket = laneBucket(sub)
    var stageFilter by remember { mutableStateOf<String?>(null) } // exact stage from the sheet
    var quick by remember { mutableStateOf<String?>(null) }       // "today" | "retry"
    var tempFilter by remember { mutableStateOf<String?>(null) }  // null = all temps
    var sortBy by remember { mutableStateOf("default") }          // "default" | "score" | "recent"
    var sheetOpen by remember { mutableStateOf(false) }
    var todayOpen by remember { mutableStateOf(false) }  // "What I did today"
    var reviveOpen by remember { mutableStateOf(false) } // RAG v13 — Second Chance sheet
    var actionFor by remember { mutableStateOf<Contact?>(null) }
    var scheduleFor by remember { mutableStateOf<Contact?>(null) }
    // Follow-up's two "nothing to do" sections start shut, so the tab opens on
    // the calls that are actually due and nothing else. Shut is the useful
    // state; they are there to be checked, not scrolled past.

    LaunchedEffect(app.requestedContactId, app.leads) {
        val reqId = app.requestedContactId
        if (reqId != null && app.leads.isNotEmpty()) {
            val contact = app.leads.find { it.id == reqId }
            if (contact != null) {
                actionFor = contact
                vm.consumeOpenContact()
            }
        }
    }
    var contentFor by remember { mutableStateOf<Contact?>(null) }
    var projectsFor by remember { mutableStateOf<Contact?>(null) }
    var handOverFor by remember { mutableStateOf<Contact?>(null) }
    var selectMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf(setOf<String>()) }

    // Allow other screens (Campaign tab) to launch us straight into select mode.
    LaunchedEffect(app.leadsSelectRequested) {
        if (app.leadsSelectRequested) { selectMode = true; vm.consumeLeadSelect() }
    }

    // Buckets a rep actually thinks in. Sheet filters (exact stage / quick views)
    // override the bucket when active.
    //
    // THE HARDCODED TAXONOMY THAT USED TO LIVE HERE IS GONE.
    //
    // newSet / retrySet / workingSet / pipelineSet / closedSet, plus inToday(),
    // hasFollowUp(), needsAnotherCall() and doneToday(), were this screen's
    // private opinion about what a lead's lifecycle position was — a third one,
    // disagreeing with the STAGES list forty lines up and with the dashboard's
    // nine chips. Six leads were in Pipeline and Follow-up at the same time
    // because two of those sets overlapped and nobody could see it.
    //
    // Both questions are now answered once, by the database, and merely
    // rendered here: `contact.stage` (a column, monotonic, joined to
    // lead_stages) and `app.workByLead` (v_lead_workstate). If a count on
    // this screen ever disagrees with the dashboard again, one of them stopped
    // reading these and started deciding for itself.
    // Ticking, not frozen at composition — see rememberNowTick. Overdue badges
    // on this list used to go stale the moment the screen stopped changing.
    val nowMs = rememberNowTick()
    // "Call now" is the SERVER's answer (v_lead_workstate compares due_at to
    // now() in Postgres), so a local tick alone cannot move a lead into it. Each
    // minute we re-ask — one small view, not the whole lead list. Skipping the
    // first tick avoids repeating the fetch loadLeads has just done.
    var settled by remember { mutableStateOf(false) }
    LaunchedEffect(nowMs) { if (settled) vm.refreshWorkStates() else settled = true }
    fun fuOf(c: Contact) = c.id?.let { fuByContact[it] } ?: fuByPhone[c.phone]

    // The call queue behind the Next call card, and the list Call all dials.
    // Hoisted here, not built inside the LazyColumn: that content block is a
    // LazyListScope, not a composable one, so remember() cannot live there.
    //
    // Same list as dueNowCount() and as Follow-ups Call now: overdue or
    // call_now, five-tier order. See CallNowQueue.kt.
    val queue = remember(app.leads, app.workByLead) {
        callNowContacts(app.leads, app.workByLead)
    }
    val dueUnknown = app.workStatesError != null

    val base = when {
        stageFilter != null -> app.leads.filter { it.stage == stageFilter }
        quick == "today" -> app.leads.filter { isToday(it.createdAt) }
        // WHO HAVE I ALREADY CALLED TODAY.
        //
        // There was no way to see this. Every view in the app answers "who is
        // left" — Call now, Overdue, Due today — and a rep part-way through a
        // list had no way to check what they had already got through, which is
        // the first thing anyone asks themselves at 4pm. v_lead_workstate
        // already carries last_call_at and the Leads screen already loads it,
        // so this is a client-side filter over data that was on screen.
        quick == "called" -> app.leads.filter { isToday(app.workOf(it)?.lastCallAt) }
        quick == "retry" -> app.leads.filter { isNoAnswerRetry(it, app.workOf(it)) }
        // THE HOME DECK'S TWO BUTTONS LAND HERE, and until now they landed
        // nowhere. "followup" and "new" match neither the "act:" nor the
        // "stage:" prefix below, so both fell through to `else -> app.leads`
        // and dropped the rep into the ENTIRE unfiltered list. The comment on
        // onDueNow says "lands on Follow-up, which opens on Call now — the list
        // this number counts"; that was the intent and not what the code did.
        //
        // It is the "12 vs 8" failure the deck's own newCount comment warns
        // about, in its worst form: the button says 410 and opens 855.
        //
        // "followup" is overdue + call_now because that is exactly what the
        // deck's Due number counts (see DeckStats above). One rule, used to
        // both count the badge and build the list it opens, so they cannot
        // drift apart again.
        bucket == "followup" -> queue
        // Character-for-character the rule the deck's newCount uses.
        bucket == "new" -> app.leads.filter { it.stage == "new" }
        // Same rule as the old Hot chip's count (deck.hotCount).
        bucket == "hot" -> app.leads.filter { it.temperature == "hot" && !isFinished(app.leadStages, it.stage) }
        // Same rule as the old Revive count (deck.reviveCount). Never DNC.
        bucket == "revive" -> app.leads.filter { isReviveLead(it) }
        // Both axes read straight through. There is no client-side re-derivation
        // of either one: the stage is a column, the action state is a view, and
        // a second opinion computed here is exactly the drift being removed.
        bucket.startsWith("act:") -> {
            val code = bucket.removePrefix("act:")
            when (code) {
                // The tile says Call now. That is the same set as Call all,
                // Home's due count, and Follow-ups Call now. Overdue alone is
                // the late slice, and its hint says those people are already here.
                "call_now" -> queue
                "overdue" -> app.leads.filter { app.actionOf(it) == "overdue" }
                    .sortedWith(callNowOrder(app.workByLead))
                else -> app.leads.filter { app.actionOf(it) == code }
                    .sortedBy { fuOf(it)?.let { f -> instantMillis(f.dueAt) } ?: Long.MAX_VALUE }
            }
        }
        bucket.startsWith("stage:") ->
            app.leads.filter { it.stage == bucket.removePrefix("stage:") }
        else -> app.leads
    }
    val tempFiltered = if (tempFilter == null) base else base.filter { it.temperature == tempFilter }
    val searched = if (query.isBlank()) tempFiltered else tempFiltered.filter {
        (it.name ?: "").contains(query, ignoreCase = true) || it.phone.contains(query)
    }
    val filtered = when (sortBy) {
        "score" -> searched.sortedByDescending { leadScore(it) }
        "recent" -> searched.sortedByDescending { it.createdAt ?: "" }
        // Default order in New: woken-up retries/callbacks first (their time is
        // NOW), then everything else in its usual order.
        // The action buckets already arrive in due order from the filter above;
        // re-sorting them here would be a second opinion about the same clock.
        else -> searched
    }
    val filteredIds = filtered.mapNotNull { it.id }.toSet()
    val allSelected = filteredIds.isNotEmpty() && selectedIds.containsAll(filteredIds)

    // SIX PEOPLE CALLED MANOJ.
    //
    // Ankita updated five leads and could not tell that anything had happened,
    // because 59 of her 171 open leads share a first name with another lead —
    // sanjay ×5, manoj ×5, amit ×4, ram ×4. Six different Manojs, six different
    // phone numbers, six different people. She works one, and five identical
    // rows are still sitting there looking untouched.
    //
    // The phone was always on the card, but grey and small underneath a bold
    // name — the eye anchors on the name, and every name was the same. So when
    // a name is repeated IN THE LIST IN FRONT OF HER, the last four digits ride
    // on the name line itself. That is how a person tells two Manojs apart out
    // loud, and it costs four characters.
    //
    // Only when it is actually ambiguous: a unique name gets no clutter.
    val repeatedNames = remember(filtered) {
        filtered.mapNotNull { it.name?.trim()?.lowercase()?.takeIf { n -> n.isNotBlank() } }
            .groupingBy { it }.eachCount()
            .filterValues { it > 1 }.keys
    }

    // The action queue: the ONLY place a power-dial may run from. Dialling a
    // stage tab would ring people whose time has not come — which is what
    // "power-dial the Follow-up tab" used to do before the tab was three
    // different jobs under one name.
    // "followup" is the deck's work queue (overdue + call_now), so power-dial
    // belongs there too — it is the same due work, reached by a different tap.
    val isActionQueue = bucket == "act:overdue" || bucket == "act:call_now" || bucket == "followup"
    val fuCallNow = if (isActionQueue) filtered else emptyList()

    fun exitSelect() { selectMode = false; selectedIds = emptySet() }

    // Four full sweeps of the lead list, one of them parsing a rupee string per
    // lead. None of it changes unless the leads themselves do, so it must not
    // re-run on every keystroke in the search box or every tap of a filter.
    val deck = remember(app.leads, app.workByLead, app.workStatesError, app.followUpList, app.leadStages, nowMs / 60_000) {
        // Same function Home's badge uses — see dueNowCount().
        val dueNow = vm.dueNowCount()
        val hotCount = app.leads.count { it.temperature == "hot" && !isFinished(app.leadStages, it.stage) }
        val pipelineValue = app.leads
            .filter { it.status !in DEAD_STATUSES }
            .sumOf { parseBudgetRupees(it.budget) }
        // RAG v13 candidates: said-no + tried-and-gone-cold. Never DNC.
        val reviveCount = app.leads.count { isReviveLead(it) }
        DeckStats(dueNow, hotCount, reviveCount, pipelineValue)
    }
    // Same rule as the New stage filter. A summary that disagrees with the list
    // it opens has already caused one "12 vs 8" bug report.
    val newCount = remember(app.leads) { app.leads.count { it.stage == "new" } }
    // Counted ONCE per lead-list change, not six times per frame.
    val actionCounts = remember(app.leads, app.workByLead) {
        val callNow = callNowContacts(app.leads, app.workByLead).size
        ACTIONS.map { a ->
            val n = if (a.code == "call_now") callNow else app.leads.count { app.actionOf(it) == a.code }
            a to n
        }
    }
    // The Next call card is on screen, and it carries the Call now count on
    // its "Call all N" button. The Call now filter then does not repeat it.
    val heroShown = lane == "call" && !selectMode && query.isBlank() && queue.isNotEmpty()

    // iOS large title: "Leads" scrolls with the list; once it is gone the
    // small centred title and a hairline fade into the slim bar on top.
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val titleCollapsed by remember {
        androidx.compose.runtime.derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 60 }
    }
    Box(Modifier.fillMaxSize().background(AppColors.Canvas)) {
    Column(Modifier.fillMaxSize()) {
        IosNavBar(
            title = if (selectMode) "Select leads" else "Leads",
            collapsed = titleCollapsed,
            leading = {
                Icon(Icons.Default.Menu, contentDescription = "Menu", tint = IosColors.Blue,
                    modifier = Modifier.size(40.dp).clip(CircleShape).iosPress { onMenu() }.padding(8.dp))
            },
            trailing = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings", tint = IosColors.Blue,
                        modifier = Modifier.size(40.dp).clip(CircleShape).iosPress { vm.openSettings() }.padding(9.dp))
                }
            },
        )
        Refreshable(onRefresh = { vm.loadLeads(force = true); vm.loadFollowUps(force = true) }, modifier = Modifier.weight(1f)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            // Tighter side margins buy ~8dp of card width on a small phone, and
            // the bottom is deeper because the card now ENDS in buttons: the
            // last card's Call must never sit under the nav bar or the raised
            // dial button in front of it.
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 0.dp, bottom = 140.dp),
            // 11dp, not 7. The gap is what tells a rep the card has ended;
            // at 7 the list read as one sheet.
            verticalArrangement = Arrangement.Top,
        ) {
            item(key = "large_title") {
                IosLargeTitle(if (selectMode) "Select leads" else "Leads", modifier = Modifier.padding(bottom = 4.dp))
            }
            item { Spacer(Modifier.height(11.dp))
                if (!selectMode) {
                    // The hero: a brand-gradient command deck — pipeline ₹ value
                    // plus three live counters that are also one-tap filters.
                    // Utilities (refresh / AI score / select) ride on the deck.
                    // Four full sweeps of the lead list, one of them parsing a
                    // rupee string per lead. None of it changes unless the leads
                    // themselves do, so it must not re-run on every keystroke in
                    // the search box or every tap of a filter chip — which is
                    // what it did, on the main thread, before this remember.
                    LeadsDeck(
                        app = app,
                        pipelineValue = deck.pipelineValue,
                        scoring = app.aiScoringLeads,
                        onRefresh = { vm.loadLeads(force = true); vm.loadFollowUps(force = true) },
                        onScore = { vm.scoreLeads() },
                        onSelect = { selectMode = true },
                        onToday = { todayOpen = true; vm.loadTodayActivities() },
                    )
                    if (dueUnknown) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            app.workStatesError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                } else {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Select leads", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text("Tap leads to add them to a campaign", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("Cancel", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.clickable { exitSelect() }.padding(8.dp))
                    }
                }
            }
            // WHO TO RING, NAMED, ABOVE THE FOUR HUNDRED CARDS.
            //
            // Same rule as the deck's Due counter — dueNowCount() is literally
            // `overdue || call_now` — so the two numbers are the same number by
            // construction. Sorted by when the callback was promised, oldest
            // first, then by arrival for the ones nobody ever booked; that is
            // the order the Follow Ups screen already calls in.
            //
            // Hidden while searching or selecting: both mean the rep is doing
            // something deliberate and does not want to be handed a queue.
            if (lane == "call" && !selectMode && query.isBlank()) {
                queue.firstOrNull()?.let { next ->
                    item(key = "up_next") { Spacer(Modifier.height(11.dp))
                        val fu = fuOf(next)
                        val due = fu?.let { instantMillis(it.dueAt) }
                        val work = app.workOf(next)
                        UpNextCard(
                            lead = next,
                            reason = dueSignal(work, app.focusReason(next.id)) ?: when {
                                due != null && due <= nowMs -> "Callback was due ${agoLabel(fu.dueAt)}"
                                due != null -> "Callback due ${relativeDue(fu.dueAt)}"
                                next.createdAt != null -> "New lead · ${arrivedLabel(next.createdAt!!)}"
                                else -> "Nobody has called them yet"
                            },
                            coachLine = rowMemoryLine(next.id?.let { app.memoryByLead[it] }),
                            sayLine = if (isDueNow(work)) focusSayLine(app.coachPicks, next.id) else null,
                            queueSize = queue.size,
                            onCall = { vm.dialManual(next.phone) },
                            onOpen = { next.id?.let { vm.openLeadDetail(it) } },
                            onCallAll = { vm.callList(queue, "Due now") },
                        )
                    }
                }
            }
            // Search + Filters: one slim row. Everything fine-grained hides in the sheet.
            item { Spacer(Modifier.height(11.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Search is the fastest way to a specific lead, so it has to
                    // look like something you can type in. The old borderless
                    // pill read as decoration; this one has a real edge and a
                    // little lift under it.
                    // The design system's search field: a filled, hairline-free
                    // control on SurfaceMuted. The old one was an OutlinedTextField
                    // carrying its own 12dp shape, its own 1dp drop shadow and four
                    // hand-set container/border colours — a fourth input style on a
                    // screen that already had chips, the filter button and the
                    // sheet's fields.
                    IosSearchField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = "Search name or phone",
                        modifier = Modifier.weight(1f),
                    )
                    val filtersOn = stageFilter != null || tempFilter != null || quick != null || sortBy != "default"
                    // Same height and radius as the search field beside it, so the
                    // pair reads as one control group rather than a field and a
                    // stray square.
                    Box(
                        Modifier.size(38.dp).clip(CircleShape)
                            .background(if (filtersOn) IosColors.Blue else IosColors.Fill)
                            .iosPress(scaleTo = 0.92f) { sheetOpen = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Sort, contentDescription = "Filters",
                            tint = if (filtersOn) Color.White else IosColors.Blue,
                            modifier = Modifier.size(19.dp))
                    }
                }
            }
            // ── The work grid ───────────────────────────────────────────
            //
            // Two chip rows stood here. They wrapped first — the two blocks ate
            // about forty percent of a phone screen — then they were made to
            // scroll sideways, which fixed the height and created a worse
            // problem: six action chips do not fit on a 360dp phone, so Later,
            // Visit and No step sat off the right edge. Three of the six answers
            // to "what do I do now", behind a swipe nobody makes.
            //
            // Two rows of three fit at any font scale, count first. The stage
            // row underneath is gone from the screen and NOT from the app —
            // every stage is in the filter sheet with the other browsing
            // filters, and the sheet was already showing them.
            item { Spacer(Modifier.height(11.dp))
                val byCode = actionCounts.associate { (a, n) -> a.code to n }
                val reviveUnion = app.leads.count { app.actionOf(it) == "no_next_step" || isReviveLead(it) }
                LeadLanes(
                    lane = lane,
                    sub = sub,
                    unknown = dueUnknown,
                    counts = mapOf(
                        "call_now" to queue.size,
                        "overdue" to (byCode["overdue"] ?: 0),
                        "new" to newCount,
                        "hot" to deck.hotCount,
                        "due_today" to (byCode["due_today"] ?: 0),
                        "scheduled" to (byCode["scheduled"] ?: 0),
                        "awaiting_visit" to (byCode["awaiting_visit"] ?: 0),
                        "no_next_step" to (byCode["no_next_step"] ?: 0),
                        "cold" to deck.reviveCount,
                    ),
                    reviveTotal = reviveUnion,
                    onLane = { l ->
                        lane = l; sub = LANE_SUBS[l]?.first()?.first ?: "call_now"
                        stageFilter = null; quick = null
                    },
                    onSub = { code -> sub = code; stageFilter = null; quick = null },
                    // Small text button: dials the segment in view, only where
                    // dialling is allowed (Call now › All / Overdue). Replaces
                    // the floating "Call N" button, which repeated Call all.
                    callAllCount = if (!selectMode && isActionQueue && (sub != "call_now" || !heroShown)) filtered.size else 0,
                    onCallAll = { vm.callList(filtered, "Leads") },
                    onSecondChance = { reviveOpen = true; vm.loadSecondChance() },
                )
            }
            // ONE line explaining whatever is selected.
            //
            // CLAUDE.md's rule for this app is that every bucket explains
            // itself — reps said the lead tabs "sometimes don't make sense" and
            // guessing is how a tab stops being trusted. When the two filter
            // blocks went, their hints went with them; this puts the rule back
            // for the cost of a single 16dp line instead of two padded cards.
            if (stageFilter == null && quick == null) {
                val hint = when {
                    bucket.startsWith("act:") ->
                        ACTIONS.firstOrNull { it.code == bucket.removePrefix("act:") }?.hint
                    bucket.startsWith("stage:") -> STAGE_HINTS[bucket.removePrefix("stage:")]
                    bucket == "new" -> STAGE_HINTS["new"]
                    bucket == "hot" -> "Hot leads that are still open. Some are not due yet."
                    bucket == "revive" -> "Said no, or cold after 2+ tries. Worth one fresh call. Never DNC."
                    else -> "Every lead assigned to you, whatever stage it is at."
                }
                if (!hint.isNullOrBlank()) {
                    item { Spacer(Modifier.height(11.dp))
                        Text(hint, style = AppType.footnote, color = AppColors.TextSecondary,
                            modifier = Modifier.padding(horizontal = 4.dp))
                    }
                }
            }
            // The line that taught the swipe gestures is gone with them. Call and
            // WhatsApp are buttons on every row now, so there is nothing left to
            // teach — and a hint for a gesture that no longer exists is worse
            // than no hint at all.
            // Active sheet-filters show as dismissible chips — tap ✕ to clear.
            run {
                val active = buildList {
                    stageFilter?.let { sf -> add(Triple("stage", app.leadStages.firstOrNull { it.code == sf }?.label ?: sf) { stageFilter = null }) }
                    quick?.let { q ->
                        val ql = when (q) {
                            "called" -> "Called today"
                            "today" -> "Added today"
                            "retry" -> "Retry (no answer)"
                            else -> q
                        }
                        add(Triple("quick", ql) { quick = null })
                    }
                    tempFilter?.let { t -> add(Triple("temp", when (t) { "hot" -> "🔥 Hot"; "warm" -> "🌤 Warm"; else -> "❄️ Cold" }) { tempFilter = null }) }
                    if (sortBy != "default") add(Triple("sort", if (sortBy == "score") "AI Score ↓" else "Newest first") { sortBy = "default" })
                }
                if (active.isNotEmpty()) {
                    item { Spacer(Modifier.height(11.dp))
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            active.forEach { (_, label, clear) ->
                                Row(
                                    Modifier.clip(RoundedCornerShape(50))
                                        .background(MaterialTheme.colorScheme.secondaryContainer)
                                        .clickable { clear() }
                                        .padding(horizontal = 12.dp, vertical = 7.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(label, style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSecondaryContainer, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.width(5.dp))
                                    Text("✕", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
                                }
                            }
                        }
                    }
                }
            }
            if (selectMode) {
                item { Spacer(Modifier.height(11.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("${selectedIds.size} selected", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            TextButton(onClick = {
                                selectedIds = if (allSelected) selectedIds - filteredIds else selectedIds + filteredIds
                            }) { Text(if (allSelected) "Clear all" else "Select all (${filteredIds.size})") }
                        }
                    }
                }
            }
            when {
                app.leadsLoading && app.leads.isEmpty() ->
                    item { Spacer(Modifier.height(11.dp)); Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                // An empty Follow-up tab is not "nothing matches your filter" —
                // it is a rep who has no calls waiting, which is the best news
                // the screen can give her. Say that instead of a shrug.
                filtered.isEmpty() && isActionQueue ->
                    item(key = "fu_clear_all") { Spacer(Modifier.height(11.dp)); FollowUpAllClear(0) }
                filtered.isEmpty() ->
                    item { Spacer(Modifier.height(11.dp))
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 40.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                Modifier.size(64.dp).clip(CircleShape).background(IosColors.Fill),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(if (app.leads.isEmpty()) Icons.Default.People else Icons.Default.Search, contentDescription = null,
                                    tint = IosColors.Gray, modifier = Modifier.size(30.dp))
                            }
                            Spacer(Modifier.height(12.dp))
                            Text(if (app.leads.isEmpty()) "No leads yet" else "No leads here",
                                style = AppType.headline, color = AppColors.TextPrimary)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                if (app.leads.isEmpty()) "Ask your admin to assign leads. They will show here, ready to call."
                                else "No lead matches this filter. Pick another filter or clear the search.",
                                style = AppType.footnote,
                                color = AppColors.TextSecondary,
                                modifier = Modifier.padding(horizontal = 24.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            )
                        }
                    }
                else -> {
                    val leadCard: @Composable (Contact) -> Unit = { c ->
                        LeadCard(
                            stages = app.leadStages,
                            work = app.workOf(c),
                            memoryLine = if (isDueNow(app.workOf(c))) rowMemoryLine(c.id?.let { app.memoryByLead[it] }) else null,
                            sayLine = if (isDueNow(app.workOf(c))) focusSayLine(app.coachPicks, c.id) else null,
                            c = c,
                            sharesName = (c.name?.trim()?.lowercase() ?: "") in repeatedNames,
                            followUp = c.id?.let { fuByContact[it] } ?: fuByPhone[c.phone],
                            cloudOn = app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank(),
                            selectMode = selectMode,
                            isSelected = c.id != null && c.id in selectedIds,
                            needsUpdate = c.id != null && c.id in pendingUpdateIds,
                            onToggleSelect = { c.id?.let { id -> selectedIds = if (id in selectedIds) selectedIds - id else selectedIds + id } },
                            onCall = { vm.dialManual(c.phone) },
                            onCloudCall = { c.id?.let { vm.cloudCall(c.phone, it, c.campaignId) } },
                            // Straight into WhatsApp with the message ready, the
                            // way the Follow Ups screen already does it.
                            //
                            // This used to open an in-app chat sheet that sends
                            // through the COMPANY's WhatsApp Cloud number — and
                            // no company on the platform has that token saved,
                            // so its Send button could not work at all. A rep
                            // tapping WhatsApp got a dead box instead of
                            // WhatsApp. The tracked inbox still exists for the
                            // admin; the row button now just does what it says.
                            onWhatsApp = {
                                openRowWhatsApp(
                                    context, vm, c.id, c.phone, app.workOf(c),
                                    waTemplate(c.name, c.companyName, app.profile?.fullName,
                                        app.company?.name, app.profile?.speaksAs),
                                )
                            },
                            whatsAppBusy = c.id != null && c.id == app.waDraftingId,
                            focusReason = app.focusReason(c.id),
                            onQuickOutcome = c.id?.takeIf { it in pendingUpdateIds }?.let { id ->
                                { status: String ->
                                    vm.disposeFromLead(
                                        id, c.phone, c.name, status,
                                        (fuByContact[id] ?: fuByPhone[c.phone])?.id,
                                    )
                                }
                            },
                            // The same prompt the Follow Ups screen opens, and
                            // the same one that appears after a call. There is
                            // exactly one place a stage can be set from, so it
                            // behaves identically wherever the rep reaches it.
                            // The lead's pending callback rides along, so picking
                            // "call back later" here replaces it instead of
                            // stacking a second one on the same lead.
                            onUpdate = {
                                c.id?.let { id ->
                                    vm.openFollowUpUpdate(id, c.phone, c.name,
                                        (fuByContact[id] ?: fuByPhone[c.phone])?.id)
                                }
                            },
                            onOpen = { c.id?.let { vm.openLeadDetail(it) } },
                        )
                    }
                    // The Follow-up tab used to be cut into Call now / Done
                    // today / Booked for later, in-page, because one tab was
                    // doing three jobs and its count never went down however
                    // much work a rep did. Those three are now first-class
                    // chips on the action row — same three groups, same one
                    // clock, except the clock is the database's and the counts
                    // are the ones the dashboard shows.
                    if (dueUnknown && filtered.isEmpty() && (bucket == "act:call_now" || bucket == "act:overdue" || bucket == "followup")) {
                        item(key = "fu_unknown") { Spacer(Modifier.height(11.dp))
                            Text(
                                app.workStatesError ?: "",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    } else if (fuCallNow.isEmpty() && (bucket == "act:call_now" || bucket == "followup") && filtered.isEmpty()) {
                        item(key = "fu_clear") { Spacer(Modifier.height(11.dp)); FollowUpAllClear(app.leads.count { app.actionOf(it) == "scheduled" }) }
                    } else {
                        item(key = "rows_gap") { Spacer(Modifier.height(11.dp)) }
                        // iOS inset-grouped list: one white group, hairline
                        // separators, rounded only at the top and bottom.
                        val lastIdx = filtered.lastIndex
                        itemsIndexed(filtered, key = { _, c -> c.id ?: c.phone }) { i, c ->
                            val r = 12.dp
                            val shape = RoundedCornerShape(
                                topStart = if (i == 0) r else 0.dp, topEnd = if (i == 0) r else 0.dp,
                                bottomStart = if (i == lastIdx) r else 0.dp, bottomEnd = if (i == lastIdx) r else 0.dp,
                            )
                            Column(Modifier.fillMaxWidth().clip(shape).background(AppColors.Surface)) {
                                if (i > 0) IosSeparator(startInset = 67.dp)
                                androidx.compose.runtime.CompositionLocalProvider(LocalGroupedRow provides true) { leadCard(c) }
                            }
                        }
                    }
                }
            }
        }
        }

        // Start-campaign action bar (bulk select → one-tap auto-dial)
        if (selectMode) {
            Surface(shadowElevation = 12.dp, color = MaterialTheme.colorScheme.surface) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${selectedIds.size} lead(s) selected", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("Auto-dials them one after another", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Button(
                        onClick = {
                            val chosen = app.leads.filter { it.id != null && it.id in selectedIds }
                            vm.startSelectedLeads(chosen)
                            exitSelect()
                            onStartCampaign()
                        },
                        enabled = selectedIds.isNotEmpty(),
                    ) {
                        Icon(Icons.Default.PlayArrow, contentDescription = "Play", modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Start Campaign")
                    }
                }
            }
        }
    }

    // The floating "Call N" button is gone (founder, Oct 2026): it repeated
    // "Call all N". Call all now sits on the lane header as a text button.
    }

    if (todayOpen) {
        androidx.compose.material3.ModalBottomSheet(onDismissRequest = { todayOpen = false }) {
            TodayWorkSheet(
                app = app,
                onOpenLead = { id -> todayOpen = false; vm.openLeadDetail(id) },
            )
        }
    }

    // FILTERS — all the fine-grained power, one sheet away.
    if (sheetOpen) {
        androidx.compose.material3.ModalBottomSheet(onDismissRequest = { sheetOpen = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Filters", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    TextButton(onClick = { stageFilter = null; tempFilter = null; quick = null; sortBy = "default" }) { Text("Clear all") }
                }
                Text("Stage", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    app.leadStages.filter { it.repVisible }.forEach { st ->
                        val n = app.leads.count { it.stage == st.code }
                        FilterTab(st.label, n, stageFilter == st.code, parseHex(st.color)) {
                            stageFilter = if (stageFilter == st.code) null else st.code
                            quick = null
                        }
                    }
                }
                Text("Temperature", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("hot" to "Hot", "warm" to "Warm", "cold" to "Cold").forEach { (key, label) ->
                        val on = tempFilter == key
                        Box(
                            Modifier.clip(RoundedCornerShape(50))
                                .background(if (on) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { tempFilter = if (on) null else key }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelMedium,
                                color = if (on) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
                Text("Quick views", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "called" to "Called today",
                        "today" to "Added today",
                        "retry" to "Retry (no answer/busy)",
                    ).forEach { (key, label) ->
                        val on = quick == key
                        Box(
                            Modifier.clip(RoundedCornerShape(50))
                                .background(if (on) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { quick = if (on) null else key; stageFilter = null }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelMedium,
                                color = if (on) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
                Text("Sort", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("default" to "Default", "score" to "AI Score ↓", "recent" to "Newest").forEach { (key, label) ->
                        val on = sortBy == key
                        Box(
                            Modifier.clip(RoundedCornerShape(50))
                                .background(if (on) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { sortBy = key }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelMedium,
                                color = if (on) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
                Button(onClick = { sheetOpen = false }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 24.dp)) {
                    Text("Show ${filtered.size} leads")
                }
            }
        }
    }

    // ── RAG v13 — 💎 Second Chance: AI-mined revivable leads from the dead pile ──
    if (reviveOpen) {
        val leadsById = remember(app.leads) { app.leads.associateBy { it.id } }
        androidx.compose.material3.ModalBottomSheet(onDismissRequest = { reviveOpen = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Second Chance", style = AppType.title, color = AppColors.TextPrimary)
                        Text("An old \"no\" + a new offer = today's deal",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (!app.reviveLoading) {
                        Text("Refresh", style = MaterialTheme.typography.labelMedium, color = Green,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable { vm.loadSecondChance(force = true) }.padding(6.dp))
                    }
                }
                Spacer(Modifier.height(12.dp))
                when {
                    app.reviveLoading -> Row(Modifier.padding(vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Green)
                        Spacer(Modifier.width(10.dp))
                        Text("Reading your dead leads and fresh offers…",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    app.revivePicks.isEmpty() -> Text(
                        "Nothing worth reviving right now. As new offers and prices land in your company's knowledge, the AI will find matches here.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                    else -> Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        app.revivePicks.forEach { p ->
                            val c = leadsById[p.id] ?: return@forEach
                            Column(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                                    .padding(12.dp),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(c.name ?: prettyPhone(c.phone), style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f))
                                    budgetLabel(c.budget)?.let {
                                        Text("₹ $it", style = MaterialTheme.typography.labelMedium, color = Green, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                                if (p.reason.isNotBlank()) {
                                    Spacer(Modifier.height(3.dp))
                                    Text(p.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                                }
                                if (p.opener.isNotBlank()) {
                                    Spacer(Modifier.height(8.dp))
                                    Column(
                                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                            .background(Green.copy(alpha = 0.08f)).padding(10.dp),
                                    ) {
                                        Text("Say this", style = AppType.metaStrong, color = AppColors.TextSecondary)
                                        Spacer(Modifier.height(3.dp))
                                        Text(p.opener, style = MaterialTheme.typography.bodySmall, lineHeight = 18.sp)
                                    }
                                }
                                Spacer(Modifier.height(9.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        Modifier.clip(RoundedCornerShape(50)).background(Green)
                                            .clickable { vm.dialManual(c.phone) }.padding(horizontal = 18.dp, vertical = 8.dp),
                                    ) { Text("Call", color = Color.White, style = AppType.label) }
                                    Spacer(Modifier.width(12.dp))
                                    Text("WhatsApp", style = MaterialTheme.typography.labelMedium, color = WaGreen,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.clickable { openWhatsApp(context, c.phone, p.opener.takeIf { it.isNotBlank() }) }.padding(4.dp))
                                    Spacer(Modifier.width(12.dp))
                                    Text("Open", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.clickable { reviveOpen = false; c.id?.let { vm.openLeadDetail(it) } }.padding(4.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    actionFor?.let { c ->
        LeadActionSheet(
            stages = app.leadStages,
            c = c,
            onDismiss = { actionFor = null },
            onApply = { status, temp, budget, note, svProj, svAt, token, name ->
                c.id?.let { vm.applyLead(it, status, temp, budget, note, svProj, svAt, token, name) }
                actionFor = null
            },
            onShareContent = { actionFor = null; contentFor = c },
            onProjects = { actionFor = null; projectsFor = c },
            onArrived = { c.id?.let { vm.arriveAtSite(c) } },
            onHandOver = { actionFor = null; handOverFor = c },
        )
    }
    handOverFor?.let { c ->
        HandOverDialog(vm = vm, c = c, onDismiss = { handOverFor = null })
    }
    contentFor?.let { c ->
        ContentShareDialog(vm = vm, contact = c, onDismiss = { contentFor = null })
    }
    projectsFor?.let { c ->
        ProjectInterestsDialog(vm = vm, contact = c, onDismiss = { projectsFor = null })
    }
    scheduleFor?.let { c ->
        ScheduleFollowUpDialog(
            who = c.name ?: c.phone,
            onDismiss = { scheduleFor = null },
            onPick = { millis, note ->
                vm.scheduleFollowUp(c.id, c.phone, c.name, millis, note)
                scheduleFor = null
            },
        )
    }
    app.waChatContact?.let { c ->
        WhatsAppChatDialog(
            who = c.name ?: c.phone,
            phone = c.phone,
            thread = app.waThread,
            loading = app.waLoading,
            sending = app.waSending,
            error = app.waError,
            onSend = { vm.sendWa(it) },
            onOpenPhoneApp = { openWhatsApp(context, c.phone) },
            onDismiss = { vm.closeWaChat() },
        )
    }
}

/**
 * In-app WhatsApp chat for a lead. Messages go through the company number
 * (tracked for the admin). If the number isn't connected yet, the rep can fall
 * back to the phone's WhatsApp app.
 */
@Composable
private fun WhatsAppChatDialog(
    who: String,
    phone: String,
    thread: List<WhatsAppMessage>,
    loading: Boolean,
    sending: Boolean,
    error: String?,
    onSend: (String) -> Unit,
    onOpenPhoneApp: () -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    val waGreen = Color(0xFF25D366)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("WhatsApp · $who") },
        text = {
            Column {
                when {
                    loading -> Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    thread.isEmpty() -> Text("No messages yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else -> Column(
                        Modifier.fillMaxWidth().heightIn(max = 280.dp).verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        thread.forEach { m ->
                            val out = m.direction == "out"
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = if (out) Arrangement.End else Arrangement.Start) {
                                Box(
                                    Modifier.clip(RoundedCornerShape(10.dp))
                                        .background(if (out) waGreen.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant)
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                ) { Text(m.body ?: "", style = MaterialTheme.typography.bodyMedium) }
                            }
                        }
                    }
                }
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = onOpenPhoneApp) { Text("Open in WhatsApp app instead") }
                }
                Spacer(Modifier.height(10.dp))
                // Quick template chips — 1 tap fills the draft.
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(
                        "Hello" to "Hi $who, this is calling from our team. How can I help you today?",
                        "Brochure" to "Hi $who, I'm sharing our project brochure with you. Please check and let me know if you have any questions.",
                        "Meeting" to "Hi $who, shall we schedule a site visit? Please let me know a convenient date and time.",
                    ).forEach { (label, template) ->
                        Box(
                            Modifier.clip(RoundedCornerShape(50))
                                .background(Color(0xFF25D366).copy(alpha = 0.12f))
                                .clickable { draft = template }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelMedium, color = Color(0xFF25D366), fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    draft, { draft = it },
                    placeholder = { Text("Type a message…") },
                    modifier = Modifier.fillMaxWidth(), maxLines = 4,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSend(draft); draft = "" },
                enabled = draft.isNotBlank() && !sending,
            ) { Text(if (sending) "Sending…" else "Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

/** Small tinted status pill used on lead cards (stage / temperature / date). */
@Composable
private fun LeadMiniChip(label: String, color: Color) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** True when a LeadCard is drawn as a row inside an iOS inset-grouped list. */
internal val LocalGroupedRow = androidx.compose.runtime.staticCompositionLocalOf { false }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadCard(
    c: Contact,
    /** The canonical stage rows. The card renders a stage's label and colour;
     *  it does not get to decide either. Empty only in previews. */
    stages: List<LeadStage> = emptyList(),
    /** This lead's row from v_lead_workstate: what to do now, and the last real
     *  call against it. */
    work: LeadWork? = null,
    /** Stored thread, only passed for a due lead. */
    memoryLine: String? = null,
    /** Focus-five opener, only passed for a due lead that was picked. */
    sayLine: String? = null,
    followUp: FollowUp? = null,
    cloudOn: Boolean,
    selectMode: Boolean = false,
    isSelected: Boolean = false,
    /** This lead was just called and nothing was recorded — its Update shakes. */
    needsUpdate: Boolean = false,
    /** Another lead in the same list has the exact same name — show the last
     *  four digits beside it so the rep can tell which person this is. */
    sharesName: Boolean = false,
    /** focus-five's line, when this lead is one of today's picks. */
    focusReason: String? = null,
    /** True while the owed-message draft is being written. */
    whatsAppBusy: Boolean = false,
    /** One tap for a call that never connected. Null hides the chips. */
    onQuickOutcome: ((String) -> Unit)? = null,
    onToggleSelect: () -> Unit = {},
    onCall: () -> Unit,
    onCloudCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onUpdate: () -> Unit,
    onOpen: () -> Unit = {},
) {
    // The stage is deliberately NOT on the card any more. It said "Contacted"
    // on 140 of a rep's leads — true, and no help in deciding whether to ring
    // one. The action label in the note strip answers that, and the stage row
    // above the list is where you go when you want to browse by stage.
    val container = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.07f) else MaterialTheme.colorScheme.surface
    val jade = AppColors.Indigo
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    // The one line the rep actually needs — what the customer said / promised.
    val now = System.currentTimeMillis()
    val visitMs = c.siteVisitAt?.let { instantMillis(it) }
    // Pulled out rather than tested through the safe call inline: a local val
    // is smart-cast with no argument, and this line is read far more often
    // than it is written.
    val signal = dueSignal(work, focusReason)
    val hardSignal = work?.waitingSince != null ||
        (work?.promiseDueSince != null && !work.promiseText.isNullOrBlank())
    val diaryNote = (followUp?.note ?: "").trim()
    val weakDiary = followUp == null || diaryNote.isEmpty() || diaryNote == AUTO_CALLBACK_NOTE
    val intent: Pair<String, Color>? = when {
        // Buyer waiting and a broken promise outrank a diary note. Focus and
        // "never picked up" outrank only an empty note or the 11 AM the app
        // invented — a sentence she actually wrote stays.
        signal != null && (hardSignal || weakDiary) -> signal to (if (hardSignal) Red else muted)
        followUp != null -> {
            val late = (instantMillis(followUp.dueAt) ?: Long.MAX_VALUE) <= now
            // WHY this lead is waiting, not just that it is.
            //
            // "↻ Call back · Overdue 3d" told a rep the clock and nothing else,
            // so opening Follow-up felt like a list of strangers — "ye yahan kyun
            // hai". The app always knew who booked it and what was said; the note
            // carries that and was simply never shown here.
            val note = (followUp.note ?: "").trim()
            val why = when {
                note.startsWith("AI:", ignoreCase = true) ->
                    note.removePrefix("AI:").removePrefix("ai:").trim()
                note.contains("Attempt", ignoreCase = true) -> "Nobody picked up"
                note.isNotEmpty() -> note
                else -> "You promised a call back"
            }
            val whenText = if (late) relativeDue(followUp.dueAt)
                           else "${dayLabel(followUp.dueAt)} ${timeOnly(followUp.dueAt)}"
            "$why · $whenText" to (if (late) Red else jade)
        }
        visitMs != null && visitMs >= now -> "Site visit · ${dayLabel(c.siteVisitAt)}" to Purple
        // The same "a passed date is not attendance" rule Home uses. This line
        // was the second place claiming a visit had happened when all that had
        // happened was the date going by, and it is the one a rep reads on every
        // single row. Done needs the on-site check-in or a stage that only
        // follows a real visit; otherwise it asks.
        visitMs != null && !isFinished(stages, c.stage) &&
            c.siteVisitArrivedAt != null && c.siteVisitOutcome.isNullOrBlank() &&
            c.status !in AFTER_VISIT && c.stage !in setOf("negotiation", "token_paid", "won") ->
            "They came. The outcome is not written." to Amber
        visitMs != null && !isFinished(stages, c.stage) &&
            (c.siteVisitArrivedAt != null || c.status in AFTER_VISIT) ->
            "Visit done — close them" to Teal
        visitMs != null && !isFinished(stages, c.stage) ->
            "Visit day gone (${dayLabel(c.siteVisitAt)}) — did they come?" to Amber
        !c.aiNextAction.isNullOrBlank() -> c.aiNextAction!! to Indigo
        !c.notes.isNullOrBlank() -> c.notes!! to muted
        // (budget lives on the phone line now — never repeated here)
        else -> null
    }
    val (tempLabel, tempColor) = when (c.temperature) {
        "hot" -> "Hot" to Red
        "warm" -> "Warm" to Amber
        "cold" -> "Cold" to Slate
        else -> "" to Slate
    }

    // No swipe.
    //
    // Swipe-right called and swipe-left opened WhatsApp. On a fast-scrolling
    // list that is a trap: the gesture that scrolls and the gesture that dials a
    // customer differ only by angle, and reps were setting calls off by accident
    // all day. A dialler you can trigger by mis-scrolling is not a shortcut.
    //
    // WhatsApp was ONLY reachable by that swipe, so it becomes a button next to
    // Call — visible instead of hidden, and impossible to trigger by dragging.
    //
    // It also makes the list cheaper: every row was carrying a
    // SwipeToDismissBox, which means an anchored-draggable state and a whole
    // background layer per lead, composed and measured whether or not anyone
    // ever swipes.
    // THE CARD, LAID OUT THE WAY A REP READS IT.
    //
    // Actions used to live in a right-hand column: temperature on top, then a
    // WhatsApp circle, then Call. That column is what the floating AI bubble
    // kept landing on — it sat directly over a card's Call button — and it also
    // squeezed the text column so the note and the project name never had room.
    //
    // They move to a full-width row along the bottom instead. Nothing floats
    // over them, the note gets the whole card width, and Call is a filled bar
    // that cannot be mistaken for anything else.
    // WHERE ONE LEAD ENDS AND THE NEXT BEGINS.
    //
    // White cards on a near-white page separated only by a 7dp gap: at a
    // glance the list read as one continuous sheet, and a rep scanning fast
    // could not tell whose phone number belonged to whom. A hairline border
    // plus a wider gap draws the boundary without adding a heavy shadow or a
    // divider line of its own.
    // URGENCY LIVES ON THE EDGE OF THE CARD, NOT INSIDE IT.
    //
    // A rep scrolling a list of three hundred is not reading; they are scanning
    // for the ones that are on fire. A 3dp stripe in the action state's own
    // colour answers that at the speed of a glance, and it does it in the one
    // place nothing else is competing for — so the inside of the card can drop
    // back to plain graphite and be READ instead of decoded.
    //
    // Only states that ask for something get a stripe. A lead booked for next
    // Tuesday is not urgent and gets nothing, which is what makes the coloured
    // ones mean anything.
    val urgency = when (work?.actionState) {
        // Restraint (founder, Oct 2026): only late work gets a colour. The
        // state itself is still written on every row.
        "overdue" -> Red
        else -> null
    }
    // Inside the Leads inset-grouped list the group draws the white cell and
    // the hairline; the row itself is flat. Elsewhere it stays a card.
    val grouped = LocalGroupedRow.current
    Row(
        Modifier.fillMaxWidth()
            .then(
                if (grouped) Modifier.background(container)
                else Modifier.clip(RoundedCornerShape(14.dp)).background(container)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f), RoundedCornerShape(14.dp)),
            )
            .then(if (selectMode) Modifier.clickable { onToggleSelect() } else Modifier.clickable { onOpen() })
            .height(IntrinsicSize.Min),
    ) {
        Box(
            Modifier.width(3.dp).fillMaxHeight()
                .background(urgency ?: Color.Transparent),
        )
    Column(
        Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            // Initials avatar — calm graphite by default. The only colour it can
            // wear is a temperature ring on a hot/warm lead.
            val ring = when (c.temperature) { "hot" -> Red; "warm" -> Amber; else -> null }
            val discInk = MaterialTheme.colorScheme.onSurfaceVariant
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                    .background(discInk.copy(alpha = 0.08f))
                    .then(ring?.let { Modifier.border(2.dp, it, RoundedCornerShape(12.dp)) } ?: Modifier),
                contentAlignment = Alignment.Center,
            ) {
                Text(initialsOf(c.name), style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold, color = ring ?: discInk)
            }
            Spacer(Modifier.width(11.dp))

            Column(Modifier.weight(1f)) {
                // Name, temperature, age — one line, and the NAME gets the room.
                // It used to compete with the stage and the age at maxLines = 1,
                // which rendered "Pooja" as "Pooj" and one lead as the single
                // letter "N".
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        prettyName(c.name) ?: prettyPhone(c.phone),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    // The four digits that make this Manoj a different Manoj.
                    // Unweighted, so it takes only the width it needs and the
                    // name keeps the rest — and `fill = false` above lets a
                    // short name shrink to its text instead of pushing this off
                    // to the far edge, where it would read as a separate column
                    // rather than part of the name.
                    if (sharesName) {
                        Text(
                            " ·${last4(c.phone)}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold, color = jade, maxLines = 1,
                        )
                    }
                    if (tempLabel.isNotEmpty()) {
                        Spacer(Modifier.width(6.dp))
                        Text(tempLabel, fontSize = 10.sp, color = tempColor, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                    // WHEN THIS LEAD ACTUALLY ARRIVED, to the minute.
                    //
                    // "Today" was shown for a lead that came in at 9am and one
                    // that came in four minutes ago. On a morning when thirty
                    // arrive, that word tells a rep nothing about which to ring
                    // first, and nothing that helps them remember which lead
                    // this was.
                    (c.createdAt ?: c.assignedAt)?.let {
                        Spacer(Modifier.width(6.dp))
                        Text(arrivedLabel(it), fontSize = 10.sp, color = muted, maxLines = 1)
                    }
                }
                // WHAT THIS CUSTOMER ACTUALLY SAID, on one line.
                //
                // The card used to print the budget and stop, so two leads who
                // wanted completely different things looked identical — same
                // avatar, same money, same three buttons. Everything else they
                // told the form was sitting in extra.raw_fields, unread.
                //
                // Money keeps the lead position and the strongest weight (it is
                // what a rep sorts by), and the rest follow as quiet chips in
                // the order the form asked them.
                val money = budgetLabel(c.budget)
                val answers = remember(c.id, c.extra, c.budget) { leadAnswers(c) }
                if (money != null || answers.isNotEmpty()) {
                    Spacer(Modifier.height(3.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        money?.let {
                            // Graphite, not indigo. Indigo in this app means
                            // "you can act on this" — it is the Call button's
                            // colour. A budget is the loudest FACT on the card,
                            // not a control, and printing it in the action
                            // colour on every row taught the eye to ignore
                            // indigo. Weight carries it instead.
                            Text("₹ $it", style = MaterialTheme.typography.bodyMedium,
                                color = AppColors.TextPrimary,
                                fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                        answers.take(3).forEach { (label, value) ->
                            Box(
                                Modifier.clip(RoundedCornerShape(6.dp))
                                    .background(muted.copy(alpha = 0.09f))
                                    .padding(horizontal = 7.dp, vertical = 2.dp),
                            ) {
                                Text(
                                    if (label == null) value else "$label · $value",
                                    fontSize = 11.sp, color = muted, fontWeight = FontWeight.Medium,
                                    maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(prettyPhone(c.phone), fontSize = 11.5.sp, color = muted.copy(alpha = 0.75f),
                        letterSpacing = 0.2.sp, maxLines = 1)
                    if (c.attempts > 0) {
                        val due = followUp?.let { instantMillis(it.dueAt) }
                        Text("  ${c.attempts + 1} tries", fontSize = 12.sp,
                            color = if (due != null && due <= now) Red else Amber,
                            fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                    c.closeProbability?.let { pct ->
                        Text("  $pct%", fontSize = 12.sp,
                            color = if (pct >= 60) Teal else if (pct >= 40) Amber else Slate,
                            fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                }
                // DID WE ACTUALLY TALK, AND FOR HOW LONG.
                //
                // The card said nothing about the last call, so a three-second
                // misdial and a twelve-minute conversation looked identical —
                // 170 of the 419 called leads in this database are under thirty
                // seconds. A rep about to dial needs to know which kind this
                // was before they open with "as I was saying".
                lastCallLine(work)?.let { (text, tint) ->
                    // Ellipsis because this line is the longest one on the card
                    // and the only one built from three variable parts: "📞 No
                    // talk (1h 05m) · 3 days ago · 12 calls" is wider than the
                    // text column on a 4-inch phone, and maxLines=1 with no
                    // overflow set cuts it mid-word rather than saying so.
                    Text(text, fontSize = 11.5.sp, color = tint,
                        fontWeight = FontWeight.Medium, maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
                // Project and area. Two lines, because real project names are
                // long and "Kunj Vihari, Bridge Vat…" tells a rep less than
                // nothing — they cannot tell which of two sites this lead asked
                // about.
                // STAGE, PROJECT, AREA — one muted line, no colour.
                //
                // Stage was taken off this card once for a good reason: it read
                // "Contacted" on a hundred and forty leads and helped nobody
                // decide anything. It comes back because a rep does need to know
                // where a deal stands — but as plain grey text beside the
                // project, not as a tenth coloured pill. Colour on this card now
                // means exactly one thing: urgency, on the edge stripe. A stage
                // is context; it does not get to shout.
                val stageLabel = stages.firstOrNull { it.code == c.stage }
                    ?.let { it.shortLabel.ifBlank { it.label } }
                    ?.takeIf { c.stage != "new" }        // "New" is already said by the arrival time
                val extras = listOfNotNull(
                    stageLabel,
                    c.companyName?.takeIf { it.isNotBlank() },
                    c.territory?.takeIf { it.isNotBlank() },
                )
                if (extras.isNotEmpty()) {
                    Text(extras.joinToString("  ·  "), fontSize = 12.sp, color = muted,
                        maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
            }

            if (selectMode) {
                Spacer(Modifier.width(8.dp))
                val selRing = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
                Box(
                    Modifier.size(24.dp).clip(CircleShape)
                        .background(if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent)
                        .border(2.dp, selRing, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isSelected) Icon(Icons.Default.Check, contentDescription = "Selected",
                        tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(14.dp))
                }
            }
        }

        // What to do, and why — the note, three lines, full card width. This is
        // the line a rep reads to decide whether to ring, so it gets the space.
        intent?.let { (label, color) ->
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                    .background(color.copy(alpha = 0.09f))
                    .padding(horizontal = 9.dp, vertical = 7.dp),
                verticalAlignment = Alignment.Top,
            ) {
                ACTIONS.firstOrNull { it.code == work?.actionState }?.let { a ->
                    Text(a.label, fontSize = 11.sp, color = a.color,
                        fontWeight = FontWeight.Bold, maxLines = 1)
                    Spacer(Modifier.width(7.dp))
                }
                Text(label, fontSize = 12.sp, color = color, fontWeight = FontWeight.Medium,
                    lineHeight = 16.sp, maxLines = 3,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            }
        }
        // The why line above is the clock. This is the conversation, which
        // stays useful after the morning focus list has gone quiet.
        listOfNotNull(memoryLine, sayLine).forEach { line ->
            Spacer(Modifier.height(4.dp))
            Text(
                line, fontSize = 12.sp, color = AppColors.TextSecondary,
                lineHeight = 16.sp, maxLines = 2,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }

        if (!selectMode) {
            Spacer(Modifier.height(9.dp))
            // The call just ended and nobody picked up. The answer is on the
            // card — Update still opens the full sheet for a real conversation.
            if (needsUpdate && onQuickOutcome != null) {
                Text("What happened?", style = AppType.meta, color = muted)
                Spacer(Modifier.height(6.dp))
                QuickOutcomeChips(onQuickOutcome)
                Spacer(Modifier.height(8.dp))
            }
            // ONE ACTION ROW, full width. Update shakes when this lead's call
            // has just ended with nothing written down — that wobble is the
            // whole replacement for the post-call popup on SIM calls.
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Hairline on white, matching the Follow Ups card and the Update
                // sheet's tiles. It was a lavender slab, which on a list of
                // three hundred rows put a soft purple block beside every
                // indigo Call — two filled shapes per row, competing.
                val needsInk = if (needsUpdate) Amber else AppColors.TextPrimary
                Row(
                    Modifier.nudgeShake(needsUpdate).weight(1f).height(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (needsUpdate) Amber.copy(alpha = 0.14f) else AppColors.Surface)
                        .border(1.dp, if (needsUpdate) Amber else AppColors.Border, RoundedCornerShape(12.dp))
                        .clickable { onUpdate() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(if (needsUpdate) "Update call" else "Update", fontSize = 13.sp,
                        color = needsInk, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
                Spacer(Modifier.width(7.dp))
                // ONE FILLED BUTTON PER CARD.
                //
                // Update was lavender, WhatsApp was a green block and Call was
                // solid blue — three tinted slabs of near-equal weight, times
                // three hundred and twenty-one leads. Nothing on the screen said
                // "do this one", and the green fought the brand on every row.
                //
                // WhatsApp is a square icon now: same tap target, no shouting,
                // and the width it gives up goes to Call. It is still visible —
                // it was only ever reachable by a swipe before this.
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                        .background(AppColors.Surface)
                        .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
                        .clickable(enabled = !whatsAppBusy) { onWhatsApp() },
                    contentAlignment = Alignment.Center,
                ) {
                    if (whatsAppBusy) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = WaGreen)
                    } else {
                        Icon(Icons.Default.Chat, contentDescription = "WhatsApp", tint = WaGreen,
                            modifier = Modifier.size(17.dp))
                    }
                }
                Spacer(Modifier.width(7.dp))
                // Calling is the job. The only filled button on the card.
                Row(
                    Modifier.weight(1.6f).height(52.dp).clip(RoundedCornerShape(12.dp))
                        .background(jade)
                        .clickable { if (cloudOn) onCloudCall() else onCall() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Default.Call, contentDescription = "Call", tint = Color.White, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Call", fontSize = 16.sp, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }
    }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadActionSheet(
    /** The canonical stage rows — the sheet renders them, it does not define them. */
    stages: List<LeadStage>,
    c: Contact,
    onDismiss: () -> Unit,
    /** stage, temperature, budget, note, siteVisitProject, siteVisitAt, token, name */
    onApply: (String?, String?, String?, String?, String?, String?, String?, String?) -> Unit,
    onShareContent: () -> Unit = {},
    onProjects: () -> Unit = {},
    onArrived: () -> Unit = {},
    onHandOver: () -> Unit = {},
) {
    // The rep can fix the name here. Imports arrive with blanks, initials and
    // "Unknown", and until now the only person who could correct that was an
    // admin on the web — so a lead the rep speaks to every week stayed nameless
    // on the one screen they actually use.
    var leadName by remember(c.id) { mutableStateOf(c.name ?: "") }
    var stage by remember(c.id) { mutableStateOf<String?>(null) }
    var temp by remember(c.id) { mutableStateOf<String?>(null) }
    var budget by remember(c.id) { mutableStateOf(c.budget ?: "") }
    var note by remember(c.id) { mutableStateOf(c.notes ?: "") }
    var svProject by remember(c.id) { mutableStateOf(c.siteVisitProject ?: "") }
    var svAt by remember(c.id) { mutableStateOf(c.siteVisitAt ?: "") }
    var token by remember(c.id) { mutableStateOf(c.tokenAmount?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: "") }
    val context = androidx.compose.ui.platform.LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(c.name ?: c.phone) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    leadName, { leadName = it },
                    label = { Text("Customer name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Text("Stage", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SETTABLE_STAGES.forEach { (key, label) ->
                        val on = (stage ?: c.status) == key
                        Box(Modifier.clip(RoundedCornerShape(50))
                            .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { stage = key }.padding(horizontal = 10.dp, vertical = 6.dp)) {
                            Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Temperature", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TEMPERATURES.forEach { (key, label) ->
                        val on = (temp ?: c.temperature) == key
                        Box(Modifier.clip(RoundedCornerShape(50))
                            .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { temp = key }.padding(horizontal = 10.dp, vertical = 6.dp)) {
                            Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                if ((stage ?: c.status) == "site_visit") {
                    OutlinedTextField(svProject, { svProject = it }, label = { Text("Site Visit Project") },
                        singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = {
                        val cal = java.util.Calendar.getInstance()
                        android.app.DatePickerDialog(
                            context,
                            { _, y, m, d ->
                                android.app.TimePickerDialog(
                                    context,
                                    { _, hr, min ->
                                        val chosen = java.time.LocalDateTime.of(y, m + 1, d, hr, min)
                                        svAt = chosen.atZone(java.time.ZoneId.systemDefault()).toInstant().toString()
                                    },
                                    cal.get(java.util.Calendar.HOUR_OF_DAY),
                                    cal.get(java.util.Calendar.MINUTE),
                                    false
                                ).show()
                            },
                            cal.get(java.util.Calendar.YEAR),
                            cal.get(java.util.Calendar.MONTH),
                            cal.get(java.util.Calendar.DAY_OF_MONTH)
                        ).show()
                    }, modifier = Modifier.fillMaxWidth()) {
                        Text(if (svAt.isBlank()) "📅 Pick Date & Time" else "📅 Scheduled: ${svAt.substring(0, 16).replace('T', ' ')}")
                    }
                    Spacer(Modifier.height(8.dp))
                    // Geo-fenced arrival: verifies the rep is physically at the project.
                    Button(
                        onClick = onArrived,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Teal),
                    ) { Text("📍 Arrived at Site (verify GPS)") }
                    if (c.siteVisitArrivedAt != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            if (c.siteVisitVerified == true) "✅ Verified on site${c.siteVisitDistanceM?.let { " · ${it} m from pin" } ?: ""}"
                            else "⚠️ Last check-in was off-site${c.siteVisitDistanceM?.let { " · ${it} m away" } ?: ""}",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (c.siteVisitVerified == true) Green else Red,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                }
                // The money question, asked on BOOKED as well as Token Paid.
                //
                // It used to appear only on "Token Paid" — a stage no rep has
                // ever used. Across 738 leads and two months there is not one
                // token_paid row, not one booked row, and token_amount is empty
                // on every single lead. So the one field that turns this CRM
                // from a dialler into a sales system was hidden behind a step
                // nobody takes, and a rep marking a deal WON was never once
                // asked what it was worth.
                //
                // Not mandatory. A rep who has genuinely closed a deal must be
                // able to record that fact at 9pm without knowing the exact
                // figure, and a form that refuses to save is a form that sends
                // them back to writing it on paper. It says what the blank
                // costs instead, which is the honest way round.
                // "Money has moved" — lead_stages.counts_as_sale, the same flag the
                // revenue reports use, instead of a fourth copy of this pair.
                val bookingStage = stages.any {
                    it.code == (stage ?: c.stage) && it.countsAsSale
                }
                if (bookingStage) {
                    OutlinedTextField(
                        token, { token = it.filter { ch -> ch.isDigit() } },
                        label = { Text("Token / booking amount (₹)") },
                        leadingIcon = { Text("₹", style = MaterialTheme.typography.titleMedium) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (token.isBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Put the amount in. The owner's daily report counts this — blank means the sale shows as ₹0.",
                            style = MaterialTheme.typography.labelMedium,
                            color = Amber,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                }
                OutlinedTextField(budget, { budget = it }, label = { Text("Budget (e.g. ₹45L)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(note, { note = it }, label = { Text("Notes / requirement") },
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onProjects, modifier = Modifier.weight(1f)) { Text("🏢 Projects") }
                    OutlinedButton(onClick = onShareContent, modifier = Modifier.weight(1f)) { Text("📚 Share content") }
                }
                Spacer(Modifier.height(8.dp))
                // Hand the lead to a colleague. On leave, on a site visit, or
                // simply the wrong person for this customer — a rep should be
                // able to pass it on without ringing the office.
                OutlinedButton(onClick = onHandOver, modifier = Modifier.fillMaxWidth()) {
                    Text("🤝 Give to a teammate")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onApply(
                    stage,
                    temp,
                    budget.trim().ifBlank { null }.takeIf { it != c.budget },
                    note.trim().ifBlank { null }.takeIf { it != c.notes },
                    svProject.trim().ifBlank { null }.takeIf { it != c.siteVisitProject },
                    svAt.trim().ifBlank { null }.takeIf { it != c.siteVisitAt },
                    token.trim().ifBlank { null },
                    leadName.trim().ifBlank { null }.takeIf { it != c.name },
                )
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/**
 * Give this lead to somebody else on the team.
 *
 * Two taps, and the second one says out loud what it does. A rep handing over a
 * customer needs to know the callback goes too — otherwise they keep the
 * reminder in their head "just in case", which is the same as not handing it
 * over at all.
 */
@Composable
internal fun HandOverDialog(vm: MainViewModel, c: Contact, onDismiss: () -> Unit) {
    val app by vm.state.collectAsState()
    var picked by remember { mutableStateOf<Teammate?>(null) }
    // Cached names are fine to reuse; an empty list is not, because "nobody is
    // on your team" and "the fetch failed" look identical once it is on screen.
    LaunchedEffect(Unit) { vm.loadTeammates(force = app.teammates.isEmpty()) }

    val who = picked
    AlertDialog(
        onDismissRequest = { if (!app.handingOver) onDismiss() },
        title = { Text(if (who == null) "Give this lead to" else "Give to ${who.fullName}?") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (who == null) {
                    Text(
                        "${c.name ?: c.phone} moves to their list. Pick who.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    when {
                        app.teammatesLoading && app.teammates.isEmpty() ->
                            Text("Loading your team…", style = MaterialTheme.typography.bodyMedium)
                        // Two different sentences, never the same one. Telling a
                        // rep "nobody is on your team" when the list simply did
                        // not load sends them to the office to ask a question
                        // that has no answer.
                        app.teammatesFailed && app.teammates.isEmpty() ->
                            Text(
                                "Couldn't load your team. Check your internet and open this again.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Amber,
                            )
                        app.teammates.isEmpty() ->
                            Text(
                                "There is nobody else in your team yet. Ask the office to add a telecaller first.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        else -> app.teammates.forEach { t ->
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                    .clickable { picked = t }
                                    .padding(horizontal = 12.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("👤", style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.width(10.dp))
                                Text(t.fullName, style = MaterialTheme.typography.bodyLarge)
                            }
                        }
                    }
                } else {
                    // The whole point of the feature, in the two lines that matter.
                    Text(
                        "${c.name ?: c.phone} and its next call both go to ${who.fullName}.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "The lead leaves your list. Your old calls and notes on it stay yours.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            if (who != null) {
                TextButton(
                    enabled = !app.handingOver,
                    onClick = { c.id?.let { vm.handOverLead(it, who) }; onDismiss() },
                ) { Text(if (app.handingOver) "Giving…" else "Give the lead") }
            }
        },
        dismissButton = {
            TextButton(enabled = !app.handingOver, onClick = { if (who != null) picked = null else onDismiss() }) {
                Text(if (who != null) "Back" else "Cancel")
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleFollowUpDialog(who: String, onDismiss: () -> Unit, onPick: (Long, String?) -> Unit) {
    var note by remember { mutableStateOf("") }
    val now = java.time.ZonedDateTime.now()
    fun at(days: Long, hour: Int) = now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    val options = listOf(
        "In 1 hour" to now.plusHours(1).toInstant().toEpochMilli(),
        "In 3 hours" to now.plusHours(3).toInstant().toEpochMilli(),
        "Tomorrow 10 AM" to at(1, 10),
        "Tomorrow 4 PM" to at(1, 16),
        "In 2 days, 11 AM" to at(2, 11),
        "Next week" to at(7, 10),
    )

    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var pickedDate by remember { mutableStateOf<Long?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Schedule follow-up · $who") },
        text = {
            Column {
                OutlinedTextField(note, { note = it }, label = { Text("Note (e.g. send brochure)") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                Text("When should we remind you?", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                options.forEach { (label, millis) ->
                    OutlinedButton(onClick = { onPick(millis, note.ifBlank { null }) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) { Text(label) }
                }
                Spacer(Modifier.height(2.dp))
                // Custom date + time, for anything the presets don't cover.
                Button(onClick = { showDate = true }, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Pick a date & time")
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (showDate) {
        val dps = rememberDatePickerState(initialSelectedDateMillis = now.toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = { pickedDate = dps.selectedDateMillis; showDate = false; showTime = true }) { Text("Next") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = dps) }
    }

    if (showTime) {
        val tps = rememberTimePickerState(initialHour = 10, initialMinute = 0, is24Hour = false)
        AlertDialog(
            onDismissRequest = { showTime = false },
            title = { Text("Pick a time") },
            text = { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TimePicker(state = tps) } },
            confirmButton = {
                TextButton(onClick = {
                    val base = pickedDate ?: now.toInstant().toEpochMilli()
                    val day = java.time.Instant.ofEpochMilli(base).atZone(java.time.ZoneId.of("UTC")).toLocalDate()
                    val millis = day.atTime(tps.hour, tps.minute).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                    showTime = false
                    onPick(millis, note.ifBlank { null })
                }) { Text("Set reminder") }
            },
            dismissButton = { TextButton(onClick = { showTime = false }) { Text("Back") } },
        )
    }
}

// ════════════════════════════════════════════════════════════
//  POST-CALL DISPOSITION (appears after every cloud call)
// ════════════════════════════════════════════════════════════
@Composable
fun PostCallDispositionSheet(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val who = app.postCallName ?: app.postCallPhone ?: return
    val connected = app.postCallConnected
    // Opened by hand from a follow-up's Update button rather than by a call
    // ending. Same questions, one difference: it can be closed. A prompt the
    // rep opened themselves must never trap them — that lock exists to stop a
    // REAL call going unrecorded, and there was no call here.
    val manual = app.postCallManual
    // Which flow the schedule chips are serving: plain callback vs. an
    // Interested lead whose next touch we refuse to leave unscheduled.
    var scheduleFor by remember { mutableStateOf<String?>(null) }
    // Interested asks for a visit day first. This flips that to a callback.
    var callInstead by remember { mutableStateOf(false) }
    // "Site visit" opens the date picker rather than moving the lead silently.
    var visitPickOpen by remember { mutableStateOf(false) }
    // Optional temperature + note captured in the SAME step as the outcome, so a
    // good call ("Interested, hot, wants corner plot") is one screen, not five.
    var temp by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    fun dispose(status: String) = vm.postCallDispose(status, temp, note)
    // Last conversation context — the rep should never have to remember it.
    val lead = app.postCallContactId?.let { id -> app.leads.find { it.id == id } }

    AlertDialog(
        // A CONNECTED call must not close without a disposition — otherwise the
        // lead silently stays "new" and looks untouched the next day. Outside-tap
        // / back are ignored; one outcome tap is the only way out. A missed call
        // stays freely dismissable (its "new" status is correct).
        onDismissRequest = { if (!connected || manual) vm.dismissPostCall() },
        // WHITE, NOT LAVENDER. An M3 AlertDialog defaults its container to
        // surfaceContainerHigh, which the scheme tints with the primary — so
        // this one sheet came out pale purple while every card behind it was
        // white on near-white. It was the loudest surface in the app and the
        // only one that had never been moved onto the design system.
        containerColor = AppColors.Surface,
        titleContentColor = AppColors.TextPrimary,
        textContentColor = AppColors.TextPrimary,
        title = {
            Column {
                Text(if (manual) "Update lead" else "Call ended",
                    style = AppType.title, color = AppColors.TextPrimary)
                Spacer(Modifier.height(2.dp))
                Text(who, style = AppType.meta, color = AppColors.TextSecondary)
            }
        },
        text = {
            if (scheduleFor == null) {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    app.postCallContactId?.let { app.recordingWarnings[it] }?.let { warning ->
                        Text(warning, style = AppType.meta, color = AppColors.Warning)
                        Spacer(Modifier.height(8.dp))
                    }
                    // Context strip: budget + place + last note, always in front of the rep.
                    val lastNote = lead?.notes?.takeIf { it.isNotBlank() }
                    val budget = budgetLabel(lead?.budget)
                    val place = lead?.territory?.takeIf { it.isNotBlank() }
                    if (lastNote != null || budget != null || place != null) {
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                        ) {
                            if (budget != null || place != null) {
                                Text(
                                    listOfNotNull(budget?.let { "💰 ₹ $it" }, place?.let { "📍 $it" }).joinToString("   "),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            lastNote?.let {
                                Text("📝 $it", style = MaterialTheme.typography.bodySmall, maxLines = 2,
                                    color = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                    // THE QUESTION COMES FIRST. Temperature, the note and the
                    // voice note used to sit above it, so the thing the sheet
                    // exists to ask — where is this lead now — was the part you
                    // scrolled to. Those three are optional and stay on this
                    // same sheet, under the tiles. No second popup: a post-call
                    // modal cannot open in time, and this sheet is the one
                    // place the answer is recorded.
                    // THE THREE ANSWERS THAT WERE UNREACHABLE FROM HERE.
                    //
                    // After a real call the app knows whether it connected, so it
                    // asks the one question that applies — that part was right.
                    // But openFollowUpUpdate hardcodes connected = true, so a rep
                    // who opened Update by hand from a lead or a callback card was
                    // only ever shown the funnel stages. There was no way to say
                    // "nobody picked up" or "wrong number" at all, on the button
                    // reps press most. Wrong number in particular: the founder
                    // went looking for it here and it did not exist.
                    //
                    // Opened by hand the rep is telling us what happened, so both
                    // questions are theirs to answer. After a real call nothing
                    // changes — the app still asks only the one that applies.
                    if (manual) {
                        SheetSectionLabel("CALL DIDN'T CONNECT")
                        // Two across, then Wrong number on its own line.
                        //
                        // Three across clipped it to "Wrong num…" on a real
                        // phone — the label the founder needed to read was the
                        // one that did not fit. Its own row also puts distance
                        // between the two harmless answers and the one that
                        // files the lead as a dead number, which is the tap
                        // being mis-hit. The undo bar catches it either way;
                        // this makes it less likely to happen at all.
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutcomeTile("No answer", AppColors.Warning, Modifier.weight(1f)) { dispose("no_answer") }
                            OutcomeTile("Busy", AppColors.Warning, Modifier.weight(1f)) { dispose("busy") }
                        }
                        Spacer(Modifier.height(8.dp))
                        // Straight through, no note and no temperature: there is
                        // nothing to record about a number that was never the
                        // customer's. `invalid`, not `dnc` — the person never
                        // asked us to stop calling THEM.
                        OutcomeTile("Wrong number", AppColors.Danger, Modifier.fillMaxWidth()) {
                            vm.postCallDispose("invalid", null, null)
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                    SheetSectionLabel(
                        if (connected) "WHERE IS THIS LEAD NOW?" else "WHY DIDN'T IT CONNECT?",
                        if (connected) "Pick the stage — this moves the lead in your funnel."
                        else "Pick a reason — the lead stays in your calling list.",
                    )

                    // Every tile the same size, two to a row: nothing wraps, nothing
                    // looks bigger than anything else.
                    //
                    // THE COLOUR IS A DOT NOW, NOT THE WHOLE BUTTON. Eight tiles
                    // in eight different pastels read as a toy — green, blue,
                    // two purples, two teals, grey, red, all shouting equally,
                    // which is the same as none of them saying anything. The
                    // tiles are one quiet surface with a hairline; a 6dp dot
                    // carries the meaning. Only Do not call keeps a filled tint,
                    // because it is the one answer here that cannot be undone.
                    val choices: List<Triple<String, Color, () -> Unit>> = if (connected) {
                        listOf(
                            Triple("Interested", AppColors.Positive, { scheduleFor = "interested"; callInstead = false }),
                            Triple("Call back later", AppColors.Indigo, { scheduleFor = "callback" }),
                            // ASKS WHEN. A site visit with no date is not a site
                            // visit: it stamps the stage, tells nobody when, and
                            // reminds no one, so the visit the customer actually
                            // agreed to is quietly forgotten. The lead page has
                            // always asked; this sheet just moved the lead and
                            // said nothing. Same picker, same visitMode options
                            // ("Tomorrow 4 PM", "Sunday 11 AM").
                            Triple("Site visit", AppColors.Violet, { visitPickOpen = true }),
                            Triple("Negotiating", AppColors.Violet, { dispose("negotiation") }),
                            Triple("Token paid", AppColors.Teal, { dispose("token_paid") }),
                            Triple("Booked", AppColors.Positive, { dispose("booked") }),
                            Triple("Not interested", AppColors.Slate, { dispose("not_interested") }),
                            Triple("Do not call", AppColors.Danger, { dispose("dnc") }),
                        )
                    } else {
                        listOf(
                            Triple("No answer", AppColors.Warning, { dispose("no_answer") }),
                            Triple("Busy", AppColors.Warning, { dispose("busy") }),
                            Triple("Switched off", AppColors.Slate, { dispose("no_answer") }),
                            Triple("Wrong person", AppColors.Warning, { dispose("wrong_person") }),
                            // WRONG NUMBER IS ONE TAP, AND IT IS NOT "DO NOT CALL".
                            //
                            // Two things were wrong. It filed the lead as `dnc`,
                            // which means the PERSON asked not to be contacted —
                            // a number that never belonged to them was polluting
                            // the do-not-call list. lead_stages already has
                            // `invalid` ("Bad number"), terminal, for exactly
                            // this, and it is deliberately not in the retry
                            // ladder, so a dead number stops booking retries.
                            //
                            // And it goes straight through with no note and no
                            // temperature. There is nothing for a telecaller to
                            // record about a number that is not the customer's;
                            // asking them to is asking for data that cannot
                            // exist.
                            Triple("Wrong number", AppColors.Danger, { vm.postCallDispose("invalid", null, null) }),
                            Triple("Call back later", AppColors.Indigo, { scheduleFor = "callback" }),
                        )
                    }
                        choices.chunked(2).forEach { pair ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { (label, color, onTap) ->
                                OutcomeTile(label, color, Modifier.weight(1f), onTap)
                            }
                            // Keeps the last row's single tile the same width as the rest.
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    // Optional, and under the stage on purpose. A tap on a tile
                    // above already carries whatever is filled in here.
                    Spacer(Modifier.height(6.dp))
                    SheetSectionLabel(
                        "OPTIONAL",
                        "Hot, warm or cold, a note, or say it. The stage above is what moves the lead.",
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TEMPERATURES.forEach { (key, label) ->
                            val on = temp == key
                            // Unselected is a hairline on white, not a filled
                            // grey slab. Three filled slabs read as a pile of
                            // buttons rather than a question you can skip.
                            Box(
                                Modifier.weight(1f).clip(RoundedCornerShape(50))
                                    .background(if (on) AppColors.Indigo else AppColors.Surface)
                                    .border(1.dp, if (on) AppColors.Indigo else AppColors.Border, RoundedCornerShape(50))
                                    .clickable { temp = if (on) null else key }.padding(vertical = 9.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(label, color = if (on) AppColors.OnIndigo else AppColors.TextPrimary,
                                    style = AppType.label, maxLines = 1)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(note, { note = it }, label = { Text("Add a note (optional)") },
                        singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    // Third way to answer: just say it. It still counts as a
                    // status pick, and it lives under the stage question
                    // because it is optional.
                    if (app.voiceRecording) {
                        // NO COUNTDOWN. The button said "Recording… 3", then 2,
                        // then 1, and stayed dead until three seconds had passed.
                        // Two things wrong with that. It reads as a LIMIT — three
                        // seconds left to speak — which is the opposite of what it
                        // meant. And it locked the one control on screen while the
                        // rep was already talking, which is how a screen teaches
                        // someone that it is not listening.
                        //
                        // The lockout was a second fix for a problem already
                        // fixed: Stop used to land exactly where Record had been,
                        // so the reflex "did that register?" tap ended the take.
                        // Cancel sits in that spot now, so the stray tap cancels
                        // — nothing saved, no harm — and Stop is somewhere the
                        // finger isn't. The 3-second minimum still exists where it
                        // belongs, in finishVoiceNote(), which says "Too short to
                        // save" and leaves the sheet open.
                        //
                        // What the rep sees instead is the take growing: 0:01,
                        // 0:02, 0:03. Elapsed time is the one thing they actually
                        // want to know while speaking.
                        var secs by remember { mutableStateOf(0) }
                        LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(1000); secs++ } }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            DispoButton("Cancel", Slate.copy(alpha = 0.12f), Slate, Modifier.weight(1f)) { vm.cancelVoiceNote() }
                            DispoButton(
                                "⏹  Stop & save  %d:%02d".format(secs / 60, secs % 60),
                                Green.copy(alpha = 0.16f), Green, Modifier.weight(1f),
                            ) { vm.finishPostCallVoiceNote() }
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "🔴 Recording — say what the customer told you.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Red,
                        )
                    } else {
                        // An outline, not a filled indigo slab. This is the
                        // optional third way to answer, so it stays quiet and
                        // sits under the stage question.
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 46.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(AppColors.Surface)
                                .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
                                .clickable { vm.startVoiceNote() }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Text("🎤", fontSize = 13.sp)
                            Spacer(Modifier.width(8.dp))
                            Text("Record voice note", style = AppType.label, color = AppColors.Indigo, maxLines = 1)
                        }
                    }
                }
            } else if (scheduleFor == "interested" && !callInstead) {
                // A visit day, not "save with no reminder". That skip is how
                // 82 people agreed to a visit and 11 reached the stage: the
                // easy tap left no day on the lead. Call again is still here,
                // and it does book a time.
                VisitDayChips(
                    onVisitAt = { millis ->
                        vm.postCallDispose("site_visit", temp, note.ifBlank { null }, millis)
                    },
                    onOtherDay = { visitPickOpen = true },
                    onCallInstead = { callInstead = true },
                    onBack = { scheduleFor = null },
                )
            } else {
                // Inline quick-snooze — carries the temp + note, and stamps the
                // right status so an Interested lead stays "interested".
                QuickScheduleChips(
                    who = who,
                    headline = if (scheduleFor == "interested") "When will you call again?" else "When should we remind you?",
                    onPick = { millis, n ->
                        vm.postCallScheduleFollowUp(millis, n ?: note.ifBlank { null }, temp, scheduleFor ?: "callback")
                    },
                    onBack = {
                        if (scheduleFor == "interested") callInstead = false else scheduleFor = null
                    },
                )
            }
        },
        confirmButton = {},
        dismissButton = {
            if (scheduleFor == null) {
                if (manual) {
                    // Opened by hand, so it closes by hand. Nothing is recorded
                    // and the callback stays exactly where it was.
                    TextButton(onClick = { vm.dismissPostCall() }) { Text("Close") }
                } else if (connected) {
                    // Connected call → no Skip. The lead must not stay "new";
                    // an outcome tap above is the only exit.
                    Text(
                        "⚠ Pick one option above",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                } else {
                    // A typed note or temperature is never thrown away — Skip
                    // becomes "Save & close" the moment something is captured.
                    // Skipping is safe now: with nothing recorded the lead stays
                    // in New, so a mis-tapped call can't lose it.
                    val hasContext = note.isNotBlank() || temp != null
                    TextButton(onClick = {
                        if (hasContext) vm.postCallSaveContext(temp, note) else vm.dismissPostCall()
                    }) { Text(if (hasContext) "Save & close" else "Skip — stays in New") }
                }
            }
        },
    )

    // Booking the visit: the SAME picker the lead page uses, in visitMode, so a
    // rep sees the same "Tomorrow 4 PM / Sunday 11 AM" options wherever they
    // book from. The date rides along in the outcome's own write — one call,
    // one status stamp, one history entry. See Repository.setDisposition.
    if (visitPickOpen) {
        PickWhenDialog(
            title = "Site visit · $who",
            visitMode = true,
            onDismiss = { visitPickOpen = false },
            onPick = { millis ->
                visitPickOpen = false
                vm.postCallDispose("site_visit", temp, note.ifBlank { null }, millis)
            },
        )
    }

}

/**
 * One answer in the Update sheet.
 *
 * Quiet surface, hairline border, graphite label, and a 6dp dot in the colour
 * that carries the meaning. This replaced a tile whose whole background was the
 * semantic colour at 12% — eight of those side by side is a bag of sweets, and
 * the founder's word for it was "second-year student".
 *
 * The one exception is destructive answers: Do not call and Wrong number keep a
 * tinted face, because they are the answers that cannot be taken back and they
 * should not look like the other six.
 */
@Composable
private fun OutcomeTile(label: String, tone: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val destructive = tone == AppColors.Danger
    Row(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (destructive) AppColors.DangerSoft else AppColors.Surface)
            .border(1.dp, if (destructive) AppColors.DangerSoft else AppColors.Border, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(tone))
        Spacer(Modifier.width(8.dp))
        Text(
            label,
            style = AppType.bodyStrong,
            color = if (destructive) AppColors.Danger else AppColors.TextPrimary,
            maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        )
    }
}

/** A section heading inside the Update sheet, with the one line that says what
 *  the section is for — this app's rule is that no screen makes a rep guess. */
@Composable
private fun SheetSectionLabel(title: String, hint: String? = null) {
    Text(title, style = AppType.sectionLabel, color = AppColors.TextSecondary)
    hint?.let {
        Text(it, style = AppType.meta, color = AppColors.TextTertiary)
    }
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun DispoButton(label: String, bg: Color, fg: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .height(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(bg)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = fg, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
    }
}

/** One tappable time. Big enough to hit without looking, quiet enough to scan. */
@Composable
private fun TimeChip(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .height(46.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
            maxLines = 1,
        )
    }
}

/**
 * After Interested: pick the visit day. Same two fast slots as the lead
 * page, plus today when that hour is still ahead, plus the full picker.
 */
@Composable
private fun VisitDayChips(
    onVisitAt: (Long) -> Unit,
    onOtherDay: () -> Unit,
    onCallInstead: () -> Unit,
    onBack: () -> Unit,
) {
    val now = java.time.ZonedDateTime.now()
    fun at(days: Long, hour: Int) =
        now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    Column {
        Text("When is the site visit?", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))
        if (now.hour < 16) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                if (now.hour < 11) TimeChip("Today 11 AM", Modifier.weight(1f)) { onVisitAt(at(0, 11)) }
                TimeChip("Today 4 PM", Modifier.weight(1f)) { onVisitAt(at(0, 16)) }
                if (now.hour >= 11) Spacer(Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            TimeChip("Tomorrow 4 PM", Modifier.weight(1f)) { onVisitAt(visitTomorrow4pm(now)) }
            TimeChip("Sunday 11 AM", Modifier.weight(1f)) { onVisitAt(visitSunday11am(now)) }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Other day",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .clickable { onOtherDay() }
                .padding(vertical = 9.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        TextButton(onClick = onCallInstead, modifier = Modifier.fillMaxWidth()) {
            Text("Call again instead")
        }
        TextButton(onClick = onBack) { Text("← Back to disposition") }
    }
}

/** Reusable quick-schedule chips used in both PostCallDisposition and ScheduleFollowUpDialog. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickScheduleChips(
    who: String,
    onPick: (Long, String?) -> Unit,
    onBack: (() -> Unit)? = null,
    headline: String = "When should we remind you?",
    onSkip: (() -> Unit)? = null,
    skipLabel: String = "Skip reminder",
) {
    val now = java.time.ZonedDateTime.now()
    fun at(days: Long, hour: Int) = now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    val currentHour = now.hour

    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var pickedDate by remember { mutableStateOf<Long?>(null) }

    // This is the screen a rep sees between two calls, so it is measured in
    // seconds. It used to be seven FULL-WIDTH buttons stacked down the page —
    // taller than the dialog, so the rep scrolled to find "tomorrow", read seven
    // near-identical lines to pick one, and did that after every single call.
    //
    // Same choices, laid out the way they are actually thought about: "how soon"
    // on one row, then the fixed times grouped under the day they belong to.
    // Everything fits without scrolling and the target is a whole chip.
    Column {
        Text(headline, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))

        Text("Soon", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(5.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            TimeChip("30 min", Modifier.weight(1f)) { onPick(now.plusMinutes(30).toInstant().toEpochMilli(), null) }
            TimeChip("1 hour", Modifier.weight(1f)) { onPick(now.plusHours(1).toInstant().toEpochMilli(), null) }
            TimeChip("3 hours", Modifier.weight(1f)) { onPick(now.plusHours(3).toInstant().toEpochMilli(), null) }
        }

        // A time that has already gone by is not an option — the row disappears
        // entirely once both of today's slots are behind us.
        if (currentHour < 16) {
            Spacer(Modifier.height(10.dp))
            Text("Today", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(5.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                if (currentHour < 10) TimeChip("10 AM", Modifier.weight(1f)) { onPick(at(0, 10), null) }
                TimeChip("4 PM", Modifier.weight(1f)) { onPick(at(0, 16), null) }
                // Every row is three columns wide whatever it holds, so a chip is
                // always the same size and always in the same place — the rep's
                // thumb learns one target, not one per row.
                Spacer(Modifier.weight(if (currentHour < 10) 1f else 2f))
            }
        }

        Spacer(Modifier.height(10.dp))
        Text("Tomorrow", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(5.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            TimeChip("10 AM", Modifier.weight(1f)) { onPick(at(1, 10), null) }
            TimeChip("4 PM", Modifier.weight(1f)) { onPick(at(1, 16), null) }
            Spacer(Modifier.weight(1f))
        }

        // The five chips cover most calls and none of the real ones: "call me
        // Monday morning", "after Diwali", "when my wife is back on the 14th".
        // The Follow Ups card has had this escape hatch all along; the sheet the
        // rep actually lands on after a call did not, so the only way to book a
        // real date was to save a wrong time and go fix it somewhere else.
        Spacer(Modifier.height(8.dp))
        Text(
            "📅 Pick another time",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .clickable { showDate = true }
                .padding(vertical = 9.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )

        if (onSkip != null) {
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) { Text(skipLabel) }
        }
        if (onBack != null) {
            Spacer(Modifier.height(2.dp))
            TextButton(onClick = onBack) { Text("← Back to disposition") }
        }
    }

    if (showDate) {
        val dps = rememberDatePickerState(initialSelectedDateMillis = now.toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = { pickedDate = dps.selectedDateMillis; showDate = false; showTime = true }) { Text("Next") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = dps) }
    }

    if (showTime) {
        val tps = rememberTimePickerState(initialHour = 10, initialMinute = 0, is24Hour = false)
        AlertDialog(
            onDismissRequest = { showTime = false },
            title = { Text("Pick a time") },
            text = { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TimePicker(state = tps) } },
            confirmButton = {
                TextButton(onClick = {
                    // The date picker hands back UTC midnight for the day the rep
                    // tapped, so the day is read back in UTC and the time is
                    // attached in the phone's zone — read it back locally and a
                    // pre-05:30 IST offset silently books the day before.
                    val base = pickedDate ?: now.toInstant().toEpochMilli()
                    val day = java.time.Instant.ofEpochMilli(base).atZone(java.time.ZoneId.of("UTC")).toLocalDate()
                    val millis = day.atTime(tps.hour, tps.minute)
                        .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                    showTime = false
                    onPick(millis, null)
                }) { Text("Set reminder") }
            },
            dismissButton = { TextButton(onClick = { showTime = false }) { Text("Back") } },
        )
    }
}

// ════════════════════════════════════════════════════════════
//  FOLLOW-UPS
// ════════════════════════════════════════════════════════════
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FollowUpsScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadFollowUps(); vm.loadLeads() }

    var rescheduleFor by remember { mutableStateOf<FollowUp?>(null) }
    // The same "What I did today" sheet the Leads screen shows. This screen
    // needs it more, not less: finishing a callback books the next one, so the
    // card the rep just worked on either vanishes or comes back looking
    // untouched, and there was nothing anywhere saying the update landed.
    var todayOpen by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    // Ticks once a minute, so a callback whose time arrives while the rep is
    // looking at this screen walks into Call now by itself. It used to need the
    // rep to leave and come back — which is how a callback booked for 3 PM got
    // rung at 3:40 and the screen took the blame for being "late".
    val now = rememberNowTick()
    // Call now is the server's answer. A local tick cannot move a 3 PM
    // callback into it. Re-read the view each minute, same as the Leads screen.
    var settled by remember { mutableStateOf(false) }
    LaunchedEffect(now) { if (settled) vm.refreshWorkStates() else settled = true }
    val all = app.followUpList
    val dueUnknown = app.workStatesError != null

    // EVERY DATE PARSED ONCE PER LOAD, NOT ONCE PER COMPARISON.
    //
    // "Follow up bahut slow hai." It was, and this is where. None of the six
    // buckets below was remembered, so all of it re-ran on every single
    // recomposition — and rememberNowTick() forces one every minute on top of
    // every scroll frame. Each pass re-parsed the ISO due_at of all 148 rows,
    // and sortedBy re-parses inside the comparator, so one sort alone was
    // roughly a thousand date parses. Five sorts, two dayLabel() passes, then
    // dueContacts doing a LINEAR SCAN of 271 leads for each of 112 due rows:
    // thirty thousand comparisons, repeated, on a mid-range phone.
    //
    // Parse once into a small record, bucket from that, and look leads up in a
    // map. The screen shows exactly what it showed before.
    data class FuAt(val f: FollowUp, val ms: Long, val day: String)
    val parsed = remember(all) {
        all.map { FuAt(it, instantMillis(it.dueAt) ?: Long.MAX_VALUE, dayLabel(it.dueAt)) }
    }
    // Why each lead is really in Call now. The order lives in CallNowQueue —
    // the same function the Leads "Call all" dials, so the two screens cannot
    // disagree about who is first.
    val workByLead = app.workByLead
    val callNowLeads = remember(app.leads, workByLead) {
        callNowContacts(app.leads, workByLead)
    }
    val dueIds = remember(callNowLeads) { callNowLeads.mapNotNull { it.id }.toSet() }
    // Soonest pending row per lead. The list arrives ordered by due_at.
    val fuByContact = remember(parsed) {
        val map = LinkedHashMap<String, FuAt>()
        for (x in parsed.sortedBy { it.ms }) {
            val id = x.f.contactId ?: continue
            map.putIfAbsent(id, x)
        }
        map
    }
    // One row per due lead, in five-tier order. A lead the clock says to call
    // who has no diary row still appears — otherwise Due now and this chip
    // count different people. A future diary on a waiting buyer is Call now,
    // not Tomorrow: due beats later.
    val toCall = remember(callNowLeads, fuByContact, workByLead) {
        callNowLeads.map { lead ->
            val existing = lead.id?.let { fuByContact[it] }?.f
            existing ?: syntheticCallNow(lead, lead.id?.let { workByLead[it] })
        }
    }
    val dueContacts = callNowLeads

    // The other tabs are diary questions. They do not include anyone already
    // in Call now. `now` is a key because later-today is a clock question.
    val diary = remember(parsed, now, dueIds) {
        val laterL = ArrayList<FuAt>()
        val tomorrowL = ArrayList<FuAt>()
        val weekL = ArrayList<FuAt>()
        val overdueL = ArrayList<FuAt>()
        val weekEnd = now + 7L * 24 * 3600_000L
        for (x in parsed) {
            val inCallNow = x.f.contactId != null && x.f.contactId in dueIds
            if (x.ms < now && x.day != "Today") overdueL.add(x)
            if (inCallNow) continue
            if (x.ms > now) {
                if (x.day == "Today") laterL.add(x)
                if (x.ms <= weekEnd) weekL.add(x)
            }
            if (x.day == "Tomorrow") tomorrowL.add(x)
        }
        val byTime = compareBy<FuAt> { it.ms }
        listOf(laterL, tomorrowL, weekL, overdueL).forEach { it.sortWith(byTime) }
        listOf(laterL, tomorrowL, weekL, overdueL)
    }
    val laterToday = diary[0].map { it.f }
    val tomorrow = diary[1].map { it.f }
    val weekList = diary[2].map { it.f }
    val overdueStrict = diary[3].map { it.f }

    // Land on the list that HAS the work. Only once the rep taps a tab does
    // their choice take over — so the screen is never empty by default while
    // something is waiting.
    var picked by remember { mutableStateOf<String?>(null) }
    val filter = picked ?: when {
        toCall.isNotEmpty() -> "tocall"
        laterToday.isNotEmpty() -> "later"
        else -> "all"
    }
    // Hoisted OUT of the when below: remember() is positional, and calling it
    // inside a branch that appears and disappears as the rep switches tabs
    // changes the call order between recompositions.
    val allSorted = remember(parsed) { parsed.sortedBy { it.ms }.map { it.f } }
    val inTab = when (filter) {
        "tocall" -> toCall
        "later" -> laterToday
        "tomorrow" -> tomorrow
        "week" -> weekList
        else -> allSorted
    }
    // SEARCH. The Leads page has had it all along; this one never did, and it is
    // the page with a hundred and forty rows on it. A rep who remembers a name
    // — "that Sharma I promised to call back" — had no way to reach that
    // callback except scrolling every tab.
    //
    // It searches the WHOLE list, not the open tab: the whole point is that the
    // rep does not know which tab their callback fell into. Typing therefore
    // shows results across every bucket, and clearing the box puts the tab back.
    val shown = remember(inTab, allSorted, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) inTab
        else allSorted.filter {
            (it.name?.lowercase()?.contains(q) == true) || it.phone.filter { c -> c.isDigit() }.contains(q)
        }
    }
    // Searching overrides the tab, so the line under the chips has to say so —
    // otherwise the chips look selected while showing something else, which is
    // exactly the kind of "this screen is lying to me" moment this page has
    // already been fixed for once.
    val blurb = if (dueUnknown && filter == "tocall") {
        app.workStatesError ?: ""
    } else if (query.isNotBlank()) {
        "${shown.size} found across every list — clear the search to go back to the tabs."
    } else when (filter) {
        "tocall" -> "Waiting on you first, then people you have actually spoken to. " +
            "Numbers that never pick up are at the bottom."
        "later" -> "Booked for later today. Nothing to do yet."
        "tomorrow" -> "Booked for tomorrow. These move into Call now on their own, at their time."
        "week" -> "Coming up in the next 7 days."
        else -> "Every callback you have, soonest first."
    }

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // ONE header line. It used to be a headline, a subtitle that said
        // nothing ("Never miss a follow-up"), and then a row of three stat
        // tiles whose numbers were repeated verbatim by the chips directly
        // underneath. Between them they ate the top third of a small phone,
        // so a rep opening this screen saw two callbacks and a lot of decor.
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Follow Ups", style = AppType.largeTitle, color = AppColors.TextPrimary,
                    modifier = Modifier.weight(1f), maxLines = 1)
                IconButton(
                    onClick = { todayOpen = true; vm.loadTodayActivities() },
                    modifier = Modifier.size(44.dp),
                ) {
                    Icon(Icons.Default.History, contentDescription = "What I did today",
                        tint = IosColors.Blue, modifier = Modifier.size(22.dp))
                }
                IconButton(onClick = { vm.loadFollowUps(force = true) }, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh",
                        tint = IosColors.Blue, modifier = Modifier.size(22.dp))
                }
                TextButton(
                    onClick = onBack,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp),
                ) { Text("Back", style = AppType.callout, color = IosColors.Blue) }
            }
        }
        // Above the chips, because it overrides them.
        item {
            AppSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search name or phone",
                modifier = Modifier.fillMaxWidth(),
            )
        }
        // The chips ARE the counts. Same row, same look, same behaviour as the
        // Leads screen — one line of "Call now 24 · Later today 3 · Tomorrow 6"
        // with the fade at the right edge showing there is more to scroll.
        //
        // Still no Morning/Afternoon/Overdue: those were slices of the same
        // callbacks under different names, which is what made this screen hard
        // to trust. Each chip here is a different WHEN, and the line underneath
        // spells out whichever one is selected.
        item {
            Column {
                if (dueUnknown) {
                    Text(
                        app.workStatesError ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(6.dp))
                }
                CompactFilterRow {
                    FilterTab(
                        "Call now", toCall.size, filter == "tocall", Red,
                        countLabel = if (dueUnknown) "—" else null,
                    ) { picked = "tocall" }
                    FilterTab("Later today", laterToday.size, filter == "later", MaterialTheme.colorScheme.primary) { picked = "later" }
                    FilterTab("Tomorrow", tomorrow.size, filter == "tomorrow", Amber) { picked = "tomorrow" }
                    FilterTab("This week", weekList.size, filter == "week", Indigo) { picked = "week" }
                    FilterTab("All", all.size, filter == "all", MaterialTheme.colorScheme.primary) { picked = "all" }
                }
                Spacer(Modifier.height(6.dp))
                Text(blurb, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Visits waiting on an outcome. Not a chip and not a fourth tab —
        // a section under the lists she already has. Hidden when the read
        // succeeded and the list is empty. A failed read says so, and does
        // not draw a zero.
        if (app.pendingVisits.rows.isNotEmpty() || app.pendingVisits.error != null) {
            item {
                Column(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.Surface)

                        .padding(Space.l),
                ) {
                    Text("Visits waiting on an outcome", style = AppType.rowTitle, color = AppColors.TextPrimary)
                    app.pendingVisits.error?.let { msg ->
                        Spacer(Modifier.height(6.dp))
                        Text(msg, color = MaterialTheme.colorScheme.error, style = AppType.meta)
                    }
                    val waiting = pendingVisitRows(app.pendingVisits, app.leads) { id, phone, name, came ->
                        vm.answerVisitHappened(id, phone, name, came)
                    }
                    PlanBucket(
                        icon = Icons.AutoMirrored.Outlined.HelpOutline,
                        title = "Did they come?",
                        color = Amber,
                        rows = waiting.take(5),
                        more = waiting.size - 5,
                        onCall = { vm.dialManual(it) },
                    )
                }
            }
        }
        // The one button that does the day's work, and the one that admits
        // defeat, in that order. "Auto queue mode" was a full card with an icon
        // circle, a title and a subtitle wrapped around a button — three lines
        // of explanation for a thing whose whole meaning fits on the button.
        //
        // Both hide while searching. They act on the whole due pile, not on
        // what is on screen, and "Call all 24 due" sitting above two search
        // results is a button that does something other than what the rep is
        // looking at.
        //
        // "Call all" dials dueContacts — the Call now list — so it is shown
        // only while that chip is selected. On Tomorrow, Later today, This
        // week and All it was a button that rang a different list from the
        // one on screen. The chip itself is unchanged: no new tab, and no
        // extra total beside the count it already carries.
        val showCallAll = query.isBlank() && filter == "tocall" && dueContacts.isNotEmpty()
        val showMoveOverdue = query.isBlank() && overdueStrict.isNotEmpty()
        if (showCallAll || showMoveOverdue) {
            item {
                Column {
                    if (showCallAll) {
                        Row(
                            Modifier.fillMaxWidth().height(56.dp).clip(Radii.control)
                                .background(AppColors.Indigo)
                                .clickable { vm.callList(dueContacts, "Due follow-ups") },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null,
                                tint = Color.White, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Call all ${dueContacts.size} due, one after another",
                                color = Color.White, style = AppType.label, maxLines = 1)
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "After each call, tap what happened. The next number starts on its own.",
                            style = AppType.meta,
                            color = AppColors.TextSecondary,
                        )
                    }
                    if (showMoveOverdue) {
                        if (showCallAll) Spacer(Modifier.height(8.dp))
                        // A BUTTON THAT LOOKS LIKE A BUTTON.
                        //
                        // This was loose red prose with a tap target hidden on
                        // it — nothing said it was pressable except the sentence
                        // telling you to press it, and it moves 26 callbacks in
                        // one tap. It also added a third red to a screen that
                        // already had the overdue pills and the Call now chip.
                        // Bordered row, graphite text: it reads as the quiet
                        // secondary action it is, next to the filled Call all.
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(AppColors.Surface)
                                .border(1.dp, AppColors.Border, RoundedCornerShape(10.dp))
                                .clickable {
                                    val tomorrow10 = java.time.ZonedDateTime.now().plusDays(1)
                                        .withHour(10).withMinute(0).withSecond(0).toInstant().toEpochMilli()
                                    vm.rescheduleFollowUps(overdueStrict, tomorrow10)
                                }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "Move ${overdueStrict.size} left over from before today to tomorrow 10 AM",
                                fontSize = 11.5.sp, color = AppColors.TextPrimary,
                                fontWeight = FontWeight.Medium, lineHeight = 15.sp,
                            )
                        }
                    }
                }
            }
        }

        if (shown.isEmpty()) {
            item {
                // Say WHICH state we are in. "Nothing here" next to a Call-now
                // count of 24 is what taught reps to distrust this screen.
                Text(
                    when {
                        dueUnknown && (filter == "tocall" || all.isEmpty()) ->
                            app.workStatesError ?: ""
                        query.isNotBlank() -> "No callback matches \"${query.trim()}\". This searches your callbacks only — the lead may still be on the Leads page."
                        all.isEmpty() -> "No callbacks scheduled. Book one from any lead."
                        toCall.isNotEmpty() -> "Nothing in this list — but ${toCall.size} are waiting in Call now."
                        filter == "tocall" -> "All caught up. Nothing to call right now."
                        else -> "Nothing in this list."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(shown, key = { it.id ?: it.contactId ?: it.phone }) { f ->
                val cid = f.contactId
                FollowUpCard(
                    f = f,
                    now = now,
                    onCall = { vm.dialManual(f.phone) },
                    onWhatsApp = {
                        openRowWhatsApp(
                            context, vm, cid, f.phone, cid?.let { workByLead[it] },
                            waTemplate(f.name, null, app.profile?.fullName, app.company?.name, app.profile?.speaksAs),
                        )
                    },
                    whatsAppBusy = cid != null && cid == app.waDraftingId,
                    focusReason = app.focusReason(cid),
                    onQuickOutcome = cid?.takeIf { id -> app.pendingUpdates.any { it.contactId == id } }?.let { id ->
                        { status: String -> vm.disposeFromLead(id, f.phone, f.name, status, f.id) }
                    },
                    onSnooze = {
                        val fid = f.id
                        if (fid != null) vm.snoozeFollowUp(fid, 1)
                        else vm.scheduleFollowUp(
                            f.contactId, f.phone, f.name,
                            System.currentTimeMillis() + 3_600_000L,
                            null, mirrorStatus = false,
                        )
                    },
                    onReschedule = { rescheduleFor = f },
                    onUpdate = if (cid == null) null else fun() { vm.openFollowUpUpdate(cid, f.phone, f.name, f.id) },
                    onDone = { f.id?.let { vm.completeFollowUp(it) } },
                    onOpen = if (cid == null) null else fun() { vm.openLeadDetail(cid) },
                    needsUpdate = cid != null && app.pendingUpdates.any { it.contactId == cid },
                    work = cid?.let { workByLead[it] },
                    memoryLine = rowMemoryLine(cid?.let { app.memoryByLead[it] }),
                    sayLine = if (isDueNow(cid?.let { workByLead[it] })) focusSayLine(app.coachPicks, cid) else null,
                )
            }
        }
    }

    if (todayOpen) {
        androidx.compose.material3.ModalBottomSheet(onDismissRequest = { todayOpen = false }) {
            TodayWorkSheet(
                app = app,
                onOpenLead = { id -> todayOpen = false; vm.openLeadDetail(id) },
            )
        }
    }

    rescheduleFor?.let { f ->
        ScheduleFollowUpDialog(
            who = f.name ?: f.phone,
            onDismiss = { rescheduleFor = null },
            onPick = { millis, note ->
                // ONE call, not close-then-book as two racing coroutines — see
                // moveFollowUp: the book can rewrite the very row the close is
                // about to mark done, and the rescheduled callback vanishes.
                vm.moveFollowUp(f, millis, note ?: f.note)
                rescheduleFor = null
            },
        )
    }
}

/**
 * One plain line saying why this callback exists.
 *
 * The note is written by whoever booked it — the rep, the voice-note AI, or the
 * attempt ladder — so it already says why. This just gives it a sentence around
 * it, and says something useful when there is no note at all instead of showing
 * nothing.
 *
 * It no longer repeats the due time. The card already prints that twice, in the
 * pill and the day/time line right beside it, and a third copy at the end of
 * this sentence was pushing the actual note onto a second line for no reason.
 */
private fun whyThisCallback(f: FollowUp): String {
    val note = (f.note ?: "").trim()
    return when {
        // The AI's own wording; strip its prefix and let it speak for itself.
        note.startsWith("AI:", ignoreCase = true) ->
            note.removePrefix("AI:").removePrefix("ai:").trim()
        // The no-answer ladder books these, and the note already counts the try.
        note.contains("Attempt", ignoreCase = true) -> "Nobody picked up — $note"
        // The database booked this one, not the rep.
        //
        // book_callback_if_missing writes exactly this sentence whenever a lead
        // is set to Callback with no time chosen. Without this branch it fell
        // through to "You said:", which told a rep they had typed something
        // they never typed — on the most common note in the table.
        note == AUTO_CALLBACK_NOTE -> note
        note == NO_PLAN_NOTE -> note
        note.isNotEmpty() -> "You said: $note"
        else -> "You booked a call back"
    }
}

/** The note `book_callback_if_missing` stamps on a callback nobody timed —
 *  migration 0166. Matched, never written, by the app. */
private const val AUTO_CALLBACK_NOTE = "No call time was set, so we booked one for 11 AM"

/** A Call now lead with no diary row. Not "you booked this". */
private const val NO_PLAN_NOTE = "No callback booked. Call them now."

/** A row the Follow-ups card can draw for a due lead who has no follow-up yet.
 *  id stays null so Done cannot mark a row that does not exist. */
private fun syntheticCallNow(lead: Contact, work: LeadWork?): FollowUp = FollowUp(
    id = null,
    companyId = lead.companyId,
    salespersonId = lead.salespersonId ?: "",
    contactId = lead.id,
    phone = lead.phone,
    name = lead.name,
    dueAt = work?.dueAt ?: java.time.Instant.now().toString(),
    note = if (work?.waitingSince != null || !work?.promiseText.isNullOrBlank()) null else NO_PLAN_NOTE,
)

/**
 * No answer, Busy, Wrong number — the three answers for a call that never
 * connected. One tap each. A real conversation still goes through Update.
 * Wrong number stays visually apart: it files the lead as a dead number,
 * and the undo bar is the way back.
 */
@Composable
internal fun QuickOutcomeChips(onOutcome: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf(
            "No answer" to "no_answer",
            "Busy" to "busy",
            "Wrong number" to "invalid",
        ).forEach { (label, status) ->
            val danger = status == "invalid"
            Box(
                Modifier.weight(1f).heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (danger) AppColors.DangerSoft else AppColors.Surface)
                    .border(
                        1.dp,
                        if (danger) AppColors.Danger.copy(alpha = 0.35f) else AppColors.Border,
                        RoundedCornerShape(12.dp),
                    )
                    .clickable { onOutcome(status) }
                    .padding(horizontal = 6.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = AppType.metaStrong,
                    color = if (danger) AppColors.Danger else AppColors.TextPrimary,
                    maxLines = 2,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
    }
}

/**
 * [onUpdate] is null when the callback isn't linked to a lead — there is no
 * funnel to move, so it falls back to plainly ticking the callback off. Every
 * pending callback on the platform is currently linked, but the column is
 * nullable and a button that silently does nothing is worse than one that
 * isn't there.
 */
@Composable
private fun FollowUpCard(
    f: FollowUp,
    /** The screen's ticking clock, so a card turns overdue on its own. */
    now: Long,
    onCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onSnooze: () -> Unit,
    onReschedule: () -> Unit,
    onUpdate: (() -> Unit)?,
    onDone: () -> Unit,
    /** Opens this callback's lead. Null when the row isn't linked to one. */
    onOpen: (() -> Unit)? = null,
    needsUpdate: Boolean = false,
    /** Why this lead is really in Call now — a buyer left waiting, or a
     *  promise made on a recorded call and not kept. Null for most rows. */
    work: LeadWork? = null,
    /** focus-five's line, when this lead is one of today's picks. */
    focusReason: String? = null,
    whatsAppBusy: Boolean = false,
    /** One tap for a call that never connected. Null hides the chips. */
    onQuickOutcome: ((String) -> Unit)? = null,
    /** Where the conversation was left. Shown under the why line. */
    memoryLine: String? = null,
    /** What to say, when focus-five named this lead. */
    sayLine: String? = null,
) {
    // FIVE BUTTONS WAS THE PROBLEM.
    //
    // Call, WhatsApp, Update, Snooze and Pick Time each got a full-width or
    // half-width block of their own, stacked in three rows — about 230dp of
    // card, so two callbacks filled a phone. A rep with twenty-four to get
    // through was scrolling more than dialling, and every card asked them to
    // choose between five things when the answer is nearly always "call them".
    //
    // Same three-button row as a lead card now — Update · WhatsApp · Call, with
    // Call solid and widest — and the two time controls demoted to small text
    // underneath, where they are still one tap away but no longer compete.
    val overdue = (instantMillis(f.dueAt) ?: Long.MAX_VALUE) <= now
    val jade = AppColors.Indigo
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    // "OVERDUE 43D" IS AN ACCUSATION THE APP EARNED ITSELF.
    //
    // On 154 of these rows nobody ever agreed a time. `book_callback_if_missing`
    // invented 11 AM (migration 0166) and the card has been shouting that the
    // rep is six weeks late for a promise she never made. When every row is
    // red, red stops meaning anything — the exact way "Follow-up 107" stopped
    // being believed.
    //
    // So red is kept for what a person is actually owed: a buyer waiting, an
    // unkept promise, or a callback the rep or the AI really booked. An
    // app-invented one goes grey and says what it is — an old lead, not a
    // broken commitment.
    val appInvented = (f.note ?: "").trim() == AUTO_CALLBACK_NOTE &&
        work?.waitingSince == null && work?.promiseDueSince == null
    val accent = if (overdue && !appInvented) Red else if (overdue) muted else jade
    val who = f.name?.takeIf { it.isNotBlank() } ?: prettyPhone(f.phone)

    Column(
        Modifier.fillMaxWidth().clip(Radii.card)
            .background(AppColors.Surface)

            // TAP THE CARD, OPEN THE LEAD.
            //
            // It did nothing before. Everything a rep might want before ringing
            // — the last call, what the AI heard, the notes, the funnel — is on
            // the lead's page, and from here the only way in was to leave for
            // the Leads tab and find the name again. The buttons below still
            // win their own taps; Compose gives the press to the innermost
            // clickable, so Call, WhatsApp and Update are unaffected.
            .then(if (onOpen == null) Modifier else Modifier.clickable { onOpen() })
            .padding(horizontal = Space.m, vertical = Space.m),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            // The shared circular avatar. It was a rounded square filled with 8%
            // grey — the only avatar shape in the app, and the only one that did
            // not tint itself per person, so a column of them was six identical
            // grey squares.
            InitialsAvatar(f.name ?: f.phone)
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(who, style = AppType.headline.copy(fontSize = 20.sp), color = AppColors.TextPrimary,
                    maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                // The 📞 was decoration: this is a phone number, on a card whose
                // main button is Call.
                Text(prettyPhone(f.phone), style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1)
            }
            Spacer(Modifier.width(Space.s))
            Column(horizontalAlignment = Alignment.End) {
                StatusTag(
                    if (appInvented && overdue) "Not called ${agoLabel(f.dueAt)}" else relativeDue(f.dueAt),
                    StatusTone(accent, accent.copy(alpha = 0.12f)),
                )
                Spacer(Modifier.height(Space.xxs))
                Text("${dayLabel(f.dueAt)} ${timeOnly(f.dueAt)}", style = AppType.tag,
                    color = AppColors.TextTertiary, maxLines = 1)
            }
        }
        // WHY this callback is sitting here, in one line, on every card.
        //
        // A rep opening Follow Ups saw a name, a phone and a time and had to
        // remember what any of it was about — so the honest reaction was "this
        // shouldn't be here". It is never a mystery to the app: either the rep
        // booked it themselves, or the AI booked it from a voice note, or the
        // attempt ladder booked it because nobody picked up.
        Spacer(Modifier.height(8.dp))
        // GREY, NOT A PINK ALARM.
        //
        // This panel took the card's accent, so on an overdue callback it was a
        // full-width pink box of red text. The "Overdue 12d" pill three
        // centimetres above already says the same thing, and saying it twice in
        // the same red is how a card ends up with four different reds on it and
        // none of them meaning anything. The note is context, not an alarm —
        // urgency is the pill's job on this card and nothing else's.
        Row(
            Modifier.fillMaxWidth().clip(Radii.control)
                .background(AppColors.SurfaceMuted)
                .padding(horizontal = Space.m, vertical = Space.s),
        ) {
            // THE REAL REASON WINS OVER THE APP'S OWN NOTE.
            //
            // Sorting these rows to the top without saying why would be the
            // worst of both: a rep who cannot see the rule assumes the list is
            // random again. So when there IS a real reason, it replaces
            // "No call time was set, so we booked one for 11 AM" — which on
            // these rows was never true anyway.
            // Pulled into locals rather than tested through the safe call
            // inline: a local val is smart-cast with no !! and this line is
            // read far more often than it is written.
            val signal = dueSignal(work, focusReason)
            val hardSignal = work?.waitingSince != null ||
                (work?.promiseDueSince != null && !work.promiseText.isNullOrBlank())
            Text(
                signal ?: whyThisCallback(f),
                style = AppType.meta,
                color = when {
                    signal != null && hardSignal -> Red
                    signal != null -> muted
                    else -> AppColors.TextSecondary
                },
                maxLines = 3,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
        listOfNotNull(memoryLine, sayLine).forEach { line ->
            Spacer(Modifier.height(4.dp))
            Text(
                line,
                style = AppType.meta,
                color = AppColors.TextPrimary,
                maxLines = 2,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(9.dp))
        if (needsUpdate && onQuickOutcome != null) {
            Text("What happened?", style = AppType.meta, color = muted)
            Spacer(Modifier.height(6.dp))
            QuickOutcomeChips(onQuickOutcome)
            Spacer(Modifier.height(8.dp))
        }
        // Update REPLACES the old "Done".
        //
        // Done ticked the callback off and recorded nothing — which is exactly
        // how a customer who said "interested, call Friday" ended up as a closed
        // callback on a lead that never moved. Update asks the one question and
        // then does all of it: the stage moves, the note and temperature save,
        // the next callback books itself, and THIS callback closes.
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (onUpdate != null) {
                // A just-finished call turns it amber and sets it wobbling —
                // the same reminder the Leads list gives, in the place a rep
                // ringing their callbacks is actually looking.
                // ONE FILLED BUTTON PER CARD, AND IT IS CALL.
                //
                // These three were a lavender tint, a green tint and a solid
                // blue — three weights competing for the same glance, on top of
                // a pink note and a red pill. The secondary two are hairlines on
                // white now, the way the Update sheet's tiles are, and Call
                // keeps the only fill. Amber still wins on Update while a call
                // is waiting to be written up: that is a state, and states are
                // the one thing allowed to colour this card.
                val needsInk = if (needsUpdate) Amber else AppColors.TextPrimary
                Row(
                    Modifier.nudgeShake(needsUpdate).weight(1f).height(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (needsUpdate) Amber.copy(alpha = 0.14f) else AppColors.Surface)
                        .border(1.dp, if (needsUpdate) Amber else AppColors.Border, RoundedCornerShape(12.dp))
                        .clickable { onUpdate() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(if (needsUpdate) "Update call" else "Update", fontSize = 13.sp,
                        color = needsInk, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            } else {
                // Not linked to a lead, so there is no funnel to move — ticking
                // the callback off is genuinely all this can do.
                Row(
                    Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(12.dp))
                        .background(AppColors.Surface)
                        .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
                        .clickable { onDone() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text("Done", fontSize = 13.sp, color = AppColors.TextPrimary,
                        fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
            Spacer(Modifier.width(7.dp))
            Row(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(12.dp))
                    .background(AppColors.Surface)
                    .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
                    .clickable(enabled = !whatsAppBusy) { onWhatsApp() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                // WhatsApp's green survives as the icon only — it is a brand
                // mark, which is worth keeping, not a reason to tint the button.
                if (whatsAppBusy) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = WaGreen)
                    Spacer(Modifier.width(5.dp))
                    Text("Writing…", fontSize = 13.sp, color = AppColors.TextSecondary, fontWeight = FontWeight.SemiBold, maxLines = 1)
                } else {
                    Icon(Icons.Default.Chat, contentDescription = null, tint = WaGreen, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("WhatsApp", fontSize = 13.sp, color = AppColors.TextPrimary, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
            Spacer(Modifier.width(7.dp))
            Row(
                Modifier.weight(1.35f).height(52.dp).clip(RoundedCornerShape(12.dp))
                    .background(jade)
                    .clickable { onCall() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Default.Call, contentDescription = "Call", tint = Color.White, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Call", fontSize = 16.sp, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
        // "Not now" lives here — small, plain and out of the way of the three
        // buttons that move work forward.
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("In 1 hour", style = AppType.meta, color = muted,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { onSnooze() }
                    .padding(horizontal = 8.dp, vertical = 8.dp))
            Spacer(Modifier.width(8.dp))
            Text("Pick another time", style = AppType.meta, color = muted,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { onReschedule() }
                    .padding(horizontal = 8.dp, vertical = 8.dp))
        }
    }
}

// ════════════════════════════════════════════════════════════
//  TEAM / REPORTS
// ════════════════════════════════════════════════════════════
@Composable
fun TeamScreen(vm: MainViewModel, onCampaigns: () -> Unit, onCallHistory: () -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadLeaderboard(app.leaderboardPeriod) }

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { Text("Reports & Team", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item { LeaderboardCard(vm, app, compact = false) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ActionButton(Icons.Default.TrendingUp, "Campaign analytics", MaterialTheme.colorScheme.primary, Modifier.weight(1f), onClick = onCampaigns)
                ActionButton(Icons.Default.Call, "Call history", MaterialTheme.colorScheme.primary, Modifier.weight(1f), onClick = onCallHistory)
            }
        }
    }
}

@Composable
private fun LeaderboardCard(vm: MainViewModel, app: AppState, compact: Boolean) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Groups, contentDescription = "Team", tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Leaderboard", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("today" to "Today", "week" to "Week").forEach { (key, label) ->
                        val on = app.leaderboardPeriod == key
                        Box(Modifier.clip(RoundedCornerShape(12.dp))
                            .background(if (on) AppColors.IndigoSoft else AppColors.SurfaceMuted)
                            .clickable { vm.setLeaderboardPeriod(key) }.padding(horizontal = 12.dp, vertical = 8.dp)) {
                            Text(label, color = if (on) AppColors.Indigo else AppColors.TextSecondary,
                                style = AppType.metaStrong)
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            val rows = if (compact) app.leaderboard.take(3) else app.leaderboard
            when {
                app.leaderboardLoading && app.leaderboard.isEmpty() ->
                    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                rows.isEmpty() -> Text("No activity yet for this period.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> {
                    val myId = app.profile?.id
                    rows.forEachIndexed { i, r -> LeaderboardRowView(i + 1, r, isMe = r.salespersonId == myId) }
                }
            }
        }
    }
}

@Composable
private fun LeaderboardRowView(rank: Int, r: LeaderboardRow, isMe: Boolean) {
    val medal = when (rank) { 1 -> "🥇"; 2 -> "🥈"; 3 -> "🥉"; else -> "$rank." }
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(medal, modifier = Modifier.width(34.dp))
        Column(Modifier.weight(1f)) {
            Text((r.fullName ?: "—") + if (isMe) "  (you)" else "", style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isMe) FontWeight.Bold else FontWeight.Normal,
                color = if (isMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
            Text("${r.calls} calls · ${r.connected} connected · ${fmtSec(r.talkSeconds)} talk",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("${r.leads}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text("leads", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}


/** Old filter → (lane, segment). Every filter the chip row had lives here. */
internal val LANE_SUBS: Map<String, List<Pair<String, String>>> = linkedMapOf(
    "call" to listOf("call_now" to "All", "overdue" to "Overdue", "new" to "New", "hot" to "Hot"),
    "wait" to listOf("due_today" to "Today", "scheduled" to "Later", "awaiting_visit" to "Visit"),
    "revive" to listOf("no_next_step" to "No step", "cold" to "Cold"),
)

internal fun laneBucket(sub: String): String = when (sub) {
    "new" -> "new"
    "hot" -> "hot"
    "cold" -> "revive"
    else -> "act:$sub"
}

/** Said no, or cold after 2+ tries. Never DNC or booked. Same rule as before. */
internal fun isReviveLead(c: Contact): Boolean =
    c.status in SAID_NO || (c.temperature == "cold" && c.attempts >= 2 && c.status !in BOOKED_OR_DNC)

/**
 * Three lane cards in a fixed row (always fully on screen, no sideways
 * scroll), then the chosen lane's segments. Neutral by default: one blue for
 * the selected lane, red only when something is overdue.
 */
@Composable
private fun LeadLanes(
    lane: String,
    sub: String,
    unknown: Boolean,
    counts: Map<String, Int>,
    reviveTotal: Int,
    onLane: (String) -> Unit,
    onSub: (String) -> Unit,
    callAllCount: Int,
    onCallAll: () -> Unit,
    onSecondChance: () -> Unit,
) {
    fun n(code: String) = counts[code] ?: 0
    val overdue = n("overdue")
    val waitTotal = n("due_today") + n("scheduled") + n("awaiting_visit")
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LaneCard("Call now", if (unknown) "—" else n("call_now").toString(),
                when { unknown -> "Could not load"; overdue > 0 -> "$overdue overdue"; else -> "Ring these" },
                urgent = !unknown && overdue > 0, selected = lane == "call",
                modifier = Modifier.weight(1f)) { onLane("call") }
            LaneCard("Waiting", if (unknown) "—" else waitTotal.toString(), "Booked for later",
                urgent = false, selected = lane == "wait",
                modifier = Modifier.weight(1f)) { onLane("wait") }
            LaneCard("Revive", reviveTotal.toString(), "Gone quiet",
                urgent = false, selected = lane == "revive",
                modifier = Modifier.weight(1f)) { onLane("revive") }
        }
        Spacer(Modifier.height(12.dp))
        val subs = LANE_SUBS[lane].orEmpty()
        val actCodes = setOf("call_now", "overdue", "due_today", "scheduled", "awaiting_visit", "no_next_step")
        IosSegmented(
            options = subs.map { (code, label) ->
                val c = if (unknown && code in actCodes) "—" else n(code).toString()
                "$label $c"
            },
            selectedIndex = subs.indexOfFirst { it.first == sub },
            modifier = Modifier.fillMaxWidth(),
        ) { i -> subs.getOrNull(i)?.let { onSub(it.first) } }
        if (callAllCount > 0 || lane == "revive") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (lane == "revive") {
                    TextButton(onClick = onSecondChance) {
                        Text("Second chance ideas", style = AppType.subhead, color = AppColors.Indigo)
                    }
                }
                if (callAllCount > 0) {
                    TextButton(onClick = onCallAll) {
                        Text("Call all $callAllCount", style = AppType.subhead.copy(fontWeight = FontWeight.SemiBold),
                            color = AppColors.Indigo)
                    }
                }
            }
        }
    }
}

@Composable
private fun LaneCard(
    title: String,
    count: String,
    caption: String,
    urgent: Boolean,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(AppColors.Surface)
            .border(
                width = if (selected) 2.dp else 0.dp,
                color = if (selected) AppColors.Indigo else Color.Transparent,
                shape = RoundedCornerShape(14.dp),
            )
            .iosPress(scaleTo = 0.96f) { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(title.uppercase(), style = AppType.caption, color = if (selected) AppColors.Indigo else AppColors.TextSecondary,
            maxLines = 1)
        Spacer(Modifier.height(4.dp))
        Text(count, style = AppType.title2, color = if (urgent) IosColors.Red else AppColors.TextPrimary, maxLines = 1)
        Text(caption, style = AppType.footnote, color = if (urgent) IosColors.Red else AppColors.TextSecondary,
            maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}
