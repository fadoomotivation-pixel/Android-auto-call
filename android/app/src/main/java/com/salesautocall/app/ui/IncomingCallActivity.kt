package com.salesautocall.app.ui

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.notify.IncomingCallNotifier
import com.salesautocall.app.sip.SipManager

/** Full-screen ringing screen for an incoming cloud (SIP) call. Shows over the
 *  lock screen and turns the screen on, like a normal phone call. */
class IncomingCallActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            )
        }

        // Notification action buttons route here with an action — act immediately.
        when (intent?.action) {
            IncomingCallNotifier.ACTION_ACCEPT -> { accept(); return }
            IncomingCallNotifier.ACTION_DECLINE -> { decline(); return }
        }

        val number = intent?.getStringExtra(IncomingCallNotifier.EXTRA_NUMBER) ?: "Unknown"
        setContent {
            AppTheme { IncomingCallScreen(number, onAccept = { accept() }, onReject = { decline() }) }
        }
    }

    private fun accept() {
        runCatching { SipManager.acceptIncomingCall() }
        IncomingCallNotifier.cancel(this)
        finish()
    }

    private fun decline() {
        runCatching { SipManager.hangup() }
        IncomingCallNotifier.cancel(this)
        finish()
    }
}

@Composable
private fun IncomingCallScreen(number: String, onAccept: () -> Unit, onReject: () -> Unit) {
    Box(
        Modifier.fillMaxSize().background(Brush()),
        contentAlignment = Alignment.Center,
    ) {
        Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(96.dp))
            Text("Incoming cloud call", color = Color.White.copy(alpha = 0.8f), fontSize = 16.sp)
            Spacer(Modifier.height(12.dp))
            Text(number, color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                CallButton("Decline", Icons.Default.CallEnd, Color(0xFFEF4444), onReject)
                CallButton("Answer", Icons.Default.Call, Color(0xFF16A34A), onAccept)
            }
            Spacer(Modifier.height(48.dp))
        }
    }
}

@Composable
private fun Brush() = androidx.compose.ui.graphics.Brush.verticalGradient(
    listOf(Color(0xFF0C1426), Color(0xFF1E3A8A)),
)

@Composable
private fun CallButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(72.dp).clip(CircleShape).background(color).clickable { onClick() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(34.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(label, color = Color.White, fontSize = 14.sp)
    }
}
