package com.salesautocall.app.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.LocalOffer
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import android.content.ActivityNotFoundException
import android.Manifest
import com.salesautocall.app.data.ScanListParser
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.IosActionSheet
import com.salesautocall.app.ui.design.IosColors
import com.salesautocall.app.ui.design.IosGroup
import com.salesautocall.app.ui.design.IosNavBar
import com.salesautocall.app.ui.design.IosRow
import com.salesautocall.app.ui.design.IosSeparator
import com.salesautocall.app.ui.design.IosTag
import com.salesautocall.app.ui.design.PrimaryButton
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.SheetAction
import com.salesautocall.app.ui.design.Space
import com.salesautocall.app.ui.design.iosPress
import kotlinx.coroutines.launch
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * SCAN LIST — free for every rep, no limit.
 *
 * Replaces "copy the list with Google Lens, paste it somewhere, dial one by
 * one": Source → Read → Review, then the numbers are leads in Call now and the
 * existing Start calling dials them. Leads are created through the same
 * Repository.addLead as the Add lead sheet, so company, owner and the dedup
 * trigger behave exactly as they always have. No popup after calls, no new
 * scheduler — this screen only feeds the queue that already exists.
 */

enum class ScanSource { Camera, Photo, Paste }

/** One reviewed number. [inCrm] comes from the leads the app already holds. */
data class ScanItem(
    val id: Int,
    val name: String,
    val phone: String,
    val valid: Boolean,
    val duplicate: Boolean,
    val inCrm: Boolean,
) {
    val addable get() = valid && !duplicate && !inCrm
    val flag: String? get() = when {
        !valid -> "Invalid number"
        duplicate -> "Duplicate in list"
        inCrm -> "Already in CRM"
        else -> null
    }
}

fun defaultScanTag(today: LocalDate = LocalDate.now()): String =
    "Scanned list · " + today.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))

/** Parser rows → review items, flagging numbers the rep already has. */
fun toScanItems(rows: List<ScanListParser.Row>, crmKeys: Set<String>): List<ScanItem> =
    rows.mapIndexed { i, r ->
        ScanItem(
            id = i, name = r.name.orEmpty(), phone = r.phone, valid = r.valid, duplicate = r.duplicate,
            inCrm = r.valid && ScanListParser.key(r.phone) in crmKeys,
        )
    }

@Composable
fun ScanListScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var step by remember { mutableStateOf(1) }
    var source by remember { mutableStateOf(ScanSource.Camera) }
    var reading by remember { mutableStateOf(false) }
    var readError by remember { mutableStateOf<String?>(null) }
    var photo by remember { mutableStateOf<ImageBitmap?>(null) }
    var boxes by remember { mutableStateOf<List<ScanBox>>(emptyList()) }
    var pasteText by remember { mutableStateOf("") }
    var found by remember { mutableStateOf<Int?>(null) }
    val items = remember { mutableStateListOf<ScanItem>() }
    var tag by remember { mutableStateOf(defaultScanTag()) }
    var project by remember { mutableStateOf<String?>(null) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    val crmKeys = remember(app.leads) { app.leads.mapNotNull { ScanListParser.key(it.phone) }.toHashSet() }
    val projects = remember(app.leads, app.projectSites) {
        (app.projectSites.map { it.name } + app.leads.mapNotNull { it.companyName })
            .map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }.sorted()
    }

    fun applyRows(rows: List<ScanListParser.Row>) {
        items.clear(); items += toScanItems(rows, crmKeys)
        found = rows.size
    }

    fun readUri(uri: Uri) {
        step = 2; reading = true; readError = null; found = null; photo = null; boxes = emptyList()
        scope.launch {
            runCatching { ScanOcr.read(ctx, uri) }
                .onSuccess { r ->
                    val rows = ScanListParser.parseLines(r.rows)
                    photo = r.bitmap.asImageBitmap()
                    boxes = rows.groupBy { it.line }.flatMap { (line, rs) ->
                        r.numberBoxes.getOrNull(line).orEmpty().map { b ->
                            ScanBox(b.left / r.bitmap.width.toFloat(), b.top / r.bitmap.height.toFloat(),
                                b.width() / r.bitmap.width.toFloat(), b.height() / r.bitmap.height.toFloat(), rs.any { it.valid })
                        }
                    }
                    applyRows(rows)
                }
                .onFailure { readError = it.message ?: "Couldn't read that photo." }
            reading = false
        }
    }

    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val u = cameraUri
        if (ok && u != null) readUri(u)
    }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) readUri(uri)
    }

    fun openCamera() {
        readError = null
        val dir = File(ctx.cacheDir, "scans").apply { mkdirs() }
        val f = File(dir, "scan_${System.currentTimeMillis()}.jpg")
        val u = FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", f)
        cameraUri = u
        try {
            takePicture.launch(u)
        } catch (e: ActivityNotFoundException) {
            readError = "No camera app found. Try Photo."
        } catch (e: SecurityException) {
            readError = "Allow camera access to scan a list. Or try Photo."
        }
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) openCamera() else readError = "Allow camera access to scan a list. Or try Photo."
    }

    fun start() {
        when (source) {
            ScanSource.Camera -> {
                // The manifest declares CAMERA (attendance selfie), so Android refuses
                // ACTION_IMAGE_CAPTURE with a SecurityException until it is granted.
                // That exception used to be reported as "No camera app found".
                val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
                if (granted) openCamera() else cameraPermission.launch(Manifest.permission.CAMERA)
            }
            ScanSource.Photo -> runCatching {
                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }.onFailure { readError = "Couldn't open your photos." }
            ScanSource.Paste -> { step = 2; found = null; photo = null; boxes = emptyList() }
        }
    }

    fun back() { if (step == 1) vm.closeScanList() else step -= 1 }
    BackHandler { back() }

    Column(Modifier.fillMaxSize().background(AppColors.Canvas).statusBarsPadding().navigationBarsPadding()) {
        IosNavBar(title = "Scan list", collapsed = true, backLabel = if (step == 1) "Cancel" else "Back", onBack = { back() })
        ScanProgress(step)
        Box(Modifier.weight(1f)) {
            when (step) {
                1 -> ScanStepSource(source, onSelect = { source = it }, error = readError, onContinue = { start() })
                2 -> ScanStepRead(
                    paste = source == ScanSource.Paste,
                    photo = photo, boxes = boxes, reading = reading, error = readError,
                    pasteText = pasteText, onPasteChange = { pasteText = it },
                    found = found,
                    onReadPaste = { applyRows(ScanListParser.parse(pasteText)) },
                    onNext = { step = 3 },
                )
                else -> ScanStepReview(
                    items = items,
                    onName = { id, n -> val i = items.indexOfFirst { it.id == id }; if (i >= 0) items[i] = items[i].copy(name = n) },
                    onRemove = { id -> items.removeAll { it.id == id } },
                    tag = tag, onTag = { tag = it },
                    project = project, projects = projects, onProject = { project = it },
                    adding = app.addingLead,
                    onAdd = {
                        vm.addScannedLeads(items.filter { it.addable }.map { it.name to it.phone }, tag, project)
                    },
                )
            }
        }
    }
}

/** A detected number's box, as fractions of the photo. */
data class ScanBox(val x: Float, val y: Float, val w: Float, val h: Float, val valid: Boolean)

@Composable
fun ScanProgress(step: Int) {
    Row(Modifier.fillMaxWidth().padding(horizontal = Space.l, vertical = Space.s), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
        listOf("Source", "Read", "Review").forEachIndexed { i, l ->
            val n = i + 1
            Column(Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth().height(4.dp).clip(Radii.chip).background(if (n <= step) AppColors.Indigo else AppColors.BorderStrong))
                Spacer(Modifier.height(Space.s))
                Text("$n. $l", style = AppType.footnote, color = if (n == step) AppColors.Indigo else AppColors.TextSecondary)
            }
        }
    }
}

@Composable
fun ScanStepSource(selected: ScanSource, onSelect: (ScanSource) -> Unit, error: String?, onContinue: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = Space.l)) {
        Spacer(Modifier.height(Space.s))
        Text("Where is the list?", style = AppType.title2, color = AppColors.TextPrimary)
        Spacer(Modifier.height(Space.s))
        Text("Free. Read on your phone, nothing is uploaded.", style = AppType.subhead, color = AppColors.TextSecondary)
        Spacer(Modifier.height(Space.xxl))
        listOf(
            Triple(ScanSource.Camera, Icons.Outlined.CameraAlt, "Paper list, register, whiteboard"),
            Triple(ScanSource.Photo, Icons.Outlined.Image, "Screenshot or gallery image"),
            Triple(ScanSource.Paste, Icons.Outlined.ContentPaste, "WhatsApp or Excel list"),
        ).forEach { (s, icon, sub) ->
            SourceCard(s.label(), sub, icon, s == selected) { onSelect(s) }
            Spacer(Modifier.height(Space.l))
        }
        if (error != null) Text(error, style = AppType.footnote, color = IosColors.Red)
        Spacer(Modifier.weight(1f))
        PrimaryButton("Continue", Modifier.fillMaxWidth().padding(bottom = Space.l), onClick = onContinue)
    }
}

private fun ScanSource.label() = when (this) { ScanSource.Camera -> "Camera"; ScanSource.Photo -> "Photo"; ScanSource.Paste -> "Paste text" }

@Composable
private fun SourceCard(title: String, sub: String, icon: ImageVector, on: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface)
            .then(if (on) Modifier.border(2.dp, AppColors.Indigo, Radii.card) else Modifier)
            .iosPress { onClick() }.padding(Space.l),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(48.dp).clip(Radii.card).background(AppColors.Canvas), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = AppColors.TextPrimary, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.width(Space.l))
        Column(Modifier.weight(1f)) {
            Text(title, style = AppType.headline, color = AppColors.TextPrimary)
            Text(sub, style = AppType.footnote, color = AppColors.TextSecondary)
        }
        Box(
            Modifier.size(24.dp).clip(CircleShape)
                .then(if (on) Modifier.background(AppColors.Indigo) else Modifier.border(2.dp, AppColors.BorderStrong, CircleShape)),
            contentAlignment = Alignment.Center,
        ) { if (on) Icon(Icons.Default.Check, null, tint = AppColors.OnIndigo, modifier = Modifier.size(16.dp)) }
    }
}

@Composable
fun ScanStepRead(
    paste: Boolean,
    photo: ImageBitmap?,
    boxes: List<ScanBox>,
    reading: Boolean,
    error: String?,
    pasteText: String,
    onPasteChange: (String) -> Unit,
    found: Int?,
    onReadPaste: () -> Unit,
    onNext: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = Space.l)) {
        Spacer(Modifier.height(Space.s))
        if (paste) {
            Text("Paste the list", style = AppType.headline, color = AppColors.TextPrimary)
            Spacer(Modifier.height(Space.s))
            Box(Modifier.fillMaxWidth().weight(1f).clip(Radii.card).background(AppColors.Surface).padding(Space.l)) {
                if (pasteText.isEmpty()) Text("Names and numbers, any format. WhatsApp forwards work too.", style = AppType.subhead, color = AppColors.TextTertiary)
                BasicTextField(
                    pasteText, onPasteChange, Modifier.fillMaxSize(),
                    textStyle = AppType.subhead.copy(color = AppColors.TextPrimary), cursorBrush = SolidColor(AppColors.Indigo),
                )
            }
        } else {
            Box(Modifier.fillMaxWidth().weight(1f).clip(Radii.card).background(Color(0xFF1C1C1E)), contentAlignment = Alignment.Center) {
                if (photo != null) {
                    Box(Modifier.aspectRatio(photo.width / photo.height.toFloat())) {
                        Image(photo, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        Canvas(Modifier.fillMaxSize()) {
                            boxes.forEach { b ->
                                val c = if (b.valid) IosColors.Blue else IosColors.Gray2
                                val tl = Offset(b.x * size.width - 4f, b.y * size.height - 4f)
                                val sz = Size(b.w * size.width + 8f, b.h * size.height + 8f)
                                drawRoundRect(c.copy(alpha = 0.22f), tl, sz, CornerRadius(8f))
                                drawRoundRect(c, tl, sz, CornerRadius(8f), style = Stroke(4f))
                            }
                        }
                    }
                } else if (error == null) {
                    Text("Opening photo…", style = AppType.subhead, color = IosColors.Gray2)
                }
            }
        }
        Spacer(Modifier.height(Space.l))
        IosGroup {
            if (paste) {
                CheckLine("Text pasted", pasteText.isNotBlank())
            } else {
                CheckLine(if (reading) "Reading text…" else "Text read", !reading && error == null && photo != null)
            }
            CheckLine(found?.let { "$it numbers found" } ?: "Finding numbers", found != null)
            CheckLine("Checked against your leads", found != null)
        }
        if (error != null) {
            Spacer(Modifier.height(Space.s))
            Text(error, style = AppType.footnote, color = IosColors.Red)
        }
        Spacer(Modifier.height(Space.l))
        when {
            paste && found == null -> PrimaryButton("Find numbers", Modifier.fillMaxWidth().padding(bottom = Space.l), enabled = pasteText.isNotBlank(), onClick = onReadPaste)
            else -> PrimaryButton(
                if (found == 0) "No numbers found" else "Review ${found ?: 0} numbers",
                Modifier.fillMaxWidth().padding(bottom = Space.l), enabled = (found ?: 0) > 0, onClick = onNext,
            )
        }
    }
}

@Composable
private fun CheckLine(text: String, done: Boolean) {
    Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).padding(horizontal = Space.l), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Check, null, tint = if (done) AppColors.Positive else AppColors.TextTertiary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Space.m))
        Text(text, style = AppType.subhead, color = if (done) AppColors.TextPrimary else AppColors.TextSecondary)
    }
}

@Composable
fun ScanStepReview(
    items: List<ScanItem>,
    onName: (Int, String) -> Unit,
    onRemove: (Int) -> Unit,
    tag: String,
    onTag: (String) -> Unit,
    project: String?,
    projects: List<String>,
    onProject: (String?) -> Unit,
    adding: Boolean,
    onAdd: () -> Unit,
) {
    val ready = items.count { it.addable }
    val flagged = items.size - ready
    var pickProject by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = Space.l, vertical = Space.s)) {
            item {
                Text("${items.size} numbers found", style = AppType.headline, color = AppColors.TextPrimary)
                Text(
                    "$ready ready to add" + if (flagged > 0) " · $flagged flagged, won't be added" else "",
                    style = AppType.footnote, color = AppColors.TextSecondary,
                )
                Spacer(Modifier.height(Space.m))
            }
            itemsIndexed(items, key = { _, it -> it.id }) { i, it ->
                val top = i == 0; val bottom = i == items.lastIndex
                val shape = androidx.compose.foundation.shape.RoundedCornerShape(
                    topStart = if (top) 12.dp else 0.dp, topEnd = if (top) 12.dp else 0.dp,
                    bottomStart = if (bottom) 12.dp else 0.dp, bottomEnd = if (bottom) 12.dp else 0.dp,
                )
                Column(Modifier.fillMaxWidth().clip(shape).background(AppColors.Surface)) {
                    if (!top) IosSeparator()
                    ScanRow(it, onName = { n -> onName(it.id, n) }, onRemove = { onRemove(it.id) })
                }
            }
            item {
                Spacer(Modifier.height(Space.l))
                IosGroup(footer = "The tag is saved as the lead's source, so your admin can see where these came from.") {
                    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = Space.l), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.LocalOffer, null, tint = AppColors.TextPrimary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(Space.m))
                        Text("Source", style = AppType.label, color = AppColors.TextPrimary)
                        Spacer(Modifier.width(Space.l))
                        BasicTextField(
                            tag, { s -> onTag(s.take(60)) }, Modifier.weight(1f), singleLine = true,
                            textStyle = AppType.label.copy(color = AppColors.TextSecondary, textAlign = androidx.compose.ui.text.style.TextAlign.End),
                            cursorBrush = SolidColor(AppColors.Indigo),
                        )
                    }
                    IosSeparator()
                    IosRow("Project", icon = Icons.Outlined.Folder, value = project ?: "Optional", chevron = true, onClick = { pickProject = true })
                }
                Spacer(Modifier.height(Space.l))
            }
        }
        Column(Modifier.fillMaxWidth().background(AppColors.Canvas).padding(horizontal = Space.l, vertical = Space.m)) {
            PrimaryButton(
                if (adding) "Adding…" else "Add $ready to Call now", Modifier.fillMaxWidth(),
                icon = Icons.Default.Call, enabled = ready > 0 && !adding, onClick = onAdd,
            )
            Spacer(Modifier.height(Space.s))
            Text(
                "Then tap Start calling on Leads to dial them one after another.",
                style = AppType.footnote, color = AppColors.TextSecondary,
                modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
    if (pickProject) {
        IosActionSheet(
            title = "Project",
            actions = listOf(SheetAction("No project") { onProject(null) }) + projects.map { p -> SheetAction(p) { onProject(p) } },
            onDismiss = { pickProject = false },
        )
    }
}

@Composable
private fun ScanRow(item: ScanItem, onName: (String) -> Unit, onRemove: () -> Unit) {
    val dim = !item.valid
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = Space.l, end = Space.s, top = Space.s, bottom = Space.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Box {
                if (item.name.isEmpty()) Text("Add name", style = AppType.label, color = AppColors.TextTertiary)
                BasicTextField(
                    item.name, { onName(it.take(40)) }, Modifier.fillMaxWidth(), singleLine = true,
                    textStyle = AppType.label.copy(color = if (dim) AppColors.TextSecondary else AppColors.TextPrimary),
                    cursorBrush = SolidColor(AppColors.Indigo),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (item.valid) "+91 ${item.phone.take(5)} ${item.phone.drop(5)}" else item.phone,
                    style = AppType.footnote, color = AppColors.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                item.flag?.let { f ->
                    Spacer(Modifier.width(Space.s))
                    IosTag(f, when (f) { "Invalid number" -> AppColors.Danger; "Duplicate in list" -> AppColors.Violet; else -> AppColors.Warning })
                }
            }
        }
        Box(Modifier.size(44.dp).clip(CircleShape).clickable { onRemove() }, contentAlignment = Alignment.Center) {
            Icon(Icons.Default.Close, "Remove", tint = AppColors.TextTertiary, modifier = Modifier.size(18.dp))
        }
    }
}
