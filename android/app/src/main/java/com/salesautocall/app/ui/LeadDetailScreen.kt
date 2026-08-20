package com.salesautocall.app.ui

import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadStage
import com.salesautocall.app.data.Wada
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.StatusTag
import com.salesautocall.app.ui.design.StatusTone
import androidx.compose.material.icons.filled.Close

// ---- Palette: paper & ink, ONE jade accent — same language as the Leads page.
// The old rainbow constants keep their names but now resolve to ink/jade (with
// muted terracotta/amber reserved for genuine heat & warnings), so every
// call-site collapses to the calm palette without structural edits.
private val ScreenBg = AppColors.Canvas
private val CardBg = AppColors.Surface
private val Ink = AppColors.TextPrimary
private val SubInk = AppColors.TextSecondary
private val Hair = AppColors.Border
private val JadeL = AppColors.Indigo
// GreenL, IndigoL and PurpleL were all aliases of JadeL — one colour wearing
// three names. That collapsed the funnel: a COMPLETED step and the CURRENT step
// were painted identically, so the one thing the pipeline exists to show — where
// this lead has got to — could only be read from the tick glyph, not the colour.
//
// Done is now Positive and current is Indigo, which is the same green/indigo
// pairing Analytics uses for Done vs In progress. Two states, two colours.
private val GreenL = AppColors.Positive   // a step that is behind us
private val IndigoL = JadeL               // primary accent
private val PurpleL = JadeL               // the step we are on NOW
private val BlueL = JadeL           // call actions = jade
private val AmberL = AppColors.Warning   // muted amber: warnings + "warm"
private val RedL = AppColors.Danger     // muted terracotta: overdue, "hot", destructive
private val ColdL = AppColors.Slate    // quiet warm slate: "cold" temperature
private val WhatsGreen = Color(0xFF25D366) // brand — recognisable, kept

private val SETTABLE = listOf(
    "interested" to "Interested", "site_visit" to "Site Visit", "negotiation" to "Negotiation",
    "token_paid" to "Token Paid 💰", "booked" to "Booked / Won", "callback" to "Callback",
    "not_interested" to "Not interested", "lost" to "Lost", "dnc" to "Do Not Call",
)
private val TEMPS = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

/** The real-estate journey, top to bottom. First two steps are milestones the
 *  system stamps itself; from "Interested" onward the rep moves the lead. */
private data class FunnelStep(val key: String, val label: String, val settable: Boolean)

/**
 * The journey drawn on the lead page.
 *
 * `key` IS the canonical stage code, so a lead's position is `contact.stage`
 * matched directly — no status sets. This list used to repeat the whole
 * disposition-to-stage mapping, making it the fifth copy in the codebase and
 * the one most likely to drift, because it also carried the drawing order.
 * Labels shown to a rep still live here; membership does not.
 */
private val FUNNEL = listOf(
    FunnelStep("new", "New enquiry", false),
    FunnelStep("contacted", "Contacted", false),
    FunnelStep("interested", "Interested", true),
    FunnelStep("site_visit", "Site Visit", true),
    FunnelStep("negotiation", "Negotiation", true),
    FunnelStep("token_paid", "Token Paid", true),
    FunnelStep("won", "Booked 🏆", true),
)

/**
 * Last-resort short words for the compact funnel.
 *
 * The real ones are `lead_stages.short_label`, set by the admin and shared with
 * the dashboard. These only render in the seconds before that table has loaded,
 * or if a tenant left a short label blank — never as a competing taxonomy.
 */
private val FALLBACK_SHORT = mapOf(
    "new" to "New", "contacted" to "Contact", "interested" to "Interest",
    "site_visit" to "Visit", "negotiation" to "Nego", "token_paid" to "Token",
    "won" to "Booked",
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

/** Same calendar day as right now, in the phone's own zone. */
private fun isSameDayAsNow(ms: Long): Boolean {
    val zone = java.time.ZoneId.systemDefault()
    return java.time.Instant.ofEpochMilli(ms).atZone(zone).toLocalDate() == java.time.LocalDate.now(zone)
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

/**
 * Label for a canonical STAGE code. lead_stages WINS.
 *
 * FUNNEL carries a hardcoded label per step ("Booked 🏆", "Site Visit"), and
 * lead_stages carries the real one the admin configured. When those disagreed
 * the phone quietly showed its own wording while the dashboard showed the
 * admin's — the exact drift the stage table exists to prevent. Rename a stage
 * on the web and the handset follows it now.
 *
 * FUNNEL keeps the drawing ORDER and which steps a rep may set, because those
 * are product rules the table does not express. Only the words come from data.
 */
private fun stageLabel(stages: List<LeadStage>, stage: String): String =
    stages.firstOrNull { it.code == stage }?.label?.takeIf { it.isNotBlank() }
        ?: FUNNEL.firstOrNull { it.key == stage }?.label?.removeSuffix(" 🏆")
        ?: SETTABLE.firstOrNull { it.first == stage }?.second
        ?: stage.replaceFirstChar { it.uppercase() }

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
    var handOverOpen by remember { mutableStateOf(false) }
    var editIdentityOpen by remember { mutableStateOf(false) }
    var funnelExpanded by remember { mutableStateOf(false) }
    var journeyExpanded by remember { mutableStateOf(false) }

    val followUp = app.followUpList.firstOrNull {
        (it.contactId != null && it.contactId == contact.id) || it.phone == contact.phone
    }

    // The call the rep is being asked about, in their own words. Only today's:
    // "Talked 3m 20s" next to a call from last Tuesday would be answering a
    // different question. Under 30 seconds is a ring-out, not a conversation —
    // the same line the lead cards draw, and the same threshold.
    val lastCallLineToday = remember(app.leadDetailCalls) {
        val c = app.leadDetailCalls.firstOrNull()
        val ms = isoMs(c?.startedAt)
        if (c == null || ms == null || !isSameDayAsNow(ms)) null
        else {
            val s = c.durationSeconds
            val len = if (s >= 60) "${s / 60}m ${s % 60}s" else "${s}s"
            if (s >= 30) "Talked $len · ${fmtWhen(ms)}" else "No talk ($len) · ${fmtWhen(ms)}"
        }
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

    // Measured, not guessed. The outcome bar grows when it has a question to
    // ask and shrinks again after; a hardcoded bottom padding would either
    // leave a gap or hide the last card exactly when the strip is open.
    var bottomBarsPx by remember { mutableIntStateOf(0) }
    val bottomInset = with(LocalDensity.current) { bottomBarsPx.toDp() }

    Box(Modifier.fillMaxSize().background(ScreenBg)) {
        Refreshable(onRefresh = { vm.refreshLeadDetail(); vm.refreshVoiceNotes(); vm.loadFollowUps(force = true) }) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    bottom = (if (bottomBarsPx == 0) 96.dp else bottomInset) + 12.dp,
                ),
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
                                // WHERE A REP ACTUALLY LOOKS FOR IT.
                                //
                                // The hand-over shipped at the bottom of the Update
                                // sheet, under the name field, the stage chips, the
                                // temperature chips, budget, notes and two more
                                // buttons. The founder opened a rep's account looking
                                // for it and could not find it; a telecaller never
                                // would either. It stays there for anyone mid-edit,
                                // and it also lives here — in the menu that already
                                // holds every other thing you DO to a lead rather
                                // than type into it.
                                DropdownMenuItem(text = { Text("🤝 Give to a teammate") }, onClick = {
                                    moreOpen = false; handOverOpen = true
                                })
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
                        stages = app.leadStages,
                        onCopy = { copyNumber() },
                        onNextTap = { scheduleOpen = true },
                        onEdit = { editIdentityOpen = true },
                        onCallAlt = { contact.altPhone?.let { doCallNumber(it) } },
                    )
                }

                // THE QUAD OF ACTION TILES IS GONE, BECAUSE ALL FOUR NOW EXIST
                // TWICE ELSEWHERE.
                //
                // "Bohot jada chije faili hui h — smjh nahi aata kaha kya h."
                // This row was the clearest case of it. Call Now, WhatsApp and
                // More were already the three icons in the title bar directly
                // above, and Call and WhatsApp are also the two buttons in the
                // action bar pinned at the bottom — three routes to the same
                // dial on one screen. Set Reminder is the button on the "No
                // next step planned" card a few hundred pixels down, and a menu
                // item in More.
                //
                // Nothing is lost: `scheduleOpen` and `moreOpen` are still
                // driven from the title bar and that card. What goes is ~100dp
                // at the top of the page and the impression that four different
                // things are on offer when there are two.

                // ══ THE ASSISTANT, IN ONE BREATH ═════════════════════════════
                //
                // These four blocks used to be scattered down the screen with a
                // funnel and a voice recorder between them: AI Coach at position
                // 5, Wada at 6, Next step at 7, Call Coach at 10. Four cards, four
                // headers, four different robots — and a rep who has just hung up
                // has to work out which one to open.
                //
                // They are now contiguous and in the order a person actually
                // thinks after a call:
                //
                //     what was said        → Wada
                //     how it went          → Call Coach
                //     what to say next     → the three tabs
                //     what to do, and when → Next step
                //
                // Nothing merged into anything, nothing lost — the same four
                // composables with the same inputs, read as one voice instead of
                // four products. The two that announced themselves as tools
                // ("AI COACH", "CALL COACH") now say what they are FOR.
                //
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

                // ---- Call Coach — honest rating + guidance from THIS lead's last
                // real recording. The coach "observes" the call and rates it; a
                // good call only gets motivation, no forced suggestion. ----
                if (app.leadCoachLoading || app.leadCoach != null) {
                    item {
                        val coach = app.leadCoach
                        SectionCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("HOW THAT CALL WENT", style = MaterialTheme.typography.labelLarge,
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
                                    Text("Listening to your last call…",
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

                // ---- Next step banner ----
                item {
                    val visitMs = isoMs(contact.siteVisitAt)
                    val nowMs = System.currentTimeMillis()
                    val fuMs = followUp?.let { isoMs(it.dueAt) }
                    // Terminal is a STAGE question, and it now includes `invalid` — a bad
                    // number was previously treated as still-live work here.
                    val terminal = app.leadStages.firstOrNull { it.code == contact.stage }?.isTerminal ?: false
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

                // ---- Calls & recordings — always open, and directly under the
                // voice note, so hearing what was said and recording what it
                // meant sit together instead of a screen apart. ----
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
                        HorizontalFunnel(contact, app.leadStages) { key ->
                            when (key) {
                                "site_visit" -> visitOpen = true
                                else -> {
                                    val idx = FUNNEL.indexOfFirst { it.key == contact.stage }
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
                                stages = app.leadStages,
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

                // ---- Temperature · Journey (2 columns) ----
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

        // ---- Outcome bar, then the app's real bottom navigation ----
        //
        // Stacked, never overlaid. The nav bar was already the bottom of this
        // screen; the outcome bar sits on top of it and the list's bottom
        // padding is measured from the pair, so nothing the rep needs ever ends
        // up underneath either one.
        Column(
            Modifier.align(Alignment.BottomCenter)
                .onSizeChanged { bottomBarsPx = it.height },
        ) {
            LeadActionBar(
                contact = contact,
                pending = app.pendingUpdates.firstOrNull { it.contactId == contact.id },
                callLine = lastCallLineToday,
                onCall = { doCall() },
                onWhatsApp = { doWhats() },
                onOpenUpdate = {
                    vm.openFollowUpUpdate(contact.id, contact.phone, contact.name, followUp?.id)
                },
                onOutcome = { status ->
                    contact.id?.let {
                        vm.disposeFromLead(it, contact.phone, contact.name, status, followUp?.id)
                    }
                },
                onBookCallback = { scheduleOpen = true },
                onBookVisit = { visitOpen = true },
                onQuickCallback = { millis ->
                    vm.scheduleFollowUp(contact.id, contact.phone, contact.name, millis, null)
                },
            )
            FloatingCallBar(
                current = "leads",
                onTab = { vm.goToTab(it) },
                onDial = { vm.goToTab("dialer") },
                onMore = { vm.openDrawerFromOverlay() },
                // No raised Dial here. The action bar directly above it already
                // has a Call, for the lead this page is about; the raised one
                // opens a keypad to type some other number. Two indigo phone
                // buttons forty pixels apart, and the top one was the wrong
                // guess nine times out of ten.
                showDial = false,
            )
        }
    }

    if (handOverOpen) HandOverDialog(vm = vm, c = contact, onDismiss = { handOverOpen = false })

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
        val label = stageLabel(app.leadStages, key)
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
            .shadow(3.dp, Radii.card, ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(Radii.card).background(CardBg).padding(Space.l),
        content = content,
    )
}

@Composable
private fun MiniCard(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.shadow(3.dp, Radii.card, ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(Radii.card).background(CardBg)
            .heightIn(min = 96.dp).padding(Space.m),
    ) {
        Text(title.uppercase(), style = AppType.sectionLabel, color = AppColors.TextTertiary, maxLines = 1)
        Spacer(Modifier.height(10.dp))
        content()
    }
}

@Composable
private fun TopIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, onClick: () -> Unit) {
    Box(
        Modifier.size(42.dp).shadow(2.dp, Radii.control, ambientColor = SoftShadow, spotColor = SoftShadow)
            .clip(Radii.control).background(CardBg).clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp)) }
}

// ActionTile went with the quad row it drew. Its last caller was that row, and
// every one of those four actions now lives in the title bar or the pinned
// action bar instead.

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
    /** Canonical stages — the chip renders the admin's label, never its own. */
    stages: List<LeadStage>,
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
                    Text(prettyName(contact.name) ?: prettyNum(contact.phone), style = MaterialTheme.typography.headlineSmall,
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
            LeadChip(stageLabel(stages, contact.stage), tempRing(null))
            contact.temperature?.takeIf { it.isNotBlank() }?.let { t ->
                val (label, col) = when (t) { "hot" -> "🔥 Hot" to RedL; "warm" -> "☀ Warm" to AmberL; else -> "❄ Cold" to ColdL }
                LeadChip(label, col)
            }
            budgetLabel(contact.budget)?.let { LeadChip("💰 ₹ $it", GreenL) }
            // EVERY OTHER ANSWER THEY GAVE THE FORM — not the first three.
            //
            // The list card has room for a few; this is the screen a rep opens
            // when they are about to talk to the person, so it shows the lot.
            // Purpose, whether they want a site visit, city, anything a future
            // form adds — read straight out of extra.raw_fields, so a new
            // question appears here the day the ads team adds it.
            leadAnswers(contact).forEach { (label, value) ->
                LeadChip(if (label == null) value else "$label · $value", SubInk)
            }
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
    // The bell went. This banner is the lead's NEXT STEP — a callback, a booked
    // site visit, or nothing planned — and a notification glyph in front of all
    // three said only "alert", which is the one thing they have in common and
    // the least useful thing about any of them. The title already says which it
    // is, and dropping the icon gives the detail line back the width it needed
    // for a date, a time and a project name without truncating.
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Space.l).clip(Radii.card)
            .background(color.copy(alpha = 0.10f)).padding(Space.l),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = AppType.rowTitle, color = color)
            detail.takeIf { it.isNotBlank() }?.let {
                Text(it, style = AppType.meta, color = SubInk, maxLines = 2)
            }
        }
        Spacer(Modifier.width(Space.m))
        Box(Modifier.clip(Radii.tag).background(color).clickable { onCta() }.padding(horizontal = Space.l, vertical = Space.s + Space.xxs)) {
            Text(cta, color = AppColors.OnIndigo, style = AppType.label)
        }
        onDelete?.let {
            Spacer(Modifier.width(Space.s))
            Box(Modifier.size(30.dp).clip(CircleShape).background(color.copy(alpha = 0.14f)).clickable { it() }, contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Close, contentDescription = "Remove next step", tint = color, modifier = Modifier.size(15.dp))
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
            // NOT "AI COACH". A rep does not want a tool, they want to be told
            // what to say. Naming the robot makes them decide whether to open it;
            // naming the JOB makes them read it. The three tabs underneath say
            // what it does, so the header does not have to.
            Text("🤖", fontSize = 18.sp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("WHAT TO SAY", style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold, color = JadeL, letterSpacing = 0.5.sp)
                Text("Opening line, the counter to their objection, a message to send",
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
private fun HorizontalFunnel(contact: Contact, stages: List<LeadStage>, onTap: (String) -> Unit) {
    val idx = FUNNEL.indexOfFirst { it.key == contact.stage }
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
                // The word under each circle is the admin's own short label,
                // the same one the dashboard prints. This used to be a private
                // when-block ("Nego.", "Interest") that drifted the moment a
                // stage was renamed on the web.
                //
                // Seven steps share the width — about 45dp each on a 4-inch
                // phone. Two lines at 11sp hold "Contacted" whole instead of
                // hyphen-breaking it mid-word, the height is fixed so short and
                // long labels keep the row level, and ellipsis is the floor
                // under a long label a tenant might configure.
                val short = stages.firstOrNull { it.code == step.key }
                    ?.let { it.shortLabel.ifBlank { it.label } }
                    ?: FALLBACK_SHORT[step.key] ?: step.label
                Text(short,
                    style = AppType.tag,
                    fontSize = 10.sp, lineHeight = 12.sp,
                    color = when { current -> PurpleL; done -> GreenL; else -> SubInk },
                    textAlign = TextAlign.Center, maxLines = 2,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    // heightIn, not height: at a large system font scale two
                    // lines need more than 24dp and a fixed box would clip them.
                    modifier = Modifier.heightIn(min = 24.dp).padding(horizontal = 1.dp))
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

/**
 * The sticky outcome bar: CALL → OUTCOME → NEXT ACTION, without scrolling.
 *
 * The lead page is eleven sections deep and the one thing a rep does after
 * every single call — record what happened — was buried in the fourth of them.
 * A rep who has just hung up should not have to go looking.
 *
 * IT IS SMALL WHEN THERE IS NOTHING TO ANSWER. Browsing a lead, this is one
 * 44dp row: Call · WhatsApp · Update, the same three buttons as the lead card
 * the rep already knows. The outcome strip appears only when a call has
 * actually ended without an outcome, and removes itself the moment one is
 * recorded. A bar that is always big is a bar that always steals a 4-inch
 * screen from the content it sits under.
 *
 * ONE TAP, OR TWO:
 *   Wrong number / No answer / Busy / Not interested → one tap, done. No answer
 *   and Busy book their own retry through the attempt ladder, so the next
 *   action needs no tap at all.
 *   Connected / Interested → the outcome SAVES on that first tap, then the
 *   strip asks for the next call. Walking away after tap one loses nothing.
 *
 * Wrong number is one tap and asks for nothing else. There is nothing for a
 * telecaller to record about a number that was never the customer's.
 *
 * NO RULES LIVE HERE. Every chip calls vm.disposeFromLead, which hands
 * straight to postCallDispose — the same code the post-call popup runs. Visit
 * and Call back open the dialogs this screen already had. Anything the strip
 * does not cover is one tap away on Update, which opens the full existing
 * sheet with its temperature, note and voice-note capture untouched.
 */
@Composable
private fun LeadActionBar(
    contact: Contact,
    /** Non-null when a call ended and no outcome was recorded for it. */
    pending: PendingUpdate?,
    /** "Talked 3m 20s · Today, 6:06 PM" — this lead's last call, if it was today. */
    callLine: String?,
    onCall: () -> Unit,
    onWhatsApp: () -> Unit,
    onOpenUpdate: () -> Unit,
    onOutcome: (String) -> Unit,
    onBookCallback: () -> Unit,
    onBookVisit: () -> Unit,
    onQuickCallback: (Long) -> Unit,
) {
    // Which half of the strip is showing. Keyed to the lead so opening another
    // one never inherits the last lead's half-finished answer.
    var askNext by remember(contact.id) { mutableStateOf(false) }
    // The strip closes itself when the outcome lands: `pending` goes null the
    // moment postCallDispose clears it, and asking for a next step after the
    // rep has already booked one would be nagging.
    //
    // Keyed on the call's timestamp as well as the lead, so a SECOND call to
    // the same person re-opens it. Keyed on the lead alone, a rep who dismissed
    // the strip, rang again from the button right below it and hung up would
    // get no prompt at all — the one case where the page is guaranteed to be
    // the thing they are looking at.
    var dismissed by remember(contact.id, pending?.at) { mutableStateOf(false) }
    val stripOpen = !dismissed && (pending != null || askNext)

    Column(Modifier.fillMaxWidth()) {
        // The fade is its own fixed 20dp band, not a gradient across the whole
        // bar. Spread over the bar it was too short to see when the bar was
        // 44dp — a card scrolling under it looked sliced clean off, which is
        // what it looked like in the founder's screenshot — and it would have
        // become a 60dp smear once the outcome strip doubled the bar's height.
        // A fixed band behaves the same in both states.
        Box(
            Modifier.fillMaxWidth().height(20.dp)
                .background(Brush.verticalGradient(listOf(Color.Transparent, ScreenBg))),
        )
        Column(
            Modifier.fillMaxWidth().background(ScreenBg)
                .padding(horizontal = 12.dp).padding(bottom = 8.dp),
        ) {
            if (stripOpen) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                        .background(AppColors.Surface)
                        .border(1.dp, AppColors.Border, RoundedCornerShape(16.dp))
                        .padding(horizontal = 12.dp, vertical = 9.dp),
                ) {
                    Text(
                        when {
                            askNext -> "Saved. When is the next call?"
                            pending?.connected == false -> "Nobody picked up — what now?"
                            else -> "What happened on the call?"
                        },
                        style = AppType.metaStrong, color = Ink, maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                    // The call itself, so the rep is not answering from memory.
                    callLine?.let {
                        Text(it, style = AppType.tag, color = SubInk, maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(7.dp))
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (askNext) {
                            BarChip("Tomorrow 11 AM", IndigoL) {
                                dismissed = true; askNext = false
                                onQuickCallback(
                                    java.time.ZonedDateTime.now().plusDays(1)
                                        .withHour(11).withMinute(0).withSecond(0)
                                        .toInstant().toEpochMilli(),
                                )
                            }
                            BarChip("Pick a time", IndigoL) { dismissed = true; askNext = false; onBookCallback() }
                            BarChip("🏠 Book visit", PurpleL) { dismissed = true; askNext = false; onBookVisit() }
                            BarChip("No next step", SubInk) { dismissed = true; askNext = false }
                        } else if (pending?.connected == false) {
                            // A call that never connected has no funnel stage to
                            // pick, so it is not offered one — the same rule the
                            // post-call popup follows. These two book their own
                            // retry, which is why neither leads to the next step.
                            BarChip("📵 No answer", RedL) { onOutcome("no_answer") }
                            BarChip("⏳ Busy", AmberL) { onOutcome("busy") }
                            BarChip("✖️ Wrong number", RedL) { onOutcome("invalid") }
                            BarChip("↻ Call back", IndigoL) { dismissed = true; onBookCallback() }
                        } else {
                            BarChip("✓ Connected", GreenL) { onOutcome("called"); askNext = true }
                            BarChip("⭐ Interested", GreenL) { onOutcome("interested"); askNext = true }
                            BarChip("🏠 Site visit", PurpleL) { dismissed = true; onBookVisit() }
                            BarChip("❌ Not interested", SubInk) { onOutcome("not_interested") }
                            BarChip("✖️ Wrong number", RedL) { onOutcome("invalid") }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            // Call and WhatsApp stay the primary actions, in reach at the bottom of
            // a long page instead of only at the top of it.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.weight(1.3f).height(44.dp).clip(RoundedCornerShape(12.dp))
                        .background(IndigoL).clickable { onCall() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Default.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Call", color = Color.White, style = AppType.label, maxLines = 1)
                }
                Spacer(Modifier.width(7.dp))
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                        .background(WhatsGreen.copy(alpha = 0.13f)).clickable { onWhatsApp() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Chat, contentDescription = "WhatsApp", tint = WhatsGreen, modifier = Modifier.size(18.dp)) }
                Spacer(Modifier.width(7.dp))
                // Everything the strip does not cover — temperature, a typed note, a
                // voice note — is behind this, in the sheet that already does it.
                val tint = if (pending != null && !stripOpen) AmberL else IndigoL
                Row(
                    Modifier.nudgeShake(pending != null && !stripOpen)
                        .weight(1f).height(44.dp).clip(RoundedCornerShape(12.dp))
                        .background(tint.copy(alpha = 0.12f))
                        .clickable { onOpenUpdate() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text("✎ Update", color = tint, style = AppType.label, maxLines = 1)
                }
            }
        }
    }
}

/** One pill in the outcome strip. Small, tinted, single line — a row of these
 *  has to stay under about 34dp or the bar stops being a bar. */
@Composable
private fun BarChip(label: String, tint: Color, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(9.dp))
            .background(tint.copy(alpha = 0.12f))
            .clickable { onClick() }
            .padding(horizontal = 11.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = AppType.tag, color = tint, maxLines = 1)
    }
}

/** Vertical detailed funnel (shown when "View All" is expanded): every stage on
 *  its own line, tap a done step to walk back, edit/cancel the site visit. */
@Composable
private fun FunnelStepper(contact: Contact, stages: List<LeadStage>, onSet: (String) -> Unit, onMoveBack: (String) -> Unit, onEditVisit: () -> Unit, onClearVisit: () -> Unit) {
    val idx = FUNNEL.indexOfFirst { it.key == contact.stage }
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
                    Text(stageLabel(stages, step.key), style = if (current) AppType.rowTitle else AppType.bodyStrong,
                        color = when { current -> PurpleL; done -> Ink; else -> SubInk })
                    val sub = when (step.key) {
                        "site_visit" -> isoMs(contact.siteVisitAt)?.let { ms -> listOfNotNull(fmtWhen(ms), contact.siteVisitProject?.takeIf { it.isNotBlank() }).joinToString(" · ") }
                        "token_paid" -> contact.tokenAmount?.takeIf { it > 0 }?.let { "₹${if (it % 1.0 == 0.0) it.toLong() else it}" }
                        else -> null
                    }
                    sub?.let { Text(it, style = AppType.meta, color = SubInk) }
                }
                val hasVisit = step.key == "site_visit" && !contact.siteVisitAt.isNullOrBlank()
                when {
                    hasVisit -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.clip(Radii.tag).background(AppColors.IndigoSoft).clickable { onEditVisit() }.padding(horizontal = Space.m, vertical = Space.xs)) {
                            Text("Edit", color = PurpleL, style = AppType.tag)
                        }
                        Box(Modifier.size(24.dp).clip(CircleShape).background(RedL.copy(alpha = 0.12f)).clickable { onClearVisit() }, contentAlignment = Alignment.Center) {
                            Text("✕", color = RedL, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    current -> StatusTag("NOW", StatusTone(PurpleL, AppColors.IndigoSoft))
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
                    Text("Writing the summary… tap to refresh", style = MaterialTheme.typography.labelSmall, color = SubInk)
                }
            }
        }
    }
}

private fun openWhatsAppLocal(context: android.content.Context, phone: String, message: String? = null) {
    com.salesautocall.app.data.WhatsAppLauncher.open(context, phone, message)
}

/** Simple Indian English opener — same text as the one in TelecallerScreens.
 *  [speaksAs] stays on the signature so the call site is unchanged; English
 *  does not inflect the first person, so the gendered Hindi conjugation this
 *  used to need is gone. */
private fun waTemplateLocal(name: String?, project: String?, agent: String?, company: String?, speaksAs: String? = null): String {
    val hi = name?.trim()?.takeIf { it.isNotBlank() }?.let { "Namaste $it ji," } ?: "Namaste,"
    val who = agent?.trim()?.ifBlank { null } ?: "your property advisor"
    val co = company?.trim()?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    val ref = project?.trim()?.takeIf { it.isNotBlank() }?.let { " You had enquired about $it." }
        ?: " This is regarding your property enquiry."
    return "$hi I am $who$co.$ref " +
        "I would like to share the details and our best offer — can we talk now?"
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
