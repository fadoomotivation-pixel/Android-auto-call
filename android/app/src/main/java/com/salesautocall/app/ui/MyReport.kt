package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.PhoneCallback
import androidx.compose.material.icons.filled.PhoneMissed
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.ui.graphics.vector.ImageVector
import com.salesautocall.app.ui.design.AccentHeader
import com.salesautocall.app.ui.design.Brand
import com.salesautocall.app.ui.design.GradientIconTile
import com.salesautocall.app.ui.design.TileTone
import com.salesautocall.app.ui.design.Tiles
import com.salesautocall.app.ui.design.gradientCard
import com.salesautocall.app.ui.design.softCard
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadStage
import com.salesautocall.app.data.Repository
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.EmptyState
import com.salesautocall.app.ui.design.GhostButton
import com.salesautocall.app.ui.design.IosGroup
import com.salesautocall.app.ui.design.IosNavBar
import com.salesautocall.app.ui.design.IosRow
import com.salesautocall.app.ui.design.IosSeparator
import com.salesautocall.app.ui.design.LoadingRows
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.iosPress
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

// ─────────────────────────────────────────────────────────────────────────────
// My report — one telecaller's day, any day.
//
// NOT a second set of numbers. Calls, talk time and follow-ups come straight
// from rep_day_facts(uid, date): the SQL function the 7pm review and
// rep_day_score() already print from. The phone only divides (average call)
// and subtracts (not connected) — it never recounts call_logs on its own.
// "Leads called, by stage" is the one thing that SQL does not return: it is
// the same IST day of call_logs (same created_at window), grouped by each
// lead's current stage from lead_stages.
// ─────────────────────────────────────────────────────────────────────────────

/** The day's numbers. Null fields mean "not returned", never zero. */
data class DayReport(
    val attempted: Int,
    val connected: Int,
    val talkSeconds: Int,
    val followupsDone: Int?,
    val followupsMissed: Int?,
    val followupsDue: Int?,
) {
    val notConnected: Int get() = (attempted - connected).coerceAtLeast(0)
    /** Average CONNECTED call. Null when nothing connected — "—", not 0:00. */
    val avgSeconds: Int? get() = if (connected > 0) talkSeconds / connected else null
}

/** Reads rep_day_facts() JSON. Null if the call counts are missing. */
internal fun parseDayReport(obj: JsonObject?): DayReport? {
    if (obj == null) return null
    fun n(k: String): Int? = runCatching { obj[k]?.jsonPrimitive?.intOrNull }.getOrNull()
    val dialled = n("dialled") ?: return null
    val connected = n("connected") ?: return null
    return DayReport(
        attempted = dialled.coerceAtLeast(0),
        connected = connected.coerceIn(0, dialled.coerceAtLeast(0)),
        talkSeconds = (n("talk_seconds") ?: 0).coerceAtLeast(0),
        followupsDone = n("followups_completed"),
        followupsMissed = n("followups_missed"),
        followupsDue = n("followups_scheduled"),
    )
}

/** One stage row of "Leads called". [color] is the lead_stages hex. */
data class StageCount(val code: String, val label: String, val color: String?, val count: Int)

/**
 * Distinct leads called that day, grouped by each lead's CURRENT stage, in
 * lead_stages order. A called lead that is not in this phone's list (handed
 * over, or not loaded) is counted under "Not in your list" — never dropped.
 * Calls with no lead (off-CRM numbers) are not leads and are left out here;
 * they are still inside "Attempted", exactly as rep_day_facts counts them.
 */
internal fun leadStatusCounts(
    calls: List<CallLog>,
    leadsById: Map<String, Contact>,
    stages: List<LeadStage>,
): List<StageCount> {
    val ids = calls.mapNotNull { it.contactId?.takeIf { id -> id.isNotBlank() } }.toSet()
    if (ids.isEmpty()) return emptyList()
    val byStage = HashMap<String, Int>()
    var unknown = 0
    for (id in ids) {
        val stage = leadsById[id]?.stage?.takeIf { it.isNotBlank() }
        if (stage == null) unknown++ else byStage[stage] = (byStage[stage] ?: 0) + 1
    }
    val known = stages.sortedBy { it.sortOrder }
        .mapNotNull { st -> byStage[st.code]?.let { StageCount(st.code, st.label, st.color, it) } }
    val knownCodes = known.map { it.code }.toSet()
    // A stage code the stage table does not list still shows, by its code.
    val stray = byStage.filterKeys { it !in knownCodes }.toSortedMap()
        .map { (code, n) -> StageCount(code, code.replace('_', ' ').replaceFirstChar { it.uppercase() }, null, n) }
    val tail = if (unknown > 0) listOf(StageCount("_unknown", "Not in your list", null, unknown)) else emptyList()
    return known + stray + tail
}

/** 0s · 45s · 4m 05s · 1h 02m. */
internal fun formatTalk(seconds: Int?): String {
    if (seconds == null) return "—"
    val s = seconds.coerceAtLeast(0)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return when {
        h > 0 -> "${h}h ${"%02d".format(m)}m"
        m > 0 -> "${m}m ${"%02d".format(sec)}s"
        else -> "${sec}s"
    }
}

/** 0-100, or null when nothing was dialled. */
internal fun connectPercent(r: DayReport): Int? =
    if (r.attempted > 0) (r.connected * 100 + r.attempted / 2) / r.attempted else null

private val IST: java.time.ZoneId = java.time.ZoneId.of("Asia/Kolkata")
private val DAY_FMT = java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM yyyy", java.util.Locale.ENGLISH)

@Composable
fun MyReportScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    val today = remember { java.time.LocalDate.now(IST) }
    var dayEpoch by rememberSaveable { mutableStateOf(today.toEpochDay()) }
    val day = java.time.LocalDate.ofEpochDay(dayEpoch)
    var reload by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var report by remember { mutableStateOf<DayReport?>(null) }
    var calls by remember { mutableStateOf<List<CallLog>?>(null) }

    LaunchedEffect(dayEpoch, reload) {
        loading = true; error = null
        val facts = runCatching { Repository.repDayFacts(day) }
        val parsed = facts.getOrNull()?.let { parseDayReport(it) }
        report = parsed
        error = when {
            facts.isFailure -> "Could not load this day. Check your internet and try again."
            parsed == null -> "This day's numbers did not come back. Try again."
            else -> null
        }
        // The stage list is extra. If it fails, the call numbers still show.
        calls = runCatching { Repository.fetchCallsOnDay(day) }.getOrNull()
        loading = false
    }
    val leadsById = remember(app.leads) { app.leads.mapNotNull { c -> c.id?.let { it to c } }.toMap() }
    val stageRows = remember(calls, leadsById, app.leadStages) {
        calls?.let { leadStatusCounts(it, leadsById, app.leadStages) }
    }

    Column(Modifier.fillMaxSize().background(AppColors.Canvas)) {
        IosNavBar(title = "My report", collapsed = true, onBack = onBack)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.xxl),
        ) {
            item {
                DayPicker(
                    label = when (day) {
                        today -> "Today · ${day.format(DAY_FMT)}"
                        today.minusDays(1) -> "Yesterday · ${day.format(DAY_FMT)}"
                        else -> day.format(DAY_FMT)
                    },
                    canNext = day < today,
                    onPrev = { dayEpoch = day.minusDays(1).toEpochDay() },
                    onNext = { if (day < today) dayEpoch = day.plusDays(1).toEpochDay() },
                    onPick = {
                        android.app.DatePickerDialog(
                            context,
                            { _, y, m, d ->
                                val picked = java.time.LocalDate.of(y, m + 1, d)
                                dayEpoch = (if (picked > today) today else picked).toEpochDay()
                            },
                            day.year, day.monthValue - 1, day.dayOfMonth,
                        ).apply {
                            datePicker.maxDate = today.plusDays(1).atStartOfDay(IST).toInstant().toEpochMilli() - 1
                        }.show()
                    },
                )
            }
            val r = report
            when {
                loading && r == null -> item { LoadingRows(4) }
                r == null -> item {
                    EmptyState(
                        title = "Report not loaded",
                        message = error ?: "Something went wrong.",
                        actionLabel = "Try again", onAction = { reload++ },
                    )
                }
                else -> {
                    item {
                        ReportCalls(r)
                    }
                    if (r.attempted == 0) {
                        item {
                            EmptyState(
                                title = "No calls on this day",
                                message = "Calls you make show up here within a minute.",
                            )
                        }
                    }
                    item {
                        IosGroup(header = "Follow-ups") {
                            IosRow("Done", value = r.followupsDone?.toString() ?: "—")
                            IosSeparator()
                            IosRow("Due this day", value = r.followupsDue?.toString() ?: "—")
                            IosSeparator()
                            IosRow(
                                "Missed", value = r.followupsMissed?.toString() ?: "—",
                                destructive = (r.followupsMissed ?: 0) > 0,
                            )
                        }
                    }
                    item {
                        val rows = stageRows
                        IosGroup(
                            header = "Leads called, by stage now",
                            footer = when {
                                rows == null -> "Could not load the lead list for this day."
                                else -> "Each lead counted once, at the stage it is in now."
                            },
                        ) {
                            when {
                                rows == null -> IosRow("Not loaded", value = "—")
                                rows.isEmpty() -> IosRow("No leads called", value = "0")
                                else -> rows.forEachIndexed { i, s ->
                                    if (i > 0) IosSeparator(startInset = 40.dp)
                                    StageRow(s)
                                }
                            }
                        }
                    }
                    error?.let { msg -> item { Text(msg, style = AppType.meta, color = AppColors.Danger) } }
                }
            }
            item {
                Text(
                    "Same numbers as your manager's daily review. Calls count from midnight to midnight IST.",
                    style = AppType.footnote, color = AppColors.TextTertiary,
                    modifier = Modifier.padding(horizontal = Space.l),
                )
            }
        }
    }
}

@Composable
private fun DayPicker(label: String, canNext: Boolean, onPrev: () -> Unit, onNext: () -> Unit, onPick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().gradientCard().heightIn(min = 64.dp).padding(horizontal = Space.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(48.dp).iosPress { onPrev() }, contentAlignment = Alignment.Center) {
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(Brand.OnGradientFill), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous day",
                    tint = Color.White, modifier = Modifier.size(24.dp))
            }
        }
        Row(
            Modifier.weight(1f).heightIn(min = 48.dp).iosPress { onPick() },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(Space.s))
            Text(label, style = AppType.headline, color = Color.White, maxLines = 1)
        }
        Box(Modifier.size(48.dp).iosPress { if (canNext) onNext() }, contentAlignment = Alignment.Center) {
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(Brand.OnGradientFill), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next day",
                    tint = if (canNext) Color.White else Color.White.copy(alpha = 0.35f), modifier = Modifier.size(24.dp))
            }
        }
    }
}

@Composable
private fun ReportCalls(r: DayReport) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
        AccentHeader("Calls", Modifier.padding(start = Space.xs))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
            BigNumber("Attempted", r.attempted.toString(), Icons.Filled.Call, Tiles.Calls, Modifier.weight(1f))
            BigNumber("Connected", r.connected.toString(), Icons.Filled.PhoneCallback, Tiles.Positive, Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
            BigNumber("Not connected", r.notConnected.toString(), Icons.Filled.PhoneMissed, Tiles.Negative, Modifier.weight(1f))
            BigNumber("Connect rate", connectPercent(r)?.let { "$it%" } ?: "—", Icons.Filled.TrendingUp, Tiles.Brand, Modifier.weight(1f))
        }
        connectPercent(r)?.let { pct ->
            Column(Modifier.fillMaxWidth().softCard().padding(Space.l)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Connect rate", style = AppType.label, color = AppColors.TextPrimary, modifier = Modifier.weight(1f))
                    Text("$pct%", style = AppType.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = AppColors.TextPrimary)
                }
                Spacer(Modifier.height(Space.s))
                com.salesautocall.app.ui.design.GradientProgress(pct / 100f)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
            BigNumber("Talk time", formatTalk(r.talkSeconds), Icons.Filled.Timer, Tiles.Time, Modifier.weight(1f))
            BigNumber("Average call", formatTalk(r.avgSeconds), Icons.Filled.AccessTime, Tiles.Leads, Modifier.weight(1f),
                note = "Connected calls only")
        }
    }
}

@Composable
private fun BigNumber(label: String, value: String, icon: ImageVector, tone: TileTone, modifier: Modifier = Modifier, note: String? = null) {
    Row(modifier.softCard().padding(Space.m), verticalAlignment = Alignment.CenterVertically) {
        GradientIconTile(icon, tone, size = 44.dp)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(value, style = AppType.metric, color = AppColors.TextPrimary, maxLines = 1)
            Text(label, style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1)
            if (note != null) Text(note, style = AppType.caption, color = AppColors.TextTertiary, maxLines = 1)
        }
    }
}

@Composable
private fun StageRow(s: StageCount) {
    val dot = s.color?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }
        ?: AppColors.TextTertiary
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(horizontal = Space.l),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(dot))
        Spacer(Modifier.width(16.dp))
        Text(s.label, style = AppType.body, color = AppColors.TextPrimary, modifier = Modifier.weight(1f), maxLines = 1)
        Text(s.count.toString(), style = AppType.body, color = AppColors.TextSecondary)
    }
}
