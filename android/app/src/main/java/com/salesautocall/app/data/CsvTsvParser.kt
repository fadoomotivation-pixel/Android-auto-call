package com.salesautocall.app.data

import java.io.BufferedReader

/** A single parsed row mapped onto our contact fields. */
data class ParsedContact(
    val name: String?,
    val phone: String,
    val email: String?,
    val companyName: String?,
    val notes: String?,
)

data class ParseResult(
    val contacts: List<ParsedContact>,
    val totalRows: Int,
    val skippedRows: Int,
)

/**
 * Parses CSV or TSV contact files.
 *
 * - Auto-detects the delimiter from the file extension / first line.
 * - Detects a header row and maps common column names
 *   (name, phone/mobile/number, email, company, notes).
 * - If no recognizable header exists, falls back to positional columns
 *   (col 0 = name, col 1 = phone, ...).
 * - Rows without a usable phone number are skipped.
 */
object CsvTsvParser {

    private val PHONE_KEYS = setOf("phone", "mobile", "number", "contact", "phone_number", "mobile_number", "tel")
    private val NAME_KEYS = setOf("name", "full_name", "contact_name", "customer", "lead")
    private val EMAIL_KEYS = setOf("email", "e-mail", "mail")
    private val COMPANY_KEYS = setOf("company", "company_name", "organization", "org")
    private val NOTES_KEYS = setOf("notes", "note", "remark", "remarks", "comment")

    fun parse(reader: BufferedReader, fileName: String): ParseResult {
        val delimiter = if (fileName.lowercase().endsWith(".tsv")) '\t' else null
        val lines = reader.readLines().filter { it.isNotBlank() }
        if (lines.isEmpty()) return ParseResult(emptyList(), 0, 0)

        val delim = delimiter ?: detectDelimiter(lines.first())
        val rows = lines.map { splitLine(it, delim) }

        val header = rows.first().map { it.trim().lowercase() }
        val hasHeader = header.any { h ->
            PHONE_KEYS.contains(h) || NAME_KEYS.contains(h) || EMAIL_KEYS.contains(h)
        }

        val mapping = if (hasHeader) buildMapping(header) else defaultMapping()
        val dataRows = if (hasHeader) rows.drop(1) else rows

        val contacts = mutableListOf<ParsedContact>()
        var skipped = 0
        for (cols in dataRows) {
            val phone = normalizePhone(cols.getOrNull(mapping.phone))
            if (phone == null) {
                skipped++
                continue
            }
            contacts.add(
                ParsedContact(
                    name = cols.getOrNull(mapping.name)?.trim()?.ifBlank { null },
                    phone = phone,
                    email = cols.getOrNull(mapping.email)?.trim()?.ifBlank { null },
                    companyName = cols.getOrNull(mapping.company)?.trim()?.ifBlank { null },
                    notes = cols.getOrNull(mapping.notes)?.trim()?.ifBlank { null },
                ),
            )
        }
        return ParseResult(contacts, dataRows.size, skipped)
    }

    private data class ColumnMapping(
        val name: Int,
        val phone: Int,
        val email: Int,
        val company: Int,
        val notes: Int,
    )

    private fun buildMapping(header: List<String>): ColumnMapping {
        fun indexOf(keys: Set<String>) = header.indexOfFirst { keys.contains(it) }
        val phone = indexOf(PHONE_KEYS).let { if (it >= 0) it else 1 }
        return ColumnMapping(
            name = indexOf(NAME_KEYS),
            phone = phone,
            email = indexOf(EMAIL_KEYS),
            company = indexOf(COMPANY_KEYS),
            notes = indexOf(NOTES_KEYS),
        )
    }

    private fun defaultMapping() = ColumnMapping(name = 0, phone = 1, email = 2, company = 3, notes = 4)

    private fun detectDelimiter(line: String): Char {
        val tabs = line.count { it == '\t' }
        val commas = line.count { it == ',' }
        val semis = line.count { it == ';' }
        return when {
            tabs >= commas && tabs >= semis && tabs > 0 -> '\t'
            semis > commas -> ';'
            else -> ','
        }
    }

    /** Split respecting double-quoted fields (RFC-4180-ish). */
    private fun splitLine(line: String, delim: Char): List<String> {
        val out = mutableListOf<String>()
        val sb = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < line.length) {
            val c = line[i]
            when {
                c == '"' && inQuotes && i + 1 < line.length && line[i + 1] == '"' -> {
                    sb.append('"'); i++
                }
                c == '"' -> inQuotes = !inQuotes
                c == delim && !inQuotes -> {
                    out.add(sb.toString()); sb.setLength(0)
                }
                else -> sb.append(c)
            }
            i++
        }
        out.add(sb.toString())
        return out
    }

    /** Keep digits and a leading +; reject anything too short to be a number. */
    private fun normalizePhone(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        val plus = trimmed.startsWith("+")
        val digits = trimmed.filter { it.isDigit() }
        if (digits.length < 7) return null
        return if (plus) "+$digits" else digits
    }
}
