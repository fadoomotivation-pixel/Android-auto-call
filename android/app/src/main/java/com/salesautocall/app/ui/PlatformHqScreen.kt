package com.salesautocall.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.HqCall
import com.salesautocall.app.data.HqCompany
import com.salesautocall.app.data.HqRep

/**
 * Platform HQ — the super admin's whole business on one phone screen.
 * Level 1: every company's live scoreboard (calls/connect/talk/recordings today).
 * Level 2: tap a company → its telecallers' day + latest calls, recordings
 * playable right here (streamed via the same RLS-gated player as everywhere).
 */
@Composable
fun PlatformHqScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { if (app.hqCompanies.isEmpty()) vm.loadHq() }

    val inCompany = app.hqCompanyId != null
    BackHandler { if (inCompany) vm.closeHqCompany() else onBack() }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Header
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { if (inCompany) vm.closeHqCompany() else onBack() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Column {
                Text(
                    if (inCompany) (app.hqCompanyName ?: "Company") else "Platform HQ",
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                )
                Text(
                    if (inCompany) "Telecallers today · latest calls" else "Your whole business, live",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.weight(1f))
            if (!inCompany) {
                Text(
                    "Refresh", style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { vm.loadHq() }.padding(10.dp),
                )
            }
        }

        if (app.hqLoading && app.hqCompanies.isEmpty() && !inCompany) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }

        if (!inCompany) {
            // ---- Level 1: company scoreboard ----
            val totals = app.hqCompanies
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    // Platform-wide strip: today at a glance.
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        HqStat("📞", totals.sumOf { it.callsToday }.toString(), "Calls today", Modifier.weight(1f))
                        HqStat("✅", totals.sumOf { it.connectedToday }.toString(), "Connected", Modifier.weight(1f))
                        HqStat("🎙", totals.sumOf { it.recordingsToday }.toString(), "Recordings", Modifier.weight(1f))
                        HqStat("⏱", fmtTalk(totals.sumOf { it.talkToday }), "Talk time", Modifier.weight(1f))
                    }
                }
                items(totals.size) { i ->
                    val c = totals[i]
                    CompanyCard(c) { vm.openHqCompany(c.companyId, c.companyName) }
                }
                if (totals.isEmpty()) item {
                    Text(
                        "No companies visible. Platform HQ is for the super admin account only.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            // ---- Level 2: one company ----
            var tab by remember { mutableStateOf("team") }
            Row(
                Modifier.padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("team" to "Team today", "calls" to "Latest calls").forEach { (key, label) ->
                    val on = tab == key
                    Box(
                        Modifier.clip(RoundedCornerShape(50))
                            .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { tab = key }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Text(
                            label,
                            color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            if (app.hqLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else if (tab == "team") {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(app.hqReps.size) { i -> RepCard(app.hqReps[i]) }
                    if (app.hqReps.isEmpty()) item {
                        Text("No telecallers in this company yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(app.hqCalls.size) { i -> HqCallCard(app.hqCalls[i]) }
                    if (app.hqCalls.isEmpty()) item {
                        Text("No calls logged yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun HqStat(emoji: String, value: String, label: String, modifier: Modifier = Modifier) {
    Card(modifier, elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(emoji, style = MaterialTheme.typography.titleMedium)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CompanyCard(c: HqCompany, onOpen: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onOpen),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        c.companyName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?",
                        color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(c.companyName.trim(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${c.telecallers} telecallers · ${c.leadsTotal} leads (${c.leadsNew} new)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                // Idle warning: a company with reps but zero calls today needs a nudge.
                if (c.callsToday == 0 && c.telecallers > 0) {
                    Text("😴 idle", style = MaterialTheme.typography.labelMedium, color = Color(0xFFB8860B))
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                MiniStat("${c.callsToday}", "calls")
                MiniStat("${c.connectedToday}", "connected")
                MiniStat(fmtTalk(c.talkToday), "talk")
                MiniStat("${c.recordingsToday}", "rec 🎙")
            }
        }
    }
}

@Composable
private fun MiniStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RepCard(r: HqRep) {
    Card(Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(r.repName ?: "—", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${r.leadsAssigned} leads assigned",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!r.isActive) {
                    Text("inactive", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                } else if (r.callsToday == 0) {
                    Text("😴 no calls yet", style = MaterialTheme.typography.labelMedium, color = Color(0xFFB8860B))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "${r.callsToday} calls · ${r.connectedToday} connected · ${fmtTalk(r.talkToday)} talk · ${r.recordingsToday} rec",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun HqCallCard(c: HqCall) {
    var playing by remember(c.callId) { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (c.offCrm) "⚠ Off-CRM number" else (c.leadName ?: c.phone ?: "Unknown"),
                            style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                            color = if (c.offCrm) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (c.direction == "incoming") "↙ in" else "↗ out",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        listOfNotNull(c.repName, c.outcome?.replace('_', ' '), fmtTalk(c.durationSeconds)).joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (c.recordingStatus == "ready") {
                    Text(
                        if (playing) "◼ Stop" else "▶ Play",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).clickable { playing = !playing }.padding(8.dp),
                    )
                }
            }
            if (playing) {
                Spacer(Modifier.height(6.dp))
                AudioPlayer(callLogId = c.callId, modifier = Modifier.fillMaxWidth())
            }
            c.summary?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(6.dp))
                Text(
                    it, style = MaterialTheme.typography.bodySmall, maxLines = if (playing) 20 else 3,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun fmtTalk(seconds: Int): String = when {
    seconds >= 3600 -> "${seconds / 3600}h ${(seconds % 3600) / 60}m"
    seconds >= 60 -> "${seconds / 60}m"
    else -> "${seconds}s"
}
