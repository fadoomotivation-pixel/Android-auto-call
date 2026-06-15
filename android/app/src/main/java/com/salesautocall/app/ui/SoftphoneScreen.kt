package com.salesautocall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Full-screen in-app call UI for a cloud call. The actual SIP registration,
 *  auto-answer and audio are handled natively by [com.salesautocall.app.sip.SipManager];
 *  this screen just reflects the call status and offers mute / hang-up. */
@Composable
fun SoftphoneScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val number = app.cloudCallNumber
    var muted by remember { mutableStateOf(false) }
    var speaker by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(vm.recordingAllowed()) }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (number != null) {
            Column(
                Modifier.fillMaxSize().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    "Cloud call", style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
                Text(number, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(10.dp))
                Text(
                    app.cloudCallStatus.ifBlank { "Connecting…" },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(40.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = {
                        muted = !muted
                        vm.setMuted(muted)
                    }) { Text(if (muted) "Unmute" else "Mute") }

                    Spacer(Modifier.width(12.dp))

                    OutlinedButton(onClick = {
                        speaker = !speaker
                        vm.setSpeaker(speaker)
                    }) { Text(if (speaker) "Speaker ✓" else "Speaker") }

                    if (vm.recordingAllowed()) {
                        Spacer(Modifier.width(12.dp))
                        OutlinedButton(onClick = { recording = vm.toggleRecording() }) {
                            Text(if (recording) "● Rec" else "Record")
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))

                // In-call notes — saved onto this call's log when you hang up.
                OutlinedTextField(
                    value = app.inCallNote,
                    onValueChange = { vm.setInCallNote(it) },
                    label = { Text("Notes") },
                    placeholder = { Text("Jot down what was discussed…") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )

                Spacer(Modifier.height(20.dp))

                Button(
                    onClick = { vm.endCloudCall() },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD7263D)),
                ) { Text("Hang up") }
            }
        } else {
            // cloudCallNumber became null — call is ending, show a graceful state.
            Column(
                Modifier.fillMaxSize().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    "Ending call…",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
