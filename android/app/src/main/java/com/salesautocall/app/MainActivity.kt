package com.salesautocall.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.activity.viewModels
import com.salesautocall.app.ui.AppRoot
import com.salesautocall.app.ui.AppTheme
import com.salesautocall.app.ui.MainViewModel
import com.salesautocall.app.ui.PermissionOnboarding
import com.salesautocall.app.ui.setupComplete
import android.content.Intent
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import com.salesautocall.app.data.CallLogSyncWorker

class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()

    /** False while anything the app needs is missing — see PermissionOnboarding.
     *  Hoisted out of the composition so onResume can re-evaluate it. */
    private val setupOk = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Background sync (call logs + the revenue-critical recording upload).
        // Centralised so app launch and device boot schedule the exact same
        // hardened jobs. See SyncWorkers.
        com.salesautocall.app.data.SyncWorkers.schedule(this)

        setupOk.value = setupComplete(this)
        setContent {
            AppTheme {
                Surface {
                    // The app does not open until it can do its job. Re-checked
                    // on every resume (see onResume) rather than only at first
                    // run, because the failures on the Phone Health page are
                    // reps whose permissions were fine on install and got reset
                    // or Doze'd weeks later — Shweta's sync had been dead five
                    // days with nothing on her phone saying so.
                    //
                    // THE GATE GUARDS A SIGNED-IN REP, AND ONLY A SIGNED-IN REP.
                    //
                    // It used to be mounted on `!setupOk` alone, with no regard
                    // for auth — so a phone whose session had died was shown a
                    // PERMISSIONS screen and no way to reach the login screen
                    // behind it. Every button on that screen needs a session to
                    // do anything, so all of them failed, and the one it offers
                    // reported the failure as "The phone still will not hand
                    // over its call log. Tell your admin."
                    //
                    // devansh singh sat in that trap for two hours. His session
                    // was created at 08:37, its refresh token was never once
                    // exchanged, and his access token expired around 09:38 —
                    // after which syncCallLogs returned on its second line, at
                    // `currentUserId() ?: return`, before it could even record
                    // that it had run. He was told his call log was broken, told
                    // to call his admin, and handed a button that could not
                    // possibly work. Three APK updates changed nothing, because
                    // the app was never the problem.
                    //
                    // Signed out now means the login screen, which is what a
                    // signed-out phone should have shown all along.
                    val state by vm.state.collectAsState()
                    if (state.signedIn && !setupOk.value) {
                        PermissionOnboarding(onReady = { setupOk.value = true })
                    } else {
                        AppRoot(vm)
                    }
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
        // A permission revoked in Settings, or a battery optimisation the OEM
        // silently switched back on, puts the rep on the setup screen the next
        // time they open the app — instead of letting them work all day into a
        // CRM that is not receiving any of it.
        setupOk.value = setupComplete(this)
        // Re-resolve auth too. It used to run only at ViewModel init and at
        // login, so a session that DIED while the app was alive left signedIn
        // stuck at true forever — which is exactly how devansh singh stayed on
        // the setup screen for two hours after his token expired underneath
        // him. Only a genuinely absent session flips this to false (a network
        // blip leaves signedIn alone), so it cannot log a working rep out.
        vm.refreshSession()
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

    // essentialsGranted() and checkBatteryOptimization() both lived here and
    // both are gone. They were two different, disagreeing answers to "is this
    // phone set up?" — one counted runtime permissions and ignored Doze, the
    // other asked about Doze and only for SIP users. setupComplete() is the
    // single answer, and the screen that fixes it is the same screen that
    // defines it.
}
