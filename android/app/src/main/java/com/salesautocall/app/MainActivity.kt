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

class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Hourly call-log sync, but only on a network and not when the battery is
        // low — so it never wakes the phone to fail or drain a dying battery.
        val workManager = WorkManager.getInstance(this)
        val syncConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        val periodicWork = PeriodicWorkRequestBuilder<CallLogSyncWorker>(1, TimeUnit.HOURS)
            .setConstraints(syncConstraints)
            .build()
        workManager.enqueueUniquePeriodicWork("CallLogSync", ExistingPeriodicWorkPolicy.KEEP, periodicWork)

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
        // Only ask to bypass Doze when the app genuinely needs to stay alive in the
        // background — i.e. the in-app SIP inbound listener is on. CallerDesk users
        // get inbound via the SIM + FCM (high-priority pushes wake the app even in
        // Doze), so leaving Doze ON for them saves a lot of battery and avoids the
        // repeated whitelist prompt.
        val needsBackgroundLiveness = AppPrefs.getIncomingEnabled(this) &&
            AppPrefs.getAgentId(this).isNotBlank() &&
            AppPrefs.getSipPassword(this).isNotBlank()
        if (!needsBackgroundLiveness) return

        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            runCatching { startActivity(intent) }
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
