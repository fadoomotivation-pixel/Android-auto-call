package com.salesautocall.app.ui.design

import androidx.compose.ui.graphics.Color

/**
 * Single source of truth for colour in the app.
 *
 * Apple-inspired light UI: near-white canvas, graphite type ramp, hairline
 * borders and one reserved indigo action colour. Nothing here is decorative —
 * indigo means "you can act on this", status colours mean "this is the state".
 *
 * UI layer only: no business logic, no models.
 */
object AppColors {
    // Canvas & surfaces
    val Canvas = Color(0xFFFBFBFD)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceMuted = Color(0xFFF4F4F7)
    val SurfaceSunken = Color(0xFFF7F7FA)

    // Hairlines
    val Border = Color(0xFFE7E7EC)
    val BorderStrong = Color(0xFFD8D8DF)

    // Graphite type ramp
    val TextPrimary = Color(0xFF1C1C1E)
    val TextSecondary = Color(0xFF6E6E78)
    val TextTertiary = Color(0xFFA0A0AA)

    // Action / interactive
    val Indigo = Color(0xFF4F46E5)
    val IndigoPressed = Color(0xFF4338CA)
    val IndigoSoft = Color(0xFFEEEDFC)
    val OnIndigo = Color(0xFFFFFFFF)

    // Semantic (restrained, used for state only)
    val Positive = Color(0xFF15803D)
    val PositiveSoft = Color(0xFFE8F5EC)
    val Warning = Color(0xFFB45309)
    val WarningSoft = Color(0xFFFDF3E3)
    val Danger = Color(0xFFB4232A)
    val DangerSoft = Color(0xFFFBECEC)
    val Info = Color(0xFF1D4ED8)
    val InfoSoft = Color(0xFFEAF0FE)
    val Teal = Color(0xFF0F766E)
    val TealSoft = Color(0xFFE6F4F2)
    val Violet = Color(0xFF6D28D9)
    val VioletSoft = Color(0xFFF1ECFD)
    val Slate = Color(0xFF475569)
    val SlateSoft = Color(0xFFF1F3F7)

    // Live call / recording
    val CallAccept = Color(0xFF15803D)
    val Recording = Color(0xFFD03535)

    /** Deterministic, low-saturation avatar tints. */
    val avatarTints = listOf(
        Color(0xFFEDEEFB),
        Color(0xFFE9F1FB),
        Color(0xFFE7F3F0),
        Color(0xFFF3EEFA),
        Color(0xFFFBF0E8),
        Color(0xFFF1F2F5),
    )

    val avatarInk = listOf(
        Color(0xFF3F3AB8),
        Color(0xFF1D4ED8),
        Color(0xFF0F766E),
        Color(0xFF6D28D9),
        Color(0xFF9A5B18),
        Color(0xFF475569),
    )
}

/** Foreground / background pair for a tag or accent. */
data class StatusTone(val fg: Color, val bg: Color)

/**
 * Tones for statuses the DATABASE does not own.
 *
 * ⚠️ NOT the source of truth for lead stages. `lead_stages` owns every stage's
 * label and colour — that is why the table exists, and the phone deciding for
 * itself is exactly how the handset and the dashboard drifted apart before. For
 * anything that joins to `lead_stages`, read `stage.color` / `stage.label` and
 * pass the hex through [toneFromHex]; [of] and [label] below are the FALLBACK
 * for call dispositions, temperatures and outcomes, which have no table.
 */
object StatusColors {

    /**
     * Build a tone from a `lead_stages.color` hex, so a stage rendered anywhere
     * in the app matches what the admin configured. Falls back to the [of]
     * mapping when the row carries no usable colour.
     */
    fun toneFromHex(hex: String?, status: String? = null): StatusTone {
        val parsed = hex?.takeIf { it.isNotBlank() }?.let {
            runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull()
        } ?: return of(status)
        return StatusTone(fg = parsed, bg = parsed.copy(alpha = 0.10f))
    }

    val New = StatusTone(AppColors.Slate, AppColors.SlateSoft)
    val Contacted = StatusTone(AppColors.Info, AppColors.InfoSoft)
    val Interested = StatusTone(AppColors.Indigo, AppColors.IndigoSoft)
    val Visit = StatusTone(AppColors.Teal, AppColors.TealSoft)
    val Negotiation = StatusTone(AppColors.Warning, AppColors.WarningSoft)
    val Token = StatusTone(AppColors.Violet, AppColors.VioletSoft)
    val Won = StatusTone(AppColors.Positive, AppColors.PositiveSoft)
    val Lost = StatusTone(AppColors.Danger, AppColors.DangerSoft)
    val Dnc = StatusTone(AppColors.TextSecondary, AppColors.SurfaceMuted)

    fun of(status: String?): StatusTone = when (status?.lowercase()?.trim()) {
        "new", "fresh", "pending" -> New
        "contacted", "called", "connected", "answered" -> Contacted
        "interested", "warm", "hot", "follow_up", "followup" -> Interested
        "visit", "site_visit", "visit_scheduled", "visit_done" -> Visit
        "negotiation", "negotiating", "proposal" -> Negotiation
        "token", "booked", "advance" -> Token
        "won", "closed", "converted", "deal" -> Won
        "lost", "not_interested", "rejected", "failed" -> Lost
        "dnc", "do_not_call", "blocked" -> Dnc
        else -> New
    }

    /** Human label for a raw status string. */
    fun label(status: String?): String {
        val raw = status?.trim().orEmpty()
        if (raw.isEmpty()) return "New"
        if (raw.equals("dnc", true)) return "DNC"
        return raw.split('_', '-', ' ')
            .filter { it.isNotBlank() }
            .joinToString(" ") { it.lowercase().replaceFirstChar(Char::uppercase) }
    }
}
