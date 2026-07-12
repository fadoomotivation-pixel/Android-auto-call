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
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
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
import com.salesautocall.app.data.WhatsAppMessage
import com.salesautocall.app.data.LeaderboardRow
import kotlin.math.abs

// ════════════════════════════════════════════════════════════
//  Design system — colours, helpers, atoms
// ════════════════════════════════════════════════════════════

// Paper & ink discipline: every hue keeps its identity (buckets stay
// recognisable at a glance) but sits close to ink — muted, never neon.
// Jade is the one true accent; money stages resolve to it.
private val Green = Color(0xFF0E7C66)   // success = jade
private val Amber = Color(0xFFB8860B)   // muted amber
private val Red = Color(0xFFC0452C)     // muted terracotta
private val Purple = Color(0xFF7D5BA6)  // muted plum
private val Cyan = Color(0xFF3E7F8A)    // muted sea
private val Indigo = Color(0xFF5E5E9E)  // muted indigo
private val Slate = Color(0xFF5A6068)
private val WaGreen = Color(0xFF25D366) // WhatsApp brand — kept recognisable

private data class Stage(val key: String, val label: String, val statuses: Set<String>, val color: Color)

private val Teal = Color(0xFF2E8B74)    // jade-adjacent: token money

/** Real-estate pipeline, in order. "Negotiation" folds in the older "proposal"
 *  status; "Token Paid" is the booking-token money milestone before a full booking. */
private val STAGES = listOf(
    // No-answer / busy live in NEW: nobody actually spoke to them yet, so they
    // come straight back into the calling pile (the attempt ladder re-books them).
    Stage("new", "New", setOf("new", "queued", "no_answer", "busy", "wrong_person"), Color(0xFF4A6FA5)),
    Stage("contacted", "Contacted", setOf("called", "callback", "follow_up"), Indigo),
    Stage("interested", "Interested", setOf("interested"), Amber),
    Stage("site_visit", "Site Visit", setOf("site_visit"), Purple),
    Stage("negotiation", "Negotiation", setOf("negotiation", "proposal"), Cyan),
    Stage("token", "Token Paid", setOf("token_paid"), Teal),
    Stage("closed", "Booked", setOf("booked"), Green),
)

private fun stageOf(status: String): Stage =
    STAGES.firstOrNull { status in it.statuses }
        ?: when (status) {
            "not_interested", "lost" -> Stage("lost", "Lost", emptySet(), Red)
            "dnc" -> Stage("dnc", "Do Not Call", emptySet(), Slate)
            else -> STAGES[0]
        }

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

private fun instantMillis(iso: String?): Long? =
    iso?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }

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

private fun initials(name: String): String =
    name.trim().split(" ").mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString("").ifBlank { "?" }

private val avatarColors = listOf(
    Color(0xFF4A6FA5), Color(0xFF7D5BA6), Color(0xFF3E7F8A), Color(0xFF0E7C66),
    Color(0xFFB06A3B), Color(0xFFA65475), Color(0xFF5E5E9E), Color(0xFF2E8B74),
)

private fun colorFor(seed: String): Color = avatarColors[abs(seed.hashCode()) % avatarColors.size]

private fun openWhatsApp(context: android.content.Context, phone: String, message: String? = null) {
    val digits = phone.filter { it.isDigit() }.let { if (it.length == 10) "91$it" else it }
    val base = "https://wa.me/$digits"
    val url = if (message.isNullOrBlank()) base else "$base?text=${android.net.Uri.encode(message)}"
    val intent = android.content.Intent(
        android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url),
    ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}

/** A ready-to-send Hinglish opener so the rep doesn't retype the same intro 100×/day. */
private fun waTemplate(name: String?, project: String?, agent: String?, company: String?): String {
    val hi = name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji," } ?: "Namaste,"
    val who = agent?.trim()?.ifBlank { null } ?: "aapka property advisor"
    val co = company?.trim()?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    val ref = project?.trim()?.takeIf { it.isNotBlank() }?.let { " Aapne $it ke liye enquiry ki thi." }
        ?: " Aapki property enquiry ke regarding."
    return "$hi main $who$co se baat kar raha hoon.$ref Property ki details aur best offer share karna chahta hoon — kya abhi baat kar sakte hain?"
}

@Composable
private fun Avatar(name: String, size: Int = 44, tint: Color? = null) {
    // With a [tint] the avatar carries the lead's stage colour (colour =
    // information); without one it falls back to the name-hash palette.
    val c = tint ?: colorFor(name)
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(c.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials(name), color = c, fontWeight = FontWeight.Bold, fontSize = (size / 2.6).sp)
    }
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
    // Selected = filled with the bucket's own accent; unselected = quiet neutral.
    // The count rides in a tiny counter chip so it reads as a badge, not text.
    val bg = if (selected) accent else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
    val fg = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(bg).clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = fg, style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium)
        if (count > 0) {
            Spacer(Modifier.width(6.dp))
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (selected) Color(0x33FFFFFF) else MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 7.dp, vertical = 1.dp),
            ) {
                Text("$count", color = fg, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }
        }
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

/** Group an Indian 10-digit number as "98765 43210" for easy reading; otherwise return as-is. */
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
    val newLeads = app.leads.count { it.status in setOf("new", "queued") }
    val stageCounts = STAGES.map { st -> st to app.leads.count { it.status in st.statuses } }
    val pipelineValue = app.leads.filter { it.status !in setOf("lost", "not_interested", "dnc") }.sumOf { parseBudgetRupees(it.budget) }
    val tokenCollected = app.leads.sumOf { it.tokenAmount ?: 0.0 }
    val hotUncontacted = app.leads.count { it.temperature == "hot" && it.status in setOf("new", "queued") }
    // Safety net: interested/callback leads with NO pending follow-up are
    // "unprotected" — one tap gives each a reminder so none can slip away.
    val protectedIds = app.followUpList.mapNotNull { it.contactId }.toSet()
    val protectedPhones = app.followUpList.map { it.phone }.toSet()
    val unprotected = app.leads.filter {
        it.status in setOf("interested", "callback") && it.id !in protectedIds && it.phone !in protectedPhones
    }
    // Today's Plan buckets — WHO asked for a callback, WHOSE visit is fixed,
    // WHOSE visit already happened. Names up front, not buried in statuses.
    val nowMs = System.currentTimeMillis()
    val callbacks = app.followUpList.sortedBy { instantMillis(it.dueAt) ?: Long.MAX_VALUE }
    val visitsPlanned = app.leads
        .mapNotNull { c -> c.siteVisitAt?.let { instantMillis(it) }?.let { ms -> c to ms } }
        .filter { it.second >= nowMs }.sortedBy { it.second }
    val visitsDone = app.leads
        .mapNotNull { c -> c.siteVisitAt?.let { instantMillis(it) }?.let { ms -> c to ms } }
        .filter { it.second < nowMs && it.first.status !in setOf("booked", "lost", "not_interested", "dnc") }
        .sortedByDescending { it.second }

    Refreshable(onRefresh = { vm.loadHome(force = true); vm.loadLeads(force = true) }, modifier = Modifier.fillMaxSize()) {
    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Greeting hero
        item { GreetingCard(app, firstName, onOpenAttendance = { onNavigate("attendance") }) }

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
        if (callbacks.isNotEmpty() || visitsPlanned.isNotEmpty() || visitsDone.isNotEmpty()) {
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
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(8.dp).clip(CircleShape).background(stage.color))
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
                                            .clip(RoundedCornerShape(50)).background(stage.color))
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

/** One line of Today's Plan: who, when, and (if captured) what they said. */
private data class PlanRow(
    val name: String,
    val whenLabel: String,
    val detail: String?,
    val phone: String,
    val overdue: Boolean = false,
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
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(color.copy(alpha = 0.07f))
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(r.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Spacer(Modifier.width(8.dp))
                    Text(r.whenLabel, style = MaterialTheme.typography.labelSmall,
                        color = if (r.overdue) Red else color, fontWeight = FontWeight.Bold)
                }
                r.detail?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            }
            IconButton(onClick = { onCall(r.phone) }, modifier = Modifier.size(34.dp).clip(CircleShape).background(Green.copy(alpha = 0.12f))) {
                Icon(Icons.Default.Call, contentDescription = "Call ${r.name}", tint = Green, modifier = Modifier.size(17.dp))
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
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun LeadsScreen(vm: MainViewModel, onStartCampaign: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadLeads(); vm.loadFollowUps() }
    // Pending follow-up per lead, so every card can say "call back · Today 4 PM".
    val fuByContact = remember(app.followUpList) { app.followUpList.filter { it.contactId != null }.associateBy { it.contactId } }
    val fuByPhone = remember(app.followUpList) { app.followUpList.associateBy { it.phone } }

    var query by remember { mutableStateOf("") }
    // One simple question on screen: "which bucket?" — the fine-grained stage /
    // temperature / sort controls live in the Filters sheet, not the page.
    var bucket by remember { mutableStateOf("new") }              // all | new | working | pipeline | booked — default to New
    var stageFilter by remember { mutableStateOf<String?>(null) } // exact stage from the sheet
    var quick by remember { mutableStateOf<String?>(null) }       // "today" | "retry"
    var tempFilter by remember { mutableStateOf<String?>(null) }  // null = all temps
    var sortBy by remember { mutableStateOf("default") }          // "default" | "score" | "recent"
    var sheetOpen by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var actionFor by remember { mutableStateOf<Contact?>(null) }
    var scheduleFor by remember { mutableStateOf<Contact?>(null) }

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
    // NEW = "aaj kiska number lagana hai". A lead nobody reached yet (fresh,
    // no-answer, busy, wrong person) or one that said "kal call karna"
    // (callback) belongs here — but only when its time has COME. A lead whose
    // retry/callback is booked for later is asleep in Working; the moment the
    // due time passes it wakes up back in New, pinned to the top, wearing its
    // attempt tag. The rep never plans this — the list breathes on its own.
    val newSet = setOf("new", "queued", "no_answer", "busy", "wrong_person", "callback")
    val workingSet = setOf("called", "follow_up", "interested")
    val pipelineSet = setOf("site_visit", "negotiation", "proposal", "token_paid")
    val nowMs = System.currentTimeMillis()
    fun fuOf(c: Contact) = c.id?.let { fuByContact[it] } ?: fuByPhone[c.phone]
    fun sleeping(c: Contact): Boolean {
        val due = fuOf(c)?.let { instantMillis(it.dueAt) } ?: return false
        return due > nowMs
    }
    val base = when {
        stageFilter != null -> app.leads.filter { it.status in (STAGES.firstOrNull { s -> s.key == stageFilter }?.statuses ?: emptySet()) }
        quick == "today" -> app.leads.filter { isToday(it.createdAt) }
        quick == "retry" -> app.leads.filter { it.status in setOf("no_answer", "busy", "wrong_person", "callback", "follow_up") }
        else -> when (bucket) {
            "new" -> app.leads.filter { it.status in newSet && !sleeping(it) }
            "working" -> app.leads.filter { it.status in workingSet || (it.status in newSet && sleeping(it)) }
            "pipeline" -> app.leads.filter { it.status in pipelineSet }
            "booked" -> app.leads.filter { it.status == "booked" }
            else -> app.leads
        }
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
        else -> if (bucket == "new" && stageFilter == null && quick == null) {
            searched.sortedByDescending { c ->
                val due = fuOf(c)?.let { instantMillis(it.dueAt) }
                if (due != null && due <= nowMs) 1 else 0
            }
        } else searched
    }
    val filteredIds = filtered.mapNotNull { it.id }.toSet()
    val allSelected = filteredIds.isNotEmpty() && selectedIds.containsAll(filteredIds)

    fun exitSelect() { selectMode = false; selectedIds = emptySet() }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    Column(Modifier.fillMaxSize()) {
        Refreshable(onRefresh = { vm.loadLeads(force = true) }, modifier = Modifier.weight(1f)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                if (!selectMode) {
                    // Jobs rule: a title, a count, and nothing shouting. Utilities
                    // (refresh / AI score / select) live behind two quiet circles.
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Leads", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                            Text("${app.leads.size} total · ${app.leads.count { it.status in setOf("new", "queued") }} new",
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier.size(42.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface)
                                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                    .clickable { vm.loadLeads(force = true) },
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp)) }
                            Box {
                                Box(
                                    Modifier.size(42.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface)
                                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                        .clickable { menuOpen = true },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (app.aiScoringLeads) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                                    else Icon(Icons.Default.MoreVert, contentDescription = "More", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                                }
                                androidx.compose.material3.DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                    androidx.compose.material3.DropdownMenuItem(
                                        text = { Text(if (app.aiScoringLeads) "Scoring…" else "AI Score leads") },
                                        leadingIcon = { Icon(Icons.Default.AutoAwesome, contentDescription = null) },
                                        onClick = { menuOpen = false; if (!app.aiScoringLeads) vm.scoreLeads() },
                                    )
                                    androidx.compose.material3.DropdownMenuItem(
                                        text = { Text("Select leads") },
                                        leadingIcon = { Icon(Icons.Default.Checklist, contentDescription = null) },
                                        onClick = { menuOpen = false; selectMode = true },
                                    )
                                }
                            }
                        }
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
            // Search + Filters: one slim row. Everything fine-grained hides in the sheet.
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        query, { query = it }, placeholder = { Text("Search name or phone") },
                        singleLine = true, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp),
                    )
                    val filtersOn = stageFilter != null || tempFilter != null || quick != null || sortBy != "default"
                    Box(
                        Modifier.size(48.dp).clip(RoundedCornerShape(12.dp))
                            .background(if (filtersOn) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .border(1.dp, if (filtersOn) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
                            .clickable { sheetOpen = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Sort, contentDescription = "Filters",
                            tint = if (filtersOn) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp))
                    }
                }
            }
            // Five buckets a rep thinks in — one calm row, no chip wall.
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val segments = listOf(
                        "all" to Triple("All", app.leads.size, MaterialTheme.colorScheme.primary),
                        "new" to Triple("New", app.leads.count { it.status in newSet && !sleeping(it) }, MaterialTheme.colorScheme.primary),
                        "working" to Triple("Working", app.leads.count { it.status in workingSet || (it.status in newSet && sleeping(it)) }, Indigo),
                        "pipeline" to Triple("Pipeline", app.leads.count { it.status in pipelineSet }, Purple),
                        "booked" to Triple("Booked", app.leads.count { it.status == "booked" }, Green),
                    )
                    segments.forEach { (key, seg) ->
                        val (label, n, color) = seg
                        FilterTab(label, n, bucket == key && stageFilter == null && quick == null, color) {
                            bucket = key; stageFilter = null; quick = null
                        }
                    }
                }
            }
            // One quiet line teaching the two gestures that make the list fast.
            if (!selectMode) {
                item {
                    Text(
                        "Swipe right to call  ·  swipe left for WhatsApp",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    )
                }
            }
            // Active sheet-filters show as dismissible chips — tap ✕ to clear.
            run {
                val active = buildList {
                    stageFilter?.let { sf -> add(Triple("stage", STAGES.firstOrNull { it.key == sf }?.label ?: sf) { stageFilter = null }) }
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
                filtered.isEmpty() ->
                    item {
                        Text(if (app.leads.isEmpty()) "No leads yet. Ask your admin to upload leads, then select & start calling." else "No leads in this stage.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                else -> items(filtered, key = { it.id ?: it.phone }) { c ->
                    LeadCard(
                        c = c,
                        followUp = c.id?.let { fuByContact[it] } ?: fuByPhone[c.phone],
                        cloudOn = app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank(),
                        selectMode = selectMode,
                        isSelected = c.id != null && c.id in selectedIds,
                        onToggleSelect = { c.id?.let { id -> selectedIds = if (id in selectedIds) selectedIds - id else selectedIds + id } },
                        onCall = { vm.dialManual(c.phone) },
                        onCloudCall = { c.id?.let { vm.cloudCall(c.phone, it, c.campaignId) } },
                        onWhatsApp = { vm.openWaChat(c) },
                        onSchedule = { scheduleFor = c },
                        onMore = { actionFor = c },
                        onOpen = { c.id?.let { vm.openLeadDetail(it) } },
                    )
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
    if (!selectMode && filtered.isNotEmpty()) {
        androidx.compose.material3.ExtendedFloatingActionButton(
            onClick = { vm.callList(filtered, "Leads") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            icon = { Icon(Icons.Default.Call, contentDescription = null) },
            text = { Text("Call ${filtered.size}", fontWeight = FontWeight.Bold) },
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
                    STAGES.forEach { st ->
                        val n = app.leads.count { it.status in st.statuses }
                        FilterTab(st.label, n, stageFilter == st.key, st.color) {
                            stageFilter = if (stageFilter == st.key) null else st.key
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

    actionFor?.let { c ->
        LeadActionSheet(
            c = c,
            onDismiss = { actionFor = null },
            onApply = { status, temp, budget, note, svProj, svAt, token ->
                c.id?.let { vm.applyLead(it, status, temp, budget, note, svProj, svAt, token) }
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
    followUp: FollowUp? = null,
    cloudOn: Boolean,
    selectMode: Boolean = false,
    isSelected: Boolean = false,
    onToggleSelect: () -> Unit = {},
    onCall: () -> Unit,
    onCloudCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onSchedule: () -> Unit,
    onMore: () -> Unit,
    onOpen: () -> Unit = {},
) {
    val stage = stageOf(c.status)
    val container = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.07f) else MaterialTheme.colorScheme.surface
    val jade = if (androidx.compose.foundation.isSystemInDarkTheme()) Color(0xFF2BB894) else Color(0xFF0E7C66)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    // Speed-first gestures: swipe right → call, swipe left → WhatsApp. The state
    // never actually dismisses (confirmValueChange returns false → snaps back).
    val swipeState = androidx.compose.material3.rememberSwipeToDismissBoxState(
        confirmValueChange = { v ->
            when (v) {
                androidx.compose.material3.SwipeToDismissBoxValue.StartToEnd -> if (cloudOn) onCloudCall() else onCall()
                androidx.compose.material3.SwipeToDismissBoxValue.EndToStart -> onWhatsApp()
                else -> {}
            }
            false
        },
    )

    // The one line the rep actually needs — what the customer said / promised.
    val now = System.currentTimeMillis()
    val visitMs = c.siteVisitAt?.let { instantMillis(it) }
    val intent: Pair<String, Color>? = when {
        followUp != null -> {
            val late = (instantMillis(followUp.dueAt) ?: Long.MAX_VALUE) <= now
            (if (late) "↻ Call back · ${relativeDue(followUp.dueAt)}"
             else "↻ Call back · ${dayLabel(followUp.dueAt)} ${timeOnly(followUp.dueAt)}") to (if (late) Red else jade)
        }
        visitMs != null && visitMs >= now -> "🏠 Site visit · ${dayLabel(c.siteVisitAt)}" to Purple
        visitMs != null && c.status !in setOf("booked", "lost", "not_interested", "dnc") -> "✅ Visit done — close them" to Teal
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

    androidx.compose.material3.SwipeToDismissBox(
        state = swipeState,
        enableDismissFromStartToEnd = !selectMode,
        enableDismissFromEndToStart = !selectMode,
        backgroundContent = {
            val toCall = swipeState.dismissDirection == androidx.compose.material3.SwipeToDismissBoxValue.StartToEnd
            val bg = if (toCall) jade else WaGreen
            Row(
                Modifier.fillMaxSize().clip(RoundedCornerShape(18.dp)).background(bg.copy(alpha = 0.92f))
                    .padding(horizontal = 24.dp),
                horizontalArrangement = if (toCall) Arrangement.Start else Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(if (toCall) Icons.Default.Call else Icons.Default.Chat, contentDescription = if (toCall) "Call" else "WhatsApp",
                    tint = Color.White, modifier = Modifier.size(24.dp))
            }
        },
    ) {
        // A calm paper row — a stage dot, the name, the phone, one intent line, a
        // jade call button. Dense: 5–6 leads to a screen, no boxed-in cards.
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(container)
                .then(if (selectMode) Modifier.clickable { onToggleSelect() } else Modifier.clickable { onOpen() })
                .padding(horizontal = 15.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Stage dot + soft halo — colour is information, used once.
            Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.matchParentSize().clip(CircleShape).background(stage.color.copy(alpha = 0.16f)))
                Box(Modifier.size(9.dp).clip(CircleShape).background(stage.color))
            }
            Spacer(Modifier.width(13.dp))

            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(c.name ?: prettyPhone(c.phone), style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                    Spacer(Modifier.width(7.dp))
                    Text("· ${stage.label}", style = MaterialTheme.typography.labelSmall, color = muted, maxLines = 1)
                }
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(prettyPhone(c.phone), style = MaterialTheme.typography.bodySmall, color = muted, letterSpacing = 0.3.sp)
                    // Budget rides on the phone line so it's ALWAYS visible —
                    // especially on New leads where the intent line is busy.
                    c.budget?.takeIf { it.isNotBlank() }?.let {
                        Text("  ·  ₹ $it", style = MaterialTheme.typography.bodySmall, color = jade, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                    if (c.attempts > 0) {
                        // "Attempt 2/3" — which try comes NEXT, loud when its time is due.
                        val due = followUp?.let { instantMillis(it.dueAt) }
                        val dueNow = due != null && due <= now
                        Text(
                            "  ·  🔁 Attempt ${c.attempts + 1}",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (dueNow) Red else Amber,
                            fontWeight = FontWeight.SemiBold, maxLines = 1,
                        )
                    }
                }
                intent?.let { (label, color) ->
                    Spacer(Modifier.height(4.dp))
                    Text(label, style = MaterialTheme.typography.bodySmall, color = color, fontWeight = FontWeight.Medium,
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(10.dp))

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
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (tempLabel.isNotEmpty())
                        Text(tempLabel, style = MaterialTheme.typography.labelSmall, color = tempColor, fontWeight = FontWeight.SemiBold)
                    else c.createdAt?.let { Text(dayLabel(it), style = MaterialTheme.typography.labelSmall, color = muted) }
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(jade)
                            .clickable { if (cloudOn) onCloudCall() else onCall() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Default.Call, contentDescription = "Call", tint = Color.White, modifier = Modifier.size(17.dp)) }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadActionSheet(
    c: Contact,
    onDismiss: () -> Unit,
    onApply: (String?, String?, String?, String?, String?, String?, String?) -> Unit,
    onShareContent: () -> Unit = {},
    onProjects: () -> Unit = {},
    onArrived: () -> Unit = {},
) {
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
                if ((stage ?: c.status) == "token_paid") {
                    OutlinedTextField(
                        token, { token = it.filter { ch -> ch.isDigit() } },
                        label = { Text("Token / booking amount (₹)") },
                        leadingIcon = { Text("₹", style = MaterialTheme.typography.titleMedium) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
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
        onDismissRequest = { vm.dismissPostCall() },
        title = {
            Column {
                Text("Call ended", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(who, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        text = {
            if (scheduleFor == null) {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    // Context strip: last note + budget, always in front of the rep.
                    val lastNote = lead?.notes?.takeIf { it.isNotBlank() }
                    val budget = lead?.budget?.takeIf { it.isNotBlank() }
                    if (lastNote != null || budget != null) {
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                        ) {
                            budget?.let {
                                Text("💰 $it", style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                    OutlinedTextField(note, { note = it }, label = { Text("Quick note (optional)") },
                        singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(12.dp))
                    Text(
                        if (connected) "How did the call go?" else "What happened?",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DispoButton("No Answer", Red.copy(alpha = 0.12f), Red, Modifier.weight(1f)) { dispose("no_answer") }
                        DispoButton("Busy", Amber.copy(alpha = 0.12f), Amber, Modifier.weight(1f)) { dispose("busy") }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DispoButton("Switched off", Slate.copy(alpha = 0.12f), Slate, Modifier.weight(1f)) { dispose("no_answer") }
                        // Kid / family member picked up — the LEAD is still unreached,
                        // so it rides the same retry ladder as a no-answer.
                        DispoButton("Wrong person", Amber.copy(alpha = 0.12f), Amber, Modifier.weight(1f)) { dispose("wrong_person") }
                        DispoButton("Wrong number", Red.copy(alpha = 0.12f), Red, Modifier.weight(1f)) { dispose("dnc") }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DispoButton("Callback ↻", Indigo.copy(alpha = 0.12f), Indigo, Modifier.weight(1f)) { scheduleFor = "callback" }
                        // Interested NEVER ends without a next touch — it opens the
                        // schedule chips instead of silently closing the sheet.
                        DispoButton("Interested ⭐", Green.copy(alpha = 0.12f), Green, Modifier.weight(1f)) { scheduleFor = "interested" }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DispoButton("Not Interested", Slate.copy(alpha = 0.12f), Slate, Modifier.weight(1f)) { dispose("not_interested") }
                        DispoButton("Booked ✓", Teal.copy(alpha = 0.12f), Teal, Modifier.weight(1f)) { dispose("booked") }
                    }
                }
            } else {
                val interested = scheduleFor == "interested"
                // Inline quick-snooze — carries the temp + note, and stamps the
                // right status so an Interested lead stays "interested".
                QuickScheduleChips(
                    who = who,
                    headline = if (interested) "⭐ Interested — lock the next call" else "When should we remind you?",
                    onPick = { millis, n ->
                        vm.postCallScheduleFollowUp(millis, n ?: note.ifBlank { null }, temp, scheduleFor ?: "callback")
                    },
                    onBack = { scheduleFor = null },
                    onSkip = if (interested) ({ dispose("interested") }) else null,
                    skipLabel = "Save interested without reminder",
                )
            }
        },
        confirmButton = {},
        dismissButton = {
            if (scheduleFor == null) {
                // A typed note or temperature is never thrown away — Skip
                // becomes "Save & close" the moment something is captured.
                val hasContext = note.isNotBlank() || temp != null
                TextButton(onClick = {
                    if (hasContext) vm.postCallSaveContext(temp, note) else vm.dismissPostCall()
                }) { Text(if (hasContext) "Save & close" else "Skip") }
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

/** Reusable quick-schedule chips used in both PostCallDisposition and ScheduleFollowUpDialog. */
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

    Column {
        Text(headline, style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(8.dp))
        // Smart presets — hide options that are already in the past.
        OutlinedButton(onClick = { onPick(now.plusMinutes(30).toInstant().toEpochMilli(), null) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("In 30 minutes") }
        OutlinedButton(onClick = { onPick(now.plusHours(1).toInstant().toEpochMilli(), null) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("In 1 hour") }
        OutlinedButton(onClick = { onPick(now.plusHours(3).toInstant().toEpochMilli(), null) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("In 3 hours") }
        if (currentHour < 10) {
            OutlinedButton(onClick = { onPick(at(0, 10), null) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("Today 10 AM") }
        }
        if (currentHour < 16) {
            OutlinedButton(onClick = { onPick(at(0, 16), null) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("Today 4 PM") }
        }
        OutlinedButton(onClick = { onPick(at(1, 10), null) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("Tomorrow 10 AM") }
        OutlinedButton(onClick = { onPick(at(1, 16), null) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) { Text("Tomorrow 4 PM") }
        if (onSkip != null) {
            Spacer(Modifier.height(2.dp))
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) { Text(skipLabel) }
        }
        if (onBack != null) {
            Spacer(Modifier.height(2.dp))
            TextButton(onClick = onBack) { Text("← Back to disposition") }
        }
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

    var filter by remember { mutableStateOf("today") }
    var rescheduleFor by remember { mutableStateOf<FollowUp?>(null) }
    val now = System.currentTimeMillis()
    val all = app.followUpList
    val due = all.filter { (instantMillis(it.dueAt) ?: Long.MAX_VALUE) <= now }
    // Map due follow-ups to their lead rows so we can power-dial them back-to-back.
    val dueContacts = due.mapNotNull { f -> app.leads.find { it.id == f.contactId } }
    val todayList = all.filter { dayLabel(it.dueAt) == "Today" }
    val morningList = todayList.filter { f ->
        val ms = instantMillis(f.dueAt) ?: return@filter false
        java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).hour < 13
    }
    val afternoonList = todayList.filter { f ->
        val ms = instantMillis(f.dueAt) ?: return@filter false
        java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).hour >= 13
    }
    val overdueStrict = all.filter {
        val ms = instantMillis(it.dueAt) ?: Long.MAX_VALUE
        ms < now && dayLabel(it.dueAt) != "Today"
    }

    val weekList = all.filter {
        val ms = instantMillis(it.dueAt) ?: return@filter false
        ms <= now + 7L * 24 * 3600_000L
    }
    val shown = when (filter) {
        "today" -> todayList
        "morning" -> morningList
        "afternoon" -> afternoonList
        "week" -> weekList
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
                IconButton(onClick = { vm.loadFollowUps(force = true) }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh")
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
                FilterTab("This week", weekList.size, filter == "week", MaterialTheme.colorScheme.primary) { filter = "week" }
                FilterTab("Morning", morningList.size, filter == "morning", Amber) { filter = "morning" }
                FilterTab("Afternoon", afternoonList.size, filter == "afternoon", Indigo) { filter = "afternoon" }
                FilterTab("Overdue", overdueStrict.size, filter == "overdue", Red) { filter = "overdue" }
            }
        }
        // Bulk reschedule: clear an overdue pile-up in one tap.
        if (overdueStrict.isNotEmpty()) {
            item {
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(Red.copy(alpha = 0.10f))
                        .clickable {
                            val tomorrow10 = java.time.ZonedDateTime.now().plusDays(1)
                                .withHour(10).withMinute(0).withSecond(0).toInstant().toEpochMilli()
                            vm.rescheduleFollowUps(overdueStrict, tomorrow10)
                        }
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                ) {
                    Text("⚠️ ${overdueStrict.size} overdue · tap to push all to tomorrow 10 AM",
                        style = MaterialTheme.typography.labelLarge, color = Red, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        // auto-queue
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Bolt, contentDescription = "Auto queue", tint = MaterialTheme.colorScheme.onPrimary)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Auto queue mode", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("Call your due leads back to back", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val next = due.firstOrNull() ?: all.firstOrNull()
                    val canQueue = dueContacts.isNotEmpty()
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                            .clickable(enabled = next != null) {
                                // Power-dial all due follow-ups back-to-back when we can
                                // map them to leads; otherwise just dial the next one.
                                if (canQueue) vm.callList(dueContacts, "Due follow-ups")
                                else next?.let { vm.dialManual(it.phone) }
                            }
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.PlayArrow, contentDescription = "Start", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (canQueue) "Call ${dueContacts.size} due" else "Call next", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge)
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
                    onWhatsApp = { openWhatsApp(context, f.phone, waTemplate(f.name, null, app.profile?.fullName, app.company?.name)) },
                    onSnooze = { f.id?.let { vm.snoozeFollowUp(it, 1) } },
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
private fun FollowUpCard(f: FollowUp, onCall: () -> Unit, onWhatsApp: () -> Unit, onSnooze: () -> Unit, onReschedule: () -> Unit, onDone: () -> Unit) {
    val overdue = (instantMillis(f.dueAt) ?: Long.MAX_VALUE) <= System.currentTimeMillis()
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
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
                        Icon(Icons.Default.AccessTime, contentDescription = "Due time", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
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
                ActionButton(Icons.Default.Schedule, "Snooze", Amber, Modifier.weight(1f), onClick = onSnooze)
                ActionButton(Icons.Default.CalendarMonth, "Pick Time", Slate, Modifier.weight(1f), onClick = onReschedule)
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
