package com.salesautocall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Divider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.salesautocall.app.dialer.AutoDialerService
import com.salesautocall.app.dialer.DialerConfig
import com.salesautocall.app.dialer.DialerController

@Composable
fun ImportScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let { vm.importFile(context.contentResolver, it) } }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Import contacts", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text("Choose a CSV or TSV file. We detect columns named like name / phone / email / company / notes, or fall back to column order.")
        Spacer(Modifier.height(16.dp))

        Button(onClick = { picker.launch("*/*") }, enabled = !state.loading) {
            Text(if (state.loading) "Importing…" else "Choose CSV / TSV file")
        }

        Spacer(Modifier.height(16.dp))
        state.message?.let { Text(it) }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Spacer(Modifier.height(16.dp))
        Text("In queue: ${state.queue.size} contacts", style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun DialerScreen(vm: MainViewModel) {
    val appState by vm.state.collectAsState()
    val dialState by DialerController.state.collectAsState()
    val context = LocalContext.current

    var gap by remember { mutableStateOf("5") }
    var simSlot by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.loadQueue() }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Auto dialer", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text("${appState.queue.size} contacts queued.")
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                gap, { gap = it.filter(Char::isDigit) },
                label = { Text("Gap (sec)") }, modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                simSlot, { simSlot = it.filter(Char::isDigit) },
                label = { Text("SIM slot (0/1)") }, modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(16.dp))

        if (dialState.isRunning) {
            Text("Calling ${dialState.currentName ?: dialState.currentPhone ?: "…"}")
            Spacer(Modifier.height(8.dp))
            val progress = if (dialState.total > 0) dialState.completed.toFloat() / dialState.total else 0f
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(4.dp))
            Text("${dialState.completed}/${dialState.total}  ·  last: ${dialState.lastOutcome ?: "—"}")
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = { AutoDialerService.stop(context) }) { Text("Stop") }
        } else {
            Button(
                onClick = {
                    DialerController.prepare(
                        appState.queue,
                        DialerConfig(
                            gapSeconds = gap.toIntOrNull() ?: 5,
                            simSlot = simSlot.toIntOrNull(),
                        ),
                    )
                    AutoDialerService.start(context)
                },
                enabled = appState.queue.isNotEmpty(),
            ) { Text("Start auto-dial") }

            if (dialState.finished && dialState.total > 0) {
                Spacer(Modifier.height(12.dp))
                Text("Finished ${dialState.completed}/${dialState.total} calls.")
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "Reminder: only call contacts who have consented. DNC contacts are skipped.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
fun LogsScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadLogs() }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Call logs", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        if (state.logs.isEmpty()) {
            Text("No calls yet.")
        } else {
            LazyColumn {
                items(state.logs) { log ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(log.phone, style = MaterialTheme.typography.titleMedium)
                            Text("Outcome: ${log.outcome ?: "—"}  ·  ${log.durationSeconds}s")
                            log.startedAt?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                    Divider()
                }
            }
        }
    }
}
