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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The brand layer of the design system (Oct 2026 restyle).
 *
 * Pure paint: gradients, soft shadows, icon tiles, outlined pills. No state,
 * no logic, nothing a screen's behaviour depends on.
 */
object Brand {
    val Start = Color(0xFF5B5BF0)
    val End = Color(0xFF4AA3FF)

    /** Indigo to sky, left to right: app bars, the primary button, hero cards. */
    val gradient: Brush = Brush.linearGradient(listOf(Start, End))
    val gradientHorizontal: Brush = Brush.horizontalGradient(listOf(Start, End))

    /** Soft, coloured shadow tint for white cards. */
    val Shadow = Color(0xFF5B5BF0).copy(alpha = 0.16f)

    /** Translucent white for icon buttons sitting on the gradient. */
    val OnGradientFill = Color.White.copy(alpha = 0.20f)
    val OnGradientBorder = Color.White.copy(alpha = 0.28f)
}

/** A two-stop tile gradient for one meaning (category or metric). */
data class TileTone(val from: Color, val to: Color) {
    val brush: Brush get() = Brush.linearGradient(listOf(from, to))
    val solid: Color get() = from
}

/** The fixed meaning-to-colour map for icon tiles. */
object Tiles {
    val FollowUp = TileTone(Color(0xFF7C5CFA), Color(0xFFA78BFA))   // violet
    val Positive = TileTone(Color(0xFF16A34A), Color(0xFF4ADE80))   // green: connected / converted
    val Negative = TileTone(Color(0xFFEF4444), Color(0xFFF87171))   // red: not connected / missed
    val Time = TileTone(Color(0xFFF59E0B), Color(0xFFFCD34D))       // amber: time / scheduled
    val Leads = TileTone(Color(0xFF06B6D4), Color(0xFF67E8F9))      // teal
    val Calls = TileTone(Color(0xFFEC4899), Color(0xFFF9A8D4))      // pink
    val Brand = TileTone(com.salesautocall.app.ui.design.Brand.Start, com.salesautocall.app.ui.design.Brand.End)

    /** Map an existing single tint to the closest tile tone, so old call sites keep their meaning. */
    fun forTint(tint: Color): TileTone = when (tint) {
        IosColors.Green, AppColors.Positive, AppColors.CallAccept -> Positive
        IosColors.Red, AppColors.Danger, AppColors.Recording -> Negative
        IosColors.Orange, IosColors.Yellow, AppColors.Warning -> Time
        IosColors.Teal, AppColors.Teal -> Leads
        IosColors.Pink -> Calls
        IosColors.Purple, IosColors.Indigo, AppColors.Violet -> FollowUp
        IosColors.Gray, IosColors.Gray2, AppColors.Slate, AppColors.TextSecondary -> TileTone(Color(0xFF64748B), Color(0xFF94A3B8))
        else -> Brand
    }
}

/** White card with a soft coloured shadow. */
fun Modifier.softCard(shape: Shape = Radii.card, elevation: Dp = 10.dp, color: Color = AppColors.Surface): Modifier =
    this.shadow(elevation, shape, clip = false, ambientColor = Brand.Shadow, spotColor = Brand.Shadow)
        .clip(shape)
        .background(color)

/** Brand-gradient fill, clipped to [shape], with a soft coloured shadow. */
fun Modifier.gradientCard(shape: Shape = Radii.card, brush: Brush = Brand.gradient, elevation: Dp = 12.dp): Modifier =
    this.shadow(elevation, shape, clip = false, ambientColor = Brand.Shadow, spotColor = Brand.Start.copy(alpha = 0.35f))
        .clip(shape)
        .background(brush)

/** A rounded gradient icon tile (16dp corners at 48dp). */
@Composable
fun GradientIconTile(icon: ImageVector, tone: TileTone, size: Dp = 48.dp, iconSize: Dp = size * 0.5f) {
    val shape = RoundedCornerShape(size / 3)
    Box(
        Modifier.size(size)
            .shadow(6.dp, shape, clip = false, ambientColor = tone.from.copy(alpha = 0.3f), spotColor = tone.from.copy(alpha = 0.4f))
            .clip(shape).background(tone.brush),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(iconSize)) }
}

/** Status pill: light tinted fill, coloured text, thin coloured border. */
@Composable
fun OutlinedPill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier.clip(Radii.tag).background(color.copy(alpha = 0.10f))
            .border(1.dp, color.copy(alpha = 0.35f), Radii.tag)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(androidx.compose.foundation.shape.CircleShape).background(color))
            Spacer(Modifier.width(6.dp))
            Text(text, style = AppType.tag, color = color, maxLines = 1)
        }
    }
}

/** Section header: a small gradient accent bar on the left, bold dark title. */
@Composable
fun AccentHeader(text: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(4.dp).height(18.dp).clip(RoundedCornerShape(2.dp)).background(Brush.verticalGradient(listOf(Brand.Start, Brand.End))))
        Spacer(Modifier.width(10.dp))
        Text(text, style = AppType.headline, color = AppColors.TextPrimary, modifier = Modifier.weight(1f), maxLines = 1)
        trailing?.invoke()
    }
}

/** Translucent rounded icon button for use on the gradient bar (44dp target). */
@Composable
fun GlassIconButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(Brand.OnGradientFill)
                .border(1.dp, Brand.OnGradientBorder, RoundedCornerShape(12.dp))
                .iosPress(scaleTo = 0.92f) { onClick() },
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription, tint = Color.White, modifier = Modifier.size(20.dp)) }
    }
}

/** Translucent frame around custom content on the gradient bar. */
@Composable
fun GlassBox(content: @Composable () -> Unit) {
    Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(Brand.OnGradientFill)
                .border(1.dp, Brand.OnGradientBorder, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) { content() }
    }
}

/** Thin rounded progress bar, indigo to sky. [fraction] is clamped to 0..1. */
@Composable
fun GradientProgress(fraction: Float, modifier: Modifier = Modifier, height: Dp = 6.dp) {
    val f = if (fraction.isNaN()) 0f else fraction.coerceIn(0f, 1f)
    Box(modifier.fillMaxWidth().height(height).clip(Radii.tag).background(AppColors.SurfaceMuted)) {
        if (f > 0f) Box(Modifier.fillMaxWidth(f).height(height).clip(Radii.tag).background(Brand.gradientHorizontal))
    }
}
