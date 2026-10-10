package com.salesautocall.app.ui.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** 4pt spacing scale — used everywhere instead of ad-hoc dp values. */
object Space {
    val xxs = 2.dp
    val xs = 4.dp
    val s = 8.dp
    val m = 12.dp
    val l = 16.dp
    val xl = 20.dp
    val xxl = 24.dp
    val xxxl = 32.dp

    /** Horizontal screen gutter. */
    val gutter = 20.dp

    /** Minimum comfortable touch target. */
    val touch = 48.dp
}

/**
 * Corner radii. iOS cards sit between 10 and 16pt with CONTINUOUS corners (the
 * curve eases into the straight edge instead of meeting it at a hard tangent).
 * [ContinuousShape] draws that; every card, control and sheet goes through it.
 */
object Radii {
    val tag = RoundedCornerShape(999.dp)
    val chip = ContinuousShape(10.dp)
    val control = ContinuousShape(10.dp)
    val card = ContinuousShape(12.dp)
    val sheet = ContinuousShape(16.dp)
    /** Top corners only, for a sheet that rises from the bottom edge. */
    val sheetTop = ContinuousShape(16.dp, bottom = false)
}

internal val AppMaterialShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(14.dp),
    // Material needs plain rounded corners here. Dialogs and sheets: Material's 28dp is the single most "Android" thing
    // on a dialog; iOS alerts are 14pt.
    extraLarge = RoundedCornerShape(16.dp),
)

/**
 * A rounded rectangle with continuous ("squircle") corners, like iOS.
 *
 * Each corner starts its curve earlier than a plain arc would (1.28 × radius
 * from the corner) and bends with a cubic whose handles sit on the edges, so
 * the curvature ramps up instead of jumping. The radius is clamped to half the
 * shorter side, so a short chip still reads as a capsule and never folds over
 * itself. Pure geometry: no allocation per frame beyond the path.
 */
class ContinuousShape(private val radius: Dp, private val top: Boolean = true, private val bottom: Boolean = true) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val w = size.width
        val h = size.height
        if (w <= 0f || h <= 0f) return Outline.Rectangle(androidx.compose.ui.geometry.Rect(0f, 0f, w, h))
        val r = with(density) { radius.toPx() }
        // How far along each edge the curve starts, and where its handles sit.
        val a = minOf(r * 1.28f, minOf(w, h) / 2f)
        val c = a * 0.42f
        val tA = if (top) a else 0f
        val tC = if (top) c else 0f
        val bA = if (bottom) a else 0f
        val bC = if (bottom) c else 0f
        val p = Path().apply {
            moveTo(tA, 0f)
            lineTo(w - tA, 0f)
            if (top) cubicTo(w - tC, 0f, w, tC, w, tA)
            lineTo(w, h - bA)
            if (bottom) cubicTo(w, h - bC, w - bC, h, w - bA, h)
            lineTo(bA, h)
            if (bottom) cubicTo(bC, h, 0f, h - bC, 0f, h - bA)
            lineTo(0f, tA)
            if (top) cubicTo(0f, tC, tC, 0f, tA, 0f)
            close()
        }
        return Outline.Generic(p)
    }

    override fun equals(other: Any?): Boolean =
        other is ContinuousShape && other.radius == radius && other.top == top && other.bottom == bottom

    override fun hashCode(): Int = (radius.hashCode() * 31 + top.hashCode()) * 31 + bottom.hashCode()
}
