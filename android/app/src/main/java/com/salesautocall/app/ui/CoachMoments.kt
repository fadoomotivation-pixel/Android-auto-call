package com.salesautocall.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.CaptureHealth
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.dialer.DialerController
import com.salesautocall.app.dialer.SimCallMonitor
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.CoachOrb
import com.salesautocall.app.ui.design.IosColors
import com.salesautocall.app.ui.design.IosSeparator
import com.salesautocall.app.ui.design.PrimaryButton
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.SecondaryButton
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.iosPress
import com.salesautocall.app.ui.design.rememberHaptics
import kotlinx.coroutines.delay

/*
 * Two coach moments, both inline and both easy to close. Neither is a popup,
 * a notification or a scheduled reminder — they are computed from data the
 * app already loads, at the moment the app is open:
 *
 *  - Morning greeting: first open of the day before 1 PM, the first card on
 *    Home. Today's due follow-ups and the ones missed, by name, each with the
 *    last call summary, the latest captured WhatsApp and an opening line.
 *  - Coaching time: after 5+ more calls today, at the first break (no call,
 *    Call-all paused or done), a card slides up above the tab bar. It hides
 *    itself the moment a call starts and never blocks the screen.
 */

private fun localDate(iso: String?): java.time.LocalDate? = iso?.let { iso0 ->
    runCatching { java.time.OffsetDateTime.parse(iso0).atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDate() }
        .recoverCatching { _ -> java.time.Instant.parse(iso0).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }
        .getOrNull()
}

internal data class MorningLead(
    val contactId: String?,
    val name: String,
    val dueLabel: String,
    val missed: Boolean,
)

@Composable
internal fun MorningGreetingCard(vm: MainViewModel, app: AppState, leadsById: Map<String?, Contact>) {
    val haptics = rememberHaptics()
    val today = remember { java.time.LocalDate.now() }
    val pending = remember(app.followUpList) { app.followUpList.filter { it.status == "pending" } }
    val dated = remember(pending) { pending.mapNotNull { fu -> localDate(fu.dueAt)?.let { fu to it } } }
    val dueToday = remember(dated) { dated.filter { it.second == today }.sortedBy { it.first.dueAt } }
    val missed = remember(dated) { dated.filter { it.second.isBefore(today) }.sortedByDescending { it.first.dueAt } }

    fun nameOf(fu: FollowUp): String =
        leadsById[fu.contactId]?.let { prettyName(it.name) ?: it.phone }
            ?: prettyName(fu.name) ?: fu.phone

    val named: List<MorningLead> = remember(dueToday, missed, leadsById) {
        missed.take(3).map { (fu, d) ->
            val label = if (d == today.minusDays(1)) "Missed yesterday" else "Missed since ${d.dayOfMonth} ${d.month.name.take(3).lowercase().replaceFirstChar { it.uppercase() }}"
            MorningLead(fu.contactId, nameOf(fu), label, true)
        } + dueToday.take(3).map { (fu, _) ->
            val t = runCatching {
                java.time.OffsetDateTime.parse(fu.dueAt).atZoneSameInstant(java.time.ZoneId.systemDefault())
                    .toLocalTime().format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))
            }.getOrNull()
            MorningLead(fu.contactId, nameOf(fu), if (t != null) "Due today, $t" else "Due today", false)
        }
    }
    LaunchedEffect(named) { vm.loadMorningContext(named.mapNotNull { it.contactId }) }

    val first = app.profile?.fullName?.trim()?.substringBefore(' ')?.takeIf { it.isNotBlank() }
    val hello = if (first != null) "Good morning, $first!" else "Good morning!"
    // The character "speaks": the greeting types out once.
    var shown by remember { mutableIntStateOf(0) }
    LaunchedEffect(hello) {
        shown = 0
        while (shown < hello.length) { delay(28); shown++ }
    }
    val pop = remember { Animatable(0.6f) }
    LaunchedEffect(Unit) { pop.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessLow)) }

    val plan = when {
        dueToday.isEmpty() && missed.isEmpty() -> "Nothing due today and nothing missed. A clean start."
        else -> buildList {
            if (dueToday.isNotEmpty()) add(if (dueToday.size == 1) "1 follow-up due today" else "${dueToday.size} follow-ups due today")
            if (missed.isNotEmpty()) add(if (missed.size == 1) "1 you missed" else "${missed.size} you missed")
        }.joinToString(", ") + "."
    }
    val waNote = when (val c = app.capture) {
        is CaptureHealth.Snapshot.Down -> "WhatsApp capture is down, so the newest messages may be missing."
        CaptureHealth.Snapshot.Unlinked -> "WhatsApp is not linked on this phone, so no messages are shown."
        else -> null
    }

    Column(Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)) {
        Row(Modifier.fillMaxWidth().padding(start = Space.l, end = 6.dp, top = 14.dp), verticalAlignment = Alignment.Top) {
            CoachOrb(size = 52.dp, active = true, face = true, modifier = Modifier.scale(pop.value))
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f).padding(top = 2.dp)) {
                Text(hello.take(shown), style = AppType.title3, color = AppColors.TextPrimary)
                Spacer(Modifier.height(2.dp))
                Text("Today's plan: $plan", style = AppType.subhead, color = AppColors.TextSecondary)
            }
            Icon(
                Icons.Default.Close, contentDescription = "Close greeting", tint = AppColors.TextTertiary,
                modifier = Modifier.size(36.dp).clip(Radii.control).iosPress { vm.dismissMorningGreeting() }.padding(8.dp),
            )
        }
        Spacer(Modifier.height(Space.s))
        named.forEach { lead ->
            IosSeparator()
            MorningLeadRow(lead, vm, app)
        }
        val more = (dueToday.size + missed.size) - named.size
        if (more > 0) {
            IosSeparator()
            Text("+$more more in Follow Ups", style = AppType.footnote, color = AppColors.TextSecondary,
                modifier = Modifier.padding(horizontal = Space.l, vertical = 10.dp))
        }
        if (waNote != null) {
            Text(waNote, style = AppType.footnote, color = IosColors.Orange,
                modifier = Modifier.padding(horizontal = Space.l, vertical = 6.dp))
        }
        app.morningCtxError?.let {
            Text(it, style = AppType.footnote, color = AppColors.TextTertiary,
                modifier = Modifier.padding(horizontal = Space.l, vertical = 4.dp))
        }
        Row(Modifier.fillMaxWidth().padding(Space.l), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(Space.s)) {
            named.firstOrNull { it.contactId != null }?.let { top ->
                PrimaryButton("Start with ${top.name.substringBefore(' ')}", modifier = Modifier.weight(1f)) {
                    haptics.confirm()
                    vm.dismissMorningGreeting()
                    vm.openLeadDetail(top.contactId!!)
                }
            }
            SecondaryButton("Got it", modifier = Modifier.weight(1f)) {
                haptics.tap()
                vm.dismissMorningGreeting()
            }
        }
    }
}

@Composable
private fun MorningLeadRow(lead: MorningLead, vm: MainViewModel, app: AppState) {
    val id = lead.contactId
    val summary = id?.let { app.morningSummaries[it] }
    val wa = id?.let { app.morningWhatsApp[it] }
    val memory = id?.let { app.memoryByLead[it] }
    val focus = focusSayLine(app.coachPicks, id)?.removePrefix("Say this: ")?.trim()?.takeIf { it.isNotEmpty() }
    val playbook = if (focus == null) replyForCall(null, memory, app.coachPlaybook) else null
    Column(
        Modifier.fillMaxWidth()
            .then(if (id != null) Modifier.iosPress(scaleTo = 0.99f) { vm.openLeadDetail(id) } else Modifier)
            .padding(horizontal = Space.l, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(lead.name, style = AppType.headline, color = AppColors.TextPrimary, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Spacer(Modifier.width(Space.s))
            Text(lead.dueLabel, style = AppType.caption, color = if (lead.missed) IosColors.Red else IosColors.Blue, maxLines = 1)
        }
        val loading = !app.morningCtxLoaded
        Spacer(Modifier.height(3.dp))
        Text(
            when {
                summary?.summary != null -> "Last call: ${summary.summary.trim().take(180)}"
                memory?.whereWeLeftIt?.isNotBlank() == true -> "Where you left it: ${memory.whereWeLeftIt.trim().take(180)}"
                loading -> "Last call: loading…"
                else -> "Last call: no summary yet."
            },
            style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis,
        )
        val waText = when {
            wa != null -> {
                val who = if (wa.direction?.startsWith("in", ignoreCase = true) == true) "They wrote" else "You wrote"
                val body = wa.body?.trim()?.takeIf { it.isNotEmpty() }
                    ?: if (wa.hasMedia == true) "[${wa.mediaKind ?: "media"}]" else "(empty message)"
                val ago = coachAgo(wa.sentAt)?.let { " ($it)" }.orEmpty()
                "WhatsApp — $who$ago: ${body.take(140)}"
            }
            loading -> "WhatsApp: loading…"
            else -> "WhatsApp: no message captured with them."
        }
        Text(waText, style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(3.dp))
        val opener = focus ?: playbook?.line
        Text(
            if (opener != null) "Open with: \u201C$opener\u201D" else "Open with: no saved line for this lead yet.",
            style = AppType.footnote,
            color = if (opener != null) AppColors.Indigo else AppColors.TextTertiary,
            maxLines = 3, overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Coaching time, above the tab bar. Watches calls only to decide when a
 * break has come; it never shows during a live call or a running queue.
 */
@Composable
internal fun CoachMomentBar(vm: MainViewModel, app: AppState) {
    val haptics = rememberHaptics()
    val dialer by DialerController.state.collectAsState()
    val sim by SimCallMonitor.state.collectAsState()
    val onCall = sim != null || app.cloudCallNumber != null || (dialer.isRunning && !dialer.paused)

    LaunchedEffect(app.signedIn) {
        while (app.signedIn) {
            vm.maybeCoachMoment()
            delay(20_000L)
        }
    }

    val moment = app.coachMoment
    AnimatedVisibility(
        visible = moment != null && !onCall,
        enter = slideInVertically(spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow)) { it } + fadeIn(),
        exit = slideOutVertically(spring(stiffness = Spring.StiffnessMedium)) { it } + fadeOut(),
    ) {
        val m = moment ?: return@AnimatedVisibility
        val pop = remember { Animatable(0.6f) }
        LaunchedEffect(Unit) { haptics.select(); pop.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessLow)) }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = Space.m, vertical = 6.dp)
                .shadow(12.dp, Radii.sheet).clip(Radii.sheet).background(AppColors.Surface)
                .heightIn(max = 360.dp).verticalScroll(rememberScrollState()),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = Space.l, end = 6.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                CoachOrb(size = 44.dp, active = true, face = true, modifier = Modifier.scale(pop.value))
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("Coaching time", style = AppType.headline, color = AppColors.TextPrimary)
                    val avg = m.avg?.let { " · average %.1f/5".format(it) }.orEmpty()
                    Text(
                        (if (m.scored == 1) "Your last scored call today" else "Your last ${m.scored} scored calls today") + avg,
                        style = AppType.footnote, color = AppColors.TextSecondary,
                    )
                }
                Icon(
                    Icons.Default.Close, contentDescription = "Close coaching time", tint = AppColors.TextTertiary,
                    modifier = Modifier.size(36.dp).clip(Radii.control).iosPress { vm.dismissCoachMoment() }.padding(8.dp),
                )
            }
            Column(Modifier.padding(horizontal = Space.l, vertical = Space.s)) {
                m.good?.let {
                    Text("Done well", style = AppType.sectionLabel, color = IosColors.Green)
                    Text(it, style = AppType.subhead, color = AppColors.TextPrimary)
                    Spacer(Modifier.height(Space.s))
                }
                m.improve?.let {
                    Text(m.theme?.let { t -> "Work on: ${t.label}" } ?: "Work on", style = AppType.sectionLabel, color = IosColors.Orange)
                    Text(it, style = AppType.subhead, color = AppColors.TextPrimary)
                    Spacer(Modifier.height(Space.s))
                }
                SayThisNext(
                    m.reply,
                    if (m.theme?.objection == true) "Your company playbook has no reply for this yet. Ask your manager to add one." else null,
                )
            }
            IosSeparator()
            Text(
                "Got it", style = AppType.headline, color = IosColors.Blue,
                modifier = Modifier.fillMaxWidth().iosPress { haptics.tap(); vm.dismissCoachMoment() }.padding(vertical = 12.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}
