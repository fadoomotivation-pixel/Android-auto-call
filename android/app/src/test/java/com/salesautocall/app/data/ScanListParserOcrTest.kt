package com.salesautocall.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The camera path: OCR text is messier than pasted text. */
class ScanListParserOcrTest {

    private fun phones(text: String) = ScanListParser.parse(text).filter { it.valid }.map { it.phone }

    @Test fun prefixesAndSeparators() {
        val r = phones("""
            A +91 98290 41237
            B 091-9928015562
            C 0 97845 22310
            D 94140.77821
            E 91-7014-790-988
            F (+91) 88750-33210
        """.trimIndent())
        assertEquals(listOf("9829041237", "9928015562", "9784522310", "9414077821", "7014790988", "8875033210"), r)
    }

    @Test fun ocrLookalikesInsideNumbers() {
        assertEquals(listOf("9829041237"), phones("Rakesh 98290 4l237"))
        assertEquals(listOf("9928015562"), phones("Priya 99280 I5562"))
        assertEquals(listOf("9784522310"), phones("Amit 9784S22310"))
        assertEquals(listOf("9414077821"), phones("Sunita 94l4O77821"))
        assertEquals(listOf("8875033210"), phones("Neha B875033210"))
    }

    @Test fun lookalikeFixDoesNotTouchWords() {
        assertEquals("Sunil BOSS 10:30", ScanListParser.fixOcrDigits("Sunil BOSS 10:30"))
        assertEquals("Plot SB-12 3BHK", ScanListParser.fixOcrDigits("Plot SB-12 3BHK"))
        val r = ScanListParser.parse("Sushil Bansal 9829041237")
        assertEquals("Sushil Bansal", r[0].name)
    }

    @Test fun numberSplitAcrossLines() {
        val r = ScanListParser.parseLines(listOf("Rakesh Sharma 98290", "41237", "Priya 9928015562"))
        assertEquals(listOf("9829041237", "9928015562"), r.filter { it.valid }.map { it.phone })
        assertEquals("Rakesh Sharma", r[0].name)
        assertEquals(0, r[0].line)
        assertEquals(2, r[1].line)
    }

    @Test fun splitJoinKeepsLineCount() {
        val l = listOf("Ravi 98290", "41237 Jaipur", "x")
        assertEquals(3, ScanListParser.joinSplit(l).size)
    }

    @Test fun onlyValidIndianMobiles() {
        val r = ScanListParser.parse("A 5123456789\nB 01412345678\nC 98290412\nD 9829041237")
        assertEquals(listOf("9829041237"), r.filter { it.valid }.map { it.phone })
        assertTrue(r.filter { !it.valid }.isNotEmpty())
    }

    @Test fun dedupeAcrossFormats() {
        val r = ScanListParser.parse("A +91 98290 41237\nB 09829041237\nC 98290-41237")
        assertEquals(3, r.size)
        assertFalse(r[0].duplicate); assertTrue(r[1].duplicate); assertTrue(r[2].duplicate)
    }

    @Test fun normalizeEdgeCases() {
        assertEquals("9829041237", ScanListParser.normalize("+91 98290 41237"))
        assertEquals("6000000001", ScanListParser.normalize("06000000001"))
        assertNull(ScanListParser.normalize("5829041237"))
        assertNull(ScanListParser.normalize("982904123"))
    }
}
