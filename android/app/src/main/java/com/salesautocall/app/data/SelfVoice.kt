package com.salesautocall.app.data

/**
 * How a telecaller refers to themselves in a generated Hindi/Hinglish message.
 *
 * The ready-made openers all said "main baat kar raha hoon" and "details
 * bataunga" — the male form — so for the many women doing this job every first
 * message was wrong about the person sending it.
 *
 * Hindi conjugates the FIRST person, so this depends on the rep, not the lead.
 * The rep picks their own form in Settings; it is never inferred from a name,
 * because guessing gets it wrong for real people. The default when nobody has
 * picked is the plural — ordinary polite business Hindi that is correct for
 * everyone, so an unset profile never misgenders anyone.
 */
object SelfVoice {

    const val FEMALE = "f"
    const val MALE = "m"
    const val NEUTRAL = "neutral"

    /** "kar rahi hoon" / "kar raha hoon" / "kar rahe hain" — for a given verb stem. */
    fun doing(speaksAs: String?, stem: String): String = when (speaksAs) {
        FEMALE -> "$stem rahi hoon"
        MALE -> "$stem raha hoon"
        else -> "$stem rahe hain"
    }

    /** "chahti hoon" / "chahta hoon" / "chahte hain". */
    fun want(speaksAs: String?): String = when (speaksAs) {
        FEMALE -> "chahti hoon"
        MALE -> "chahta hoon"
        else -> "chahte hain"
    }

    /** Future tense: "bataungi" / "bataunga" / "batayenge" — pass the stem ("bata"). */
    fun willDo(speaksAs: String?, stem: String): String = when (speaksAs) {
        FEMALE -> "${stem}ungi"
        MALE -> "${stem}unga"
        else -> "${stem}yenge"
    }

    /** "main ... hoon" vs the neutral "hum ... se hain" opener. */
    fun iAm(speaksAs: String?): String = if (speaksAs == FEMALE || speaksAs == MALE) "main" else "hum"

    /** Label for the Settings picker. */
    fun label(speaksAs: String?): String = when (speaksAs) {
        FEMALE -> "Female — \"kar rahi hoon\""
        MALE -> "Male — \"kar raha hoon\""
        else -> "Neutral — \"kar rahe hain\""
    }
}
