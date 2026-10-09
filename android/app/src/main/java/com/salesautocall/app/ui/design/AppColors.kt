package com.salesautocall.app.ui.design

import androidx.compose.ui.graphics.Color

/**
 * Single source of truth for colour in the app.
 *
 * Light UI in the same language as iOS Settings: grouped grey canvas, white
 * cards, graphite type, hairline borders, and one action blue. Nothing here is
 * decorative — the action blue means "you can act on this", status colours
 * mean "this is the state".
 *
 * The token is still named Indigo. Hundreds of screens already say
 * `AppColors.Indigo` for "the one action colour", and renaming it would be a
 * logic-looking diff for a paint change. The paint itself is Apple system
 * blue, the light-mode pair of the admin accent, not a second brand.
 *
 * UI layer only: no business logic, no models.
 */
object AppColors {
    // Canvas & surfaces. Grouped grey, white cards — the Settings read.
    val Canvas = Color(0xFFF2F2F7)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceMuted = Color(0xFFE5E5EA)
    val SurfaceSunken = Color(0xFFEFEFF4)

    // Hairlines. iOS separator (opaque): #C6C6C8 drawn at half a point.
    // Border stays for the few controls that still need an outline (inputs).
    val Border = Color(0xFFD1D1D6)
    val BorderStrong = Color(0xFFC7C7CC)
    val Separator = Color(0xFFC6C6C8)

    // Graphite type ramp
    val TextPrimary = Color(0xFF1C1C1E)
    val TextSecondary = Color(0xFF6E6E78)
    val TextTertiary = Color(0xFFA0A0AA)

    // The one action colour. Apple system blue (light). Pressed is the same
    // blue, a step darker, so a tap reads without introducing a second hue.
    val Indigo = Color(0xFF007AFF)
    val IndigoPressed = Color(0xFF0066D6)
    val IndigoSoft = Color(0xFFE5F1FF)
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

    /**
     * THE ONE DARK SURFACE, AND WHY IT IS ALLOWED TO BE DARK.
     *
     * Everything else in this app is light on purpose. The full-screen call
     * surfaces are the exception: they are what a rep stares at with the phone
     * against their face, often in a car or a site office at night, and every
     * platform including iOS runs them dark. A white screen at full brightness
     * during a call is the one place the light canvas is actively wrong.
     *
     * It is a deliberate, tokenised dark — graphite, white primary type, muted
     * secondary, the SAME indigo for active controls, and red reserved for one
     * thing only: ending the call. No gradients, no glass, no gold.
     */
    object Call {
        val Bg = Color(0xFF121316)
        val BgElevated = Color(0xFF1C1E22)
        val Control = Color(0xFF25282E)
        val ControlActive = Indigo
        val Hairline = Color(0xFF2E323A)

        val TextPrimary = Color(0xFFF5F6F8)
        val TextSecondary = Color(0xFF9BA1AC)
        val TextTertiary = Color(0xFF6B7280)

        /** Answer. The only green on the surface. */
        val Accept = Color(0xFF17A34A)
        /** End. The only red on the surface — nothing else may borrow it. */
        val End = Color(0xFFDC2626)
        /** Live recording dot. */
        val Recording = Color(0xFFEF4444)
    }

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

/**
 * Apple's system palette (light), for the places that need a second hue:
 * destructive actions, a success tick, a warning dot, the coach orb.
 *
 * The app's state colours above stay darker on purpose (they are TEXT on
 * white and need the contrast). These are FILLS and icon tints, the way iOS
 * uses them. Never use them for body text.
 */
object IosColors {
    val Blue = Color(0xFF007AFF)
    val Green = Color(0xFF34C759)
    val Indigo = Color(0xFF5856D6)
    val Orange = Color(0xFFFF9500)
    val Pink = Color(0xFFFF2D55)
    val Purple = Color(0xFFAF52DE)
    val Red = Color(0xFFFF3B30)
    val Teal = Color(0xFF30B0C7)
    val Yellow = Color(0xFFFFCC00)
    val Gray = Color(0xFF8E8E93)
    val Gray2 = Color(0xFFAEAEB2)
    val Gray5 = Color(0xFFE5E5EA)
    val Gray6 = Color(0xFFF2F2F7)

    /** Grouped table background and its white cells. */
    val GroupedBg = Color(0xFFF2F2F7)
    val Cell = Color(0xFFFFFFFF)
    /** The pressed state of a white cell. */
    val CellPressed = Color(0xFFE5E5EA)
    /** Fill behind a segmented control / search field (tertiarySystemFill). */
    val Fill = Color(0x1F767680)
    /** The dimmed backdrop behind an action sheet. */
    val Scrim = Color(0x66000000)
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
