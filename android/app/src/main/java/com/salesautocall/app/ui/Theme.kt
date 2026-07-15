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
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.R

// ══════════════════════════════════════════════════════════════
//  DESIGN SYSTEM — one palette, one voice
//
//  Anchor: JADE. Green = money, growth, calm — the right psychology
//  for a real-estate sales floor someone stares at for 8 hours.
//  Everything else is a warm neutral (green-tinted greys, never
//  blue-cold) plus exactly TWO semantic accents used sparingly:
//    · Amber (muted brass)     = attention — "warm", pending, retry
//    · Terracotta (muted red)  = urgency  — "hot", overdue, destructive
//  No decorative purples/blues/pinks. Colour appears only when it
//  MEANS something; the rest of the canvas stays quiet paper.
// ══════════════════════════════════════════════════════════════
private val Jade = Color(0xFF0E7C66)          // primary — action, success, money
private val JadeDeep = Color(0xFF0A3D33)      // pressed / on-container ink
private val JadeBright = Color(0xFF2BB894)    // dark-theme primary (holds contrast)
private val JadeMist = Color(0xFFD9EBE4)      // light container
private val Sage = Color(0xFF44615A)          // secondary — quiet supporting green-grey

private val LightColors = lightColorScheme(
    primary = Jade,
    onPrimary = Color.White,
    primaryContainer = JadeMist,
    onPrimaryContainer = JadeDeep,
    secondary = Sage,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE3EBE7),
    onSecondaryContainer = Color(0xFF243B34),
    tertiary = Color(0xFF8A6D3B),             // muted bronze — value/pipeline
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFF0E6D2),
    onTertiaryContainer = Color(0xFF4A3A1D),
    background = Color(0xFFF4F5F2),           // warm paper — zero glare
    onBackground = Color(0xFF171D1A),         // warm charcoal, never pure black
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF171D1A),
    surfaceVariant = Color(0xFFECEFEA),
    onSurfaceVariant = Color(0xFF5D6862),     // muted ink for secondary text
    outline = Color(0xFFC6CFC9),
    outlineVariant = Color(0xFFE2E7E1),
    error = Color(0xFFC0452C),                // terracotta — urgent, not alarming
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = JadeBright,
    onPrimary = Color(0xFF06251E),
    primaryContainer = JadeDeep,
    onPrimaryContainer = Color(0xFFBFE8DB),
    secondary = Color(0xFF9DB8AF),
    onSecondary = Color(0xFF1C2E28),
    secondaryContainer = Color(0xFF2C423B),
    onSecondaryContainer = Color(0xFFD6E5DF),
    tertiary = Color(0xFFC9A96A),
    onTertiary = Color(0xFF2E2413),
    tertiaryContainer = Color(0xFF4A3A1D),
    onTertiaryContainer = Color(0xFFEBDDBF),
    background = Color(0xFF0E1513),           // deep green-black, not blue-black
    onBackground = Color(0xFFE9EFEC),
    surface = Color(0xFF171F1C),
    onSurface = Color(0xFFE9EFEC),
    surfaceVariant = Color(0xFF212B27),
    onSurfaceVariant = Color(0xFF95A39D),
    outline = Color(0xFF3A4741),
    outlineVariant = Color(0xFF27322D),
    error = Color(0xFFE0705A),
    onError = Color(0xFF330E06),
)

// Softer, more rounded geometry reads as modern/premium.
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

// ── Typography — Inter, bundled ──────────────────────────────
// The workhorse of premium product UI (Linear, Notion, Figma):
// tall x-height and open counters stay crisp at 12–14sp, which is
// exactly what keeps eyes fresh through an 8-hour calling shift.
private val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

// Headings: tight tracking, confident weight. Body: relaxed line
// height for effortless scanning. Labels: a touch of tracking so
// small caps-ish chips stay legible.
private val AppTypography = Typography().run {
    copy(
        displayLarge = displayLarge.copy(fontFamily = Inter),
        displayMedium = displayMedium.copy(fontFamily = Inter),
        displaySmall = displaySmall.copy(fontFamily = Inter),
        headlineLarge = headlineLarge.copy(fontFamily = Inter, fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp),
        headlineMedium = headlineMedium.copy(fontFamily = Inter, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        headlineSmall = headlineSmall.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp),
        titleLarge = titleLarge.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp),
        titleMedium = titleMedium.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
        titleSmall = titleSmall.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold),
        bodyLarge = bodyLarge.copy(fontFamily = Inter, lineHeight = 25.sp),
        bodyMedium = bodyMedium.copy(fontFamily = Inter, lineHeight = 21.sp),
        bodySmall = bodySmall.copy(fontFamily = Inter, lineHeight = 17.sp),
        labelLarge = labelLarge.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = 0.2.sp),
        labelMedium = labelMedium.copy(fontFamily = Inter, fontWeight = FontWeight.Medium, letterSpacing = 0.2.sp),
        labelSmall = labelSmall.copy(fontFamily = Inter, fontWeight = FontWeight.Medium, letterSpacing = 0.3.sp),
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
