package com.salesautocall.app.ui

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.data.LeaderboardRow
import kotlin.math.abs

// ════════════════════════════════════════════════════════════
//  Design system — colours, helpers, atoms
// ════════════════════════════════════════════════════════════

private val Green = Color(0xFF16A34A)
private val Amber = Color(0xFFF59E0B)
private val Red = Color(0xFFEF4444)
private val Purple = Color(0xFF7C3AED)
private val Cyan = Color(0xFF0891B2)
private val Indigo = Color(0xFF4F46E5)
private val Slate = Color(0xFF64748B)

private data class Stage(val key: String, val label: String, val statuses: Set<String>, val color: Color)

/** Real-estate pipeline, in order. */
private val STAGES = listOf(
    Stage("new", "New", setOf("new", "queued"), Color(0xFF3B82F6)),
    Stage("contacted", "Contacted", setOf("called", "no_answer", "busy", "callback", "follow_up"), Indigo),
    Stage("interested", "Interested", setOf("interested"), Amber),
    Stage("site_visit", "Site Visit", setOf("site_visit"), Purple),
    Stage("proposal", "Proposal", setOf("proposal"), Cyan),
    Stage("closed", "Closed", setOf("booked"), Green),
)

private fun stageOf(status: String): Stage =
    STAGES.firstOrNull { status in it.statuses }
        ?: when (status) {
            "not_interested", "lost" -> Stage("lost", "Lost", emptySet(), Red)
            "dnc" -> Stage("dnc", "DNC", emptySet(), Slate)
            else -> STAGES[0]
        }

/** Stages a rep can move a lead into, from the action sheet. */
private val SETTABLE_STAGES = listOf(
    "interested" to "Interested",
    "site_visit" to "Site Visit",
    "proposal" to "Proposal",
    "booked" to "Closed / Won",
    "callback" to "Callback",
    "not_interested" to "Not interested",
    "lost" to "Lost",
    "dnc" to "DNC",
)

private data class TempMeta(val label: String, val fg: Color, val bg: Color)

private fun tempMeta(t: String?): TempMeta? = when (t) {
    "hot" -> TempMeta("Hot", Red, Color(0xFFFEE2E2))
    "warm" -> TempMeta("Warm", Amber, Color(0xFFFEF3C7))
    "cold" -> TempMeta("Cold", Color(0xFF2563EB), Color(0xFFDBEAFE))
    else -> null
}

private val TEMPERATURES = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

private fun leadScore(c: Contact): Int {
    val base = when (c.status) {
        "booked" -> 100
        "proposal" -> 92
        "site_visit" -> 85
        "interested" -> 72
        "callback", "follow_up" -> 60
        "called", "no_answer", "busy" -> 48
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

private fun instantMillis(iso: String?): Long? =
    iso?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }

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

private fun initials(name: String): String =
    name.trim().split(" ").mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString("").ifBlank { "?" }

private val avatarColors = listOf(
    Color(0xFF2563EB), Color(0xFF7C3AED), Color(0xFF0891B2), Color(0xFF16A34A),
    Color(0xFFEA580C), Color(0xFFDB2777), Color(0xFF4F46E5), Color(0xFF0D9488),
)

private fun colorFor(seed: String): Color = avatarColors[abs(seed.hashCode()) % avatarColors.size]

private fun openWhatsApp(context: android.content.Context, phone: String) {
    val digits = phone.filter { it.isDigit() }
    val intent = android.content.Intent(
        android.content.Intent.ACTION_VIEW,
        android.net.Uri.parse("https://wa.me/$digits"),
    ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}

@Composable
private fun Avatar(name: String, size: Int = 44) {
    val c = colorFor(name)
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(c.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials(name), color = c, fontWeight = FontWeight.Bold, fontSize = (size / 2.6).sp)
    }
}

@Composable
private fun StatTile(emoji: String, value: String, label: String, accent: Color, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Column(Modifier.padding(14.dp)) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(accent.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center) {
                Text(emoji, fontSize = 16.sp)
            }
            Spacer(Modifier.height(10.dp))
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
private fun StageChip(status: String) {
    val s = stageOf(status)
    Pill(s.label, s.color, s.color.copy(alpha = 0.12f))
}

@Composable
private fun ScoreChip(score: Int) {
    val c = when { score >= 75 -> Green; score >= 50 -> Amber; else -> Slate }
    Pill("Score $score%", c, c.copy(alpha = 0.12f))
}

@Composable
private fun FilterTab(label: String, count: Int, selected: Boolean, accent: Color, onClick: () -> Unit) {
    val bg = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface
    val fg = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
    Box(
        Modifier.clip(RoundedCornerShape(50))
            .background(bg)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(50))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = fg, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.width(6.dp))
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (selected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.22f) else accent.copy(alpha = 0.14f))
                    .padding(horizontal = 6.dp, vertical = 1.dp),
            ) {
                Text("$count", color = if (selected) MaterialTheme.colorScheme.onPrimary else accent,
                    style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ActionButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(10.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(10.dp))
            .clickable { onClick() }
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(5.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** Multi-segment pipeline bar coloured by stage proportion. */
@Composable
private fun PipelineBar(counts: List<Pair<Stage, Int>>) {
    val total = counts.sumOf { it.second }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(50))) {
        var drew = false
        counts.forEach { (stage, n) ->
            if (n > 0) {
                drew = true
                Box(Modifier.weight(n.toFloat() / total).fillMaxSize().background(stage.color))
            }
        }
        if (!drew) Box(Modifier.weight(1f).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant))
    }
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
@Composable
fun HomeScreen(vm: MainViewModel, onOpenFollowUps: () -> Unit, onOpenLeads: () -> Unit, onNavigate: (String) -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadHome(); vm.loadLeads() }

    val firstName = app.profile?.fullName?.substringBefore(' ')?.takeIf { it.isNotBlank() } ?: "there"
    val due = vm.dueNowCount()
    val newLeads = app.leads.count { it.status in setOf("new", "queued") }
    val stageCounts = STAGES.map { st -> st to app.leads.count { it.status in st.statuses } }

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Greeting hero
        item { GreetingCard(app, firstName, onOpenAttendance = { onNavigate("attendance") }) }

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
                StatTile("🔔", app.followUpList.size.toString(), "Follow-ups", Purple, Modifier.weight(1f))
            }
        }

        // Lead pipeline
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    SectionHeader("Lead Pipeline", "View all", onOpenLeads)
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        stageCounts.forEach { (stage, n) ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                                Text(n.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = stage.color)
                                Text(stage.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1)
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    PipelineBar(stageCounts)
                }
            }
        }

        // Quick actions
        item {
            Column {
                SectionHeader("Quick Actions")
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuickAction("Add Lead", Icons.Default.PersonAdd, MaterialTheme.colorScheme.primary, Modifier.weight(1f), onOpenLeads)
                    QuickAction("Calendar", Icons.Default.CalendarMonth, Purple, Modifier.weight(1f)) { onNavigate("calendar") }
                    QuickAction("AI Coach", Icons.Default.AutoAwesome, Cyan, Modifier.weight(1f)) { onNavigate("ai") }
                    QuickAction("Attendance", Icons.Default.AccessTime, Amber, Modifier.weight(1f)) { onNavigate("attendance") }
                }
            }
        }

        // Upcoming follow-ups
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    SectionHeader(if (due > 0) "Follow-ups · $due due now" else "Upcoming Follow-ups", "View all", onOpenFollowUps)
                    Spacer(Modifier.height(10.dp))
                    val list = app.followUpList.take(3)
                    if (list.isEmpty()) {
                        Text("No callbacks scheduled. Open a lead and tap “Follow-up”.",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        list.forEachIndexed { i, f ->
                            if (i > 0) Spacer(Modifier.height(10.dp))
                            UpcomingRow(f, onCall = { vm.dialManual(f.phone) })
                        }
                    }
                }
            }
        }

        // Team peek
        item { LeaderboardCard(vm, app, compact = true) }

        app.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
    }
}

@Composable
private fun GreetingCard(app: AppState, firstName: String, onOpenAttendance: () -> Unit) {
    val a = app.attendance
    val onShift = a?.punchInAt != null && a.punchOutAt == null
    val done = a?.punchOutAt != null
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF2563EB), Color(0xFF1D4ED8))))
            .padding(20.dp),
    ) {
        Column {
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
                    Text(label, color = Color(0xFF1D4ED8), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
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

@Composable
private fun UpcomingRow(f: FollowUp, onCall: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Avatar(f.name ?: f.phone, size = 38)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(f.name ?: f.phone, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text("${dayLabel(f.dueAt)}, ${timeOnly(f.dueAt)}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ActionButton(Icons.Default.Call, "Call", Green, onClick = onCall)
    }
}

// ════════════════════════════════════════════════════════════
//  LEADS
// ════════════════════════════════════════════════════════════
@Composable
fun LeadsScreen(vm: MainViewModel, onStartCampaign: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadLeads() }

    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf("all") }
    var actionFor by remember { mutableStateOf<Contact?>(null) }
    var scheduleFor by remember { mutableStateOf<Contact?>(null) }
    var selectMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf(setOf<String>()) }

    val base = when (selected) {
        "all" -> app.leads
        else -> app.leads.filter { stageOf(it.status).key == selected || it.status in (STAGES.firstOrNull { s -> s.key == selected }?.statuses ?: emptySet()) }
    }
    val filtered = if (query.isBlank()) base else base.filter {
        (it.name ?: "").contains(query, ignoreCase = true) || it.phone.contains(query)
    }
    val filteredIds = filtered.mapNotNull { it.id }.toSet()
    val allSelected = filteredIds.isNotEmpty() && selectedIds.containsAll(filteredIds)

    fun exitSelect() { selectMode = false; selectedIds = emptySet() }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Leads", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text(if (selectMode) "Tap leads to add them to a campaign" else "Manage and follow up with your leads",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (!selectMode) {
                        Box(
                            Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                                .clickable { selectMode = true }.padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Checklist, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Select", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    } else {
                        Text("Cancel", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.clickable { exitSelect() }.padding(8.dp))
                    }
                }
            }
            // stat filter tabs
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterTab("All", app.leads.size, selected == "all", MaterialTheme.colorScheme.primary) { selected = "all" }
                    STAGES.forEach { st ->
                        val n = app.leads.count { it.status in st.statuses }
                        FilterTab(st.label, n, selected == st.key, st.color) { selected = st.key }
                    }
                }
            }
            if (selectMode) {
                item {
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("${selectedIds.size} selected", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            TextButton(onClick = {
                                selectedIds = if (allSelected) selectedIds - filteredIds else selectedIds + filteredIds
                            }) { Text(if (allSelected) "Clear all" else "Select all (${filteredIds.size})") }
                        }
                    }
                }
            }
            item {
                OutlinedTextField(
                    query, { query = it }, placeholder = { Text("Search by name or phone…") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
                )
            }

            when {
                app.leadsLoading && app.leads.isEmpty() ->
                    item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                filtered.isEmpty() ->
                    item {
                        Text(if (app.leads.isEmpty()) "No leads yet. Ask your admin to upload leads, then select & start calling." else "No leads in this stage.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                else -> items(filtered, key = { it.id ?: it.phone }) { c ->
                    LeadCard(
                        c = c,
                        cloudOn = app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank(),
                        selectMode = selectMode,
                        isSelected = c.id != null && c.id in selectedIds,
                        onToggleSelect = { c.id?.let { id -> selectedIds = if (id in selectedIds) selectedIds - id else selectedIds + id } },
                        onCall = { vm.dialManual(c.phone) },
                        onCloudCall = { c.id?.let { vm.cloudCall(c.phone, it, c.campaignId) } },
                        onWhatsApp = { openWhatsApp(context, c.phone) },
                        onSchedule = { scheduleFor = c },
                        onMore = { actionFor = c },
                    )
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
                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Start Campaign")
                    }
                }
            }
        }
    }

    actionFor?.let { c ->
        LeadActionSheet(
            c = c,
            onDismiss = { actionFor = null },
            onApply = { status, temp, budget, note ->
                c.id?.let { vm.applyLead(it, status, temp, budget, note) }
                actionFor = null
            },
        )
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

@Composable
private fun LeadCard(
    c: Contact,
    cloudOn: Boolean,
    selectMode: Boolean = false,
    isSelected: Boolean = false,
    onToggleSelect: () -> Unit = {},
    onCall: () -> Unit,
    onCloudCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onSchedule: () -> Unit,
    onMore: () -> Unit,
) {
    val cardMod = Modifier.fillMaxWidth()
        .then(if (isSelected) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp)) else Modifier)
        .then(if (selectMode) Modifier.clickable { onToggleSelect() } else Modifier)
    Card(cardMod) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(c.name ?: c.phone)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(c.name ?: c.phone, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        tempMeta(c.temperature)?.let {
                            Spacer(Modifier.width(8.dp))
                            Pill(it.label, it.fg, it.bg)
                        }
                    }
                    Text(c.phone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (selectMode) {
                    val ring = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
                    Box(
                        Modifier.size(26.dp).clip(CircleShape)
                            .background(if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent)
                            .border(2.dp, ring, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (isSelected) Icon(Icons.Default.Check, contentDescription = "Selected", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                    }
                } else {
                    Icon(Icons.Default.MoreVert, contentDescription = "More", tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp).clip(CircleShape).clickable { onMore() })
                }
            }

            // Project + budget (no source / owner)
            if (!c.companyName.isNullOrBlank() || !c.budget.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (!c.companyName.isNullOrBlank()) {
                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(c.companyName!!, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    }
                    if (!c.budget.isNullOrBlank()) {
                        Spacer(Modifier.width(14.dp))
                        Text("💰 ${c.budget}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                StageChip(c.status)
                ScoreChip(leadScore(c))
                Spacer(Modifier.weight(1f))
                c.notes?.takeIf { it.isNotBlank() }?.let {
                    Text("📝", style = MaterialTheme.typography.bodySmall)
                }
            }

            if (!selectMode) {
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton(Icons.Default.Call, "Call", Green, Modifier.weight(1f), onClick = onCall)
                    ActionButton(Icons.Default.Chat, "WhatsApp", Color(0xFF25D366), Modifier.weight(1f), onClick = onWhatsApp)
                    ActionButton(Icons.Default.CalendarMonth, "Schedule", MaterialTheme.colorScheme.primary, Modifier.weight(1f), onClick = onSchedule)
                }
                if (cloudOn) {
                    Spacer(Modifier.height(8.dp))
                    ActionButton(Icons.Default.Call, "☁ Cloud call", MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth(), onClick = onCloudCall)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadActionSheet(c: Contact, onDismiss: () -> Unit, onApply: (String?, String?, String?, String?) -> Unit) {
    var stage by remember(c.id) { mutableStateOf<String?>(null) }
    var temp by remember(c.id) { mutableStateOf<String?>(null) }
    var budget by remember(c.id) { mutableStateOf(c.budget ?: "") }
    var note by remember(c.id) { mutableStateOf(c.notes ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(c.name ?: c.phone) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
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
                OutlinedTextField(budget, { budget = it }, label = { Text("Budget (e.g. ₹45L)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(note, { note = it }, label = { Text("Notes / requirement") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onApply(
                    stage,
                    temp,
                    budget.trim().ifBlank { null }.takeIf { it != c.budget },
                    note.trim().ifBlank { null }.takeIf { it != c.notes },
                )
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

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
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ════════════════════════════════════════════════════════════
//  FOLLOW-UPS
// ════════════════════════════════════════════════════════════
@Composable
fun FollowUpsScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadFollowUps() }

    var filter by remember { mutableStateOf("today") }
    var rescheduleFor by remember { mutableStateOf<FollowUp?>(null) }
    val now = System.currentTimeMillis()
    val all = app.followUpList
    val due = all.filter { (instantMillis(it.dueAt) ?: Long.MAX_VALUE) <= now }
    val todayList = all.filter { dayLabel(it.dueAt) == "Today" }
    val overdueStrict = all.filter {
        val ms = instantMillis(it.dueAt) ?: Long.MAX_VALUE
        ms < now && dayLabel(it.dueAt) != "Today"
    }

    val shown = when (filter) {
        "today" -> todayList
        "overdue" -> overdueStrict
        else -> all
    }

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Follow Ups", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Never miss a follow-up", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = onBack) { Text("Back") }
            }
        }
        // Priority stats
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile("📅", todayList.size.toString(), "Due today", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                StatTile("⚠️", overdueStrict.size.toString(), "Overdue", Red, Modifier.weight(1f))
                StatTile("🔔", all.size.toString(), "Scheduled", Green, Modifier.weight(1f))
            }
        }
        // filters
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterTab("All", all.size, filter == "all", MaterialTheme.colorScheme.primary) { filter = "all" }
                FilterTab("Today", todayList.size, filter == "today", MaterialTheme.colorScheme.primary) { filter = "today" }
                FilterTab("Overdue", overdueStrict.size, filter == "overdue", Red) { filter = "overdue" }
            }
        }
        // auto-queue
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Bolt, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Auto queue mode", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("Call your due leads back to back", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val next = due.firstOrNull() ?: all.firstOrNull()
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                            .clickable(enabled = next != null) { next?.let { vm.dialManual(it.phone) } }
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Call next", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
        }

        if (shown.isEmpty()) {
            item {
                Text(if (all.isEmpty()) "No callbacks scheduled. Add one from a lead." else "Nothing here — try another filter.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            items(shown, key = { it.id ?: it.phone }) { f ->
                FollowUpCard(
                    f = f,
                    onCall = { vm.dialManual(f.phone) },
                    onWhatsApp = { openWhatsApp(context, f.phone) },
                    onReschedule = { rescheduleFor = f },
                    onDone = { f.id?.let { vm.completeFollowUp(it) } },
                )
            }
        }
    }

    rescheduleFor?.let { f ->
        ScheduleFollowUpDialog(
            who = f.name ?: f.phone,
            onDismiss = { rescheduleFor = null },
            onPick = { millis, note ->
                f.id?.let { vm.completeFollowUp(it) }
                vm.scheduleFollowUp(f.contactId, f.phone, f.name, millis, note)
                rescheduleFor = null
            },
        )
    }
}

@Composable
private fun FollowUpCard(f: FollowUp, onCall: () -> Unit, onWhatsApp: () -> Unit, onReschedule: () -> Unit, onDone: () -> Unit) {
    val overdue = (instantMillis(f.dueAt) ?: Long.MAX_VALUE) <= System.currentTimeMillis()
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(f.name ?: f.phone)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.name ?: f.phone, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    Text(f.phone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Pill(relativeDue(f.dueAt), if (overdue) Red else MaterialTheme.colorScheme.primary,
                        (if (overdue) Red else MaterialTheme.colorScheme.primary).copy(alpha = 0.12f))
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AccessTime, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(3.dp))
                        Text("${dayLabel(f.dueAt)} ${timeOnly(f.dueAt)}", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            f.note?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text("📝 $it", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton(Icons.Default.Call, "Call", Green, Modifier.weight(1f), onClick = onCall)
                ActionButton(Icons.Default.Chat, "WhatsApp", Color(0xFF25D366), Modifier.weight(1f), onClick = onWhatsApp)
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton(Icons.Default.AccessTime, "Reschedule", Amber, Modifier.weight(1f), onClick = onReschedule)
                ActionButton(Icons.Default.CheckCircle, "Done", MaterialTheme.colorScheme.primary, Modifier.weight(1f), onClick = onDone)
            }
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
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Groups, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
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
