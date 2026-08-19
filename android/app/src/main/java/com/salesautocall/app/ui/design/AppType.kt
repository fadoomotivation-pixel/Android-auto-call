package com.salesautocall.app.ui.design

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import com.salesautocall.app.R

/**
 * Typography hierarchy. Tight, confident headings; highly readable body; a
 * dedicated numeric style so metrics and call durations never jitter.
 *
 * Inter, bundled with the app — kept from the previous theme rather than taking
 * the reference's system default. It is the workhorse of premium product UI and
 * its tall x-height is exactly what keeps 12–14sp legible through an eight-hour
 * calling shift, which is the whole reason it was added in the first place.
 */
private val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

object AppType {

    /** Big screen title, e.g. "Good morning, Rahul". */
    val display = TextStyle(
        fontFamily = Inter,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.6).sp,
    )

    /** Screen / sheet title. */
    val title = TextStyle(
        fontFamily = Inter,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.3).sp,
    )

    /** Row heading: lead name, contact name. */
    val rowTitle = TextStyle(
        fontFamily = Inter,
        fontSize = 16.sp,
        lineHeight = 21.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.1).sp,
    )

    /** Small uppercase section label above groups. */
    val sectionLabel = TextStyle(
        fontFamily = Inter,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
    )

    val body = TextStyle(
        fontFamily = Inter,
        fontSize = 15.sp,
        lineHeight = 21.sp,
        fontWeight = FontWeight.Normal,
    )

    val bodyStrong = body.copy(fontWeight = FontWeight.Medium)

    /** Secondary line under a row title, timestamps, helper text. */
    val meta = TextStyle(
        fontFamily = Inter,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.Normal,
    )

    val metaStrong = meta.copy(fontWeight = FontWeight.Medium)

    /** Button / tab label. */
    val label = TextStyle(
        fontFamily = Inter,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.1.sp,
    )

    val tag = TextStyle(
        fontFamily = Inter,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.2.sp,
    )

    /** Metric value — a big, calm number. */
    val metric = TextStyle(
        fontFamily = Inter,
        fontSize = 22.sp,
        lineHeight = 26.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.4).sp,
    )

    /**
     * Live duration / stopwatch. Monospaced ON PURPOSE and the one place Inter
     * is not used: a proportional font makes a running timer jitter sideways as
     * the digits change, which is unreadable on an in-call screen.
     */
    val timer = TextStyle(
        fontSize = 17.sp,
        lineHeight = 22.sp,
        fontWeight = FontWeight.Medium,
        fontFamily = FontFamily.Monospace,
        letterSpacing = 0.sp,
    )

    /** Dialer number display. */
    val dialNumber = TextStyle(
        fontFamily = Inter,
        fontSize = 34.sp,
        lineHeight = 40.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 1.sp,
        textAlign = TextAlign.Center,
    )
}

/**
 * Material 3 typography wired to the same scale, so the hundreds of existing
 * `MaterialTheme.typography.*` call sites across the app inherit the new
 * hierarchy without any screen being rewritten.
 *
 * displayLarge/displayMedium and headlineLarge are deliberately left at their
 * Material defaults (restyled with Inter) rather than collapsed onto `display`:
 * squashing every large style into one size is how a type scale loses its
 * hierarchy.
 */
internal val AppMaterialTypography = Typography().run {
    copy(
        displayLarge = displayLarge.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.8).sp),
        displayMedium = displayMedium.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.7).sp),
        displaySmall = AppType.display,
        headlineLarge = headlineLarge.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.6).sp),
        headlineMedium = AppType.display,
        headlineSmall = AppType.title,
        titleLarge = AppType.title,
        titleMedium = AppType.rowTitle,
        titleSmall = AppType.metaStrong,
        bodyLarge = AppType.body,
        bodyMedium = AppType.body,
        bodySmall = AppType.meta,
        labelLarge = AppType.label,
        labelMedium = AppType.metaStrong,
        labelSmall = AppType.tag,
    )
}
