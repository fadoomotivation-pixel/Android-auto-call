package com.salesautocall.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.Contact

// Flow's calm palette (light-committed, like the lead detail).
private val FPaper = Color(0xFFF3F4F1)
private val FCard = Color.White
private val FInk = Color(0xFF15171A)
private val FSub = Color(0xFF5A6068)
private val FHair = Color(0xFFE6E8E3)

private fun fJade(dark: Boolean) = if (dark) Color(0xFF2BB894) else Color(0xFF0E7C66)

/** A stage's colour + short label — kept local so Flow stands alone. */
private fun flowStage(status: String): Pair<String, Color> = when (status) {
    "new", "queued" -> "New" to Color(0xFF5B6B8C)
    "called", "no_answer", "busy" -> "Contacted" to Color(0xFF4F46E5)
    "callback", "follow_up" -> "Callback" to Color(0xFF4F46E5)
    "interested" -> "Interested" to Color(0xFFB8863B)
    "site_visit" -> "Site Visit" to Color(0xFF7A5C86)
    "negotiation", "proposal" -> "Negotiation" to Color(0xFF3F8C86)
    "token_paid" -> "Token Paid" to Color(0xFF0D9488)
    "booked" -> "Booked" to Color(0xFF16A34A)
    else -> status.replaceFirstChar { it.uppercase() } to FSub
}

private fun flowMillis(iso: String?): Long? = iso?.let {
    runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
}

/**
 * The one line the rep should open with. Prefer the AI's next-best-action; else
 * a short, human coaching line derived from where the lead is in the pipeline.
 */
private fun flowOpener(c: Contact): String {
    c.aiNextAction?.takeIf { it.isNotBlank() }?.let { return it }
    val budget = c.budget?.takeIf { it.isNotBlank() }?.let { " Budget ~₹$it." } ?: ""
    return when (c.status) {
        "new", "queued" -> "Naya lead — intro do, zaroorat aur budget samjho.$budget"
        "called", "no_answer", "busy" -> "Pehle nahi utha — dobara try, aur WhatsApp pe details bhejo.$budget"
        "callback", "follow_up" -> "Callback ka vaada tha — follow up karo, agla step fix karo.$budget"
        "interested" -> "Interested hai — site visit fix karne ki koshish karo.$budget"
        "site_visit" -> "Visit ka reminder do aur confirm karo. Location bhej do."
        "negotiation", "proposal" -> "Negotiation chal raha hai — best offer rakho, close karo.$budget"
        "token_paid" -> "Token aa gaya — booking complete karvao, documents guide karo."
        else -> "Follow up karo aur agla step fix karo.$budget"
    }
}

/** Priority for the calling order. Higher = call sooner. */
private fun flowRank(c: Contact, dueFollowUpMs: Long?, now: Long): Int {
    var r = when (c.status) {
        "interested" -> 60
        "negotiation", "proposal" -> 55
        "site_visit" -> 50
        "callback", "follow_up" -> 45
        "called", "no_answer", "busy" -> 30
        else -> 25 // new
    }
    r += when (c.temperature) { "hot" -> 30; "warm" -> 12; "cold" -> -10; else -> 0 }
    // A promise due now (or overdue) jumps the queue.
    dueFollowUpMs?.let { if (it <= now) r += 120 }
    // Speed-to-lead: a brand-new lead in the last hour is gold — call within minutes.
    if (c.status in setOf("new", "queued")) {
        val age = flowMillis(c.createdAt)?.let { now - it } ?: Long.MAX_VALUE
        if (age in 0..60 * 60_000L) r += 90 else r += 10
    }
    return r
}

/**
 * FLOW — Steve-Jobs-style guided calling. No list to manage: the app hands the
 * rep one lead at a time, in the smartest order (due promises + fresh leads +
 * heat), with the one line to say and a big Call button. Tap an outcome and the
 * next lead appears. A rhythm, not a chore.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FlowScreen(vm: MainViewModel, onClose: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    val jade = fJade(isSystemInDarkTheme())
    BackHandler { onClose() }
    LaunchedEffect(Unit) { vm.loadLeads(); vm.loadFollowUps() }

    // Build the queue ONCE (when leads first arrive) so dispositions don't reshuffle
    // it mid-session. Excludes closed leads and anything already scheduled for later.
    var queue by remember { mutableStateOf<List<Contact>>(emptyList()) }
    var built by remember { mutableStateOf(false) }
    LaunchedEffect(app.leads.size, app.followUpList.size) {
        if (!built && app.leads.isNotEmpty()) {
            val now = System.currentTimeMillis()
            val dueByContact = HashMap<String, Long>()
            val dueByPhone = HashMap<String, Long>()
            app.followUpList.forEach { f ->
                flowMillis(f.dueAt)?.let { ms ->
                    f.contactId?.let { dueByContact[it] = ms }
                    dueByPhone[f.phone] = ms
                }
            }
            queue = app.leads
                .asSequence()
                .filter { it.status !in setOf("booked", "lost", "not_interested", "dnc") }
                .filter { c ->
                    // Not scheduled for a future moment (call those at their time, not now).
                    val futureVisit = flowMillis(c.siteVisitAt)?.let { it > now } ?: false
                    val due = c.id?.let { dueByContact[it] } ?: dueByPhone[c.phone]
                    val futureCallback = due?.let { it > now } ?: false
                    !futureVisit && !futureCallback
                }
                .sortedByDescending { c ->
                    val due = c.id?.let { dueByContact[it] } ?: dueByPhone[c.phone]
                    flowRank(c, due, now)
                }
                .toList()
            built = true
        }
    }

    var index by remember { mutableIntStateOf(0) }
    var worked by remember { mutableIntStateOf(0) }
    var interested by remember { mutableIntStateOf(0) }

    fun advance() { index += 1 }
    fun call(c: Contact) {
        worked += 1
        if (app.callerdeskCalling) vm.cloudCall(c.phone, c.id, c.campaignId) else vm.dialManual(c.phone)
    }
    fun disposition(c: Contact, status: String) {
        c.id?.let { vm.applyLead(it, status, null, null, null, null, null, null) }
        if (status in setOf("interested", "site_visit", "token_paid", "booked")) interested += 1
        advance()
    }

    val current = queue.getOrNull(index)

    Column(Modifier.fillMaxSize().background(FPaper)) {
        // Top bar
        Row(
            Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 10.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(42.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Close, "Close", tint = FSub)
            }
            Spacer(Modifier.width(2.dp))
            Text("Flow", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = FInk)
            Spacer(Modifier.weight(1f))
            if (queue.isNotEmpty()) Text(
                "${(index).coerceAtMost(queue.size)} / ${queue.size}",
                style = MaterialTheme.typography.titleMedium, color = FSub, fontWeight = FontWeight.SemiBold,
            )
        }
        // Streak
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            StreakStat("$worked", "called", FInk)
            StreakStat("$interested", "interested", jade)
            if (current != null) StreakStat("${(queue.size - index)}", "to go", FSub)
        }

        Spacer(Modifier.height(8.dp))

        if (current == null) {
            FlowDone(built = built, worked = worked, interested = interested, jade = jade, onClose = onClose)
            return@Column
        }

        val (stageLabel, stageColor) = flowStage(current.status)

        // The one lead — big and calm.
        Column(
            Modifier.fillMaxWidth().weight(1f).padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                Modifier.size(88.dp).clip(CircleShape).border(2.dp, stageColor.copy(alpha = 0.5f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text((current.name ?: current.phone).firstOrNull { it.isLetter() }?.uppercaseChar()?.toString() ?: "#",
                    color = stageColor, fontWeight = FontWeight.SemiBold, fontSize = 34.sp)
            }
            Spacer(Modifier.height(16.dp))
            Text(current.name ?: prettyFlowPhone(current.phone), style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold, color = FInk, maxLines = 1, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(stageColor))
                Spacer(Modifier.width(7.dp))
                Text(stageLabel, style = MaterialTheme.typography.labelLarge, color = stageColor, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(10.dp))
                Text(prettyFlowPhone(current.phone), style = MaterialTheme.typography.titleMedium, color = FSub)
            }

            Spacer(Modifier.height(22.dp))
            // "Say this" — the coaching line.
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(FCard)
                    .border(1.dp, FHair, RoundedCornerShape(18.dp)).padding(16.dp),
            ) {
                Text("SAY THIS", style = MaterialTheme.typography.labelSmall, color = jade, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                Spacer(Modifier.height(6.dp))
                Text(flowOpener(current), style = MaterialTheme.typography.bodyLarge, color = FInk, lineHeight = 24.sp)
            }
        }

        // The big Call button + WhatsApp.
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(jade).clickable { call(current) }.padding(vertical = 16.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.Call, null, tint = Color.White, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(9.dp))
                Text("Call ${current.name?.takeIf { it.isNotBlank() } ?: "now"}", color = Color.White,
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(
                Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(FCard).border(1.dp, FHair, RoundedCornerShape(18.dp))
                    .clickable { openFlowWhatsApp(context, current.phone) },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Default.Chat, "WhatsApp", tint = Color(0xFF1FA855), modifier = Modifier.size(22.dp)) }
        }

        // Outcome — one tap sets the disposition AND moves to the next lead.
        Text("How did it go?", style = MaterialTheme.typography.labelMedium, color = FSub,
            modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 8.dp))
        FlowRow(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutcomeChip("😊 Interested", Color(0xFFB8863B)) { disposition(current, "interested") }
            OutcomeChip("🏠 Site visit", Color(0xFF7A5C86)) { disposition(current, "site_visit") }
            OutcomeChip("↻ Callback", jade) { disposition(current, "callback") }
            OutcomeChip("🚫 Not interested", Color(0xFFB5566B)) { disposition(current, "not_interested") }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).border(1.dp, FHair, RoundedCornerShape(14.dp))
                    .clickable { advance() }.padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
            ) { Text("Skip →", color = FSub, fontWeight = FontWeight.SemiBold) }
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).border(1.dp, FHair, RoundedCornerShape(14.dp))
                    .clickable { current.id?.let { vm.openLeadDetail(it) } }.padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
            ) { Text("Open lead", color = FInk, fontWeight = FontWeight.SemiBold) }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun StreakStat(value: String, label: String, color: Color) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        Spacer(Modifier.width(5.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = FSub, modifier = Modifier.padding(bottom = 3.dp))
    }
}

@Composable
private fun OutcomeChip(label: String, color: Color, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f)).clickable { onClick() }
            .padding(horizontal = 15.dp, vertical = 11.dp),
    ) { Text(label, color = color, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun FlowDone(built: Boolean, worked: Int, interested: Int, jade: Color, onClose: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(if (!built) "Loading your leads…" else "🎉", fontSize = if (built) 56.sp else 18.sp)
        if (built) {
            Spacer(Modifier.height(16.dp))
            Text("Flow complete", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = FInk)
            Spacer(Modifier.height(8.dp))
            Text("$worked called · $interested interested", style = MaterialTheme.typography.titleMedium, color = FSub)
            Spacer(Modifier.height(28.dp))
            Row(
                Modifier.clip(RoundedCornerShape(16.dp)).background(jade).clickable { onClose() }.padding(horizontal = 28.dp, vertical = 14.dp),
            ) { Text("Done", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        }
    }
}

private fun prettyFlowPhone(raw: String): String {
    val d = raw.filter { it.isDigit() }
    return when {
        d.length == 10 -> "${d.substring(0, 5)} ${d.substring(5)}"
        d.length == 12 && d.startsWith("91") -> "+91 ${d.substring(2, 7)} ${d.substring(7)}"
        else -> raw
    }
}

private fun openFlowWhatsApp(context: android.content.Context, phone: String) {
    val num = phone.filter { it.isDigit() }.let { if (it.length == 10) "91$it" else it }
    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://wa.me/$num"))
        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}
