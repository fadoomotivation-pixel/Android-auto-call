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
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.LocationOn
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
    /** Connected calls today (the same todayConnected My report reads). */
    connectedToday: Int = 0,
    connectedGoal: Int = 0,
    /** Site visits today; null when it cannot be counted honestly. */
    visitsToday: Int? = null,
    visitsGoal: Int = 0,
) {
    val hour = java.time.LocalTime.now().hour
    val st = shiftState(attendance)
    val today = java.time.LocalDate.now()
        .format(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM", java.util.Locale.ENGLISH))
    Column(Modifier.fillMaxWidth()) {
        // Large-title greeting (Home C). Company logo, when set, sits on the right.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(today, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1)
                Text("${greetingFor(hour)}, $firstName", style = AppType.title, color = AppColors.TextPrimary, maxLines = 1)
                if (!company.isNullOrBlank()) {
                    Text(company, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1)
                }
            }
            if (!logoUrl.isNullOrBlank()) {
                Spacer(Modifier.width(Space.m))
                coil.compose.AsyncImage(
                    model = logoUrl, contentDescription = "$company logo",
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.size(40.dp).clip(CircleShape).background(AppColors.Surface),
                )
            }
        }
        Spacer(Modifier.height(Space.l))

        // Rings card: calls vs goal, connected vs goal, site visits — then the
        // ONE primary action.
        Column(Modifier.fillMaxWidth().clip(Radii.hero).background(AppColors.Surface).padding(Space.l)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val callsP = if (dailyGoal > 0) callsToday.toFloat() / dailyGoal else 0f
                val connP = if (connectedGoal > 0) connectedToday.toFloat() / connectedGoal else 0f
                val visP = if (visitsToday != null && visitsGoal > 0) visitsToday.toFloat() / visitsGoal else 0f
                DayRings(callsP, connP, visP, Modifier.size(128.dp))
                Spacer(Modifier.width(Space.xxl))
                Column(verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    RingLegend(RingCalls, "Calls today", if (dailyGoal > 0) "$callsToday / $dailyGoal" else "$callsToday")
                    RingLegend(RingConnected, "Connected", if (connectedGoal > 0) "$connectedToday / $connectedGoal" else "$connectedToday")
                    RingLegend(RingVisits, "Site visits",
                        when {
                            visitsToday == null -> "—"
                            visitsGoal > 0 -> "$visitsToday / $visitsGoal"
                            else -> "$visitsToday"
                        })
                }
            }
            Spacer(Modifier.height(Space.m))
            Text(
                "${followUpNow?.toString() ?: "—"} follow-up · ${converted?.toString() ?: "—"} converted",
                style = AppType.meta, color = AppColors.TextSecondary,
            )
            Spacer(Modifier.height(Space.l))
            Row(
                Modifier.fillMaxWidth().height(48.dp).clip(Radii.control).background(AppColors.Indigo)
                    .iosPress { onStartCalling() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Outlined.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(Space.s))
                Text(
                    if (followUpNow != null && followUpNow > 0) "Start calling ($followUpNow)" else "Start calling",
                    style = AppType.label, color = Color.White,
                )
            }
            Spacer(Modifier.height(Space.s))
            // The button opens the Leads tab, which starts on Call now — say
            // exactly that (it used to promise "Opens Call now").
            Text(
                "Opens Leads on Call now.",
                style = AppType.meta, color = AppColors.TextSecondary,
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(Space.l))

        // Attendance: same state, same single action.
        Row(
            Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)
                .padding(horizontal = Space.l, vertical = Space.m),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.LocationOn, contentDescription = null, tint = Brand.Ink, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Space.l))
            Column(Modifier.weight(1f)) {
                Text("Attendance", style = AppType.label, color = AppColors.TextPrimary)
                Text(
                    when (st) {
                        ShiftState.NOT_IN -> "Not in · Not checked in"
                        ShiftState.ON_SHIFT -> "On shift · Checked in at ${clock(attendance?.punchInAt)}"
                        ShiftState.DONE -> "Done · Checked out at ${clock(attendance?.punchOutAt)}"
                    },
                    style = AppType.meta,
                    color = when (st) {
                        ShiftState.NOT_IN -> AppColors.Danger
                        ShiftState.ON_SHIFT -> AppColors.Positive
                        ShiftState.DONE -> AppColors.TextSecondary
                    },
                    maxLines = 1,
                )
            }
            Text(
                when (st) { ShiftState.NOT_IN -> "Check in"; ShiftState.ON_SHIFT -> "Check out"; ShiftState.DONE -> "View" },
                style = AppType.label, color = AppColors.Indigo,
                modifier = Modifier.clip(Radii.control).iosPress { onAttendance() }.padding(horizontal = Space.s, vertical = Space.s),
            )
        }
    }
}

private val RingCalls = AppColors.Indigo
private val RingConnected = Color(0xFF3A3A3C)
private val RingVisits = AppColors.TextSecondary

/** Three concentric progress rings (Fitness-style). Fractions are clamped. */
@Composable
internal fun DayRings(calls: Float, connected: Float, visits: Float, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier) {
        val stroke = 10.dp.toPx()
        val gap = 4.dp.toPx()
        listOf(calls to RingCalls, connected to RingConnected, visits to RingVisits).forEachIndexed { i, (p, c) ->
            val inset = stroke / 2 + i * (stroke + gap)
            val sz = androidx.compose.ui.geometry.Size(size.width - inset * 2, size.height - inset * 2)
            val tl = androidx.compose.ui.geometry.Offset(inset, inset)
            drawArc(c.copy(alpha = 0.15f), 0f, 360f, false, tl, sz,
                style = androidx.compose.ui.graphics.drawscope.Stroke(stroke))
            val f = if (p.isNaN()) 0f else p.coerceIn(0f, 1f)
            if (f > 0f) drawArc(c, -90f, 360f * f, false, tl, sz,
                style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round))
        }
    }
}

@Composable
private fun RingLegend(color: Color, label: String, value: String) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(Space.s))
            Text(label, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1)
        }
        Text(value, style = AppType.headline, color = AppColors.TextPrimary, maxLines = 1,
            modifier = Modifier.padding(start = Space.l))
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

/** Quick access: one white card, a 4-column grid of monochrome icons. */
@Composable
internal fun QuickAccessGrid(items: List<QuickItem>) {
    Column(Modifier.fillMaxWidth()) {
        AccentHeader("Quick access", Modifier.padding(bottom = Space.s))
        Column(
            Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface).padding(vertical = Space.l, horizontal = Space.s),
            verticalArrangement = Arrangement.spacedBy(Space.l),
        ) {
            items.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth()) {
                    row.forEach { q ->
                        Column(
                            Modifier.weight(1f).clip(Radii.control).iosPress { q.onClick() }.padding(vertical = Space.xs),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(q.icon, contentDescription = null, tint = Brand.Ink, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.height(Space.s))
                            Text(q.label, style = AppType.meta, color = AppColors.TextPrimary, maxLines = 1, textAlign = TextAlign.Center)
                        }
                    }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}
