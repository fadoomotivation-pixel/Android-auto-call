package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.Contact

/** Stages a buyer can be at on a specific project (compact subset for the picker). */
private val PROJECT_STAGES = listOf(
    "new" to "New", "interested" to "Interested", "site_visit" to "Site Visit",
    "proposal" to "Proposal", "booked" to "Booked", "not_interested" to "Not interested",
)

/**
 * Pick a piece of company content (brochure / video / review / testimonial) and send
 * it to the buyer as a TRACKED WhatsApp link. When they open it, the backend logs the
 * open and reactivates the lead.
 */
@Composable
fun ContentShareDialog(vm: MainViewModel, contact: Contact, onDismiss: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) { vm.loadContentAssets() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Share content · ${contact.name ?: contact.phone}") },
        text = {
            Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
                if (app.contentAssets.isEmpty()) {
                    Text(
                        "No content yet. Ask your admin to add brochures, videos or reviews in the web dashboard (Content Library).",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    app.contentAssets.forEach { asset ->
                        Row(
                            Modifier.fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable {
                                    vm.shareContent(contact, asset) { message ->
                                        QuickActions.whatsAppText(context, contact.phone, message)
                                        onDismiss()
                                    }
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(asset.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(
                                    asset.kind.replaceFirstChar { it.uppercase() },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Icon(Icons.Default.Send, contentDescription = "Send", tint = Color(0xFF25D366))
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

/** View / add the projects a buyer is interested in — each with its own stage + budget. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProjectInterestsDialog(vm: MainViewModel, contact: Contact, onDismiss: () -> Unit) {
    val app by vm.state.collectAsState()
    val contactId = contact.id
    LaunchedEffect(contactId) { contactId?.let { vm.loadProjectInterests(it) } }

    var project by remember { mutableStateOf("") }
    var budget by remember { mutableStateOf("") }
    var stage by remember { mutableStateOf("new") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Projects · ${contact.name ?: contact.phone}") },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                if (app.projectInterests.isEmpty()) {
                    Text("No projects yet. Add the projects this buyer is considering below.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    app.projectInterests.forEach { pi ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(pi.project, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                val meta = buildString {
                                    append(PROJECT_STAGES.firstOrNull { it.first == pi.stage }?.second ?: pi.stage)
                                    if (!pi.budget.isNullOrBlank()) append("  ·  💰 ${pi.budget}")
                                }
                                Text(meta, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            val id = pi.id
                            if (id != null && contactId != null) {
                                Icon(
                                    Icons.Default.Close, contentDescription = "Remove",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.clickable { vm.deleteProjectInterest(id, contactId) },
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))
                Text("Add a project", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(project, { project = it }, label = { Text("Project name") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(budget, { budget = it }, label = { Text("Budget (optional)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PROJECT_STAGES.forEach { (key, label) ->
                        val on = stage == key
                        Box(
                            Modifier.clip(RoundedCornerShape(50))
                                .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { stage = key }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                        ) {
                            Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = project.isNotBlank() && contactId != null,
                onClick = {
                    if (contactId != null) {
                        vm.addProjectInterest(contactId, project, stage, budget, null)
                        project = ""; budget = ""; stage = "new"
                    }
                },
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
