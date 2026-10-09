package com.salesautocall.app.ui

import com.salesautocall.app.data.CoachFeedbackRow
import com.salesautocall.app.data.LeadMemory
import com.salesautocall.app.data.PlaybookChunk

/**
 * THE COACH'S BRAIN ON THE PHONE — pure functions, no network, no invention.
 *
 * Everything the Coach card says comes from three things that already exist:
 *   · coach_feedback — what rep-coach said about each scored call
 *                      (good / improve / an honest 1-5 rating);
 *   · lead_memory    — the objection the buyer actually raised;
 *   · knowledge_chunks — the company's own "Objection → Winning reply" rows,
 *                      the same brain match_knowledge serves.
 *
 * This file only SORTS and MATCHES those words. It never writes a sentence of
 * advice itself: when nothing matches, the card says so in plain words instead
 * of making a line up. "Never let a screen say a number it cannot stand behind"
 * applies to advice too.
 */

/** A coaching theme, recognised by plain keywords in English and Hinglish. */
data class CoachTheme(val code: String, val label: String, val words: List<String>, val objection: Boolean)

internal val COACH_THEMES = listOf(
    CoachTheme("price", "Handling \"too expensive\"",
        listOf("expensive", "costly", "price", " rate",  "mehnga", "mahenga", "mehenga", "discount", "kam karo", "zyada hai"), true),
    CoachTheme("family", "When they say \"I'll ask my family\"",
        listOf("family", "ghar pe", "ghar par", "wife", "parents", "discuss", "baat karke", "baat kar ke"), true),
    CoachTheme("location", "When the site feels far",
        listOf("location", "far", " door", "distance", "connectivity", "doori"), true),
    CoachTheme("trust", "Building trust",
        listOf("trust", "bharosa", "legal", "registry", "fraud", "genuine"), true),
    CoachTheme("loan", "Loan and payment questions",
        listOf("loan", "finance", "bank", "emi", "payment plan"), true),
    CoachTheme("wait", "When they want to wait",
        listOf("wait", "later", "ruk", "baad mein", "price drop", "abhi nahi", "time chahiye", "sochenge", "soch ke"), true),
    CoachTheme("whatsapp", "\"Just send details on WhatsApp\"",
        listOf("whatsapp", "details bhej", "send details", "send the details", "brochure"), true),
    CoachTheme("visit", "Asking for the site visit",
        listOf("site visit", "visit", "site par", "site pe", "dikhane"), false),
    CoachTheme("discovery", "Asking what they need first",
        listOf("requirement", "needs", "need ", "budget", "timeline", "classify", "investor", "end-user", "end user",
            "samjh", "samajh", "qualif", "questions", "zarurat", "zaruraton"), false),
    CoachTheme("next_step", "Locking a clear next step",
        listOf("next step", "commitment", "follow-up", "follow up", "callback", "clear time", "agenda", "kal shaam", "fix a time"), false),
)

internal fun themesIn(text: String?): List<CoachTheme> {
    val t = " " + (text ?: return emptyList()).lowercase() + " "
    return COACH_THEMES.filter { th -> th.words.any { t.contains(it) } }
}

/** One objection reply out of the company's playbook, ready to show. */
data class PlaybookReply(
    /** "Objection: \"Too expensive\"" — shown so the rep knows where it came from. */
    val source: String,
    /** The exact words to say (the "Winning reply" part), trimmed. */
    val line: String,
    val themeCode: String,
)

/**
 * The words after "Winning reply:" in a playbook row, up to the next labelled
 * line ("Why it works:", "Next step:" …). Falls back to the row's text minus a
 * "Buyer says:" line. Never empty: a row with nothing usable returns null.
 */
internal fun winningLine(content: String): String? {
    val lines = content.lines().map { it.trim() }.filter { it.isNotEmpty() }
    val start = lines.indexOfFirst { it.startsWith("winning reply", ignoreCase = true) || it.startsWith("reply:", ignoreCase = true) || it.startsWith("say:", ignoreCase = true) }
    val picked = if (start >= 0) {
        val first = lines[start].substringAfter(':').trim()
        val rest = lines.drop(start + 1).takeWhile { !Regex("^[A-Z][A-Za-z ]{2,24}:").containsMatchIn(it) }
        (listOf(first) + rest).filter { it.isNotBlank() }.joinToString(" ")
    } else {
        lines.filterNot { it.startsWith("buyer says", ignoreCase = true) || it.startsWith("objection", ignoreCase = true) }
            .joinToString(" ")
    }
    return picked.trim().take(420).ifBlank { null }
}

/** The playbook reply for a theme, from objection rows only. Null when the company has none. */
internal fun replyForTheme(theme: CoachTheme, playbook: List<PlaybookChunk>): PlaybookReply? {
    val row = playbook.firstOrNull { ch ->
        val head = (ch.title.orEmpty() + " " + ch.content.lineSequence().firstOrNull().orEmpty())
        themesIn(head).any { it.code == theme.code }
    } ?: return null
    val line = winningLine(row.content) ?: return null
    return PlaybookReply(source = row.title?.trim()?.ifBlank { null } ?: "Your playbook", line = line, themeCode = theme.code)
}

/**
 * The reply to show for one call: the buyer's own objection first (that is
 * what they actually said), then whatever the coach told the rep to improve.
 */
internal fun replyForCall(improve: String?, memory: LeadMemory?, playbook: List<PlaybookChunk>): PlaybookReply? {
    val objection = memory?.objection?.takeIf { memory.objectionCode != "none" }
    val candidates = themesIn(objection) + themesIn(memory?.objectionCode) + themesIn(improve)
    for (th in candidates.distinctBy { it.code }) {
        replyForTheme(th, playbook)?.let { return it }
    }
    return null
}

/** What the Coach card says about the latest scored call. */
internal data class LastCallInsight(
    val callId: String,
    val rating: Int?,
    val good: String?,
    val improve: String?,
    val leadId: String?,
    val leadName: String?,
    val atIso: String?,
    val reply: PlaybookReply?,
)

internal fun lastCallInsight(
    rows: List<CoachFeedbackRow>,
    leadName: (String?) -> String?,
    memoryFor: (String?) -> LeadMemory?,
    playbook: List<PlaybookChunk>,
): LastCallInsight? {
    val r = rows.firstOrNull { it.rating != null || !it.good.isNullOrBlank() || !it.improve.isNullOrBlank() } ?: return null
    val lead = r.call?.contactId
    return LastCallInsight(
        callId = r.callId,
        rating = r.rating,
        good = r.good?.trim()?.ifBlank { null },
        improve = r.improve?.trim()?.ifBlank { null },
        leadId = lead,
        leadName = leadName(lead),
        atIso = r.createdAt,
        reply = replyForCall(r.improve, memoryFor(lead), playbook),
    )
}

/** Learning time: the rep's own most repeated weak spot, with a real example. */
internal data class LearningTip(
    val theme: CoachTheme,
    /** In how many of [outOf] recent scored calls the coach raised it. */
    val times: Int,
    val outOf: Int,
    /** The coach's own most recent sentence about it — real words, not ours. */
    val example: String,
    val reply: PlaybookReply?,
)

/**
 * Counts which theme the coach's "improve" lines keep coming back to across
 * recent scored calls. Weak calls (rating 3 or below, or unrated) count; a
 * theme needs to show up at least twice to be called a pattern. Ties go to
 * the theme raised most recently.
 */
internal fun learningTip(rows: List<CoachFeedbackRow>, playbook: List<PlaybookChunk>): LearningTip? {
    val scored = rows.filter { !it.improve.isNullOrBlank() }.take(20)
    if (scored.isEmpty()) return null
    val weak = scored.filter { (it.rating ?: 0) <= 3 }
    val counts = LinkedHashMap<String, Int>()
    val latestText = HashMap<String, String>()
    weak.forEach { row ->
        themesIn(row.improve).forEach { th ->
            counts[th.code] = (counts[th.code] ?: 0) + 1
            latestText.putIfAbsent(th.code, row.improve!!.trim())
        }
    }
    val best = counts.entries.filter { it.value >= 2 }.maxByOrNull { it.value } ?: return null
    val theme = COACH_THEMES.first { it.code == best.key }
    return LearningTip(
        theme = theme,
        times = best.value,
        outOf = scored.size,
        example = latestText[theme.code].orEmpty(),
        reply = replyForTheme(theme, playbook),
    )
}

/** "Coaching time" after a run of calls: what the coach said about today's latest scored calls. */
data class CoachMoment(
    val scored: Int,
    val avg: Double?,
    val good: String?,
    val theme: CoachTheme?,
    val improve: String?,
    val reply: PlaybookReply?,
)

/**
 * Built only from calls scored TODAY (the run the rep just made), latest 7.
 * Null when none of today's calls has been scored yet — the moment then simply
 * does not appear; it never fills the gap with generic advice.
 */
internal fun coachMoment(rows: List<CoachFeedbackRow>, playbook: List<PlaybookChunk>): CoachMoment? {
    val today = java.time.LocalDate.now()
    val todays = rows.filter { r ->
        val d = r.createdAt?.let { iso0 ->
            runCatching { java.time.OffsetDateTime.parse(iso0).atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDate() }
                .recoverCatching { _ -> java.time.Instant.parse(iso0).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }
                .getOrNull()
        }
        d == today
    }.take(7)
    if (todays.isEmpty()) return null
    val ratings = todays.mapNotNull { it.rating }
    val best = todays.filter { !it.good.isNullOrBlank() }.maxByOrNull { it.rating ?: 0 }
    val counts = LinkedHashMap<String, Int>()
    val text = HashMap<String, String>()
    todays.filter { !it.improve.isNullOrBlank() }.forEach { r ->
        themesIn(r.improve).forEach { th ->
            counts[th.code] = (counts[th.code] ?: 0) + 1
            text.putIfAbsent(th.code, r.improve!!.trim())
        }
    }
    val top = counts.maxByOrNull { it.value }?.key
    val theme = top?.let { c -> COACH_THEMES.firstOrNull { it.code == c } }
    val improve = top?.let { text[it] } ?: todays.firstOrNull { !it.improve.isNullOrBlank() }?.improve?.trim()
    return CoachMoment(
        scored = todays.size,
        avg = ratings.takeIf { it.isNotEmpty() }?.average(),
        good = best?.good?.trim(),
        theme = theme,
        improve = improve,
        reply = theme?.let { replyForTheme(it, playbook) },
    )
}
