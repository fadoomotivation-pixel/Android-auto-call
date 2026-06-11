package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.data.LeaderboardRow

// ============================================================
// Shared helpers (Stat/fmt are private to FeatureScreens, so we keep
// small local copies here to avoid cross-file coupling).
// ============================================================
private fun fmtSec(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}

private fun instantMillis(iso: String?): Long? =
    iso?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun timeOnly(iso: String?): String {
    val ms = instantMillis(iso) ?: return "—"
    return java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(ms), java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))
}

/** "Due now" / "in 2h 10m" / "Overdue 1d" relative to the current time. */
private fun relativeDue(iso: String): String {
    val due = instantMillis(iso) ?: return "—"
    val diff = due - System.currentTimeMillis()
    val absMin = kotlin.math.abs(diff) / 60_000
    val txt = when {
        absMin < 1 -> "now"
        absMin < 60 -> "${absMin}m"
        absMin < 1440 -> "${absMin / 60}h ${absMin % 60}m"
        else -> "${absMin / 1440}d"
    }
    return if (diff <= 0) (if (absMin < 1) "Due now" else "Overdue $txt") else "in $txt"
}

private fun whenLabel(iso: String): String {
    val ms = instantMillis(iso) ?: return "—"
    return java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(ms), java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM, h:mm a"))
}

private val PIPELINE_STATUSES = listOf(
    "interested" to "Interested",
    "callback" to "Callback",
    "booked" to "Booked",
    "not_interested" to "Not interested",
    "lost" to "Lost",
    "dnc" to "DNC",
)

private val TEMPERATURES = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

private fun statusText(status: String): String =
    PIPELINE_STATUSES.firstOrNull { it.first == status }?.second
        ?: status.replace('_', ' ').replaceFirstChar { it.uppercase() }

private fun openWhatsApp(context: android.content.Context, phone: String) {
    val digits = phone.filter { it.isDigit() }
    val intent = android.content.Intent(
        android.content.Intent.ACTION_VIEW,
        android.net.Uri.parse("https://wa.me/$digits"),
    ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}

@Composable
private fun MiniStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ============================================================
// HOME — attendance punch, today stats, due follow-ups, leaderboard peek
// ============================================================
@Composable
fun HomeScreen(vm: MainViewModel, onOpenFollowUps: () -> Unit, onOpenLeads: () -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadHome() }

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text(
            "Hi ${app.profile?.fullName?.substringBefore(' ') ?: "there"} 👋",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text("Your shift, your numbers, your follow-ups — all in one place.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))

        AttendanceCard(vm, app)
        Spacer(Modifier.height(16.dp))

        // Today's productivity
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Today", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MiniStat("Calls", app.todayCalls.toString())
                    MiniStat("Connected", app.todayConnected.toString())
                    MiniStat("Talk", fmtSec(app.todayTalk))
                }
                Spacer(Modifier.height(14.dp))
                val p = if (app.dailyGoal > 0) (app.todayCalls.toFloat() / app.dailyGoal).coerceIn(0f, 1f) else 0f
                LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(4.dp))
                Text(
                    if (app.todayCalls >= app.dailyGoal) "🎉 Daily goal reached — ${app.todayCalls}/${app.dailyGoal}"
                    else "${app.todayCalls} / ${app.dailyGoal} daily goal",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(16.dp))

        // Due follow-ups call-to-action
        val due = vm.dueNowCount()
        val total = app.followUpList.size
        Card(Modifier.fillMaxWidth().clickable { onOpenFollowUps() }) {
            Column(Modifier.padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Follow-ups", style = MaterialTheme.typography.titleMedium)
                        Text(
                            when {
                                due > 0 -> "$due due now · $total scheduled"
                                total > 0 -> "$total scheduled — none due yet"
                                else -> "No callbacks scheduled. Add some from a lead."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (due > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (due > 0) Badge(due.toString())
                }
                if (total > 0) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = onOpenFollowUps, modifier = Modifier.fillMaxWidth()) {
                        Text(if (due > 0) "Work my $due due calls" else "Open follow-ups")
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        // Leaderboard peek
        LeaderboardCard(vm, app, compact = true)

        Spacer(Modifier.height(16.dp))
        Button(onClick = onOpenLeads, modifier = Modifier.fillMaxWidth()) { Text("Open my lead pipeline") }

        app.message?.let { Spacer(Modifier.height(12.dp)); Text(it, color = MaterialTheme.colorScheme.primary) }
        app.error?.let { Spacer(Modifier.height(12.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun Badge(text: String) {
    Box(
        Modifier.size(28.dp).clip(CircleShape).background(MaterialTheme.colorScheme.error),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = MaterialTheme.colorScheme.onError, fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun AttendanceCard(vm: MainViewModel, app: AppState) {
    val a = app.attendance
    val onShift = a?.punchInAt != null && a.punchOutAt == null
    val done = a?.punchOutAt != null
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Attendance", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text(
                when {
                    done -> "✓ Shift done — in ${timeOnly(a?.punchInAt)}, out ${timeOnly(a?.punchOutAt)}"
                    onShift -> "🟢 On shift since ${timeOnly(a?.punchInAt)}"
                    else -> "You haven't punched in today."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = if (onShift) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            when {
                done -> OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Text("Shift complete for today")
                }
                onShift -> Button(
                    onClick = { vm.punchOut() }, enabled = !app.attendanceBusy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (app.attendanceBusy) "…" else "Punch out") }
                else -> Button(
                    onClick = { vm.punchIn() }, enabled = !app.attendanceBusy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (app.attendanceBusy) "…" else "Punch in") }
            }
        }
    }
}

// ============================================================
// LEADS — the pipeline: filter, triage, disposition, schedule callback
// ============================================================
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LeadsScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadLeads() }

    var query by remember { mutableStateOf("") }
    var scheduleFor by remember { mutableStateOf<Contact?>(null) }

    val filter = LeadFilter.entries.firstOrNull { it.key == app.leadFilter } ?: LeadFilter.OPEN
    val base = app.leads.filter { c ->
        when (filter) {
            LeadFilter.ALL -> true
            LeadFilter.HOT -> c.temperature == "hot"
            else -> c.status in filter.statuses
        }
    }
    val filtered = if (query.isBlank()) base else base.filter {
        (it.name ?: "").contains(query, ignoreCase = true) || it.phone.contains(query)
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Lead Pipeline", style = MaterialTheme.typography.headlineSmall)
        Text("Triage, disposition and schedule callbacks — never lose a deal.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))

        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LeadFilter.entries.forEach { f ->
                val count = app.leads.count { c ->
                    when (f) {
                        LeadFilter.ALL -> true
                        LeadFilter.HOT -> c.temperature == "hot"
                        else -> c.status in f.statuses
                    }
                }
                FilterChip(
                    selected = app.leadFilter == f.key,
                    onClick = { vm.setLeadFilter(f) },
                    label = { Text("${f.label} ($count)") },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            query, { query = it }, label = { Text("Search name or phone") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        when {
            app.leadsLoading && app.leads.isEmpty() ->
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            filtered.isEmpty() ->
                Text(
                    if (app.leads.isEmpty()) "No leads yet. Start a campaign to import contacts."
                    else "No leads in “${filter.label}”.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(filtered, key = { it.id ?: it.phone }) { c ->
                    LeadCard(
                        c = c,
                        cloudOn = app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank(),
                        onStatus = { st -> c.id?.let { vm.setLeadDisposition(it, st) } },
                        onTemp = { t -> c.id?.let { vm.setLeadTemperature(it, t) } },
                        onCall = { vm.dialManual(c.phone) },
                        onCloudCall = { c.id?.let { vm.cloudCall(c.phone, it, c.campaignId) } },
                        onWhatsApp = { openWhatsApp(context, c.phone) },
                        onSchedule = { scheduleFor = c },
                    )
                }
            }
        }
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
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadCard(
    c: Contact,
    cloudOn: Boolean,
    onStatus: (String) -> Unit,
    onTemp: (String) -> Unit,
    onCall: () -> Unit,
    onCloudCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onSchedule: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(c.name ?: c.phone, style = MaterialTheme.typography.titleMedium)
                    Text(c.phone, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val hot = c.status == "interested" || c.status == "booked"
                Text(
                    statusText(c.status),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (hot) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            c.notes?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(4.dp)); Text("📝 $it", style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(8.dp))
            // Temperature triage
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TEMPERATURES.forEach { (key, label) ->
                    FilterChip(selected = c.temperature == key, onClick = { onTemp(key) }, label = { Text(label) })
                }
            }
            Spacer(Modifier.height(6.dp))
            // Disposition
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PIPELINE_STATUSES.forEach { (st, label) ->
                    AssistChip(
                        onClick = { onStatus(st) },
                        label = { Text(label) },
                        leadingIcon = if (c.status == st) ({ Text("✓") }) else null,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            // Actions
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AssistChip(onClick = onCall, label = { Text("📞 Call") })
                if (cloudOn) AssistChip(onClick = onCloudCall, label = { Text("☁ Cloud") })
                AssistChip(onClick = onWhatsApp, label = { Text("WhatsApp") })
                AssistChip(onClick = onSchedule, label = { Text("⏰ Follow-up") })
            }
        }
    }
}

// ============================================================
// FOLLOW-UPS — the due-today callback worklist
// ============================================================
@Composable
fun FollowUpsScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadFollowUps() }

    val now = System.currentTimeMillis()
    val (dueList, upcoming) = app.followUpList.partition { (instantMillis(it.dueAt) ?: Long.MAX_VALUE) <= now }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("Back") }
            Spacer(Modifier.width(12.dp))
            Text("Follow-ups", style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(4.dp))
        Text("${dueList.size} due now · ${upcoming.size} upcoming",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))

        if (app.followUpList.isEmpty()) {
            Text("No callbacks scheduled. Open a lead and tap “⏰ Follow-up” to add one.",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (dueList.isNotEmpty()) {
                item { SectionLabel("Due now", MaterialTheme.colorScheme.error) }
                items(dueList, key = { it.id ?: it.phone }) { f ->
                    FollowUpCard(f, due = true,
                        onCall = { vm.dialManual(f.phone) },
                        onWhatsApp = { openWhatsApp(context, f.phone) },
                        onDone = { f.id?.let { vm.completeFollowUp(it) } })
                }
            }
            if (upcoming.isNotEmpty()) {
                item { SectionLabel("Upcoming", MaterialTheme.colorScheme.onSurfaceVariant) }
                items(upcoming, key = { it.id ?: it.phone }) { f ->
                    FollowUpCard(f, due = false,
                        onCall = { vm.dialManual(f.phone) },
                        onWhatsApp = { openWhatsApp(context, f.phone) },
                        onDone = { f.id?.let { vm.completeFollowUp(it) } })
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String, color: Color) {
    Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = color,
        modifier = Modifier.padding(top = 4.dp))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FollowUpCard(f: FollowUp, due: Boolean, onCall: () -> Unit, onWhatsApp: () -> Unit, onDone: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(f.name ?: f.phone, style = MaterialTheme.typography.titleMedium)
                    Text(f.phone, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    relativeDue(f.dueAt),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (due) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            Text(whenLabel(f.dueAt), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            f.note?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(4.dp)); Text("📝 $it", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AssistChip(onClick = onCall, label = { Text("📞 Call") })
                AssistChip(onClick = onWhatsApp, label = { Text("WhatsApp") })
                AssistChip(onClick = onDone, label = { Text("✓ Done") })
            }
        }
    }
}

// ============================================================
// SCHEDULE dialog — quick relative time presets
// ============================================================
@Composable
private fun ScheduleFollowUpDialog(who: String, onDismiss: () -> Unit, onPick: (Long, String?) -> Unit) {
    var note by remember { mutableStateOf("") }
    val now = java.time.ZonedDateTime.now()

    fun tomorrowAt(hour: Int) = now.plusDays(1).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    fun inDaysAt(days: Long, hour: Int) = now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()

    val options = listOf(
        "In 1 hour" to now.plusHours(1).toInstant().toEpochMilli(),
        "In 3 hours" to now.plusHours(3).toInstant().toEpochMilli(),
        "Tomorrow 10 AM" to tomorrowAt(10),
        "Tomorrow 4 PM" to tomorrowAt(16),
        "In 2 days, 11 AM" to inDaysAt(2, 11),
        "Next week" to inDaysAt(7, 10),
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Schedule follow-up · $who") },
        text = {
            Column {
                OutlinedTextField(
                    note, { note = it },
                    label = { Text("Note (e.g. send brochure, discuss price)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Text("When should we remind you?", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                options.forEach { (label, millis) ->
                    OutlinedButton(
                        onClick = { onPick(millis, note.ifBlank { null }) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                    ) { Text(label) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ============================================================
// TEAM — leaderboard + entry points to campaign analytics & call history
// ============================================================
@Composable
fun TeamScreen(vm: MainViewModel, onCampaigns: () -> Unit, onCallHistory: () -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadLeaderboard(app.leaderboardPeriod) }

    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Team", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        LeaderboardCard(vm, app, compact = false)
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onCampaigns, modifier = Modifier.fillMaxWidth()) { Text("Campaign analytics") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onCallHistory, modifier = Modifier.fillMaxWidth()) { Text("Call history") }
    }
}

@Composable
private fun LeaderboardCard(vm: MainViewModel, app: AppState, compact: Boolean) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text("🏆 Leaderboard", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("today" to "Today", "week" to "Week").forEach { (key, label) ->
                        FilterChip(
                            selected = app.leaderboardPeriod == key,
                            onClick = { vm.setLeaderboardPeriod(key) },
                            label = { Text(label) },
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            val rows = if (compact) app.leaderboard.take(3) else app.leaderboard
            when {
                app.leaderboardLoading && app.leaderboard.isEmpty() ->
                    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                rows.isEmpty() ->
                    Text("No activity yet for this period.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> {
                    val myId = app.profile?.id
                    rows.forEachIndexed { i, r -> LeaderboardRowView(i + 1, r, isMe = r.salespersonId == myId) }
                    if (compact && app.leaderboard.size > 3) {
                        Spacer(Modifier.height(6.dp))
                        Text("See the full team in the Team tab →", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun LeaderboardRowView(rank: Int, r: LeaderboardRow, isMe: Boolean) {
    val medal = when (rank) { 1 -> "🥇"; 2 -> "🥈"; 3 -> "🥉"; else -> "$rank." }
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(medal, modifier = Modifier.width(34.dp))
        Column(Modifier.weight(1f)) {
            Text(
                (r.fullName ?: "—") + if (isMe) "  (you)" else "",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isMe) FontWeight.Bold else FontWeight.Normal,
                color = if (isMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
            Text("${r.calls} calls · ${r.connected} connected · ${fmtSec(r.talkSeconds)} talk",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("${r.leads}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary)
            Text("leads", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
