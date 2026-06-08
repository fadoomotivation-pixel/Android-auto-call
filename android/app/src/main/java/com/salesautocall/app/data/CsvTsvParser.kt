package com.salesautocall.app.data

/** Splits CSV/TSV text into rows of cell strings (delimiter auto-detected). */
object CsvTsvParser {

    fun rows(text: String, fileName: String): List<List<String>> {
        val lines = text.split("\r\n", "\n", "\r").filter { it.isNotBlank() }
        if (lines.isEmpty()) return emptyList()
        val delim = if (fileName.lowercase().endsWith(".tsv")) '\t' else detectDelimiter(lines.first())
        return lines.map { splitLine(it, delim) }
    }

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
}
