package com.salesautocall.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

private data class Perm(
    val keys: List<String>,
    val icon: ImageVector,
    val title: String,
    val reason: String,
    val essential: Boolean,
)

/** Build the list of permissions this app actually uses, in plain language.
 *  POST_NOTIFICATIONS only exists on Android 13+. */
private fun permRows(): List<Perm> = buildList {
    add(Perm(listOf(Manifest.permission.CALL_PHONE), Icons.Default.Call, "Phone calls", "Place calls to your leads", true))
    add(Perm(listOf(Manifest.permission.READ_PHONE_STATE), Icons.Default.Smartphone, "Phone state", "Know when a call ends — to log it and dial the next", true))
    add(Perm(listOf(Manifest.permission.READ_CALL_LOG), Icons.Default.History, "Call history", "Show your recent calls and match them to leads", true))
    add(Perm(listOf(Manifest.permission.RECORD_AUDIO), Icons.Default.Mic, "Microphone", "Attach call recordings and voice-type your notes", true))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        add(Perm(listOf(Manifest.permission.POST_NOTIFICATIONS), Icons.Default.Notifications, "Notifications", "Follow-up reminders and new-lead alerts", true))
    }
    add(Perm(listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), Icons.Default.LocationOn, "Location", "Attendance check-in and territory (optional)", false))
    add(Perm(listOf(Manifest.permission.ANSWER_PHONE_CALLS), Icons.Default.Call, "Answer calls", "One-tap answer for cloud callbacks (optional)", false))
}

/**
 * Friendly one-screen permission request — each permission with a reason, a
 * per-row grant, a green tick when done, and one "Allow all" / "Continue".
 * Far higher grant rates than firing raw system dialogs with no context.
 */
@Composable
fun PermissionOnboarding(onDone: () -> Unit) {
    val context = LocalContext.current
    val rows = remember { permRows() }
    var refresh by remember { mutableIntStateOf(0) }

    fun granted(p: Perm): Boolean = refresh.let {
        p.keys.any { k -> ContextCompat.checkSelfPermission(context, k) == PackageManager.PERMISSION_GRANTED }
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refresh++ }

    val essentialsLeft = rows.filter { it.essential && !granted(it) }
    val anyLeft = rows.filter { !granted(it) }

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))
        Box(Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(38.dp))
        }
        Spacer(Modifier.height(16.dp))
        Text("Allow access", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            "Call Pro AI needs these to place calls, log your work and remind you — nothing else.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))

        rows.forEach { p ->
            val ok = granted(p)
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surface).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                    Icon(p.icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.size(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(p.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(p.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.size(10.dp))
                if (ok) {
                    Box(Modifier.size(32.dp).clip(CircleShape).background(Color16A34A.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Check, contentDescription = "Granted", tint = Color16A34A, modifier = Modifier.size(20.dp))
                    }
                } else {
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                            .clickable { launcher.launch(p.keys.toTypedArray()) }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    ) {
                        Text("Allow", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        Spacer(Modifier.height(10.dp))
        if (anyLeft.isNotEmpty()) {
            Button(
                onClick = { launcher.launch(anyLeft.flatMap { it.keys }.distinct().toTypedArray()) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text("Allow all", fontWeight = FontWeight.Bold) }
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
                Text(if (essentialsLeft.isEmpty()) "Continue" else "Skip for now")
            }
        } else {
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text("Continue", fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

private val Color16A34A = androidx.compose.ui.graphics.Color(0xFF0E7C66)
