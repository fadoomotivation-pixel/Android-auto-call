package com.salesautocall.app.ui.design

import android.provider.Settings
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** True when the user turned animations off (Developer options or Accessibility "Remove animations"). */
@Composable
fun rememberReducedMotion(): Boolean {
    val ctx = LocalContext.current
    return remember(ctx) {
        runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) }
            .getOrDefault(1f) == 0f
    }
}

/** The blue "Scan" chip beside the Leads search field. Same 44dp height as the field. */
@Composable
fun ScanChip(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(IosColors.Blue.copy(alpha = 0.12f))
            .iosPress(scaleTo = 0.94f) { onClick() }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.DocumentScanner, contentDescription = null, tint = IosColors.Blue, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text("Scan", style = AppType.label, color = IosColors.Blue, maxLines = 1)
    }
}

/**
 * The small round AI coach button beside the search field.
 *
 * A soft blue→violet glow "breathes" behind a sparkle on a ~2.5 s loop. Cheap on
 * purpose: one animated float, read only inside drawBehind, so each frame is a
 * redraw of this 40dp circle and never a recomposition. With animations turned
 * off it is a still gradient. [unread] adds a small red dot.
 */
@Composable
fun CoachPulseButton(unread: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val reduced = rememberReducedMotion()
    val phase: State<Float> = if (reduced) remember { mutableStateOf(0.5f) } else {
        rememberInfiniteTransition(label = "coach").animateFloat(
            0f, 1f, infiniteRepeatable(tween(1250, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe",
        )
    }
    Box(
        modifier.size(44.dp).semantics { contentDescription = if (unread) "AI coach, new tip" else "AI coach" }
            .iosPress(scaleTo = 0.92f) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(40.dp)
                .drawBehind {
                    val p = phase.value
                    val c = Offset(size.width / 2f, size.height / 2f)
                    val r = size.minDimension / 2f
                    // Outer glow swells and fades with the breath.
                    drawCircle(IosColors.Indigo.copy(alpha = 0.10f + 0.14f * p), radius = r, center = c)
                    // The orb: gradient whose highlight drifts slightly — the shimmer.
                    drawCircle(
                        brush = Brush.linearGradient(
                            listOf(IosColors.Blue, IosColors.Indigo, IosColors.Purple),
                            start = Offset(size.width * (0.1f + 0.2f * p), 0f),
                            end = Offset(size.width, size.height * (0.9f - 0.2f * p)),
                        ),
                        radius = r * (0.80f + 0.04f * p), center = c,
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
        if (unread) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(top = 3.dp, end = 3.dp).size(10.dp)
                    .clip(CircleShape).background(IosColors.Red).border(1.5.dp, AppColors.Canvas, CircleShape),
            )
        }
    }
}
