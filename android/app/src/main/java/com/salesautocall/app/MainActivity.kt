package com.salesautocall.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.activity.viewModels
import com.salesautocall.app.ui.AppRoot
import com.salesautocall.app.ui.AppTheme
import com.salesautocall.app.ui.MainViewModel
import com.salesautocall.app.ui.PermissionOnboarding
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.ExistingWorkPolicy
import java.util.concurrent.TimeUnit
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.CallLogSyncWorker
import com.salesautocall.app.data.RecordingSyncWorker

class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Background sync (call logs + the revenue-critical recording upload).
        // Centralised so app launch and device boot schedule the exact same
        // hardened jobs. See SyncWorkers.
        com.salesautocall.app.data.SyncWorkers.schedule(this)

        setContent {
            AppTheme {
                Surface {
                    // First run (or missing essentials): a friendly one-screen
                    // permission request with reasons, instead of a raw dialog burst.
                    var showPerms by remember { mutableStateOf(!essentialsGranted()) }
                    if (showPerms) PermissionOnboarding(onDone = { showPerms = false })
                    else AppRoot(vm)
                }
            }
        }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val openId = intent?.getStringExtra("open_contact_id")
        if (openId != null) {
            vm.requestOpenContact(openId)
            intent?.removeExtra("open_contact_id")
        }
        val autoCallId = intent?.getStringExtra("auto_call_contact_id")
        if (autoCallId != null) {
            vm.requestAutoCall(autoCallId)
            intent?.removeExtra("auto_call_contact_id")
        }
        // Notification deep-link to a bottom tab (e.g. Morning Brief → Leads).
        val openTab = intent?.getStringExtra("open_tab")
        if (openTab != null) {
            if (openTab in setOf("home", "leads", "dialer", "campaign", "calls")) vm.goToTab(openTab)
            intent?.removeExtra("open_tab")
        }
    }

    override fun onResume() {
        super.onResume()
        checkBatteryOptimization()
        // Trigger a one-off sync when the app opens (deduped by REPLACE), gated on a
        // network so it doesn't spin without connectivity.
        WorkManager.getInstance(this).enqueueUniqueWork(
            "CallLogSyncOneOff",
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<CallLogSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
        )
    }

    private fun checkBatteryOptimization() {
        // THIS USED TO ASK ONLY SIP USERS, AND THAT WAS THE BUG.
        //
        // The old reasoning was that Doze exemption is only needed to keep the
        // in-app SIP inbound listener alive, so plain SIM reps were skipped to
        // save their battery. But CallLogSyncWorker and RecordingSyncWorker are
        // how a SIM rep's work reaches the CRM at all, and Doze suspends
        // WorkManager. So the reps who most needed the exemption were the only
        // ones never asked — their calls arrived hours late or not at all,
        // which is exactly the "Shweta's call log doesn't match the dashboard"
        // report. I chased that as a capture bug and built a device heartbeat
        // for it; the heartbeat was worth having, but this line was the cause.
        //
        // Everyone is asked now. The prompt is also a proper step in
        // PermissionOnboarding with a reason attached — this remains only as a
        // safety net for installs that predate it.
        //
        // ONCE, though. This runs on every onResume, so an unguarded ask is a
        // Settings screen in the rep's face every time they switch back to the
        // app — the fastest way to teach someone to dismiss our dialogs without
        // reading them. If they decline, the onboarding row still carries the
        // ask with its reason attached, and they can grant it whenever.
        if (AppPrefs.getBatteryAsked(this)) return
        // ...and never over the onboarding screen. onResume fires while that
        // screen is up, so an ungated ask would fling Settings at the rep
        // before they have read a single line of what the app wants or why.
        // While essentials are missing, PermissionOnboarding owns the ask.
        if (!essentialsGranted()) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            runCatching { startActivity(intent) }.onSuccess { AppPrefs.setBatteryAsked(this, true) }
        }
    }

    /** True when the permissions the app can't function without are all granted. */
    private fun essentialsGranted(): Boolean {
        val essentials = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.RECORD_AUDIO,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            essentials += Manifest.permission.POST_NOTIFICATIONS
        }
        return essentials.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }
    }
}
