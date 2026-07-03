package com.salesautocall.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Surface
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.viewmodel.compose.viewModel
import com.salesautocall.app.dialer.DialPrefill
import com.salesautocall.app.ui.AppRoot
import com.salesautocall.app.ui.AppTheme
import com.salesautocall.app.ui.MainViewModel

class MainActivity : ComponentActivity() {

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { /* no-op */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()
        handleDialIntent(intent)

        setContent {
            AppTheme {
                Surface {
                    val vm: MainViewModel = viewModel()
                    AppRoot(vm)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDialIntent(intent)
    }

    /** ACTION_DIAL / tel: links land here now that we're a dialer app — prefill the keypad. */
    private fun handleDialIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action != Intent.ACTION_DIAL && intent.action != Intent.ACTION_VIEW) return
        val number = intent.data?.takeIf { it.scheme == "tel" }?.schemeSpecificPart
        if (!number.isNullOrBlank()) DialPrefill.pending.value = Uri.decode(number)
    }

    private fun requestRuntimePermissions() {
        val perms = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms += Manifest.permission.POST_NOTIFICATIONS
        }
        permissionLauncher.launch(perms.toTypedArray())
    }
}
