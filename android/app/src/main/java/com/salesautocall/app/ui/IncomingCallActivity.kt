package com.salesautocall.app.ui

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.notify.IncomingCallNotifier
import com.salesautocall.app.sip.SipManager

/** Full-screen ringing + in-call screen for an incoming cloud (SIP) call. Stays in
 *  the foreground while the call is connected, which keeps the mic/audio alive and
 *  gives the rep Speaker/Mute/Hang-up controls. Shows over the lock screen. */
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

        if (intent?.action == IncomingCallNotifier.ACTION_DECLINE) { decline(); return }

        val number = intent?.getStringExtra(IncomingCallNotifier.EXTRA_NUMBER) ?: "Unknown"
        val startInCall = intent?.action == IncomingCallNotifier.ACTION_ACCEPT
        if (startInCall) doAccept()

        setContent {
            AppTheme {
                val state by SipManager.callState.collectAsState()
                var inCall by remember { mutableStateOf(startInCall) }
                var muted by remember { mutableStateOf(false) }
                var speaker by remember { mutableStateOf(false) }
                var connectedAt by remember { mutableStateOf(0L) }

                LaunchedEffect(state) {
                    if (state == "connected" && connectedAt == 0L) connectedAt = System.currentTimeMillis()
                    if (state == "ended" || state == "idle") finish()
                }

                Box(Modifier.fillMaxSize().background(callBackground()), contentAlignment = Alignment.Center) {
                    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Spacer(Modifier.height(64.dp))
                        Text(if (inCall) "Cloud call" else "Incoming cloud call",
                            color = Color.White.copy(alpha = 0.8f), fontSize = 16.sp)
                        Spacer(Modifier.height(20.dp))
                        CallAvatar(number)
                        Spacer(Modifier.height(18.dp))
                        Text(number, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        if (inCall) CallStatusLine(connectedAt, "Connected")
                        else Text("Ringing…", color = Color.White.copy(alpha = 0.85f), fontSize = 16.sp)
                        Spacer(Modifier.weight(1f))

                        if (inCall) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                                ToggleButton(if (muted) "Unmute" else "Mute", if (muted) Icons.Default.MicOff else Icons.Default.Mic, muted) {
                                    muted = !muted; SipManager.setMuted(muted)
                                }
                                ToggleButton("Speaker", Icons.Default.VolumeUp, speaker) {
                                    speaker = !speaker; SipManager.setSpeaker(speaker)
                                }
                            }
                            Spacer(Modifier.height(28.dp))
                            CallButton("Hang up", Icons.Default.CallEnd, Color(0xFFD64545)) { decline() }
                        } else {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                                CallButton("Decline", Icons.Default.CallEnd, Color(0xFFD64545)) { decline() }
                                CallButton("Answer", Icons.Default.Call, Color(0xFF4353B8)) {
                                    doAccept(); inCall = true
                                }
                            }
                        }
                        Spacer(Modifier.height(48.dp))
                    }
                }
            }
        }
    }

    private fun doAccept() {
        // Re-assert the foreground service (microphone|phoneCall) from this visible
        // activity FIRST: on Android 14+ that's what grants the SIP audio capture
        // while-in-use mic access. Without it the call connects but the mic is muted
        // (no audio either way, drops at ~30s on RTP timeout).
        runCatching { com.salesautocall.app.sip.SipBackgroundService.start(this) }
        runCatching { SipManager.acceptIncomingCall() }
        IncomingCallNotifier.cancel(this)
    }

    private fun decline() {
        runCatching { SipManager.hangup() }
        IncomingCallNotifier.cancel(this)
        finish()
    }
}

@Composable
private fun callBackground() = androidx.compose.ui.graphics.Brush.verticalGradient(
    listOf(Color(0xFF0C1426), Color(0xFF1E3A8A)),
)

@Composable
private fun CallButton(label: String, icon: ImageVector, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(color).clickable { onClick() }, contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(34.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(label, color = Color.White, fontSize = 14.sp)
    }
}

@Composable
private fun ToggleButton(label: String, icon: ImageVector, active: Boolean, onClick: () -> Unit) {
    val bg = if (active) Color.White else Color.White.copy(alpha = 0.15f)
    val fg = if (active) Color(0xFF0C1426) else Color.White
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(60.dp).clip(CircleShape).background(bg)
                .border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape).clickable { onClick() },
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = label, tint = fg, modifier = Modifier.size(26.dp)) }
        Spacer(Modifier.height(8.dp))
        Text(label, color = Color.White, fontSize = 13.sp)
    }
}
