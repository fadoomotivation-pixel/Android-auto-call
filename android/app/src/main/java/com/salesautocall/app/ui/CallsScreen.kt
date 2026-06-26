package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.CallReceived
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.CallLog

private val WhatsAppGreen = Color(0xFF25D366)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun CallsScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadCalls() }
    var sub by remember { mutableIntStateOf(0) } // 0 = All, 1 = Missed, 2 = Follow-up

    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Calls", style = MaterialTheme.typography.headlineSmall)
            IconButton(onClick = { vm.loadCalls(force = true) }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---- date filter (compact dropdown instead of three pills) ----
        var periodMenu by remember { mutableStateOf(false) }
        Box {
            Row(
                Modifier.clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                    .clickable { periodMenu = true }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(app.callFilter.label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.size(6.dp))
                Icon(Icons.Default.ArrowDropDown, contentDescription = "Change period", modifier = Modifier.size(20.dp))
            }
            DropdownMenu(expanded = periodMenu, onDismissRequest = { periodMenu = false }) {
                CallFilter.entries.forEach { f ->
                    DropdownMenuItem(
                        text = { Text(f.label) },
                        onClick = { vm.setCallFilter(f); periodMenu = false },
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---- summary card ----
        SummaryCard(app.callSummary)
        Spacer(Modifier.height(12.dp))

        val followUps = vm.followUps()
        val missed = vm.missedCalls()
        TabRow(selectedTabIndex = sub) {
            Tab(selected = sub == 0, onClick = { sub = 0 }, text = { Text("All") })
            Tab(selected = sub == 1, onClick = { sub = 1 }, text = { Text("Missed (${missed.size})") })
            Tab(selected = sub == 2, onClick = { sub = 2 }, text = { Text("Follow-up (${followUps.size})") })
        }
        Spacer(Modifier.height(8.dp))

        val rows = when (sub) {
            1 -> missed
            2 -> followUps
            else -> app.callList
        }

        when {
            app.callsLoading -> Box(Modifier.fillMaxWidth().padding(32.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            rows.isEmpty() -> Text(
                when (sub) {
                    1 -> "No missed calls 🎉"
                    2 -> "No follow-ups — every call connected 🎉"
                    else -> "No calls in this period yet."
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(rows, key = { it.id ?: "${it.phone}-${it.startedAt}" }) {
                    CallRow(it, playing = it.id != null && it.id == app.playingCallId,
                        summarizing = it.id != null && it.id == app.summarizingCallId,
                        onPlay = { it.id?.let { id -> vm.playRecording(id) } }, onStop = { vm.stopRecording() },
                        onSummarize = { it.id?.let { id -> vm.generateSummary(id) } },
                        onApplyDisposition = { status ->
                            val cid = it.id; val contact = it.contactId
                            if (cid != null && contact != null) vm.applyDisposition(cid, contact, status)
                        },
                        onDismissDisposition = { it.id?.let { id -> vm.dismissDisposition(id) } })
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(s: CallSummary) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                SummaryStat("Total", s.total.toString())
                SummaryStat("Connected", s.connected.toString(), Color(0xFF2E7D32))
                SummaryStat("No answer", s.noAnswer.toString(), Color(0xFFEF6C00))
                SummaryStat("Failed", s.failed.toString(), MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Talk time  ${formatDuration(s.talkSeconds)}",
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun SummaryStat(label: String, value: String, color: Color = Color.Unspecified) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CallRow(
    c: CallLog,
    playing: Boolean,
    summarizing: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onSummarize: () -> Unit,
    onApplyDisposition: (String) -> Unit,
    onDismissDisposition: () -> Unit,
) {
    val context = LocalContext.current
    var expanded by remember(c.id) { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DirectionIcon(c)
                Spacer(Modifier.size(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(c.phone, style = MaterialTheme.typography.titleMedium)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutcomeBadge(c.outcome)
                        Spacer(Modifier.size(8.dp))
                        val meta = buildString {
                            c.startedAt?.let { append(prettyTime(it)) }
                            if (c.durationSeconds > 0) append("  ·  ${formatDuration(c.durationSeconds)}")
                        }
                        if (meta.isNotBlank()) Text(
                            meta, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (c.recordingStatus == "ready") {
                    IconButton(onClick = { if (playing) onStop() else onPlay() }) {
                        Icon(
                            if (playing) Icons.Default.Stop else Icons.Default.PlayArrow,
                            contentDescription = if (playing) "Stop recording" else "Play recording",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                IconButton(onClick = { QuickActions.whatsApp(context, c.phone) }) {
                    Icon(Icons.Default.Chat, contentDescription = "WhatsApp", tint = WhatsAppGreen)
                }
                IconButton(onClick = { QuickActions.call(context, c.phone) }) {
                    Icon(Icons.Default.Call, contentDescription = "Call back", tint = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = { QuickActions.copy(context, c.phone) }) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy")
                }
            }
            if (playing && c.id != null) {
                AudioPlayer(callLogId = c.id!!, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            }
            AiSummarySection(c, summarizing, expanded, onToggle = { expanded = !expanded }, onSummarize = onSummarize)
            DispositionSuggestion(c, onApply = onApplyDisposition, onDismiss = onDismissDisposition)
        }
    }
}

/** Human label for an AI-suggested lead stage (mirror of SETTABLE_STAGES). */
private fun dispositionLabel(status: String): String = when (status) {
    "interested" -> "Interested"
    "site_visit" -> "Site Visit"
    "negotiation" -> "Negotiation"
    "proposal" -> "Negotiation"
    "token_paid" -> "Token Paid"
    "booked" -> "Booked / Won"
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

/** Leading call-direction arrow, like a native dialer: outgoing ↗, incoming ↙,
 *  missed (unanswered incoming) ↙ in red. */
@Composable
private fun DirectionIcon(c: CallLog) {
    val missed = c.direction == "incoming" && c.outcome != "connected"
    val (icon, tint) = when {
        missed -> Icons.Default.CallMissed to MaterialTheme.colorScheme.error
        c.direction == "incoming" -> Icons.Default.CallReceived to Color(0xFF2E7D32)
        else -> Icons.Default.CallMade to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Icon(icon, contentDescription = c.direction, tint = tint, modifier = Modifier.size(18.dp))
}

@Composable
private fun OutcomeBadge(outcome: String?) {
    val (text, color) = when (outcome) {
        "connected" -> "Connected" to Color(0xFF2E7D32)
        "no_answer" -> "No answer" to Color(0xFFEF6C00)
        "failed" -> "Failed" to MaterialTheme.colorScheme.error
        else -> (outcome ?: "—") to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(text, style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.SemiBold)
}

private fun formatDuration(sec: Int): String {
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%dh %02dm %02ds".format(h, m, s) else "%dm %02ds".format(m, s)
}

/** ISO-8601 → "HH:mm" (date when not today is left to the filter context). */
private fun prettyTime(iso: String): String = runCatching {
    val t = java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
    "%02d:%02d".format(t.hour, t.minute)
}.getOrDefault(iso.take(16))
