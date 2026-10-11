package com.salesautocall.app.ui.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The brand layer of the design system — Apple family (Oct 2026).
 *
 * Same API as the gradient restyle (#523) so no screen changes behaviour, but
 * the paint is flat: one blue accent, white cards on #F2F2F7, monochrome icons
 * on a quiet grey tile, hairline-soft shadows. No gradients, no glass.
 */
object Brand {
    val Start = Color(0xFF007AFF)
    val End = Color(0xFF007AFF)

    /** Kept for API compatibility; a solid accent now. */
    val gradient: Brush = SolidColor(Start)
    val gradientHorizontal: Brush = SolidColor(Start)

    /** Neutral, barely-there card shadow. */
    val Shadow = Color.Black.copy(alpha = 0.06f)

    /** Quiet fill/border for icon buttons (the old glass-on-gradient). */
    val OnGradientFill = Color(0xFFF2F2F7)
    val OnGradientBorder = Color.Transparent

    /** Monochrome icon ink. */
    val Ink = Color(0xFF3A3A3C)
}

/** A tile tone. Monochrome in the Apple family: grey fill, graphite icon. */
data class TileTone(val from: Color, val to: Color) {
    val brush: Brush get() = SolidColor(from)
    val solid: Color get() = from
}

/** One neutral tone for every meaning — colour no longer encodes category. */
object Tiles {
    private val Quiet = TileTone(Color(0xFFF2F2F7), Color(0xFFF2F2F7))
    val FollowUp = Quiet
    val Positive = Quiet
    val Negative = Quiet
    val Time = Quiet
    val Leads = Quiet
    val Calls = Quiet
    val Brand = Quiet

    fun forTint(@Suppress("UNUSED_PARAMETER") tint: Color): TileTone = Quiet
}

/** White card with a soft neutral shadow. */
fun Modifier.softCard(shape: Shape = Radii.card, elevation: Dp = 10.dp, color: Color = AppColors.Surface): Modifier =
    this.shadow((elevation / 3), shape, clip = false, ambientColor = Brand.Shadow, spotColor = Brand.Shadow)
        .clip(shape)
        .background(color)

/** Was a gradient card; now the solid accent (buttons) — same signature. */
fun Modifier.gradientCard(shape: Shape = Radii.card, brush: Brush = Brand.gradient, @Suppress("UNUSED_PARAMETER") elevation: Dp = 12.dp): Modifier =
    this.clip(shape).background(brush)

/** A quiet rounded icon tile: #F2F2F7 fill, graphite monochrome icon. */
@Composable
fun GradientIconTile(icon: ImageVector, tone: TileTone, size: Dp = 48.dp, iconSize: Dp = size * 0.5f) {
    val shape = RoundedCornerShape(size / 4)
    Box(
        Modifier.size(size).clip(shape).background(tone.from),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Brand.Ink, modifier = Modifier.size(iconSize)) }
}

/** Status pill: light tinted fill, coloured text, thin coloured border. */
@Composable
fun OutlinedPill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier.clip(Radii.tag).background(color.copy(alpha = 0.10f))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(androidx.compose.foundation.shape.CircleShape).background(color))
            Spacer(Modifier.width(6.dp))
            Text(text, style = AppType.tag, color = color, maxLines = 1)
        }
    }
}

/** Section header: light grey uppercase subhead (iOS grouped style). */
@Composable
fun AccentHeader(text: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().heightIn(min = 24.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = AppType.sectionLabel, color = AppColors.TextSecondary, modifier = Modifier.weight(1f), maxLines = 1)
        trailing?.invoke()
    }
}

/** Plain 44dp icon button in graphite (was glass-on-gradient). */
@Composable
fun GlassIconButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).iosPress(scaleTo = 0.92f) { onClick() }, contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription, tint = AppColors.TextPrimary, modifier = Modifier.size(22.dp))
    }
}

/** Frame for custom content in a bar (now unframed). */
@Composable
fun GlassBox(content: @Composable () -> Unit) {
    Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { content() }
}

/** Thin rounded progress bar in the accent. [fraction] is clamped to 0..1. */
@Composable
fun GradientProgress(fraction: Float, modifier: Modifier = Modifier, height: Dp = 6.dp) {
    val f = if (fraction.isNaN()) 0f else fraction.coerceIn(0f, 1f)
    Box(modifier.fillMaxWidth().height(height).clip(Radii.tag).background(AppColors.SurfaceMuted)) {
        if (f > 0f) Box(Modifier.fillMaxWidth(f).height(height).clip(Radii.tag).background(Brand.gradientHorizontal))
    }
}
