package com.salesautocall.app.ui

import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadStage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MyReportTest {
    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test fun parsesFactsAndDerivesNumbers() {
        val r = parseDayReport(json("""{"dialled":10,"connected":4,"talk_seconds":600,
            "followups_completed":3,"followups_missed":1,"followups_scheduled":5}"""))!!
        assertEquals(10, r.attempted)
        assertEquals(4, r.connected)
        assertEquals(6, r.notConnected)
        assertEquals(150, r.avgSeconds)
        assertEquals(40, connectPercent(r))
        assertEquals(3, r.followupsDone)
    }

    @Test fun nothingConnectedIsDashNotZero() {
        val r = parseDayReport(json("""{"dialled":3,"connected":0,"talk_seconds":0}"""))!!
        assertNull(r.avgSeconds)
        assertEquals("—", formatTalk(r.avgSeconds))
        assertNull(r.followupsDone)
        assertEquals(0, connectPercent(r))
    }

    @Test fun emptyDay() {
        val r = parseDayReport(json("""{"dialled":0,"connected":0,"talk_seconds":0}"""))!!
        assertNull(connectPercent(r))
        assertEquals(0, r.notConnected)
    }

    @Test fun missingCountsIsNull() {
        assertNull(parseDayReport(null))
        assertNull(parseDayReport(json("""{"connected":2}""")))
        assertNull(parseDayReport(json("""{"dialled":null,"connected":2}""")))
    }

    @Test fun connectedNeverExceedsDialled() {
        val r = parseDayReport(json("""{"dialled":2,"connected":5,"talk_seconds":-4}"""))!!
        assertEquals(2, r.connected)
        assertEquals(0, r.notConnected)
        assertEquals(0, r.talkSeconds)
    }

    @Test fun talkFormat() {
        assertEquals("0s", formatTalk(0))
        assertEquals("45s", formatTalk(45))
        assertEquals("4m 05s", formatTalk(245))
        assertEquals("1h 02m", formatTalk(3725))
    }

    @Test fun stageCountsDistinctOrderedAndNothingDropped() {
        fun call(id: String?) = CallLog(companyId = "c", salespersonId = "u", contactId = id, phone = "1")
        val calls = listOf(call("a"), call("a"), call("b"), call("c"), call("x"), call(null), call(""))
        val leads = mapOf(
            "a" to Contact(id = "a", companyId = "c", phone = "1", stage = "interested"),
            "b" to Contact(id = "b", companyId = "c", phone = "2", stage = "new"),
            "c" to Contact(id = "c", companyId = "c", phone = "3", stage = "mystery"),
        )
        val stages = listOf(
            LeadStage(code = "interested", label = "Interested", color = "#007AFF", sortOrder = 2),
            LeadStage(code = "new", label = "New", color = "#8E8E93", sortOrder = 1),
        )
        val out = leadStatusCounts(calls, leads, stages)
        assertEquals(listOf("New", "Interested", "Mystery", "Not in your list"), out.map { it.label })
        assertEquals(listOf(1, 1, 1, 1), out.map { it.count })
    }
}
