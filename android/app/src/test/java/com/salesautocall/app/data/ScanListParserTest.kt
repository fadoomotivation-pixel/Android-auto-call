package com.salesautocall.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanListParserTest {

    @Test fun messyLensText() {
        val text = """
            Rakesh Sharma  98290 41237
            Priya Verma - 9928015562
            Amit Gupta +91 97845-22310
            Sunita Yadav 094140 77821
            Plot 585 Shree Kunj 10:30
            Manoj  98290 41237
            Neha 88750 3321
            Deepak Jain
            7014790988
        """.trimIndent()
        val r = ScanListParser.parse(text)
        assertEquals(7, r.size)
        assertEquals("Rakesh Sharma", r[0].name); assertEquals("9829041237", r[0].phone); assertTrue(r[0].valid)
        assertEquals("Priya Verma", r[1].name); assertEquals("9928015562", r[1].phone)
        assertEquals("9784522310", r[2].phone)
        assertEquals("9414077821", r[3].phone)
        assertTrue(r[4].duplicate); assertEquals("Manoj", r[4].name)
        assertFalse(r[5].valid); assertEquals("Neha", r[5].name)
        assertEquals("Deepak Jain", r[6].name); assertEquals("7014790988", r[6].phone)
    }

    @Test fun whatsappForward() {
        val text = """
            [17/10, 10:32 am] Ravi Kumar: Forwarded
            [17/10, 10:32 am] Ravi Kumar: Name: Rakesh, Mob: 9829041237
            17/10/26, 10:33 am - Ravi Kumar: Priya 99280-15562
            ~ Amit Gupta +919784522310
            1. Sunita 9414077821, 2. Manoj 5123456789
        """.trimIndent()
        val r = ScanListParser.parse(text)
        assertEquals("Rakesh", r[0].name); assertEquals("9829041237", r[0].phone)
        assertEquals("Priya", r[1].name)
        assertEquals("Amit Gupta", r[2].name); assertEquals("9784522310", r[2].phone)
        assertEquals("9414077821", r[3].phone)
        assertFalse(r[4].valid)
        assertEquals(5, r.size)
    }

    @Test fun tableNumbersFirst() {
        val text = """
            Mobile        Name           Location
            9829041237    Rakesh Sharma  Jaipur
            9928015562    Priya Verma    Ajmer
            9829041237    Rakesh S       Jaipur
        """.trimIndent()
        val r = ScanListParser.parse(text)
        assertEquals(3, r.size)
        assertEquals("Rakesh Sharma Jaipur", r[0].name)
        assertEquals("9928015562", r[1].phone)
        assertTrue(r[2].duplicate)
        // The header line has words but the first row has its own name.
        assertFalse(r[0].duplicate)
    }

    @Test fun gluedPairAndNoName() {
        val r = ScanListParser.parse("98290412379928015562")
        assertEquals(listOf("9829041237", "9928015562"), r.map { it.phone })
        assertNull(r[0].name)
    }

    @Test fun normalizeAndKey() {
        assertEquals("9829041237", ScanListParser.normalize("+91 98290 41237"))
        assertEquals("9829041237", ScanListParser.normalize("09829041237"))
        assertNull(ScanListParser.normalize("1829041237"))
        assertNull(ScanListParser.normalize("98290412"))
        assertEquals("9829041237", ScanListParser.key("+919829041237"))
    }
}
