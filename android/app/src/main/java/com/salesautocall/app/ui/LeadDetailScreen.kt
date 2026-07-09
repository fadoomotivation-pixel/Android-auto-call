package com.salesautocall.app.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Mic
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact

private val SETTABLE = listOf(
    "interested" to "Interested", "site_visit" to "Site Visit", "negotiation" to "Negotiation",
    "token_paid" to "Token Paid 💰", "booked" to "Booked / Won", "callback" to "Callback",
    "not_interested" to "Not interested", "lost" to "Lost", "dnc" to "Do Not Call",
)
private val TEMPS = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

private val GreenL = Color(0xFF16A34A)
private val AmberL = Color(0xFFF59E0B)
private val IndigoL = Color(0xFF4F46E5)
private val PurpleL = Color(0xFF7C3AED)
private val RedL = Color(0xFFEF4444)

/** The real-estate journey, top to bottom. First two steps are milestones the
 *  system stamps itself; from "Interested" onward the rep moves the lead. */
private data class FunnelStep(val key: String, val label: String, val statuses: Set<String>, val settable: Boolean)
private val FUNNEL = listOf(
    FunnelStep("new", "New enquiry", setOf("new", "queued"), false),
    FunnelStep("contacted", "Contacted", setOf("called", "no_answer", "busy", "callback", "follow_up"), false),
    FunnelStep("interested", "Interested", setOf("interested"), true),
    FunnelStep("site_visit", "Site Visit", setOf("site_visit"), true),
    FunnelStep("negotiation", "Negotiation", setOf("negotiation", "proposal"), true),
    FunnelStep("token_paid", "Token Paid", setOf("token_paid"), true),
    FunnelStep("booked", "Booked 🏆", setOf("booked"), true),
)

/** Ways a lead leaves the funnel (or loops back for another call). */
private val EXITS = listOf(
    "callback" to "Callback", "not_interested" to "Not interested",
    "lost" to "Lost", "dnc" to "Do Not Call",
)

private fun isoMs(iso: String?): Long? = iso?.let {
    runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching {
            java.time.LocalDateTime.parse(it).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        }.getOrNull()
}

private fun fmtWhen(ms: Long): String {
    val zone = java.time.ZoneId.systemDefault()
    val d = java.time.Instant.ofEpochMilli(ms).atZone(zone)
    val today = java.time.LocalDate.now(zone)
    val day = when (d.toLocalDate()) {
        today -> "Today"
        today.plusDays(1) -> "Tomorrow"
        today.minusDays(1) -> "Yesterday"
        else -> "${d.dayOfMonth} ${d.month.name.take(3).lowercase().replaceFirstChar { c -> c.uppercase() }}"
    }
    val h12 = ((d.hour + 11) % 12) + 1
    return "$day, $h12:${"%02d".format(d.minute)} ${if (d.hour < 12) "AM" else "PM"}"
}

/** Small translucent pill on the hero gradient. */
@Composable
private fun HeroChip(text: String, tint: Color) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(Color(0x24FFFFFF))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = tint, fontWeight = FontWeight.SemiBold)
    }
}

/** Full-screen 360° view of one lead: profile, one-tap actions, status/stage editor,
 *  and the full call history with playable recordings + AI summaries. */
@Composable
fun LeadDetailScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val contact = app.leads.find { it.id == app.leadDetailId } ?: run { vm.closeLeadDetail(); return }
    val context = LocalContext.current

    // System back / back-gesture returns to the lead list instead of exiting the app.
    BackHandler { vm.closeLeadDetail() }

    // Follow-ups power the "next step" panel — never let a lead sit without one.
    LaunchedEffect(Unit) { vm.loadFollowUps() }

    var note by remember(contact.id) { mutableStateOf(contact.notes ?: "") }
    var token by remember(contact.id) {
        mutableStateOf(contact.tokenAmount?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: "")
    }
    var scheduleOpen by remember { mutableStateOf(false) }
    var visitOpen by remember { mutableStateOf(false) }
    // Buyer changed their mind: confirmations for walking a lead back / cancelling.
    var confirmMoveKey by remember { mutableStateOf<String?>(null) }
    var confirmClearVisit by remember { mutableStateOf(false) }

    val followUp = app.followUpList.firstOrNull {
        (it.contactId != null && it.contactId == contact.id) || it.phone == contact.phone
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Refreshable(onRefresh = { vm.refreshLeadDetail(); vm.refreshVoiceNotes(); vm.loadFollowUps(force = true) }) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
            item {
                Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { vm.closeLeadDetail() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                    Text("Lead", style = MaterialTheme.typography.titleMedium)
                }
            }

            // Header — a proper hero: gradient card, identity, live chips, the AI
            // coach's next move, and the two actions that matter. First impression
            // of the lead = first impression of the app.
            item {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Brush.linearGradient(listOf(Color(0xFF1D4ED8), Color(0xFF7C3AED))))
                        .padding(horizontal = 20.dp, vertical = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    LeadAvatar(contact.name ?: contact.phone, size = 72)
                    Spacer(Modifier.height(10.dp))
                    Text(contact.name ?: contact.phone, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(contact.phone, style = MaterialTheme.typography.bodyMedium, color = Color(0xCCFFFFFF))
                    // When the lead arrived — "kis date ko aayi".
                    isoMs(contact.createdAt)?.let { ms ->
                        Spacer(Modifier.height(2.dp))
                        Text("Added ${fmtWhen(ms)}", style = MaterialTheme.typography.labelSmall, color = Color(0x99FFFFFF))
                    }
                    Spacer(Modifier.height(14.dp))
                    // Live chips: temperature · stage · budget.
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        contact.temperature?.takeIf { it.isNotBlank() }?.let { t ->
                            val (emoji, tint) = when (t) {
                                "hot" -> "🔥" to Color(0xFFFECACA)
                                "warm" -> "🌤" to Color(0xFFFDE68A)
                                else -> "❄️" to Color(0xFFBFDBFE)
                            }
                            HeroChip("$emoji ${t.replaceFirstChar { it.uppercase() }}", tint)
                        }
                        HeroChip(
                            FUNNEL.firstOrNull { contact.status in it.statuses }?.label
                                ?: SETTABLE.firstOrNull { it.first == contact.status }?.second
                                ?: contact.status.replaceFirstChar { it.uppercase() },
                            Color.White,
                        )
                        contact.budget?.takeIf { it.isNotBlank() }?.let { HeroChip("₹ $it", Color(0xFFBBF7D0)) }
                    }
                    // The AI coach's "what to say next" — from the last voice note.
                    contact.aiNextAction?.takeIf { it.isNotBlank() }?.let { tip ->
                        Spacer(Modifier.height(14.dp))
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(Color(0x2EFFFFFF)).padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("👉", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.width(8.dp))
                            Text(tip, style = MaterialTheme.typography.bodySmall, color = Color.White, fontWeight = FontWeight.Medium)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        // Primary action: Call (white on gradient). WhatsApp is the glassy secondary.
                        Row(
                            Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White)
                                .clickable {
                                    val id = contact.id
                                    if (app.callerdeskCalling) vm.cloudCall(contact.phone, id, contact.campaignId) else vm.dialManual(contact.phone)
                                }.padding(vertical = 13.dp),
                            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.Call, contentDescription = null, tint = Color(0xFF1D4ED8), modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Call", color = Color(0xFF1D4ED8), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        }
                        Row(
                            Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color(0x33FFFFFF))
                                .clickable {
                                    openWhatsAppLocal(context, contact.phone, waTemplateLocal(contact.name, contact.companyName, app.profile?.fullName, app.company?.name))
                                }.padding(vertical = 13.dp),
                            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.Chat, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("WhatsApp", color = Color.White, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            // NEXT STEP — the telecaller's safety rail. Either it shows what's
            // planned (callback / site visit) or it screams that nothing is.
            item {
                val visitMs = isoMs(contact.siteVisitAt)
                val nowMs = System.currentTimeMillis()
                val fuMs = followUp?.let { isoMs(it.dueAt) }
                val terminal = contact.status in setOf("booked", "lost", "not_interested", "dnc")
                Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                    when {
                        followUp != null -> NextStepCard(
                            color = if (fuMs != null && fuMs <= nowMs) RedL else IndigoL,
                            title = if (fuMs != null && fuMs <= nowMs) "↻ Call back — DUE NOW" else "↻ Next: call back · ${fuMs?.let { fmtWhen(it) } ?: ""}",
                            detail = followUp.note,
                            actionLabel = "Change",
                            onDelete = { followUp.id?.let { vm.completeFollowUp(it) } },
                        ) { scheduleOpen = true }
                        visitMs != null && visitMs >= nowMs -> NextStepCard(
                            color = PurpleL,
                            title = "🏠 Next: site visit · ${fmtWhen(visitMs)}",
                            detail = contact.siteVisitProject,
                            actionLabel = "Change",
                            onDelete = { confirmClearVisit = true },
                        ) { visitOpen = true }
                        !terminal -> NextStepCard(
                            color = AmberL,
                            title = "⚠️ No next step planned",
                            detail = "Set a reminder so this lead is never forgotten",
                            actionLabel = "Set now",
                        ) { scheduleOpen = true }
                    }
                }
            }

            // VOICE NOTES — right after the call actions: call khatam, bolo kya
            // baat hui, aur AI baaki sab set kar dega. The telecaller's #1 habit.
            item { SectionLabel("Voice notes") }
            item { VoiceNoteRecorderCard(vm, recording = app.voiceRecording, uploading = app.voiceUploading) }
            items(app.voiceNotes, key = { it.id ?: it.audioPath }) { n ->
                VoiceNoteRow(
                    n = n,
                    playing = n.id != null && n.id == app.playingNoteId,
                    onPlay = { vm.playVoiceNote(n) },
                    onStop = { vm.stopVoiceNotePlayback() },
                    onRefreshAi = { vm.refreshVoiceNotes() },
                    onApplyDisposition = { key -> contact.id?.let { vm.applyLead(it, key, null, null, null, null, null, null) } },
                )
            }

            item { FunnelHeader() }
            item {
                FunnelStepper(
                    contact = contact,
                    onSet = { key ->
                        when (key) {
                            "site_visit" -> visitOpen = true
                            else -> contact.id?.let {
                                vm.applyLead(it, key, null, null, null, null, null,
                                    if (key == "token_paid") token.ifBlank { null } else null)
                            }
                        }
                    },
                    onMoveBack = { key -> confirmMoveKey = key },
                    onEditVisit = { visitOpen = true },
                    onClearVisit = { confirmClearVisit = true },
                )
            }
            item {
                // Exits & loops: callback re-schedules, the rest close the lead out.
                ChipRow(EXITS, contact.status) { key ->
                    if (key == "callback") scheduleOpen = true
                    else contact.id?.let { vm.applyLead(it, key, null, null, null, null, null, null) }
                }
            }

            if (contact.status == "token_paid") {
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                        OutlinedTextField(
                            token, { v -> token = v.filter { it.isDigit() } },
                            label = { Text("Token / booking amount (₹)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true, modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            item { SectionLabel("Temperature") }
            item { ChipRow(TEMPS, contact.temperature ?: "") { key -> contact.id?.let { vm.setLeadTemperature(it, key) } } }

            item {
                Column(Modifier.padding(16.dp)) {
                    // Budget lives in the notes when it matters — the field was dead
                    // weight. Notes (voice + Hinglish quick chips) carry the context.
                    IntelligentNotes(note) { note = it }
                    Spacer(Modifier.height(8.dp))
                    DetailAction(Icons.Default.CalendarMonth, "Save details", MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth()) {
                        contact.id?.let {
                            vm.applyLead(it, null, null, null,
                                note.trim().ifBlank { null }.takeIf { n -> n != contact.notes },
                                // Persist the booking token too when the lead is at Token Paid,
                                // so typing it and tapping Save no longer loses the amount.
                                tokenAmount = if (contact.status == "token_paid") token.ifBlank { null } else null)
                        }
                    }
                }
            }

            // JOURNEY — kab aayi, kab kisne kya update kiya (stage / note / follow-up …).
            item { SectionLabel("Journey") }
            run {
                val journey = buildList {
                    addAll(app.leadDetailActivities.map { a ->
                        Triple(a.createdAt, a.type, a.detail + (a.actorName?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""))
                    })
                    contact.createdAt?.let { add(Triple(it, "created", "Lead added")) }
                }.sortedByDescending { it.first ?: "" }
                if (journey.isEmpty() && !app.leadDetailLoading) {
                    item {
                        Text(
                            "Updates you make on this lead will show here with date & time.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                    }
                } else {
                    items(journey.size) { i ->
                        val (atIso, type, text) = journey[i]
                        JourneyRow(atIso, type, text, last = i == journey.lastIndex)
                    }
                }
            }

            item { SectionLabel("Calls & recordings") }
            if (app.leadDetailLoading) {
                item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            } else if (app.leadDetailCalls.isEmpty()) {
                item { Text("No calls logged for this lead yet.", color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp)) }
            } else {
                items(app.leadDetailCalls, key = { it.id ?: it.startedAt ?: it.phone }) { call ->
                    LeadCallRow(call, playing = call.id != null && call.id == app.playingCallId,
                        onPlay = { call.id?.let { vm.playRecording(it) } }, onStop = { vm.stopRecording() })
                }
            }
        }
        }
    }

    if (scheduleOpen) {
        PickWhenDialog(
            title = "Follow-up · ${contact.name ?: contact.phone}",
            onDismiss = { scheduleOpen = false },
            onPick = { millis ->
                scheduleOpen = false
                vm.scheduleFollowUp(contact.id, contact.phone, contact.name, millis, null)
                if (contact.status !in setOf("interested", "site_visit", "negotiation", "token_paid", "booked")) {
                    contact.id?.let { vm.applyLead(it, "callback", null, null, null, null, null, null) }
                }
            },
        )
    }
    if (visitOpen) {
        PickWhenDialog(
            title = "Site visit · ${contact.name ?: contact.phone}",
            visitMode = true,
            onDismiss = { visitOpen = false },
            onPick = { millis ->
                visitOpen = false
                contact.id?.let {
                    vm.applyLead(it, "site_visit", null, null, null, null,
                        java.time.Instant.ofEpochMilli(millis).toString(), null)
                }
            },
        )
    }

    // Buyer changed their mind → walk the lead back to an earlier stage.
    confirmMoveKey?.let { key ->
        val label = FUNNEL.firstOrNull { it.key == key }?.label ?: key
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmMoveKey = null },
            title = { Text("Move back to $label?") },
            text = { Text("Buyer changed their mind? The lead will go back to \"$label\" — notes and call history stay safe.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirmMoveKey = null
                    val status = when (key) { "new" -> "new"; "contacted" -> "called"; else -> key }
                    contact.id?.let { vm.applyLead(it, status, null, null, null, null, null, null) }
                }) { Text("Move back") }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirmMoveKey = null }) { Text("Cancel") } },
        )
    }

    // Cancel a fixed site visit — clears the date and reverts to Interested.
    if (confirmClearVisit) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmClearVisit = false },
            title = { Text("Cancel site visit?") },
            text = { Text("The visit date will be removed. If the lead was at Site Visit it moves back to Interested.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirmClearVisit = false
                    contact.id?.let { vm.clearSiteVisit(it) }
                }) { Text("Yes, cancel visit", color = RedL) }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirmClearVisit = false }) { Text("Keep it") } },
        )
    }
}

/** The always-visible "what happens next" strip on a lead. [onDelete] shows a
 *  small ✕ so the rep can cancel the plan when the buyer changes their mind. */
@Composable
private fun NextStepCard(
    color: Color,
    title: String,
    detail: String?,
    actionLabel: String,
    onDelete: (() -> Unit)? = null,
    onAction: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(color.copy(alpha = 0.10f)).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = color, fontWeight = FontWeight.Bold)
            detail?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            }
        }
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier.clip(RoundedCornerShape(50)).background(color)
                .clickable { onAction() }.padding(horizontal = 13.dp, vertical = 7.dp),
        ) {
            Text(actionLabel, color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
        onDelete?.let {
            Spacer(Modifier.width(6.dp))
            Box(
                Modifier.size(30.dp).clip(CircleShape).background(color.copy(alpha = 0.14f))
                    .clickable { it() },
                contentAlignment = Alignment.Center,
            ) {
                Text("✕", color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** Vertical real-estate funnel: every stage on its own line with a ✓ trail,
 *  the current stage highlighted, later stages one tap away. Fully editable:
 *  done steps tap to walk the lead back, the fixed site visit can be edited
 *  or cancelled — buyers change their minds, the funnel keeps up. */
@Composable
private fun FunnelStepper(
    contact: Contact,
    onSet: (String) -> Unit,
    onMoveBack: (String) -> Unit,
    onEditVisit: () -> Unit,
    onClearVisit: () -> Unit,
) {
    val idx = FUNNEL.indexOfFirst { contact.status in it.statuses }
    Column(Modifier.padding(horizontal = 16.dp)) {
        FUNNEL.forEachIndexed { i, step ->
            val done = idx > i
            val current = idx == i
            val stepColor = when {
                done -> GreenL
                current -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.outlineVariant
            }
            Row(
                Modifier.fillMaxWidth()
                    .then(
                        when {
                            step.settable && !current && !done -> Modifier.clip(RoundedCornerShape(10.dp)).clickable { onSet(step.key) }
                            done -> Modifier.clip(RoundedCornerShape(10.dp)).clickable { onMoveBack(step.key) }
                            else -> Modifier
                        },
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Rail: circle + connector down to the next step.
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(26.dp).clip(CircleShape)
                            .background(if (done || current) stepColor else MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (done) "✓" else "${i + 1}",
                            color = if (done || current) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                        )
                    }
                    if (i < FUNNEL.lastIndex) {
                        Box(Modifier.width(2.dp).height(14.dp).background(if (done) GreenL else MaterialTheme.colorScheme.outlineVariant))
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f).padding(bottom = if (i < FUNNEL.lastIndex) 12.dp else 0.dp)) {
                    Text(
                        step.label,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (current) FontWeight.Bold else FontWeight.Medium,
                        color = when {
                            current -> MaterialTheme.colorScheme.primary
                            done -> MaterialTheme.colorScheme.onSurface
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                    // The detail that matters at each milestone.
                    val sub = when (step.key) {
                        "site_visit" -> isoMs(contact.siteVisitAt)?.let { ms ->
                            listOfNotNull(fmtWhen(ms), contact.siteVisitProject?.takeIf { it.isNotBlank() }).joinToString(" · ")
                        }
                        "token_paid" -> contact.tokenAmount?.takeIf { it > 0 }?.let { "₹${if (it % 1.0 == 0.0) it.toLong() else it}" }
                        else -> null
                    }
                    sub?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                // One quiet badge, not a column of labels. The rail is the affordance;
                // a single caption below the funnel explains the tap.
                val hasVisit = step.key == "site_visit" && !contact.siteVisitAt.isNullOrBlank()
                when {
                    hasVisit -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.clip(RoundedCornerShape(50)).background(PurpleL.copy(alpha = 0.12f))
                            .clickable { onEditVisit() }.padding(horizontal = 10.dp, vertical = 4.dp)) {
                            Text("Edit", color = PurpleL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                        Box(Modifier.size(24.dp).clip(CircleShape).background(RedL.copy(alpha = 0.12f))
                            .clickable { onClearVisit() }, contentAlignment = Alignment.Center) {
                            Text("✕", color = RedL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    current -> Box(Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                        .padding(horizontal = 10.dp, vertical = 4.dp)) {
                        Text("NOW", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

/** Section header for the funnel: title + a friendly "how to use" pill on top. */
@Composable
private fun FunnelHeader() {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Sales funnel",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Row(
                Modifier.clip(RoundedCornerShape(50))
                    .background(IndigoL.copy(alpha = 0.12f))
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("👆", style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.width(5.dp))
                Text(
                    "Tap a stage to move this lead",
                    style = MaterialTheme.typography.labelMedium,
                    color = IndigoL, fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

/** Quick when-picker: smart chips plus a full date & time fallback. Used for
 *  both follow-up reminders and fixing the site-visit day. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PickWhenDialog(
    title: String,
    visitMode: Boolean = false,
    onDismiss: () -> Unit,
    onPick: (Long) -> Unit,
) {
    val now = java.time.ZonedDateTime.now()
    fun at(days: Long, hour: Int) = now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    val options = if (visitMode) buildList {
        if (now.hour < 11) add("Today 11 AM" to at(0, 11))
        if (now.hour < 16) add("Today 4 PM" to at(0, 16))
        add("Tomorrow 11 AM" to at(1, 11))
        add("Tomorrow 4 PM" to at(1, 16))
        val toSunday = ((7 - now.dayOfWeek.value) % 7).let { if (it == 0) 7 else it }
        add("Sunday 11 AM" to at(toSunday.toLong(), 11))
    } else listOf(
        "In 1 hour" to now.plusHours(1).toInstant().toEpochMilli(),
        "In 3 hours" to now.plusHours(3).toInstant().toEpochMilli(),
        "Tomorrow 10 AM" to at(1, 10),
        "Tomorrow 4 PM" to at(1, 16),
        "In 2 days, 11 AM" to at(2, 11),
    )

    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var pickedDate by remember { mutableStateOf<Long?>(null) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                options.forEach { (label, millis) ->
                    androidx.compose.material3.OutlinedButton(
                        onClick = { onPick(millis) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                    ) { Text(label) }
                }
                androidx.compose.material3.Button(
                    onClick = { showDate = true },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                ) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Pick a date & time")
                }
            }
        },
        confirmButton = {},
        dismissButton = { androidx.compose.material3.TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (showDate) {
        val dps = androidx.compose.material3.rememberDatePickerState(initialSelectedDateMillis = now.toInstant().toEpochMilli())
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = { pickedDate = dps.selectedDateMillis; showDate = false; showTime = true }) { Text("Next") }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { showDate = false }) { Text("Cancel") } },
        ) { androidx.compose.material3.DatePicker(state = dps) }
    }

    if (showTime) {
        val tps = androidx.compose.material3.rememberTimePickerState(initialHour = 11, initialMinute = 0, is24Hour = false)
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showTime = false },
            title = { Text("Pick a time") },
            text = { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { androidx.compose.material3.TimePicker(state = tps) } },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    val base = pickedDate ?: now.toInstant().toEpochMilli()
                    val day = java.time.Instant.ofEpochMilli(base).atZone(java.time.ZoneId.of("UTC")).toLocalDate()
                    val millis = day.atTime(tps.hour, tps.minute).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                    showTime = false
                    onPick(millis)
                }) { Text("Set") }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { showTime = false }) { Text("Back") } },
        )
    }
}

@Composable
private fun LeadCallRow(call: CallLog, playing: Boolean, onPlay: () -> Unit, onStop: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (call.direction == "incoming") "📥 Incoming" else "📤 Outgoing",
                    style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text("${call.durationSeconds / 60}m ${call.durationSeconds % 60}s",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                call.startedAt?.let {
                    Text(it.take(16).replace('T', ' '), style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (call.recordingStatus == "ready" && call.id != null) {
                if (playing) AudioPlayer(callLogId = call.id, modifier = Modifier.fillMaxWidth())
                else {
                    Spacer(Modifier.height(6.dp))
                    Box(Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                        .clickable { onPlay() }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                        Text("▶ Play recording", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            if (!call.summary.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(call.summary!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    // Quiet, uppercase, tracked-out — the section whispers, the content speaks.
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        letterSpacing = 1.2.sp,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 6.dp),
    )
}

/** Common after-call notes a real-estate telecaller jots, in the Hinglish they
 *  actually speak. One tap appends — far faster than typing on a phone. */
private val QUICK_NOTES = listOf(
    "Phone nahi uthaya",
    "Baad me call karna",
    "Site visit fix",
    "Budget kam hai",
    "Loan chahiye",
    "Family se discuss karega",
    "Location pasand aayi",
    "Price zyada lagi",
    "Ready to book",
    "Abhi interested nahi",
    "WhatsApp pe details bheji",
    "Dobara mat call karna",
)

/** Smart notes: Hindi/English voice dictation + one-tap Hinglish quick chips,
 *  on top of the free-text field. Built for reps who type slowly in Hindi. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IntelligentNotes(note: String, onNote: (String) -> Unit) {
    val context = LocalContext.current
    // rememberUpdatedState so the voice-result callback always sees the latest note.
    val latest by rememberUpdatedState(note)

    fun append(text: String) {
        onNote(if (latest.isBlank()) text else "$latest, $text")
    }

    val voiceLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val spoken = result.data
                ?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (!spoken.isNullOrBlank()) onNote(if (latest.isBlank()) spoken else "$latest $spoken")
        }
    }

    fun startVoice() {
        val intent = android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // Hindi first, but it transcribes the Hinglish/English reps mix in too.
            putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "hi-IN")
            putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Bolkar note likhein…")
        }
        runCatching { voiceLauncher.launch(intent) }
            .onFailure {
                android.widget.Toast.makeText(context, "Voice typing not available on this phone", android.widget.Toast.LENGTH_SHORT).show()
            }
    }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Notes", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.weight(1f))
            Row(
                Modifier.clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                    .clickable { startVoice() }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.Mic, contentDescription = "Voice note", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Bolkar likhein", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            QUICK_NOTES.forEach { q ->
                Box(
                    Modifier.clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { append(q) }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text("+ $q", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(note, onNote, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun ChipRow(options: List<Pair<String?, String>>, selected: String, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (key, label) ->
            val on = selected == key
            Box(Modifier.clip(RoundedCornerShape(50))
                .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                .clickable { key?.let(onPick) }.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun LeadAvatar(label: String, size: Int) {
    val initial = label.firstOrNull { it.isLetter() }?.uppercaseChar()?.toString() ?: "#"
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(initial, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun DetailAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    tint: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier.clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.12f)).clickable { onClick() }.padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = tint, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
    }
}

private fun openWhatsAppLocal(context: android.content.Context, phone: String, message: String? = null) {
    val num = phone.filter { it.isDigit() }.let { if (it.length == 10) "91$it" else it }
    val base = "https://wa.me/$num"
    val url = if (message.isNullOrBlank()) base else "$base?text=${android.net.Uri.encode(message)}"
    val intent = android.content.Intent(
        android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url),
    ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}

/** Ready-to-send Hinglish opener (kept local; the TelecallerScreens copy is private). */
private fun waTemplateLocal(name: String?, project: String?, agent: String?, company: String?): String {
    val hi = name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji," } ?: "Namaste,"
    val who = agent?.trim()?.ifBlank { null } ?: "aapka property advisor"
    val co = company?.trim()?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    val ref = project?.trim()?.takeIf { it.isNotBlank() }?.let { " Aapne $it ke liye enquiry ki thi." }
        ?: " Aapki property enquiry ke regarding."
    return "$hi main $who$co se baat kar raha hoon.$ref Property ki details aur best offer share karna chahta hoon — kya abhi baat kar sakte hain?"
}

/** One "Journey" timeline row: emoji dot + what happened + when (and by whom). */
@Composable
private fun JourneyRow(atIso: String?, type: String, text: String, last: Boolean) {
    val (emoji, tint) = when (type) {
        "created" -> "🟢" to GreenL
        "status" -> "🔁" to IndigoL
        "temperature" -> "🌡️" to AmberL
        "note" -> "📝" to Color(0xFF64748B)
        "budget" -> "💰" to GreenL
        "site_visit" -> "📍" to PurpleL
        "follow_up" -> "⏰" to Color(0xFF0891B2)
        "call" -> "📞" to GreenL
        else -> "✏️" to Color(0xFF64748B)
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(28.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) { Text(emoji, style = MaterialTheme.typography.labelMedium) }
            if (!last) Box(Modifier.width(2.dp).height(24.dp).background(MaterialTheme.colorScheme.outlineVariant))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.padding(bottom = 8.dp)) {
            Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            isoMs(atIso)?.let {
                Text(fmtWhen(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Record card: idle → one-tap record; recording → live timer + Save / Discard. */
@Composable
private fun VoiceNoteRecorderCard(vm: MainViewModel, recording: Boolean, uploading: Boolean) {
    var seconds by remember { mutableStateOf(0) }
    LaunchedEffect(recording) {
        seconds = 0
        while (recording) {
            kotlinx.coroutines.delay(1000)
            seconds++
        }
    }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        when {
            recording -> Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .background(RedL.copy(alpha = 0.10f)).padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(RedL))
                Spacer(Modifier.width(10.dp))
                Text(
                    "Recording…  %d:%02d".format(seconds / 60, seconds % 60),
                    style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = RedL,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "Discard",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { vm.cancelVoiceNote() }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(GreenL)
                        .clickable { vm.finishVoiceNote() }.padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text("✓ Save", color = Color.White, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                }
            }
            uploading -> Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text("Saving voice note…", style = MaterialTheme.typography.bodyMedium)
            }
            else -> Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
                    .clickable { vm.startVoiceNote() }.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.Mic, contentDescription = "Record", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("Record voice note", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary)
                    Text("Call ke baad bolo kya baat hui — AI summary khud ban jayegi",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** One saved voice note: play, who/when, and the AI transcript + summary. */
@Composable
private fun VoiceNoteRow(
    n: com.salesautocall.app.data.LeadVoiceNote,
    playing: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onRefreshAi: () -> Unit,
    onApplyDisposition: (String) -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(38.dp).clip(CircleShape)
                    .background(if (playing) RedL else MaterialTheme.colorScheme.primary)
                    .clickable { if (playing) onStop() else onPlay() },
                contentAlignment = Alignment.Center,
            ) {
                Text(if (playing) "⏸" else "▶", color = Color.White, fontSize = 16.sp)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "🎤 ${n.durationSeconds}s voice note",
                    style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                )
                val meta = buildString {
                    n.actorName?.takeIf { it.isNotBlank() }?.let { append(it) }
                    isoMs(n.createdAt)?.let { if (isNotEmpty()) append(" · "); append(fmtWhen(it)) }
                }
                if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        when (n.aiStatus) {
            "ready" -> {
                if (!n.summary.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text("✨ AI: ${n.summary}", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface)
                }
                n.suggestedDisposition?.takeIf { it.isNotBlank() }?.let { d ->
                    val label = SETTABLE.firstOrNull { it.first == d }?.second ?: d
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("AI suggests:", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(6.dp))
                        Box(
                            Modifier.clip(RoundedCornerShape(50)).background(IndigoL.copy(alpha = 0.14f))
                                .clickable { onApplyDisposition(d) }.padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text("$label — Apply", style = MaterialTheme.typography.labelMedium,
                                color = IndigoL, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            "failed" -> {
                Spacer(Modifier.height(6.dp))
                Text("AI summary failed — audio saved, admin can still listen.",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { onRefreshAi() }) {
                    CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp, color = IndigoL)
                    Spacer(Modifier.width(6.dp))
                    Text("AI summary ban raha hai… (tap to refresh)",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
