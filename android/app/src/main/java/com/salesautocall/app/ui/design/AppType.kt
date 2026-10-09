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

    // ── The iOS text styles, by their Apple names ─────────────────────
    //
    // Sizes are Apple's "Large (default)" Dynamic Type sizes, one step
    // smaller where a telecaller's dense list needs it, with Apple's tracking:
    // tight on big type, neutral on body. Line heights are generous (≥ 1.3×),
    // because cramped multi-line text was half of what read as "not iOS".

    /** Large Title (34). The title a screen opens with before it scrolls. */
    val largeTitle = TextStyle(
        fontFamily = Inter, fontSize = 32.sp, lineHeight = 39.sp,
        fontWeight = FontWeight.Bold, letterSpacing = (-0.7).sp,
    )

    /** Title 2 (22). Sheet titles, a card's single big figure. */
    val title2 = TextStyle(
        fontFamily = Inter, fontSize = 22.sp, lineHeight = 28.sp,
        fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp,
    )

    /** Title 3 (20). Card titles that are the point of the card. */
    val title3 = TextStyle(
        fontFamily = Inter, fontSize = 19.sp, lineHeight = 25.sp,
        fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp,
    )

    /** Headline (17 semibold). A row's name, a button in a sheet. */
    val headline = TextStyle(
        fontFamily = Inter, fontSize = 16.sp, lineHeight = 22.sp,
        fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp,
    )

    /** Callout (16). Coach advice and other sentences meant to be read. */
    val callout = TextStyle(
        fontFamily = Inter, fontSize = 15.sp, lineHeight = 22.sp,
        fontWeight = FontWeight.Normal, letterSpacing = (-0.1).sp,
    )

    /** Subheadline (15). Secondary line under a headline. */
    val subhead = TextStyle(
        fontFamily = Inter, fontSize = 14.sp, lineHeight = 20.sp,
        fontWeight = FontWeight.Normal, letterSpacing = (-0.1).sp,
    )

    /** Footnote (13). Helper text, timestamps, group footers. */
    val footnote = TextStyle(
        fontFamily = Inter, fontSize = 13.sp, lineHeight = 18.sp,
        fontWeight = FontWeight.Normal,
    )

    /** Caption (12). The smallest text that is still meant to be read. */
    val caption = TextStyle(
        fontFamily = Inter, fontSize = 12.sp, lineHeight = 16.sp,
        fontWeight = FontWeight.Medium,
    )

    /** Group header above an inset-grouped card (footnote, uppercase, grey). */
    val groupHeader = TextStyle(
        fontFamily = Inter, fontSize = 13.sp, lineHeight = 18.sp,
        fontWeight = FontWeight.Normal, letterSpacing = 0.3.sp,
    )

    // ── The app's original names (kept; hundreds of call sites) ───────

    /** Large title, the way a Settings screen opens. e.g. "Good day, Rahul". */
    val display = TextStyle(
        fontFamily = Inter,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.6).sp,
    )

    /** Screen / sheet title. */
    val title = TextStyle(
        fontFamily = Inter,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.4).sp,
    )

    /** Row heading: lead name, contact name. */
    val rowTitle = TextStyle(
        fontFamily = Inter,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.2).sp,
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
        lineHeight = 22.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = (-0.1).sp,
    )

    val bodyStrong = body.copy(fontWeight = FontWeight.Medium)

    /** Secondary line under a row title, timestamps, helper text. */
    val meta = TextStyle(
        fontFamily = Inter,
        fontSize = 13.sp,
        lineHeight = 18.5.sp,
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
        headlineMedium = AppType.largeTitle,
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
