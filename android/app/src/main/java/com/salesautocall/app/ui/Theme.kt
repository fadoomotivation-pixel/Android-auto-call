package com.salesautocall.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppMaterialShapes
import com.salesautocall.app.ui.design.AppMaterialTypography

// ══════════════════════════════════════════════════════════════
//  THE THEME IS NOW A THIN WIRE INTO ui/design
//
//  Every value used to be declared here, so the palette lived in one
//  place and a hundred screens quietly invented their own variants
//  around it. The tokens now live in ui/design/AppColors.kt,
//  AppType.kt and AppSpacing.kt, and this file only mounts them.
//
//  Why that matters more than it looks: the hundreds of existing
//  `MaterialTheme.colorScheme.*` and `MaterialTheme.typography.*` call
//  sites across TelecallerScreens, LeadDetailScreen, CallsScreen and
//  the rest inherit the new system WITHOUT being rewritten. The design
//  migration therefore does not require touching the screens that hold
//  the business logic — which is the whole point.
// ══════════════════════════════════════════════════════════════

/**
 * Light-first, Apple-inspired scheme.
 *
 * SINGLE SCHEME, ON PURPOSE. The app previously shipped a dark variant that
 * followed the system setting. It is gone: telecallers work long shifts in
 * mixed lighting, and a stable near-white canvas is what keeps dense lead lists
 * readable and — more importantly — keeps status colour MEANINGFUL. A stage
 * chip has to read the same on every rep's phone as it does on the founder's
 * dashboard, and it cannot do that while half the palette inverts itself
 * depending on a setting nobody in the team knows they toggled.
 *
 * This is a deliberate, visible behaviour change for anyone whose phone is set
 * to dark mode: the app will now stay light.
 */
private val AppColorScheme = lightColorScheme(
    primary = AppColors.Indigo,
    onPrimary = AppColors.OnIndigo,
    primaryContainer = AppColors.IndigoSoft,
    onPrimaryContainer = AppColors.Indigo,
    secondary = AppColors.TextPrimary,
    onSecondary = AppColors.Surface,
    secondaryContainer = AppColors.SurfaceMuted,
    onSecondaryContainer = AppColors.TextPrimary,
    tertiary = AppColors.Teal,
    onTertiary = AppColors.Surface,
    tertiaryContainer = AppColors.TealSoft,
    onTertiaryContainer = AppColors.Teal,
    background = AppColors.Canvas,
    onBackground = AppColors.TextPrimary,
    surface = AppColors.Surface,
    onSurface = AppColors.TextPrimary,
    surfaceVariant = AppColors.SurfaceMuted,
    onSurfaceVariant = AppColors.TextSecondary,
    // Flat, not tinted. Material's default elevation tint is what gives stock
    // Compose apps that faintly purple, generic look on raised surfaces.
    surfaceTint = AppColors.Surface,
    inverseSurface = AppColors.TextPrimary,
    inverseOnSurface = AppColors.Surface,
    outline = AppColors.BorderStrong,
    outlineVariant = AppColors.Border,
    error = AppColors.Danger,
    onError = AppColors.Surface,
    errorContainer = AppColors.DangerSoft,
    onErrorContainer = AppColors.Danger,
    scrim = AppColors.TextPrimary,
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AppColorScheme,
        shapes = AppMaterialShapes,
        typography = AppMaterialTypography,
        content = content,
    )
}
