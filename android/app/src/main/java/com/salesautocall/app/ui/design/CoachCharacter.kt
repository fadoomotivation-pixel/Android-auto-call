package com.salesautocall.app.ui.design

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** What the coach is doing right now. */
enum class CoachMood { Idle, Wave, Nod }

/**
 * THE COACH, AS A PERSON (v2, Oct 2026: redrawn to read as a real human).
 *
 * The founder asked for a coach that feels like a human mentor, not an orb:
 * a young Indian sales mentor in a navy blazer, flat vector, warm but
 * professional. Drawn on a 100×100 grid in layered parts (badge, body, neck,
 * head, hair, face, arm) so each part can move on its own:
 *  - blinks every ~4 s, breathes (body rises 1.5 %), head tilts ±3°;
 *  - [CoachMood.Wave]: the right hand waves (Good morning);
 *  - [CoachMood.Nod]: the head nods (Coaching time).
 * `tools/coach_preview.py` draws the same coordinates to a PNG.
 * Chrome (top bars) keeps the small monochrome sparkle; this is for cards.
 */
@Composable
fun CoachCharacter(
    size: Dp = 48.dp,
    mood: CoachMood = CoachMood.Idle,
    modifier: Modifier = Modifier,
) {
    val t = rememberInfiniteTransition(label = "coach")
    val breathe by t.animateFloat(0f, 1f, infiniteRepeatable(tween(3400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe")
    val tilt by t.animateFloat(-2.5f, 2.5f, infiniteRepeatable(tween(5200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tilt")
    val blink by t.animateFloat(1f, 1f, infiniteRepeatable(keyframes {
        durationMillis = 4300; 1f at 0; 1f at 3900; 0.05f at 3990; 1f at 4110
    }), label = "blink")
    // Eyes glance left, back, right, back — a person thinking, not a robot.
    val glance by t.animateFloat(0f, 0f, infiniteRepeatable(keyframes {
        durationMillis = 7000; 0f at 0; 0f at 1800; -1f at 2050; -1f at 2900; 0f at 3150; 0f at 4800; 1f at 5050; 1f at 5700; 0f at 5950
    }), label = "glance")
    val brow by t.animateFloat(0f, 0f, infiniteRepeatable(keyframes {
        durationMillis = 6000; 0f at 0; 0f at 2400; 1f at 2600; 1f at 3100; 0f at 3400
    }), label = "brow")
    val smile by t.animateFloat(0.35f, 1f, infiniteRepeatable(tween(2600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "smile")
    val wave by t.animateFloat(0f, 0f, infiniteRepeatable(keyframes {
        durationMillis = 2600; 0f at 0; -16f at 250; 12f at 550; -16f at 850; 12f at 1150; 0f at 1400; 0f at 2600
    }), label = "wave")
    val nod by t.animateFloat(0f, 0f, infiniteRepeatable(keyframes {
        durationMillis = 3000; 0f at 0; 2.2f at 220; 0f at 440; 2.2f at 660; 0f at 900; 0f at 3000
    }), label = "nod")
    Canvas(modifier.size(size).clip(CircleShape)) {
        drawCoach(
            k = this.size.minDimension / 100f,
            pose = CoachPose(
                breathe = breathe,
                tilt = if (mood == CoachMood.Nod) tilt * 0.4f else tilt,
                blink = blink,
                glance = glance,
                brow = if (mood == CoachMood.Wave) maxOf(brow, 0.6f) else brow,
                smile = if (mood == CoachMood.Idle) smile * 0.7f else 1f,
                wave = if (mood == CoachMood.Wave) wave else null,
                nod = if (mood == CoachMood.Nod) nod else 0f,
            ),
        )
    }
}

/** One frame of the coach. Every field is 0-neutral; see [CoachCharacter]. */
data class CoachPose(
    val breathe: Float = 0f,
    val tilt: Float = 0f,
    val blink: Float = 1f,
    val glance: Float = 0f,
    val brow: Float = 0f,
    val smile: Float = 0.6f,
    val wave: Float? = null,
    val nod: Float = 0f,
)

internal object CoachInk {
    val BadgeTop = Color(0xFFF3F6FB)
    val BadgeBottom = Color(0xFFDCE5F2)
    val Blazer = Color(0xFF243B5C)
    val BlazerDark = Color(0xFF172A45)
    val BlazerLight = Color(0xFF34507A)
    val Shirt = Color(0xFFFFFFFF)
    val ShirtShade = Color(0xFFDDE3EC)
    val Tie = Color(0xFF8E2F3C)
    val Skin = Color(0xFFD9A273)
    val SkinLight = Color(0xFFE6B68A)
    val SkinShade = Color(0xFFB27A50)
    val Hair = Color(0xFF231812)
    val HairLight = Color(0xFF3B2A20)
    val Iris = Color(0xFF3A2416)
    val White = Color(0xFFFFFFFF)
    val Lip = Color(0xFF9A5240)
    val Mouth = Color(0xFF5E2A22)
    val Teeth = Color(0xFFFFFBF5)
    val Cheek = Color(0x2EE0705E)
}

/** Draws the coach on a 100-unit grid scaled by [k]. Same coordinates as tools/coach_preview.py. */
internal fun DrawScope.drawCoach(k: Float, pose: CoachPose) {
    fun o(x: Float, y: Float) = Offset(x * k, y * k)
    fun sz(w: Float, h: Float) = Size(w * k, h * k)
    fun path(block: Path.() -> Unit) = Path().apply(block)
    // Badge: soft vertical gradient.
    drawCircle(Brush.verticalGradient(listOf(CoachInk.BadgeTop, CoachInk.BadgeBottom), 0f, 100f * k), 50f * k, o(50f, 50f))
    val lift = -1.4f * pose.breathe
    translate(top = lift * k) {
        // Shoulders + blazer with a light gradient.
        val body = path {
            moveTo(10f * k, 101f * k)
            cubicTo(11f * k, 86f * k, 20f * k, 78f * k, 36f * k, 74f * k)
            lineTo(64f * k, 74f * k)
            cubicTo(80f * k, 78f * k, 89f * k, 86f * k, 90f * k, 101f * k)
            close()
        }
        drawPath(body, Brush.verticalGradient(listOf(CoachInk.BlazerLight, CoachInk.Blazer, CoachInk.BlazerDark), 72f * k, 100f * k))
        // Shirt V.
        drawPath(path { moveTo(40f * k, 74f * k); lineTo(60f * k, 74f * k); lineTo(50f * k, 94f * k); close() }, CoachInk.Shirt)
        // Tie.
        drawPath(path { moveTo(48.2f * k, 78f * k); lineTo(51.8f * k, 78f * k); lineTo(53f * k, 90f * k); lineTo(50f * k, 94f * k); lineTo(47f * k, 90f * k); close() }, CoachInk.Tie)
        drawPath(path { moveTo(47.5f * k, 75f * k); lineTo(52.5f * k, 75f * k); lineTo(51.8f * k, 78.5f * k); lineTo(48.2f * k, 78.5f * k); close() }, CoachInk.Tie)
        // Shirt collar points.
        drawPath(path { moveTo(42f * k, 72f * k); lineTo(48f * k, 75f * k); lineTo(44.5f * k, 80f * k); close() }, CoachInk.ShirtShade)
        drawPath(path { moveTo(58f * k, 72f * k); lineTo(52f * k, 75f * k); lineTo(55.5f * k, 80f * k); close() }, CoachInk.ShirtShade)
        // Lapels.
        drawPath(path { moveTo(40f * k, 74f * k); lineTo(46f * k, 86f * k); lineTo(50f * k, 96f * k); lineTo(35f * k, 82f * k); lineTo(37f * k, 76f * k); close() }, CoachInk.BlazerDark)
        drawPath(path { moveTo(60f * k, 74f * k); lineTo(54f * k, 86f * k); lineTo(50f * k, 96f * k); lineTo(65f * k, 82f * k); lineTo(63f * k, 76f * k); close() }, CoachInk.BlazerDark)
        // Neck with a shadow under the jaw.
        drawRoundRect(CoachInk.Skin, topLeft = o(43.5f, 60f), size = sz(13f, 16f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(5f * k))
        drawOval(CoachInk.SkinShade, topLeft = o(43.5f, 60f), size = sz(13f, 7f))
        // Waving arm: upper arm, forearm, open hand with fingers.
        pose.wave?.let { w ->
            rotate(degrees = w, pivot = o(76f, 86f)) {
                drawLine(CoachInk.Blazer, o(80f, 92f), o(82f, 70f), strokeWidth = 10f * k, cap = StrokeCap.Round)
                drawLine(CoachInk.Shirt, o(82f, 66.5f), o(82f, 64.5f), strokeWidth = 8f * k, cap = StrokeCap.Round)
                drawOval(CoachInk.Skin, topLeft = o(78f, 54f), size = sz(8.5f, 10f))
                for (i in 0..3) {
                    val fx = 78.8f + i * 2.2f
                    drawLine(CoachInk.Skin, o(fx, 56f), o(fx - 0.6f + i * 0.4f, 50.5f + if (i == 0 || i == 3) 1.2f else 0f), strokeWidth = 1.9f * k, cap = StrokeCap.Round)
                }
                drawLine(CoachInk.Skin, o(78.5f, 60f), o(75.8f, 57.2f), strokeWidth = 2f * k, cap = StrokeCap.Round)
            }
        }
    }
    withTransform({
        translate(top = (pose.nod + lift * 0.6f) * k)
        rotate(degrees = pose.tilt, pivot = o(50f, 64f))
    }) {
        // Back hair volume.
        drawOval(CoachInk.Hair, topLeft = o(31.5f, 17.5f), size = sz(37f, 30f))
        // Ears.
        drawOval(CoachInk.Skin, topLeft = o(30.5f, 39f), size = sz(6.5f, 10f))
        drawOval(CoachInk.Skin, topLeft = o(63f, 39f), size = sz(6.5f, 10f))
        drawOval(CoachInk.SkinShade, topLeft = o(32.3f, 41.5f), size = sz(2.8f, 5f))
        drawOval(CoachInk.SkinShade, topLeft = o(64.9f, 41.5f), size = sz(2.8f, 5f))
        // Face: slightly tapered towards the chin, radial light from upper-left.
        val face = path {
            moveTo(50f * k, 22f * k)
            cubicTo(61f * k, 22f * k, 66f * k, 30f * k, 66f * k, 41f * k)
            cubicTo(66f * k, 53f * k, 59f * k, 64f * k, 50f * k, 64f * k)
            cubicTo(41f * k, 64f * k, 34f * k, 53f * k, 34f * k, 41f * k)
            cubicTo(34f * k, 30f * k, 39f * k, 22f * k, 50f * k, 22f * k)
            close()
        }
        drawPath(face, Brush.radialGradient(listOf(CoachInk.SkinLight, CoachInk.Skin, CoachInk.SkinShade), center = o(45f, 38f), radius = 30f * k))
        // Front hair: side-parted, with a sheen.
        val fringe = path {
            moveTo(33.5f * k, 40f * k)
            cubicTo(32f * k, 26f * k, 40f * k, 18.5f * k, 51f * k, 19f * k)
            cubicTo(61f * k, 19.5f * k, 68f * k, 26f * k, 66.5f * k, 40f * k)
            cubicTo(64.5f * k, 32f * k, 60f * k, 28.5f * k, 54f * k, 29f * k)
            cubicTo(48f * k, 29.5f * k, 43f * k, 27f * k, 41f * k, 28.5f * k)
            cubicTo(37f * k, 31f * k, 35f * k, 35f * k, 33.5f * k, 40f * k)
            close()
        }
        drawPath(fringe, CoachInk.Hair)
        drawArc(CoachInk.HairLight, 200f, 60f, useCenter = false, topLeft = o(40f, 21f), size = sz(18f, 12f),
            style = Stroke(width = 1.6f * k, cap = StrokeCap.Round))
        // Eyebrows (raise lifts them 1.8 units).
        val by = -1.8f * pose.brow
        drawPath(path { moveTo(39.5f * k, (38.6f + by) * k); quadraticBezierTo(43.5f * k, (36.2f + by) * k, 47f * k, (37.8f + by) * k) },
            CoachInk.Hair, style = Stroke(width = 1.9f * k, cap = StrokeCap.Round))
        drawPath(path { moveTo(53f * k, (37.8f + by) * k); quadraticBezierTo(56.5f * k, (36.2f + by) * k, 60.5f * k, (38.6f + by) * k) },
            CoachInk.Hair, style = Stroke(width = 1.9f * k, cap = StrokeCap.Round))
        // Eyes: white, iris that glances, highlight. Blink squashes height.
        val eh = (4.4f * pose.blink).coerceAtLeast(0.35f)
        val gx = 0.9f * pose.glance
        for (cx in listOf(43.3f, 56.7f)) {
            drawOval(CoachInk.White, topLeft = o(cx - 3.1f, 43.2f - eh / 2f), size = sz(6.2f, eh))
            if (pose.blink > 0.3f) {
                drawCircle(CoachInk.Iris, radius = 1.75f * k * minOf(1f, pose.blink), center = o(cx + gx, 43.3f))
                drawCircle(CoachInk.White, radius = 0.55f * k, center = o(cx + gx + 0.7f, 42.5f))
            }
            drawArc(CoachInk.Hair, 190f, 160f, useCenter = false, topLeft = o(cx - 3.3f, 43.2f - eh / 2f - 0.2f), size = sz(6.6f, eh + 0.4f),
                style = Stroke(width = 0.9f * k, cap = StrokeCap.Round))
        }
        // Nose: soft side shadow and nostril hint.
        drawPath(path { moveTo(50.5f * k, 44f * k); quadraticBezierTo(52.6f * k, 50f * k, 51.2f * k, 51.6f * k) },
            CoachInk.SkinShade, style = Stroke(width = 1.1f * k, cap = StrokeCap.Round))
        drawArc(CoachInk.SkinShade, 20f, 140f, useCenter = false, topLeft = o(47.3f, 50.4f), size = sz(5.4f, 2.4f),
            style = Stroke(width = 0.9f * k, cap = StrokeCap.Round))
        // Cheeks.
        drawCircle(CoachInk.Cheek, radius = 3.2f * k, center = o(39.8f, 50.5f))
        drawCircle(CoachInk.Cheek, radius = 3.2f * k, center = o(60.2f, 50.5f))
        // Smile: grows from closed to an open, toothy smile.
        val sm = pose.smile.coerceIn(0f, 1f)
        val mw = 9f + 2.5f * sm
        val open = 3.6f * sm
        val mouth = path {
            moveTo((50f - mw / 2f) * k, 55f * k)
            quadraticBezierTo(50f * k, (55.6f) * k, (50f + mw / 2f) * k, 55f * k)
            quadraticBezierTo(50f * k, (56.5f + open) * k, (50f - mw / 2f) * k, 55f * k)
            close()
        }
        if (open > 0.6f) {
            drawPath(mouth, CoachInk.Mouth)
            drawRect(CoachInk.Teeth, topLeft = o(50f - mw / 2f + 1.6f, 55.2f), size = sz(mw - 3.2f, minOf(1.5f, open * 0.45f)))
        }
        drawPath(path {
            moveTo((50f - mw / 2f) * k, 55f * k)
            quadraticBezierTo(50f * k, (56.5f + open) * k, (50f + mw / 2f) * k, 55f * k)
        }, CoachInk.Lip, style = Stroke(width = 1.3f * k, cap = StrokeCap.Round))
    }
}
