package com.salesautocall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.CallLog

private val WhatsAppGreen = Color(0xFF25D366)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun CallsScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadCalls() }
    var sub by remember { mutableIntStateOf(0) } // 0 = Recent, 1 = Follow-up

    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Text("Calls", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))

        // ---- date filter ----
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CallFilter.values().forEach { f ->
                FilterChip(
                    selected = app.callFilter == f,
                    onClick = { vm.setCallFilter(f) },
                    label = { Text(f.label) },
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---- summary card ----
        SummaryCard(app.callSummary)
        Spacer(Modifier.height(12.dp))

        val followUps = vm.followUps()
        TabRow(selectedTabIndex = sub) {
            Tab(selected = sub == 0, onClick = { sub = 0 }, text = { Text("Recent") })
            Tab(selected = sub == 1, onClick = { sub = 1 }, text = { Text("Follow-up (${followUps.size})") })
        }
        Spacer(Modifier.height(8.dp))

        val rows = if (sub == 0) app.callList else followUps

        when {
            app.callsLoading -> Box(Modifier.fillMaxWidth().padding(32.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            rows.isEmpty() -> Text(
                if (sub == 1) "No follow-ups — every call connected 🎉" else "No calls in this period yet.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(rows, key = { it.id ?: "${it.phone}-${it.startedAt}" }) { CallRow(it) }
            }
        }
    }
}

@Composable
private fun SummaryCard(s: CallSummary) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                SummaryStat("Total", s.total.toString())
                SummaryStat("Connected", s.connected.toString(), Color(0xFF2E7D32))
                SummaryStat("No answer", s.noAnswer.toString(), Color(0xFFEF6C00))
                SummaryStat("Failed", s.failed.toString(), MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Talk time  ${formatDuration(s.talkSeconds)}",
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun SummaryStat(label: String, value: String, color: Color = Color.Unspecified) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CallRow(c: CallLog) {
    val context = LocalContext.current
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(c.phone, style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutcomeBadge(c.outcome)
                    Spacer(Modifier.size(8.dp))
                    val meta = buildString {
                        c.startedAt?.let { append(prettyTime(it)) }
                        if (c.durationSeconds > 0) append("  ·  ${formatDuration(c.durationSeconds)}")
                    }
                    if (meta.isNotBlank()) Text(
                        meta, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = { QuickActions.whatsApp(context, c.phone) }) {
                Icon(Icons.Default.Chat, contentDescription = "WhatsApp", tint = WhatsAppGreen)
            }
            IconButton(onClick = { QuickActions.call(context, c.phone) }) {
                Icon(Icons.Default.Call, contentDescription = "Call back", tint = MaterialTheme.colorScheme.primary)
            }
            IconButton(onClick = { QuickActions.copy(context, c.phone) }) {
                Icon(Icons.Default.ContentCopy, contentDescription = "Copy")
            }
        }
    }
}

@Composable
private fun OutcomeBadge(outcome: String?) {
    val (text, color) = when (outcome) {
        "connected" -> "Connected" to Color(0xFF2E7D32)
        "no_answer" -> "No answer" to Color(0xFFEF6C00)
        "failed" -> "Failed" to MaterialTheme.colorScheme.error
        else -> (outcome ?: "—") to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(text, style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.SemiBold)
}

private fun formatDuration(sec: Int): String {
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%dh %02dm %02ds".format(h, m, s) else "%dm %02ds".format(m, s)
}

/** ISO-8601 → "HH:mm" (date when not today is left to the filter context). */
private fun prettyTime(iso: String): String = runCatching {
    val t = java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
    "%02d:%02d".format(t.hour, t.minute)
}.getOrDefault(iso.take(16))
