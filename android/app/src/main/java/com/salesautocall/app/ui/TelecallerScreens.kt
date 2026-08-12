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
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Groups
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
import com.salesautocall.app.data.WhatsAppMessage
import com.salesautocall.app.data.LeaderboardRow
import kotlin.math.abs

// ════════════════════════════════════════════════════════════
//  Design system — colours, helpers, atoms
// ════════════════════════════════════════════════════════════

// Paper & ink discipline: ONE palette, anchored on jade. Neutrals are warm
// (green-tinted, never blue-cold); the pipeline reads as a single story —
// slate (unknown) → sea (talking) → amber (interest heating) → plum (visit)
// → bronze (money forming) → jade (money). Every hue sits in the same muted
// saturation band, so nothing shouts and nothing looks odd next to anything.
private val Green = Color(0xFF4353B8)   // success = jade
private val Amber = Color(0xFFB8860B)   // muted brass — attention / "warm"
private val Red = Color(0xFFC0452C)     // muted terracotta — urgency / "hot"
private val Purple = Color(0xFF75629B)  // softened plum — site visit
private val Cyan = Color(0xFF3E7F8A)    // muted sea — conversation flowing
private val Indigo = Color(0xFF4E7A8C)  // slate-sea — working / in progress
private val Slate = Color(0xFF5D6862)   // warm slate — neutral / cold
private val Bronze = Color(0xFF8A6D3B)  // muted bronze — negotiation, value
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
        "📞 Talked ${callLen(secs)} · $ago$many" to Green
    } else {
        "📞 No talk (${callLen(secs)}) · $ago$many" to Amber
    }
}

/** This lead's row from v_lead_workstate — action state plus the last real call. */
private fun AppState.workOf(c: Contact): LeadWork? = c.id?.let { workByLead[it] }

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
    ActionChip("call_now", "Call now", Color(0xFFC98A3E),
        "Ring these now. Due today, brand new, or nobody picked up last time."),
    ActionChip("overdue", "Overdue", Color(0xFFC0452C),
        "You said you would call earlier and the time has gone. Do these first."),
    ActionChip("due_today", "Due today", Color(0xFF3E7F8A),
        "Booked for later today. They come to Call now on their own, at their time."),
    ActionChip("scheduled", "Later", Color(0xFF5A62C9),
        "Booked for another day. Nothing to do now."),
    ActionChip("awaiting_visit", "Visit", Color(0xFF75629B),
        "Site visit is booked. Waiting for them to come."),
    ActionChip("no_next_step", "No step", Color(0xFF8A6D3B),
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
            Modifier.align(Alignment.CenterEnd).width(20.dp).height(28.dp)
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
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrElse { Color(0xFF6A7B85) }


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

private val Teal = Color(0xFF5A62C9)    // jade-adjacent: token money

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

/** A ready-to-send Hinglish opener so the rep doesn't retype the same intro 100×/day.
 *  [speaksAs] conjugates it to the REP — Hindi inflects the first person, so a
 *  fixed "kar raha hoon" was wrong for every woman on the team. */
private fun waTemplate(name: String?, project: String?, agent: String?, company: String?, speaksAs: String? = null): String {
    val sv = com.salesautocall.app.data.SelfVoice
    val hi = name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji," } ?: "Namaste,"
    val who = agent?.trim()?.ifBlank { null } ?: "aapka property advisor"
    val co = company?.trim()?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    val ref = project?.trim()?.takeIf { it.isNotBlank() }?.let { " Aapne $it ke liye enquiry ki thi." }
        ?: " Aapki property enquiry ke regarding."
    return "$hi ${sv.iAm(speaksAs)} $who$co se baat ${sv.doing(speaksAs, "kar")}.$ref " +
        "Property ki details aur best offer share karna ${sv.want(speaksAs)} — kya abhi baat kar sakte hain?"
}

@Composable
private fun StatTile(emoji: String, value: String, label: String, accent: Color, modifier: Modifier = Modifier) {
    // Flat, borderless tile: a quiet glyph, a bold value, a muted label. No
    // coloured tile, no heavy shadow — consistent with the lead cards.
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(emoji, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SectionHeader(title: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (actionLabel != null && onAction != null) {
            Text(actionLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable { onAction() })
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
private fun FilterTab(label: String, count: Int, selected: Boolean, accent: Color, onClick: () -> Unit) {
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
    val empty = count == 0 && !selected
    val bg = when {
        selected -> accent
        empty -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.20f)
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
    }
    val fg = when {
        selected -> Color.White
        empty -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        Modifier.height(28.dp).clip(RoundedCornerShape(9.dp)).background(bg)
            .then(if (empty) Modifier else Modifier.clickable { onClick() })
            .padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = fg, fontSize = 12.sp, maxLines = 1,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
        Spacer(Modifier.width(5.dp))
        Text("$count", fontSize = 11.sp, maxLines = 1, fontWeight = FontWeight.Bold,
            color = if (selected) Color.White.copy(alpha = 0.75f) else fg.copy(alpha = 0.7f))
    }
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
private fun parseBudgetRupees(s: String?): Double {
    if (s.isNullOrBlank()) return 0.0
    val t = s.lowercase().replace(",", "").trim()
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
 *  prints its own), turn underscores into spaces and collapse whitespace so an
 *  imported "₹5–10_लाख" reads as a clean "5–10 लाख". Ranges and native units
 *  ("लाख"/"Cr") stay intact. Null/blank in → null out. */
internal fun budgetLabel(s: String?): String? =
    s?.replace('_', ' ')?.replace(Regex("\\s+"), " ")?.trim()
        ?.trimStart('₹', ' ')?.trim()?.takeIf { it.isNotBlank() }

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
            Text(label, style = MaterialTheme.typography.bodySmall)
            Text("$value / $target", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = color)
        }
        Spacer(Modifier.height(4.dp))
        Box(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            Box(Modifier.fillMaxWidth(pct).height(7.dp).clip(RoundedCornerShape(50)).background(color))
        }
    }
}

@Composable
private fun PerformanceCard(app: AppState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            SectionHeader("Today's Performance")
            Spacer(Modifier.height(12.dp))
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

@Composable
private fun AiInsightCard(onOpenLeads: () -> Unit, hotUncontacted: Int) {
    // Subtle primary-tinted card with dark text + a text link — not a loud gradient.
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)).padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("AI Insight", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(2.dp))
                Text(
                    if (hotUncontacted > 0) "You have $hotUncontacted hot leads not contacted yet — call them to lift conversions."
                    else "You're on top of your hot leads. Keep the follow-ups flowing!",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Text("View your leads →", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelMedium, modifier = Modifier.clickable { onOpenLeads() })
            }
        }
    }
}

@Composable
fun HomeScreen(vm: MainViewModel, onOpenFollowUps: () -> Unit, onOpenLeads: () -> Unit, onNavigate: (String) -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadHome(); vm.loadLeads() }

    val firstName = app.profile?.fullName?.substringBefore(' ')?.takeIf { it.isNotBlank() } ?: "there"
    val due = vm.dueNowCount()
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
    // Today's Plan buckets — WHO asked for a callback, WHOSE visit is fixed,
    // WHOSE visit already happened. Names up front, not buried in statuses.
    val nowMs = System.currentTimeMillis()
    val callbacks = app.followUpList.sortedBy { instantMillis(it.dueAt) ?: Long.MAX_VALUE }
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

    Refreshable(onRefresh = { vm.loadHome(force = true); vm.loadLeads(force = true) }, modifier = Modifier.fillMaxSize()) {
    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Greeting hero
        item { GreetingCard(app, firstName, onOpenAttendance = { onNavigate("attendance") }) }

        // Calling Score — front and centre. The AI listens to the rep's calls and
        // gives an honest average score, so they see their calling quality first.
        app.callingScore?.let { score ->
            item {
                val stars = Math.round(score).toInt().coerceIn(1, 5)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                ) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                            Text("🎯", fontSize = 22.sp)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Calling Score", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer)
                            Text("AI ne aapki ${app.callingScoreCount} call${if (app.callingScoreCount == 1) "" else "s"} suni",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.75f))
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(String.format(java.util.Locale.US, "%.1f", score) + " / 5",
                                style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary)
                            Text("⭐".repeat(stars), fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // "No lead left behind" — interested leads without a reminder, fixed in one tap.
        if (unprotected.isNotEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Amber.copy(alpha = 0.12f)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                ) {
                    Row(
                        Modifier.clickable { vm.protectLeads(unprotected) }.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(Amber.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                            Text("🛡️", fontSize = 18.sp)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                "${unprotected.size} interested lead${if (unprotected.size == 1) "" else "s"} without a reminder",
                                style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold,
                            )
                            Text("Tap to protect all — follow-up tomorrow 10 AM",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Amber)
                    }
                }
            }
        }

        // TODAY'S PLAN — the rep's whole day, by what the customer said:
        // who asked for a callback, whose site visit is fixed, whose visit
        // happened (and now needs closing). Names first, statuses never.
        if (callbacks.isNotEmpty() || visitsPlanned.isNotEmpty() || visitsDone.isNotEmpty() ||
            visitsUnconfirmed.isNotEmpty()
        ) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        SectionHeader(
                            if (due > 0) "Today's Plan · $due due now" else "Today's Plan",
                            "All follow-ups", onOpenFollowUps,
                        )
                        PlanBucket(
                            emoji = "↻", title = "Asked to call back", color = Indigo,
                            rows = callbacks.take(3).map { f ->
                                PlanRow(f.name ?: f.phone, relativeDue(f.dueAt), f.note, f.phone,
                                    overdue = (instantMillis(f.dueAt) ?: Long.MAX_VALUE) <= nowMs)
                            },
                            more = callbacks.size - 3, onCall = { vm.dialManual(it) },
                        )
                        PlanBucket(
                            emoji = "🏠", title = "Site visit fixed", color = Purple,
                            rows = visitsPlanned.take(3).map { (c, _) ->
                                PlanRow(c.name ?: c.phone, dayLabel(c.siteVisitAt), c.siteVisitProject, c.phone)
                            },
                            more = visitsPlanned.size - 3, onCall = { vm.dialManual(it) },
                        )
                        PlanBucket(
                            emoji = "✅", title = "Visit done — close them", color = Teal,
                            rows = visitsDone.take(3).map { (c, _) ->
                                PlanRow(c.name ?: c.phone, dayLabel(c.siteVisitAt), c.siteVisitProject, c.phone)
                            },
                            more = visitsDone.size - 3, onCall = { vm.dialManual(it) },
                        )
                        // Asked, never asserted. These are the ones where the
                        // planned day came and went with nothing to show that
                        // anyone actually visited.
                        PlanBucket(
                            emoji = "❓", title = "Visit day gone — did they come?", color = Amber,
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
                                )
                            },
                            more = visitsUnconfirmed.size - 3, onCall = { vm.dialManual(it) },
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
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(Modifier.padding(16.dp)) {
                    SectionHeader("Lead Pipeline", "View all", onOpenLeads)
                    Spacer(Modifier.height(14.dp))
                    // One row per stage — full label, count, and a bar you can
                    // actually read. No wrapped words, no 7-way squeeze.
                    val maxCount = stageCounts.maxOf { it.second }.coerceAtLeast(1)
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
private fun darken(c: Color, f: Float): Color = Color(c.red * f, c.green * f, c.blue * f, c.alpha)

@Composable
private fun GreetingCard(app: AppState, firstName: String, onOpenAttendance: () -> Unit) {
    val a = app.attendance
    val onShift = a?.punchInAt != null && a.punchOutAt == null
    val done = a?.punchOutAt != null
    // White-label: the hero wears the company's brand colour + name.
    val brand = brandColorOf(app.company?.brandColor)
    val g0 = brand ?: Color(0xFF4353B8)
    val g1 = brand?.let { darken(it, 0.82f) } ?: Color(0xFF333A8F)
    val chipInk = brand?.let { darken(it, 0.82f) } ?: Color(0xFF333A8F)
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(g0, g1)))
            .padding(20.dp),
    ) {
        Column {
            app.company?.name?.takeIf { it.isNotBlank() }?.let { company ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    app.company?.logoUrl?.takeIf { it.isNotBlank() }?.let { logo ->
                        coil.compose.AsyncImage(
                            model = logo,
                            contentDescription = "$company logo",
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                            modifier = Modifier.size(30.dp).clip(RoundedCornerShape(8.dp))
                                .background(Color.White.copy(alpha = 0.15f)),
                        )
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(company.uppercase(), style = MaterialTheme.typography.labelMedium,
                        color = Color.White.copy(alpha = 0.9f), fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                }
                Spacer(Modifier.height(6.dp))
            }
            Text("Good day, $firstName 👋", style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Bold)
            Text("Real estate sales, simplified. Let's close some deals.",
                style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Attendance: opens the selfie + GPS check-in screen.
                val label = when { done -> "Shift done ✓"; onShift -> "Punch out"; else -> "Check in" }
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(Color.White)
                        .clickable { onOpenAttendance() }
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                ) {
                    Text(label, color = chipInk, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
                }
                Spacer(Modifier.width(12.dp))
                if (onShift) {
                    Text("On shift since ${timeOnly(a?.punchInAt)}", color = Color.White.copy(alpha = 0.9f),
                        style = MaterialTheme.typography.bodySmall)
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
    val detail: String?,
    val phone: String,
    val overdue: Boolean = false,
    /**
     * A yes/no the row is ASKING. Set only on "Visit day gone — did they come?",
     * where a Call button alone left the most important question in the funnel
     * unanswerable from the one screen a rep actually opens.
     */
    val onYes: (() -> Unit)? = null,
    val onNo: (() -> Unit)? = null,
)

/** A titled bucket inside Today's Plan (callbacks / visits fixed / visits done). */
@Composable
private fun PlanBucket(
    emoji: String,
    title: String,
    color: Color,
    rows: List<PlanRow>,
    more: Int,
    onCall: (String) -> Unit,
) {
    if (rows.isEmpty()) return
    Spacer(Modifier.height(12.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(emoji, fontSize = 13.sp)
        Spacer(Modifier.width(6.dp))
        Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = color)
    }
    Spacer(Modifier.height(6.dp))
    rows.forEachIndexed { i, r ->
        if (i > 0) Spacer(Modifier.height(6.dp))
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(color.copy(alpha = 0.07f))
                .padding(horizontal = 12.dp, vertical = 9.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                            maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false))
                        Spacer(Modifier.width(8.dp))
                        Text(r.whenLabel, style = MaterialTheme.typography.labelSmall,
                            color = if (r.overdue) Red else color, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                    r.detail?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                }
                // 44dp, not 34. IconButton is 48dp by default precisely so a
                // thumb can hit it; setting .size(34.dp) threw that away, and
                // this is the button a rep jabs at while holding a phone in one
                // hand. There is room on this row — it was small for looks.
                IconButton(onClick = { onCall(r.phone) }, modifier = Modifier.size(44.dp).clip(CircleShape).background(Green.copy(alpha = 0.12f))) {
                    Icon(Icons.Default.Call, contentDescription = "Call ${r.name}", tint = Green, modifier = Modifier.size(19.dp))
                }
            }
            // The answer, right where the question is asked. Two taps' worth of
            // information — did they turn up, and what now — collapsed into one.
            if (r.onYes != null && r.onNo != null) {
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                            .background(Green.copy(alpha = 0.16f))
                            .clickable { r.onYes.invoke() }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("✅  Yes, they came", style = MaterialTheme.typography.labelMedium,
                            color = Green, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                            .background(Slate.copy(alpha = 0.14f))
                            .clickable { r.onNo.invoke() }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("✖  Didn't come", style = MaterialTheme.typography.labelMedium,
                            color = Slate, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
        }
    }
    if (more > 0) {
        Spacer(Modifier.height(5.dp))
        Text("+$more more", style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp))
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
    dueNow: Int,
    hotCount: Int,
    newCount: Int,
    pipelineValue: Double,
    scoring: Boolean,
    reviveCount: Int,
    onRefresh: () -> Unit,
    onScore: () -> Unit,
    onSelect: () -> Unit,
    onDueNow: () -> Unit,
    onHot: () -> Unit,
    onNew: () -> Unit,
    onRevive: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val brand = brandColorOf(app.company?.brandColor)
    val g0 = brand ?: Color(0xFF4353B8)
    val g1 = darken(g0, 0.72f)
    // A SUMMARY STRIP, NOT A HERO.
    //
    // This was ~200dp: an eyebrow, a headline number, and four glass tiles in
    // their own row. On a 6-inch phone that plus two filter blocks left barely
    // one lead card on screen. It is now about 90dp — the same five facts, laid
    // out in two tight lines. Nothing was dropped; it just stopped shouting.
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(g0, g1)))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("PIPELINE · ${app.leads.size} LEADS", fontSize = 9.sp,
                        color = Color.White.copy(alpha = 0.55f), fontWeight = FontWeight.Bold,
                        letterSpacing = 1.2.sp, maxLines = 1)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            if (pipelineValue > 0) formatRupees(pipelineValue) else "${app.leads.size}",
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White, fontWeight = FontWeight.ExtraBold, maxLines = 1,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(if (pipelineValue > 0) "on the table" else "leads with you",
                            fontSize = 10.sp, color = Color.White.copy(alpha = 0.55f),
                            maxLines = 1, modifier = Modifier.padding(bottom = 2.dp))
                    }
                }
                Box(
                    Modifier.size(28.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.10f))
                        .clickable { onRefresh() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp)) }
                Spacer(Modifier.width(6.dp))
                Box {
                    Box(
                        Modifier.size(28.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.10f))
                            .clickable { menuOpen = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (scoring) CircularProgressIndicator(Modifier.size(13.dp), strokeWidth = 2.dp, color = Color.White)
                        else Icon(Icons.Default.MoreVert, contentDescription = "More", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
                    }
                    androidx.compose.material3.DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text(if (scoring) "Scoring…" else "AI Score leads") },
                            leadingIcon = { Icon(Icons.Default.AutoAwesome, contentDescription = null) },
                            onClick = { menuOpen = false; if (!scoring) onScore() },
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("Select leads") },
                            leadingIcon = { Icon(Icons.Default.Checklist, contentDescription = null) },
                            onClick = { menuOpen = false; onSelect() },
                        )
                    }
                }
            }
            Spacer(Modifier.height(7.dp))
            // The four counters, still one tap each, now one line instead of a
            // row of 60dp tiles.
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                DeckStat("⏰", dueNow, "Due", dueNow > 0, Modifier.weight(1f), onDueNow)
                DeckStat("🔥", hotCount, "Hot", false, Modifier.weight(1f), onHot)
                DeckStat("✨", newCount, "New", false, Modifier.weight(1f), onNew)
                if (reviveCount > 0) DeckStat("💎", reviveCount, "Revive", false, Modifier.weight(1f), onRevive)
            }
        }
    }
}

/** One glass counter on the deck — a number that is also a one-tap filter. */
@Composable
private fun DeckStat(emoji: String, value: Int, label: String, highlight: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    // One line, 26dp. Two-line tiles cost 60dp each and said nothing extra.
    Row(
        modifier.height(26.dp).clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = if (highlight) 0.26f else 0.12f))
            .clickable { onClick() }
            .padding(horizontal = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(emoji, fontSize = 10.sp)
        Spacer(Modifier.width(4.dp))
        Text("$value", fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1)
        Spacer(Modifier.width(4.dp))
        Text(label, fontSize = 9.5.sp, color = Color.White.copy(alpha = 0.8f), maxLines = 1)
    }
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
        Text("🎉", fontSize = 26.sp)
        Spacer(Modifier.height(6.dp))
        Text("All follow-ups done", style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold, color = Green)
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

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun LeadsScreen(vm: MainViewModel, onStartCampaign: () -> Unit) {
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
    var bucket by remember { mutableStateOf("stage:new") }
    var stageFilter by remember { mutableStateOf<String?>(null) } // exact stage from the sheet
    var quick by remember { mutableStateOf<String?>(null) }       // "today" | "retry"
    var tempFilter by remember { mutableStateOf<String?>(null) }  // null = all temps
    var sortBy by remember { mutableStateOf("default") }          // "default" | "score" | "recent"
    var sheetOpen by remember { mutableStateOf(false) }
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

    val base = when {
        stageFilter != null -> app.leads.filter { it.stage == stageFilter }
        quick == "today" -> app.leads.filter { isToday(it.createdAt) }
        quick == "retry" -> app.leads.filter { app.actionOf(it) == "call_now" }
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
        bucket == "followup" -> app.leads
            .filter { val a = app.actionOf(it); a == "overdue" || a == "call_now" }
            .sortedBy { fuOf(it)?.let { f -> instantMillis(f.dueAt) } ?: Long.MAX_VALUE }
        // Character-for-character the rule the deck's newCount uses.
        bucket == "new" -> app.leads.filter { it.stage == "new" }
        // Both axes read straight through. There is no client-side re-derivation
        // of either one: the stage is a column, the action state is a view, and
        // a second opinion computed here is exactly the drift being removed.
        bucket.startsWith("act:") ->
            app.leads.filter { app.actionOf(it) == bucket.removePrefix("act:") }
                // Soonest first, so the longest wait is at the top of the queue.
                .sortedBy { fuOf(it)?.let { f -> instantMillis(f.dueAt) } ?: Long.MAX_VALUE }
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

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    Column(Modifier.fillMaxSize()) {
        Refreshable(onRefresh = { vm.loadLeads(force = true); vm.loadFollowUps(force = true) }, modifier = Modifier.weight(1f)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            // Tighter side margins buy ~8dp of card width on a small phone, and
            // the bottom is deeper because the card now ENDS in buttons: the
            // last card's Call must never sit under the nav bar or the raised
            // dial button in front of it.
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 120.dp),
            // 11dp, not 7. The gap is what tells a rep the card has ended;
            // at 7 the list read as one sheet.
            verticalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            item {
                if (!selectMode) {
                    // The hero: a brand-gradient command deck — pipeline ₹ value
                    // plus three live counters that are also one-tap filters.
                    // Utilities (refresh / AI score / select) ride on the deck.
                    // Four full sweeps of the lead list, one of them parsing a
                    // rupee string per lead. None of it changes unless the leads
                    // themselves do, so it must not re-run on every keystroke in
                    // the search box or every tap of a filter chip — which is
                    // what it did, on the main thread, before this remember.
                    val deck = remember(app.leads, app.followUpList, nowMs / 60_000) {
                        // Exactly the Follow-up tab's "Call now" rule, because
                        // that is where this counter now sends the rep. It used
                        // to count rows in the follow_ups table instead, which
                        // included callbacks on closed and booked leads — the
                        // same "summary disagrees with the tab it links to"
                        // problem the New count below already had to be fixed for.
                        // Work only — overdue plus due-now. Never the whole tab: a
                        // count that includes next week's plan cannot go down however
                        // hard a rep works, and a number that never moves is a number
                        // nobody reads.
                        // Same function Home's badge uses — see dueNowCount().
                        // Two copies of this rule is how the two screens came to
                        // disagree about the same question.
                        val dueNow = vm.dueNowCount()
                        val hotCount = app.leads.count { it.temperature == "hot" && !isFinished(app.leadStages, it.stage) }
                        val pipelineValue = app.leads
                            .filter { it.status !in DEAD_STATUSES }
                            .sumOf { parseBudgetRupees(it.budget) }
                        // RAG v13 candidates: said-no + tried-and-gone-cold. Never DNC.
                        val reviveCount = app.leads.count {
                            it.status in SAID_NO ||
                                (it.temperature == "cold" && it.attempts >= 2 && it.status !in BOOKED_OR_DNC)
                        }
                        DeckStats(dueNow, hotCount, reviveCount, pipelineValue)
                    }
                    LeadsDeck(
                        app = app,
                        dueNow = deck.dueNow,
                        hotCount = deck.hotCount,
                        // Same rule as the New tab below. These two used to disagree
                        // (the card counted leads the tab had already drained into
                        // Today), so the summary said 12 New and the tab showed 8.
                        // Must stay character-for-character the same rule as the New
                        // tab below — a summary card that disagrees with the tab it
                        // links to has already caused one "12 vs 8" bug report.
                        newCount = app.leads.count { it.stage == "new" },
                        pipelineValue = deck.pipelineValue,
                        scoring = app.aiScoringLeads,
                        reviveCount = deck.reviveCount,
                        onRefresh = { vm.loadLeads(force = true); vm.loadFollowUps(force = true) },
                        onScore = { vm.scoreLeads() },
                        onSelect = { selectMode = true },
                        // "Due now" lands on Follow-up, which opens on Call now
                        // — the list this number counts. It used to drop the rep
                        // into New, where none of these leads live any more.
                        onDueNow = { bucket = "followup"; stageFilter = null; quick = null; tempFilter = null },
                        onHot = { tempFilter = if (tempFilter == "hot") null else "hot" },
                        onNew = { bucket = "new"; stageFilter = null; quick = null; tempFilter = null },
                        onRevive = { reviveOpen = true; vm.loadSecondChance() },
                    )
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
            // Search + Filters: one slim row. Everything fine-grained hides in the sheet.
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Search is the fastest way to a specific lead, so it has to
                    // look like something you can type in. The old borderless
                    // pill read as decoration; this one has a real edge and a
                    // little lift under it.
                    val searchAccent = if (androidx.compose.foundation.isSystemInDarkTheme()) Color(0xFF8189E6) else Color(0xFF4353B8)
                    OutlinedTextField(
                        query, { query = it },
                        placeholder = { Text("Search name or phone", fontSize = 13.sp) },
                        textStyle = MaterialTheme.typography.bodyMedium,
                        // 46dp and inset from the edge. At 52dp full-bleed it was
                        // the biggest thing on the screen after the header, and a
                        // rep searches perhaps twice an hour — it should be easy
                        // to hit, not the first thing the eye lands on.
                        singleLine = true, shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).height(46.dp)
                            .shadow(1.dp, RoundedCornerShape(12.dp), clip = false),
                        leadingIcon = {
                            Icon(Icons.Default.Search, contentDescription = null,
                                tint = searchAccent, modifier = Modifier.size(20.dp))
                        },
                        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                            focusedBorderColor = searchAccent,
                        ),
                    )
                    val filtersOn = stageFilter != null || tempFilter != null || quick != null || sortBy != "default"
                    // Same shape and height as the search field and the chips —
                    // one visual language, not a stray circle.
                    Box(
                        Modifier.height(46.dp).width(46.dp).clip(RoundedCornerShape(12.dp))
                            .background(if (filtersOn) searchAccent else MaterialTheme.colorScheme.surface)
                            .border(1.dp, if (filtersOn) searchAccent else MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                            .clickable { sheetOpen = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Sort, contentDescription = "Filters",
                            tint = if (filtersOn) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(19.dp))
                    }
                }
            }
            // ── The two rows, compact ───────────────────────────────────
            //
            // These WRAPPED, and on a real phone the two blocks ate roughly a
            // thousand pixels — about forty percent of the screen — leaving one
            // lead card half-visible at the bottom. Nothing was cut off and
            // nothing could be read either, which is the worse trade: a rep
            // opens this screen to see LEADS.
            //
            // So: one line each, scrolled sideways, with a fade at the right
            // edge that says there is more. That is the alternative you offered
            // when you said "either wrap, or one row with a clear swipe hint and
            // edge fade" — on a 5-inch screen only the second one survives.
            item {
                CompactFilterRow {
                    ACTIONS.forEach { a ->
                        val n = app.leads.count { app.actionOf(it) == a.code }
                        val key = "act:${a.code}"
                        FilterTab(a.label, n, bucket == key && stageFilter == null && quick == null, a.color) {
                            bucket = key; stageFilter = null; quick = null
                        }
                    }
                }
            }
            item {
                CompactFilterRow {
                    FilterTab("All", app.leads.size, bucket == "all" && stageFilter == null && quick == null,
                        MaterialTheme.colorScheme.primary) { bucket = "all"; stageFilter = null; quick = null }
                    app.leadStages.filter { it.repVisible }.forEach { st ->
                        val n = app.leads.count { it.stage == st.code }
                        val key = "stage:${st.code}"
                        FilterTab(st.shortLabel.ifBlank { st.label }, n,
                            bucket == key && stageFilter == null && quick == null, parseHex(st.color)) {
                            bucket = key; stageFilter = null; quick = null
                        }
                    }
                }
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
                    else -> "Every lead assigned to you, whatever stage it is at."
                }
                if (!hint.isNullOrBlank()) {
                    item {
                        Text(hint, fontSize = 11.5.sp, lineHeight = 14.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                    quick?.let { q -> add(Triple("quick", if (q == "today") "Added today" else "Retry") { quick = null }) }
                    tempFilter?.let { t -> add(Triple("temp", when (t) { "hot" -> "🔥 Hot"; "warm" -> "🌤 Warm"; else -> "❄️ Cold" }) { tempFilter = null }) }
                    if (sortBy != "default") add(Triple("sort", if (sortBy == "score") "AI Score ↓" else "Newest first") { sortBy = "default" })
                }
                if (active.isNotEmpty()) {
                    item {
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
                item {
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
                    item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                // An empty Follow-up tab is not "nothing matches your filter" —
                // it is a rep who has no calls waiting, which is the best news
                // the screen can give her. Say that instead of a shrug.
                filtered.isEmpty() && isActionQueue ->
                    item(key = "fu_clear_all") { FollowUpAllClear(0) }
                filtered.isEmpty() ->
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 40.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(if (app.leads.isEmpty()) "📇" else "🔎", fontSize = 34.sp)
                            Spacer(Modifier.height(10.dp))
                            Text(if (app.leads.isEmpty()) "No leads yet" else "Nothing here",
                                style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                if (app.leads.isEmpty()) "Ask your admin to assign leads — they'll appear here, ready to call."
                                else "No leads match this view. Try another tab or clear the filters.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            )
                        }
                    }
                else -> {
                    val leadCard: @Composable (Contact) -> Unit = { c ->
                        LeadCard(
                            stages = app.leadStages,
                            work = app.workOf(c),
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
                                openWhatsApp(context, c.phone,
                                    waTemplate(c.name, c.companyName, app.profile?.fullName,
                                        app.company?.name, app.profile?.speaksAs))
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
                    if (fuCallNow.isEmpty() && (bucket == "act:call_now" || bucket == "followup") && filtered.isEmpty()) {
                        item(key = "fu_clear") { FollowUpAllClear(app.leads.count { app.actionOf(it) == "scheduled" }) }
                    } else {
                        items(filtered, key = { it.id ?: it.phone }) { c -> leadCard(c) }
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

    // THE one action on this screen: power-dial whatever is in view.
    //
    // On Follow-up that means the calls that are DUE — never the ones booked
    // for next Tuesday or the ones already done today. "Call 107" on a tab
    // where 24 are actually due would dial customers at the wrong time, and
    // ring people the rep has already spoken to today.
    // Never the whole list. A stage tab is a report, not a call queue.
    val dialList = if (isActionQueue) filtered else emptyList()
    if (!selectMode && dialList.isNotEmpty()) {
        androidx.compose.material3.ExtendedFloatingActionButton(
            onClick = { vm.callList(dialList, "Leads") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            icon = { Icon(Icons.Default.Call, contentDescription = null) },
            text = { Text("Call ${dialList.size}", fontWeight = FontWeight.Bold) },
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
                    listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold").forEach { (key, label) ->
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
                    listOf("today" to "Added today", "retry" to "Retry (no answer/busy)").forEach { (key, label) ->
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
                    Text("💎", fontSize = 22.sp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Second Chance", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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
                                        Text("SAY THIS 👇", style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Bold, color = Green, letterSpacing = 0.5.sp)
                                        Spacer(Modifier.height(3.dp))
                                        Text(p.opener, style = MaterialTheme.typography.bodySmall, lineHeight = 18.sp)
                                    }
                                }
                                Spacer(Modifier.height(9.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        Modifier.clip(RoundedCornerShape(50)).background(Green)
                                            .clickable { vm.dialManual(c.phone) }.padding(horizontal = 18.dp, vertical = 8.dp),
                                    ) { Text("📞 Call", color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold) }
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
        )
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
                    thread.isEmpty() -> Text("No messages yet. Say hello 👋", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        "👋 Hello" to "Hi $who, this is calling from our team. How can I help you today?",
                        "📄 Brochure" to "Hi $who, I'm sharing our project brochure with you. Please check and let me know if you have any questions.",
                        "📅 Meeting" to "Hi $who, shall we schedule a site visit? Please let me know a convenient date and time.",
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
    followUp: FollowUp? = null,
    cloudOn: Boolean,
    selectMode: Boolean = false,
    isSelected: Boolean = false,
    /** This lead was just called and nothing was recorded — its Update shakes. */
    needsUpdate: Boolean = false,
    /** Another lead in the same list has the exact same name — show the last
     *  four digits beside it so the rep can tell which person this is. */
    sharesName: Boolean = false,
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
    val jade = if (androidx.compose.foundation.isSystemInDarkTheme()) Color(0xFF8189E6) else Color(0xFF4353B8)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    // The one line the rep actually needs — what the customer said / promised.
    val now = System.currentTimeMillis()
    val visitMs = c.siteVisitAt?.let { instantMillis(it) }
    val intent: Pair<String, Color>? = when {
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
                    "🎤 ${note.removePrefix("AI:").removePrefix("ai:").trim()}"
                note.contains("Attempt", ignoreCase = true) -> "🔁 Nobody picked up"
                note.isNotEmpty() -> "📝 $note"
                else -> "↻ You promised a call back"
            }
            val whenText = if (late) relativeDue(followUp.dueAt)
                           else "${dayLabel(followUp.dueAt)} ${timeOnly(followUp.dueAt)}"
            "$why · $whenText" to (if (late) Red else jade)
        }
        visitMs != null && visitMs >= now -> "🏠 Site visit · ${dayLabel(c.siteVisitAt)}" to Purple
        // The same "a passed date is not attendance" rule Home uses. This line
        // was the second place claiming a visit had happened when all that had
        // happened was the date going by, and it is the one a rep reads on every
        // single row. Done needs the on-site check-in or a stage that only
        // follows a real visit; otherwise it asks.
        visitMs != null && !isFinished(stages, c.stage) &&
            (c.siteVisitArrivedAt != null || c.status in AFTER_VISIT) ->
            "✅ Visit done — close them" to Teal
        visitMs != null && !isFinished(stages, c.stage) ->
            "❓ Visit day gone (${dayLabel(c.siteVisitAt)}) — did they come?" to Amber
        !c.aiNextAction.isNullOrBlank() -> "✦ ${c.aiNextAction}" to Indigo
        !c.notes.isNullOrBlank() -> c.notes!! to muted
        // (budget lives on the phone line now — never repeated here)
        else -> null
    }
    val (tempLabel, tempColor) = when (c.temperature) {
        "hot" -> "🔥 Hot" to Red
        "warm" -> "☀ Warm" to Amber
        "cold" -> "❄ Cold" to Slate
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
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(container)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f), RoundedCornerShape(14.dp))
            .then(if (selectMode) Modifier.clickable { onToggleSelect() } else Modifier.clickable { onOpen() })
            .padding(horizontal = 12.dp, vertical = 10.dp),
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
                        c.name?.takeIf { it.isNotBlank() } ?: prettyPhone(c.phone),
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
                // Money, second and prominent — the number a rep sorts by.
                budgetLabel(c.budget)?.let {
                    Text("₹ $it", style = MaterialTheme.typography.bodyMedium, color = jade,
                        fontWeight = FontWeight.Bold, maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("📞 ${prettyPhone(c.phone)}", fontSize = 12.sp, color = muted,
                        letterSpacing = 0.2.sp, maxLines = 1)
                    if (c.attempts > 0) {
                        val due = followUp?.let { instantMillis(it.dueAt) }
                        Text("  🔁 ${c.attempts + 1}", fontSize = 12.sp,
                            color = if (due != null && due <= now) Red else Amber,
                            fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                    c.closeProbability?.let { pct ->
                        Text("  🎯 $pct%", fontSize = 12.sp,
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
                    Text(text, fontSize = 11.5.sp, color = tint,
                        fontWeight = FontWeight.Medium, maxLines = 1)
                }
                // Project and area. Two lines, because real project names are
                // long and "Kunj Vihari, Bridge Vat…" tells a rep less than
                // nothing — they cannot tell which of two sites this lead asked
                // about.
                val extras = listOfNotNull(
                    c.companyName?.takeIf { it.isNotBlank() }?.let { "🏢 $it" },
                    c.territory?.takeIf { it.isNotBlank() }?.let { "📍 $it" },
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

        if (!selectMode) {
            Spacer(Modifier.height(9.dp))
            // ONE ACTION ROW, full width. Update shakes when this lead's call
            // has just ended with nothing written down — that wobble is the
            // whole replacement for the post-call popup on SIM calls.
            Row(verticalAlignment = Alignment.CenterVertically) {
                val updateTint = if (needsUpdate) Amber else MaterialTheme.colorScheme.primary
                Row(
                    Modifier.nudgeShake(needsUpdate).weight(1f).height(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(updateTint.copy(alpha = if (needsUpdate) 0.20f else 0.10f))
                        .clickable { onUpdate() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(if (needsUpdate) "✎ Update call" else "✎ Update", fontSize = 12.5.sp,
                        color = updateTint, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                Spacer(Modifier.width(7.dp))
                Row(
                    Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(10.dp))
                        .background(WaGreen.copy(alpha = 0.12f))
                        .clickable { onWhatsApp() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Default.Chat, contentDescription = null, tint = WaGreen, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("WhatsApp", fontSize = 12.5.sp, color = WaGreen, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                Spacer(Modifier.width(7.dp))
                // Calling is the job. Solid, widest, unmistakable.
                Row(
                    Modifier.weight(1.25f).height(38.dp).clip(RoundedCornerShape(10.dp))
                        .background(jade)
                        .clickable { if (cloudOn) onCloudCall() else onCall() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Default.Call, contentDescription = "Call", tint = Color.White, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Call", fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1)
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
        title = {
            Column {
                Text(if (manual) "Update lead" else "Call ended",
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(who, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        text = {
            if (scheduleFor == null) {
                Column(Modifier.verticalScroll(rememberScrollState())) {
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
                    // Temperature (optional, one tap) — call hot leads back first.
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TEMPERATURES.forEach { (key, label) ->
                            val on = temp == key
                            Box(
                                Modifier.weight(1f).clip(RoundedCornerShape(50))
                                    .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                                    .clickable { temp = if (on) null else key }.padding(vertical = 7.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                    style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(note, { note = it }, label = { Text("Add a note (optional)") },
                        singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    // Third way to answer the prompt: just say it. Fastest of all
                    // between two calls, and it counts exactly like a status pick.
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
                        DispoButton("🎤  Record voice note", Indigo.copy(alpha = 0.12f), Indigo, Modifier.fillMaxWidth()) {
                            vm.startVoiceNote()
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    // Two different questions, never both at once. A call that never
                    // connected has no funnel stage to pick — offering "Booked" there
                    // is what made this screen a wall of buttons nobody read. The app
                    // already knows whether the call connected, so it asks the one
                    // question that applies and shows only those answers.
                    Text(
                        if (connected) "Where is this lead now?" else "Why didn't it connect?",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        if (connected) "Pick the stage — this moves the lead in your funnel."
                        else "Pick a reason — the lead stays in your calling list.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))

                    // Every button the same size, two to a row: nothing wraps, nothing
                    // looks bigger than anything else.
                    val choices: List<Triple<String, Color, () -> Unit>> = if (connected) {
                        listOf(
                            Triple("⭐  Interested", Green, { scheduleFor = "interested" }),
                            Triple("↻  Call back later", Indigo, { scheduleFor = "callback" }),
                            Triple("🏠  Site visit", Purple, { dispose("site_visit") }),
                            Triple("🤝  Negotiating", Purple, { dispose("negotiation") }),
                            Triple("💰  Token paid", Teal, { dispose("token_paid") }),
                            Triple("✅  Booked", Teal, { dispose("booked") }),
                            Triple("❌  Not interested", Slate, { dispose("not_interested") }),
                            Triple("🚫  Do not call", Red, { dispose("dnc") }),
                        )
                    } else {
                        listOf(
                            Triple("📵  No answer", Red, { dispose("no_answer") }),
                            Triple("⏳  Busy", Amber, { dispose("busy") }),
                            Triple("📴  Switched off", Slate, { dispose("no_answer") }),
                            Triple("🙅  Wrong person", Amber, { dispose("wrong_person") }),
                            Triple("✖️  Wrong number", Red, { dispose("dnc") }),
                            Triple("↻  Call back later", Indigo, { scheduleFor = "callback" }),
                        )
                    }
                    choices.chunked(2).forEach { pair ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { (label, color, onTap) ->
                                DispoButton(label, color.copy(alpha = 0.12f), color, Modifier.weight(1f), onTap)
                            }
                            // Keeps the last row's single button the same width as the rest.
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            } else {
                val interested = scheduleFor == "interested"
                // Inline quick-snooze — carries the temp + note, and stamps the
                // right status so an Interested lead stays "interested".
                QuickScheduleChips(
                    who = who,
                    headline = if (interested) "⭐ Interested — when will you call again?" else "When should we remind you?",
                    onPick = { millis, n ->
                        vm.postCallScheduleFollowUp(millis, n ?: note.ifBlank { null }, temp, scheduleFor ?: "callback")
                    },
                    onBack = { scheduleFor = null },
                    onSkip = if (interested) ({ dispose("interested") }) else null,
                    skipLabel = "Save without a reminder",
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
@Composable
fun FollowUpsScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadFollowUps(); vm.loadLeads() }

    var rescheduleFor by remember { mutableStateOf<FollowUp?>(null) }
    // Ticks once a minute, so a callback whose time arrives while the rep is
    // looking at this screen walks into Call now by itself. It used to need the
    // rep to leave and come back — which is how a callback booked for 3 PM got
    // rung at 3:40 and the screen took the blame for being "late".
    val now = rememberNowTick()
    val all = app.followUpList

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
    val leadById = remember(app.leads) { app.leads.mapNotNull { l -> l.id?.let { it to l } }.toMap() }

    // Bucketed in ONE pass, and only when the list or the minute actually
    // changes. `now` is a key because these are clock questions — that is the
    // whole point of the tick — but the answer is computed once per tick, not
    // once per frame.
    val buckets = remember(parsed, now) {
        val toCallL = ArrayList<FuAt>(); val laterL = ArrayList<FuAt>()
        val tomorrowL = ArrayList<FuAt>(); val weekL = ArrayList<FuAt>()
        val overdueL = ArrayList<FuAt>()
        val weekEnd = now + 7L * 24 * 3600_000L
        for (x in parsed) {
            // ONE list for "what do I call now": every callback whose time has
            // come, whether it fell due an hour ago or last Tuesday. Splitting
            // these apart is what confused the reps — a rep with nothing dated
            // today but twenty-four waiting from last week opened Follow Ups
            // and saw an EMPTY LIST.
            if (x.ms <= now) {
                toCallL.add(x)
                // Older than today: what the bulk-reschedule button acts on.
                if (x.ms < now && x.day != "Today") overdueL.add(x)
            } else {
                if (x.day == "Today") laterL.add(x)
                if (x.ms <= weekEnd) weekL.add(x)
            }
            // Tomorrow gets its own tab because that is how a telecaller plans
            // — "kal kisko karna hai" is a real question, and it was buried
            // inside a 7-day list.
            if (x.day == "Tomorrow") tomorrowL.add(x)
        }
        val byTime = compareBy<FuAt> { it.ms }
        listOf(toCallL, laterL, tomorrowL, weekL).forEach { it.sortWith(byTime) }
        listOf(toCallL, laterL, tomorrowL, weekL, overdueL)
    }
    val toCall = buckets[0].map { it.f }
    val laterToday = buckets[1].map { it.f }
    val tomorrow = buckets[2].map { it.f }
    val weekList = buckets[3].map { it.f }
    val overdueStrict = buckets[4].map { it.f }
    // Map them to lead rows so we can power-dial back-to-back — one map hit
    // each, not a scan of the whole lead list per row.
    val dueContacts = remember(buckets, leadById) {
        buckets[0].mapNotNull { it.f.contactId?.let { id -> leadById[id] } }
    }

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
    val shown = when (filter) {
        "tocall" -> toCall
        "later" -> laterToday
        "tomorrow" -> tomorrow
        "week" -> weekList
        else -> allSorted
    }
    val blurb = when (filter) {
        "tocall" -> "Their time has come — oldest first. Call these now."
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
                Text("Follow Ups", style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                IconButton(onClick = { vm.loadFollowUps(force = true) }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh", modifier = Modifier.size(19.dp))
                }
                TextButton(
                    onClick = onBack,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp),
                ) { Text("Back", fontSize = 13.sp) }
            }
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
                CompactFilterRow {
                    FilterTab("Call now", toCall.size, filter == "tocall", Red) { picked = "tocall" }
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
        // The one button that does the day's work, and the one that admits
        // defeat, in that order. "Auto queue mode" was a full card with an icon
        // circle, a title and a subtitle wrapped around a button — three lines
        // of explanation for a thing whose whole meaning fits on the button.
        if (dueContacts.isNotEmpty() || overdueStrict.isNotEmpty()) {
            item {
                Column {
                    if (dueContacts.isNotEmpty()) {
                        Row(
                            Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.primary)
                                .clickable { vm.callList(dueContacts, "Due follow-ups") },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null,
                                tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(7.dp))
                            Text("Call all ${dueContacts.size} due, one after another",
                                color = Color.White, fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    }
                    if (overdueStrict.isNotEmpty()) {
                        Spacer(Modifier.height(7.dp))
                        Text(
                            "${overdueStrict.size} left over from before today — tap to move them all to tomorrow 10 AM",
                            fontSize = 11.5.sp, color = Red, fontWeight = FontWeight.Medium,
                            lineHeight = 15.sp,
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                .clickable {
                                    val tomorrow10 = java.time.ZonedDateTime.now().plusDays(1)
                                        .withHour(10).withMinute(0).withSecond(0).toInstant().toEpochMilli()
                                    vm.rescheduleFollowUps(overdueStrict, tomorrow10)
                                }
                                .padding(vertical = 4.dp),
                        )
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
                        all.isEmpty() -> "No callbacks scheduled. Book one from any lead."
                        toCall.isNotEmpty() -> "Nothing in this list — but ${toCall.size} are waiting in Call now."
                        filter == "tocall" -> "All caught up. Nothing to call right now. 👍"
                        else -> "Nothing in this list."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(shown, key = { it.id ?: it.phone }) { f ->
                val cid = f.contactId
                FollowUpCard(
                    f = f,
                    now = now,
                    onCall = { vm.dialManual(f.phone) },
                    onWhatsApp = { openWhatsApp(context, f.phone, waTemplate(f.name, null, app.profile?.fullName, app.company?.name, app.profile?.speaksAs)) },
                    onSnooze = { f.id?.let { vm.snoozeFollowUp(it, 1) } },
                    onReschedule = { rescheduleFor = f },
                    onUpdate = if (cid == null) null else fun() { vm.openFollowUpUpdate(cid, f.phone, f.name, f.id) },
                    onDone = { f.id?.let { vm.completeFollowUp(it) } },
                    needsUpdate = cid != null && app.pendingUpdates.any { it.contactId == cid },
                )
            }
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
            "🎤 ${note.removePrefix("AI:").removePrefix("ai:").trim()}"
        // The no-answer ladder books these, and the note already counts the try.
        note.contains("Attempt", ignoreCase = true) -> "🔁 Nobody picked up — $note"
        note.isNotEmpty() -> "📝 You said: $note"
        else -> "↻ You booked a call back"
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
    needsUpdate: Boolean = false,
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
    val jade = if (androidx.compose.foundation.isSystemInDarkTheme()) Color(0xFF8189E6) else Color(0xFF4353B8)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val accent = if (overdue) Red else jade
    val who = f.name?.takeIf { it.isNotBlank() } ?: prettyPhone(f.phone)

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f), RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                    .background(muted.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(initialsOf(f.name ?: f.phone), style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold, color = muted)
            }
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Text(who, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                Text("📞 ${prettyPhone(f.phone)}", fontSize = 12.sp, color = muted,
                    letterSpacing = 0.2.sp, maxLines = 1)
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Pill(relativeDue(f.dueAt), accent, accent.copy(alpha = 0.12f))
                Spacer(Modifier.height(3.dp))
                Text("${dayLabel(f.dueAt)} ${timeOnly(f.dueAt)}", fontSize = 10.5.sp,
                    color = muted, maxLines = 1)
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
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .background(accent.copy(alpha = 0.09f))
                .padding(horizontal = 9.dp, vertical = 7.dp),
        ) {
            Text(whyThisCallback(f), fontSize = 12.sp, color = accent,
                fontWeight = FontWeight.Medium, lineHeight = 16.sp, maxLines = 3,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(9.dp))
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
                val updateTint = if (needsUpdate) Amber else MaterialTheme.colorScheme.primary
                Row(
                    Modifier.nudgeShake(needsUpdate).weight(1f).height(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(updateTint.copy(alpha = if (needsUpdate) 0.20f else 0.10f))
                        .clickable { onUpdate() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(if (needsUpdate) "✎ Update call" else "✎ Update", fontSize = 12.5.sp,
                        color = updateTint, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            } else {
                // Not linked to a lead, so there is no funnel to move — ticking
                // the callback off is genuinely all this can do.
                Row(
                    Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
                        .clickable { onDone() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text("✓ Done", fontSize = 12.5.sp, color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
            Spacer(Modifier.width(7.dp))
            Row(
                Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(10.dp))
                    .background(WaGreen.copy(alpha = 0.12f))
                    .clickable { onWhatsApp() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Default.Chat, contentDescription = null, tint = WaGreen, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
                Text("WhatsApp", fontSize = 12.5.sp, color = WaGreen, fontWeight = FontWeight.Bold, maxLines = 1)
            }
            Spacer(Modifier.width(7.dp))
            Row(
                Modifier.weight(1.25f).height(38.dp).clip(RoundedCornerShape(10.dp))
                    .background(jade)
                    .clickable { onCall() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Default.Call, contentDescription = "Call", tint = Color.White, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Call", fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
        // "Not now" lives here — small, plain and out of the way of the three
        // buttons that move work forward.
        Spacer(Modifier.height(7.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🕒 In 1 hour", fontSize = 11.5.sp, color = muted, fontWeight = FontWeight.Medium,
                modifier = Modifier.clip(RoundedCornerShape(7.dp)).clickable { onSnooze() }
                    .padding(horizontal = 6.dp, vertical = 3.dp))
            Spacer(Modifier.width(10.dp))
            Text("📅 Pick another time", fontSize = 11.5.sp, color = muted, fontWeight = FontWeight.Medium,
                modifier = Modifier.clip(RoundedCornerShape(7.dp)).clickable { onReschedule() }
                    .padding(horizontal = 6.dp, vertical = 3.dp))
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
                        Box(Modifier.clip(RoundedCornerShape(50))
                            .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { vm.setLeaderboardPeriod(key) }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                            Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.labelMedium)
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
