package com.salesautocall.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BrandBlue = Color(0xFF2563EB)

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE7FF),
    onPrimaryContainer = Color(0xFF0B2A6B),
    secondary = Color(0xFF0EA5E9),
    background = Color(0xFFF5F7FB),
    onBackground = Color(0xFF0B1020),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0B1020),
    surfaceVariant = Color(0xFFEAEEF6),
    onSurfaceVariant = Color(0xFF566073),
    error = Color(0xFFD7263D),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6EA8FF),
    onPrimary = Color(0xFF06163A),
    primaryContainer = Color(0xFF1B2A52),
    onPrimaryContainer = Color(0xFFDCE7FF),
    secondary = Color(0xFF38BDF8),
    background = Color(0xFF0B1020),
    onBackground = Color(0xFFE6EBF5),
    surface = Color(0xFF141B2E),
    onSurface = Color(0xFFE6EBF5),
    surfaceVariant = Color(0xFF1B2540),
    onSurfaceVariant = Color(0xFF93A0BD),
    error = Color(0xFFEF6E78),
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
