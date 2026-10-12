package com.salesautocall.app.ui.design

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.border
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * THE iOS KIT.
 *
 * Every screen builds from these so the app reads as one iOS-style product
 * instead of a dozen hand-made variants: one grouped card, one row, one chip,
 * one segmented control, one action sheet, one press feel, one haptic.
 * Presentation only — callers keep owning state and behaviour.
 */

// ── Haptics ──────────────────────────────────────────────────────

/**
 * Light taps, the way iOS uses them: a tick on a selection change, a soft
 * "click" on a primary action, a firmer one when something is confirmed.
 * Uses View haptics, which respect the phone's own "touch feedback" setting,
 * so a rep who has turned vibration off gets none.
 */
class Haptics internal constructor(private val view: View) {
    fun tap() { view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
    fun select() { view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
    fun confirm() {
        view.performHapticFeedback(
            if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK,
        )
    }
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    return remember(view) { Haptics(view) }
}

// ── Press feel ───────────────────────────────────────────────────

/**
 * iOS press feedback: the control dims and shrinks a touch on a spring,
 * instead of Material's ripple. Optional haptic tap on release.
 */
fun Modifier.iosPress(
    enabled: Boolean = true,
    haptic: Boolean = true,
    scaleTo: Float = 0.97f,
    onClick: () -> Unit,
): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed && enabled) scaleTo else 1f,
        spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow),
        label = "press",
    )
    val h = rememberHaptics()
    this
        .graphicsLayer {
            scaleX = scale; scaleY = scale
            alpha = if (pressed && enabled) 0.82f else 1f
        }
        .clickable(interactionSource = source, indication = null, enabled = enabled) {
            if (haptic) h.tap()
            onClick()
        }
}

// ── Grouped list ─────────────────────────────────────────────────

/** Half-point hairline, indented like an iOS table separator. */
@Composable
fun IosSeparator(startInset: androidx.compose.ui.unit.Dp = Space.l) {
    Box(
        Modifier.fillMaxWidth().padding(start = startInset)
            .height(0.5.dp).background(AppColors.Separator),
    )
}

/**
 * An inset-grouped section: optional grey header, a white continuous-corner
 * card, optional footer. No outline and no shadow — white on #F2F2F7 is the
 * whole effect, exactly like Settings.
 */
@Composable
fun IosGroup(
    modifier: Modifier = Modifier,
    header: String? = null,
    footer: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        if (!header.isNullOrBlank()) {
            AccentHeader(header, Modifier.padding(end = Space.l, bottom = Space.s))
        }
        Column(Modifier.fillMaxWidth().clip(Radii.card).background(AppColors.Surface), content = content)
        if (!footer.isNullOrBlank()) {
            Text(
                footer, style = AppType.footnote, color = AppColors.TextSecondary,
                modifier = Modifier.padding(start = Space.l, end = Space.l, top = 6.dp),
            )
        }
    }
}

/** The row's leading icon: monochrome graphite, no coloured tile. */
@Composable
fun IosIconTile(icon: ImageVector, @Suppress("UNUSED_PARAMETER") tint: Color, size: Int = 32) {
    Box(Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = Brand.Ink, modifier = Modifier.size((size * 0.66f).dp))
    }
}

/**
 * One table row: icon tile · title / subtitle · value · chevron (or a custom
 * trailing control such as a switch).
 */
@Composable
fun IosRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    iconTint: Color = IosColors.Blue,
    value: String? = null,
    destructive: Boolean = false,
    chevron: Boolean = false,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val h = rememberHaptics()
    Row(
        modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable { h.tap(); onClick() } else Modifier)
            .heightIn(min = 48.dp)
            .padding(horizontal = Space.l, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            IosIconTile(icon, iconTint)
            Spacer(Modifier.width(Space.m))
        }
        Column(Modifier.weight(1f)) {
            Text(
                title, style = AppType.label,
                color = if (destructive) IosColors.Red else AppColors.TextPrimary,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, style = AppType.footnote, color = AppColors.TextSecondary)
            }
        }
        if (!value.isNullOrBlank()) {
            Spacer(Modifier.width(Space.s))
            Text(value, style = AppType.label.copy(fontWeight = FontWeight.Bold), color = AppColors.TextPrimary, maxLines = 1)
        }
        trailing?.let { Spacer(Modifier.width(Space.s)); it() }
        if (chevron) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null,
                tint = AppColors.TextTertiary, modifier = Modifier.size(20.dp),
            )
        }
    }
}

/** iOS switch: green when on, white thumb, no Material outline when off. */
@Composable
fun IosSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, enabled: Boolean = true) {
    val h = rememberHaptics()
    Switch(
        checked = checked,
        onCheckedChange = { h.select(); onCheckedChange(it) },
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedThumbColor = Color.White,
            checkedTrackColor = IosColors.Green,
            checkedBorderColor = Color.Transparent,
            uncheckedThumbColor = Color.White,
            uncheckedTrackColor = Color(0xFFE9E9EB),
            uncheckedBorderColor = Color.Transparent,
        ),
    )
}

// ── Chips ────────────────────────────────────────────────────────

/**
 * THE one filter chip. Capsule, same height everywhere, count before label.
 *
 * Selected = solid accent with white text. Live = white with the count in
 * the accent. Empty (count 0) = faded and not tappable, never hidden, so the
 * row does not jump around as counts change. A null count shows no number;
 * a "—" count means the read failed and stays tappable.
 */
@Composable
fun IosChip(
    label: String,
    modifier: Modifier = Modifier,
    count: String? = null,
    selected: Boolean = false,
    empty: Boolean = false,
    accent: Color = AppColors.Indigo,
    /** Fill when selected. iOS: always systemBlue unless a caller says otherwise. */
    selectedColor: Color = accent,
    onClick: () -> Unit,
) {
    val faded = empty && !selected
    val bg = when {
        selected -> if (selectedColor == AppColors.Indigo) AppColors.TextPrimary else selectedColor
        faded -> AppColors.Surface.copy(alpha = 0.55f)
        else -> AppColors.Surface
    }
    val labelColor = when {
        selected -> Color.White
        faded -> AppColors.TextTertiary
        else -> AppColors.TextPrimary
    }
    val countColor = when {
        selected -> Color.White
        faded -> AppColors.TextTertiary
        else -> accent
    }
    Row(
        modifier.heightIn(min = 32.dp).clip(Radii.chip)
            .background(bg)
            .then(if (faded) Modifier else Modifier.iosPress(scaleTo = 0.95f) { onClick() })
            .padding(horizontal = 13.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (count != null) {
            Text(count, style = AppType.label, color = countColor, maxLines = 1)
            Spacer(Modifier.width(5.dp))
        }
        Text(label, style = AppType.metaStrong, color = labelColor, maxLines = 1)
    }
}

/** A small read-only tag: tinted capsule, coloured text. */
@Composable
fun IosTag(text: String, fg: Color, bg: Color = fg.copy(alpha = 0.12f)) {
    Box(Modifier.clip(Radii.tag).background(bg).padding(horizontal = 8.dp, vertical = 2.dp)) {
        Text(text, style = AppType.tag, color = fg, maxLines = 1)
    }
}

// ── Text that shrinks instead of breaking ─────────────────────────

/**
 * One line of text that steps its size down until it fits, never splits a
 * word and never hides the end of it (so "No answer 12" keeps its 12). A plain
 * Text plus a size state — no SubcomposeLayout, so it is safe inside any
 * intrinsic-measuring parent.
 */
@Composable
fun ShrinkText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    minSize: TextUnit = 10.sp,
    textAlign: TextAlign? = null,
) {
    var size by remember(text, style) { mutableFloatStateOf(style.fontSize.value) }
    Text(
        text,
        style = style.copy(fontSize = size.sp, lineHeight = (size * 1.25f).sp),
        color = color, maxLines = 1, softWrap = false, textAlign = textAlign,
        overflow = if (size <= minSize.value) TextOverflow.Ellipsis else TextOverflow.Clip,
        modifier = modifier,
        onTextLayout = { r -> if (r.hasVisualOverflow && size > minSize.value) size = (size - 0.5f).coerceAtLeast(minSize.value) },
    )
}

// ── Segmented control ────────────────────────────────────────────

/**
 * UISegmentedControl: grey track, a white thumb that springs to the chosen
 * segment, a selection tick of haptics. Labels shrink to fit, never wrap.
 */
@Composable
fun IosSegmented(
    options: List<String>,
    selectedIndex: Int,
    modifier: Modifier = Modifier,
    onSelect: (Int) -> Unit,
) {
    if (options.isEmpty()) return
    val h = rememberHaptics()
    var widthPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val pad = 3.dp
    val segW = with(density) { ((widthPx / options.size).toFloat()).toDp() } - pad * 2 / options.size
    // -1 = nothing chosen yet: no thumb, every label plain.
    val none = selectedIndex !in options.indices
    val idx = selectedIndex.coerceIn(0, options.size - 1)
    val thumbX by animateDpAsState(
        segW * idx,
        spring(dampingRatio = 0.78f, stiffness = Spring.StiffnessMediumLow),
        label = "seg",
    )
    Box(
        modifier.fillMaxWidth().height(36.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(9.dp)).background(IosColors.Fill)
            .onSizeChanged { widthPx = it.width }
            .padding(pad),
    ) {
        if (widthPx > 0 && !none) {
            Box(
                Modifier.offset(x = thumbX).width(segW).fillMaxHeight()
                    .shadow(2.dp, androidx.compose.foundation.shape.RoundedCornerShape(7.dp), clip = false, spotColor = Color.Black.copy(alpha = 0.2f))
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(7.dp)).background(Color.White),
            )
        }
        Row(Modifier.fillMaxWidth().fillMaxHeight()) {
            options.forEachIndexed { i, label ->
                val on = !none && i == idx
                Box(
                    Modifier.weight(1f).fillMaxHeight()
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            if (!on) { h.select(); onSelect(i) }
                        }
                        .padding(horizontal = 4.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    ShrinkText(
                        label,
                        style = AppType.label.copy(fontSize = 12.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium),
                        color = if (on) AppColors.TextPrimary else AppColors.TextSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

// ── Action sheet ─────────────────────────────────────────────────

data class SheetAction(
    val label: String,
    val destructive: Boolean = false,
    val enabled: Boolean = true,
    val icon: ImageVector? = null,
    val onClick: () -> Unit,
)

/**
 * UIAlertController(.actionSheet): a floating white group of centred actions
 * rising from the bottom, a separate bold Cancel under it, the screen dimmed
 * behind. Replaces Material's dropdown menu everywhere.
 *
 * Tapping an action closes the sheet first and then runs the action, so an
 * action that opens something else (a dialog, the dialler) never stacks on
 * top of a sheet that is still animating away.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IosActionSheet(
    actions: List<SheetAction>,
    onDismiss: () -> Unit,
    title: String? = null,
    message: String? = null,
) {
    val h = rememberHaptics()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = Color.Transparent,
        contentColor = AppColors.TextPrimary,
        tonalElevation = 0.dp,
        scrimColor = IosColors.Scrim,
        dragHandle = null,
        shape = androidx.compose.ui.graphics.RectangleShape,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 8.dp).padding(bottom = 8.dp)) {
            Column(Modifier.fillMaxWidth().clip(Radii.sheet).background(Color.White.copy(alpha = 0.97f))) {
                if (!title.isNullOrBlank() || !message.isNullOrBlank()) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = Space.l, vertical = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        if (!title.isNullOrBlank()) {
                            Text(title, style = AppType.footnote.copy(fontWeight = FontWeight.SemiBold),
                                color = AppColors.TextSecondary, textAlign = TextAlign.Center)
                        }
                        if (!message.isNullOrBlank()) {
                            Text(message, style = AppType.footnote, color = AppColors.TextSecondary, textAlign = TextAlign.Center)
                        }
                    }
                    IosSeparator(0.dp)
                }
                actions.forEachIndexed { i, a ->
                    if (i > 0) IosSeparator(0.dp)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp)
                            .clickable(enabled = a.enabled) { h.tap(); onDismiss(); a.onClick() }
                            .padding(horizontal = Space.l),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        val tint = when {
                            !a.enabled -> AppColors.TextTertiary
                            a.destructive -> IosColors.Red
                            else -> IosColors.Blue
                        }
                        a.icon?.let {
                            Icon(it, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(10.dp))
                        }
                        Text(a.label, style = AppType.body.copy(fontSize = 18.sp), color = tint, maxLines = 1)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(Radii.sheet).background(Color.White)
                    .clickable { h.tap(); onDismiss() },
                contentAlignment = Alignment.Center,
            ) {
                Text("Cancel", style = AppType.body.copy(fontSize = 18.sp, fontWeight = FontWeight.SemiBold), color = IosColors.Blue)
            }
        }
    }
}

// ── Navigation bar ───────────────────────────────────────────────

/**
 * The navigation bar, Apple style: the grouped canvas, graphite icons, and a
 * small centred-weight title that fades in only once the large title has
 * scrolled away ([collapsed]) — then a hairline appears under it.
 */
@Composable
fun IosNavBar(
    title: String,
    collapsed: Boolean,
    modifier: Modifier = Modifier,
    backLabel: String? = "Back",
    onBack: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    /**
     * The one grey line under the title — "545 leads · ₹14.62 Cr on the
     * table". When a screen passes this it is saying "my title belongs in the
     * bar", and the bar grows to 52dp to hold both lines. It is how Phone and
     * Messages carry a name and a status without spending a whole row on it.
     */
    subtitle: String? = null,
) {
    val a by animateFloatAsState(if (collapsed) 1f else 0f, tween(180), label = "nav")
    // THE TITLE IS CENTRED, which is what iOS does and what this was not.
    //
    // It used to sit in a weight(1f) slot after the leading button, so it
    // started wherever the hamburger ended — left-aligned and a different
    // distance from the edge on every screen depending on what was beside it.
    // A Box lets the leading and trailing controls hold the edges while the
    // title holds the middle regardless of them, and the 72dp side padding
    // stops a long title from sliding underneath either one.
    Column(modifier.fillMaxWidth().background(AppColors.Canvas.copy(alpha = 0.96f))) {
        Box(
            Modifier.fillMaxWidth()
                .height(if (subtitle.isNullOrBlank()) 44.dp else 52.dp)
                .padding(horizontal = Space.s),
        ) {
            if (onBack != null) {
                Row(
                    Modifier.align(Alignment.CenterStart).heightIn(min = 44.dp).iosPress { onBack() },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = backLabel ?: "Back",
                        tint = AppColors.Indigo, modifier = Modifier.size(28.dp))
                    if (!backLabel.isNullOrBlank()) Text(backLabel, style = AppType.body, color = AppColors.Indigo, maxLines = 1)
                }
            } else if (leading != null) {
                Box(Modifier.align(Alignment.CenterStart)) {
                    CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides AppColors.TextPrimary) {
                        GlassBox { leading() }
                    }
                }
            }
            Column(
                Modifier.align(Alignment.Center).padding(horizontal = 72.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    title, style = AppType.headline, color = AppColors.TextPrimary.copy(alpha = a),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle, style = AppType.footnote, color = AppColors.TextSecondary.copy(alpha = a),
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            trailing?.let {
                Box(Modifier.align(Alignment.CenterEnd)) {
                    CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides AppColors.TextPrimary) { it() }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(AppColors.Separator.copy(alpha = a)))
    }
}

/** The large title a screen opens with (22), and its optional grey line. */
@Composable
fun IosLargeTitle(title: String, subtitle: String? = null, modifier: Modifier = Modifier, inset: androidx.compose.ui.unit.Dp = Space.l) {
    Column(modifier.fillMaxWidth().padding(start = inset, end = inset, top = Space.s, bottom = Space.xs)) {
        Text(title, style = AppType.title, color = AppColors.TextPrimary)
        if (!subtitle.isNullOrBlank()) {
            Text(subtitle, style = AppType.meta, color = AppColors.TextSecondary)
        }
    }
}

// ── The coach ────────────────────────────────────────────────────

/**
 * The AI coach's face: a small glass orb that breathes.
 *
 * Calm, not cute. A blue-to-violet sphere with a soft highlight, scaling a few
 * percent over ~3 s, with a faint halo that swells when [active] (the coach has
 * something new to say). No eyes, no mascot — the same restraint as Siri's orb.
 */
@Composable
fun CoachOrb(
    size: androidx.compose.ui.unit.Dp = 44.dp,
    active: Boolean = false,
    modifier: Modifier = Modifier,
    face: Boolean = false,
) {
    val t = rememberInfiniteTransition(label = "orb")
    val breathe by t.animateFloat(
        0.94f, 1f,
        infiniteRepeatable(tween(2800, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breathe",
    )
    val halo by t.animateFloat(
        0f, 1f,
        infiniteRepeatable(tween(2400, easing = FastOutSlowInEasing), RepeatMode.Restart),
        label = "halo",
    )
    val swirl by t.animateFloat(
        0f, 360f,
        infiniteRepeatable(tween(12000, easing = androidx.compose.animation.core.LinearEasing), RepeatMode.Restart),
        label = "swirl",
    )
    // Eyes blink every few seconds — only drawn when face = true (the
    // character for the morning greeting and Coaching time).
    val blink by t.animateFloat(
        1f, 1f,
        infiniteRepeatable(
            androidx.compose.animation.core.keyframes {
                durationMillis = 4200
                1f at 0
                1f at 3880
                0.08f at 3980
                1f at 4100
            },
        ),
        label = "blink",
    )
    Canvas(modifier.size(size)) {
        val c = Offset(this.size.width / 2f, this.size.height / 2f)
        val full = this.size.minDimension / 2f
        val r = full * 0.78f * breathe
        if (active) {
            // One ring drifting outward and fading — "I have something for you".
            drawCircle(
                color = IosColors.Indigo.copy(alpha = 0.22f * (1f - halo)),
                radius = r + (full - r) * halo, center = c,
            )
        }
        drawCircle(color = IosColors.Blue.copy(alpha = 0.10f), radius = full * 0.98f * breathe, center = c)
        drawCircle(
            brush = Brush.radialGradient(
                listOf(Color(0xFF6FB6FF), IosColors.Blue, IosColors.Indigo, Color(0xFF8E44D9)),
                center = Offset(c.x - r * 0.35f, c.y - r * 0.45f), radius = r * 2.1f,
            ),
            radius = r, center = c,
        )
        // A slow inner swirl so the orb feels alive without moving much.
        val rad = Math.toRadians(swirl.toDouble())
        val sx = c.x + (r * 0.35f * kotlin.math.cos(rad)).toFloat()
        val sy = c.y + (r * 0.35f * kotlin.math.sin(rad)).toFloat()
        drawCircle(
            brush = Brush.radialGradient(listOf(Color(0x66FFFFFF), Color.Transparent), center = Offset(sx, sy), radius = r * 0.7f),
            radius = r, center = c,
        )
        // Specular highlight, top-left.
        drawCircle(
            brush = Brush.radialGradient(
                listOf(Color(0xCCFFFFFF), Color.Transparent),
                center = Offset(c.x - r * 0.38f, c.y - r * 0.42f), radius = r * 0.45f,
            ),
            radius = r * 0.45f, center = Offset(c.x - r * 0.38f, c.y - r * 0.42f),
        )
        if (face) {
            val ew = r * 0.17f
            val eh = r * 0.30f * blink
            for (dx in listOf(-0.30f, 0.30f)) {
                drawOval(
                    color = Color.White,
                    topLeft = Offset(c.x + r * dx - ew / 2f, c.y - r * 0.12f - eh / 2f),
                    size = androidx.compose.ui.geometry.Size(ew, eh.coerceAtLeast(1f)),
                )
            }
            drawArc(
                color = Color.White,
                startAngle = 20f, sweepAngle = 140f, useCenter = false,
                topLeft = Offset(c.x - r * 0.32f, c.y - r * 0.05f),
                size = androidx.compose.ui.geometry.Size(r * 0.64f, r * 0.44f),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = r * 0.09f, cap = androidx.compose.ui.graphics.StrokeCap.Round),
            )
        }
    }
}


// ── Search field ─────────────────────────────────────────────────

/**
 * UISearchBar: a 36dp rounded field on the grey system fill, magnifier inside,
 * grey placeholder, and a clear button once there is text.
 */
@Composable
fun IosSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search",
) {
    Row(
        modifier.fillMaxWidth().height(38.dp).clip(ContinuousShape(10.dp)).background(IosColors.Fill)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(androidx.compose.material.icons.Icons.Default.Search, contentDescription = null,
            tint = IosColors.Gray, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        androidx.compose.foundation.text.BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = AppType.body.copy(fontSize = 17.sp, color = AppColors.TextPrimary),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(IosColors.Blue),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) Text(placeholder, style = AppType.body.copy(fontSize = 17.sp), color = IosColors.Gray, maxLines = 1)
                    inner()
                }
            },
        )
        if (value.isNotEmpty()) {
            Box(
                Modifier.size(20.dp).clip(CircleShape).background(IosColors.Gray2)
                    .clickable { onValueChange("") },
                contentAlignment = Alignment.Center,
            ) {
                Icon(androidx.compose.material.icons.Icons.Default.Close, contentDescription = "Clear search",
                    tint = Color.White, modifier = Modifier.size(13.dp))
            }
        }
    }
}
