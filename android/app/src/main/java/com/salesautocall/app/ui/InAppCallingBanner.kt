package com.salesautocall.app.ui

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
 */
@Composable
fun InAppCallingBanner(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var isDefault by remember { mutableStateOf(DefaultDialer.isDefault(context)) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        isDefault = DefaultDialer.isDefault(context)
    }
    if (isDefault) return

    Column(modifier.fillMaxWidth()) {
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF1E3A8A), Color(0xFF312E81))))
                .clickable {
                    DefaultDialer.requestIntent(context)?.let { launcher.launch(it) }
                }
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
