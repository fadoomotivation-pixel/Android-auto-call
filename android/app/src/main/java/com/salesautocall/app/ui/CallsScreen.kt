package com.salesautocall.app.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMade
import androidx.compose.material.icons.automirrored.filled.CallMissed
import androidx.compose.material.icons.automirrored.filled.CallReceived
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.CallLog
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val WhatsAppGreen = Color(0xFF25D366)
private val ConnectedGreen = Color(0xFF22C55E)
private val MissedRed = Color(0xFFEF4444)
private val IncomingBlue = Color(0xFF3B82F6)
private val NoAnswerOrange = Color(0xFFF59E0B)

/** Quick outcome/direction filters on the Recent list. */
private enum class RowFilter(val label: String) {
    ALL("All"), CONNECTED("Connected"), MISSED("Missed"), INCOMING("Incoming");

    fun matches(c: CallLog): Boolean = when (this) {
        ALL -> true
        CONNECTED -> c.outcome == "connected"
        MISSED -> c.outcome == "no_answer" || c.outcome == "missed" || c.outcome == "failed"
        INCOMING -> c.direction == "incoming"
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun CallsScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) {
        vm.loadCalls()
        if (app.leads.isEmpty()) vm.loadLeads()
    }
    var sub by remember { mutableIntStateOf(0) } // 0 = Recent, 1 = Follow-up
    var query by remember { mutableStateOf("") }
    var rowFilter by remember { mutableStateOf(RowFilter.ALL) }
    var expandedId by remember { mutableStateOf<String?>(null) }

    // Lead names by phone (last 10 digits) — shows "Ramesh Verma" instead of +9198….
    val namesByPhone = remember(app.leads) {
        buildMap {
            app.leads.forEach { l ->
                if (!l.name.isNullOrBlank()) put(normPhone(l.phone), l.name!!)
            }
        }
    }

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Recent Calls", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            IconButton(onClick = { vm.loadCalls() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }
        }

        InAppCallingBanner()
        Spacer(Modifier.height(10.dp))

        // ---- search ----
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Search name or number…") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) IconButton(onClick = { query = "" }) {
                    Icon(Icons.Default.Close, contentDescription = "Clear")
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))

        // ---- period + outcome filters ----
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CallFilter.entries.forEach { f ->
                FilterChip(
                    selected = app.callFilter == f,
                    onClick = { vm.setCallFilter(f) },
                    label = { Text(f.label) },
                )
            }
        }
        Spacer(Modifier.height(2.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RowFilter.entries.forEach { f ->
                FilterChip(
                    selected = rowFilter == f,
                    onClick = { rowFilter = f },
                    label = { Text(f.label) },
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        SummaryCard(app.callSummary)
        Spacer(Modifier.height(10.dp))

        val followUps = vm.followUps()
        TabRow(selectedTabIndex = sub) {
            Tab(selected = sub == 0, onClick = { sub = 0 }, text = { Text("Recent") })
            Tab(selected = sub == 1, onClick = { sub = 1 }, text = { Text("Follow-up (${followUps.size})") })
        }
        Spacer(Modifier.height(8.dp))

        val q = query.trim()
        val rows = (if (sub == 0) app.callList else followUps)
            .filter { rowFilter.matches(it) }
            .filter {
                q.isEmpty() ||
                    it.phone.contains(q, ignoreCase = true) ||
                    (namesByPhone[normPhone(it.phone)]?.contains(q, ignoreCase = true) == true)
            }

        when {
            app.callsLoading -> Box(Modifier.fillMaxWidth().padding(32.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            rows.isEmpty() -> Text(
                when {
                    sub == 1 -> "No follow-ups — every call connected 🎉"
                    q.isNotEmpty() -> "No calls match “$q”."
                    else -> "No calls in this period yet."
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
            else -> {
                // Group by day, newest first: Today · Yesterday · “Mon, 30 Jun”.
                val grouped: List<Pair<String, List<CallLog>>> = remember(rows) {
                    rows.groupBy { dayKey(it.startedAt) }
                        .toList()
                        .sortedByDescending { it.second.firstOrNull()?.startedAt ?: "" }
                        .map { (day, calls) -> dayLabel(day) to calls }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    grouped.forEach { (label, calls) ->
                        item(key = "hdr-$label") {
                            Text(
                                label,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 6.dp, bottom = 2.dp),
                            )
                        }
                        items(calls, key = { it.id ?: "${it.phone}-${it.startedAt}" }) { c ->
                            val rowId = c.id ?: "${c.phone}-${c.startedAt}"
                            CallRow(
                                c = c,
                                name = namesByPhone[normPhone(c.phone)],
                                expanded = expandedId == rowId,
                                onToggle = { expandedId = if (expandedId == rowId) null else rowId },
                                playing = c.id != null && c.id == app.playingCallId,
                                summarizing = c.id != null && c.id == app.summarizingCallId,
                                onPlay = { c.id?.let { id -> vm.playRecording(id) } },
                                onStop = { vm.stopRecording() },
                                onSummarize = { c.id?.let { id -> vm.generateSummary(id) } },
                                onApplyDisposition = { status ->
                                    val cid = c.id; val contact = c.contactId
                                    if (cid != null && contact != null) vm.applyDisposition(cid, contact, status)
                                },
                                onDismissDisposition = { c.id?.let { id -> vm.dismissDisposition(id) } },
                            )
                        }
                    }
                    item { Spacer(Modifier.height(12.dp)) }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(s: CallSummary) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SummaryStat("Calls", s.total.toString())
            SummaryStat("Connected", s.connected.toString(), ConnectedGreen)
            SummaryStat("Missed", (s.noAnswer + s.failed).toString(), NoAnswerOrange)
            SummaryStat("Talk time", formatDuration(s.talkSeconds))
        }
    }
}

@Composable
private fun SummaryStat(label: String, value: String, color: Color = Color.Unspecified) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CallRow(
    c: CallLog,
    name: String?,
    expanded: Boolean,
    onToggle: () -> Unit,
    playing: Boolean,
    summarizing: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onSummarize: () -> Unit,
    onApplyDisposition: (String) -> Unit,
    onDismissDisposition: () -> Unit,
) {
    val context = LocalContext.current
    var aiExpanded by remember(c.id) { mutableStateOf(false) }
    Card(
        Modifier.fillMaxWidth().animateContentSize(),
        colors = CardDefaults.cardColors(
            containerColor = if (expanded) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
            else MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(Modifier.clickable { onToggle() }) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(name ?: c.phone)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        name ?: c.phone,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val (dirIcon, dirTint) = directionVisual(c)
                        Icon(dirIcon, contentDescription = null, tint = dirTint, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(5.dp))
                        Text(
                            prettyTime(c.startedAt ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(8.dp))
                        DurationChip(c.durationSeconds)
                        if (c.recordingStatus == "ready") {
                            Spacer(Modifier.width(6.dp))
                            Icon(
                                Icons.Default.GraphicEq, contentDescription = "Has recording",
                                tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp),
                            )
                        }
                    }
                }
                if (c.recordingStatus == "ready" && !playing) {
                    IconButton(onClick = onPlay) {
                        Icon(Icons.Default.PlayArrow, contentDescription = "Play recording", tint = MaterialTheme.colorScheme.primary)
                    }
                }
                IconButton(onClick = { QuickActions.call(context, c.phone) }) {
                    Box(
                        Modifier.size(38.dp).background(ConnectedGreen, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Call, contentDescription = "Call back", tint = Color.White, modifier = Modifier.size(19.dp))
                    }
                }
            }

            if (expanded) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutcomeBadge(c.outcome)
                    if (name != null) {
                        Spacer(Modifier.width(10.dp))
                        Text(c.phone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { QuickActions.whatsApp(context, c.phone) }) {
                        Icon(Icons.Default.Chat, contentDescription = "WhatsApp", tint = WhatsAppGreen)
                    }
                    IconButton(onClick = { QuickActions.copy(context, c.phone) }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy number")
                    }
                }
            }

            if (playing && c.id != null) {
                AudioPlayer(callLogId = c.id!!, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            }
            AiSummarySection(c, summarizing, aiExpanded, onToggle = { aiExpanded = !aiExpanded }, onSummarize = onSummarize)
            DispositionSuggestion(c, onApply = onApplyDisposition, onDismiss = onDismissDisposition)
            Spacer(Modifier.height(2.dp))
        }
    }
}

/** Gradient avatar with the lead's initial (or # for bare numbers). */
@Composable
private fun Avatar(label: String) {
    val palettes = listOf(
        listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)),
        listOf(Color(0xFF22C55E), Color(0xFF14B8A6)),
        listOf(Color(0xFFF59E0B), Color(0xFFEF4444)),
        listOf(Color(0xFFEC4899), Color(0xFF8B5CF6)),
        listOf(Color(0xFF06B6D4), Color(0xFF3B82F6)),
    )
    val colors = palettes[(label.hashCode().let { if (it < 0) -it else it }) % palettes.size]
    val initial = label.trim().firstOrNull { it.isLetter() }?.uppercase() ?: "#"
    Box(
        Modifier.size(44.dp).background(Brush.linearGradient(colors), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(initial, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}

@Composable
private fun DurationChip(sec: Int) {
    Box(
        Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(
            formatDuration(sec),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun directionVisual(c: CallLog): Pair<ImageVector, Color> = when {
    c.direction == "incoming" && (c.outcome == "missed" || c.outcome == "no_answer") ->
        Icons.AutoMirrored.Filled.CallMissed to MissedRed
    c.direction == "incoming" -> Icons.AutoMirrored.Filled.CallReceived to IncomingBlue
    else -> Icons.AutoMirrored.Filled.CallMade to ConnectedGreen
}

/** Human label for an AI-suggested lead stage (mirror of SETTABLE_STAGES). */
private fun dispositionLabel(status: String): String = when (status) {
    "interested" -> "Interested"
    "site_visit" -> "Site Visit"
    "proposal" -> "Proposal"
    "booked" -> "Closed / Won"
    "callback" -> "Callback"
    "not_interested" -> "Not interested"
    "dnc" -> "Do Not Call"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

/**
 * One-tap AI auto-disposition: the summarizer guessed the lead's stage from the
 * call. The rep confirms (applies it to the linked lead) or dismisses it.
 */
@Composable
private fun DispositionSuggestion(c: CallLog, onApply: (String) -> Unit, onDismiss: () -> Unit) {
    val status = c.suggestedDisposition ?: return
    val canApply = c.contactId != null
    val accent = Color(0xFF6D4DF2)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (canApply) "✨ AI: set lead to ${dispositionLabel(status)}?"
            else "✨ AI: ${dispositionLabel(status)}",
            style = MaterialTheme.typography.labelMedium, color = accent,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f),
        )
        if (canApply) {
            AssistChip(
                onClick = { onApply(status) },
                label = { Text("Apply") },
                leadingIcon = { Icon(Icons.Default.Check, contentDescription = null, Modifier.size(16.dp)) },
            )
            Spacer(Modifier.size(6.dp))
        }
        IconButton(onClick = onDismiss) {
            Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Inline AI call summary: shows the text (collapsible) when ready, a spinner
 * while it generates (auto after each recording), or a one-tap "Summarize"
 * action for older recordings that don't have one yet.
 */
@Composable
private fun AiSummarySection(
    c: CallLog,
    summarizing: Boolean,
    expanded: Boolean,
    onToggle: () -> Unit,
    onSummarize: () -> Unit,
) {
    val accent = Color(0xFF6D4DF2)
    val processing = summarizing || c.summaryStatus == "processing"
    val hasSummary = !c.summary.isNullOrBlank()
    // Nothing to show unless there's a recording to summarize.
    if (c.recordingStatus != "ready" && !hasSummary) return

    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        when {
            hasSummary -> {
                Row(
                    Modifier.fillMaxWidth().clickable { onToggle() },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("✨ AI Summary", style = MaterialTheme.typography.labelLarge,
                        color = accent, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    Text(if (expanded) "Hide" else "Show",
                        style = MaterialTheme.typography.labelMedium, color = accent)
                }
                if (expanded) {
                    Spacer(Modifier.height(4.dp))
                    Text(c.summary!!.trim(), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            processing -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = accent)
                Spacer(Modifier.size(8.dp))
                Text("Summarizing with AI…", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Text("✨ AI summary",
                style = MaterialTheme.typography.labelLarge, color = accent,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { onSummarize() })
        }
    }
}

@Composable
private fun OutcomeBadge(outcome: String?) {
    val (text, color) = when (outcome) {
        "connected" -> "Connected" to ConnectedGreen
        "no_answer" -> "No answer" to NoAnswerOrange
        "missed" -> "Missed" to MissedRed
        "failed" -> "Failed" to MaterialTheme.colorScheme.error
        else -> (outcome ?: "—") to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        Modifier.background(color.copy(alpha = 0.14f), RoundedCornerShape(50))
            .padding(horizontal = 9.dp, vertical = 3.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.SemiBold)
    }
}

// ---------- helpers ----------

private fun normPhone(p: String) = p.filter { it.isDigit() }.takeLast(10)

private fun formatDuration(sec: Int): String {
    if (sec <= 0) return "0s"
    if (sec < 60) return "${sec}s"
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%dh %02dm".format(h, m) else if (s == 0) "%dm".format(m) else "%dm %02ds".format(m, s)
}

/** ISO-8601 → local date key (yyyy-MM-dd) used for grouping. */
private fun dayKey(iso: String?): String = runCatching {
    Instant.parse(iso!!).atZone(ZoneId.systemDefault()).toLocalDate().toString()
}.getOrDefault("")

private fun dayLabel(dayKey: String): String = runCatching {
    val d = LocalDate.parse(dayKey)
    val today = LocalDate.now()
    when (d) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> d.format(DateTimeFormatter.ofPattern("EEE, d MMM"))
    }
}.getOrDefault(if (dayKey.isBlank()) "Earlier" else dayKey)

/** ISO-8601 → "hh:mm AM/PM". */
private fun prettyTime(iso: String): String = runCatching {
    val t = Instant.parse(iso).atZone(ZoneId.systemDefault())
    t.format(DateTimeFormatter.ofPattern("hh:mm a"))
}.getOrDefault(iso.take(16))
