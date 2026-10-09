package com.salesautocall.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.RecordVoiceOver
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.Contact
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.CoachOrb
import com.salesautocall.app.ui.design.IosColors
import com.salesautocall.app.ui.design.IosSeparator
import com.salesautocall.app.ui.design.IosTag
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.iosPress
import com.salesautocall.app.ui.design.rememberHaptics
import kotlinx.coroutines.delay

/**
 * THE AI COACH — one card, opened by the rep, never a popup.
 *
 * It lives on Home (and a smaller version on the lead page). It says three
 * things, all from data the product already has:
 *
 *   1. Did the site visit happen?   — past visits nobody has answered. Yes /
 *      No / Rescheduled write through the SAME functions Home's "did they
 *      come?" rows and the assistant already use. This waits quietly in the
 *      card; it never opens the card by itself. (82 visits agreed on calls,
 *      11 ever recorded — this is the button that closes that gap.)
 *   2. Last call                    — rep-coach's own good / improve / rating
 *      for the latest scored call, plus the company's playbook reply for that
 *      objection, word for word. No score → it says so.
 *   3. Learning time                — the weak spot the coach keeps naming
 *      across recent calls, with the matching playbook reply. Once a day,
 *      "Got it" closes it until tomorrow.
 *
 * WHEN IT OPENS ITSELF (the founder's rule: help, not pressure). Collapsed by
 * default. It may expand in place — no sound, no vibration, no dialog — only
 * when ALL hold: the rep is on Home, nothing is on a call, no dialler or
 * Call-all queue is running, no sheet or question is open, the app has been
 * in front of them for 3 quiet minutes, it has not opened itself in the last
 * 3 hours, and it has something NEW (a newly scored call, or today's Learning
 * time not yet seen). This is not a scheduler: it fires nothing, posts no
 * notification, and only changes a card the rep is already looking at.
 */

/** One past site visit waiting on "did it happen?". */
data class CoachVisit(
    val contactId: String,
    val phone: String,
    val name: String,
    val project: String?,
    val whenLabel: String,
)

private const val REVEAL_GAP_MS = 3 * 3600_000L

@Composable
internal fun HomeCoachCard(
    vm: MainViewModel,
    app: AppState,
    visits: List<CoachVisit>,
    leadsById: Map<String?, Contact>,
) {
    val context = LocalContext.current
    val haptics = rememberHaptics()
    val today = remember { java.time.LocalDate.now().toString() }
    val insight = remember(app.coachFeed, app.coachPlaybook, app.memoryByLead, leadsById) {
        lastCallInsight(
            app.coachFeed,
            leadName = { id -> leadsById[id]?.let { prettyName(it.name) ?: it.phone } },
            memoryFor = { id -> id?.let { app.memoryByLead[it] } },
            playbook = app.coachPlaybook,
        )
    }
    val learning = remember(app.coachFeed, app.coachPlaybook) { learningTip(app.coachFeed, app.coachPlaybook) }
    var learningDone by remember { mutableStateOf(AppPrefs.getLearningDoneDay(context) == today) }
    val showLearning = learning != null && !learningDone
    var expanded by rememberSaveable { mutableStateOf(false) }
    val newCall = insight != null && insight.callId != AppPrefs.getCoachSeenCall(context)

    // Expand on its own only when the rep is idle — see the header comment.
    LaunchedEffect(insight?.callId, learning?.theme?.code, learningDone) {
        while (!expanded) {
            delay(20_000L)
            if (expanded) break
            if (!vm.coachIdleNow()) continue
            val now = System.currentTimeMillis()
            if (now - AppPrefs.getCoachRevealAt(context) < REVEAL_GAP_MS) continue
            val callIsNew = insight != null && insight.callId != AppPrefs.getCoachSeenCall(context)
            val learningIsNew = learning != null && !learningDone && AppPrefs.getLearningShownDay(context) != today
            if (!callIsNew && !learningIsNew) continue
            AppPrefs.setCoachRevealAt(context, now)
            insight?.let { AppPrefs.setCoachSeenCall(context, it.callId) }
            if (learningIsNew) AppPrefs.setLearningShownDay(context, today)
            expanded = true
        }
    }

    val summary = buildList {
        if (visits.isNotEmpty()) add(if (visits.size == 1) "1 visit to check" else "${visits.size} visits to check")
        insight?.rating?.let { add("Last call $it/5") }
        if (showLearning) add("Learning time")
    }.joinToString(" · ").ifBlank {
        when {
            app.coachFeedError != null -> "Couldn't load right now"
            !app.coachFeedLoaded -> "Getting your notes…"
            else -> "Tips appear after a scored call"
        }
    }
    val chevron by animateFloatAsState(if (expanded) 180f else 0f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMediumLow), label = "chev")

    Column(Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)) {
        Row(
            Modifier.fillMaxWidth()
                .iosPress(scaleTo = 0.985f) {
                    expanded = !expanded
                    if (expanded) insight?.let { AppPrefs.setCoachSeenCall(context, it.callId) }
                }
                .padding(horizontal = Space.l, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoachOrb(size = 46.dp, active = newCall || visits.isNotEmpty() || showLearning)
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text("Coach", style = AppType.headline, color = AppColors.TextPrimary)
                Text(summary, style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.Default.KeyboardArrowDown, contentDescription = if (expanded) "Close coach" else "Open coach",
                tint = AppColors.TextTertiary, modifier = Modifier.size(24.dp).rotate(chevron))
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow)) + fadeIn(),
            exit = shrinkVertically(spring(stiffness = Spring.StiffnessMedium)) + fadeOut(),
        ) {
            Column(Modifier.fillMaxWidth()) {
                visits.firstOrNull()?.let { v ->
                    IosSeparator()
                    VisitCheckBlock(
                        v, more = visits.size - 1,
                        onYes = { vm.answerVisitHappened(v.contactId, v.phone, v.name, true) },
                        onNo = { vm.answerVisitHappened(v.contactId, v.phone, v.name, false) },
                        onMoved = { ms -> vm.coachVisitRescheduled(v.contactId, v.phone, v.name, ms) },
                        onOpen = { vm.openLeadDetail(v.contactId) },
                    )
                }
                IosSeparator()
                LastCallBlock(
                    insight = insight,
                    loaded = app.coachFeedLoaded,
                    error = app.coachFeedError,
                    onOpenLead = { id -> vm.openLeadDetail(id) },
                )
                if (showLearning && learning != null) {
                    IosSeparator()
                    LearningBlock(learning) {
                        haptics.confirm()
                        AppPrefs.setLearningDoneDay(context, today)
                        learningDone = true
                    }
                }
            }
        }
    }
}

// ── Pieces, shared by Home and the lead page ─────────────────────

@Composable
private fun BlockHeader(icon: ImageVector, tint: Color, title: String, trailing: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(title.uppercase(), style = AppType.sectionLabel, color = AppColors.TextSecondary, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

/** A small tinted button, equal width in a row (Yes / No / Rescheduled). */
@Composable
private fun CoachButton(label: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.heightIn(min = 40.dp).clip(Radii.control).background(tint.copy(alpha = 0.12f))
            .iosPress(scaleTo = 0.95f) { onClick() }.padding(horizontal = 8.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, style = AppType.label, color = tint, maxLines = 1, textAlign = TextAlign.Center) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VisitCheckBlock(
    v: CoachVisit,
    more: Int,
    onYes: () -> Unit,
    onNo: () -> Unit,
    onMoved: (Long) -> Unit,
    onOpen: (() -> Unit)?,
) {
    var picking by remember(v.contactId) { mutableStateOf(false) }
    var calendar by remember(v.contactId) { mutableStateOf(false) }
    fun at(days: Long) = java.time.ZonedDateTime.now().plusDays(days)
        .withHour(11).withMinute(0).withSecond(0).withNano(0).toInstant().toEpochMilli()
    Column(Modifier.fillMaxWidth().padding(Space.l)) {
        BlockHeader(Icons.Outlined.CheckCircle, IosColors.Orange, "Site visit check")
        Spacer(Modifier.height(8.dp))
        Text("Did the site visit happen?", style = AppType.headline, color = AppColors.TextPrimary)
        Text(
            listOfNotNull(v.name, v.project?.takeIf { it.isNotBlank() }, "visit day: ${v.whenLabel}").joinToString(" · "),
            style = AppType.subhead, color = AppColors.TextSecondary,
            modifier = if (onOpen != null) Modifier.iosPress(haptic = false) { onOpen() } else Modifier,
        )
        Spacer(Modifier.height(10.dp))
        if (!picking) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CoachButton("Yes", IosColors.Green, Modifier.weight(1f), onYes)
                CoachButton("No", IosColors.Red, Modifier.weight(1f), onNo)
                CoachButton("Rescheduled", IosColors.Blue, Modifier.weight(1.3f)) { picking = true }
            }
        } else {
            Text("New visit day (11 AM)", style = AppType.footnote, color = AppColors.TextSecondary)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CoachButton("Tomorrow", IosColors.Blue, Modifier.weight(1f)) { picking = false; onMoved(at(1)) }
                CoachButton("In 3 days", IosColors.Blue, Modifier.weight(1f)) { picking = false; onMoved(at(3)) }
                CoachButton("Pick date", IosColors.Blue, Modifier.weight(1f)) { calendar = true }
            }
            TextButton(onClick = { picking = false }) { Text("Back", color = IosColors.Blue) }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            buildString {
                append("Yes and No save to the lead and open its update, so you can book the next step.")
                if (more > 0) append(" $more more after this one.")
            },
            style = AppType.footnote, color = AppColors.TextTertiary,
        )
    }
    if (calendar) {
        val state = rememberDatePickerState(initialSelectedDateMillis = at(1))
        DatePickerDialog(
            onDismissRequest = { calendar = false },
            confirmButton = {
                TextButton(onClick = {
                    val picked = state.selectedDateMillis
                    calendar = false
                    if (picked != null) {
                        // The picker returns UTC midnight of the chosen day; book 11 AM local.
                        val day = java.time.Instant.ofEpochMilli(picked).atZone(java.time.ZoneOffset.UTC).toLocalDate()
                        val ms = day.atTime(11, 0).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                        picking = false
                        onMoved(ms)
                    }
                }) { Text("Save", color = IosColors.Blue) }
            },
            dismissButton = { TextButton(onClick = { calendar = false }) { Text("Cancel", color = IosColors.Blue) } },
        ) { DatePicker(state) }
    }
}

/** The playbook line, quoted, with where it came from. */
@Composable
internal fun SayThisNext(reply: PlaybookReply?, missingNote: String?) {
    if (reply != null) {
        Column(
            Modifier.fillMaxWidth().clip(Radii.control).background(AppColors.IndigoSoft).padding(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.RecordVoiceOver, null, tint = AppColors.Indigo, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(6.dp))
                Text("SAY THIS NEXT TIME", style = AppType.sectionLabel, color = AppColors.Indigo)
            }
            Spacer(Modifier.height(6.dp))
            Text(reply.line, style = AppType.callout, color = AppColors.TextPrimary)
            Spacer(Modifier.height(6.dp))
            Text("From your playbook · ${reply.source}", style = AppType.caption, color = AppColors.TextSecondary,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    } else if (missingNote != null) {
        Text(missingNote, style = AppType.footnote, color = AppColors.TextTertiary)
    }
}

@Composable
private fun LastCallBlock(
    insight: LastCallInsight?,
    loaded: Boolean,
    error: String?,
    onOpenLead: (String) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(Space.l)) {
        BlockHeader(Icons.Outlined.RecordVoiceOver, IosColors.Indigo, "Last call") {
            insight?.rating?.let { r -> IosTag("$r/5", fg = ratingTint(r)) }
        }
        Spacer(Modifier.height(8.dp))
        when {
            insight == null && error != null -> Text(error, style = AppType.subhead, color = AppColors.Danger)
            insight == null && !loaded -> Text("Getting your coach notes…", style = AppType.subhead, color = AppColors.TextSecondary)
            insight == null -> Text(
                "No scored call yet. The coach scores calls of 30 seconds or more once the recording has a transcript.",
                style = AppType.subhead, color = AppColors.TextSecondary,
            )
            else -> {
                val who = listOfNotNull(insight.leadName, coachAgo(insight.atIso)).joinToString(" · ")
                if (who.isNotBlank()) {
                    Text(
                        who, style = AppType.footnote,
                        color = if (insight.leadId != null) IosColors.Blue else AppColors.TextSecondary,
                        modifier = insight.leadId?.let { id -> Modifier.iosPress(haptic = false) { onOpenLead(id) } } ?: Modifier,
                    )
                    Spacer(Modifier.height(6.dp))
                }
                insight.good?.let { CoachLine(Icons.Outlined.CheckCircle, IosColors.Green, "Done well", it) }
                insight.improve?.let {
                    Spacer(Modifier.height(8.dp))
                    CoachLine(Icons.Outlined.Lightbulb, IosColors.Orange, "Try next time", it)
                }
                if (insight.improve == null && (insight.rating ?: 0) >= 4) {
                    Spacer(Modifier.height(6.dp))
                    Text("Great call. Keep going like this.", style = AppType.callout.copy(fontWeight = FontWeight.SemiBold), color = AppColors.Indigo)
                }
                if (insight.improve != null) {
                    Spacer(Modifier.height(10.dp))
                    SayThisNext(insight.reply, "Your company playbook has no reply for this yet. Your admin can add one on the AI Coach page.")
                }
            }
        }
    }
}

@Composable
private fun CoachLine(icon: ImageVector, tint: Color, label: String, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 2.dp).size(22.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(14.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = AppType.caption, color = AppColors.TextSecondary)
            Text(text, style = AppType.callout, color = AppColors.TextPrimary)
        }
    }
}

@Composable
private fun LearningBlock(tip: LearningTip, onDone: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(Space.l)) {
        BlockHeader(Icons.Outlined.Lightbulb, IosColors.Yellow, "Learning time · 1 min") {
            Text("Got it", style = AppType.label, color = IosColors.Blue,
                modifier = Modifier.clip(Radii.tag).iosPress { onDone() }.padding(horizontal = 8.dp, vertical = 4.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(tip.theme.label, style = AppType.headline, color = AppColors.TextPrimary)
        Text(
            "The coach raised this on ${tip.times} of your last ${tip.outOf} scored calls.",
            style = AppType.subhead, color = AppColors.TextSecondary,
        )
        if (tip.example.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            // Plain Box + Text only under IntrinsicSize — no SubcomposeLayout.
            Row(Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
                Box(Modifier.width(3.dp).fillMaxHeight().clip(Radii.tag).background(IosColors.Gray2))
                Spacer(Modifier.width(10.dp))
                Text("\u201C${tip.example}\u201D", style = AppType.callout.copy(fontStyle = FontStyle.Italic), color = AppColors.TextSecondary)
            }
        }
        Spacer(Modifier.height(10.dp))
        SayThisNext(tip.reply, if (tip.theme.objection) "Your company playbook has no reply for this yet." else null)
    }
}

internal fun ratingTint(r: Int): Color = when {
    r >= 4 -> AppColors.Positive
    r == 3 -> AppColors.Warning
    else -> AppColors.Danger
}

internal fun coachAgo(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val ms = runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
        .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
        .getOrNull() ?: return null
    val min = (System.currentTimeMillis() - ms) / 60_000
    return when {
        min < 1 -> "just now"
        min < 60 -> "${min}m ago"
        min < 1440 -> "${min / 60}h ago"
        else -> "${min / 1440}d ago"
    }
}
