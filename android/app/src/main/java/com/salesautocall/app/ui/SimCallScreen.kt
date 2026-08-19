package com.salesautocall.app.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.dialer.SimCallMonitor
import kotlinx.coroutines.delay
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType

// The call surface stays dark — see AppColors.Call for why that is the one
// deliberate exception to a light app. Every value now comes from there rather
// than from this file's own eight constants, which had drifted into a navy
// (#13214A → #0C1426) that matched nothing else and carried a blue-tinted
// gradient behind the whole screen.
private val CallBgTop = AppColors.Call.Bg
private val CallBgBottom = AppColors.Call.Bg
private val CallText = AppColors.Call.TextPrimary
private val CallMuted = AppColors.Call.TextSecondary
private val EndRed = AppColors.Call.End
private val RecRed = AppColors.Call.Recording
private val OkGreen = AppColors.Call.Accept
private val ChipBg = AppColors.Call.Control

/**
 * In-app SIM call screen — shown while ManualCallService / AutoDialerService is
 * driving a call. The system dialer still owns the call (no default-dialer role
 * needed); this gives the telecaller a CRM-side cockpit: live timer, REC toggle,
 * mute / speaker, end call, and a minimize chip so they can browse leads mid-call.
 */
@Composable
fun SimCallScreen() {
    val call by SimCallMonitor.state.collectAsState()
    val ui = call ?: return
    val context = LocalContext.current

    // The lead's name is resolved at dial time and carried on the call state, so
    // this screen needs no ViewModel — it can render in the app OR in the
    // system-overlay window that floats above the phone's own call screen.
    val displayName = ui.name

    if (ui.minimized) {
        // Floating on-call chip — browsing the CRM while the call runs.
        Box(Modifier.fillMaxSize().padding(bottom = 96.dp), contentAlignment = Alignment.BottomCenter) {
            Surface(
                shape = RoundedCornerShape(50),
                color = CallBgBottom,
                shadowElevation = 8.dp,
                modifier = Modifier.clickable { SimCallMonitor.setMinimized(false) },
            ) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PulsingDot(if (ui.recording) RecRed else OkGreen)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${displayName ?: ui.phone} · ${CallTimerText(ui.activeAtMillis, ui.phase)}",
                        color = CallText, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Open call screen", tint = CallMuted)
                }
            }
        }
        return
    }

    BackHandler { SimCallMonitor.setMinimized(true) }

    // Flat graphite. The vertical navy gradient it replaces is the "old dark
    // gradient" look the design direction rules out, and on OLED it banded.
    Box(Modifier.fillMaxSize().background(AppColors.Call.Bg)) {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Minimize — keep working in the CRM while the call continues.
            Row(Modifier.fillMaxWidth()) {
                IconButton(onClick = { SimCallMonitor.setMinimized(true) }) {
                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Minimize", tint = CallMuted)
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                if (ui.phase == "active") CallTimerText(ui.activeAtMillis, ui.phase) else "Calling…",
                // Monospaced: a proportional timer shifts sideways every time a
                // digit changes, which is unreadable at arm's length mid-call.
                style = AppType.timer, color = AppColors.Call.TextSecondary,
            )
            Spacer(Modifier.height(24.dp))

            val label = displayName ?: ui.phone
            Box(
                Modifier.size(100.dp).clip(CircleShape)
                    .background(AppColors.Call.BgElevated),
                contentAlignment = Alignment.Center,
            ) {
                Text(label.trim().take(1).uppercase().ifBlank { "#" }, fontSize = 40.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            Spacer(Modifier.height(16.dp))
            Text(label, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = CallText, textAlign = TextAlign.Center)
            if (displayName != null) {
                Spacer(Modifier.height(4.dp))
                Text(ui.phone, style = MaterialTheme.typography.bodyMedium, color = CallMuted)
            }
            Spacer(Modifier.height(14.dp))
            RecStatusChip(recording = ui.recording, nativeRec = ui.nativeRec)

            Spacer(Modifier.weight(1f))

            // Controls: REC · mute · speaker
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                ToggleAction(
                    Icons.Default.FiberManualRecord,
                    if (ui.recording) "Stop REC" else "REC",
                    active = ui.recording,
                    activeColor = RecRed,
                ) { SimCallMonitor.toggleRecord(context) }
                ToggleAction(
                    if (ui.muted) Icons.Default.MicOff else Icons.Default.Mic,
                    "Mute", active = ui.muted,
                ) { SimCallMonitor.toggleMute(context) }
                ToggleAction(Icons.Default.VolumeUp, "Speaker", active = ui.speakerOn) {
                    SimCallMonitor.toggleSpeaker(context)
                }
            }
            Spacer(Modifier.height(24.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Surface(
                    shape = CircleShape, color = EndRed,
                    modifier = Modifier.size(70.dp).clickable {
                        if (!SimCallMonitor.endCall(context)) {
                            Toast.makeText(context, "Cut the call from the phone's call screen", Toast.LENGTH_SHORT).show()
                        }
                    },
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.CallEnd, contentDescription = "End call", tint = Color.White, modifier = Modifier.size(30.dp))
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text("End call", style = MaterialTheme.typography.labelMedium, color = CallMuted)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** Live mm:ss (or h:mm:ss) since [activeAtMillis]; "00:00" while dialing. */
@Composable
private fun CallTimerText(activeAtMillis: Long, phase: String): String {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(activeAtMillis, phase) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }
    if (phase != "active" || activeAtMillis <= 0) return "00:00"
    val sec = ((now - activeAtMillis) / 1000).coerceAtLeast(0)
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}

@Composable
private fun RecStatusChip(recording: Boolean, nativeRec: Boolean) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(ChipBg).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when {
            recording -> {
                PulsingDot(RecRed)
                Spacer(Modifier.width(7.dp))
                Text("REC — recording this call", style = MaterialTheme.typography.labelMedium, color = CallText, fontWeight = FontWeight.Bold)
            }
            nativeRec -> {
                PulsingDot(OkGreen)
                Spacer(Modifier.width(7.dp))
                Text("Phone's recorder is on — auto-saved after call", style = MaterialTheme.typography.labelMedium, color = CallText)
            }
            else -> Text("Not recording — tap REC below", style = MaterialTheme.typography.labelMedium, color = CallMuted)
        }
    }
}

@Composable
private fun PulsingDot(color: Color) {
    val pulse by rememberInfiniteTransition(label = "dot").animateFloat(
        initialValue = 1f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "dot-alpha",
    )
    Box(Modifier.size(9.dp).alpha(pulse).clip(CircleShape).background(color))
}

@Composable
private fun ToggleAction(icon: ImageVector, label: String, active: Boolean, activeColor: Color = Color.White, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            shape = CircleShape,
            color = if (active) activeColor else ChipBg,
            modifier = Modifier.size(60.dp).clickable { onClick() },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    icon, contentDescription = label,
                    tint = when {
                        active && activeColor == RecRed -> Color.White
                        active -> CallBgBottom
                        else -> CallText
                    },
                    modifier = Modifier.size(26.dp),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = CallMuted)
    }
}
