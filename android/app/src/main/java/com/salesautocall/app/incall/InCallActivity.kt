package com.salesautocall.app.incall

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.telecom.Call
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * Full-screen in-call UI shown for every SIM call while the app is the default
 * phone app. Launched by [CrmInCallService]; closes itself when the call ends.
 */
class InCallActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Show over the lock screen and light the display for incoming calls.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager)
                .requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            InCallScreen(onFinished = { finishAndRemoveTask() })
        }
    }
}

// Premium dark palette (matches the app drawer).
private val CallBgTop = Color(0xFF13214A)
private val CallBgBottom = Color(0xFF0C1426)
private val CallText = Color(0xFFEDF1FA)
private val CallMuted = Color(0xFF8A97AE)
private val AnswerGreen = Color(0xFF22C55E)
private val EndRed = Color(0xFFEF4444)
private val RecRed = Color(0xFFFF5252)
private val ChipBg = Color(0x1FFFFFFF)

@Composable
private fun InCallScreen(onFinished: () -> Unit) {
    val session by InCallSession.state.collectAsState()

    // Keep the last snapshot briefly so "Call ended" is visible before closing.
    var last by remember { mutableStateOf<InCallUiState?>(null) }
    session?.let { last = it }
    val ui = session ?: last

    LaunchedEffect(session == null) {
        if (session == null) {
            delay(1200)
            onFinished()
        }
    }

    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(CallBgTop, CallBgBottom))),
    ) {
        if (ui == null) return@Box
        val ringing = session != null && ui.callState == Call.STATE_RINGING && ui.incoming
        var showKeypad by remember { mutableStateOf(false) }

        Column(
            Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(12.dp))
            StatusLine(ui, ended = session == null)
            Spacer(Modifier.height(28.dp))

            // Avatar
            val label = ui.displayName ?: ui.phone
            Box(
                Modifier.size(104.dp).clip(CircleShape)
                    .background(Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)))),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label.trim().take(1).uppercase().ifBlank { "#" },
                    fontSize = 42.sp, fontWeight = FontWeight.Bold, color = Color.White,
                )
            }
            Spacer(Modifier.height(18.dp))
            Text(
                ui.displayName ?: ui.phone,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold, color = CallText, textAlign = TextAlign.Center,
            )
            if (ui.displayName != null) {
                Spacer(Modifier.height(4.dp))
                Text(ui.phone, style = MaterialTheme.typography.bodyMedium, color = CallMuted)
            }
            if (ui.recording) {
                Spacer(Modifier.height(12.dp))
                RecordingBadge()
            }
            if (ui.dtmfDigits.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text(ui.dtmfDigits, color = CallMuted, style = MaterialTheme.typography.titleMedium)
            }

            Spacer(Modifier.weight(1f))

            if (showKeypad && !ringing) {
                DtmfKeypad(onKey = { InCallSession.playDtmf(it) })
                Spacer(Modifier.height(20.dp))
            }

            if (ringing) {
                // Incoming: decline · answer
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    RoundAction(Icons.Default.CallEnd, "Decline", EndRed, size = 72.dp) { InCallSession.reject() }
                    RoundAction(Icons.Default.Call, "Answer", AnswerGreen, size = 72.dp) { InCallSession.answer() }
                }
            } else {
                // Active / dialing: mute · keypad · speaker, then end.
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    ToggleAction(
                        if (ui.muted) Icons.Default.MicOff else Icons.Default.Mic,
                        "Mute", active = ui.muted,
                    ) { InCallSession.toggleMute() }
                    ToggleAction(Icons.Default.Dialpad, "Keypad", active = showKeypad) { showKeypad = !showKeypad }
                    ToggleAction(Icons.Default.VolumeUp, "Speaker", active = ui.speakerOn) { InCallSession.toggleSpeaker() }
                }
                Spacer(Modifier.height(26.dp))
                RoundAction(Icons.Default.CallEnd, "End call", EndRed, size = 72.dp) { InCallSession.hangup() }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun StatusLine(ui: InCallUiState, ended: Boolean) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(ui.connectedAtMillis) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }
    val text = when {
        ended -> "Call ended"
        ui.callState == Call.STATE_RINGING && ui.incoming -> "Incoming call…"
        ui.callState == Call.STATE_DIALING || ui.callState == Call.STATE_CONNECTING -> "Calling…"
        ui.callState == Call.STATE_HOLDING -> "On hold"
        ui.connectedAtMillis > 0 -> formatTimer(((now - ui.connectedAtMillis) / 1000).coerceAtLeast(0))
        else -> "Connecting…"
    }
    Text(text, style = MaterialTheme.typography.titleMedium, color = CallMuted, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun RecordingBadge() {
    val pulse by rememberInfiniteTransition(label = "rec").animateFloat(
        initialValue = 1f, targetValue = 0.35f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "rec-alpha",
    )
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(ChipBg).padding(horizontal = 12.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).alpha(pulse).clip(CircleShape).background(RecRed))
        Spacer(Modifier.width(7.dp))
        Text("REC", style = MaterialTheme.typography.labelMedium, color = CallText, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun RoundAction(icon: ImageVector, label: String, color: Color, size: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(shape = CircleShape, color = color, modifier = Modifier.size(size).clickable { onClick() }) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(30.dp))
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = CallMuted)
    }
}

@Composable
private fun ToggleAction(icon: ImageVector, label: String, active: Boolean, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            shape = CircleShape,
            color = if (active) Color.White else ChipBg,
            modifier = Modifier.size(60.dp).clickable { onClick() },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    icon, contentDescription = label,
                    tint = if (active) CallBgBottom else CallText,
                    modifier = Modifier.size(26.dp),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = CallMuted)
    }
}

@Composable
private fun DtmfKeypad(onKey: (Char) -> Unit) {
    val rows = listOf("123", "456", "789", "*0#")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { c ->
                    Box(
                        Modifier.size(64.dp).clip(CircleShape).background(ChipBg)
                            .clickable { onKey(c) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(c.toString(), fontSize = 24.sp, fontWeight = FontWeight.Medium, color = CallText)
                    }
                }
            }
        }
    }
}

private fun formatTimer(sec: Long): String {
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}
