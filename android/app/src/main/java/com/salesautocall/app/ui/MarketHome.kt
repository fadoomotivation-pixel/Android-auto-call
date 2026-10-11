package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.PhoneForwarded
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Update
import androidx.compose.material.icons.filled.Visibility
import com.salesautocall.app.ui.design.AccentHeader
import com.salesautocall.app.ui.design.Brand
import com.salesautocall.app.ui.design.GradientIconTile
import com.salesautocall.app.ui.design.OutlinedPill
import com.salesautocall.app.ui.design.TileTone
import com.salesautocall.app.ui.design.Tiles
import com.salesautocall.app.ui.design.gradientCard
import com.salesautocall.app.ui.design.softCard
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
    val st = shiftState(attendance)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.l)) {
        // Hero: greeting on the brand gradient.
        Row(
            Modifier.fillMaxWidth().gradientCard(Radii.sheet).padding(horizontal = Space.l, vertical = Space.l + Space.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(greetingFor(hour), style = AppType.footnote, color = Color.White.copy(alpha = 0.85f), maxLines = 1)
                Text(firstName, style = AppType.title2, color = Color.White, maxLines = 1)
                if (!company.isNullOrBlank()) {
                    Text(company, style = AppType.footnote, color = Color.White.copy(alpha = 0.8f), maxLines = 1)
                }
            }
            Spacer(Modifier.width(Space.m))
            Box(
                Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(Brand.OnGradientFill)
                    .border(1.dp, Brand.OnGradientBorder, RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (!logoUrl.isNullOrBlank()) {
                    coil.compose.AsyncImage(
                        model = logoUrl, contentDescription = company?.let { "$it logo" },
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color.White),
                    )
                } else {
                    Icon(Icons.Filled.Dashboard, contentDescription = null, tint = Color.White, modifier = Modifier.size(26.dp))
                }
            }
        }

        // Attendance card: same state, same single action.
        Column(Modifier.fillMaxWidth().softCard().padding(Space.l)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(AppColors.IndigoSoft),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Fingerprint, contentDescription = null, tint = AppColors.Indigo, modifier = Modifier.size(24.dp)) }
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("Attendance", style = AppType.label, color = AppColors.TextPrimary)
                    Text(
                        when (st) {
                            ShiftState.NOT_IN -> "Not checked in"
                            ShiftState.ON_SHIFT -> "Checked in at ${clock(attendance?.punchInAt)}"
                            ShiftState.DONE -> "Checked out at ${clock(attendance?.punchOutAt)}"
                        },
                        style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1,
                    )
                }
                OutlinedPill(
                    when (st) { ShiftState.NOT_IN -> "Not in"; ShiftState.ON_SHIFT -> "On shift"; ShiftState.DONE -> "Done" },
                    when (st) { ShiftState.NOT_IN -> AppColors.Danger; ShiftState.ON_SHIFT -> AppColors.Positive; ShiftState.DONE -> AppColors.TextSecondary },
                )
            }
            Spacer(Modifier.height(Space.m))
            Box(Modifier.fillMaxWidth().height(1.dp).background(AppColors.Separator))
            Spacer(Modifier.height(Space.m))
            val (btnLabel, btnIcon, btnBrush) = when (st) {
                ShiftState.NOT_IN -> Triple("Check in", Icons.AutoMirrored.Filled.Login, Tiles.Positive.brush)
                ShiftState.ON_SHIFT -> Triple("Check out", Icons.AutoMirrored.Filled.Logout, Tiles.Negative.brush)
                ShiftState.DONE -> Triple("View", Icons.Filled.Visibility, null)
            }
            Row(
                Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(Radii.control)
                    .then(if (btnBrush != null) Modifier.background(btnBrush) else Modifier.background(AppColors.SurfaceMuted))
                    .iosPress { onAttendance() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                val fg = if (btnBrush != null) Color.White else AppColors.TextPrimary
                Icon(btnIcon, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.s))
                Text(btnLabel, style = AppType.label, color = fg)
            }
        }

        // The one primary action.
        Column {
            Row(
                Modifier.fillMaxWidth().height(56.dp).gradientCard(Radii.control, Brand.gradientHorizontal)
                    .iosPress { onStartCalling() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.PhoneForwarded, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(Space.m))
                Text(
                    if (followUpNow != null && followUpNow > 0) "Start calling ($followUpNow)" else "Start calling",
                    style = AppType.headline, color = Color.White,
                )
            }
            Spacer(Modifier.height(Space.xs))
            Text(
                "Opens Call now, most urgent first.",
                style = AppType.footnote, color = AppColors.TextSecondary,
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
            )
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
            MetricTile("Follow-up", followUpNow?.toString() ?: "—", Icons.Filled.Update, Tiles.FollowUp, Modifier.weight(1f))
            MetricTile("Converted", converted?.toString() ?: "—", Icons.Filled.CheckCircle, Tiles.Positive, Modifier.weight(1f))
            MetricTile(
                "Calls today", if (dailyGoal > 0) "$callsToday/$dailyGoal" else "$callsToday",
                Icons.Filled.Call, Tiles.Calls, Modifier.weight(1f),
            )
        }
    }
}

/** White metric tile: gradient icon tile, big number, grey label. */
@Composable
internal fun MetricTile(label: String, value: String, icon: ImageVector, tone: TileTone, modifier: Modifier = Modifier) {
    Column(
        modifier.softCard().padding(vertical = Space.l, horizontal = Space.s),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        GradientIconTile(icon, tone, size = 44.dp)
        Spacer(Modifier.height(Space.s))
        Text(value, style = AppType.metric, color = AppColors.TextPrimary, maxLines = 1)
        Text(label, style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1)
    }
}

internal data class QuickItem(val label: String, val icon: ImageVector, val onClick: () -> Unit)

/** Quick access: a 3-column grid of white cards, each with a gradient icon tile. */
@Composable
internal fun QuickAccessGrid(items: List<QuickItem>) {
    val tones = listOf(Tiles.Leads, Tiles.FollowUp, Tiles.Calls, Tiles.Brand, Tiles.Positive, Tiles.Time, Tiles.Negative, Tiles.FollowUp)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.m)) {
        AccentHeader("Quick access")
        items.chunked(3).forEachIndexed { r, row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                row.forEachIndexed { c, q ->
                    Column(
                        Modifier.weight(1f).softCard().iosPress { q.onClick() }
                            .padding(vertical = Space.l, horizontal = Space.xs),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        GradientIconTile(q.icon, tones[(r * 3 + c) % tones.size], size = 48.dp)
                        Spacer(Modifier.height(Space.s))
                        Text(q.label, style = AppType.metaStrong, color = AppColors.TextPrimary, maxLines = 1, textAlign = TextAlign.Center)
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}
