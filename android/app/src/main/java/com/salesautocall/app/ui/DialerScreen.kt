package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val CallGreen = Color(0xFF22A45D)

private data class Key(val digit: String, val letters: String = "")

private val KEYPAD = listOf(
    Key("1"), Key("2", "ABC"), Key("3", "DEF"),
    Key("4", "GHI"), Key("5", "JKL"), Key("6", "MNO"),
    Key("7", "PQRS"), Key("8", "TUV"), Key("9", "WXYZ"),
    Key("*"), Key("0", "+"), Key("#"),
)

@Composable
fun DialerScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    var number by remember { mutableStateOf("") }
    val cloudAvailable = app.cloudEnabled || !app.profile?.sipAgentId.isNullOrBlank()
    var useCloud by remember(cloudAvailable) { mutableStateOf(cloudAvailable) }

    // Number handed in via ACTION_DIAL / tel: links (we're a dialer app now).
    val prefill by com.salesautocall.app.dialer.DialPrefill.pending.collectAsState()
    androidx.compose.runtime.LaunchedEffect(prefill) {
        com.salesautocall.app.dialer.DialPrefill.consume()?.let { number = it }
    }

    Column(
        Modifier.fillMaxSize().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))
        Text("Dialer", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

        InAppCallingBanner()

        // ---- call method: SIM (your number) vs Cloud (uroperator) ----
        if (cloudAvailable) {
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                ModePill("📱 SIM", !useCloud, Modifier.weight(1f)) { useCloud = false }
                ModePill("☁ Cloud", useCloud, Modifier.weight(1f)) { useCloud = true }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                if (useCloud) "Cloud: rings your phone, then connects the customer."
                else "SIM: dials directly from your phone's number.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }

        // ---- number display ----
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(
                text = number.ifEmpty { "Enter a number" },
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.SemiBold,
                color = if (number.isEmpty()) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
        }

        if (app.company?.recordingEnabled == true) {
            Text(
                "🎙️ This call will be recorded",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
        }

        // ---- keypad ----
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            KEYPAD.chunked(3).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { key ->
                        DialKey(key, Modifier.weight(1f)) { number += key.digit }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // ---- call row: spacer · call · backspace ----
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.weight(1f))
            Surface(
                shape = CircleShape,
                color = if (useCloud && cloudAvailable) MaterialTheme.colorScheme.primary else CallGreen,
                modifier = Modifier.size(68.dp).clickable(enabled = number.isNotBlank()) {
                    if (useCloud && cloudAvailable) vm.cloudCall(number.trim(), null, null)
                    else vm.dialManual(number)
                },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Call, contentDescription = "Call", tint = Color.White, modifier = Modifier.size(30.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                if (number.isNotEmpty()) {
                    IconButton(onClick = { number = number.dropLast(1) }) {
                        Icon(Icons.Default.Backspace, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun ModePill(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(50))
            .background(if (active) MaterialTheme.colorScheme.primary else Color.Transparent)
            .clickable { onClick() }
            .padding(vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun DialKey(key: Key, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .aspectRatio(1.6f)
            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(key.digit, fontSize = 26.sp, fontWeight = FontWeight.Medium)
            if (key.letters.isNotEmpty()) {
                Text(
                    key.letters, fontSize = 10.sp, letterSpacing = 1.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
