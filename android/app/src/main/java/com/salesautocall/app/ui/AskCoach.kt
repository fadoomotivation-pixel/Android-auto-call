package com.salesautocall.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.Repository
import com.salesautocall.app.dialer.DialerController
import com.salesautocall.app.dialer.SimCallMonitor
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.CoachOrb
import com.salesautocall.app.ui.design.IosChip
import com.salesautocall.app.ui.design.IosColors
import com.salesautocall.app.ui.design.IosGroup
import com.salesautocall.app.ui.design.IosSeparator
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.iosPress
import com.salesautocall.app.ui.design.rememberHaptics
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * COACH ANYWHERE.
 *
 * The coach used to float as a bubble and was removed because it landed on
 * content (pipeline buttons, avatars, a card's Call button). This one is
 * built so that cannot happen again:
 *  - it is TUCKED half into the right edge, so it covers ~22dp of the edge,
 *    never the middle of a card;
 *  - it only moves up and down, inside a band that stops well above the
 *    bottom Call bar / nav and below the top bar;
 *  - it is HIDDEN during any call, the auto-dialler, and when the rep hides
 *    it for the day.
 * It never opens by itself. Tapping it is the only way in, so #514's coach
 * timing rules (morning card, Coaching time, coach card) are untouched.
 */
@Composable
internal fun CoachDock(vm: MainViewModel, app: AppState) {
    val context = LocalContext.current
    val dialer by DialerController.state.collectAsState()
    val sim by SimCallMonitor.state.collectAsState()
    val onCall = sim != null || app.cloudCallNumber != null || (dialer.isRunning && !dialer.paused)
    val today = remember { java.time.LocalDate.now().toString() }
    var hiddenToday by remember { mutableStateOf(AppPrefs.getCoachMiniDate(context) == today) }
    var sheetOpen by remember { mutableStateOf(false) }
    // Fraction of the allowed band (0 = top of band, 1 = bottom of band).
    var bandPos by remember { mutableFloatStateOf(AppPrefs.getCoachDockPos(context)) }
    val haptics = rememberHaptics()

    if (!app.signedIn) return

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val hPx = with(density) { maxHeight.toPx() }
        val wPx = with(density) { maxWidth.toPx() }
        val orb = 52.dp
        val orbPx = with(density) { orb.toPx() }
        // Band: from 18% to 62% of the screen. The bottom ~38% holds the
        // Call bar, nav pill, outcome bars and the Leads "Call N" button.
        val top = hPx * 0.18f
        val bottom = hPx * 0.62f - orbPx
        val y = top + (bottom - top).coerceAtLeast(0f) * bandPos.coerceIn(0f, 1f)

        AnimatedVisibility(
            visible = !onCall && !hiddenToday && !sheetOpen,
            enter = fadeIn() + scaleIn(initialScale = 0.6f),
            exit = fadeOut() + scaleOut(targetScale = 0.6f),
            modifier = Modifier.offset { IntOffset((wPx - orbPx * 0.62f).roundToInt(), y.roundToInt()) },
        ) {
            Box(
                Modifier.size(orb)
                    .shadow(8.dp, CircleShape, clip = false)
                    .clip(CircleShape)
                    .background(Color.White)
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragEnd = { AppPrefs.setCoachDockPos(context, bandPos) },
                        ) { change, drag ->
                            change.consume()
                            val span = (bottom - top).coerceAtLeast(1f)
                            bandPos = (bandPos + drag.y / span).coerceIn(0f, 1f)
                        }
                    }
                    .iosPress(scaleTo = 0.9f) { haptics.tap(); sheetOpen = true },
                contentAlignment = Alignment.CenterStart,
            ) {
                CoachOrb(size = 40.dp, face = true, modifier = Modifier.padding(start = 4.dp))
            }
        }
    }

    if (sheetOpen) {
        val lead = app.leadDetailId?.let { id -> app.leads.firstOrNull { it.id == id } }
        AskCoachSheet(
            vm = vm,
            app = app,
            lead = lead,
            onHideToday = {
                AppPrefs.setCoachMiniDate(context, today)
                hiddenToday = true
                sheetOpen = false
            },
            onDismiss = { sheetOpen = false },
        )
    }
}

/** One quick-help question. [local] answers come from the app itself, no AI. */
private data class QuickAsk(val label: String, val question: String, val local: String? = null)

private const val HOW_TO_USE =
    "Home: your plan for today and who to call first.\n" +
        "Leads: every lead. The Next call card says who is first. Tap a filter to see one group.\n" +
        "Follow Ups: people you promised to call back. Call now is what is due.\n" +
        "Lead page: Call at the bottom. After the call, tap Update and pick what happened.\n" +
        "Sales funnel on the lead page shows the step. Tap the next step to move it.\n" +
        "What to say: Pitch for an opening line, Objection for a reply, Message for WhatsApp.\n" +
        "The coach button on the right edge: ask anything. Hold and drag it up or down."

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AskCoachSheet(
    vm: MainViewModel,
    app: AppState,
    lead: Contact?,
    onHideToday: () -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var text by remember { mutableStateOf("") }
    var asked by remember { mutableStateOf<String?>(null) }
    var answer by remember { mutableStateOf<String?>(null) }
    var grounded by remember { mutableStateOf<Int?>(null) }
    var loading by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    val who = lead?.let { prettyName(it.name) ?: it.phone }
    val chips = buildList {
        if (lead != null) {
            add(QuickAsk("Opening line", "Give me the first line to say when I call $who now."))
            add(QuickAsk("Handle their objection", "What is the best reply to $who's objection? Use our company playbook."))
            add(QuickAsk("WhatsApp follow-up", "Write a short WhatsApp follow-up for $who that moves them to a site visit."))
            add(QuickAsk("Next step", "What is the single next step with $who, and what should I say?"))
        }
        add(QuickAsk("Handle price objection", "The customer says the price is too high. What exactly do I say?"))
        add(QuickAsk("Write WhatsApp follow-up", "Write a short, polite WhatsApp follow-up for a buyer who went quiet after a call."))
        add(QuickAsk("What should I do now?", "I have a few free minutes between calls. What is the most useful thing to do right now?"))
        add(QuickAsk("How to use this app", "How do I use this app?", local = HOW_TO_USE))
    }

    fun leadContext(c: Contact): String {
        val mem = c.id?.let { app.memoryByLead[it] }?.let { rowMemoryLine(it) }
        return listOfNotNull(
            "Lead: ${prettyName(c.name) ?: "no name"}",
            "stage ${c.stage}",
            c.temperature?.takeIf { it.isNotBlank() }?.let { "temperature $it" },
            c.budget?.takeIf { it.isNotBlank() }?.let { "budget $it" },
            c.siteVisitProject?.takeIf { it.isNotBlank() }?.let { "project $it" },
            mem?.let { "last talk: $it" },
            c.aiNextAction?.takeIf { it.isNotBlank() }?.let { "planned next: $it" },
            c.notes?.takeIf { it.isNotBlank() }?.let { "notes: ${it.take(160)}" },
        ).joinToString("; ")
    }

    fun ask(q: QuickAsk) {
        if (loading) return
        asked = q.label
        failed = false
        grounded = null
        if (q.local != null) { answer = q.local; return }
        answer = null
        loading = true
        // The question goes first; the server keeps 800 characters.
        val full = if (lead != null) (q.question + "\n\nAbout this lead — " + leadContext(lead)).take(790) else q.question.take(790)
        scope.launch {
            val r = runCatching { Repository.coachAskGrounded(full, lead?.id) }.getOrNull()
            loading = false
            if (r?.answer.isNullOrBlank()) { failed = true; answer = null }
            else { answer = r?.answer; grounded = r?.facts }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = AppColors.Canvas,
        scrimColor = IosColors.Scrim,
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().imePadding()
                .heightIn(max = 640.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Space.l).padding(bottom = 20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CoachOrb(size = 44.dp, active = loading, face = true)
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("Ask Coach", style = AppType.title, color = AppColors.TextPrimary)
                    Text(
                        if (who != null) "Help with $who, or anything else" else "Help with any lead, objection or message",
                        style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1,
                    )
                }
                Text("Done", style = AppType.headline, color = IosColors.Blue,
                    modifier = Modifier.clip(Radii.chip).iosPress { onDismiss() }.padding(8.dp))
            }
            Spacer(Modifier.height(Space.l))

            Text(if (lead != null) "QUICK HELP · THIS LEAD FIRST" else "QUICK HELP",
                style = AppType.groupHeader, color = AppColors.TextSecondary,
                modifier = Modifier.padding(start = Space.l, bottom = 6.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                chips.forEach { q ->
                    IosChip(label = q.label, selected = asked == q.label, accent = IosColors.Blue, selectedColor = IosColors.Blue) { ask(q) }
                }
            }
            Spacer(Modifier.height(Space.l))

            // Free question
            Row(
                Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)
                    .padding(start = Space.l, end = 6.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    value = text, onValueChange = { text = it.take(600) },
                    textStyle = AppType.body.copy(color = AppColors.TextPrimary),
                    cursorBrush = SolidColor(IosColors.Blue),
                    maxLines = 4,
                    modifier = Modifier.weight(1f).padding(vertical = 8.dp),
                    decorationBox = { inner ->
                        Box {
                            if (text.isEmpty()) Text("Ask anything… (Hindi or English is fine)", style = AppType.body, color = AppColors.TextTertiary)
                            inner()
                        }
                    },
                )
                val canSend = text.isNotBlank() && !loading
                Box(
                    Modifier.size(36.dp).clip(CircleShape)
                        .background(if (canSend) IosColors.Blue else IosColors.Fill)
                        .iosPress(enabled = canSend) {
                            ask(QuickAsk(text.trim().take(40), text.trim()))
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Ask",
                        tint = if (canSend) Color.White else IosColors.Gray, modifier = Modifier.size(17.dp))
                }
            }

            if (loading || answer != null || failed) {
                Spacer(Modifier.height(Space.l))
                IosGroup(
                    header = asked ?: "Answer",
                    footer = when {
                        failed -> null
                        answer == HOW_TO_USE -> "From the app itself."
                        grounded == null -> null
                        grounded!! > 0 -> "Based on $grounded note(s) from your company playbook and past wins."
                        else -> "No playbook note matched this. This is general advice. Ask your manager to add the right answer in RAG."
                    },
                ) {
                    Column(Modifier.padding(Space.l)) {
                        when {
                            loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = IosColors.Blue)
                                Spacer(Modifier.width(10.dp))
                                Text("Reading your playbook…", style = AppType.subhead, color = AppColors.TextSecondary)
                            }
                            failed -> Text(
                                "Coach could not answer right now. Check the internet and try again. No answer is better than a made-up one.",
                                style = AppType.subhead, color = IosColors.Red,
                            )
                            else -> Text(answer.orEmpty().trim(), style = AppType.body, color = AppColors.TextPrimary)
                        }
                    }
                    if (!loading && !failed && answer != null) {
                        IosSeparator()
                        Row(Modifier.fillMaxWidth()) {
                            Text("Copy", style = AppType.headline, color = IosColors.Blue,
                                modifier = Modifier.weight(1f).iosPress { clipboard.setText(AnnotatedString(answer.orEmpty().trim())) }
                                    .padding(vertical = 12.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            if (lead != null && answer != HOW_TO_USE) {
                                Text("Open WhatsApp", style = AppType.headline, color = Color(0xFF1FA855),
                                    modifier = Modifier.weight(1f).iosPress {
                                        com.salesautocall.app.data.WhatsAppLauncher.open(context, lead.phone, answer.orEmpty().trim())
                                    }.padding(vertical = 12.dp),
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(Space.xl))
            Text(
                "Hide coach button for today",
                style = AppType.subhead, color = IosColors.Red,
                modifier = Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)
                    .iosPress { onHideToday() }.padding(vertical = 14.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Text("It comes back tomorrow. The coach never opens by itself.",
                style = AppType.footnote, color = AppColors.TextSecondary,
                modifier = Modifier.padding(start = Space.l, top = 6.dp))
        }
    }
}
