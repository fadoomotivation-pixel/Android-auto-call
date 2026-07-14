package com.salesautocall.app.data

import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog as AndroidCallLog
import androidx.core.content.ContextCompat

/** One entry from the phone's own system call log (every call, in/out/missed —
 *  not just the ones placed through the app). Powers the fast "Phone" recents
 *  tab, so a rep can turn any dialed/received number into a lead in one tap. */
data class DeviceCall(
    val number: String,
    /** "in" | "out" | "missed" */
    val direction: String,
    val timeMillis: Long,
    val durationSec: Int,
) {
    val digits: String get() = number.filter { it.isDigit() }.takeLast(10)
}

/** Reads the device call log via READ_CALL_LOG. Returns newest-first, de-duped
 *  on consecutive same-number rows so a burst of retries reads as one line. */
object DeviceRecents {

    fun read(context: Context, limit: Int = 200): List<DeviceCall> {
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) return emptyList()

        val out = ArrayList<DeviceCall>(limit)
        runCatching {
            context.contentResolver.query(
                AndroidCallLog.Calls.CONTENT_URI,
                arrayOf(
                    AndroidCallLog.Calls.NUMBER,
                    AndroidCallLog.Calls.TYPE,
                    AndroidCallLog.Calls.DATE,
                    AndroidCallLog.Calls.DURATION,
                ),
                null, null,
                "${AndroidCallLog.Calls.DATE} DESC",
            )?.use { c ->
                val numIdx = c.getColumnIndex(AndroidCallLog.Calls.NUMBER)
                val typeIdx = c.getColumnIndex(AndroidCallLog.Calls.TYPE)
                val dateIdx = c.getColumnIndex(AndroidCallLog.Calls.DATE)
                val durIdx = c.getColumnIndex(AndroidCallLog.Calls.DURATION)
                var lastDigits = ""
                // The Phone-tab list keys each row on number+timeMillis, so those
                // pairs MUST be unique or Compose crashes ("key already used").
                // Dual-SIM / VoLTE handsets (common in this market) log a single
                // call twice with the identical number and timestamp, so we drop
                // any exact repeat — not just consecutive ones.
                val seen = HashSet<String>()
                while (c.moveToNext() && out.size < limit) {
                    val num = c.getString(numIdx)?.takeIf { it.isNotBlank() } ?: continue
                    val direction = when (c.getInt(typeIdx)) {
                        AndroidCallLog.Calls.OUTGOING_TYPE -> "out"
                        AndroidCallLog.Calls.MISSED_TYPE, AndroidCallLog.Calls.REJECTED_TYPE -> "missed"
                        else -> "in"
                    }
                    val time = c.getLong(dateIdx)
                    if (!seen.add("$num|$time")) continue // exact duplicate row → skip
                    val d = num.filter { it.isDigit() }.takeLast(10)
                    // Collapse consecutive rows for the same number (retry bursts).
                    if (d == lastDigits) continue
                    lastDigits = d
                    out.add(DeviceCall(num, direction, time, c.getInt(durIdx)))
                }
            }
        }
        return out
    }
}
