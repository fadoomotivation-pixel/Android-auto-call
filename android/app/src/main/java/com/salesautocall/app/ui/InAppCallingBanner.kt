package com.salesautocall.app.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.incall.DefaultDialer

/**
 * One-tap upgrade card shown while the app is not yet the default phone app.
 * Becoming the default dialer is what keeps calls (and their recording) fully
 * inside the CRM instead of bouncing to the system dialer.
 *
 * If Android denies the role (Google Play Protect blocks sideloaded APKs with
 * "App was denied access to be default Phone app"), a help dialog walks the
 * user through allowing restricted settings and retrying.
 */
@Composable
fun InAppCallingBanner(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var isDefault by remember { mutableStateOf(DefaultDialer.isDefault(context)) }
    var requested by remember { mutableStateOf(false) }
    var showHelp by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        isDefault = DefaultDialer.isDefault(context)
        // The system said no (Play Protect blocks sideloaded apps) — guide the fix.
        if (!isDefault && requested) showHelp = true
    }

    fun requestRole() {
        requested = true
        DefaultDialer.requestIntent(context)?.let { launcher.launch(it) }
    }

    if (showHelp) {
        DeniedHelpDialog(
            onDismiss = { showHelp = false },
            onOpenAppSettings = {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            },
            onOpenDefaultApps = {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            },
            onRetry = { showHelp = false; requestRole() },
        )
    }

    if (isDefault) return

    Column(modifier.fillMaxWidth()) {
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF1E3A8A), Color(0xFF312E81))))
                .clickable { requestRole() }
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(Color(0x33FFFFFF)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.PhoneInTalk, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "Turn on in-app calling",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold, color = Color.White,
                )
                Text(
                    "Calls stay inside the CRM and recording works — set Call Pro AI as your phone app.",
                    style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f),
                )
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(Color.White)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    "Enable",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold, color = Color(0xFF1E3A8A),
                )
            }
        }
    }
}

@Composable
private fun DeniedHelpDialog(
    onDismiss: () -> Unit,
    onOpenAppSettings: () -> Unit,
    onOpenDefaultApps: () -> Unit,
    onRetry: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Phone app permission blocked") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    "Google Play Protect blocks apps installed outside the Play Store from " +
                        "becoming the phone app. It takes 1 minute to allow it:",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(10.dp))
                Step("1", "Tap “Open app settings” below (Call Pro AI's App info page opens).")
                Step("2", "Tap the ⋮ menu in the top-right corner → “Allow restricted settings”. Confirm.")
                Step("3", "Come back here and tap “Try again”.")
                Spacer(Modifier.height(10.dp))
                Text(
                    "Still blocked? Use “Default apps” below → Phone app → choose Call Pro AI. " +
                        "(On some phones: Settings → Google → All services → Play Protect → turn " +
                        "scanning off temporarily, enable, then turn it back on.)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = onOpenAppSettings, modifier = Modifier.fillMaxWidth()) {
                    Text("⚙️ Open app settings")
                }
                TextButton(onClick = onOpenDefaultApps, modifier = Modifier.fillMaxWidth()) {
                    Text("📱 Open Default apps")
                }
            }
        },
        confirmButton = { TextButton(onClick = onRetry) { Text("Try again") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Later") } },
    )
}

@Composable
private fun Step(n: String, text: String) {
    Row(Modifier.padding(vertical = 3.dp)) {
        Box(
            Modifier.size(20.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Text(n, color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
    }
}
