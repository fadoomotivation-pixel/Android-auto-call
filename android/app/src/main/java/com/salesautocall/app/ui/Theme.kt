package com.salesautocall.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Brand palette ─────────────────────────────────────────────
// Navy = trust / establishment, Gold = premium / luxury. Tuned for
// a real-estate audience that responds to high-end, dependable cues.
private val Navy = Color(0xFF0B2545)
private val NavyDeep = Color(0xFF081A33)
private val Gold = Color(0xFFC9A24B)
private val GoldSoft = Color(0xFFE7D29A)

private val LightColors = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE5F4),
    onPrimaryContainer = NavyDeep,
    secondary = Gold,
    onSecondary = Color(0xFF2A2000),
    secondaryContainer = Color(0xFFF6E9C6),
    onSecondaryContainer = Color(0xFF4A3A00),
    tertiary = Color(0xFF3E5C82),
    onTertiary = Color.White,
    background = Color(0xFFF6F8FB),
    onBackground = Color(0xFF101725),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF101725),
    surfaceVariant = Color(0xFFE9EDF4),
    onSurfaceVariant = Color(0xFF54607A),
    outline = Color(0xFFC2CAD8),
    outlineVariant = Color(0xFFDDE3EC),
    error = Color(0xFFB3261E),
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFAFC4E8),
    onPrimary = NavyDeep,
    primaryContainer = Color(0xFF21385C),
    onPrimaryContainer = Color(0xFFDCE5F4),
    secondary = GoldSoft,
    onSecondary = Color(0xFF2A2000),
    secondaryContainer = Color(0xFF564618),
    onSecondaryContainer = Color(0xFFF6E9C6),
    tertiary = Color(0xFF9FB6D6),
    onTertiary = Color(0xFF0D1B30),
    background = Color(0xFF0A1322),
    onBackground = Color(0xFFE4EAF4),
    surface = Color(0xFF101C30),
    onSurface = Color(0xFFE4EAF4),
    surfaceVariant = Color(0xFF1B2840),
    onSurfaceVariant = Color(0xFF9DAAC4),
    outline = Color(0xFF3A4760),
    outlineVariant = Color(0xFF26344E),
    error = Color(0xFFEF6E78),
    onError = Color(0xFF370B0B),
)

// Softer, more rounded geometry reads as modern/premium.
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

// Tighter heading weights + letter spacing for a sharper, branded feel.
private val AppTypography = Typography().run {
    copy(
        headlineMedium = headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.3.sp),
    )
}

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        shapes = AppShapes,
        typography = AppTypography,
        content = content,
    )
}
