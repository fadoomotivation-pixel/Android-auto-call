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
 * THE COACH, AS A PERSON.
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
    val breathe by t.animateFloat(0f, 1f, infiniteRepeatable(tween(3200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe")
    val tilt by t.animateFloat(-3f, 3f, infiniteRepeatable(tween(4600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tilt")
    val blink by t.animateFloat(
        1f, 1f,
        infiniteRepeatable(keyframes {
            durationMillis = 4300
            1f at 0; 1f at 3900; 0.1f at 4000; 1f at 4120
        }),
        label = "blink",
    )
    val wave by t.animateFloat(
        0f, 0f,
        infiniteRepeatable(keyframes {
            durationMillis = 2600
            0f at 0; -18f at 250; 14f at 550; -18f at 850; 14f at 1150; 0f at 1400; 0f at 2600
        }),
        label = "wave",
    )
    val nod by t.animateFloat(
        0f, 0f,
        infiniteRepeatable(keyframes {
            durationMillis = 3000
            0f at 0; 2.4f at 220; 0f at 440; 2.4f at 660; 0f at 900; 0f at 3000
        }),
        label = "nod",
    )
    Canvas(modifier.size(size).clip(CircleShape)) {
        val k = this.size.minDimension / 100f
        drawCoach(
            k = k,
            breathe = breathe,
            tilt = if (mood == CoachMood.Nod) tilt * 0.4f else tilt,
            blink = blink,
            wave = if (mood == CoachMood.Wave) wave else null,
            nod = if (mood == CoachMood.Nod) nod else 0f,
        )
    }
}

private object CoachInk {
    val Badge = Color(0xFFEAF1FB)
    val Blazer = Color(0xFF1F3A5F)
    val BlazerShade = Color(0xFF17304F)
    val Shirt = Color(0xFFFFFFFF)
    val Skin = Color(0xFFD39A6A)
    val SkinShade = Color(0xFFB97F52)
    val Hair = Color(0xFF2A1C14)
    val Lip = Color(0xFF8A4A33)
    val Cheek = Color(0x33E07A6A)
}

/** Draws the coach on a 100-unit grid scaled by [k]. Null [wave] = arm down. */
internal fun DrawScope.drawCoach(k: Float, breathe: Float, tilt: Float, blink: Float, wave: Float?, nod: Float) {
    fun o(x: Float, y: Float) = Offset(x * k, y * k)
    fun sz(w: Float, h: Float) = Size(w * k, h * k)
    // Badge.
    drawCircle(CoachInk.Badge, radius = 50f * k, center = o(50f, 50f))
    // Body (breathes).
    val lift = -1.2f * breathe
    translate(top = lift * k) {
        val body = Path().apply {
            moveTo(16f * k, 100f * k)
            cubicTo(16f * k, 82f * k, 24f * k, 74f * k, 38f * k, 71f * k)
            lineTo(62f * k, 71f * k)
            cubicTo(76f * k, 74f * k, 84f * k, 82f * k, 84f * k, 100f * k)
            close()
        }
        drawPath(body, CoachInk.Blazer)
        // Shirt V and collar.
        val shirt = Path().apply {
            moveTo(41f * k, 71f * k); lineTo(59f * k, 71f * k); lineTo(50f * k, 88f * k); close()
        }
        drawPath(shirt, CoachInk.Shirt)
        // Lapels.
        val lapelL = Path().apply { moveTo(41f * k, 71f * k); lineTo(50f * k, 88f * k); lineTo(38f * k, 80f * k); close() }
        val lapelR = Path().apply { moveTo(59f * k, 71f * k); lineTo(50f * k, 88f * k); lineTo(62f * k, 80f * k); close() }
        drawPath(lapelL, CoachInk.BlazerShade)
        drawPath(lapelR, CoachInk.BlazerShade)
        // Neck.
        drawRoundRect(CoachInk.SkinShade, topLeft = o(44f, 58f), size = sz(12f, 15f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f * k))
        // Waving arm (behind nothing; drawn over the blazer edge).
        if (wave != null) {
            rotate(degrees = wave, pivot = o(74f, 84f)) {
                drawLine(CoachInk.Blazer, o(74f, 84f), o(84f, 60f), strokeWidth = 9f * k, cap = StrokeCap.Round)
                drawCircle(CoachInk.Skin, radius = 5f * k, center = o(85f, 55f))
            }
        }
    }
    // Head group (tilt + nod).
    withTransform({
        translate(top = nod * k + lift * 0.6f * k)
        rotate(degrees = tilt, pivot = o(50f, 62f))
    }) {
        drawCircle(CoachInk.Skin, radius = 3.4f * k, center = o(34.5f, 45f))
        drawCircle(CoachInk.Skin, radius = 3.4f * k, center = o(65.5f, 45f))
        drawOval(CoachInk.Skin, topLeft = o(35f, 26f), size = sz(30f, 36f))
        // Hair: a neat side-parted cap.
        drawArc(CoachInk.Hair, 180f, 180f, useCenter = true, topLeft = o(34f, 23f), size = sz(32f, 22f))
        drawOval(CoachInk.Hair, topLeft = o(38f, 27f), size = sz(20f, 9f))
        drawOval(CoachInk.Hair, topLeft = o(34f, 31f), size = sz(5f, 11f))
        drawOval(CoachInk.Hair, topLeft = o(61f, 31f), size = sz(5f, 11f))
        // Brows.
        drawLine(CoachInk.Hair, o(40.5f, 40.5f), o(46.5f, 39.6f), strokeWidth = 1.6f * k, cap = StrokeCap.Round)
        drawLine(CoachInk.Hair, o(53.5f, 39.6f), o(59.5f, 40.5f), strokeWidth = 1.6f * k, cap = StrokeCap.Round)
        // Eyes (blink squashes height).
        val eh = (3.6f * blink).coerceAtLeast(0.4f)
        drawOval(CoachInk.Hair, topLeft = o(42.2f, 45.5f - eh / 2f), size = sz(3f, eh))
        drawOval(CoachInk.Hair, topLeft = o(54.8f, 45.5f - eh / 2f), size = sz(3f, eh))
        // Cheeks + smile.
        drawCircle(CoachInk.Cheek, radius = 2.8f * k, center = o(40.5f, 51.5f))
        drawCircle(CoachInk.Cheek, radius = 2.8f * k, center = o(59.5f, 51.5f))
        drawArc(
            CoachInk.Lip, 20f, 140f, useCenter = false,
            topLeft = o(44.5f, 48.5f), size = sz(11f, 8f),
            style = Stroke(width = 1.7f * k, cap = StrokeCap.Round),
        )
    }
}
