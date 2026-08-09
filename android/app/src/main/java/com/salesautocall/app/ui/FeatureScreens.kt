package com.salesautocall.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import kotlinx.coroutines.launch
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Timer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.CheckCircle
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
    "dnc" to "Do Not Call",
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

/** Opens a WhatsApp chat with the given number, in the rep's chosen WhatsApp. */
private fun openWhatsApp(context: android.content.Context, phone: String) {
    com.salesautocall.app.data.WhatsAppLauncher.open(context, phone)
}

// ============================================================
// Campaign tab — create / running / session summary
// ============================================================
@Composable
fun CampaignScreen(vm: MainViewModel, onPickLeads: () -> Unit = {}) {
    val app by vm.state.collectAsState()
    val dial by DialerController.state.collectAsState()

    when {
        dial.isRunning -> RunningView(vm)
        dial.finished && dial.total > 0 -> SessionSummaryView(vm, onNew = { DialerController.reset() })
        else -> CreateCampaignView(vm, app, onPickLeads)
    }
}

@Composable
private fun CreateCampaignView(vm: MainViewModel, app: AppState, onPickLeads: () -> Unit) {
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
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

        // Easiest path for a telecaller: just pick from leads the admin uploaded.
        Card(
            Modifier.fillMaxWidth().clickable { onPickLeads() },
            colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        ) {
            Column(Modifier.padding(16.dp)) {
                Text("📞 Call your assigned leads", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("No file needed. Pick the leads your admin gave you and dial them one after another.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onPickLeads, modifier = Modifier.fillMaxWidth()) {
                    Text("Select leads & start calling")
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        if (app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank()) {
            CloudDialCard(vm, app)
            Spacer(Modifier.height(16.dp))
        }

        Text("Or upload a new list", style = MaterialTheme.typography.headlineSmall)
        Text("Advanced: import a CSV/Excel file to start a fresh campaign", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            Button(onClick = {
                picker.launch(arrayOf(
                    "text/csv",
                    "text/comma-separated-values",
                    "text/tab-separated-values",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.ms-excel",
                ))
            }, enabled = !app.loading, modifier = Modifier.fillMaxWidth()) {
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
    PaperCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("📞 Cloud dial", style = MaterialTheme.typography.titleMedium)
            Text("Call any number through your office phone system — your phone rings first, then the customer connects.",
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
    PaperCard(Modifier.fillMaxWidth()) {
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
    PaperCard(Modifier.fillMaxWidth()) {
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

/**
 * Two things the rep — and only the rep — can get right about their own
 * messages: which WhatsApp they go out from, and how they refer to themselves.
 *
 * Both were fixed defaults before. Reps with WhatsApp AND WhatsApp Business were
 * asked which to use on every single message, and the ready-made openers all
 * said "kar raha hoon" — the male form — which is wrong for most of the team.
 * Neither is guessable, so both are asked here once and remembered.
 */
@Composable
private fun MessagingCard(vm: MainViewModel, app: AppState) {
    val context = LocalContext.current
    val launcher = com.salesautocall.app.data.WhatsAppLauncher
    val sv = com.salesautocall.app.data.SelfVoice
    val installed = remember { launcher.installed(context) }
    var pkg by remember { mutableStateOf(com.salesautocall.app.data.AppPrefs.getWhatsAppPkg(context)) }
    val speaks = app.profile?.speaksAs

    PaperCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            SettingHeader(Icons.Default.Chat, "Messages", "Kis WhatsApp se, aur aap apne aap ko kaise likhein")

            // ---- which WhatsApp ----
            if (installed.size > 1) {
                Spacer(Modifier.height(14.dp))
                Text("WhatsApp", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (installed + com.salesautocall.app.data.WhatsAppLauncher.Option("", "Har baar poochho"))
                        .forEach { opt ->
                            val on = pkg == opt.pkg
                            Box(
                                Modifier.clip(RoundedCornerShape(50))
                                    .background(
                                        if (on) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.surfaceVariant,
                                    )
                                    .clickable {
                                        pkg = opt.pkg
                                        com.salesautocall.app.data.AppPrefs.setWhatsAppPkg(context, opt.pkg)
                                    }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                            ) {
                                Text(
                                    opt.label,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (on) MaterialTheme.colorScheme.onPrimary
                                    else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                }
            } else if (installed.size == 1) {
                Spacer(Modifier.height(10.dp))
                Text("Messages ${installed.first().label} se jaayenge.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            // ---- how the rep speaks about themselves ----
            Spacer(Modifier.height(18.dp))
            Text("Message me aap apne aap ko kaise likhein", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(sv.FEMALE, sv.MALE, sv.NEUTRAL).forEach { key ->
                    val on = (speaks ?: sv.NEUTRAL) == key
                    Box(
                        Modifier.clip(RoundedCornerShape(50))
                            .background(
                                if (on) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceVariant,
                            )
                            .clickable { vm.setSpeaksAs(key) }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Text(
                            sv.label(key),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (on) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Ready templates aur AI ke likhe message isi hisaab se banenge.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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

    PaperCard(Modifier.fillMaxWidth()) {
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
                        shareText(context, "Join my Call Pro AI team. Open the app, tap Create an account (or Settings → Your company), and enter code: ${company.joinCode}")
                    }) { Text("Share") }
                }
                Spacer(Modifier.height(14.dp))
                Text("How your team joins", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(
                    "1. They install Call Pro AI.\n" +
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

/**
 * Points the app at the phone's own call-recording folder so we can harvest the
 * OEM's both-sides recording (native quality) instead of a mic-only capture.
 * This is how reliable call recorders work on modern Android — the OS records,
 * we pick up the file.
 */
@Composable
private fun CallRecordingFolderCard(context: android.content.Context, vm: MainViewModel, syncing: Boolean, syncMsg: String?, recordAllCalls: Boolean = false) {
    var folder by remember { mutableStateOf(com.salesautocall.app.data.AppPrefs.getRecordingFolder(context)) }
    // Auto-detect where the phone saves call recordings so the rep doesn't hunt.
    val detected by androidx.compose.runtime.produceState<String?>(initialValue = null) {
        value = runCatching { com.salesautocall.app.dialer.RecordingFolders.detectDisplayPath(context) }.getOrNull()
    }
    val picker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocumentTree(),
    ) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            com.salesautocall.app.data.AppPrefs.setRecordingFolder(context, uri.toString())
            folder = uri.toString()
        }
    }
    // Open the picker pre-navigated to the detected folder (one-tap confirm).
    fun launchAt(path: String?) = picker.launch(
        com.salesautocall.app.dialer.RecordingFolders.initialPickerUri(path),
    )
    val connected = folder.isNotBlank()
    // "Test" state: scan the connected folder and show the newest recording found.
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var testing by remember { mutableStateOf(false) }
    var testResult by remember { mutableStateOf<String?>(null) }
    fun runTest() {
        testing = true; testResult = null
        scope.launch {
            val f = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching { com.salesautocall.app.dialer.NativeRecordingHarvester.latest(context) }.getOrNull()
            }
            testing = false
            testResult = if (f != null) {
                val ago = android.text.format.DateUtils.getRelativeTimeSpanString(f.lastModified).toString()
                "✓ Recording found: ${f.name} · $ago. Every call will now upload automatically."
            } else {
                "No recordings in this folder yet. Make a test call from the app's Dialer, then tap Test again. If it still doesn't appear, pick the folder where your phone's dialer saves recordings."
            }
        }
    }
    PaperCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Call recording", style = MaterialTheme.typography.titleMedium)
            // Record-all disclosure, framed as the helper it is: calls are
            // recorded so the AI keeps the CRM updated for the rep (still an
            // honest "calls are recorded" notice — just not a scary one).
            if (recordAllCalls) {
                Spacer(Modifier.height(10.dp))
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                ) {
                    Text(
                        "🎙  Calls on this phone are recorded so the CRM auto-updates for you — " +
                            "follow-ups, site visits and bookings land on the lead automatically.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            if (connected) {
                Text("✓ Folder connected", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                Text(android.net.Uri.decode(folder.substringAfterLast('/').substringAfterLast("%3A")),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = { runTest() }, enabled = !testing) {
                        if (testing) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                            Spacer(Modifier.width(8.dp))
                            Text("Checking…")
                        } else Text("Test recording setup")
                    }
                    OutlinedButton(onClick = { launchAt(detected) }) { Text("Change") }
                    TextButton(onClick = {
                        com.salesautocall.app.data.AppPrefs.clearRecordingFolder(context); folder = ""; testResult = null
                    }) { Text("Disconnect") }
                }
                testResult?.let {
                    Spacer(Modifier.height(10.dp))
                    val ok = it.startsWith("✓")
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = (if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error).copy(alpha = 0.10f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(it, style = MaterialTheme.typography.bodySmall,
                            color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(12.dp))
                    }
                }
                // Backfill: attach recordings the dialer already made for past calls.
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = { vm.syncRecordings() }, enabled = !syncing, modifier = Modifier.fillMaxWidth()) {
                    if (syncing) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Syncing…")
                    } else Text("Sync recordings from folder")
                }
                syncMsg?.let {
                    Spacer(Modifier.height(10.dp))
                    val ok = it.startsWith("✓")
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = (if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error).copy(alpha = 0.10f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(it, style = MaterialTheme.typography.bodySmall,
                            color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(12.dp))
                    }
                }
            } else {
                // No folder connected → the app records CALLS ITSELF (SimRecorder,
                // speaker fallback). Lead with that so reps — especially on MIUI /
                // Redmi where no third-party recorder works — know recording is ON
                // and needs no extra app. The folder is an optional quality upgrade.
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text("✓ Built-in recording is ON", style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Every call you make from inside the app is recorded automatically — no extra recorder app needed. " +
                                "On phones like Redmi / MIUI the call goes on speaker so both sides are captured.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Optional — better quality", style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(2.dp))
                Text(
                    "If your phone already records calls to a folder (e.g. some OnePlus, Samsung), connect it for clearer, no-speaker recordings.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                // Detected suggestion: one tap opens the picker right on the folder.
                detected?.let { path ->
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Found a recordings folder", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                                Text(path, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                            }
                            Button(onClick = { launchAt(path) }) { Text("Use this") }
                        }
                    }
                }
                OutlinedButton(onClick = { launchAt(detected) }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (detected != null) "Choose a different folder" else "Connect a recording folder")
                }
            }
        }
    }
}

@Composable
private fun CloudCallingCard(vm: MainViewModel, app: AppState) {
    PaperCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Office line calling", style = MaterialTheme.typography.titleMedium)
                    Text("Optional. Rings your phone, then bridges the customer — no SIM auto-dial.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = app.cloudEnabled, onCheckedChange = { vm.setCloudEnabled(it) })
            }
            if (app.company?.recordingEnabled == true) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "🎙️ Calls may be recorded by your company for quality and training. " +
                        "Recordings are kept for 30 days.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
                
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Available for incoming calls", style = MaterialTheme.typography.titleSmall)
                            Text("Keep app connected in background to receive calls. (Uses more battery)",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = app.cloudIncomingEnabled, onCheckedChange = { vm.setIncomingEnabled(it) })
                    }
                }

                // CallerDesk one-tap calling — no VPN, no SIP. The phone rings, then
                // connects the customer; the call is recorded automatically.
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("CallerDesk calling (recommended)", style = MaterialTheme.typography.titleSmall)
                            Text("Your phone rings, then connects the customer. No VPN or SIP needed — calls are recorded automatically.",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = app.callerdeskCalling, onCheckedChange = { vm.setCallerdeskCalling(it) })
                    }
                }

                // Nested under CallerDesk: auto-answer the agent-leg ring so it's
                // truly one-tap. Only relevant when CallerDesk calling is on.
                if (app.callerdeskCalling) {
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = if (app.autoAnswer) MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.55f)
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, bottom = 12.dp)
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    if (app.autoAnswer) "⚡ Auto-answer — one tap" else "✋ Manual answer",
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                Text(
                                    if (app.autoAnswer)
                                        "Tap Call once and your phone picks up on its own — hands-free."
                                    else
                                        "Your phone rings and you tap answer. Use this if you share the SIM for personal calls.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(checked = app.autoAnswer, onCheckedChange = { vm.setAutoAnswer(it) })
                        }
                    }
                }

                // The one thing each rep sets: the mobile CallerDesk rings, then
                // bridges to the customer. No SIP extension / server to configure.
                Spacer(Modifier.height(4.dp))
                var myPhone by remember(app.profile?.phone) { mutableStateOf(app.profile?.phone ?: "") }
                OutlinedTextField(
                    myPhone, { v -> myPhone = v.filter { it.isDigit() || it == '+' } },
                    label = { Text("📱 Your mobile number") },
                    supportingText = { Text("CallerDesk rings this phone, then connects the customer.") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                val phoneDirty = myPhone.trim() != (app.profile?.phone ?: "").trim()
                Button(
                    onClick = { vm.setMyPhone(myPhone) },
                    enabled = phoneDirty && myPhone.trim().length >= 8,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (phoneDirty) "Save mobile number" else "✓ Saved") }
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

        PaperCard(Modifier.fillMaxWidth()) {
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

        PaperCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Call Statistics", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                StatRow("Total Calls", dial.completed.toString())
                StatRow("Successfully Dialed", dial.dialedCount.toString())
            }
        }
        Spacer(Modifier.height(12.dp))
        PaperCard(Modifier.fillMaxWidth()) {
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
            PaperCard(Modifier.fillMaxWidth()) {
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
            var confirmDeleteId by remember { mutableStateOf<String?>(null) }
            var confirmDeleteName by remember { mutableStateOf("") }

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
                                IconButton(onClick = {
                                    confirmDeleteId = c.campaignId
                                    confirmDeleteName = c.name
                                }) {
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

            // Confirmation dialog for campaign deletion
            if (confirmDeleteId != null) {
                AlertDialog(
                    onDismissRequest = { confirmDeleteId = null },
                    title = { Text("Delete campaign?") },
                    text = { Text("Are you sure you want to delete \"$confirmDeleteName\"? This will remove all its contacts and call logs. This cannot be undone.") },
                    confirmButton = {
                        TextButton(onClick = {
                            confirmDeleteId?.let { vm.deleteCampaign(it) }
                            confirmDeleteId = null
                        }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                    },
                    dismissButton = {
                        TextButton(onClick = { confirmDeleteId = null }) { Text("Cancel") }
                    },
                )
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

/** Paper & ink: a flat white card with a hairline — the one card style
 *  every settings block shares. No shadows, no tinted surfaces. */
@Composable
private fun PaperCard(
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Card(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        content = content,
    )
}

/** Section header: one quiet jade-tinted icon + title + one-line subtitle.
 *  Jade is the app's ONLY accent — every icon wears the same colour. */
@Composable
private fun SettingHeader(icon: ImageVector, title: String, subtitle: String? = null) {
    val jade = jadeAccent(androidx.compose.foundation.isSystemInDarkTheme())
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(jade.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = jade, modifier = Modifier.size(18.dp)) }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            subtitle?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
@Composable
fun SettingsScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    // System back closes the settings overlay (not the app).
    BackHandler { onBack() }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 96.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Spacer(Modifier.width(4.dp))
            Text("Settings", style = MaterialTheme.typography.headlineSmall)
        }
        Text("Your changes are saved automatically.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))

        // FIRST CARD, ON PURPOSE. When a rep opens Settings it is usually because
        // something is not working, and this is the answer to "sab on hai na?".
        PhoneCheckCard(vm)
        Spacer(Modifier.height(16.dp))

        // Company: invite code (admin) or join/switch by code (everyone else).
        CompanyCard(vm, app)
        Spacer(Modifier.height(16.dp))

        MessagingCard(vm, app)
        Spacer(Modifier.height(16.dp))

        PaperCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                SettingHeader(Icons.Default.Timer, "Break between calls", "Waiting time after each call ends")
                Spacer(Modifier.height(16.dp))
                Text("${app.breakSeconds} seconds", style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.fillMaxWidth(), fontWeight = FontWeight.Bold,
                    color = jadeAccent(androidx.compose.foundation.isSystemInDarkTheme()))
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
        PaperCard(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    SettingHeader(Icons.Default.Pause, "Pause after each call",
                        "Review the call, set an outcome, or WhatsApp before the next number.")
                }
                Switch(checked = app.reviewAfterCall, onCheckedChange = { vm.setReviewAfterCall(it) })
            }
        }
        Spacer(Modifier.height(16.dp))
        // How the app asks after a SIM call. Off (the default) the Update button
        // shakes instead of a sheet appearing — the sheet cannot land until
        // Android hands focus back from the phone's own in-call screen, which is
        // a second or two after the rep has already moved on.
        PaperCard(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    SettingHeader(Icons.Default.Notifications, "Popup right after a SIM call",
                        "Off: the lead's Update button shakes instead — no waiting for the popup to open.")
                }
                Switch(checked = app.postCallPopup, onCheckedChange = { vm.setPostCallPopup(it) })
            }
        }
        Spacer(Modifier.height(16.dp))
        // The assistant's own questions. One switch for all of them, because a
        // rep who wants quiet wants quiet — offering three sub-toggles just
        // makes turning it off harder.
        PaperCard(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    SettingHeader(Icons.Default.Lightbulb, "Let the app ask me things",
                        "A few questions a day: did the customer come to the site, did you make that callback, how did today go.")
                }
                Switch(checked = app.assistantOn, onCheckedChange = { vm.setAssistantOn(it) })
            }
        }
        Spacer(Modifier.height(16.dp))
        PaperCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                SettingHeader(Icons.Default.Flag, "Daily call goal", "Target calls per day, shown on your Today card.")
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
        CallRecordingFolderCard(context, vm, app.recordingSyncing, app.recordingSyncMsg, app.company?.recordAllCalls == true)

        Spacer(Modifier.height(16.dp))
        PaperCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                SettingHeader(
                    Icons.Default.Download, "App version & updates",
                    "You're on v${com.salesautocall.app.BuildConfig.VERSION_NAME} (build ${com.salesautocall.app.BuildConfig.VERSION_CODE})",
                )
                Spacer(Modifier.height(4.dp))
                app.update?.let { rel ->
                    Text("Update available: v${rel.versionName} 🎉", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(12.dp))
                if (app.update != null) {
                    Button(onClick = { vm.installUpdate() }, modifier = Modifier.fillMaxWidth()) {
                        Text("⬇ Download & install v${app.update!!.versionName}")
                    }
                } else {
                    OutlinedButton(
                        onClick = { vm.checkForUpdate(manual = true) },
                        enabled = !app.checkingUpdate,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (app.checkingUpdate) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp)); Text("Checking…")
                        } else {
                            Text("Check for updates")
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        Button(
            onClick = {
                android.widget.Toast.makeText(context, "✓ Settings saved", android.widget.Toast.LENGTH_SHORT).show()
                onBack()
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save settings") }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
        Spacer(Modifier.height(16.dp))
        app.profile?.let {
            Text("Signed in as ${it.fullName ?: "—"}", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = { vm.signOut() }) { Text("Sign out") }
    }
        // The app's real bottom navigation, pinned — Settings is an overlay, so it
        // no longer loses the bottom menu.
        Box(Modifier.align(Alignment.BottomCenter)) {
            FloatingCallBar(
                current = null,
                onTab = { vm.goToTab(it) },
                onDial = { vm.goToTab("dialer") },
                onMore = { vm.openDrawerFromOverlay() },
            )
        }
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
    "dnc" to "Do Not Call",
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

        // The action queue, not a status list — see MainViewModel.LeadFilter.
        val callable = app.campaignContacts.count {
            val a = it.id?.let { id -> app.workByLead[id]?.actionState }
            a == "overdue" || a == "call_now"
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
            PaperCard(Modifier.fillMaxWidth()) {
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
                    PaperCard(Modifier.fillMaxWidth()) {
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

/**
 * The three settings that decide whether this rep's work is visible at all,
 * checked live, with a Fix button on each.
 *
 * Every report this week came back here: Shweta's sync dead five days, Ankita's
 * background worker last run 5 Aug then nothing for three, vishesh and sneha
 * with call-log permission off since 20 July. In every case the CRM knew and
 * the rep did not, because the only place it showed was an admin page they
 * never open. The setup gate asks at install; this answers any time.
 */
@Composable
private fun PhoneCheckCard(vm: MainViewModel) {
    val context = LocalContext.current
    var refresh by remember { mutableIntStateOf(0) }

    // Re-read whenever the rep comes back from a Settings screen, so a fix they
    // just made turns green without anyone knowing to reopen the app.
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(owner) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e ->
            if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) refresh++
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }

    val PC = com.salesautocall.app.data.PhoneCheck
    val calls = refresh.let { PC.readableCalls(context) }
    val logOk = refresh.let { PC.callLogGranted(context) } && calls != null
    val battOk = refresh.let { PC.batteryExempt(context) }
    val hasAutostart = remember { com.salesautocall.app.sip.OemAutostart.hasVendorScreen(context) }
    val autoOk = refresh.let { PC.autostartConfirmed(context) }
    val (allGood, verdict) = refresh.let { PC.verdict(context) }

    val good = androidx.compose.ui.graphics.Color(0xFF16A34A)
    val bad = MaterialTheme.colorScheme.error

    PaperCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            SettingHeader(
                if (allGood) Icons.Default.CheckCircle else Icons.Default.Warning,
                "Is my phone working?",
                "Check that your calls are reaching the office",
            )
            Spacer(Modifier.height(12.dp))
            Text(
                verdict,
                style = MaterialTheme.typography.bodyMedium,
                color = if (allGood) good else bad,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(14.dp))

            // The probe, not the permission flag. checkSelfPermission() says
            // GRANTED on OEM builds that then hand back nothing, so this counts
            // what the sync worker's own query actually returns.
            CheckRow(
                "Call working",
                when {
                    !PC.callLogGranted(context) -> "Permission is OFF — AI coach cannot read your calls"
                    calls == null -> "Phone is blocking it — AI coach cannot read your calls"
                    calls == 0 -> "No calls on this phone yet"
                    // The count was noise. A rep does not need to know the number
                    // of rows on their handset — they need to know it works.
                    else -> "Your calls reach the AI coach"
                },
                logOk,
            ) {
                runCatching {
                    context.startActivity(
                        android.content.Intent(
                            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            android.net.Uri.parse("package:${context.packageName}"),
                        ),
                    )
                }
            }
            CheckRow(
                "Works in background",
                if (battOk) "Phone will not sleep the app" else "Phone is sleeping the app",
                battOk,
            ) {
                runCatching {
                    context.startActivity(
                        android.content.Intent(
                            android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            android.net.Uri.parse("package:${context.packageName}"),
                        ),
                    )
                }
            }
            if (hasAutostart) {
                // Android gives no way to READ this one, so it shows what the rep
                // told us and stays one tap from the screen either way.
                CheckRow(
                    "Starts on its own",
                    if (autoOk) "You confirmed this is on" else "Not confirmed yet",
                    autoOk,
                ) { runCatching { com.salesautocall.app.sip.OemAutostart.open(context) } }
            }
            CheckRow(
                "Microphone",
                if (PC.micGranted(context)) "Voice notes working for the AI"
                else "Permission is OFF — the AI cannot hear your voice notes",
                refresh.let { PC.micGranted(context) },
            ) {
                runCatching {
                    context.startActivity(
                        android.content.Intent(
                            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            android.net.Uri.parse("package:${context.packageName}"),
                        ),
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            // A TEST, and it shows its answer. "Sent ✓" is a promise, not a
            // result — the rep wants the two numbers that settle it: how many
            // calls are on this phone, and how many the office now has.
            val app by vm.state.collectAsState()
            Box(
                Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable(enabled = !app.syncTestBusy) { vm.runSyncNow(); refresh++ },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (app.syncTestBusy) "Testing…" else "Test",
                    color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold,
                )
            }
            app.syncTestResult?.let { r ->
                Spacer(Modifier.height(10.dp))
                val bad = r.startsWith("❌") || r.startsWith("⚠️")
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .background(
                            (if (bad) MaterialTheme.colorScheme.error
                             else androidx.compose.ui.graphics.Color(0xFF16A34A)).copy(alpha = 0.10f),
                        )
                        .padding(horizontal = 11.dp, vertical = 9.dp),
                ) {
                    Text(
                        r,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (bad) MaterialTheme.colorScheme.error
                                else androidx.compose.ui.graphics.Color(0xFF16A34A),
                        fontWeight = FontWeight.Medium,
                        lineHeight = 17.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun CheckRow(title: String, detail: String, ok: Boolean, onFix: () -> Unit) {
    val good = androidx.compose.ui.graphics.Color(0xFF16A34A)
    Row(
        Modifier.fillMaxWidth().padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (ok) "✅" else "❌", fontSize = 16.sp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(detail, style = MaterialTheme.typography.bodySmall,
                color = if (ok) good else MaterialTheme.colorScheme.error)
        }
        if (!ok) {
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                    .clickable { onFix() }.padding(horizontal = 14.dp, vertical = 7.dp),
            ) {
                Text("Fix", color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
        }
    }
}
