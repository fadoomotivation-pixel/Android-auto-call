package com.salesautocall.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.salesautocall.app.data.Attendance
import com.salesautocall.app.data.FollowUp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AiPanel
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.InlineNotice
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.RoundIconButton
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.StatusTone

// ── shared helpers (file-private copies; intentionally self-contained) ──
private val OkGreen = AppColors.Positive
private val WarnAmber = AppColors.Warning
private val BadRed = AppColors.Danger

// OffsetDateTime first: the API sends "+00:00", which Instant.parse rejects.
// Instant-only meant this returned null for real timestamps, and threw an
// exception to do it.
// NOT recoverCatching: inside its lambda `it` is the Throwable, not the string
// from the enclosing let. An elvis chain keeps `it` meaning what it reads like.
private fun ms(iso: String?): Long? = iso?.let {
    runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
}

private fun hhmm(iso: String?): String {
    val m = ms(iso) ?: return "—"
    return java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(m), java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))
}

private fun dur(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return "${h}h ${m}m"
}

private fun localDateOf(iso: String?): LocalDate? =
    ms(iso)?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }

@Composable
/**
 * Same treatment as Home's StatTile: the value leads, in the accent; the label
 * explains it underneath. The 32dp tinted square holding an emoji is gone —
 * four of these side by side were four coloured chips and four stickers
 * competing with the only thing that mattered, the number.
 *
 * Signature kept so every call site is untouched; emoji is ignored.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
private fun Tile(emoji: String, value: String, label: String, accent: Color, modifier: Modifier = Modifier, labelLines: Int = 2) {
    Column(
        modifier
            .clip(Radii.card)
            .background(AppColors.Surface)
            .border(1.dp, AppColors.Border, Radii.card)
            .padding(horizontal = Space.m, vertical = Space.m),
    ) {
        Text(value, style = AppType.metric, color = accent, maxLines = 1)
        Spacer(Modifier.height(Space.xxs))
        Text(
            label,
            style = AppType.meta,
            color = AppColors.TextSecondary,
            maxLines = labelLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun Chip(text: String, fg: Color, bg: Color) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 9.dp, vertical = 3.dp)) {
        Text(text, color = fg, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TopRow(title: String, subtitle: String, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}

// ════════════════════════════════════════════════════════════
//  ATTENDANCE — selfie + GPS, premium UI
// ════════════════════════════════════════════════════════════
private fun bitmapToDataUrl(bmp: android.graphics.Bitmap): String {
    val maxDim = 480
    val scale = minOf(1f, maxDim.toFloat() / maxOf(bmp.width, bmp.height).coerceAtLeast(1))
    val scaled = if (scale < 1f)
        android.graphics.Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt().coerceAtLeast(1), (bmp.height * scale).toInt().coerceAtLeast(1), true)
    else bmp
    val out = java.io.ByteArrayOutputStream()
    scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 55, out)
    return "data:image/jpeg;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
}

private fun decodeSelfie(dataUrl: String?): androidx.compose.ui.graphics.ImageBitmap? {
    if (dataUrl.isNullOrBlank()) return null
    val b64 = dataUrl.substringAfter("base64,", "")
    if (b64.isBlank()) return null
    return runCatching {
        val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size).asImageBitmap()
    }.getOrNull()
}

private fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

private fun lastLocation(context: Context): android.location.Location? {
    if (!hasLocationPermission(context)) return null
    return runCatching {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
        var best: android.location.Location? = null
        for (p in lm.getProviders(true)) {
            val l = runCatching { lm.getLastKnownLocation(p) }.getOrNull() ?: continue
            val currentBest = best
            if (currentBest == null || l.accuracy < currentBest.accuracy) best = l
        }
        best
    }.getOrNull()
}

private fun geocode(context: Context, lat: Double, lng: Double): String {
    val fallback = String.format("%.4f, %.4f", lat, lng)
    return runCatching {
        @Suppress("DEPRECATION")
        val list = android.location.Geocoder(context).getFromLocation(lat, lng, 1)
        list?.firstOrNull()?.let { a ->
            listOfNotNull(a.subLocality, a.locality, a.adminArea).distinct().joinToString(", ").ifBlank { fallback }
        } ?: fallback
    }.getOrDefault(fallback)
}

@Composable
fun AttendanceScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { vm.loadAttendance() }

    // Request location up-front so the punch can be geo-tagged.
    val locPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
    LaunchedEffect(Unit) {
        if (!hasLocationPermission(context)) {
            locPermLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    // Simple check-in: no selfie. Grab the GPS fix (best-effort) and punch in.
    fun punchInWithLocation() {
        scope.launch {
            val (label, lat, lng) = withContext(Dispatchers.IO) {
                val loc = lastLocation(context)
                val lbl = loc?.let { geocode(context, it.latitude, it.longitude) }
                Triple(lbl, loc?.latitude, loc?.longitude)
            }
            vm.punchIn(null, lat, lng, label)
        }
    }

    val a = app.attendance
    val onShift = a?.punchInAt != null && a.punchOutAt == null
    val done = a?.punchOutAt != null

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { TopRow("Attendance", "GPS-verified check-in", onBack) }

        item {
            // The last gradient in the light app. Shift state is a STATE, so it
            // gets the state colours: green on shift or complete, indigo when
            // there is an action waiting. White-on-indigo-gradient made "Ready
            // to check in?" and "Shift complete" look identical at a glance.
            val shiftTone = if (onShift || done) StatusTone(AppColors.Positive, AppColors.PositiveSoft)
                            else StatusTone(AppColors.Indigo, AppColors.IndigoSoft)
            Box(
                Modifier.fillMaxWidth().clip(Radii.card)
                    .background(shiftTone.bg).padding(Space.l),
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(52.dp).clip(CircleShape).background(AppColors.Surface), contentAlignment = Alignment.Center) {
                            Icon(if (onShift || done) Icons.Default.CheckCircle else Icons.Default.LocationOn, contentDescription = null, tint = shiftTone.fg)
                        }
                        Spacer(Modifier.width(Space.l))
                        Column {
                            Text(
                                when { done -> "Shift complete"; onShift -> "You're on shift"; else -> "Ready to check in?" },
                                style = AppType.title, color = shiftTone.fg,
                            )
                            Text(
                                when { done -> "In ${hhmm(a?.punchInAt)} · Out ${hhmm(a?.punchOutAt)}"; onShift -> "Since ${hhmm(a?.punchInAt)}"; else -> "Punch in with your location" },
                                style = AppType.meta, color = AppColors.TextSecondary,
                            )
                        }
                    }
                    a?.locationLabel?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(12.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.LocationOn, contentDescription = "Location", tint = AppColors.TextSecondary, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(Space.xs + Space.xxs))
                            Text(it, style = AppType.meta, color = AppColors.TextSecondary)
                        }
                    }
                    if (onShift) {
                        var elapsed by remember { mutableIntStateOf(0) }
                        LaunchedEffect(a?.punchInAt) {
                            val start = ms(a?.punchInAt) ?: System.currentTimeMillis()
                            while (true) { elapsed = ((System.currentTimeMillis() - start) / 1000).toInt(); delay(1000) }
                        }
                        Spacer(Modifier.height(10.dp))
                        // Monospaced so a ticking shift clock does not shuffle.
                        Text("${dur(elapsed.toLong())} on shift", style = AppType.timer, color = shiftTone.fg)
                    }
                    Spacer(Modifier.height(16.dp))
                    val canPunch = !app.attendanceBusy && !done
                    // A filled action on the tinted ground, not a white button
                    // on a gradient. Punching in/out is the only thing this
                    // screen exists to do, so it gets the solid treatment.
                    Box(
                        Modifier.fillMaxWidth().clip(Radii.control)
                            .background(if (canPunch) shiftTone.fg else AppColors.SurfaceMuted)
                            .clickable(enabled = canPunch) {
                                if (onShift) vm.punchOut() else punchInWithLocation()
                            }.padding(vertical = Space.l),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (!onShift && !done) {
                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = AppColors.Surface, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(Space.s))
                            }
                            Text(
                                when { app.attendanceBusy -> "Please wait…"; done -> "Shift done for today"; onShift -> "Punch out"; else -> "Punch in" },
                                style = AppType.label,
                                color = if (canPunch) AppColors.Surface else AppColors.TextTertiary,
                            )
                        }
                    }
                }
            }
        }

        // This week summary
        item {
            val week = app.attendanceHistory.filter { localDateOf(it.workDate)?.isAfter(LocalDate.now().minusDays(7)) == true }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Tile("✅", week.count { it.punchInAt != null }.toString(), "Days present (7d)", OkGreen, Modifier.weight(1f))
                val totalSec = week.sumOf { r ->
                    val i = ms(r.punchInAt); val o = ms(r.punchOutAt)
                    if (i != null && o != null) (o - i) / 1000 else 0L
                }
                Tile("⏱️", dur(totalSec), "Hours (7d)", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
            }
        }

        item { Text("History", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (app.attendanceHistory.isEmpty()) {
            item { Text("No attendance yet. Punch in to start.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(app.attendanceHistory, key = { it.id ?: it.workDate ?: "" }) { row -> AttendanceHistoryCard(row) }
        }

        app.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
    }
}

private data class Quad(val a: String?, val b: String?, val c: Double?, val d: Double?)

@Composable
private fun AttendanceHistoryCard(row: Attendance) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            val selfie = decodeSelfie(row.selfie)
            if (selfie != null) {
                Image(selfie, contentDescription = "Selfie", contentScale = ContentScale.Crop, modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)))
            } else {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.CameraAlt, contentDescription = "Camera", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(row.workDate ?: "—", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text("In ${hhmm(row.punchInAt)} · Out ${hhmm(row.punchOutAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                row.locationLabel?.takeIf { it.isNotBlank() }?.let {
                    Text("📍 $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            }
            val i = ms(row.punchInAt); val o = ms(row.punchOutAt)
            if (i != null && o != null) Chip(dur((o - i) / 1000), MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
            else if (i != null) Chip("Open", WarnAmber, WarnAmber.copy(alpha = 0.14f))
        }
    }
}

// ════════════════════════════════════════════════════════════
//  FOLLOW-UP CALENDAR
// ════════════════════════════════════════════════════════════
private fun fuState(f: FollowUp, now: Long): String = when {
    f.status == "done" -> "Completed"
    (ms(f.dueAt) ?: 0L) < now -> "Overdue"
    else -> "Upcoming"
}

@Composable
fun CalendarScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadCalendar() }

    var weekMode by remember { mutableStateOf(false) }
    var weekOffset by remember { mutableIntStateOf(0) }
    var selected by remember { mutableStateOf(LocalDate.now()) }
    var addOpen by remember { mutableStateOf(false) }
    val now = System.currentTimeMillis()

    val monday = LocalDate.now().with(java.time.DayOfWeek.MONDAY).plusWeeks(weekOffset.toLong())
    val weekDays = (0..6).map { monday.plusDays(it.toLong()) }

    val scopeItems = app.calendar.filter { f ->
        val d = localDateOf(f.dueAt) ?: return@filter false
        if (weekMode) d in weekDays else d == selected
    }.sortedBy { ms(it.dueAt) ?: 0L }

    val total = scopeItems.size
    val completed = scopeItems.count { it.status == "done" }
    val overdue = scopeItems.count { it.status != "done" && (ms(it.dueAt) ?: 0L) < now }
    val upcoming = scopeItems.count { it.status != "done" && (ms(it.dueAt) ?: 0L) >= now }

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { TopRow("Follow-up Calendar", "Never miss a follow-up", onBack) }

        // Day / Week toggle + week nav
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(false to "Day", true to "Week").forEach { (w, label) ->
                        val on = weekMode == w
                        Box(Modifier.clip(RoundedCornerShape(50)).background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .clickable { weekMode = w }.padding(horizontal = 14.dp, vertical = 7.dp)) {
                            Text(label, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { weekOffset-- }) { Text("‹") }
                    Text(monday.format(java.time.format.DateTimeFormatter.ofPattern("MMM")), style = MaterialTheme.typography.labelLarge)
                    TextButton(onClick = { weekOffset++ }) { Text("›") }
                }
            }
        }
        // Week strip
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                weekDays.forEach { d ->
                    val isSel = !weekMode && d == selected
                    val hasItems = app.calendar.any { localDateOf(it.dueAt) == d }
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                            .background(if (isSel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .clickable { weekMode = false; selected = d }.padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(d.format(java.time.format.DateTimeFormatter.ofPattern("EEE")).take(1),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isSel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(2.dp))
                        Text(d.dayOfMonth.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                            color = if (isSel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                        Box(Modifier.size(5.dp).clip(CircleShape).background(
                            if (hasItems) (if (isSel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary) else Color.Transparent))
                    }
                }
            }
        }
        // Stats
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Tile("📋", total.toString(), "Total", MaterialTheme.colorScheme.primary, Modifier.weight(1f), labelLines = 1)
                Tile("✅", completed.toString(), "Done", OkGreen, Modifier.weight(1f), labelLines = 1)
                Tile("🕑", upcoming.toString(), "Upcoming", WarnAmber, Modifier.weight(1f), labelLines = 1)
                Tile("⚠️", overdue.toString(), "Overdue", BadRed, Modifier.weight(1f), labelLines = 1)
            }
        }
        item {
            OutlinedButton(onClick = { addOpen = true }, modifier = Modifier.fillMaxWidth()) { Text("+ Add Follow-up") }
        }

        if (scopeItems.isEmpty()) {
            item { Text(if (weekMode) "Nothing scheduled this week." else "Nothing scheduled for this day.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(scopeItems, key = { it.id ?: it.phone }) { f ->
                CalendarItem(f, fuState(f, now), onCall = { vm.dialManual(f.phone) }, onDone = { f.id?.let { vm.completeFollowUp(it) } })
            }
        }
    }

    if (addOpen) {
        AddFollowUpDialog(onDismiss = { addOpen = false }, onAdd = { phone, name, millis, note ->
            vm.scheduleFollowUp(null, phone, name, millis, note)
            vm.loadCalendar(force = true)
            addOpen = false
        })
    }
}

@Composable
private fun CalendarItem(f: FollowUp, state: String, onCall: () -> Unit, onDone: () -> Unit) {
    val (fg, bg) = when (state) {
        "Completed" -> OkGreen to OkGreen.copy(alpha = 0.12f)
        "Overdue" -> BadRed to BadRed.copy(alpha = 0.12f)
        else -> WarnAmber to WarnAmber.copy(alpha = 0.12f)
    }
    Row(
        Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)
            .border(1.dp, AppColors.Border, Radii.card)
            .padding(Space.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The time is the spine of a day view — it reads first, in the
        // monospaced style so a column of them lines up exactly.
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(60.dp)) {
            Text(hhmm(f.dueAt), style = AppType.timer, color = AppColors.TextPrimary)
        }
        Spacer(Modifier.width(Space.s))
        Column(Modifier.weight(1f)) {
            Text(f.name ?: f.phone, style = AppType.rowTitle, color = AppColors.TextPrimary, maxLines = 1)
            f.note?.takeIf { it.isNotBlank() }?.let { Text(it, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1) }
            Spacer(Modifier.height(Space.xs))
            Chip(state, fg, bg)
        }
        if (state != "Completed") {
            Icon(Icons.Default.Call, contentDescription = "Call", tint = OkGreen,
                modifier = Modifier.size(40.dp).clip(CircleShape).background(OkGreen.copy(alpha = 0.12f)).padding(9.dp).clickable { onCall() })
            Spacer(Modifier.width(Space.s))
            Icon(Icons.Default.CheckCircle, contentDescription = "Mark as done", tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)).padding(9.dp).clickable { onDone() })
        }
    }
}

@Composable
private fun AddFollowUpDialog(onDismiss: () -> Unit, onAdd: (String, String?, Long, String?) -> Unit) {
    var phone by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val now = java.time.ZonedDateTime.now()
    fun at(days: Long, hour: Int) = now.plusDays(days).withHour(hour).withMinute(0).withSecond(0).toInstant().toEpochMilli()
    val options = buildList {
        add("In 1 hour" to now.plusHours(1).toInstant().toEpochMilli())
        // Hide "Today 5 PM" if it's already past 5 PM
        if (now.hour < 17) {
            add("Today 5 PM" to now.withHour(17).withMinute(0).withSecond(0).toInstant().toEpochMilli())
        }
        add("Tomorrow 10 AM" to at(1, 10))
        add("Tomorrow 4 PM" to at(1, 16))
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add follow-up") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(phone, { phone = it }, label = { Text("Phone *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(note, { note = it }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                Text("When?", style = MaterialTheme.typography.labelLarge)
                options.forEach { (label, millis) ->
                    OutlinedButton(onClick = { if (phone.isNotBlank()) onAdd(phone.trim(), name.trim().ifBlank { null }, millis, note.ifBlank { null }) },
                        enabled = phone.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) { Text(label) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

// ════════════════════════════════════════════════════════════
//  AI ASSISTANT — data-driven insights & recommendations
// ════════════════════════════════════════════════════════════
@Composable
fun AiAssistantScreen(vm: MainViewModel, onBack: () -> Unit) {
    val app by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.loadLeads(); vm.loadFollowUps(); vm.loadLeaderboard("today") }
    val now = System.currentTimeMillis()
    val firstName = app.profile?.fullName?.substringBefore(' ')?.takeIf { it.isNotBlank() } ?: "there"

    val hotNew = app.leads.filter { it.temperature == "hot" && it.stage == "new" }
    val overdueFu = app.followUpList.filter { (ms(it.dueAt) ?: Long.MAX_VALUE) < now }
    val interested = app.leads.filter { it.status == "interested" }
    val siteVisits = app.leads.filter { it.status == "site_visit" }
    val top = app.leaderboard.maxByOrNull { it.leads }

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { TopRow("AI Coach", "Your smart sales coach", onBack) }

        item {
            // The assistant's own screen now wears the assistant's own panel.
            // It was a full-bleed indigo gradient banner with a white circle and
            // white type — the loudest thing in the app, and a fourth idea of
            // what "AI" looks like after Home, Calls and Lead detail.
            AiPanel(title = "Your assistant") {
                Text("Hi $firstName", style = AppType.rowTitle, color = AppColors.TextPrimary)
                Spacer(Modifier.height(Space.xxs))
                Text(
                    "I went through your pipeline and found ${hotNew.size + overdueFu.size} quick wins.",
                    style = AppType.body, color = AppColors.TextSecondary,
                )
            }
        }

        item { Text("INSIGHTS", style = AppType.sectionLabel, color = AppColors.TextTertiary) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Tile("🔥", hotNew.size.toString(), "Hot leads not contacted", BadRed, Modifier.weight(1f))
                Tile("⏰", overdueFu.size.toString(), "Follow-ups overdue", WarnAmber, Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Tile("🏷️", siteVisits.size.toString(), "At site-visit stage", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                Tile("📞", "${app.todayCalls}/${app.dailyGoal}", "Calls vs goal today", OkGreen, Modifier.weight(1f))
            }
        }
        top?.let {
            item {
                InlineNotice(
                    "${it.fullName ?: "Top rep"} is leading today with ${it.leads} leads and ${it.connected} connects.",
                    StatusTone(AppColors.Indigo, AppColors.IndigoSoft),
                )
            }
        }

        item { Text("RECOMMENDED NEXT ACTIONS", style = AppType.sectionLabel, color = AppColors.TextTertiary) }
        val recs = buildList {
            hotNew.take(3).forEach { add(Triple("Call ${it.name ?: it.phone}", "Hot lead, never contacted", it.phone)) }
            overdueFu.take(3).forEach { add(Triple("Follow up ${it.name ?: it.phone}", "Callback overdue", it.phone)) }
            siteVisits.take(2).forEach { add(Triple("Close ${it.name ?: it.phone}", "At site-visit — push to proposal", it.phone)) }
            interested.take(2).forEach { add(Triple("Nurture ${it.name ?: it.phone}", "Interested — share details", it.phone)) }
        }
        if (recs.isEmpty()) {
            item { Text("You're all caught up — no urgent actions right now. 🎉", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(recs, key = { it.first + it.third }) { (title, sub, phone) ->
                Row(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.Surface)
                        .border(1.dp, AppColors.Border, Radii.card)
                        .padding(horizontal = Space.m, vertical = Space.m),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(title, style = AppType.rowTitle, color = AppColors.TextPrimary, maxLines = 1)
                        Text(sub, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1)
                    }
                    Spacer(Modifier.width(Space.m))
                    // The lightning bolt in a tinted square told the rep nothing
                    // the sentence did not. The action gets the emphasis instead.
                    RoundIconButton(Icons.Default.Call, "Call $title") { vm.dialManual(phone) }
                }
            }
        }

        val roleplay = app.assistantMode == "roleplay"
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (roleplay) "Practice call" else "Ask the assistant",
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (app.assistantMessages.isNotEmpty()) {
                    TextButton(onClick = { vm.clearAssistant() }) { Text(if (roleplay) "Exit" else "Clear") }
                }
            }
        }

        // RAG v10 — Practice Mode: rehearse against an AI customer whose objections
        // come from the company's own playbook. Start it, or (mid-call) score it.
        item {
            if (!roleplay) {
                // Was a purple gradient with a 🎭 on it. Practice mode is a
                // feature of the assistant, so it reads as one: violet accent on
                // a soft violet ground, same geometry as everything else.
                Row(
                    Modifier.fillMaxWidth().clip(Radii.card)
                        .background(AppColors.VioletSoft)
                        .clickable(enabled = !app.assistantThinking) { vm.startRoleplay() }
                        .padding(Space.l),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Practice with a tough customer", style = AppType.rowTitle, color = AppColors.Violet)
                        Spacer(Modifier.height(Space.xxs))
                        Text("The AI plays a real customer — pitch by voice or text.",
                            style = AppType.meta, color = AppColors.TextSecondary)
                    }
                    Spacer(Modifier.width(Space.m))
                    Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = AppColors.Violet)
                }
            } else {
                Row(
                    Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.VioletSoft)
                        .padding(horizontal = Space.l, vertical = Space.m),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Live practice — the AI is your customer. Tap Score me when you finish.",
                        style = AppType.meta, color = AppColors.TextSecondary, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(Space.m))
                    Box(
                        Modifier.clip(Radii.tag).background(AppColors.Violet)
                            .clickable(enabled = !app.assistantThinking) { vm.askAssistant("score") }
                            .padding(horizontal = Space.m, vertical = Space.s),
                    ) { Text("Score me", color = AppColors.Surface, style = AppType.label) }
                }
            }
        }

        // Starter prompts — tapping one sends it straight to the AI coach.
        if (app.assistantMessages.isEmpty() && !roleplay) {
            item {
                val prompts = listOf(
                    "Which leads should I call first?",
                    "Customer says price is too high — what do I say?",
                    "Write a short WhatsApp follow-up message",
                    "How do I get a hesitant buyer to book a site visit?",
                )
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    prompts.forEach { q ->
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
                            .clickable { vm.askAssistant(q) }.padding(horizontal = 14.dp, vertical = 12.dp)) {
                            Text(q, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }

        // Conversation.
        items(app.assistantMessages) { msg ->
            val mine = msg.role == "user"
            Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                Box(
                    Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(14.dp))
                        .background(if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Text(msg.content, style = MaterialTheme.typography.bodyMedium,
                        color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        if (app.assistantThinking) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(10.dp))
                    Text("Thinking…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        // Composer — type, or tap the mic to speak (hands-free practice/coach).
        item {
            var draft by remember { mutableStateOf("") }
            val voiceLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.StartActivityForResult(),
            ) { result ->
                val spoken = result.data
                    ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
                if (!spoken.isNullOrBlank()) draft = spoken
            }
            fun startVoice() {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                    putExtra(RecognizerIntent.EXTRA_PROMPT, if (roleplay) "What will you say to the customer?" else "Speak your question")
                }
                runCatching { voiceLauncher.launch(intent) }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    draft, { draft = it },
                    placeholder = { Text(if (roleplay) "Reply to the customer…" else "Ask anything — pitch, objection, message…") },
                    modifier = Modifier.weight(1f), maxLines = 4,
                    trailingIcon = {
                        Icon(Icons.Default.Mic, contentDescription = "Speak",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { startVoice() }.padding(6.dp))
                    },
                )
                Button(
                    onClick = { vm.askAssistant(draft); draft = "" },
                    enabled = draft.isNotBlank() && !app.assistantThinking,
                ) { Text("Send") }
            }
        }
    }
}
