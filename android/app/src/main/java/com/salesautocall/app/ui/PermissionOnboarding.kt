package com.salesautocall.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

// ════════════════════════════════════════════════════════════════════════════
//  THE APP DOES NOT OPEN UNTIL IT CAN DO ITS JOB.
//
//  This screen used to be a friendly first-run request with a "Skip for now"
//  underneath it, and skipping is exactly what happened. Today's Phone Health
//  page, in the founder's own words:
//
//    Shweta   · Sync stopped    "Call sync 5 din se band hai"   73 out, 0 in
//    vishesh  · Permission off  "Incoming aur missed calls CRM me nahi aa rahi"
//    sneha    · Permission off  same, since 20 July
//
//  Every one of those is a permission or a battery setting that was never
//  granted or got reset — and every one had been sitting there for days,
//  because the only thing the system did about it was print an instruction on
//  an admin dashboard for somebody to WhatsApp to the rep. A rep does not read
//  a WhatsApp about Settings → Apps → Permissions while they are trying to hit
//  their call target, and the super admin meanwhile has no idea who was called
//  or for how long.
//
//  So the app blocks. If it cannot log calls, the calls it cannot log are
//  invisible to everyone — and an app that silently reports nothing is worse
//  than an app that says "one tap and I'm working again".
//
//  What makes that fair rather than cruel is that every blocker here is one
//  tap from being fixed: the button opens the exact system screen, and coming
//  back re-checks automatically. No menu-hunting, no instructions to follow.
// ════════════════════════════════════════════════════════════════════════════

private data class Perm(
    val keys: List<String>,
    val icon: ImageVector,
    val title: String,
    val reason: String,
    val essential: Boolean,
)

/** Build the list of permissions this app actually uses, in plain language.
 *  POST_NOTIFICATIONS only exists on Android 13+.
 *
 *  The reasons say what BREAKS, and they say it from the REP's side. "Call
 *  history" means nothing to a telecaller, and "your calls never reach the
 *  office" — the first wording here — reads as surveillance, which is a poor
 *  argument for handing over a permission. The same fact told the other way
 *  round is the true one and the persuasive one: without the call log the AI
 *  has nothing to read, so the coaching, the daily tip and the reminders all
 *  quietly stop. The rep loses their own tool, not just the office's report. */
private fun permRows(): List<Perm> = buildList {
    add(Perm(listOf(Manifest.permission.CALL_PHONE), Icons.Default.Call, "Make calls", "So you can dial a lead from the app", true))
    add(Perm(listOf(Manifest.permission.READ_PHONE_STATE), Icons.Default.Smartphone, "Know when a call ends", "So the app can log it and move to the next lead", true))
    add(Perm(listOf(Manifest.permission.READ_CALL_LOG), Icons.Default.History, "Call log", "Without this the AI will not work properly — no call coaching, no reminders", true))
    add(Perm(listOf(Manifest.permission.RECORD_AUDIO), Icons.Default.Mic, "Microphone", "Call recordings and voice notes", true))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        add(Perm(listOf(Manifest.permission.POST_NOTIFICATIONS), Icons.Default.Notifications, "Notifications", "Callback reminders and new lead alerts", true))
    }
    add(Perm(listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), Icons.Default.LocationOn, "Location", "Attendance check-in (optional)", false))
    add(Perm(listOf(Manifest.permission.ANSWER_PHONE_CALLS), Icons.Default.Call, "Answer calls", "One-tap answer for cloud callbacks (optional)", false))
}

private fun permGranted(context: Context, p: Perm): Boolean =
    p.keys.any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

private fun batteryExempt(context: Context): Boolean =
    (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
        .isIgnoringBatteryOptimizations(context.packageName)

private fun batteryIntent(context: Context) =
    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))

/**
 * Can this phone even offer the Doze exemption?
 *
 * Fail OPEN. A handful of OEM builds strip that Settings screen out, and
 * blocking a rep behind a button that opens nothing would be the one way this
 * gate could stop someone working for a reason they cannot fix. If the phone
 * cannot be asked, the app runs — degraded sync beats no app.
 */
private fun batteryAskable(context: Context): Boolean =
    runCatching { batteryIntent(context).resolveActivity(context.packageManager) != null }.getOrDefault(false)

/**
 * Everything the app needs before it is allowed to open. MainActivity checks
 * this on create AND on every resume, so a permission revoked mid-week puts the
 * rep back on this screen instead of quietly breaking their sync.
 */
private fun autostartNeeded(context: Context): Boolean =
    com.salesautocall.app.sip.OemAutostart.hasVendorScreen(context) &&
        !com.salesautocall.app.data.AppPrefs.getAutostartConfirmed(context)

/**
 * How long a successful sync stays proof. Beyond this the phone has to show it
 * again before the app opens.
 *
 * Twelve hours, not one. The gate must catch a handset that has gone dark for a
 * DAY — Ankita's went three — without locking a rep out of the app because they
 * walked into a basement. The periodic worker is every 15 minutes and a call end
 * triggers one inline, so on a healthy phone this is renewed dozens of times a
 * shift and the rep never sees the gate at all.
 */
private const val SYNC_PROOF_HOURS = 12L

/**
 * Has this phone actually delivered a call log, recently?
 *
 * NOT "is the permission granted". Three green permission ticks proved nothing
 * on Shweta's phone, and Ankita's Xiaomi held every permission it needed while
 * syncing nothing for three days. The only honest question is whether a scan
 * has COMPLETED, and the only place that can be answered offline is the phone
 * itself — see AppPrefs.getLastSyncOkAt.
 */
fun syncProven(context: Context): Boolean {
    val at = com.salesautocall.app.data.AppPrefs.getLastSyncOkAt(context)
    if (at <= 0L) return false
    return System.currentTimeMillis() - at < SYNC_PROOF_HOURS * 60 * 60 * 1000
}

/** Never synced at all, versus synced once and gone quiet. Different sentences. */
fun syncNeverRan(context: Context): Boolean =
    com.salesautocall.app.data.AppPrefs.getLastSyncOkAt(context) <= 0L

/**
 * THE GATE. Call-log sync is not a setting, it is the product.
 *
 * A rep whose calls do not reach the office is not "partly working" — every
 * screen behind this one lies to them and to their founder. Leads, Follow-up,
 * the Action Centre and the whole day's work stay shut until the phone has
 * PROVED it can deliver, not merely claimed it is allowed to.
 */
fun setupComplete(context: Context): Boolean =
    permRows().none { it.essential && !permGranted(context, it) } &&
        (!batteryAskable(context) || batteryExempt(context)) &&
        !autostartNeeded(context) &&
        syncProven(context)

@Composable
fun PermissionOnboarding(onReady: () -> Unit) {
    val context = LocalContext.current
    val rows = remember { permRows() }
    val canAskBattery = remember { batteryAskable(context) }
    // MIUI / ColorOS / Funtouch kill background work whatever Android's own
    // battery settings say. Ankita's Xiaomi ran its call-log sync once on 5 Aug
    // and then not again for three days — Doze exemption was beside the point.
    // OemAutostart has existed all along and was only ever called when a rep
    // switched ON cloud incoming calls, so for every SIM telecaller on the
    // platform it never ran once. Same shape as the battery bug it sits next to.
    val canAskAutostart = remember { com.salesautocall.app.sip.OemAutostart.hasVendorScreen(context) }
    // Two taps on purpose: open the vendor screen, come back, confirm. There is
    // no API to read Autostart state, so this is the only row here that cannot
    // be verified — see AppPrefs.getAutostartConfirmed. Asking and being told is
    // strictly better than what happened before, which was never asking.
    var autostartVisited by remember { mutableStateOf(false) }
    var refresh by remember { mutableIntStateOf(0) }

    // Which rows we have already fired the system dialog for. A permission
    // still denied after that is a "Don't ask again" — Android will never show
    // the dialog again, so the button has to switch to the app's Settings page
    // or the rep taps a button that visibly does nothing, forever.
    var tried by remember { mutableStateOf(setOf<String>()) }

    fun granted(p: Perm): Boolean = refresh.let { permGranted(context, p) }
    fun batteryOk(): Boolean = refresh.let { batteryExempt(context) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refresh++ }
    // Android returns nothing useful from the battery dialog — the result code
    // is the same whether they allowed it or backed out — so we simply re-read
    // the real state when they come back.
    val settingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { refresh++ }

    // The whole reason this is easy: fix something in Settings, press back, and
    // the tick turns green on its own. Nobody has to know to reopen the app.
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refresh++
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    val missing = rows.filter { it.essential && !granted(it) }
    val batteryBlocking = canAskBattery && !batteryOk()
    val autostartBlocking = refresh.let {
        canAskAutostart && !com.salesautocall.app.data.AppPrefs.getAutostartConfirmed(context)
    }
    // THE LAST STEP, AND THE ONLY ONE THAT IS EVIDENCE.
    //
    // Permissions and battery are permission to try. This is whether it worked.
    // It is checked last because the other three have to be right before a scan
    // can succeed, so fixing them in order is also the fastest route out of
    // this screen.
    val syncBlocking = refresh.let { !syncProven(context) }
    val left = missing.size + (if (batteryBlocking) 1 else 0) +
        (if (autostartBlocking) 1 else 0) + (if (syncBlocking) 1 else 0)
    // Running the proof, and what it said if it failed.
    val scope = rememberCoroutineScope()
    var checking by remember { mutableStateOf(false) }
    var checkFailed by remember { mutableStateOf<String?>(null) }

    // Nothing left to fix — let them in, without a tap. The rep who just
    // granted the last permission should find themselves in the app, not
    // looking at a "Continue" button asking them to confirm they are done.
    //
    // Wrapped rather than early-returned: an early return out of a @Composable
    // after emitting nodes is the sort of thing that works until a recomposition
    // orders it differently, and this screen is the one thing standing between a
    // rep and a day of unlogged calls.
    LaunchedEffect(left) { if (left == 0) onReady() }

    // A rep who is only held up by the sync proof should not have to know to
    // press anything. If the office already has calls from this phone, that IS
    // the proof — check once, silently, the moment this becomes the last thing
    // standing. Keyed on syncBlocking, so it runs once and stops the moment it
    // succeeds rather than looping on its own refresh.
    LaunchedEffect(syncBlocking) {
        if (syncBlocking) {
            runCatching {
                withContext(Dispatchers.IO) {
                    com.salesautocall.app.data.Repository.serverSeenDelivery(context)
                }
            }
            refresh++
        }
    }

    // THE WAY OUT WHEN THIS SCREEN ITSELF IS THE BUG.
    //
    // The in-app updater lives BEHIND this gate, so a rep the gate has locked
    // out cannot reach it. When devansh singh was stuck, the fix was already
    // published and his phone had no way to ask for it — the only remedy left
    // was the founder sending him an APK link by hand, per rep, per bug.
    //
    // Offered whenever a newer build exists, never as a blocker: it does not
    // count toward `left`, and a rep who does not need it never sees it.
    var newBuild by remember { mutableStateOf<com.salesautocall.app.update.AppUpdater.Release?>(null) }
    var downloading by remember { mutableStateOf(false) }
    var downloadPct by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        newBuild = runCatching { com.salesautocall.app.update.AppUpdater.checkForUpdate() }.getOrNull()
    }

    fun askPerm(p: Perm) {
        if (p.keys.all { it in tried } && !granted(p)) {
            // "Don't ask again" territory: go straight to the app's own page.
            runCatching {
                settingsLauncher.launch(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")),
                )
            }
            return
        }
        tried = tried + p.keys
        launcher.launch(p.keys.toTypedArray())
    }

    if (left == 0) return

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.Shield, contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(34.dp))
        }
        Spacer(Modifier.height(14.dp))
        // Count it, so the rep can see the end of this. "Allow access" with an
        // unknown number of steps behind it is what makes people back out.
        Text(
            if (left == 1) "1 thing to allow" else "$left things to allow",
            style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Tap Allow, then come back. This screen closes on its own.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(18.dp))

        // The escape hatch, first, because if this screen is wrong then nothing
        // below it can be trusted to let the rep through.
        newBuild?.let { rel ->
            SetupRow(
                icon = Icons.Default.RestartAlt,
                title = if (downloading) "Downloading update…" else "A newer app is ready",
                reason = if (downloading)
                    "${(downloadPct * 100).toInt()}% — the installer opens on its own when it finishes"
                else
                    "You are on ${com.salesautocall.app.BuildConfig.VERSION_NAME}, and ${rel.versionName} is out. " +
                        "If this screen will not let you in, update first — the fix may already be in it.",
                done = false,
                actionLabel = if (downloading) "…" else "Update",
            ) {
                if (!downloading) {
                    downloading = true
                    downloadPct = 0f
                    scope.launch {
                        val file = runCatching {
                            com.salesautocall.app.update.AppUpdater.download(context, rel) { p -> downloadPct = p }
                        }.getOrNull()
                        if (file != null) {
                            com.salesautocall.app.update.AppUpdater.install(context, file)
                        }
                        downloading = false
                    }
                }
            }
        }

        // Battery first when it is the problem. It is the one that stops a
        // working phone dead — Shweta's sync had been off for five days with
        // every permission granted — and it is the one a rep would never guess
        // at, so it should not be at the bottom of a list.
        if (batteryBlocking) {
            SetupRow(
                icon = Icons.Default.BatteryFull,
                title = "Let the app work in the background",
                reason = "Your phone is putting the app to sleep, so the AI stops working for you",
                done = false,
            ) { runCatching { settingsLauncher.launch(batteryIntent(context)) } }
        }

        // THE PROOF STEP. Everything above is permission to try; this is the
        // phone actually delivering a call log. It stays shut until a scan has
        // COMPLETED, because three green permission ticks proved nothing on
        // Shweta's phone and Ankita's Xiaomi held every permission it needed
        // while syncing nothing for three days.
        //
        // Only offered once the others are done — a scan cannot succeed without
        // the call-log permission, and a button that always fails teaches the
        // rep to stop pressing it.
        if (syncBlocking && missing.isEmpty() && !batteryBlocking && !autostartBlocking) {
            SetupRow(
                icon = Icons.Default.History,
                title = if (checking) "Checking…" else "Send a test to the office",
                reason = checkFailed
                    ?: if (syncNeverRan(context))
                        "One tap to prove your calls reach the office. This is the last step."
                    else
                        "Your phone has not sent anything for a while. Tap to send now.",
                done = false,
                actionLabel = if (checking) "…" else "Check now",
            ) {
                if (!checking) {
                    checking = true
                    checkFailed = null
                    scope.launch {
                        val err = runCatching {
                            withContext(Dispatchers.IO) {
                                com.salesautocall.app.data.Repository.syncCallLogs(context)
                                // Local flag missing does not mean the phone
                                // never delivered — ask the office. See
                                // Repository.serverSeenDelivery.
                                if (!syncProven(context)) {
                                    com.salesautocall.app.data.Repository.serverSeenDelivery(context)
                                }
                            }
                        }.exceptionOrNull()
                        checking = false
                        // Never a guess. If it failed, say what failed — the rep
                        // reads this line out to whoever helps them.
                        // Name what failed. "Tell your admin" with nothing to
                        // tell them is what turned devansh singh's lockout into
                        // a three-round guessing game — the heartbeat write was
                        // failing silently and the screen had no way to say so.
                        val healthErr = com.salesautocall.app.data.AppPrefs.getHealthWriteError(context)
                        checkFailed = when {
                            err != null -> "Could not reach the office: ${err.javaClass.simpleName}. Check internet and tap again."
                            !syncProven(context) && healthErr != null ->
                                "The office would not accept this phone's report — $healthErr. Show this to your admin."
                            !syncProven(context) -> "The phone still will not hand over its call log. Tell your admin."
                            else -> null
                        }
                        refresh++
                    }
                }
            }
        }

        // AUTOSTART, second — the one that actually killed Ankita's sync for
        // three days. Android's battery exemption does not bind MIUI's own app
        // killer; only this screen does.
        if (autostartBlocking) {
            SetupRow(
                icon = Icons.Default.RestartAlt,
                title = if (autostartVisited) "Did you switch Autostart on?" else "Let the app start on its own",
                reason = if (autostartVisited)
                    "Find Call Pro AI in that list and turn it ON, then tap the tick here"
                else
                    "Your phone brand stops apps from starting by themselves. Without this your work stops reaching the office when the app is closed.",
                done = false,
                // The confirm tap gets its own label, because "Allow" twice in a
                // row on the same row is how a rep taps through without reading.
                actionLabel = if (autostartVisited) "✓ Yes, it's on" else "Open",
            ) {
                if (autostartVisited) {
                    com.salesautocall.app.data.AppPrefs.setAutostartConfirmed(context, true)
                    refresh++
                } else {
                    autostartVisited = true
                    runCatching { com.salesautocall.app.sip.OemAutostart.open(context) }
                }
            }
        }

        rows.forEach { p ->
            val ok = granted(p)
            // Optional rows are shown, never counted, never blocking — a rep
            // who wants attendance check-in can turn it on right here.
            SetupRow(p.icon, p.title, p.reason, ok) { askPerm(p) }
        }

        Spacer(Modifier.height(14.dp))
        Text(
            "The app needs all of these to work. " +
                "If a button does not open anything, tell your admin.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
    }
    // No Skip, and no Continue. Skip is how three reps ended up sitting on the
    // Phone Health page for days, and Continue is a tap that exists only to
    // confirm something the app can already see for itself.
}

@Composable
private fun SetupRow(
    icon: ImageVector,
    title: String,
    reason: String,
    done: Boolean,
    /** Button text. "Allow" for a real permission; the Autostart row uses
     *  "Open" then "✓ Yes, it's on", because two identical Allows in a row is
     *  how a rep taps through without reading either. */
    actionLabel: String = "Allow",
    onAllow: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(42.dp).clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(reason, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 16.sp)
        }
        Spacer(Modifier.size(10.dp))
        if (done) {
            Box(
                Modifier.size(32.dp).clip(CircleShape).background(OkGreen.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Check, contentDescription = "Allowed", tint = OkGreen,
                    modifier = Modifier.size(20.dp))
            }
        } else {
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                    .clickable { onAllow() }.padding(horizontal = 18.dp, vertical = 9.dp),
            ) {
                Text(actionLabel, color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
        }
    }
    Spacer(Modifier.height(10.dp))
}

private val OkGreen = Color(0xFF4353B8)
