package com.salesautocall.app.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Schedules an on-device reminder that fires when a follow-up callback is due.
 * Uses an exact alarm where allowed (Android 12+ may withhold the privilege),
 * and transparently falls back to an inexact wake-up so the telecaller is still
 * nudged. Everything is local — no push infrastructure needed.
 */
object FollowUpReminder {

    const val CHANNEL_ID = "follow_up_reminders"
    const val ACTION_FIRE = "com.salesautocall.app.FOLLOW_UP_DUE"
    const val EXTRA_NAME = "name"
    const val EXTRA_PHONE = "phone"
    const val EXTRA_NOTE = "note"

    /** @param dueAtMillis epoch-millis when the callback is due. Past times are ignored. */
    fun schedule(context: Context, id: String, name: String?, phone: String, note: String?, dueAtMillis: Long) {
        if (dueAtMillis <= System.currentTimeMillis()) return
        val am = context.getSystemService(AlarmManager::class.java) ?: return

        val intent = Intent(context, FollowUpAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(EXTRA_NAME, name)
            putExtra(EXTRA_PHONE, phone)
            putExtra(EXTRA_NOTE, note)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        runCatching {
            if (canExact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAtMillis, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAtMillis, pi)
            }
        }.onFailure {
            // Exact alarm denied at runtime — degrade to an inexact wake-up.
            runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAtMillis, pi) }
        }
    }
}
