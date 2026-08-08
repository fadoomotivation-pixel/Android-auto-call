package com.salesautocall.app.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.PowerManager
import android.provider.CallLog as AndroidCallLog
import androidx.core.content.ContextCompat

/**
 * "Is my phone actually set up?" — answered on the phone, in one screen.
 *
 * Every one of this week's reports came back to the same three settings, and
 * nobody could see them. Shweta's sync had been dead five days; Ankita's
 * background worker last ran on 5 Aug and then not again for three; vishesh and
 * sneha had had call-log permission off since 20 July. In every case the CRM
 * knew and the REP did not, because the only place it showed was an admin page
 * they never open.
 *
 * The setup gate asks these questions at install. This answers them any time —
 * so a rep on the phone to their founder can look, and so "sab on hai na?" has
 * an answer that is not a guess.
 *
 * THE PROBE IS THE POINT. checkSelfPermission() returns GRANTED on OEM builds
 * that then hand back nothing, so a permission flag is not proof the call log is
 * readable. readableCalls() opens the actual cursor the sync worker opens and
 * counts what comes out — the same query, so it cannot disagree with it.
 */
object PhoneCheck {

    /** null = the OS refused the cursor outright; otherwise rows in last 7 days. */
    fun readableCalls(context: Context): Int? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) return null
        val since = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
        return runCatching {
            context.contentResolver.query(
                AndroidCallLog.Calls.CONTENT_URI,
                arrayOf(AndroidCallLog.Calls.DATE),
                "${AndroidCallLog.Calls.DATE} > ?",
                arrayOf(since.toString()),
                null,
            )?.use { it.count }
        }.getOrNull()
    }

    fun callLogGranted(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED

    fun micGranted(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    fun batteryExempt(context: Context): Boolean =
        (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
            .isIgnoringBatteryOptimizations(context.packageName)

    /** Only meaningful on phones that HAVE an Autostart screen — see OemAutostart. */
    fun autostartConfirmed(context: Context): Boolean = AppPrefs.getAutostartConfirmed(context)

    /**
     * One line for the whole phone, in the words a rep would use.
     *
     * Deliberately blunt about the worst case: a phone that cannot read its call
     * log is not "mostly fine", it is invisible to the office, and the rep should
     * see that in red before they spend a day calling into it.
     */
    fun verdict(context: Context): Pair<Boolean, String> {
        val calls = readableCalls(context)
        return when {
            !callLogGranted(context) ->
                false to "Your calls are NOT reaching the office. Call log permission is off."
            calls == null ->
                false to "Your phone is blocking the call log even though permission looks on. Tap Fix."
            !batteryExempt(context) ->
                false to "Your phone puts the app to sleep, so calls reach the office late or not at all."
            else -> true to "All good — your calls are reaching the office."
        }
    }
}
