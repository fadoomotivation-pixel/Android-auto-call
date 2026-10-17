package com.salesautocall.app.data

/**
 * Turns the text of a photographed or pasted call list into name + Indian
 * mobile pairs. Pure Kotlin, no Android, so it is unit-tested and the camera
 * path (ML Kit lines) and the Paste path go through exactly the same rules.
 *
 * Rules, in the order a rep would expect them:
 *  - A number is a run of digits with optional spaces / dashes / dots and an
 *    optional +91, 91 or 0 in front. Runs shorter than 7 digits (plot 585,
 *    "10:30", "₹45 L") are not numbers and are ignored.
 *  - Valid = exactly 10 digits after dropping +91 / 0, starting 6–9.
 *    A 7–13 digit run that fails that is kept and marked invalid, so the rep
 *    sees it was read and why it will not be added.
 *  - Name = the words on the same line once numbers, WhatsApp stamps, list
 *    bullets and labels ("Mob", "Name:") are removed. If the line has none,
 *    the previous line is used when it has words and no number of its own.
 *  - The second time a number appears it is marked [Row.duplicate].
 */
object ScanListParser {

    data class Row(
        /** Best guess at the person's name; null when the list had none. */
        val name: String?,
        /** 10-digit mobile when valid, otherwise the digits as read. */
        val phone: String,
        val valid: Boolean,
        /** Same number already appeared earlier in this list. */
        val duplicate: Boolean,
        /** Index of the input line the number was found on. */
        val line: Int,
    )

    private val NUMBER = Regex("""(?:\+\s*)?\d(?:[\s.\-()]{0,2}\d){6,24}""")
    private val WA_STAMP = Regex("""^\s*\[[^\]]{3,40}]\s*""")
    private val WA_STAMP_PLAIN = Regex("""^\s*\d{1,2}/\d{1,2}/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*-\s*""", RegexOption.IGNORE_CASE)
    private val WA_SENDER = Regex("""^[^:]{1,40}:\s+""")
    private val LABELS = Regex(
        """\b(?:name|naam|mob(?:ile)?|ph(?:one)?|no|number|num|contact|cell|tel|whatsapp|wa|call|forwarded|sr|s\.?\s?no)\b\.?\s*[:\-=]?""",
        RegexOption.IGNORE_CASE,
    )

    fun parse(text: String): List<Row> = parseLines(text.lines())

    fun parseLines(lines: List<String>): List<Row> {
        val out = ArrayList<Row>()
        val seen = HashSet<String>()
        var prevNameLine: String? = null
        var prevHadNumber = false
        lines.forEachIndexed { idx, rawLine ->
            val line = stripChatPrefix(rawLine)
            val numbers = findNumbers(line)
            if (numbers.isEmpty()) {
                val words = cleanName(line)
                prevNameLine = words
                prevHadNumber = false
                return@forEachIndexed
            }
            numbers.forEachIndexed { n, num ->
                // The words BEFORE this number (since the previous one) are its
                // name; a numbers-first table has them AFTER it instead.
                val before = line.safeSub(if (n == 0) 0 else numbers[n - 1].range.last + 1, num.range.first)
                val after = line.safeSub(num.range.last + 1, numbers.getOrNull(n + 1)?.range?.first ?: line.length)
                var name = cleanName(before) ?: cleanName(after)
                if (name == null && n == 0 && !prevHadNumber) name = prevNameLine
                val norm = normalize(num.digits)
                val phone = norm ?: num.digits
                val dup = !seen.add(phone)
                out += Row(name = name, phone = phone, valid = norm != null, duplicate = dup, line = idx)
            }
            prevNameLine = null
            prevHadNumber = true
        }
        return out
    }

    /** 10-digit Indian mobile or null. Accepts +91 / 91 / 0 prefixes. */
    fun normalize(digitsIn: String): String? {
        var d = digitsIn.filter { it.isDigit() }
        if (d.length == 12 && d.startsWith("91")) d = d.substring(2)
        else if (d.length == 11 && d.startsWith("0")) d = d.substring(1)
        else if (d.length == 13 && d.startsWith("091")) d = d.substring(3)
        return d.takeIf { it.length == 10 && it[0] in '6'..'9' }
    }

    /** The last 10 digits, the same key the database dedups on. */
    fun key(phone: String?): String? = phone?.filter { it.isDigit() }?.takeLast(10)?.takeIf { it.length == 10 }

    private fun stripChatPrefix(s: String): String {
        var t = s
        val stamped = WA_STAMP.containsMatchIn(t) || WA_STAMP_PLAIN.containsMatchIn(t)
        t = t.replace(WA_STAMP, "").replace(WA_STAMP_PLAIN, "")
        // "Ravi Kumar: Rakesh 98290…" — the sender is not the lead. Only drop
        // it on a stamped chat line, so "Name: Rakesh" still keeps Rakesh.
        if (stamped) t = t.replace(WA_SENDER, "")
        return t
    }

    private fun String.safeSub(from: Int, to: Int): String =
        if (from in 0..to && to <= length) substring(from, to) else ""

    private class Num(val range: IntRange, val digits: String)

    /** Each phone-like run with its position, splitting glued pairs. */
    private fun findNumbers(line: String): List<Num> {
        val res = ArrayList<Num>()
        for (m in NUMBER.findAll(line)) {
            val digits = m.value.filter { it.isDigit() }
            if (digits.length < 7) continue
            if (digits.length > 13) {
                // Two numbers OCR'd with only a space between them.
                val parts = digits.chunked(10)
                if (digits.length % 10 == 0 && parts.all { normalize(it) != null }) {
                    parts.forEach { res += Num(m.range, it) }
                    continue
                }
            }
            res += Num(m.range, digits)
        }
        return res
    }

    private fun cleanName(s: String): String? {
        val t = s.replace(LABELS, " ")
            .replace(Regex("""[^\p{L}\s.']"""), " ")
            .replace(Regex("""(^|\s)[.']+|[.']+(\s|$)"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim()
        if (t.count { it.isLetter() } < 2) return null
        val words = t.split(' ').filter { it.isNotBlank() }.take(3)
        return words.joinToString(" ") { w -> w.replaceFirstChar { it.uppercaseChar() } }.take(40)
    }
}
