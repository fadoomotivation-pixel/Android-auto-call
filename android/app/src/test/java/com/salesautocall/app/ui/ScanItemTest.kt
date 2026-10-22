package com.salesautocall.app.ui

import com.salesautocall.app.data.ScanListParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A number the company already has can never be added — the dedup trigger
 * skips it on save. Review must say so before the rep presses Add, not after.
 */
class ScanItemTest {

    private val rows = ScanListParser.parse(
        """
        Rakesh 98290 41237
        Priya 99280 15562
        Amit 97845 22310
        Sunita 94140 77821
        """.trimIndent(),
    )

    @Test fun ownLeadsAreFlaggedWithoutTheCompanyCheck() {
        val items = toScanItems(rows, crmKeys = setOf("9829041237"))
        assertEquals("Already your lead", items[0].flag)
        assertFalse(items[0].addable)
        assertTrue(items.drop(1).all { it.addable })
    }

    @Test fun companyCheckMarksTeammateAndDoNotCall() {
        val items = withKnown(
            toScanItems(rows, crmKeys = emptySet()),
            mapOf("9928015562" to "team", "9784522310" to "dnc", "9829041237" to "mine"),
        )
        assertEquals(listOf("Already your lead", "With a teammate", "Do not call", null), items.map { it.flag })
        assertEquals(listOf(false, false, false, true), items.map { it.addable })
    }

    @Test fun anEmptyCheckChangesNothing() {
        val before = toScanItems(rows, crmKeys = emptySet())
        assertEquals(before, withKnown(before, emptyMap()))
        assertTrue(before.all { it.addable })
    }

    @Test fun invalidNumbersStayInvalid() {
        val bad = toScanItems(ScanListParser.parse("Neha 88750 3321"), emptySet())
        val marked = withKnown(bad, mapOf("8875033210" to "team"))
        assertEquals("Invalid number", marked.single().flag)
        assertNull(marked.single().known)
    }
}
