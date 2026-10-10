package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadMemory
import com.salesautocall.app.data.LeadWork
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.IosColors
import com.salesautocall.app.ui.design.iosPress

/**
 * AI RECOMMENDATION — what happened before, and the one thing to do next.
 *
 * Composed on the phone, deterministically, from data the server already
 * stored. Nothing here calls a model and nothing is written:
 *  - context: v_lead_workstate (waiting_since, last_call_at/seconds,
 *    best_call_seconds, calls_total) + lead_memory (where we left it, what
 *    they want, what stopped them; shown in the buyer's own words).
 *  - next step, first match wins: a promise she still owes (promise-watch),
 *    a buyer waiting on WhatsApp, a site visit to confirm, the AI score's
 *    stored ai_next_action, the objection in memory, numbers that never
 *    connect, then a plain discovery call.
 * Missing data is named ("No call summary yet"), never filled in.
 */
internal enum class RecoAction { CALL, WHATSAPP }

internal data class AiReco(
    val context: String,
    val nextStep: String,
    val action: RecoAction,
    val missing: String?,
)

private fun daysSince(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    val ms = runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
        .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
        .getOrNull() ?: return null
    return ((System.currentTimeMillis() - ms) / 86_400_000L).coerceAtLeast(0)
}

private fun dayWords(d: Long): String = when (d) {
    0L -> "today"
    1L -> "1 day ago"
    else -> "$d days ago"
}

private fun sentence(s: String): String {
    val t = s.trim().trimEnd('.', '।')
    return if (t.isEmpty()) "" else "$t."
}

private val SEND_WORDS = listOf("send", "share", "document", "brochure", "photo", "video", "location", "map", "plan", "price list", "rate", "whatsapp", "bhej")

internal fun buildAiReco(lead: Contact, work: LeadWork?, memory: LeadMemory?): AiReco {
    val first = (prettyName(lead.name) ?: "This buyer").trim().substringBefore(' ').ifBlank { "This buyer" }
    val ctx = mutableListOf<String>()

    // 1) How long since we heard from them.
    val waitDays = daysSince(work?.waitingSince)
    val callDays = daysSince(work?.lastCallAt)
    when {
        waitDays != null -> ctx += "$first messaged on WhatsApp ${dayWords(waitDays)} and is waiting for a reply."
        callDays != null && (work?.lastCallSeconds ?: 0) <= 0 ->
            ctx += if ((work?.bestCallSeconds ?: 0) > 0) "$first has not answered since the last talk. Last try was ${dayWords(callDays)}."
                   else "$first has not answered yet. Last try was ${dayWords(callDays)}."
        callDays != null -> ctx += "You last spoke to $first ${dayWords(callDays)}."
        else -> ctx += "Nobody has called $first yet."
    }

    // 2) What the buyer said, in their own words.
    val left = memory?.whereWeLeftIt?.trim()?.takeIf { it.isNotEmpty() }
    val wants = memory?.buyerWants?.trim()?.takeIf { it.isNotEmpty() }
    val stopped = memory?.objection?.trim()?.takeIf { it.isNotEmpty() && memory.objectionCode != "none" }
    when {
        left != null -> ctx += "Left at: ${sentence(left)}"
        wants != null -> ctx += "They want: ${sentence(wants)}"
    }
    if (left != null && wants != null) ctx += "They want: ${sentence(wants)}"

    // 3) The one next step.
    val owe = work?.promiseText?.trim()?.takeIf { work.promiseDueSince != null && it.isNotEmpty() }
    val aiNext = lead.aiNextAction?.trim()?.takeIf { it.isNotEmpty() }
    val noConnect = (work?.bestCallSeconds ?: 0) <= 0 && (work?.callsTotal ?: 0) >= 3
    val (step, action) = when {
        owe != null -> {
            val sendy = SEND_WORDS.any { owe.contains(it, ignoreCase = true) }
            "Do what you promised: ${sentence(owe)}" to (if (sendy) RecoAction.WHATSAPP else RecoAction.CALL)
        }
        waitDays != null -> "Reply on WhatsApp first, then call." to RecoAction.WHATSAPP
        work?.actionState == "awaiting_visit" -> "Ask if they visited the site. If not, fix a new day." to RecoAction.CALL
        aiNext != null -> sentence(aiNext) to (if (SEND_WORDS.any { aiNext.contains(it, ignoreCase = true) }) RecoAction.WHATSAPP else RecoAction.CALL)
        stopped != null -> "Call and answer the concern: ${sentence(stopped)}" to RecoAction.CALL
        noConnect -> "Calls have not connected after ${work?.callsTotal} tries. Send a short WhatsApp intro." to RecoAction.WHATSAPP
        wants != null -> "Call and share options that match what they want." to RecoAction.CALL
        else -> "Call and find out budget, location and when they want to buy." to RecoAction.CALL
    }

    val missing = when {
        memory == null || (left == null && wants == null && stopped == null) ->
            if (callDays == null) null else "No call summary yet, so this is based on call times only."
        else -> null
    }
    return AiReco(ctx.joinToString(" "), step, action, missing)
}

/** Simple sparkle glyph, monochrome. Replaces the coach face in chrome. */
@Composable
internal fun SparkleGlyph(size: androidx.compose.ui.unit.Dp = 16.dp, tint: Color = IosColors.Blue) {
    Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = tint, modifier = Modifier.size(size))
}

/**
 * The recommendation block. Flat, hairline-separated, one action button that
 * matches the step. [busy] greys the button while the WhatsApp draft is written.
 */
@Composable
internal fun AiRecommendationBlock(
    reco: AiReco,
    firstName: String,
    busy: Boolean,
    onCall: () -> Unit,
    onWhatsApp: () -> Unit,
    modifier: Modifier = Modifier,
    showButton: Boolean = true,
) {
    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SparkleGlyph(14.dp)
            Spacer(Modifier.width(6.dp))
            Text("AI recommendation", style = AppType.footnote.copy(fontWeight = FontWeight.Medium), color = AppColors.TextSecondary)
        }
        Spacer(Modifier.height(4.dp))
        Text(reco.context, style = AppType.subhead, color = AppColors.TextPrimary)
        Spacer(Modifier.height(4.dp))
        Text("Next step: ${reco.nextStep}", style = AppType.subhead.copy(fontWeight = FontWeight.Medium), color = AppColors.TextPrimary)
        reco.missing?.let {
            Spacer(Modifier.height(2.dp))
            Text(it, style = AppType.footnote, color = AppColors.TextSecondary)
        }
        if (showButton) {
            Spacer(Modifier.height(8.dp))
            val label = when (reco.action) {
                RecoAction.WHATSAPP -> if (busy) "Writing message…" else "Send on WhatsApp"
                RecoAction.CALL -> "Call $firstName"
            }
            Row(
                Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(10.dp))
                    .iosPress(scaleTo = 0.97f) { if (!busy) { if (reco.action == RecoAction.WHATSAPP) onWhatsApp() else onCall() } }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start,
            ) {
                Text("$label  ›", style = AppType.subhead.copy(fontWeight = FontWeight.Medium),
                    color = if (busy) AppColors.TextSecondary else IosColors.Blue)
            }
        }
    }
}
