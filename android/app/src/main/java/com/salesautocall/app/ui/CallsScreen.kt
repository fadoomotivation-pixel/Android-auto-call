package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.CallReceived
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.DeviceCall

// Paper & ink: jade is the only accent; heat/warnings stay muted, never neon.
private val WhatsAppGreen = Color(0xFF25D366) // brand — kept recognisable
private val CJade = Color(0xFF4353B8)
private val CTerra = Color(0xFFC0452C)   // missed / failed
private val CAmberM = Color(0xFFB8860B)  // no answer
private val CSlate = Color(0xFF5D6862)   // outgoing / neutral

/**
 * Calls — rebuilt to feel like the phone's own dialer, and to scroll like it:
 *  · flat rows on paper (no cards, no borders): avatar · name · arrow+time · one call button
 *  · tap a row to reveal the extras (WhatsApp / add-or-open lead / copy) — native-style expand
 *  · all grouping/filtering is memoized OUTSIDE the list, so a fling never re-parses dates
 */
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
    // Project, looked up the same memoised way the name is. A linear scan per
    // visible row is what made this list jank in the first place.
    val projectById = remember(app.leads) {
        app.leads.mapNotNull { l -> l.id?.let { id -> l.companyName?.takeIf { it.isNotBlank() }?.let { id to it } } }.toMap()
    }
    val projectByPhone = remember(app.leads) {
        app.leads.mapNotNull { l -> l.companyName?.takeIf { it.isNotBlank() }?.let { l.phone.filter { c -> c.isDigit() }.takeLast(10) to it } }.toMap()
    }
    fun projectFor(c: CallLog): String? =
        c.contactId?.let { projectById[it] } ?: projectByPhone[c.phone.filter { it.isDigit() }.takeLast(10)]

    fun nameFor(c: CallLog): String? =
        c.contactId?.let { nameById[it] } ?: nameByPhone[c.phone.filter { it.isDigit() }.takeLast(10)]

    // ONE list, and every tab and every count derives from it.
    //
    // The counts used to be built from app.callList while the rendered rows were
    // built from app.callList.filter { !it.offCrm }. On a phone whose calls are
    // mostly off-CRM that reads as a broken app, and it did: "Follow-up (56)"
    // sitting directly above "No follow-ups — every call connected 🎉".
    //
    // The filter is gone rather than copied into the counts. It was there to
    // keep a rep's personal calls out of the app, and it was not doing that:
    // the Phone tab right next to it lists the device's ENTIRE call log,
    // personal calls included. So it protected nothing and cost the rep every
    // call she had actually made — including the Play button, which is why not
    // one recording could be heard on a freshly logged-in phone. These are her
    // own calls; she is allowed to see them.
    val visible = app.callList
    val followUps = remember(visible) {
        visible.filter { it.outcome == "no_answer" || it.outcome == "failed" }.distinctBy { it.phone }
    }
    val missed = remember(visible) {
        visible.filter { it.direction == "incoming" && it.outcome != "connected" }
    }
    val recentsGrouped = remember(app.deviceRecents) {
        app.deviceRecents.groupBy { dayBucket(it.timeMillis) }.toList()
    }
    val known = remember(app.leads) {
        app.leads.associateBy { it.phone.filter { ch -> ch.isDigit() }.takeLast(10) }
    }

    Refreshable(onRefresh = { vm.loadCalls(force = true); vm.loadDeviceRecents(); vm.loadFollowUps(force = true) }) {
    Column(Modifier.fillMaxSize()) {
        // ── Header: title · period filter · refresh — one calm row ──
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 14.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Calls", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            var periodMenu by remember { mutableStateOf(false) }
            Box {
                Row(
                    Modifier.clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                        .clickable { periodMenu = true }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(app.callFilter.label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Icon(Icons.Default.ArrowDropDown, contentDescription = "Change period", modifier = Modifier.size(18.dp))
                }
                DropdownMenu(expanded = periodMenu, onDismissRequest = { periodMenu = false }) {
                    CallFilter.entries.forEach { f ->
                        DropdownMenuItem(text = { Text(f.label) }, onClick = { vm.setCallFilter(f); periodMenu = false })
                    }
                }
            }
            IconButton(onClick = { vm.loadCalls(force = true); vm.loadDeviceRecents() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Phone tab first — it's the fast, native-dialer-style recents everyone reaches for.
        androidx.compose.material3.ScrollableTabRow(selectedTabIndex = sub, edgePadding = 8.dp) {
            Tab(selected = sub == 0, onClick = { sub = 0 }, text = { Text("Phone") })
            Tab(selected = sub == 1, onClick = { sub = 1 }, text = { Text("App") })
            Tab(selected = sub == 2, onClick = { sub = 2 }, text = { Text("Missed (${missed.size})") })
            Tab(selected = sub == 3, onClick = { sub = 3 }, text = { Text("Follow-up (${followUps.size})") })
        }

        if (sub == 0) {
            // ── PHONE: the device's own call log, native-dialer style ──
            if (app.deviceRecents.isEmpty()) {
                Text(
                    "No recent calls, or call-log access is off. Enable the Phone permission to see your dialer history here.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp),
                )
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 100.dp)) {
                    recentsGrouped.forEach { (bucket, calls) ->
                        item(key = "h-$bucket") { SectionHeader(bucket) }
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
                                onCopy = { QuickActions.copy(context, dc.number) },
                            )
                        }
                    }
                }
            }
            return@Column
        }

        // Same source as the tab counts above — see `visible`. No second filter
        // here: a number the count includes and the list drops is the bug this
        // screen shipped with.
        val rows = when (sub) {
            2 -> missed
            3 -> followUps
            else -> visible
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
                modifier = Modifier.padding(20.dp),
            )
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 100.dp)) {
                // Summary rides inside the list so it scrolls away like a native header.
                item(key = "summary") { SummaryStrip(app.callSummary) }
                items(rows, key = { it.id ?: "${it.phone}-${it.startedAt}" }) {
                    CallRow(it, name = nameFor(it), project = projectFor(it),
                        playing = it.id != null && it.id == app.playingCallId,
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

/** Small, quiet section label — "Today" / "Yesterday" / "12 Jun". */
@Composable
private fun SectionHeader(label: String) {
    Text(
        label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 4.dp),
    )
}

/** Hairline between expanded content and the next row. */
@Composable
private fun Hairline() {
    Box(Modifier.fillMaxWidth().padding(start = 76.dp).height(1.dp).background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)))
}

/** One small labelled action inside an expanded row (native dialer style). */
@Composable
private fun RowAction(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(12.dp)).clickable { onClick() }.padding(horizontal = 14.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(3.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Native-dialer recent-call row: flat on the paper, one trailing call button.
 * Tapping the row expands a compact action strip (WhatsApp / lead / copy) —
 * exactly how the phone's own dialer behaves, so it needs no learning.
 */
@Composable
private fun PhoneRecentRow(
    dc: DeviceCall,
    leadName: String?,
    isKnown: Boolean,
    onCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onOpenLead: () -> Unit,
    onAddLead: () -> Unit,
    onCopy: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val missed = dc.direction == "missed"
    val accent = when (dc.direction) {
        "missed" -> CTerra
        "in" -> CJade
        else -> CSlate
    }
    Column(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar: letter for known leads, a quiet person glyph for strangers.
            Box(Modifier.size(44.dp).clip(CircleShape).background(accent.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
                val letter = leadName?.firstOrNull { it.isLetter() }?.uppercaseChar()?.toString()
                if (letter != null) {
                    Text(letter, color = accent, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                } else {
                    Icon(Icons.Default.Person, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    leadName ?: prettyNum(dc.number),
                    style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
                    color = if (missed) CTerra else MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                )
                Spacer(Modifier.height(1.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when (dc.direction) {
                            "missed" -> Icons.Default.CallMissed
                            "in" -> Icons.Default.CallReceived
                            else -> Icons.Default.CallMade
                        },
                        contentDescription = dc.direction, tint = accent, modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        buildString {
                            append(prettyClock(dc.timeMillis))
                            if (dc.durationSec > 0) append(" · ${formatDuration(dc.durationSec)}")
                        },
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onCall) {
                Icon(Icons.Default.Call, contentDescription = "Call", tint = CJade, modifier = Modifier.size(22.dp))
            }
        }
        if (expanded) {
            Row(
                Modifier.fillMaxWidth().padding(start = 62.dp, end = 8.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                RowAction(Icons.Default.Chat, "WhatsApp", WhatsAppGreen, onWhatsApp)
                if (isKnown) RowAction(Icons.Default.Person, "Open lead", CJade, onOpenLead)
                else RowAction(Icons.Default.PersonAdd, "Add lead", CJade) { onAddLead(); expanded = false }
                RowAction(Icons.Default.ContentCopy, "Copy", CSlate, onCopy)
            }
            Hairline()
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

/** "98765 43210" grouping for a bare number — reads like the native dialer. */
private fun prettyNum(raw: String): String {
    val d = raw.filter { it.isDigit() }
    return when {
        d.length == 10 -> "${d.substring(0, 5)} ${d.substring(5)}"
        d.length == 12 && d.startsWith("91") -> "+91 ${d.substring(2, 7)} ${d.substring(7)}"
        else -> raw
    }
}

/** Compact stat strip for app-logged calls — one quiet line, not a boxed card. */
@Composable
private fun SummaryStrip(s: CallSummary) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        SummaryStat("Total", s.total.toString())
        SummaryStat("Connected", s.connected.toString(), CJade)
        SummaryStat("No answer", s.noAnswer.toString(), CAmberM)
        SummaryStat("Talk time", formatDurationShort(s.talkSeconds))
    }
}

@Composable
private fun SummaryStat(label: String, value: String, color: Color = Color.Unspecified) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * App-logged call row — same native anatomy as the Phone tab: flat, one call
 * button, tap to expand extras (play/WhatsApp/copy). AI summary + suggested
 * disposition stay inline because they're actionable, not decoration.
 */
/** A single, quiet signal on a call row. Same height, same weight, every time —
 *  so three of them read as one line rather than three competing badges. */
@Composable
private fun CallSignal(label: String, tint: Color) {
    Box(
        Modifier.clip(RoundedCornerShape(5.dp)).background(tint.copy(alpha = 0.11f))
            .padding(horizontal = 6.dp, vertical = 1.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = tint,
            fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun CallRow(
    c: CallLog,
    name: String?,
    project: String?,
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
    var summaryOpen by remember(c.id) { mutableStateOf(false) }
    val title = name?.takeIf { it.isNotBlank() } ?: prettyNum(c.phone)
    val missed = c.direction == "incoming" && c.outcome != "connected"
    val accent = when {
        missed -> CTerra
        c.direction == "incoming" -> CJade
        else -> CSlate
    }

    Column(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(accent.copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
                val letter = name?.firstOrNull { it.isLetter() }?.uppercaseChar()?.toString()
                if (letter != null) {
                    Text(letter, color = accent, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                } else {
                    Icon(Icons.Default.Person, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
                    color = if (missed) CTerra else MaterialTheme.colorScheme.onSurface, maxLines = 1)
                Spacer(Modifier.height(1.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when {
                            missed -> Icons.Default.CallMissed
                            c.direction == "incoming" -> Icons.Default.CallReceived
                            else -> Icons.Default.CallMade
                        },
                        contentDescription = c.direction, tint = accent, modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        buildString {
                            append(outcomeLabel(c.outcome))
                            c.startedAt?.let { append(" · ${prettyTime(it)}") }
                            if (c.durationSeconds > 0) append(" · ${formatDuration(c.durationSeconds)}")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                    )
                }
                // WHAT THIS CALL PRODUCED — not just that it happened.
                //
                // This row said number, direction, time, duration: an Android
                // call log. A twelve-minute conversation that booked a site visit
                // and a three-second misdial looked identical until you tapped
                // both open.
                //
                // Only what is NOT already on the row goes here. The suggested
                // stage has its own actionable line below (DispositionSuggestion)
                // and a ready recording already lights the play button on the
                // right — repeating either would just be the same word twice.
                // That leaves two real gaps: the promise the rep made on this
                // call, and which project it was about.
                val owesFollowUp = c.wadaState == "pending"
                if (project != null || owesFollowUp) {
                    Spacer(Modifier.height(3.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (owesFollowUp) {
                            CallSignal("↻ Follow up", CAmberM)
                            Spacer(Modifier.width(5.dp))
                        }
                        project?.let {
                            Text("🏢 $it", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        }
                    }
                }
                // The first line of what was actually said. AiSummarySection
                // below shows only a "✨ AI Summary / Show" header until it is
                // opened — a label with none of the content. This is the bit
                // that lets a rep scan the day without tapping anything.
                c.summary?.trim()?.takeIf { it.isNotEmpty() }?.let { sum ->
                    Spacer(Modifier.height(3.dp))
                    Text(
                        sum.lineSequence().first().trim(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
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
            IconButton(onClick = { QuickActions.call(context, c.phone) }) {
                Icon(Icons.Default.Call, contentDescription = "Call back", tint = CJade, modifier = Modifier.size(22.dp))
            }
        }

        if (expanded) {
            Row(
                Modifier.fillMaxWidth().padding(start = 62.dp, end = 8.dp, bottom = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                RowAction(Icons.Default.Chat, "WhatsApp", WhatsAppGreen) { QuickActions.whatsApp(context, c.phone) }
                RowAction(Icons.Default.ContentCopy, "Copy", CSlate) { QuickActions.copy(context, c.phone) }
            }
        }

        if (playing && c.id != null) {
            AudioPlayer(callLogId = c.id!!, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }
        AiSummarySection(c, summarizing, summaryOpen, onToggle = { summaryOpen = !summaryOpen }, onSummarize = onSummarize)
        DispositionSuggestion(c, onApply = onApplyDisposition, onDismiss = onDismissDisposition)
        if (expanded) Hairline()
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

private fun outcomeLabel(outcome: String?): String = when (outcome) {
    "connected" -> "Connected"
    "no_answer" -> "No answer"
    "failed" -> "Failed"
    else -> outcome ?: "—"
}

/**
 * One-tap AI auto-disposition: the summarizer guessed the lead's stage from the
 * call. The rep confirms (applies it to the linked lead) or dismisses it.
 */
@Composable
private fun DispositionSuggestion(c: CallLog, onApply: (String) -> Unit, onDismiss: () -> Unit) {
    val status = c.suggestedDisposition ?: return
    val canApply = c.contactId != null
    Row(
        Modifier.fillMaxWidth().padding(start = 74.dp, end = 12.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (canApply) "✨ AI: set lead to ${dispositionLabel(status)}?"
            else "✨ AI: ${dispositionLabel(status)}",
            style = MaterialTheme.typography.labelMedium, color = CJade,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f),
        )
        if (canApply) {
            AssistChip(
                onClick = { onApply(status) },
                label = { Text("Apply") },
                leadingIcon = { Icon(Icons.Default.Check, contentDescription = null, Modifier.size(16.dp)) },
            )
            Spacer(Modifier.width(6.dp))
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
    val processing = summarizing || c.summaryStatus == "processing"
    val hasSummary = !c.summary.isNullOrBlank()
    // Nothing to show unless there's a recording to summarize.
    if (c.recordingStatus != "ready" && !hasSummary) return

    Column(Modifier.fillMaxWidth().padding(start = 74.dp, end = 16.dp, bottom = 4.dp)) {
        when {
            hasSummary -> {
                Row(
                    Modifier.fillMaxWidth().clickable { onToggle() },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("✨ AI Summary", style = MaterialTheme.typography.labelMedium,
                        color = CJade, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    Text(if (expanded) "Hide" else "Show",
                        style = MaterialTheme.typography.labelMedium, color = CJade)
                }
                if (expanded) {
                    Spacer(Modifier.height(4.dp))
                    Text(c.summary!!.trim(), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            processing -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = CJade)
                Spacer(Modifier.width(8.dp))
                Text("Summarizing with AI…", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Text("✨ AI summary",
                style = MaterialTheme.typography.labelMedium, color = CJade,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { onSummarize() })
        }
    }
}

private fun formatDuration(sec: Int): String {
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%dh %02dm %02ds".format(h, m, s) else "%dm %02ds".format(m, s)
}

/** "1h 12m" / "34m" — compact talk-time for the stat strip. */
private fun formatDurationShort(sec: Int): String {
    val h = sec / 3600; val m = (sec % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

/** ISO-8601 → "h:mm AM/PM" like the native dialer. */
private fun prettyTime(iso: String): String = runCatching {
    // "+00:00" is what the API sends; Instant.parse only takes "Z".
    val t = runCatching { java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault()) }
        .getOrElse { java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()) }
    val h12 = ((t.hour + 11) % 12) + 1
    "%d:%02d %s".format(h12, t.minute, if (t.hour < 12) "AM" else "PM")
}.getOrDefault(iso.take(16))
