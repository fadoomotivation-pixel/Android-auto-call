package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.Attendance
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.GhostButton
import com.salesautocall.app.ui.design.IosSeparator
import com.salesautocall.app.ui.design.PrimaryButton
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.iosPress

// ─────────────────────────────────────────────────────────────────────────────
// Home that starts the day: who you are, are you on shift, one Start calling,
// three numbers, then the places you go. Calm: white on grey, one accent.
// Every number here is read from logic that already exists — nothing new is
// counted on this card:
//   Follow-up = TodayFunnel.callNow (the Call now rule; never the row total)
//   Converted = TodayFunnel.booked  (booked / token today)
//   Calls     = todayCalls vs the rep's own daily goal (Settings)
// Attendance is the same `attendance` row the admin Attendance page reads.
// ─────────────────────────────────────────────────────────────────────────────

/** What the attendance line says. Pure, so the three states can't drift. */
internal enum class ShiftState { NOT_IN, ON_SHIFT, DONE }

internal fun shiftState(a: Attendance?): ShiftState = when {
    a?.punchOutAt != null -> ShiftState.DONE
    a?.punchInAt != null -> ShiftState.ON_SHIFT
    else -> ShiftState.NOT_IN
}

internal fun greetingFor(hour: Int): String = when (hour) {
    in 4..11 -> "Good morning"
    in 12..16 -> "Good afternoon"
    else -> "Good evening"
}

private fun clock(iso: String?): String {
    val ms = isoMillis(iso) ?: return "—"
    return java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.ENGLISH))
}

@Composable
internal fun DayStartCard(
    firstName: String,
    company: String?,
    logoUrl: String?,
    attendance: Attendance?,
    accent: Color,
    followUpNow: Int?,
    converted: Int?,
    callsToday: Int,
    dailyGoal: Int,
    onAttendance: () -> Unit,
    onStartCalling: () -> Unit,
) {
    val hour = java.time.LocalTime.now().hour
    Column(Modifier.fillMaxWidth()) {
        // Greeting sits on the canvas, like an iOS large title — not in a box.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("${greetingFor(hour)}, $firstName", style = AppType.title2, color = AppColors.TextPrimary, maxLines = 1)
                if (!company.isNullOrBlank()) {
                    Text(company, style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1)
                }
            }
            if (!logoUrl.isNullOrBlank()) {
                Spacer(Modifier.width(Space.m))
                coil.compose.AsyncImage(
                    model = logoUrl, contentDescription = company?.let { "$it logo" },
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(AppColors.SurfaceMuted),
                )
            }
        }
        Spacer(Modifier.height(Space.l))
        Column(Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)) {
            // Attendance — one line, the state in words, one text action.
            val st = shiftState(attendance)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).iosPress { onAttendance() }
                    .padding(horizontal = Space.l),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(8.dp).clip(CircleShape).background(
                        when (st) {
                            ShiftState.ON_SHIFT -> AppColors.Positive
                            else -> AppColors.TextTertiary
                        },
                    ),
                )
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("Attendance", style = AppType.footnote, color = AppColors.TextSecondary)
                    Text(
                        when (st) {
                            ShiftState.NOT_IN -> "Not checked in"
                            ShiftState.ON_SHIFT -> "Checked in at ${clock(attendance?.punchInAt)}"
                            ShiftState.DONE -> "Checked out at ${clock(attendance?.punchOutAt)}"
                        },
                        style = AppType.body, color = AppColors.TextPrimary, maxLines = 1,
                    )
                }
                GhostButton(
                    when (st) { ShiftState.NOT_IN -> "Check in"; ShiftState.ON_SHIFT -> "Check out"; ShiftState.DONE -> "View" },
                    tint = accent,
                ) { onAttendance() }
            }
            IosSeparator()
            Column(Modifier.padding(Space.l)) {
                PrimaryButton(
                    if (followUpNow != null && followUpNow > 0) "Start calling ($followUpNow)" else "Start calling",
                    modifier = Modifier.fillMaxWidth(), icon = Icons.Filled.Call,
                ) { onStartCalling() }
                Spacer(Modifier.height(Space.xs))
                Text(
                    "Opens Call now, most urgent first.",
                    style = AppType.footnote, color = AppColors.TextSecondary,
                    modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                )
            }
            IosSeparator(startInset = 0.dp)
            Row(Modifier.fillMaxWidth().padding(vertical = Space.m)) {
                SummaryCell("Follow-up", followUpNow?.toString() ?: "—", Modifier.weight(1f))
                VDivider()
                SummaryCell("Converted", converted?.toString() ?: "—", Modifier.weight(1f))
                VDivider()
                SummaryCell(
                    "Calls today", if (dailyGoal > 0) "$callsToday/$dailyGoal" else "$callsToday",
                    Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun VDivider() {
    Box(Modifier.width(0.5.dp).height(40.dp).background(AppColors.Separator))
}

@Composable
private fun SummaryCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = AppType.metric, color = AppColors.TextPrimary, maxLines = 1)
        Text(label, style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1)
    }
}

internal data class QuickItem(val label: String, val icon: ImageVector, val onClick: () -> Unit)

/** Quick access: a 4-column grid of monochrome icons on one white card. */
@Composable
internal fun QuickAccessGrid(items: List<QuickItem>) {
    Column(Modifier.fillMaxWidth()) {
        Text(
            "QUICK ACCESS", style = AppType.groupHeader, color = AppColors.TextSecondary,
            modifier = Modifier.padding(start = Space.l, bottom = 6.dp),
        )
        Column(
            Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface).padding(vertical = Space.s),
        ) {
            items.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    row.forEach { q ->
                        Column(
                            Modifier.weight(1f).clip(Radii.control).iosPress { q.onClick() }
                                .padding(vertical = Space.s),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(AppColors.Canvas),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(q.icon, contentDescription = null, tint = AppColors.TextPrimary, modifier = Modifier.size(22.dp))
                            }
                            Spacer(Modifier.height(Space.xs))
                            Text(q.label, style = AppType.footnote, color = AppColors.TextPrimary, maxLines = 1)
                        }
                    }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}
