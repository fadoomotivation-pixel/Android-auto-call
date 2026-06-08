package com.salesautocall.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.dialer.AutoDialerService
import com.salesautocall.app.dialer.DialerController

private fun fmt(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}

// ============================================================
// Campaign tab — create / running / session summary
// ============================================================
@Composable
fun CampaignScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val dial by DialerController.state.collectAsState()

    when {
        dial.isRunning -> RunningView(onStop = AutoDialerService::stop)
        dial.finished && dial.total > 0 -> SessionSummaryView(onNew = { DialerController.reset() })
        else -> CreateCampaignView(vm, app)
    }
}

@Composable
private fun CreateCampaignView(vm: MainViewModel, app: AppState) {
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { vm.pickFile(it) }
    }

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text("Start New Campaign", style = MaterialTheme.typography.headlineSmall)
        Text("Create a campaign to organize and track your calls", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))

        // Step 1 — name
        StepCard(number = "1", title = "Campaign Name") {
            OutlinedTextField(
                value = app.campaignName,
                onValueChange = vm::setCampaignName,
                placeholder = { Text("e.g. June Leads") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(14.dp))

        // Step 2 — upload
        StepCard(number = "2", title = "Upload Contacts") {
            Button(onClick = { picker.launch("*/*") }, enabled = !app.loading, modifier = Modifier.fillMaxWidth()) {
                Text(if (app.loading) "Reading…" else "Choose File")
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "CSV or Excel (.csv, .tsv, .xlsx) with phone, name, and reason columns. " +
                    "Up to 20,000 contacts per campaign.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            app.pendingFileName?.let {
                Spacer(Modifier.height(8.dp))
                Text("Selected: $it", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            }
            app.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            app.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
        Spacer(Modifier.height(14.dp))

        // Step 3 — pace + start
        StepCard(number = "3", title = "Calling Pace") {
            Text("Break of ${app.breakSeconds}s between calls (change in Settings).",
                style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(20.dp))

        Button(
            onClick = { vm.startCampaign() },
            enabled = !app.loading && (app.pendingParse?.contacts?.isNotEmpty() == true),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Start Campaign") }

        Spacer(Modifier.height(12.dp))
        Text(
            "Auto-dial places real calls one after another. Use test numbers first. " +
                "Contacts marked DNC are skipped.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StepCard(number: String, title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(number, fontWeight = FontWeight.Bold, fontSize = 18.sp,
                    color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(title, style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun RunningView(onStop: (android.content.Context) -> Unit) {
    val dial by DialerController.state.collectAsState()
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Calling…", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(dial.currentName ?: dial.currentPhone ?: "—", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(24.dp))
        val progress = if (dial.total > 0) dial.completed.toFloat() / dial.total else 0f
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Text("${dial.completed} / ${dial.total}  ·  last: ${dial.lastOutcome ?: "—"}")
        Spacer(Modifier.height(32.dp))
        OutlinedButton(onClick = { onStop(context) }) { Text("Stop") }
    }
}

@Composable
private fun SessionSummaryView(onNew: () -> Unit) {
    val dial by DialerController.state.collectAsState()
    val sessionSec = ((dial.sessionEndMillis - dial.sessionStartMillis) / 1000).toInt().coerceAtLeast(0)
    val avg = if (dial.dialedCount > 0) dial.talkSeconds.toDouble() / dial.dialedCount else 0.0

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text("Session Complete!", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(20.dp))

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Call Statistics", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                StatRow("Total Calls", dial.completed.toString())
                StatRow("Successfully Dialed", dial.dialedCount.toString())
            }
        }
        Spacer(Modifier.height(12.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Time Statistics", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                StatRow("Total Session Time", fmt(sessionSec))
                StatRow("Total Talk Time", fmt(dial.talkSeconds))
                StatRow("Average Call Duration", String.format("%.1fs", avg))
            }
        }
        Spacer(Modifier.height(24.dp))
        Button(onClick = onNew, modifier = Modifier.fillMaxWidth()) { Text("Start New Campaign") }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}

// ============================================================
// Analytics tab — campaign list with progress
// ============================================================
@Composable
fun AnalyticsScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadCampaigns() }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Analytics", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        if (app.campaigns.isEmpty()) {
            Text("No campaigns yet. Start one from the Campaign tab.",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(app.campaigns, key = { it.campaignId }) { c ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text(c.name, style = MaterialTheme.typography.titleMedium)
                                    c.createdAt?.let {
                                        Text(it.take(10), style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                IconButton(onClick = { vm.deleteCampaign(c.campaignId) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Delete",
                                        tint = MaterialTheme.colorScheme.error)
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            val pct = if (c.total > 0) (c.completed * 100 / c.total) else 0
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Stat("Total", c.total.toString())
                                Stat("Completed", c.completed.toString())
                                Stat("Progress", "$pct%")
                            }
                            Spacer(Modifier.height(10.dp))
                            LinearProgressIndicator(
                                progress = { if (c.total > 0) c.completed.toFloat() / c.total else 0f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ============================================================
// Settings — break time between calls
// ============================================================
@Composable
fun SettingsScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(20.dp))

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Break Time Between Calls", style = MaterialTheme.typography.titleMedium)
                Text("Waiting time after each call ends", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))
                Text("${app.breakSeconds} seconds", style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.fillMaxWidth(), fontWeight = FontWeight.Bold)
                Slider(
                    value = app.breakSeconds.toFloat(),
                    onValueChange = { vm.setBreakSeconds(it.toInt()) },
                    valueRange = 1f..59f,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("1s", style = MaterialTheme.typography.bodySmall)
                    Text("59s", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("How It Works", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "• The app places each call through your SIM.\n" +
                        "• It detects when a call ends automatically.\n" +
                        "• After hanging up, it waits the break time.\n" +
                        "• Then it dials the next contact in the campaign.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        OutlinedButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.height(12.dp))
        app.profile?.let {
            Text("Signed in as ${it.fullName ?: "—"}", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = { vm.signOut() }) { Text("Sign out") }
    }
}
