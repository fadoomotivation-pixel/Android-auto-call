package com.salesautocall.app.data

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
 * Turns a CSV / TSV / XLSX contact file into [ParsedContact]s.
 *
 * - Dispatches to [XlsxParser] for Excel (.xlsx / ZIP) files, otherwise CSV/TSV.
 * - Detects a header row and maps common column names
 *   (name, phone/mobile/number, email, company, reason/notes).
 * - Falls back to positional columns (0 = name, 1 = phone, ...) without a header.
 * - Rows without a usable phone number are skipped.
 */
object ContactImport {

    private val PHONE_KEYS = setOf("phone", "mobile", "number", "contact", "phone_number", "mobile_number", "tel")
    private val NAME_KEYS = setOf("name", "full_name", "contact_name", "customer", "lead")
    private val EMAIL_KEYS = setOf("email", "e-mail", "mail")
    private val COMPANY_KEYS = setOf("company", "company_name", "organization", "org")
    private val NOTES_KEYS = setOf("notes", "note", "remark", "remarks", "comment", "reason")

    fun parse(bytes: ByteArray, fileName: String): ParseResult {
        val rows = if (isXlsx(bytes, fileName)) {
            XlsxParser.rows(bytes)
        } else {
            CsvTsvParser.rows(bytes.toString(Charsets.UTF_8), fileName)
        }
        return mapRows(rows)
    }

    private fun isXlsx(bytes: ByteArray, fileName: String): Boolean {
        if (fileName.lowercase().endsWith(".xlsx")) return true
        // ZIP magic "PK"
        return bytes.size >= 2 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()
    }

    private data class ColumnMapping(val name: Int, val phone: Int, val email: Int, val company: Int, val notes: Int)

    private fun mapRows(rows: List<List<String>>): ParseResult {
        if (rows.isEmpty()) return ParseResult(emptyList(), 0, 0)

        val header = rows.first().map { it.trim().lowercase() }
        val hasHeader = header.any { h ->
            PHONE_KEYS.contains(h) || NAME_KEYS.contains(h) || EMAIL_KEYS.contains(h)
        }
        val mapping = if (hasHeader) buildMapping(header) else ColumnMapping(0, 1, 2, 3, 4)
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
