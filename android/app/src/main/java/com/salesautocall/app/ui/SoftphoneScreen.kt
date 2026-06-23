package com.salesautocall.app.ui

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
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** Full-screen in-app call UI for an OUTGOING cloud call. SIP registration,
 *  auto-answer and audio are handled natively by [com.salesautocall.app.sip.SipManager];
 *  this screen reflects the call status (with a live timer) and offers the standard
 *  mute / speaker / record / hang-up controls — styled to feel like the native dialer. */
@Composable
fun SoftphoneScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val number = app.cloudCallNumber

    if (number != null && app.callerdeskCalling) {
        // CallerDesk: the call is on the native dialer — show an "answer your phone"
        // card that turns into a live timer once connected and closes on hang-up.
        CallerdeskCallCard(
            number = number,
            status = app.cloudCallStatus.ifBlank { "Starting call…" },
            connectedAt = app.callConnectedAt,
            note = app.inCallNote,
            onNote = { vm.setInCallNote(it) },
            onClose = { vm.endCloudCall() },
        )
        return
    }

    Box(Modifier.fillMaxSize().background(callGradient()), contentAlignment = Alignment.Center) {
        if (number == null) {
            Text("Ending call…", color = Color.White.copy(alpha = 0.85f), fontSize = 22.sp)
            return@Box
        }

        var muted by remember { mutableStateOf(false) }
        var speaker by remember { mutableStateOf(false) }
        var recording by remember { mutableStateOf(vm.recordingAllowed()) }

        Column(
            Modifier.fillMaxSize().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(72.dp))
            CallAvatar(number)
            Spacer(Modifier.height(20.dp))
            Text(number, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            // Live timer once connected, otherwise the status line ("Ringing…").
            CallStatusLine(app.callConnectedAt, app.cloudCallStatus.ifBlank { "Connecting…" })

            Spacer(Modifier.weight(1f))

            // In-call notes — saved onto this call's log on hang-up.
            OutlinedTextField(
                value = app.inCallNote,
                onValueChange = { vm.setInCallNote(it) },
                placeholder = { Text("Add a note…", color = Color.White.copy(alpha = 0.5f)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 1,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.08f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.08f),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedIndicatorColor = Color.White.copy(alpha = 0.3f),
                    unfocusedIndicatorColor = Color.White.copy(alpha = 0.15f),
                ),
            )

            Spacer(Modifier.height(24.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                CallToggle(if (muted) "Unmute" else "Mute", if (muted) Icons.Default.MicOff else Icons.Default.Mic, muted) {
                    muted = !muted; vm.setMuted(muted)
                }
                CallToggle("Speaker", Icons.Default.VolumeUp, speaker) {
                    speaker = !speaker; vm.setSpeaker(speaker)
                }
                if (vm.recordingAllowed()) {
                    CallToggle(if (recording) "Rec ●" else "Record", Icons.Default.FiberManualRecord, recording) {
                        recording = vm.toggleRecording()
                    }
                }
            }

            Spacer(Modifier.height(28.dp))
            RoundCallButton(Icons.Default.CallEnd, Color(0xFFEF4444)) { vm.endCloudCall() }
            Spacer(Modifier.height(8.dp))
            Text("End call", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
            Spacer(Modifier.height(28.dp))
        }
    }
}

/** Simple status card for a CallerDesk cloud call: the actual conversation is on the
 *  phone's native dialer, so there are no in-app audio controls — just status + notes. */
@Composable
private fun CallerdeskCallCard(
    number: String,
    status: String,
    connectedAt: Long,
    note: String,
    onNote: (String) -> Unit,
    onClose: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(callGradient()), contentAlignment = Alignment.Center) {
        Column(
            Modifier.fillMaxSize().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            CallAvatar(number)
            Spacer(Modifier.height(20.dp))
            Text(number, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            // Once connected this becomes a live MM:SS timer; before that, the status line.
            CallStatusLine(connectedAt, status)
            Spacer(Modifier.height(28.dp))
            OutlinedTextField(
                value = note,
                onValueChange = onNote,
                placeholder = { Text("Add a note…", color = Color.White.copy(alpha = 0.5f)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 1,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.08f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.08f),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedIndicatorColor = Color.White.copy(alpha = 0.3f),
                    unfocusedIndicatorColor = Color.White.copy(alpha = 0.15f),
                ),
            )
            Spacer(Modifier.height(24.dp))
            RoundCallButton(Icons.Default.CallEnd, Color(0xFFEF4444)) { onClose() }
            Spacer(Modifier.height(8.dp))
            Text("Close", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
        }
    }
}

// ---- shared "native dialer" call-UI pieces (also used by IncomingCallActivity) ----

@Composable
fun callGradient(): Brush = Brush.verticalGradient(listOf(Color(0xFF0C1426), Color(0xFF1E3A8A)))

/** Big circular avatar showing the contact's first letter (or a dialled-number glyph). */
@Composable
fun CallAvatar(label: String) {
    val initial = label.firstOrNull { it.isLetter() }?.uppercaseChar()?.toString() ?: "#"
    Box(
        Modifier.size(112.dp).clip(CircleShape)
            .background(Color.White.copy(alpha = 0.12f))
            .border(1.dp, Color.White.copy(alpha = 0.25f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(initial, color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Live MM:SS timer once [connectedAt] > 0, otherwise the [fallback] status text. */
@Composable
fun CallStatusLine(connectedAt: Long, fallback: String) {
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(connectedAt) {
        if (connectedAt <= 0L) return@LaunchedEffect
        while (true) { now = System.currentTimeMillis(); delay(1000) }
    }
    if (connectedAt > 0L) {
        val s = ((now - connectedAt) / 1000).coerceAtLeast(0)
        Text("%02d:%02d".format(s / 60, s % 60), color = Color(0xFF86EFAC), fontSize = 18.sp, fontWeight = FontWeight.Medium)
    } else {
        Text(fallback, color = Color.White.copy(alpha = 0.85f), fontSize = 16.sp)
    }
}

@Composable
fun RoundCallButton(icon: ImageVector, color: Color, size: Int = 72, onClick: () -> Unit) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(color).clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size((size * 0.46f).dp))
    }
}

@Composable
fun CallToggle(label: String, icon: ImageVector, active: Boolean, onClick: () -> Unit) {
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
