package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        contact.temperature?.let { t -> Pill(TEMPS.firstOrNull { it.first == t }?.second ?: t, Color(0xFFEF4444)) }
                        Pill(SETTABLE.firstOrNull { it.first == contact.status }?.second ?: contact.status, MaterialTheme.colorScheme.primary)
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailAction(Icons.Default.Call, "Call", Color(0xFF22C55E), Modifier.weight(1f)) {
                            val id = contact.id
                            if (app.callerdeskCalling) vm.cloudCall(contact.phone, id, contact.campaignId) else vm.dialManual(contact.phone)
                        }
                        DetailAction(Icons.Default.Chat, "WhatsApp", Color(0xFF25D366), Modifier.weight(1f)) {
                            openWhatsAppLocal(context, contact.phone)
                        }
                    }
                }
            }

            item { SectionLabel("Stage") }
            item { ChipRow(SETTABLE, contact.status) { key -> contact.id?.let { vm.applyLead(it, key, null, null, null, null, null, token.ifBlank { null }) } } }

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
                    OutlinedTextField(note, { note = it }, label = { Text("Notes") }, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    DetailAction(Icons.Default.CalendarMonth, "Save details", MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth()) {
                        contact.id?.let {
                            vm.applyLead(it, null, null,
                                budget.trim().ifBlank { null }.takeIf { b -> b != contact.budget },
                                note.trim().ifBlank { null }.takeIf { n -> n != contact.notes })
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
private fun Pill(text: String, color: Color) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.15f)).padding(horizontal = 12.dp, vertical = 5.dp)) {
        Text(text, color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
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

private fun openWhatsAppLocal(context: android.content.Context, phone: String) {
    val num = phone.filter { it.isDigit() }.let { if (it.length == 10) "91$it" else it }
    val intent = android.content.Intent(
        android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://wa.me/$num"),
    ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}
