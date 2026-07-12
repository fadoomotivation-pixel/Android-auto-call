package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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

// Paper & ink: jade is the only accent; heat/warnings stay muted, never neon.
private val WhatsAppGreen = Color(0xFF25D366) // brand — kept recognisable
private val CJade = Color(0xFF0E7C66)
private val CTerra = Color(0xFFC0452C)   // missed / failed
private val CAmberM = Color(0xFFB8860B)  // no answer
private val CSlate = Color(0xFF5A6068)   // outgoing / neutral

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun CallsScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadCalls(); vm.loadLeads(); vm.loadDeviceRecents() }
    var sub by remember { mutableIntStateOf(0) } // 0 = Phone, 1 = App, 2 = Missed, 3 = Follow-up

    // Build phone/id → name lookups ONCE per lead-list change, not per row per
    // scroll frame. A linear app.leads.find() on every visible row was the fling jank.
    val nameByPhone = remember(app.leads) {
        app.leads.mapNotNull { l -> l.name?.takeIf { it.isNotBlank() }?.let { l.phone.filter { c -> c.isDigit() }.takeLast(10) to it } }.toMap()
    }
    val nameById = remember(app.leads) {
        app.leads.mapNotNull { l -> l.id?.let { id -> l.name?.takeIf { it.isNotBlank() }?.let { id to it } } }.toMap()
    }
    fun nameFor(c: CallLog): String? =
        c.contactId?.let { nameById[it] } ?: nameByPhone[c.phone.filter { it.isDigit() }.takeLast(10)]

    Refreshable(onRefresh = { vm.loadCalls(force = true); vm.loadDeviceRecents(); vm.loadFollowUps(force = true) }) {
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

        val followUps = vm.followUps()
        val missed = vm.missedCalls()
        // Phone tab first — it's the fast, native-dialer-style recents everyone reaches for.
        androidx.compose.material3.ScrollableTabRow(selectedTabIndex = sub, edgePadding = 0.dp) {
            Tab(selected = sub == 0, onClick = { sub = 0 }, text = { Text("Phone") })
            Tab(selected = sub == 1, onClick = { sub = 1 }, text = { Text("App") })
            Tab(selected = sub == 2, onClick = { sub = 2 }, text = { Text("Missed (${missed.size})") })
            Tab(selected = sub == 3, onClick = { sub = 3 }, text = { Text("Follow-up (${followUps.size})") })
        }
        Spacer(Modifier.height(8.dp))

        if (sub == 0) {
            // ---- PHONE: the device's own call log, GoDial-style ----
            val known = remember(app.leads) {
                app.leads.associateBy { it.phone.filter { ch -> ch.isDigit() }.takeLast(10) }
            }
            if (app.deviceRecents.isEmpty()) {
                Text("No recent calls, or call-log access is off. Enable the Phone permission to see your dialer history here.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 16.dp))
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val grouped = app.deviceRecents.groupBy { dayBucket(it.timeMillis) }
                    grouped.forEach { (bucket, calls) ->
                        item(key = "h-$bucket") {
                            Text(bucket, style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 6.dp, bottom = 2.dp))
                        }
                        items(calls, key = { "${it.number}-${it.timeMillis}" }) { dc ->
                            val lead = known[dc.digits]
                            PhoneRecentRow(
                                dc = dc,
                                leadName = lead?.name?.takeIf { it.isNotBlank() },
                                isKnown = lead != null,
                                onCall = { QuickActions.call(context, dc.number) },
                                onWhatsApp = { QuickActions.whatsApp(context, dc.number) },
                                onOpenLead = { lead?.id?.let { vm.openLeadDetail(it) } },
                                onAddLead = { vm.addLead("", dc.number, null, null, null); vm.loadDeviceRecents() },
                            )
                        }
                    }
                }
            }
            return@Column
        }

        // ---- summary card (app-logged calls only) ----
        SummaryCard(app.callSummary)
        Spacer(Modifier.height(12.dp))

        val rows = when (sub) {
            2 -> missed
            3 -> followUps
            else -> app.callList
        }

        when {
            app.callsLoading -> Box(Modifier.fillMaxWidth().padding(32.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            rows.isEmpty() -> Text(
                when (sub) {
                    2 -> "No missed calls 🎉"
                    3 -> "No follow-ups — every call connected 🎉"
                    else -> "No calls in this period yet."
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(rows, key = { it.id ?: "${it.phone}-${it.startedAt}" }) {
                    CallRow(it, name = nameFor(it), playing = it.id != null && it.id == app.playingCallId,
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
}

/** GoDial-style recent-call row from the device call log: direction arrow,
 *  colored avatar, time + duration, and a one-tap add-to-lead for unknown
 *  numbers (or open the lead if we already know them). */
@Composable
private fun PhoneRecentRow(
    dc: com.salesautocall.app.data.DeviceCall,
    leadName: String?,
    isKnown: Boolean,
    onCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onOpenLead: () -> Unit,
    onAddLead: () -> Unit,
) {
    val accent = when (dc.direction) {
        "missed" -> CTerra
        "in" -> CJade
        else -> CSlate
    }
    Card(
        Modifier.fillMaxWidth().clickable { if (isKnown) onOpenLead() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(accent.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center) {
                val label = leadName?.firstOrNull { it.isLetter() }?.uppercaseChar()?.toString()
                    ?: dc.number.firstOrNull { it.isDigit() }?.toString() ?: "#"
                Text(label, color = accent, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when (dc.direction) {
                            "missed" -> Icons.Default.CallMissed
                            "in" -> Icons.Default.CallReceived
                            else -> Icons.Default.CallMade
                        },
                        contentDescription = dc.direction, tint = accent, modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text(leadName ?: dc.number, style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
                Text(
                    buildString {
                        append(prettyClock(dc.timeMillis))
                        if (dc.durationSec > 0) append("  ·  ${formatDuration(dc.durationSec)}")
                    },
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onWhatsApp) { Icon(Icons.Default.Chat, contentDescription = "WhatsApp", tint = WhatsAppGreen) }
            IconButton(onClick = onCall) { Icon(Icons.Default.Call, contentDescription = "Call", tint = MaterialTheme.colorScheme.primary) }
            if (!isKnown) {
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary)
                        .clickable { onAddLead() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.PersonAdd, contentDescription = "Add as lead", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(20.dp)) }
            }
        }
    }
}

/** "Today" / "Yesterday" / "12 Jun" bucket header for the phone recents list. */
private fun dayBucket(ms: Long): String {
    val zone = java.time.ZoneId.systemDefault()
    val d = java.time.Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()
    val today = java.time.LocalDate.now(zone)
    return when (d) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> d.format(java.time.format.DateTimeFormatter.ofPattern("d MMM"))
    }
}

private fun prettyClock(ms: Long): String {
    val t = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
    val h12 = ((t.hour + 11) % 12) + 1
    return "%d:%02d %s".format(h12, t.minute, if (t.hour < 12) "AM" else "PM")
}

/** Avatar circle for a call row — initial + a subtle tint by call direction. */
@Composable
private fun CallAvatar(label: String, c: CallLog) {
    val initial = label.firstOrNull { it.isLetter() }?.uppercaseChar()?.toString()
        ?: label.firstOrNull { it.isDigit() }?.toString() ?: "#"
    val tint = if (c.direction == "incoming") CJade else MaterialTheme.colorScheme.primary
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(initial, color = tint, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun SummaryCard(s: CallSummary) {
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                SummaryStat("Total", s.total.toString())
                SummaryStat("Connected", s.connected.toString(), CJade)
                SummaryStat("No answer", s.noAnswer.toString(), CAmberM)
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
    name: String?,
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
    val title = name?.takeIf { it.isNotBlank() } ?: c.phone
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CallAvatar(title, c)
                Spacer(Modifier.size(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    // Show the number under the name only when we actually have a name.
                    if (!name.isNullOrBlank()) {
                        Text(c.phone, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    Spacer(Modifier.size(2.dp))
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
    val accent = CJade
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
    val accent = CJade
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
        c.direction == "incoming" -> Icons.Default.CallReceived to CJade
        else -> Icons.Default.CallMade to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Icon(icon, contentDescription = c.direction, tint = tint, modifier = Modifier.size(18.dp))
}

@Composable
private fun OutcomeBadge(outcome: String?) {
    val (text, color) = when (outcome) {
        "connected" -> "Connected" to CJade
        "no_answer" -> "No answer" to CAmberM
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
