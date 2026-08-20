package com.salesautocall.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType

// ════════════════════════════════════════════════════════════
//  THE ASSISTANT'S OWN QUESTIONS
// ════════════════════════════════════════════════════════════
//
// Three prompts, and deliberately only three. Each one asks about a single
// lead, at a moment where the answer changes what happens next, and wires that
// answer straight into the funnel — so answering the app IS the work, not
// paperwork on top of it.
//
//   visit_check    the visit day went by. Did they come, and how close are they?
//   callback_check the callback went red. Did you call, and if not, what's the plan?
//   day_review     once, after 7pm. What did today look like, and what got in the way?
//
// Whether any of them appears at all is decided in MainViewModel.tickAssistant —
// this file only knows how to ask nicely. Every prompt can be closed with one
// tap and nothing here ever traps the rep; the disposition sheet's lock exists
// because a real call was made, and none of these follow a call.

// This file keeps its own copy of the palette, as every screen file here does.
private val Jade = AppColors.Indigo
private val Brass = AppColors.Warning
private val Terracotta = AppColors.Danger
private val Plum = AppColors.Violet
private val Sea = AppColors.Teal
private val WarmSlate = AppColors.Slate
private val Token = AppColors.Violet

/**
 * ONE colour for every site-visit outcome button.
 *
 * A green "Booked" beside a red "Didn't work out" tells the rep which answer
 * the app is pleased with, and over a few weeks they drift towards it. That
 * drift lands in the one table the company is about to make pricing and
 * project decisions from, so neutrality here is not styling — it is what makes
 * the data worth reading.
 */
private val VisitNeutral = AppColors.Slate

/**
 * A short wiggle, then a long pause. Repeat.
 *
 * This is what replaced the post-call popup on SIM calls. The requirement is
 * awkward: it has to be impossible to miss out of the corner of an eye, and
 * also calm enough to sit on a screen the rep is reading for minutes at a time.
 * A continuous animation fails the second test within about ten seconds.
 *
 * So it moves for a third of a second and is then perfectly still for two and a
 * half. The eye catches the movement, the page stays readable, and — this is
 * the part that matters on the cheap phones this app runs on — a keyframed
 * translation on one small Box is close to free next to a modal dialog that
 * recomposes the world behind it.
 */
@Composable
internal fun Modifier.nudgeShake(active: Boolean): Modifier {
    if (!active) return this
    val transition = rememberInfiniteTransition(label = "nudge")
    // One plain 0→1 ramp per cycle; the wobble itself is computed from it. A
    // keyframe list would express the same shape, but this way the burst and
    // the pause are two numbers that can be tuned without redrawing a curve.
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(CYCLE_MS, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "nudgePhase",
    )
    return this.graphicsLayer {
        val t = phase * CYCLE_MS
        // Two damped wobbles, then dead still until the next cycle.
        val amplitude = if (t >= BURST_MS) 0f else 1f - (t / BURST_MS)
        translationX = kotlin.math.sin(t / BURST_MS * 4.0 * Math.PI).toFloat() * amplitude * 5.dp.toPx()
    }
}

/** How long one shake-then-rest cycle lasts. */
private const val CYCLE_MS = 2800
/** How much of that cycle actually moves. The rest is stillness, on purpose. */
private const val BURST_MS = 420f

/** A soft breathing glow for the nudge bar — presence without a klaxon. */
@Composable
private fun pulseAlpha(): Float {
    val transition = rememberInfiniteTransition(label = "pulse")
    val a by transition.animateFloat(
        initialValue = 0.10f, targetValue = 0.22f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Reverse),
        label = "pulseAlpha",
    )
    return a
}

// ════════════════════════════════════════════════════════════
//  Shared pieces
// ════════════════════════════════════════════════════════════

/** A full-width answer. Same height and weight as every other option, always. */
@Composable
private fun Choice(
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
    sub: String? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .height(if (sub == null) 52.dp else 60.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(color.copy(alpha = 0.12f))
            .clickable { onClick() }
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = color, style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
            sub?.let {
                Text(it, color = color.copy(alpha = 0.75f), style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center, maxLines = 1)
            }
        }
    }
}

/** The assistant's face on every prompt: same avatar, same voice, same place. */
@Composable
private fun AssistantHeader(emoji: String, title: String, who: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(38.dp).clip(CircleShape).background(Jade.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 18.sp) }
        Spacer(Modifier.width(11.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            who?.let {
                Text(it, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }
    }
}

/** The one line of context that makes the question answerable without thinking. */
@Composable
private fun ContextStrip(text: String, color: Color = Brass) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(color.copy(alpha = 0.10f))
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Text(text, style = MaterialTheme.typography.bodySmall, color = color, fontWeight = FontWeight.Medium)
    }
}

/** Lays options out two to a row so nothing wraps and nothing looks bigger. */
@Composable
private fun ChoiceGrid(options: List<Triple<String, Color, () -> Unit>>) {
    options.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            pair.forEach { (label, color, onTap) -> Choice(label, color, Modifier.weight(1f), onClick = onTap) }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
    }
}

/** Four sensible days plus a real picker — enough to never need the calendar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DayChips(headline: String, onPick: (Long) -> Unit, onBack: () -> Unit) {
    val now = java.time.ZonedDateTime.now()
    fun at(days: Long, hour: Int) =
        now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    var showPicker by remember { mutableStateOf(false) }

    Column {
        Text(headline, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        ChoiceGrid(
            listOf(
                Triple("Tomorrow\n11 AM", Jade, { onPick(at(1, 11)) }),
                Triple("Day after\n11 AM", Jade, { onPick(at(2, 11)) }),
                Triple("This weekend\nSat 11 AM", Plum, {
                    val toSat = ((java.time.DayOfWeek.SATURDAY.value - now.dayOfWeek.value + 7) % 7).toLong()
                    onPick(at(if (toSat == 0L) 7 else toSat, 11))
                }),
                Triple("Next week\nMon 11 AM", Sea, {
                    val toMon = ((java.time.DayOfWeek.MONDAY.value - now.dayOfWeek.value + 7) % 7).toLong()
                    onPick(at(if (toMon == 0L) 7 else toMon, 11))
                }),
            ),
        )
        Choice("📅  Pick another date", WarmSlate, Modifier.fillMaxWidth()) { showPicker = true }
        Spacer(Modifier.height(4.dp))
        TextButton(onClick = onBack) { Text("Back") }
    }

    if (showPicker) {
        val dps = rememberDatePickerState(initialSelectedDateMillis = now.toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val base = dps.selectedDateMillis
                    showPicker = false
                    if (base != null) {
                        // The picker hands back a UTC midnight; turn it into
                        // 11 AM on that day in the rep's own timezone.
                        val day = java.time.Instant.ofEpochMilli(base).atZone(java.time.ZoneId.of("UTC")).toLocalDate()
                        onPick(day.atTime(11, 0).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli())
                    }
                }) { Text("Set") }
            },
            dismissButton = { TextButton(onClick = { showPicker = false }) { Text("Cancel") } },
        ) { DatePicker(state = dps) }
    }
}

// ════════════════════════════════════════════════════════════
//  The prompt host
// ════════════════════════════════════════════════════════════

@Composable
fun AssistantPromptSheet(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val ask = app.assistantAsk ?: return
    when (ask.kind) {
        "visit_check" -> VisitCheckPrompt(vm, ask)
        "callback_check" -> CallbackCheckPrompt(vm, ask)
        "day_review" -> DayReviewPrompt(vm, ask)
    }
}

// ────────────────────────────────────────────────────────────
//  1. "The visit was Tuesday. Did they come?"
// ────────────────────────────────────────────────────────────
//
// The highest-value unanswered question in the CRM. A lead parked on
// "site_visit" counts as QUALIFIED in the ad report, so every visit nobody
// confirms is an ad-spend decision resting on a guess — and the rep is the only
// person who knows.
//
// The "yes" branch then asks for something the app has never had: the rep's own
// read on how close the deal is. A stage cannot carry that. Two leads both sat
// at "negotiating" can be 20% and 85%, and only the person who met them knows
// which. Written down, it sorts the pipeline honestly — and, months later, it
// says whether this particular rep's optimism can be trusted.
@Composable
private fun VisitCheckPrompt(vm: MainViewModel, ask: AssistantAsk) {
    // ask → came | absent → token | why | when
    //
    // Three taps to the end of every path, and the whole thing has to finish in
    // under fifteen seconds. Past that, reps stop answering honestly and start
    // answering fast, and a fast lie is worse than a blank.
    //
    // EVERY OUTCOME BUTTON IS THE SAME COLOUR. A green "Booked" next to a red
    // "Didn't work out" tells the rep which answer the app is hoping for, and
    // they will drift towards it — which quietly poisons the one dataset the
    // company is about to make pricing decisions from. Neutral is not a styling
    // choice here, it is the data-integrity feature.
    var step by remember { mutableStateOf("ask") }
    var token by remember { mutableStateOf("") }
    var otherNote by remember { mutableStateOf("") }
    // Which alive-branch the date screen was reached from.
    var whenFor by remember { mutableStateOf("thinking") }
    val who = ask.name ?: ask.phone ?: return

    AlertDialog(
        onDismissRequest = { vm.assistantDismiss() },
        title = {
            AssistantHeader(
                emoji = when (step) { "token" -> "💰"; "why" -> "🤔"; "when" -> "📅"; else -> "🏠" },
                title = when (step) {
                    "came", "absent" -> "What happened?"
                    "token" -> "How much token?"
                    "why" -> "What was the reason?"
                    "when" -> "When will you call them?"
                    else -> "Did they come?"
                },
                who = who,
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                when (step) {
                    "ask" -> {
                        ContextStrip(
                            buildString {
                                append("You booked this visit ")
                                append(ask.whenLabel)
                                ask.project?.takeIf { it.isNotBlank() }?.let { append(" at $it") }
                                append(". Nobody has said what happened.")
                            },
                        )
                        Spacer(Modifier.height(14.dp))
                        Text("Did $who come to the site?",
                            style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("This is the one thing the office can't see from here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        Choice("Yes, they came", VisitNeutral, Modifier.fillMaxWidth()) { step = "came" }
                        Spacer(Modifier.height(8.dp))
                        Choice("No, they didn't", VisitNeutral, Modifier.fillMaxWidth()) { step = "absent" }
                        Spacer(Modifier.height(8.dp))
                        // A real answer, not a dismissal. The rep often does not
                        // know the same evening, and forcing a guess is how the
                        // table fills up with confident nonsense. Logged, so the
                        // lead surfaces to the manager if it stays unanswered.
                        Choice("Not yet — I'll find out", VisitNeutral, Modifier.fillMaxWidth()) {
                            vm.assistantVisitUnknown()
                        }
                    }

                    "came" -> {
                        Text("They came. What happened?",
                            style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("One tap. This is the answer the whole company is waiting on.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        ChoiceGrid(
                            listOf(
                                Triple("Booked", VisitNeutral, { step = "token" }),
                                Triple("Still thinking", VisitNeutral, { whenFor = "thinking"; step = "when" }),
                                Triple("Needs follow-up", VisitNeutral, { whenFor = "follow_up"; step = "when" }),
                                Triple("Didn't work out", VisitNeutral, { step = "why" }),
                            ),
                        )
                        TextButton(onClick = { step = "ask" }) { Text("Back") }
                    }

                    "absent" -> {
                        Text("What happened?",
                            style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("The visit date gets cleared and the lead stays with you.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        ChoiceGrid(
                            listOf(
                                Triple("No show", VisitNeutral, { vm.assistantVisitOutcome("no_show") }),
                                Triple("They cancelled", VisitNeutral, { vm.assistantVisitOutcome("cancelled") }),
                                Triple("Moved to a new date", VisitNeutral, { whenFor = "rescheduled"; step = "when" }),
                                Triple("Couldn't reach them", VisitNeutral, { vm.assistantVisitOutcome("not_reachable") }),
                            ),
                        )
                        TextButton(onClick = { step = "ask" }) { Text("Back") }
                    }

                    // The money, in one tap for the usual figures.
                    //
                    // Skippable on purpose. A rep closing a deal at 9pm may not
                    // know the exact number, and a form that refuses to save is
                    // a form that sends the booking back to paper — where the
                    // company has kept all of them so far. It says what the
                    // blank costs and lets them through.
                    "token" -> {
                        Text("How much token did they pay?",
                            style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("The owner's daily report counts this. Blank shows the sale as ₹0.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        ChoiceGrid(
                            listOf(
                                Triple("₹50,000", VisitNeutral, { vm.assistantVisitOutcome("booked", tokenAmount = 50_000.0) }),
                                Triple("₹1 lakh", VisitNeutral, { vm.assistantVisitOutcome("booked", tokenAmount = 100_000.0) }),
                                Triple("₹2 lakh", VisitNeutral, { vm.assistantVisitOutcome("booked", tokenAmount = 200_000.0) }),
                                Triple("₹5 lakh", VisitNeutral, { vm.assistantVisitOutcome("booked", tokenAmount = 500_000.0) }),
                            ),
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            token, { token = it.filter { ch -> ch.isDigit() } },
                            label = { Text("Or type the amount") },
                            leadingIcon = { Text("₹", style = MaterialTheme.typography.titleMedium) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { vm.assistantVisitOutcome("booked") }, modifier = Modifier.weight(1f)) {
                                Text("Skip for now")
                            }
                            Button(
                                onClick = { vm.assistantVisitOutcome("booked", tokenAmount = token.toDoubleOrNull()) },
                                enabled = token.isNotBlank(),
                                modifier = Modifier.weight(1f),
                            ) { Text("Save") }
                        }
                    }

                    "why" -> {
                        Text("What was the reason?",
                            style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("This is the sentence that tells the owner whether it's the price or the project.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        ChoiceGrid(
                            listOf(
                                Triple("Price", VisitNeutral, { vm.assistantVisitOutcome("price") }),
                                Triple("Location", VisitNeutral, { vm.assistantVisitOutcome("location") }),
                                Triple("Family discussion", VisitNeutral, { vm.assistantVisitOutcome("family") }),
                                Triple("Finance / loan", VisitNeutral, { vm.assistantVisitOutcome("finance") }),
                                Triple("Went to a competitor", VisitNeutral, { vm.assistantVisitOutcome("competitor") }),
                                Triple("Trust", VisitNeutral, { vm.assistantVisitOutcome("trust") }),
                            ),
                        )
                        Spacer(Modifier.height(10.dp))
                        // Other costs a sentence. An escape hatch cheaper than
                        // the truth becomes 90% of the data inside a fortnight,
                        // and then none of the six buttons above mean anything.
                        OutlinedTextField(
                            otherNote, { otherNote = it },
                            label = { Text("Something else? Write it here") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(6.dp))
                        Button(
                            onClick = { vm.assistantVisitOutcome("other", note = otherNote) },
                            enabled = otherNote.trim().length >= 3,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Save reason") }
                        TextButton(onClick = { step = "came" }) { Text("Back") }
                    }

                    // Never optional. 146 active leads already sit with no next
                    // step booked — the largest leak in the pipeline — and every
                    // one of them got there by someone leaving this screen
                    // without a date. There is no skip button here on purpose.
                    else -> DayChips(
                        headline = "When will you call $who?",
                        onPick = { millis ->
                            vm.assistantVisitOutcome(
                                outcome = whenFor,
                                nextDueMillis = millis,
                            )
                        },
                        onBack = { step = "ask" },
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            if (step == "ask") TextButton(onClick = { vm.assistantDismiss() }) { Text("Not now") }
        },
    )
}

/** The 0-100 forecast, said back in words a rep would actually use. */
private fun closeBand(pct: Int): Pair<String, Color> = when {
    pct <= 20 -> "Just looking" to WarmSlate
    pct <= 40 -> "Early — needs work" to Sea
    pct <= 60 -> "Real interest" to Brass
    pct <= 80 -> "Strong — keep pushing" to Plum
    else -> "Almost done — close it" to Jade
}

// ────────────────────────────────────────────────────────────
//  2. "That callback was due. Did you call?"
// ────────────────────────────────────────────────────────────
//
// A callback going red is not information — the rep can see red. What nobody
// can see is WHY it stayed red, and that is the only part worth asking about.
//
// So "not yet" is never treated as a failure. It is treated as a scheduling
// problem with four honest answers, each of which books a real new time. The
// callback moves instead of rotting, and the reason behind it is kept: a rep
// who answers "busy" on every callback and one who answers "not reachable" are
// two completely different conversations for their manager to have.
@Composable
private fun CallbackCheckPrompt(vm: MainViewModel, ask: AssistantAsk) {
    var step by remember { mutableStateOf("ask") }
    val who = ask.name ?: ask.phone ?: return

    AlertDialog(
        onDismissRequest = { vm.assistantDismiss() },
        title = {
            AssistantHeader(
                emoji = if (step == "ask") "⏰" else "🗓️",
                title = if (step == "ask") "Callback is late" else "No problem — when?",
                who = who,
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (step == "ask") {
                    ContextStrip("$who's callback was due ${ask.whenLabel}.", Terracotta)
                    ask.why?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(8.dp))
                        ContextStrip("📝 $it", Sea)
                    }
                    Spacer(Modifier.height(14.dp))
                    Text("Have you called them?",
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(10.dp))
                    Choice("✅  Yes, I called", Jade, Modifier.fillMaxWidth(),
                        sub = "Say what happened") { vm.assistantCallbackCalled() }
                    Spacer(Modifier.height(8.dp))
                    Choice("⏳  Not yet", Brass, Modifier.fillMaxWidth(),
                        sub = "Pick a new time") { step = "why" }
                } else {
                    Text("What's the plan for $who?",
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("Whatever you pick, the callback moves — it won't just sit there red.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    Choice("⏳  I'm busy right now", Brass, Modifier.fillMaxWidth(),
                        sub = "Remind me in 30 minutes") { vm.assistantCallbackNotYet("busy") }
                    Spacer(Modifier.height(8.dp))
                    Choice("🌆  I'll call this evening", Sea, Modifier.fillMaxWidth(),
                        sub = "Moves to 6 PM") { vm.assistantCallbackNotYet("evening") }
                    Spacer(Modifier.height(8.dp))
                    Choice("📵  Number isn't reachable", Plum, Modifier.fillMaxWidth(),
                        sub = "Try again in 2 hours") { vm.assistantCallbackNotYet("not_reachable") }
                    Spacer(Modifier.height(8.dp))
                    Choice("🕘  Wrong time to call them", WarmSlate, Modifier.fillMaxWidth(),
                        sub = "Moves to tomorrow 11 AM") { vm.assistantCallbackNotYet("wrong_time") }
                    Spacer(Modifier.height(4.dp))
                    TextButton(onClick = { step = "ask" }) { Text("Back") }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            if (step == "ask") TextButton(onClick = { vm.assistantDismiss() }) { Text("Not now") }
        },
    )
}

// ────────────────────────────────────────────────────────────
//  3. The day review — once, after 7pm
// ────────────────────────────────────────────────────────────
//
// The only prompt that isn't about a single lead. It shows the rep their own
// day back to them — which nobody does, because the leaderboard shows them
// their day against everyone else's, and that is a different (worse) feeling.
//
// Then one question, and it is not a performance question: what got in the way?
// A week of "numbers not reachable" from one rep is a data-quality problem, not
// a discipline problem, and it is invisible unless somebody asks.
@Composable
private fun DayReviewPrompt(vm: MainViewModel, ask: AssistantAsk) {
    val app by vm.state.collectAsState()
    val review = app.dayReview
    AlertDialog(
        onDismissRequest = { vm.assistantDismiss() },
        title = { AssistantHeader("🌙", "That's your day", "Quick look before you close") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                // The score sits above the counters because it is the one line a
                // rep repeats to themselves on the way home. It is arithmetic on
                // their own call list, not an opinion — connect rate, real
                // conversations, visits fixed, bookings — so the sub-line says
                // what it is made of and they can check it.
                review?.score?.let { s -> DayScore(s, review.conversations, review.visitsFixed, review.bookings) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DayStat("📞", ask.calls.toString(), "Calls", Jade, Modifier.weight(1f))
                    DayStat("🗣️", ask.connected.toString(), "Talked", Sea, Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DayStat("⭐", ask.interested.toString(), "Interested", Brass, Modifier.weight(1f))
                    DayStat("🏠", ask.visitsBooked.toString(), "Visits ahead", Plum, Modifier.weight(1f))
                }

                // Praise first, and only for things that actually happened —
                // the coach is told to base every line on the day's real call
                // summaries, never on the counters printed right above it.
                review?.wins?.takeIf { it.isNotEmpty() }?.let { wins ->
                    Spacer(Modifier.height(14.dp))
                    Text("🏆 What you did well",
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    wins.forEach { w ->
                        Text("✅  $w", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                // The habit, then the words. A rep told "improve your closing"
                // changes nothing; a rep handed the sentence to say tomorrow
                // morning can use it on their first call. Absent entirely when
                // the day showed no repeated weakness — an invented fault is
                // how a coaching card stops being read.
                review?.improve?.let { imp ->
                    Spacer(Modifier.height(14.dp))
                    Text("⚠️ One thing to fix",
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(imp.pattern, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (imp.say.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(Sea.copy(alpha = 0.10f))
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                        ) {
                            Column {
                                Text("Kal ye bolkar dekhiye",
                                    style = MaterialTheme.typography.labelSmall, color = Sea)
                                Text("“${imp.say}”", style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }

                // The day's range, both ends together. Shown as a pair on
                // purpose: the worst call never appears on its own, so a rep
                // opening this is always reminded of their best one in the same
                // glance. Neither is a fresh judgement — both quote the rating
                // and the line the coach already wrote on that call.
                if (review?.bestCall != null || review?.worstCall != null) {
                    Spacer(Modifier.height(14.dp))
                    Text("🎧 Aaj ki calls",
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    review.bestCall?.let { CallOfDay("🏆", "Best call", it.lead, it.rating, it.why, Jade) }
                    review.worstCall?.let { CallOfDay("📉", "Sabse kamzor", it.lead, it.rating, it.why, Brass) }
                }

                // Two names, not a list. This is the last thing a rep reads
                // before they close the app, and it has to survive the night.
                review?.priorities?.takeIf { it.isNotEmpty() }?.let { picks ->
                    Spacer(Modifier.height(14.dp))
                    Text("🎯 Kal sabse pehle",
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    picks.take(2).forEach { p ->
                        Text("• ${p.lead}", style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold)
                        Text("   ${p.why}", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (ask.notUpdated > 0) {
                    Spacer(Modifier.height(10.dp))
                    // The one actionable thing on this screen, and the only one
                    // that costs the rep something tomorrow if it's left.
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(Terracotta.copy(alpha = 0.12f))
                            .border(1.dp, Terracotta.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .clickable { vm.assistantFixFirstUnupdated() }
                            .padding(horizontal = 12.dp, vertical = 11.dp),
                    ) {
                        Column {
                            Text("${ask.notUpdated} call${if (ask.notUpdated == 1) "" else "s"} with no outcome",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold, color = Terracotta)
                            Text("Tomorrow these look like leads nobody touched. Tap to fix the first one.",
                                style = MaterialTheme.typography.bodySmall, color = Terracotta.copy(alpha = 0.85f))
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                Text("What slowed you down today?",
                    style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text("Honest answer — it only goes to your own coaching.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                ChoiceGrid(
                    listOf(
                        Triple("👍  Nothing —\ngood day", Jade, { vm.assistantDayReviewAnswer("good_day") }),
                        Triple("📵  Numbers not\nreachable", Sea, { vm.assistantDayReviewAnswer("not_reachable") }),
                        Triple("🧊  Leads weren't\nserious", Brass, { vm.assistantDayReviewAnswer("leads_not_serious") }),
                        Triple("🗂️  Too many\nfollow-ups", Plum, { vm.assistantDayReviewAnswer("too_many_followups") }),
                        Triple("🙏  Personal\nreason", WarmSlate, { vm.assistantDayReviewAnswer("personal") }),
                    ),
                )
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = { vm.assistantDismiss() }) { Text("Close") } },
    )
}

/** One end of the day's call range. "Sabse kamzor", never "worst" — the label a
 *  rep reads about their own work should describe the call, not sentence them. */
@Composable
private fun CallOfDay(emoji: String, label: String, lead: String?, rating: Int, why: String?, tone: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(emoji, fontSize = 14.sp)
        Spacer(Modifier.width(8.dp))
        Column {
            Text("$label · ${lead ?: "lead"} · ${"★".repeat(rating.coerceIn(0, 5))}",
                style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = tone)
            if (!why.isNullOrBlank()) {
                Text(why, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/**
 * The day out of ten, with what it is made of written underneath.
 *
 * A score with no explanation is a score a rep argues with once and then stops
 * reading. Every part of this is countable off their own call list: how many
 * people picked up, how many of those were real conversations, visits fixed,
 * bookings. Deliberately not a rank against the team — this card is theirs.
 */
@Composable
private fun DayScore(score: Double, conversations: Int, visitsFixed: Int, bookings: Int) {
    val stars = (score / 2).roundToInt().coerceIn(0, 5)
    val tone = when {
        score >= 7.5 -> Jade
        score >= 5 -> Brass
        else -> Terracotta
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(tone.copy(alpha = 0.10f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("★".repeat(stars) + "☆".repeat(5 - stars), fontSize = 15.sp, color = tone)
        Spacer(Modifier.height(2.dp))
        Text("${"%.1f".format(score)}/10",
            style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = tone)
        Text(
            buildList {
                add("$conversations real ${if (conversations == 1) "conversation" else "conversations"}")
                if (visitsFixed > 0) add("$visitsFixed visit${if (visitsFixed == 1) "" else "s"} fixed")
                if (bookings > 0) add("$bookings booking${if (bookings == 1) "" else "s"}")
            }.joinToString(" · "),
            style = MaterialTheme.typography.labelSmall, color = tone.copy(alpha = 0.85f),
        )
    }
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun DayStat(emoji: String, value: String, label: String, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).background(color.copy(alpha = 0.10f))
            .padding(vertical = 11.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 16.sp)
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = color.copy(alpha = 0.8f))
    }
}

// ════════════════════════════════════════════════════════════
//  The nudge bar — what replaced the late post-call popup
// ════════════════════════════════════════════════════════════
//
// One line above the bottom bar naming the person who was just called, with the
// same Update button as everywhere else, shaking. It is the whole of the
// replacement: the rep is told a call needs writing up, in a way they can
// finish in one tap or ignore for thirty seconds without fighting a modal.
//
// It cannot be swiped away, and that is deliberate. The old popup was the only
// thing stopping a connected call from silently leaving the lead in New; take
// the popup away and something has to hold that line. This does — quietly,
// until the call has an outcome.
@Composable
fun PendingUpdateBar(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val pending = app.pendingUpdates.lastOrNull() ?: return
    val who = pending.name ?: pending.phone
    val glow = pulseAlpha()

    Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.5.dp, Brass.copy(alpha = glow + 0.35f), RoundedCornerShape(16.dp))
                .clickable { vm.openPendingUpdate(pending) }
                .padding(horizontal = 13.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(34.dp).clip(CircleShape).background(Brass.copy(alpha = glow)),
                contentAlignment = Alignment.Center,
            ) { Text(if (pending.connected) "📝" else "📵", fontSize = 15.sp) }
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (pending.connected) "You just spoke to $who" else "No answer from $who",
                    style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1,
                )
                Text(
                    if (app.pendingUpdates.size > 1)
                        "${app.pendingUpdates.size} calls waiting — tap to write them up"
                    else "Tap Update to say what happened",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                )
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.nudgeShake(true)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Brass)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text("Update", style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold, color = Color.White)
            }
        }
    }
}

/**
 * "Put that back" — the way out of a mis-tapped outcome.
 *
 * The founder's question was exact: "update pr koi galti se wrong number daba
 * de to vo back kaise hoga?" It could not be. Wrong number files the lead as
 * `invalid` — terminal, sort 99, `rep_visible = false` — so one wrong tap made
 * a real lead disappear from the rep's list with no route back from anywhere in
 * the app. The same is true, less brutally, of Not interested and Do not call.
 *
 * A confirm dialog on every tap was the wrong fix. Reps answer this two hundred
 * times a day and the answer is usually right; making all of them pay for the
 * rare mistake is how a fast screen becomes a slow one. This costs nothing when
 * the tap was right and one tap when it was not.
 *
 * It lives above the bottom bar, beside PendingUpdateBar, so it follows the rep
 * to whatever screen the outcome sent them to — which is the whole problem with
 * an undo that lives on the sheet: the sheet has already closed.
 *
 * Twelve seconds. Long enough to read what just happened and react, short
 * enough that it is gone before it becomes furniture.
 */
@Composable
fun UndoOutcomeBar(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val undo = app.undo ?: return

    // Keyed on the record itself: a second outcome inside the window restarts
    // the clock on the new one rather than inheriting the old one's remaining
    // time and vanishing early.
    LaunchedEffect(undo.contactId, undo.at) {
        kotlinx.coroutines.delay(12_000)
        if (vm.state.value.undo?.at == undo.at) vm.clearUndo()
    }

    Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                .background(AppColors.TextPrimary)
                .padding(start = 14.dp, end = 6.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Marked ${undo.label}",
                    style = AppType.metaStrong, color = Color.White, maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                undo.name?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it, style = AppType.tag, color = Color.White.copy(alpha = 0.7f),
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.clip(RoundedCornerShape(9.dp))
                    .clickable { vm.undoLastOutcome() }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text("Undo", style = AppType.label, color = AppColors.Canvas, maxLines = 1)
            }
        }
    }
}
