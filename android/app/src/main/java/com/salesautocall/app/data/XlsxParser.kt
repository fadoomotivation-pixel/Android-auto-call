package com.salesautocall.app.data

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * Minimal .xlsx reader. An xlsx file is a ZIP of XML parts; we read the shared
 * string table and the first worksheet and return rows of cell strings. Uses
 * Android's built-in XmlPullParser, so no external (StAX-based) dependency.
 */
object XlsxParser {

    fun rows(bytes: ByteArray): List<List<String>> {
        val entries = readZip(bytes)
        val shared = entries.entries
            .firstOrNull { it.key.equals("xl/sharedStrings.xml", ignoreCase = true) }
            ?.let { parseSharedStrings(it.value) }
            ?: emptyList()

        val sheetKey = entries.keys
            .filter { it.startsWith("xl/worksheets/sheet") && it.endsWith(".xml") }
            .minOrNull()
            ?: return emptyList()

        return parseSheet(entries[sheetKey]!!, shared)
    }

    private fun readZip(bytes: ByteArray): Map<String, ByteArray> {
        val out = HashMap<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zis ->
            var entry = zis.nextEntry
            val buffer = ByteArray(8192)
            while (entry != null) {
                val name = entry.name
                if (name == "xl/sharedStrings.xml" ||
                    (name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml"))
                ) {
                    val bos = java.io.ByteArrayOutputStream()
                    var n = zis.read(buffer)
                    while (n >= 0) {
                        bos.write(buffer, 0, n)
                        n = zis.read(buffer)
                    }
                    out[name] = bos.toByteArray()
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }
        return out
    }

    private fun parseSharedStrings(bytes: ByteArray): List<String> {
        val parser = Xml.newPullParser().apply {
            setInput(ByteArrayInputStream(bytes), "UTF-8")
        }
        val strings = mutableListOf<String>()
        val current = StringBuilder()
        var inT = false
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (parser.name) {
                    "si" -> current.setLength(0)
                    "t" -> inT = true
                }
                XmlPullParser.TEXT -> if (inT) current.append(parser.text)
                XmlPullParser.END_TAG -> when (parser.name) {
                    "t" -> inT = false
                    "si" -> strings.add(current.toString())
                }
            }
            event = parser.next()
        }
        return strings
    }

    private fun parseSheet(bytes: ByteArray, shared: List<String>): List<List<String>> {
        val parser = Xml.newPullParser().apply {
            setInput(ByteArrayInputStream(bytes), "UTF-8")
        }
        val rows = mutableListOf<List<String>>()
        var row: MutableList<String>? = null
        var cellType: String? = null
        var cellRef: String? = null
        val cellText = StringBuilder()
        var inValue = false

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (parser.name) {
                    "row" -> row = mutableListOf()
                    "c" -> {
                        cellType = parser.getAttributeValue(null, "t")
                        cellRef = parser.getAttributeValue(null, "r")
                        cellText.setLength(0)
                    }
                    "v", "t" -> inValue = true
                }
                XmlPullParser.TEXT -> if (inValue) cellText.append(parser.text)
                XmlPullParser.END_TAG -> when (parser.name) {
                    "v", "t" -> inValue = false
                    "c" -> {
                        val r = row
                        if (r != null) {
                            val raw = cellText.toString()
                            val value = if (cellType == "s") {
                                raw.trim().toIntOrNull()?.let { shared.getOrNull(it) } ?: ""
                            } else raw
                            val idx = cellRef?.let { columnIndex(it) } ?: r.size
                            while (r.size < idx) r.add("")
                            r.add(value)
                        }
                    }
                    "row" -> {
                        row?.let { rows.add(it) }
                        row = null
                    }
                }
            }
            event = parser.next()
        }
        return rows
    }

    /** "B12" -> 1, "AA3" -> 26. */
    private fun columnIndex(ref: String): Int {
        var col = 0
        for (ch in ref) {
            if (ch.isLetter()) col = col * 26 + (ch.uppercaseChar() - 'A' + 1) else break
        }
        return (col - 1).coerceAtLeast(0)
    }
}
