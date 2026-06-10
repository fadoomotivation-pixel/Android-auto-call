package com.salesautocall.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.dialer.AutoDialerService
import com.salesautocall.app.dialer.DialerController
import com.salesautocall.app.dialer.DialerUiState
import kotlinx.coroutines.delay

private fun fmt(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}

/** Disposition chips used in review + campaign detail. */
private val QUICK_DISPOSITIONS = listOf(
    "called" to "Answered",
    "no_answer" to "No answer",
    "busy" to "Switched off",
    "callback" to "Callback",
    "interested" to "Interested",
    "not_interested" to "Not interested",
    "dnc" to "DNC",
)

private fun statusLabel(status: String): String =
    QUICK_DISPOSITIONS.firstOrNull { it.first == status }?.second
        ?: status.replace('_', ' ').replaceFirstChar { it.uppercase() }

/** Opens the Android share sheet with the given text. */
private fun shareText(context: android.content.Context, text: String) {
    val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(android.content.Intent.EXTRA_TEXT, text)
    }
    runCatching {
        context.startActivity(
            android.content.Intent.createChooser(send, "Share invite")
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/** Opens a WhatsApp chat with the given number (falls back to wa.me in a browser). */
private fun openWhatsApp(context: android.content.Context, phone: String) {
    val digits = phone.filter { it.isDigit() }
    val intent = android.content.Intent(
        android.content.Intent.ACTION_VIEW,
        android.net.Uri.parse("https://wa.me/$digits"),
    ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}

// ============================================================
// Campaign tab — create / running / session summary
// ============================================================
@Composable
fun CampaignScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val dial by DialerController.state.collectAsState()

    when {
        dial.isRunning -> RunningView(vm)
        dial.finished && dial.total > 0 -> SessionSummaryView(vm, onNew = { DialerController.reset() })
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
        // Not linked to a company yet → must join first.
        if (app.profile != null && app.profile?.companyId == null) {
            JoinCompanyCard(vm, app)
            return@Column
        }

        LaunchedEffect(Unit) { vm.loadToday() }
        TodayCard(app)
        Spacer(Modifier.height(16.dp))

        if (app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank()) {
            CloudDialCard(vm, app)
            Spacer(Modifier.height(16.dp))
        }

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
private fun CloudDialCard(vm: MainViewModel, app: AppState) {
    var number by remember { mutableStateOf("") }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("📞 Cloud dial", style = MaterialTheme.typography.titleMedium)
            Text("Call any number through uroperator — your phone rings first, then the customer connects.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                number, { number = it }, label = { Text("Phone number") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = { if (number.isNotBlank()) vm.cloudCall(number.trim(), null, null) },
                enabled = number.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Cloud call") }
            app.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
            app.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun TodayCard(app: AppState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Today", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Stat("Calls", app.todayCalls.toString())
                Stat("Connected", app.todayConnected.toString())
                Stat("Talk", fmt(app.todayTalk))
            }
            Spacer(Modifier.height(14.dp))
            val p = if (app.dailyGoal > 0) (app.todayCalls.toFloat() / app.dailyGoal).coerceIn(0f, 1f) else 0f
            LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(4.dp))
            Text(
                if (app.todayCalls >= app.dailyGoal) "🎉 Daily goal reached — ${app.todayCalls}/${app.dailyGoal}"
                else "${app.todayCalls} / ${app.dailyGoal} daily goal",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun JoinCompanyCard(vm: MainViewModel, app: AppState) {
    var code by remember { mutableStateOf("") }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Join your company", style = MaterialTheme.typography.titleMedium)
            Text("Ask your admin for the company code, then enter it to start calling.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                code, { code = it.uppercase() }, label = { Text("Company code") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = { vm.joinCompany(code) }, enabled = !app.loading && code.isNotBlank(),
                modifier = Modifier.fillMaxWidth()) {
                Text(if (app.loading) "Joining…" else "Join company")
            }
            app.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            app.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}

@Composable
private fun CompanyCard(vm: MainViewModel, app: AppState) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val company = app.company
    val isAdmin = app.profile?.role == "admin"
    var code by remember { mutableStateOf("") }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Your company", style = MaterialTheme.typography.titleMedium)
            if (company != null) {
                Text("You're in: ${company.name}", style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold)
            } else {
                Text("You haven't joined a company yet — enter your admin's code below.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (isAdmin && company?.joinCode != null) {
                // Admin: share the invite code.
                Spacer(Modifier.height(14.dp))
                Text("Invite code", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                Text(company.joinCode, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { clipboard.setText(AnnotatedString(company.joinCode)) }) { Text("Copy") }
                    OutlinedButton(onClick = {
                        shareText(context, "Join my Bulk Caller team. Open the app, tap Create an account (or Settings → Your company), and enter code: ${company.joinCode}")
                    }) { Text("Share") }
                }
                Spacer(Modifier.height(14.dp))
                Text("How your team joins", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(
                    "1. They install Bulk Caller.\n" +
                        "2. Tap “Create an account” and enter this code in the Company field.\n" +
                        "   (Already signed in? Settings → Your company → type the code → Join.)\n" +
                        "3. Done — they're on your team and can start calling. Their calls show in your dashboard.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                // Anyone else: join (or switch) a company with a code.
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    code, { code = it.uppercase() },
                    label = { Text("Enter company code") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = { vm.joinCompany(code) },
                    enabled = !app.loading && code.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (company == null) "Join company" else "Switch company") }
                app.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                app.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun CloudCallingCard(vm: MainViewModel, app: AppState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Cloud calling (uroperator)", style = MaterialTheme.typography.titleMedium)
                    Text("Optional. Rings your phone, then bridges the customer — no SIM auto-dial.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = app.cloudEnabled, onCheckedChange = { vm.setCloudEnabled(it) })
            }
            if (!app.profile?.sipAgentId.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "✓ Assigned by your admin — extension ${app.profile?.sipAgentId}" +
                        (app.profile?.callerId?.takeIf { it.isNotBlank() }?.let { " · caller ID $it" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary,
                )
            }
            if (app.cloudEnabled) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    app.cloudAgentId, { vm.setCloudAgentId(it) },
                    label = { Text("Agent ID / extension (from your admin)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    app.cloudCallerId, { vm.setCloudCallerId(it) },
                    label = { Text("Caller ID / DID (optional)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Text("Use the 📞 Cloud call button on a contact. Your admin sets up agent IDs/DIDs in uroperator.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
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
private fun RunningView(vm: MainViewModel) {
    val dial by DialerController.state.collectAsState()
    if (dial.paused) ReviewPanel(vm, dial) else CallingPanel(dial, vm)
}

@Composable
private fun Avatar(name: String) {
    val initials = name.trim().split(" ").mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString("")
    Box(
        Modifier.size(96.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials.ifBlank { "?" }, style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CallingPanel(dial: DialerUiState, vm: MainViewModel) {
    val context = LocalContext.current
    var elapsed by remember { mutableIntStateOf(0) }
    LaunchedEffect(dial.currentPhone) {
        elapsed = 0
        while (true) { delay(1000); elapsed++ }
    }
    val name = dial.currentName ?: dial.currentPhone ?: "—"

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Avatar(name)
        Spacer(Modifier.height(16.dp))
        Text(name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        dial.currentPhone?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Spacer(Modifier.height(8.dp))
        Text(fmt(elapsed), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)

        Spacer(Modifier.height(28.dp))
        val progress = if (dial.total > 0) dial.completed.toFloat() / dial.total else 0f
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Text("${dial.completed} / ${dial.total}  ·  last: ${dial.lastOutcome ?: "—"}")

        Spacer(Modifier.height(28.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { vm.pauseCampaign() }) { Text("Pause") }
            OutlinedButton(onClick = { AutoDialerService.stop(context) }) { Text("Stop") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReviewPanel(vm: MainViewModel, dial: DialerUiState) {
    val context = LocalContext.current
    val app by vm.state.collectAsState()
    val name = dial.lastContactName ?: dial.lastContactPhone ?: "—"
    var noteOpen by remember { mutableStateOf(false) }
    var noteText by remember(dial.lastContactId) { mutableStateOf("") }
    var marked by remember(dial.lastContactId) { mutableStateOf<String?>(null) }
    var savedNote by remember(dial.lastContactId) { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text("Paused", style = MaterialTheme.typography.headlineSmall)
        Text("${dial.completed} / ${dial.total} done", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(name)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        dial.lastContactPhone?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Text("Outcome: ${dial.lastOutcome ?: "—"}", style = MaterialTheme.typography.bodySmall)
                    }
                }
                Spacer(Modifier.height(14.dp))
                Text("Mark outcome", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    QUICK_DISPOSITIONS.forEach { (status, label) ->
                        val selected = marked == status
                        AssistChip(
                            onClick = {
                                marked = status
                                dial.lastContactId?.let { vm.quickDisposition(it, status) }
                            },
                            label = { Text(label) },
                            leadingIcon = if (selected) ({ Text("✓") }) else null,
                        )
                    }
                }
                // Confirmation of what was just recorded.
                marked?.let { st ->
                    val label = QUICK_DISPOSITIONS.firstOrNull { it.first == st }?.second ?: st
                    Spacer(Modifier.height(8.dp))
                    Text("✓ Marked as “$label” — saved.", color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.bodyMedium)
                }
                savedNote?.takeIf { it.isNotBlank() }?.let {
                    Text("📝 $it", style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { dial.lastContactPhone?.let { openWhatsApp(context, it) } },
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = androidx.compose.ui.graphics.Color(0xFF25D366),
                        ),
                    ) { Text("WhatsApp") }
                    OutlinedButton(onClick = { noteOpen = true }) { Text("Save details") }
                }
                if (app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = {
                        dial.lastContactPhone?.let { vm.cloudCall(it, dial.lastContactId, DialerController.campaignId) }
                    }) { Text("📞 Cloud call") }
                }
                app.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
                app.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }

        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { vm.resumeCampaign() }) { Text("Next call ▶") }
            OutlinedButton(onClick = { AutoDialerService.stop(context) }) { Text("Stop") }
        }
    }

    if (noteOpen) {
        AlertDialog(
            onDismissRequest = { noteOpen = false },
            title = { Text("Details for $name") },
            text = {
                OutlinedTextField(
                    noteText, { noteText = it },
                    label = { Text("e.g. budget, best time to call, requirement") },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    dial.lastContactId?.let { vm.saveNote(it, noteText) }
                    savedNote = noteText
                    noteOpen = false
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { noteOpen = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SessionSummaryView(vm: MainViewModel, onNew: () -> Unit) {
    val app by vm.state.collectAsState()
    val dial by DialerController.state.collectAsState()
    val sessionSec = ((dial.sessionEndMillis - dial.sessionStartMillis) / 1000).toInt().coerceAtLeast(0)
    val avg = if (dial.dialedCount > 0) dial.talkSeconds.toDouble() / dial.dialedCount else 0.0

    // Auto-bundle unanswered numbers into a follow-up campaign for tomorrow.
    LaunchedEffect(Unit) { vm.createFollowUp() }

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
        app.followUpInfo?.let {
            Spacer(Modifier.height(16.dp))
            Card(Modifier.fillMaxWidth()) {
                Text("📅 $it", modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.primary)
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
fun AnalyticsScreen(vm: MainViewModel, onOpen: (String, String) -> Unit) {
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
                    Card(
                        Modifier.fillMaxWidth().clickable { onOpen(c.campaignId, c.name) },
                    ) {
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

        // Company: invite code (admin) or join/switch by code (everyone else).
        CompanyCard(vm, app)
        Spacer(Modifier.height(16.dp))

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
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Pause after each call", style = MaterialTheme.typography.titleMedium)
                    Text("Review the call, set an outcome, or WhatsApp before the next number.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = app.reviewAfterCall, onCheckedChange = { vm.setReviewAfterCall(it) })
            }
        }
        Spacer(Modifier.height(16.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Daily call goal", style = MaterialTheme.typography.titleMedium)
                Text("Target calls per day, shown on your Today card.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { vm.setDailyGoal(app.dailyGoal - 10) }) { Text("−10") }
                    Text("${app.dailyGoal}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    OutlinedButton(onClick = { vm.setDailyGoal(app.dailyGoal + 10) }) { Text("+10") }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        CloudCallingCard(vm, app)

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

// ============================================================
// Campaign detail — per-contact call dispositions + notes
// ============================================================
private val DISPOSITIONS = listOf(
    "interested" to "Interested",
    "callback" to "Callback",
    "not_interested" to "Not interested",
    "called" to "Done",
    "dnc" to "DNC",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CampaignDetailScreen(vm: MainViewModel, onBack: () -> Unit, onStarted: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    var noteFor by remember { mutableStateOf<Contact?>(null) }
    var query by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("Back") }
            Spacer(Modifier.width(12.dp))
            Text(app.selectedCampaignName, style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(8.dp))
        Text("Tap an outcome for each contact. Updates sync to your dashboard.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))

        val callable = app.campaignContacts.count {
            it.status in setOf("new", "queued", "callback", "no_answer", "busy")
        }
        Button(
            onClick = {
                vm.startExistingCampaign(app.selectedCampaignId ?: "", app.selectedCampaignName, app.campaignContacts)
                onStarted()
            },
            enabled = callable > 0,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (callable > 0) "Start calling ($callable)" else "Nothing left to call") }
        Spacer(Modifier.height(14.dp))

        if (app.campaignContacts.isNotEmpty()) {
            val interested = app.campaignContacts.count { it.status == "interested" }
            val callbacks = app.campaignContacts.count { it.status == "callback" }
            val notInterested = app.campaignContacts.count { it.status == "not_interested" }
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Interested", interested.toString())
                    Stat("Callback", callbacks.toString())
                    Stat("Not int.", notInterested.toString())
                    Stat("Total", app.campaignContacts.size.toString())
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        OutlinedTextField(
            query, { query = it }, label = { Text("Search name or phone") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        val filtered = if (query.isBlank()) app.campaignContacts else app.campaignContacts.filter {
            (it.name ?: "").contains(query, ignoreCase = true) || it.phone.contains(query)
        }

        if (filtered.isEmpty()) {
            Text(
                if (app.campaignContacts.isEmpty()) "No contacts in this campaign." else "No matches.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(filtered, key = { it.id ?: it.phone }) { c ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text(c.name ?: c.phone, style = MaterialTheme.typography.titleMedium)
                            Text(c.phone, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            val isLead = c.status == "interested"
                            Text(
                                "Status: ${statusLabel(c.status)}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isLead) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            c.notes?.takeIf { it.isNotBlank() }?.let {
                                Spacer(Modifier.height(4.dp))
                                Text("📝 $it", style = MaterialTheme.typography.bodySmall)
                            }
                            Spacer(Modifier.height(8.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                DISPOSITIONS.forEach { (status, label) ->
                                    val selected = c.status == status
                                    AssistChip(
                                        onClick = { c.id?.let { vm.setDisposition(it, status, c.notes) } },
                                        label = { Text(label) },
                                        leadingIcon = if (selected) {
                                            { Text("✓") }
                                        } else null,
                                    )
                                }
                                AssistChip(onClick = { noteFor = c }, label = { Text("Note") })
                                AssistChip(onClick = { openWhatsApp(context, c.phone) }, label = { Text("WhatsApp") })
                                if (app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank()) {
                                    AssistChip(
                                        onClick = { c.id?.let { vm.cloudCall(c.phone, it, c.campaignId) } },
                                        label = { Text("📞 Cloud call") },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    noteFor?.let { contact ->
        var text by remember(contact.id) { mutableStateOf(contact.notes ?: "") }
        AlertDialog(
            onDismissRequest = { noteFor = null },
            title = { Text("Note for ${contact.name ?: contact.phone}") },
            text = {
                OutlinedTextField(text, { text = it }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth())
            },
            confirmButton = {
                TextButton(onClick = {
                    contact.id?.let { vm.saveNote(it, text) }
                    noteFor = null
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { noteFor = null }) { Text("Cancel") } },
        )
    }
}
