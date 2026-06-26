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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact

private val SETTABLE = listOf(
    "interested" to "Interested", "site_visit" to "Site Visit", "negotiation" to "Negotiation",
    "token_paid" to "Token Paid 💰", "booked" to "Booked / Won", "callback" to "Callback",
    "not_interested" to "Not interested", "lost" to "Lost", "dnc" to "Do Not Call",
)
private val TEMPS = listOf("hot" to "🔥 Hot", "warm" to "🌤 Warm", "cold" to "❄️ Cold")

/** Full-screen 360° view of one lead: profile, one-tap actions, status/stage editor,
 *  and the full call history with playable recordings + AI summaries. */
@Composable
fun LeadDetailScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val contact = app.leads.find { it.id == app.leadDetailId } ?: run { vm.closeLeadDetail(); return }
    val context = LocalContext.current

    // System back / back-gesture returns to the lead list instead of exiting the app.
    BackHandler { vm.closeLeadDetail() }

    var note by remember(contact.id) { mutableStateOf(contact.notes ?: "") }
    var budget by remember(contact.id) { mutableStateOf(contact.budget ?: "") }
    var token by remember(contact.id) {
        mutableStateOf(contact.tokenAmount?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() } ?: "")
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
            item {
                Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { vm.closeLeadDetail() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                    Text("Lead", style = MaterialTheme.typography.titleMedium)
                }
            }

            // Header
            item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    LeadAvatar(contact.name ?: contact.phone, size = 72)
                    Spacer(Modifier.height(10.dp))
                    Text(contact.name ?: contact.phone, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(contact.phone, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    // One quiet status line: a temperature dot + muted stage text — no pills.
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        contact.temperature?.takeIf { it.isNotBlank() }?.let { t ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val dot = when (t) { "hot" -> Color(0xFFEF4444); "warm" -> Color(0xFFF59E0B); else -> Color(0xFF2563EB) }
                                Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
                                Spacer(Modifier.width(6.dp))
                                Text(t.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Text(SETTABLE.firstOrNull { it.first == contact.status }?.second ?: contact.status,
                            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Primary action: Call (solid). WhatsApp is a quiet secondary.
                        Row(
                            Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary)
                                .clickable {
                                    val id = contact.id
                                    if (app.callerdeskCalling) vm.cloudCall(contact.phone, id, contact.campaignId) else vm.dialManual(contact.phone)
                                }.padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.Call, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Call", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                        }
                        DetailAction(Icons.Default.Chat, "WhatsApp", MaterialTheme.colorScheme.onSurfaceVariant, Modifier.weight(1f)) {
                            openWhatsAppLocal(context, contact.phone, waTemplateLocal(contact.name, contact.companyName, app.profile?.fullName, app.company?.name))
                        }
                    }
                }
            }

            item { SectionLabel("Stage") }
            item { ChipRow(SETTABLE, contact.status) { key -> contact.id?.let { vm.applyLead(it, key, null, null, null, null, null, if (key == "token_paid") token.ifBlank { null } else null) } } }

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
                    OutlinedTextField(budget, { budget = it }, label = { Text("Budget") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    IntelligentNotes(note) { note = it }
                    Spacer(Modifier.height(8.dp))
                    DetailAction(Icons.Default.CalendarMonth, "Save details", MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth()) {
                        contact.id?.let {
                            vm.applyLead(it, null, null,
                                budget.trim().ifBlank { null }.takeIf { b -> b != contact.budget },
                                note.trim().ifBlank { null }.takeIf { n -> n != contact.notes },
                                // Persist the booking token too when the lead is at Token Paid,
                                // so typing it and tapping Save no longer loses the amount.
                                tokenAmount = if (contact.status == "token_paid") token.ifBlank { null } else null)
                        }
                    }
                }
            }

            item {
                Text("Call history", style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp))
            }
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
    Text(text, style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.padding(start = 16.dp, top = 10.dp, bottom = 4.dp))
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
