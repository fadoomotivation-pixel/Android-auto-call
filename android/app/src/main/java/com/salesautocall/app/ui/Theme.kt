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
// Bright, trustworthy blue (action/primary) on a soft off-white canvas —
// the modern fintech/CRM look. Status colours (hot/warm/cold, won/lost) live
// in TelecallerScreens alongside the screens that use them.
private val Blue = Color(0xFF2563EB)
private val BlueDark = Color(0xFF1E3A8A)
private val Sky = Color(0xFF3B82F6)

private val LightColors = lightColorScheme(
    primary = Blue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDBEAFE),
    onPrimaryContainer = BlueDark,
    secondary = Sky,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE0ECFF),
    onSecondaryContainer = Color(0xFF143A8C),
    tertiary = Color(0xFF7C3AED),
    onTertiary = Color.White,
    background = Color(0xFFF3F5FA),
    onBackground = Color(0xFF0F1729),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0F1729),
    surfaceVariant = Color(0xFFEEF2F8),
    onSurfaceVariant = Color(0xFF64748B),
    outline = Color(0xFFCBD5E1),
    outlineVariant = Color(0xFFE2E8F0),
    error = Color(0xFFDC2626),
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF93B4FF),
    onPrimary = Color(0xFF0A1A3A),
    primaryContainer = Color(0xFF1E3A8A),
    onPrimaryContainer = Color(0xFFDBEAFE),
    secondary = Color(0xFF7DA8FF),
    onSecondary = Color(0xFF0A1A3A),
    secondaryContainer = Color(0xFF1B3470),
    onSecondaryContainer = Color(0xFFDBEAFE),
    tertiary = Color(0xFFC4B5FD),
    onTertiary = Color(0xFF2A1065),
    background = Color(0xFF0A1322),
    onBackground = Color(0xFFE4EAF4),
    surface = Color(0xFF111C30),
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
