package com.salesautocall.app.ui

import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.Wada

// ---- Palette: paper & ink, ONE jade accent — same language as the Leads page.
// The old rainbow constants keep their names but now resolve to ink/jade (with
// muted terracotta/amber reserved for genuine heat & warnings), so every
// call-site collapses to the calm palette without structural edits.
private val ScreenBg = Color(0xFFFAFBFB)
private val CardBg = Color.White
private val Ink = Color(0xFF0E1113)
private val SubInk = Color(0xFF616B66)
private val Hair = Color(0xFFEBEFED)
private val JadeL = Color(0xFF4353B8)
private val GreenL = JadeL          // success = jade
private val IndigoL = JadeL         // primary accent = jade
private val PurpleL = JadeL         // "current step" = jade
private val BlueL = JadeL           // call actions = jade
private val AmberL = Color(0xFFB8860B)   // muted amber: warnings + "warm"
private val RedL = Color(0xFFC0452C)     // muted terracotta: overdue, "hot", destructive
private val ColdL = Color(0xFF71817B)    // quiet warm slate: "cold" temperature
private val WhatsGreen = Color(0xFF25D366) // brand — recognisable, kept

private val SETTABLE = listOf(
    "interested" to "Interested", "site_visit" to "Site Visit", "negotiation" to "Negotiation",
    "token_paid" to "Token Paid 💰", "booked" to "Booked / Won", "callback" to "Callback",
    "not_interested" to "Not interested", "lost" to "Lost", "dnc" to "Do Not Call",
)
private val TEMPS = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

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

private val QUICK_NOTES = listOf(
    "Didn't pick up", "Call back later", "Site visit fixed", "Budget too low",
    "Needs a loan", "Will discuss with family", "Liked the location", "Found price high",
    "Ready to book", "Not interested right now", "Sent details on WhatsApp", "Do not call again",
)

// Order matters for speed, not just correctness: the API's "+00:00" makes
// Instant.parse throw, and a thrown exception per timestamp is expensive. The
// shape we actually receive is tried first; the others stay as fallbacks.
private fun isoMs(iso: String?): Long? = iso?.let {
    runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
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

private fun stageLabel(status: String): String =
    FUNNEL.firstOrNull { status in it.statuses }?.label?.removeSuffix(" 🏆")
        ?: SETTABLE.firstOrNull { it.first == status }?.second
        ?: status.replaceFirstChar { it.uppercase() }

/** Full-screen 360° view of one lead — the premium, card-based cockpit. */
@Composable
fun LeadDetailScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val contact = app.leads.find { it.id == app.leadDetailId } ?: run { vm.closeLeadDetail(); return }
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    BackHandler { vm.closeLeadDetail() }
    LaunchedEffect(Unit) { vm.loadFollowUps() }

    var note by remember(contact.id) { mutableStateOf(contact.notes ?: "") }
    var token by remember(contact.id) {
        mutableStateOf(contact.tokenAmount?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: "")
    }
    var scheduleOpen by remember { mutableStateOf(false) }
    var visitOpen by remember { mutableStateOf(false) }
    var confirmMoveKey by remember { mutableStateOf<String?>(null) }
    var confirmClearVisit by remember { mutableStateOf(false) }
    var moreOpen by remember { mutableStateOf(false) }
    var editIdentityOpen by remember { mutableStateOf(false) }
    var funnelExpanded by remember { mutableStateOf(false) }
    var journeyExpanded by remember { mutableStateOf(false) }

    val followUp = app.followUpList.firstOrNull {
        (it.contactId != null && it.contactId == contact.id) || it.phone == contact.phone
    }

    // Voice-to-text for the "Add Note" shortcut in Quick Notes.
    val latestNote by rememberUpdatedState(note)
    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val spoken = result.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (!spoken.isNullOrBlank()) note = if (latestNote.isBlank()) spoken else "$latestNote $spoken"
        }
    }
    fun startVoice() {
        val intent = android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "hi-IN")
            putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Bolkar note likhein…")
        }
        runCatching { voiceLauncher.launch(intent) }
            .onFailure { android.widget.Toast.makeText(context, "Voice typing not available on this phone", android.widget.Toast.LENGTH_SHORT).show() }
    }

    fun doCallNumber(number: String) {
        if (app.callerdeskCalling) vm.cloudCall(number, contact.id, contact.campaignId) else vm.dialManual(number)
    }
    fun doCall() = doCallNumber(contact.phone)
    fun doWhats() = openWhatsAppLocal(
        context, contact.phone,
        waTemplateLocal(contact.name, contact.companyName, app.profile?.fullName, app.company?.name, app.profile?.speaksAs),
    )
    fun copyNumber() {
        clipboard.setText(AnnotatedString(contact.phone))
        android.widget.Toast.makeText(context, "Number copied", android.widget.Toast.LENGTH_SHORT).show()
    }

    Box(Modifier.fillMaxSize().background(ScreenBg)) {
        Refreshable(onRefresh = { vm.refreshLeadDetail(); vm.refreshVoiceNotes(); vm.loadFollowUps(force = true) }) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // ---- Top bar: back · title · quick call / whatsapp / more ----
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(start = 8.dp, end = 12.dp, top = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(40.dp).clip(CircleShape).clickable { vm.closeLeadDetail() },
                            contentAlignment = Alignment.Center) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Ink)
                        }
                        Spacer(Modifier.width(4.dp))
                        Text("Lead Details", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Ink)
                        Spacer(Modifier.weight(1f))
                        TopIconButton(Icons.Default.Call, BlueL) { doCall() }
                        Spacer(Modifier.width(8.dp))
                        TopIconButton(Icons.Default.Chat, WhatsGreen) { doWhats() }
                        Spacer(Modifier.width(8.dp))
                        Box {
                            TopIconButton(Icons.Default.MoreHoriz, SubInk) { moreOpen = true }
                            DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                                DropdownMenuItem(text = { Text("Copy number") }, onClick = { moreOpen = false; copyNumber() })
                                DropdownMenuItem(text = { Text("Set reminder") }, onClick = { moreOpen = false; scheduleOpen = true })
                                DropdownMenuItem(text = { Text("Not interested") }, onClick = {
                                    moreOpen = false; contact.id?.let { vm.applyLead(it, "not_interested", null, null, null, null, null, null) }
                                })
                                DropdownMenuItem(text = { Text("Mark Lost") }, onClick = {
                                    moreOpen = false; contact.id?.let { vm.applyLead(it, "lost", null, null, null, null, null, null) }
                                })
                                DropdownMenuItem(text = { Text("Do Not Call") }, onClick = {
                                    moreOpen = false; contact.id?.let { vm.applyLead(it, "dnc", null, null, null, null, null, null) }
                                })
                            }
                        }
                    }
                }

                // ---- Hero ----
                item {
                    IdentityBlock(
                        contact,
                        onCopy = { copyNumber() },
                        onNextTap = { scheduleOpen = true },
                        onEdit = { editIdentityOpen = true },
                        onCallAlt = { contact.altPhone?.let { doCallNumber(it) } },
                    )
                }

                // ---- Primary actions first (guided flow: Call → WhatsApp → …) ----
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ActionTile(Icons.Default.Call, "Call Now", BlueL, Modifier.weight(1f)) { doCall() }
                        ActionTile(Icons.Default.Chat, "WhatsApp", WhatsGreen, Modifier.weight(1f)) { doWhats() }
                        ActionTile(Icons.Default.CalendarMonth, "Set Reminder", PurpleL, Modifier.weight(1f)) { scheduleOpen = true }
                        ActionTile(Icons.Default.MoreHoriz, "More", SubInk, Modifier.weight(1f)) { moreOpen = true }
                    }
                }

                // ---- Voice note ----
                item { VoiceNoteCard(vm, recording = app.voiceRecording, uploading = app.voiceUploading) }
                items(app.voiceNotes, key = { it.id ?: it.audioPath }) { n ->
                    Box(Modifier.padding(horizontal = 16.dp)) {
                        VoiceNoteRow(
                            n = n,
                            playing = n.id != null && n.id == app.playingNoteId,
                            onPlay = { vm.playVoiceNote(n) },
                            onStop = { vm.stopVoiceNotePlayback() },
                            onRefreshAi = { vm.refreshVoiceNotes() },
                            onApplyDisposition = { key -> contact.id?.let { vm.applyLead(it, key, null, null, null, null, null, null) } },
                        )
                    }
                }

                // ---- ONE AI on the lead — a single "AI Coach" card that covers
                // the whole call, before → during → after (RAG v12):
                //   🎯 Pitch    — the pre-call brief (RAG v4)
                //   🛡️ Objection — customer said no; get the exact counter (RAG v9)
                //   💬 Message   — a ready-to-send WhatsApp follow-up (RAG v12)
                // Merged so the rep never wonders which AI to use; collapsed by
                // default, one section open at a time. ----
                item {
                    AiCoachCard(
                        brief = app.leadBrief,
                        briefLoading = app.leadBriefLoading,
                        onGenerate = { contact.id?.let { vm.loadLeadBrief(it) } },
                        answer = app.rebuttal,
                        rebuttalLoading = app.rebuttalLoading,
                        onAsk = { objection -> vm.getRebuttal(contact, objection) },
                        onClear = { vm.clearRebuttal() },
                        draft = app.messageDraft,
                        draftLoading = app.messageDraftLoading,
                        onDraft = { purpose -> vm.draftMessage(contact, purpose) },
                        onSend = { msg -> openWhatsAppLocal(context, contact.phone, msg) },
                        onClearDraft = { vm.clearMessageDraft() },
                        error = app.coachError,
                    )
                }

                // ---- Wada: what the AI heard on the latest call. It applies
                // ITSELF (server-side, or on open) — the card just shows the
                // receipt: promise set, facts saved, zero typing. ----
                run {
                    val wadaCall = app.leadDetailCalls.firstOrNull {
                        it.aiActions != null && it.wadaState in setOf("pending", "applied")
                    }
                    if (wadaCall != null) {
                        item {
                            WadaCard(
                                call = wadaCall,
                                onDismiss = { vm.dismissWada(wadaCall) },
                            )
                        }
                    }
                }

                // ---- Next step banner ----
                item {
                    val visitMs = isoMs(contact.siteVisitAt)
                    val nowMs = System.currentTimeMillis()
                    val fuMs = followUp?.let { isoMs(it.dueAt) }
                    val terminal = contact.status in setOf("booked", "lost", "not_interested", "dnc")
                    when {
                        followUp != null -> NextStepBanner(
                            color = if (fuMs != null && fuMs <= nowMs) RedL else IndigoL,
                            title = if (fuMs != null && fuMs <= nowMs) "Call back — DUE NOW" else "Next: call back",
                            detail = listOfNotNull(fuMs?.let { fmtWhen(it) }, followUp.note).joinToString(" · ").ifBlank { "Reminder set" },
                            cta = "Change", onCta = { scheduleOpen = true }, onDelete = { followUp.id?.let { vm.completeFollowUp(it) } },
                        )
                        visitMs != null && visitMs >= nowMs -> NextStepBanner(
                            color = PurpleL, title = "Next: site visit",
                            detail = listOfNotNull(fmtWhen(visitMs), contact.siteVisitProject?.takeIf { it.isNotBlank() }).joinToString(" · "),
                            cta = "Change", onCta = { visitOpen = true }, onDelete = { confirmClearVisit = true },
                        )
                        !terminal -> NextStepBanner(
                            color = AmberL, title = "No next step planned",
                            detail = "Set a reminder so this lead is never forgotten",
                            cta = "Set Reminder", onCta = { scheduleOpen = true }, onDelete = null,
                        )
                    }
                }

                // ---- Buyer touch: one-tap professional site-visit confirmation ----
                // When a visit is fixed, let the rep send the customer a clean
                // WhatsApp confirmation (date, time, project) — the kind of polish
                // big brands do and small builders never get around to.
                run {
                    val visitMs = isoMs(contact.siteVisitAt)
                    if (visitMs != null && visitMs >= System.currentTimeMillis()) {
                        item {
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                                    .clip(RoundedCornerShape(16.dp)).background(WhatsGreen.copy(alpha = 0.10f))
                                    .clickable {
                                        openWhatsAppLocal(context, contact.phone,
                                            visitConfirmationMessage(contact, fmtWhen(visitMs), app.profile?.fullName, app.company?.name))
                                    }
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(Modifier.size(38.dp).clip(CircleShape).background(WhatsGreen), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Chat, null, tint = Color.White, modifier = Modifier.size(19.dp))
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("Send visit confirmation", style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold, color = JadeL)
                                    Text("WhatsApp the buyer a clean date/time/project confirmation",
                                        style = MaterialTheme.typography.labelSmall, color = SubInk, maxLines = 2)
                                }
                                Icon(Icons.Default.KeyboardArrowRight, null, tint = JadeL, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }

                // ---- Sales funnel ----
                item {
                    SectionCard {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text("SALES FUNNEL", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                                color = Ink, letterSpacing = 0.6.sp)
                            Spacer(Modifier.weight(1f))
                            Text(if (funnelExpanded) "Collapse" else "View All", color = IndigoL,
                                style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { funnelExpanded = !funnelExpanded }
                                    .padding(horizontal = 6.dp, vertical = 4.dp))
                        }
                        Spacer(Modifier.height(16.dp))
                        HorizontalFunnel(contact) { key ->
                            when (key) {
                                "site_visit" -> visitOpen = true
                                else -> {
                                    val idx = FUNNEL.indexOfFirst { contact.status in it.statuses }
                                    val tapped = FUNNEL.indexOfFirst { it.key == key }
                                    if (tapped in 0 until idx) confirmMoveKey = key
                                    else contact.id?.let {
                                        vm.applyLead(it, key, null, null, null, null, null,
                                            if (key == "token_paid") token.ifBlank { null } else null)
                                    }
                                }
                            }
                        }
                        if (funnelExpanded) {
                            Spacer(Modifier.height(14.dp))
                            Box(Modifier.fillMaxWidth().height(1.dp).background(Hair))
                            Spacer(Modifier.height(6.dp))
                            FunnelStepper(
                                contact = contact,
                                onSet = { key -> if (key == "site_visit") visitOpen = true else contact.id?.let {
                                    vm.applyLead(it, key, null, null, null, null, null,
                                        if (key == "token_paid") token.ifBlank { null } else null)
                                } },
                                onMoveBack = { key -> confirmMoveKey = key },
                                onEditVisit = { visitOpen = true },
                                onClearVisit = { confirmClearVisit = true },
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        FlowRowExits(contact.status) { key ->
                            if (key == "callback") scheduleOpen = true
                            else contact.id?.let { vm.applyLead(it, key, null, null, null, null, null, null) }
                        }
                    }
                }

                // ---- Call Coach — honest rating + guidance from THIS lead's last
                // real recording. The coach "observes" the call and rates it; a
                // good call only gets motivation, no forced suggestion. ----
                if (app.leadCoachLoading || app.leadCoach != null) {
                    item {
                        val coach = app.leadCoach
                        SectionCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("🎯 CALL COACH", style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold, color = Ink, letterSpacing = 0.6.sp,
                                    modifier = Modifier.weight(1f))
                                coach?.rating?.let { r ->
                                    Text("⭐".repeat(r.coerceIn(1, 5)) + " $r/5",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold, color = IndigoL)
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            if (coach == null) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                                    Spacer(Modifier.width(10.dp))
                                    Text("Aakhri call ki recording analyse ho rahi hai…",
                                        style = MaterialTheme.typography.bodySmall, color = SubInk)
                                }
                            } else {
                                coach.good?.takeIf { it.isNotBlank() }?.let {
                                    Text("✅ $it", style = MaterialTheme.typography.bodyMedium)
                                }
                                coach.improve?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(6.dp))
                                    Text("💡 $it", style = MaterialTheme.typography.bodyMedium)
                                }
                                if ((coach.rating ?: 0) >= 4 && coach.improve.isNullOrBlank()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text("🔥 Shaandaar call! Aise hi karte rahiye.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold, color = IndigoL)
                                }
                            }
                        }
                    }
                }

                // ---- Calls & recordings — always open, right under the funnel so
                // the rep hears the recording without hunting for a tap. ----
                item {
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Call, null, tint = BlueL, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("CALLS & RECORDINGS", style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold, color = Ink, letterSpacing = 0.6.sp)
                            val n = app.leadDetailCalls.size
                            if (n > 0) {
                                Spacer(Modifier.width(8.dp))
                                Text("$n", style = MaterialTheme.typography.labelMedium, color = SubInk)
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        when {
                            app.leadDetailLoading -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                            app.leadDetailCalls.isEmpty() -> Text("No calls logged for this lead yet.", style = MaterialTheme.typography.bodySmall, color = SubInk)
                            else -> app.leadDetailCalls.forEach { call ->
                                LeadCallRow(call, playing = call.id != null && call.id == app.playingCallId,
                                    onPlay = { call.id?.let { vm.playRecording(it) } }, onStop = { vm.stopRecording() })
                            }
                        }
                    }
                }

                // ---- Token amount (only when at Token Paid) ----
                if (contact.status == "token_paid") {
                    item {
                        SectionCard {
                            OutlinedTextField(
                                token, { v -> token = v.filter { it.isDigit() } },
                                label = { Text("Token / booking amount (₹)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true, modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }

                // ---- Quick notes ----
                item {
                    SectionCard {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text("QUICK NOTES", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                                color = Ink, letterSpacing = 0.6.sp)
                            Spacer(Modifier.weight(1f))
                            Row(
                                Modifier.clip(RoundedCornerShape(50)).background(IndigoL.copy(alpha = 0.10f))
                                    .clickable { startVoice() }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Default.Mic, "Voice note", tint = IndigoL, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(5.dp))
                                Text("Add Note", color = IndigoL, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        QuickNoteChips { q -> note = if (note.isBlank()) q else "$note, $q" }
                    }
                }

                // ---- Temperature · Journey (2 columns; Calls moved under the funnel) ----
                item {
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        MiniCard("TEMPERATURE", Modifier.weight(1f).fillMaxHeight()) {
                            TempChips(contact.temperature ?: "") { key -> contact.id?.let { vm.setLeadTemperature(it, key) } }
                        }
                        MiniCard("JOURNEY", Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(18.dp)).clickable { journeyExpanded = !journeyExpanded }) {
                            val latest = app.leadDetailActivities.firstOrNull()
                            val title = latest?.detail ?: "Lead added"
                            val at = isoMs(latest?.createdAt ?: contact.createdAt)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(9.dp).clip(CircleShape).background(GreenL))
                                Spacer(Modifier.width(8.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                                        color = Ink, maxLines = 1)
                                    at?.let { Text(fmtWhen(it), style = MaterialTheme.typography.labelSmall, color = SubInk) }
                                }
                                Icon(Icons.Default.KeyboardArrowRight, null, tint = SubInk, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }

                // ---- Expanded Journey ----
                if (journeyExpanded) {
                    val journey = buildList {
                        addAll(app.leadDetailActivities.map { a ->
                            Triple(a.createdAt, a.type, a.detail + (a.actorName?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""))
                        })
                        contact.createdAt?.let { add(Triple(it, "created", "Lead added")) }
                    }.sortedByDescending { it.first ?: "" }
                    item { SectionCard {
                        Text("JOURNEY", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Ink, letterSpacing = 0.6.sp)
                        Spacer(Modifier.height(10.dp))
                        if (journey.isEmpty()) Text("Updates you make will show here with date & time.",
                            style = MaterialTheme.typography.bodySmall, color = SubInk)
                        else journey.forEachIndexed { i, (atIso, type, text) -> JourneyRow(atIso, type, text, last = i == journey.lastIndex) }
                    } }
                }

                // ---- Add note + Save ----
                item {
                    SectionCard {
                        Text("ADD NOTE", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Ink, letterSpacing = 0.6.sp)
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                note, { note = it }, placeholder = { Text("Add custom note…") },
                                modifier = Modifier.weight(1f), minLines = 1,
                            )
                            Spacer(Modifier.width(10.dp))
                            Row(
                                Modifier.clip(RoundedCornerShape(14.dp)).background(IndigoL).clickable {
                                    contact.id?.let {
                                        vm.applyLead(it, null, null, null,
                                            note.trim().ifBlank { null }.takeIf { n -> n != contact.notes },
                                            tokenAmount = if (contact.status == "token_paid") token.ifBlank { null } else null)
                                    }
                                }.padding(horizontal = 16.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Default.Save, null, tint = Color.White, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Save Details", color = Color.White, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        // ---- The app's real bottom navigation (not a duplicate action bar) ----
        Box(Modifier.align(Alignment.BottomCenter)) {
            FloatingCallBar(
                current = "leads",
                onTab = { vm.goToTab(it) },
                onDial = { vm.goToTab("dialer") },
                onMore = { vm.openDrawerFromOverlay() },
            )
        }
    }

    if (scheduleOpen) PickWhenDialog(
        title = "Follow-up · ${contact.name ?: contact.phone}", onDismiss = { scheduleOpen = false },
        onPick = { millis ->
            scheduleOpen = false
            vm.scheduleFollowUp(contact.id, contact.phone, contact.name, millis, null)
            if (contact.status !in setOf("interested", "site_visit", "negotiation", "token_paid", "booked")) {
                contact.id?.let { vm.applyLead(it, "callback", null, null, null, null, null, null) }
            }
        },
    )
    if (visitOpen) PickWhenDialog(
        title = "Site visit · ${contact.name ?: contact.phone}", visitMode = true, onDismiss = { visitOpen = false },
        onPick = { millis ->
            visitOpen = false
            contact.id?.let { vm.applyLead(it, "site_visit", null, null, null, null, java.time.Instant.ofEpochMilli(millis).toString(), null) }
        },
    )
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
    if (confirmClearVisit) androidx.compose.material3.AlertDialog(
        onDismissRequest = { confirmClearVisit = false },
        title = { Text("Cancel site visit?") },
        text = { Text("The visit date will be removed. If the lead was at Site Visit it moves back to Interested.") },
        confirmButton = {
            androidx.compose.material3.TextButton(onClick = { confirmClearVisit = false; contact.id?.let { vm.clearSiteVisit(it) } }) {
                Text("Yes, cancel visit", color = RedL)
            }
        },
        dismissButton = { androidx.compose.material3.TextButton(onClick = { confirmClearVisit = false }) { Text("Keep it") } },
    )

    if (editIdentityOpen) EditIdentityDialog(
        contact = contact,
        onDismiss = { editIdentityOpen = false },
        onSave = { name, alt ->
            editIdentityOpen = false
            contact.id?.let { vm.updateLeadIdentity(it, name, alt) }
        },
    )
}

// ---------------- Building blocks ----------------

// Soft, Apple-ish depth — a faint ambient shadow instead of a hard hairline, so
// white cards float a hair above the near-white canvas. Cheap to draw (no blur).
private val SoftShadow = Color(0x14101820)

@Composable
private fun SectionCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .shadow(6.dp, RoundedCornerShape(20.dp), ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(RoundedCornerShape(20.dp)).background(CardBg).padding(18.dp),
        content = content,
    )
}

@Composable
private fun MiniCard(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.shadow(5.dp, RoundedCornerShape(18.dp), ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(RoundedCornerShape(18.dp)).background(CardBg)
            .heightIn(min = 96.dp).padding(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = SubInk,
            letterSpacing = 0.5.sp, maxLines = 1)
        Spacer(Modifier.height(10.dp))
        content()
    }
}

@Composable
private fun TopIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, onClick: () -> Unit) {
    Box(
        Modifier.size(42.dp).shadow(4.dp, RoundedCornerShape(12.dp), ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(RoundedCornerShape(12.dp)).background(CardBg).clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp)) }
}

@Composable
private fun ActionTile(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.shadow(5.dp, RoundedCornerShape(16.dp), ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(RoundedCornerShape(16.dp)).background(CardBg)
            .clickable { onClick() }.padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Icon in a soft tinted circle; the label stays neutral ink — the tint
        // draws the eye without turning the row into a rainbow.
        Box(Modifier.size(36.dp).clip(CircleShape).background(tint.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Ink,
            maxLines = 1, textAlign = TextAlign.Center)
    }
}

/** Groups an Indian 10-digit number as "92680 96331" for calm reading. */
private fun prettyNum(raw: String): String {
    val d = raw.filter { it.isDigit() }
    return when {
        d.length == 10 -> "${d.substring(0, 5)} ${d.substring(5)}"
        d.length == 12 && d.startsWith("91") -> "+91 ${d.substring(2, 7)} ${d.substring(7)}"
        else -> raw
    }
}

private fun tempRing(t: String?): Color = when (t) {
    "hot" -> RedL; "warm" -> AmberL; "cold" -> ColdL; else -> SubInk
}

/**
 * The lead's identity — a big typographic block on paper (no gradient box). The
 * name is editable (pencil), the number taps to copy, and a second number can be
 * added right here; the monogram ring is tinted by the lead's temperature.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IdentityBlock(
    contact: Contact,
    onCopy: () -> Unit,
    onNextTap: () -> Unit,
    onEdit: () -> Unit,
    onCallAlt: () -> Unit,
) {
    val ring = tempRing(contact.temperature)
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(64.dp).clip(CircleShape).border(2.dp, ring.copy(alpha = 0.55f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text((contact.name ?: contact.phone).firstOrNull { it.isLetter() }?.uppercaseChar()?.toString() ?: "#",
                    color = ring, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.headlineSmall)
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(contact.name ?: prettyNum(contact.phone), style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold, color = Ink, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier.size(30.dp).clip(CircleShape).border(1.dp, Hair, CircleShape).clickable { onEdit() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Default.Edit, "Edit name", tint = SubInk, modifier = Modifier.size(15.dp)) }
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(prettyNum(contact.phone), style = MaterialTheme.typography.titleMedium, color = SubInk)
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Default.ContentCopy, "Copy", tint = Color(0xFF9AA0A8),
                        modifier = Modifier.size(16.dp).clip(CircleShape).clickable { onCopy() })
                }
                contact.altPhone?.takeIf { it.isNotBlank() }?.let { alt ->
                    Spacer(Modifier.height(5.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(prettyNum(alt), style = MaterialTheme.typography.bodyMedium, color = SubInk)
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.size(28.dp).clip(CircleShape).background(JadeL).clickable { onCallAlt() },
                            contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Call, "Call second number", tint = Color.White, modifier = Modifier.size(14.dp))
                        }
                    }
                }
                if (contact.altPhone.isNullOrBlank()) {
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.clip(RoundedCornerShape(8.dp)).clickable { onEdit() }.padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Add, null, tint = JadeL, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Add another number", color = JadeL, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            LeadChip(stageLabel(contact.status), tempRing(null))
            contact.temperature?.takeIf { it.isNotBlank() }?.let { t ->
                val (label, col) = when (t) { "hot" -> "🔥 Hot" to RedL; "warm" -> "☀ Warm" to AmberL; else -> "❄ Cold" to ColdL }
                LeadChip(label, col)
            }
            budgetLabel(contact.budget)?.let { LeadChip("💰 ₹ $it", GreenL) }
            contact.territory?.takeIf { it.isNotBlank() }?.let { LeadChip("📍 $it", SubInk) }
            isoMs(contact.createdAt)?.let { LeadChip("Added ${fmtWhen(it)}", SubInk) }
        }
        contact.aiNextAction?.takeIf { it.isNotBlank() }?.let { tip ->
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(JadeL.copy(alpha = 0.10f))
                    .clickable { onNextTap() }.padding(start = 14.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("👉  $tip", style = MaterialTheme.typography.bodyMedium, color = JadeL, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Icon(Icons.Default.KeyboardArrowRight, null, tint = JadeL, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/** A quiet outlined chip for the identity block. */
@Composable
private fun LeadChip(label: String, color: Color) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(50))
            .padding(horizontal = 11.dp, vertical = 5.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Edit the lead's name and optional second number. */
@Composable
private fun EditIdentityDialog(contact: Contact, onDismiss: () -> Unit, onSave: (String?, String?) -> Unit) {
    var name by remember { mutableStateOf(contact.name ?: "") }
    var alt by remember { mutableStateOf(contact.altPhone ?: "") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit lead") },
        text = {
            Column {
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    alt, { v -> alt = v.filter { it.isDigit() || it == '+' } },
                    label = { Text("Second number (optional)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { onSave(name, alt) }) { Text("Save") } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun NextStepBanner(color: Color, title: String, detail: String, cta: String, onCta: () -> Unit, onDelete: (() -> Unit)?) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(16.dp))
            .background(color.copy(alpha = 0.10f)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Notifications, null, tint = color, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = color)
            detail.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = SubInk, maxLines = 2)
            }
        }
        Spacer(Modifier.width(10.dp))
        Box(Modifier.clip(RoundedCornerShape(50)).background(color).clickable { onCta() }.padding(horizontal = 16.dp, vertical = 9.dp)) {
            Text(cta, color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
        onDelete?.let {
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(30.dp).clip(CircleShape).background(color.copy(alpha = 0.14f)).clickable { it() }, contentAlignment = Alignment.Center) {
                Text("✕", color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/**
 * ONE AI on the lead — "AI Coach", a single card that covers the whole call so
 * the rep never wonders which AI to tap (RAG v12):
 *   🎯 Pitch     — the "before you call" brief from company knowledge (RAG v4)
 *   🛡️ Objection — customer said no; speak/type it, get the exact counter (RAG v9)
 *   💬 Message    — a ready-to-send WhatsApp follow-up, drafted from the playbook (RAG v12)
 * A segmented control chooses the move; one section is open at a time. The
 * chrome is clean English; the AI's spoken/written output stays natural Hinglish
 * (aap-form) because that's what the rep actually says to the customer.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AiCoachCard(
    brief: String?,
    briefLoading: Boolean,
    onGenerate: () -> Unit,
    answer: String?,
    rebuttalLoading: Boolean,
    onAsk: (String) -> Unit,
    onClear: () -> Unit,
    draft: String?,
    draftLoading: Boolean,
    onDraft: (String) -> Unit,
    onSend: (String) -> Unit,
    onClearDraft: () -> Unit,
    error: String? = null,
) {
    val clipboard = LocalClipboardManager.current
    var text by remember { mutableStateOf("") }
    // Which section is open. The rep's tap wins; otherwise derive from live state
    // so the open section survives LazyColumn recycling.
    var chosen by remember { mutableStateOf<String?>(null) }
    val mode = chosen ?: when {
        rebuttalLoading || answer != null -> "objection"
        draftLoading || draft != null -> "message"
        briefLoading || brief != null -> "pitch"
        else -> null
    }

    // Phone's built-in speech-to-text — fills the box, hands-free.
    val voiceLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val spoken = result.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
        if (!spoken.isNullOrBlank()) text = spoken
    }
    fun startVoice() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "What did the customer say?")
        }
        runCatching { voiceLauncher.launch(intent) }
    }
    fun ask(objection: String) {
        val q = objection.trim()
        if (q.isBlank() || rebuttalLoading) return
        text = q
        onAsk(q)
    }

    val chips = listOf(
        "Too expensive", "Location too far", "Need to discuss at home",
        "Just thinking about it", "Loan problem", "Cheaper elsewhere",
    )

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .shadow(6.dp, RoundedCornerShape(20.dp), ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(RoundedCornerShape(20.dp)).background(CardBg).padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🤖", fontSize = 18.sp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("AI COACH", style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold, color = JadeL, letterSpacing = 0.5.sp)
                Text("Your assistant for the whole call — before, during, after",
                    style = MaterialTheme.typography.labelSmall, color = SubInk)
            }
        }

        // ---- Segmented control: Pitch · Objection · Message ----
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(SubInk.copy(alpha = 0.08f)).padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            AiModeSegment("🎯 Pitch", selected = mode == "pitch", modifier = Modifier.weight(1f)) {
                chosen = "pitch"
                if (brief == null && !briefLoading) onGenerate()
            }
            AiModeSegment("🛡️ Objection", selected = mode == "objection", modifier = Modifier.weight(1f)) {
                chosen = "objection"
            }
            AiModeSegment("💬 Message", selected = mode == "message", modifier = Modifier.weight(1f)) {
                chosen = "message"
            }
        }

        // A failure shows as its own quiet line — never inside a result box,
        // so it can never be copied or sent to a customer by mistake.
        error?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = RedL)
        }

        // ---- 🎯 Pitch section ----
        if (mode == "pitch") {
            if (briefLoading) {
                Spacer(Modifier.height(12.dp))
                CoachLoadingRow("Reading this lead and your company knowledge…")
            }
            brief?.let {
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Hair))
                Spacer(Modifier.height(10.dp))
                Text(it.trim(), style = MaterialTheme.typography.bodyMedium, color = Ink, lineHeight = 20.sp)
                Spacer(Modifier.height(8.dp))
                Text("Regenerate", style = MaterialTheme.typography.labelMedium, color = JadeL,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onGenerate() })
            }
        }

        // ---- 🛡️ Objection section ----
        if (mode == "objection") {
            Spacer(Modifier.height(12.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                chips.forEach { c ->
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(AmberL.copy(alpha = 0.10f))
                            .border(1.dp, AmberL.copy(alpha = 0.35f), RoundedCornerShape(50))
                            .clickable(enabled = !rebuttalLoading) { ask(c) }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    ) { Text(c, style = MaterialTheme.typography.labelMedium, color = AmberL, fontWeight = FontWeight.SemiBold) }
                }
            }

            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("What did the customer say?", color = SubInk) },
                maxLines = 3,
                trailingIcon = {
                    Icon(Icons.Default.Mic, contentDescription = "Speak instead of typing",
                        tint = RedL, modifier = Modifier.clickable { startVoice() }.padding(6.dp))
                },
            )

            Spacer(Modifier.height(10.dp))
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(if (text.isBlank() || rebuttalLoading) SubInk.copy(alpha = 0.25f) else JadeL)
                    .clickable(enabled = text.isNotBlank() && !rebuttalLoading) { ask(text) }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (rebuttalLoading) "Thinking…" else "Get reply →", color = Color.White,
                    style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }

            if (rebuttalLoading) {
                Spacer(Modifier.height(12.dp))
                CoachLoadingRow("Reading the playbook and prices…")
            }

            answer?.let {
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(JadeL.copy(alpha = 0.06f)).border(1.dp, JadeL.copy(alpha = 0.30f), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                ) {
                    Text("SAY THIS 👇", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = JadeL, letterSpacing = 0.5.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(it.trim(), style = MaterialTheme.typography.bodyMedium, color = Ink, lineHeight = 21.sp)
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CoachTextAction(Icons.Default.ContentCopy, "Copy") { clipboard.setText(AnnotatedString(it.trim())) }
                        Spacer(Modifier.width(18.dp))
                        Text("New question", style = MaterialTheme.typography.labelMedium, color = SubInk,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { text = ""; onClear() })
                    }
                }
            }
        }

        // ---- 💬 Message section — WhatsApp Smart Templates (RAG v14) ----
        // Pick a purpose; the AI writes that exact message, grounded in the
        // company's own facts, ready to send. Remember the last purpose so
        // "Rewrite" regenerates the same kind.
        var lastPurpose by remember { mutableStateOf("follow_up") }
        if (mode == "message") {
            if (draftLoading) {
                Spacer(Modifier.height(12.dp))
                CoachLoadingRow("Writing your message from the playbook…")
            }
            if (!draftLoading && draft == null) {
                Spacer(Modifier.height(12.dp))
                Text("Pick a message to send", style = MaterialTheme.typography.labelMedium, color = SubInk)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MSG_TEMPLATES.forEach { (key, label) ->
                        Box(
                            Modifier.clip(RoundedCornerShape(50)).background(JadeL.copy(alpha = 0.10f))
                                .border(1.dp, JadeL.copy(alpha = 0.35f), RoundedCornerShape(50))
                                .clickable { lastPurpose = key; onDraft(key) }
                                .padding(horizontal = 13.dp, vertical = 8.dp),
                        ) { Text(label, style = MaterialTheme.typography.labelMedium, color = JadeL, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
            draft?.let {
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(JadeL.copy(alpha = 0.06f)).border(1.dp, JadeL.copy(alpha = 0.30f), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                ) {
                    Text("READY TO SEND 👇", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = JadeL, letterSpacing = 0.5.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(it.trim(), style = MaterialTheme.typography.bodyMedium, color = Ink, lineHeight = 21.sp)
                    Spacer(Modifier.height(12.dp))
                    // Send opens WhatsApp pre-filled so the rep can review before hitting send.
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WhatsGreen)
                            .clickable { onSend(it.trim()) }.padding(vertical = 11.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Chat, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Send on WhatsApp", color = Color.White,
                                style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CoachTextAction(Icons.Default.ContentCopy, "Copy") { clipboard.setText(AnnotatedString(it.trim())) }
                        Spacer(Modifier.width(18.dp))
                        Text("Rewrite", style = MaterialTheme.typography.labelMedium, color = JadeL,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onClearDraft(); onDraft(lastPurpose) })
                        Spacer(Modifier.width(18.dp))
                        Text("New message", style = MaterialTheme.typography.labelMedium, color = SubInk,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onClearDraft() })
                    }
                }
            }
        }
    }
}

/** WhatsApp Smart Template purposes (RAG v14) — one tap → an AI-written,
 *  company-grounded, ready-to-send message for that intent. */
private val MSG_TEMPLATES = listOf(
    "intro" to "👋 Intro",
    "details" to "📄 Details",
    "price" to "💰 Price & offer",
    "site_visit" to "🏠 Site visit",
    "follow_up" to "🔄 Follow-up",
    "festive" to "🎉 Greeting",
)

/** One segment of the AI Coach card's segmented control (Pitch · Objection · Message). */
@Composable
private fun AiModeSegment(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(10.dp))
            .background(if (selected) JadeL else Color.Transparent)
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
            maxLines = 1, color = if (selected) Color.White else SubInk)
    }
}

/** A spinner + one line of "AI is working…" copy — shared by all three moves. */
@Composable
private fun CoachLoadingRow(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = JadeL)
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = SubInk)
    }
}

/** A small icon + label tap target (Copy) used inside the AI result cards. */
@Composable
private fun CoachTextAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).clickable { onClick() }.padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = JadeL, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = JadeL, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * "Wada" — what the AI heard on the latest call. It has already applied
 * itself (follow-up scheduled, facts saved); this card is the receipt.
 * The only affordance is "hatao" for when the AI misheard.
 */
@Composable
private fun WadaCard(call: CallLog, onDismiss: () -> Unit) {
    val wada = call.aiActions ?: return
    val applied = call.wadaState == "applied"
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp))
            .background(CardBg).border(1.5.dp, JadeL.copy(alpha = 0.45f), RoundedCornerShape(18.dp))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🤝", fontSize = 20.sp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("COMMITMENT — caught by AI on the call", style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold, color = JadeL, letterSpacing = 0.5.sp)
                Text(
                    if (applied) "Saved and set up automatically" else "Setting up…",
                    style = MaterialTheme.typography.labelSmall, color = SubInk,
                )
            }
            if (applied) {
                Box(Modifier.clip(RoundedCornerShape(50)).background(JadeL.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 5.dp)) {
                    Text("✓ Done", color = JadeL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Hair))
        Spacer(Modifier.height(10.dp))

        val promiseMs = isoMs(wada.promiseAt)
        promiseMs?.let { WadaRow("📅", "Promise", fmtWhen(it) + (wada.promiseNote?.let { n -> " — $n" } ?: "")) }
        wada.budget?.let { WadaRow("💰", "Budget", it) }
        wada.preferences?.let { WadaRow("🏠", "Wants", it) }
        if (wada.objections.isNotEmpty()) WadaRow("⚠️", "Blocker", wada.objections.joinToString(", "))
        wada.timeline?.let { WadaRow("⏳", "Timeline", it) }

        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Box(
                Modifier.clip(RoundedCornerShape(50)).border(1.dp, Hair, RoundedCornerShape(50))
                    .clickable { onDismiss() }.padding(horizontal = 14.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Misheard — remove", color = SubInk, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun WadaRow(emoji: String, label: String, value: String) {
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Text(emoji, fontSize = 14.sp)
        Spacer(Modifier.width(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = SubInk,
            modifier = Modifier.width(76.dp), fontWeight = FontWeight.SemiBold, maxLines = 1)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Ink,
            fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
    }
}

/** Horizontal 7-step funnel with a connecting rail — the compact overview. */
@Composable
private fun HorizontalFunnel(contact: Contact, onTap: (String) -> Unit) {
    val idx = FUNNEL.indexOfFirst { contact.status in it.statuses }
    Row(Modifier.fillMaxWidth()) {
        FUNNEL.forEachIndexed { i, step ->
            val done = i < idx
            val current = i == idx
            val circleColor = when { done -> GreenL; current -> PurpleL; else -> Hair }
            val textOnCircle = if (done || current) Color.White else SubInk
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).clickable { onTap(step.key) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.fillMaxWidth().height(36.dp), contentAlignment = Alignment.Center) {
                    // Rail behind the circle: left + right halves.
                    Row(Modifier.fillMaxWidth().height(3.dp)) {
                        Box(Modifier.weight(1f).fillMaxHeight().background(
                            if (i == 0) Color.Transparent else if (i <= idx) GreenL else Hair))
                        Box(Modifier.weight(1f).fillMaxHeight().background(
                            if (i == FUNNEL.lastIndex) Color.Transparent else if (i < idx) GreenL else Hair))
                    }
                    // Current step gets a soft halo so "where we are" pops instantly.
                    if (current) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(PurpleL.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                            Box(Modifier.size(28.dp).clip(CircleShape).background(circleColor), contentAlignment = Alignment.Center) {
                                Text("${i + 1}", color = textOnCircle, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            }
                        }
                    } else {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(circleColor), contentAlignment = Alignment.Center) {
                            Text(if (done) "✓" else "${i + 1}", color = textOnCircle,
                                style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                // Short single-word labels: the full names ("Contacted",
                // "Negotiation") hyphen-broke mid-word at 1/7th screen width.
                val short = when (step.key) {
                    "new" -> "New"
                    "contacted" -> "Contact"
                    "interested" -> "Interest"
                    "site_visit" -> "Visit"
                    "negotiation" -> "Nego."
                    "token_paid" -> "Token"
                    else -> "Booked"
                }
                Text(short,
                    style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, lineHeight = 12.sp,
                    color = if (current) PurpleL else if (done) Ink else SubInk,
                    fontWeight = if (current) FontWeight.Bold else FontWeight.Medium,
                    textAlign = TextAlign.Center, maxLines = 1,
                    modifier = Modifier.padding(horizontal = 2.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowExits(status: String, onPick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        EXITS.forEach { (key, label) ->
            val on = status == key
            val tint = when (key) { "callback" -> IndigoL; "lost" -> RedL; else -> SubInk }
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (on) tint else tint.copy(alpha = 0.10f))
                    .clickable { onPick(key) }.padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(label, color = if (on) Color.White else tint, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickNoteChips(onPick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        QUICK_NOTES.forEach { q ->
            Box(
                Modifier.clip(RoundedCornerShape(50)).border(1.dp, Hair, RoundedCornerShape(50))
                    .clickable { onPick(q) }.padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text("+ $q", style = MaterialTheme.typography.labelMedium, color = Ink)
            }
        }
    }
}

@Composable
private fun TempChips(selected: String, onPick: (String) -> Unit) {
    FlowRowTemps(selected, onPick)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowTemps(selected: String, onPick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        TEMPS.forEach { (key, label) ->
            val on = selected == key
            val tint = when (key) { "hot" -> RedL; "warm" -> AmberL; else -> ColdL }
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(if (on) tint else tint.copy(alpha = 0.10f))
                    .clickable { key?.let(onPick) }.padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(label, color = if (on) Color.White else tint, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** Voice-note card: idle → record; recording → live timer + Save / Discard. */
@Composable
private fun VoiceNoteCard(vm: MainViewModel, recording: Boolean, uploading: Boolean) {
    var seconds by remember { mutableStateOf(0) }
    LaunchedEffect(recording) { seconds = 0; while (recording) { kotlinx.coroutines.delay(1000); seconds++ } }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp))
            .background(CardBg).border(1.dp, Hair, RoundedCornerShape(18.dp)).padding(14.dp),
    ) {
        Text("VOICE NOTE", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = SubInk, letterSpacing = 0.5.sp)
        Spacer(Modifier.height(10.dp))
        when {
            // Save stays locked until there is actually something to save. Reps
            // were losing takes after ~1.5s: the old Save button sat exactly
            // where the record button had been, so the second tap — the natural
            // "did that register?" tap — ended the note before a word was in it.
            recording -> Column {
                val canSave = seconds >= 3
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(RedL))
                    Spacer(Modifier.width(10.dp))
                    Text("Recording…  %d:%02d".format(seconds / 60, seconds % 60), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = RedL)
                    Spacer(Modifier.weight(1f))
                    Text("Discard", color = SubInk, style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.clip(RoundedCornerShape(50)).clickable { vm.cancelVoiceNote() }.padding(horizontal = 10.dp, vertical = 6.dp))
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier.clip(RoundedCornerShape(50))
                            .background(if (canSave) GreenL else GreenL.copy(alpha = 0.25f))
                            .clickable(enabled = canSave) { vm.finishVoiceNote() }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Text(
                            if (canSave) "✓ Save" else "Save in ${3 - seconds}s",
                            color = Color.White, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("Keep speaking — say what the customer told you. Save turns on after 3 seconds.",
                    style = MaterialTheme.typography.labelSmall, color = SubInk)
            }
            uploading -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text("Saving voice note…", style = MaterialTheme.typography.bodyMedium, color = Ink)
            }
            // One target, the whole row — and nothing on the right edge. The old
            // "▶" button lived there, looked like Play but started recording,
            // and was replaced by Save the instant it was tapped.
            else -> Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { vm.startVoiceNote() },
            ) {
                Box(Modifier.size(44.dp).clip(CircleShape).background(IndigoL), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Mic, "Record", tint = Color.White, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Record voice note", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = IndigoL)
                    Text("Tap and speak for a few seconds — AI writes the summary",
                        style = MaterialTheme.typography.labelSmall, color = SubInk, maxLines = 2)
                }
            }
        }
    }
}

// ---------------- Reused detail rows ----------------

/** Vertical detailed funnel (shown when "View All" is expanded): every stage on
 *  its own line, tap a done step to walk back, edit/cancel the site visit. */
@Composable
private fun FunnelStepper(contact: Contact, onSet: (String) -> Unit, onMoveBack: (String) -> Unit, onEditVisit: () -> Unit, onClearVisit: () -> Unit) {
    val idx = FUNNEL.indexOfFirst { contact.status in it.statuses }
    Column(Modifier.fillMaxWidth()) {
        FUNNEL.forEachIndexed { i, step ->
            val done = idx > i
            val current = idx == i
            val stepColor = when { done -> GreenL; current -> PurpleL; else -> Hair }
            Row(
                Modifier.fillMaxWidth().then(
                    when {
                        step.settable && !current && !done -> Modifier.clip(RoundedCornerShape(10.dp)).clickable { onSet(step.key) }
                        done -> Modifier.clip(RoundedCornerShape(10.dp)).clickable { onMoveBack(step.key) }
                        else -> Modifier
                    },
                ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(if (done || current) stepColor else Hair), contentAlignment = Alignment.Center) {
                        Text(if (done) "✓" else "${i + 1}", color = if (done || current) Color.White else SubInk, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    }
                    if (i < FUNNEL.lastIndex) Box(Modifier.width(2.dp).height(14.dp).background(if (done) GreenL else Hair))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f).padding(bottom = if (i < FUNNEL.lastIndex) 12.dp else 0.dp)) {
                    Text(step.label, style = MaterialTheme.typography.bodyLarge, fontWeight = if (current) FontWeight.Bold else FontWeight.Medium,
                        color = when { current -> PurpleL; done -> Ink; else -> SubInk })
                    val sub = when (step.key) {
                        "site_visit" -> isoMs(contact.siteVisitAt)?.let { ms -> listOfNotNull(fmtWhen(ms), contact.siteVisitProject?.takeIf { it.isNotBlank() }).joinToString(" · ") }
                        "token_paid" -> contact.tokenAmount?.takeIf { it > 0 }?.let { "₹${if (it % 1.0 == 0.0) it.toLong() else it}" }
                        else -> null
                    }
                    sub?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = SubInk) }
                }
                val hasVisit = step.key == "site_visit" && !contact.siteVisitAt.isNullOrBlank()
                when {
                    hasVisit -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.clip(RoundedCornerShape(50)).background(PurpleL.copy(alpha = 0.12f)).clickable { onEditVisit() }.padding(horizontal = 10.dp, vertical = 4.dp)) {
                            Text("Edit", color = PurpleL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                        Box(Modifier.size(24.dp).clip(CircleShape).background(RedL.copy(alpha = 0.12f)).clickable { onClearVisit() }, contentAlignment = Alignment.Center) {
                            Text("✕", color = RedL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    current -> Box(Modifier.clip(RoundedCornerShape(50)).background(PurpleL.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 4.dp)) {
                        Text("NOW", color = PurpleL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PickWhenDialog(title: String, visitMode: Boolean = false, onDismiss: () -> Unit, onPick: (Long) -> Unit) {
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
        onDismissRequest = onDismiss, title = { Text(title) },
        text = {
            Column {
                options.forEach { (label, millis) ->
                    androidx.compose.material3.OutlinedButton(onClick = { onPick(millis) }, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) { Text(label) }
                }
                androidx.compose.material3.Button(onClick = { showDate = true }, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Pick a date & time")
                }
            }
        },
        confirmButton = {}, dismissButton = { androidx.compose.material3.TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
    if (showDate) {
        val dps = androidx.compose.material3.rememberDatePickerState(initialSelectedDateMillis = now.toInstant().toEpochMilli())
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { pickedDate = dps.selectedDateMillis; showDate = false; showTime = true }) { Text("Next") } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { showDate = false }) { Text("Cancel") } },
        ) { androidx.compose.material3.DatePicker(state = dps) }
    }
    if (showTime) {
        val tps = androidx.compose.material3.rememberTimePickerState(initialHour = 11, initialMinute = 0, is24Hour = false)
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showTime = false }, title = { Text("Pick a time") },
            text = { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { androidx.compose.material3.TimePicker(state = tps) } },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    val base = pickedDate ?: now.toInstant().toEpochMilli()
                    val day = java.time.Instant.ofEpochMilli(base).atZone(java.time.ZoneId.of("UTC")).toLocalDate()
                    val millis = day.atTime(tps.hour, tps.minute).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                    showTime = false; onPick(millis)
                }) { Text("Set") }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { showTime = false }) { Text("Back") } },
        )
    }
}

@Composable
private fun LeadCallRow(call: CallLog, playing: Boolean, onPlay: () -> Unit, onStop: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (call.direction == "incoming") "📥 Incoming" else "📤 Outgoing", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = Ink)
            Spacer(Modifier.width(8.dp))
            Text("${call.durationSeconds / 60}m ${call.durationSeconds % 60}s", style = MaterialTheme.typography.labelSmall, color = SubInk)
            Spacer(Modifier.weight(1f))
            call.startedAt?.let { Text(it.take(16).replace('T', ' '), style = MaterialTheme.typography.labelSmall, color = SubInk) }
        }
        if (call.recordingStatus == "ready" && call.id != null) {
            if (playing) AudioPlayer(callLogId = call.id, modifier = Modifier.fillMaxWidth())
            else {
                Spacer(Modifier.height(6.dp))
                Box(Modifier.clip(RoundedCornerShape(50)).background(IndigoL.copy(alpha = 0.12f)).clickable { onPlay() }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                    Text("▶ Play recording", style = MaterialTheme.typography.labelMedium, color = IndigoL)
                }
            }
        }
        if (!call.summary.isNullOrBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(call.summary!!, style = MaterialTheme.typography.bodySmall, color = SubInk)
        }
        Spacer(Modifier.height(4.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Hair))
    }
}

@Composable
private fun JourneyRow(atIso: String?, type: String, text: String, last: Boolean) {
    val (emoji, tint) = when (type) {
        "created" -> "🟢" to GreenL
        "status" -> "🔁" to IndigoL
        "temperature" -> "🌡️" to AmberL
        "note" -> "📝" to SubInk
        "budget" -> "💰" to GreenL
        "site_visit" -> "📍" to PurpleL
        "follow_up" -> "⏰" to JadeL
        "call" -> "📞" to GreenL
        else -> "✏️" to SubInk
    }
    Row(Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) { Text(emoji, style = MaterialTheme.typography.labelMedium) }
            if (!last) Box(Modifier.width(2.dp).height(24.dp).background(Hair))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.padding(bottom = 8.dp)) {
            Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = Ink)
            isoMs(atIso)?.let { Text(fmtWhen(it), style = MaterialTheme.typography.labelSmall, color = SubInk) }
        }
    }
}

@Composable
private fun VoiceNoteRow(
    n: com.salesautocall.app.data.LeadVoiceNote, playing: Boolean, onPlay: () -> Unit, onStop: () -> Unit,
    onRefreshAi: () -> Unit, onApplyDisposition: (String) -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(14.dp))
            .background(CardBg).border(1.dp, Hair, RoundedCornerShape(14.dp)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(38.dp).clip(CircleShape).background(if (playing) RedL else IndigoL).clickable { if (playing) onStop() else onPlay() }, contentAlignment = Alignment.Center) {
                Text(if (playing) "⏸" else "▶", color = Color.White, fontSize = 16.sp)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("🎤 ${n.durationSeconds}s voice note", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = Ink)
                val meta = buildString {
                    n.actorName?.takeIf { it.isNotBlank() }?.let { append(it) }
                    isoMs(n.createdAt)?.let { if (isNotEmpty()) append(" · "); append(fmtWhen(it)) }
                }
                if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.labelSmall, color = SubInk)
            }
        }
        when (n.aiStatus) {
            "ready" -> {
                if (!n.summary.isNullOrBlank()) { Spacer(Modifier.height(8.dp)); Text("✨ AI: ${n.summary}", style = MaterialTheme.typography.bodySmall, color = Ink) }
                n.suggestedDisposition?.takeIf { it.isNotBlank() }?.let { d ->
                    val label = SETTABLE.firstOrNull { it.first == d }?.second ?: d
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("AI suggests:", style = MaterialTheme.typography.labelSmall, color = SubInk)
                        Spacer(Modifier.width(6.dp))
                        Box(Modifier.clip(RoundedCornerShape(50)).background(IndigoL.copy(alpha = 0.14f)).clickable { onApplyDisposition(d) }.padding(horizontal = 10.dp, vertical = 4.dp)) {
                            Text("$label — Apply", style = MaterialTheme.typography.labelMedium, color = IndigoL, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            "failed" -> { Spacer(Modifier.height(6.dp)); Text("AI summary failed — audio saved, admin can still listen.", style = MaterialTheme.typography.labelSmall, color = SubInk) }
            else -> {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { onRefreshAi() }) {
                    CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp, color = IndigoL)
                    Spacer(Modifier.width(6.dp))
                    Text("AI summary ban raha hai… (tap to refresh)", style = MaterialTheme.typography.labelSmall, color = SubInk)
                }
            }
        }
    }
}

private fun openWhatsAppLocal(context: android.content.Context, phone: String, message: String? = null) {
    com.salesautocall.app.data.WhatsAppLauncher.open(context, phone, message)
}

/** [speaksAs] conjugates the opener to the REP — Hindi inflects the first
 *  person, so a fixed "kar raha hoon" was wrong for every woman on the team. */
private fun waTemplateLocal(name: String?, project: String?, agent: String?, company: String?, speaksAs: String? = null): String {
    val sv = com.salesautocall.app.data.SelfVoice
    val hi = name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji," } ?: "Namaste,"
    val who = agent?.trim()?.ifBlank { null } ?: "aapka property advisor"
    val co = company?.trim()?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    val ref = project?.trim()?.takeIf { it.isNotBlank() }?.let { " Aapne $it ke liye enquiry ki thi." } ?: " Aapki property enquiry ke regarding."
    return "$hi ${sv.iAm(speaksAs)} $who$co se baat ${sv.doing(speaksAs, "kar")}.$ref " +
        "Property ki details aur best offer share karna ${sv.want(speaksAs)} — kya abhi baat kar sakte hain?"
}

/** A clean, professional site-visit confirmation for the buyer's WhatsApp. */
private fun visitConfirmationMessage(contact: Contact, whenLabel: String, agent: String?, company: String?): String {
    val hi = contact.name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji 🙏" } ?: "Namaste 🙏"
    val project = contact.siteVisitProject?.trim()?.takeIf { it.isNotBlank() }
    val sign = listOfNotNull(agent?.trim()?.takeIf { it.isNotBlank() }, company?.trim()?.takeIf { it.isNotBlank() })
        .joinToString(" · ").ifBlank { "Your property advisor" }
    return buildString {
        append("$hi\n\n")
        append("Aapki *site visit confirm* ho gayi hai:\n")
        project?.let { append("🏠 $it\n") }
        append("📅 $whenLabel\n\n")
        append("Hum aapka wahan intezaar karenge. Koi badlav ho to please bata dijiyega.\n\n")
        append("— $sign")
    }
}
