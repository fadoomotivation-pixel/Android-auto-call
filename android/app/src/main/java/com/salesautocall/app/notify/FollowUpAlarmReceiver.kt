package com.salesautocall.app.notify

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.salesautocall.app.MainActivity
import com.salesautocall.app.R

/**
 * Fired by AlarmManager when a scheduled follow-up is due. Posts a heads-up
 * notification with a one-tap "Call" action so the telecaller never misses a
 * callback. Tapping the body opens the app on the Follow-ups worklist.
 */
class FollowUpAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val name = intent.getStringExtra(FollowUpReminder.EXTRA_NAME)
        val phone = intent.getStringExtra(FollowUpReminder.EXTRA_PHONE) ?: return
        val note = intent.getStringExtra(FollowUpReminder.EXTRA_NOTE)
        val who = name?.takeIf { it.isNotBlank() } ?: phone

        // Tap body → open the app.
        val openPi = PendingIntent.getActivity(
            context, phone.hashCode(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // Call action → dial straight from the notification.
        val callPi = PendingIntent.getActivity(
            context, phone.hashCode() + 1,
            Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, FollowUpReminder.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Follow-up due: $who")
            .setContentText(note?.takeIf { it.isNotBlank() } ?: "Time to call $phone")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                buildString {
                    append("Time to call $who ($phone).")
                    note?.takeIf { it.isNotBlank() }?.let { append("\n📝 "); append(it) }
                },
            ))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(R.drawable.ic_launcher_foreground, "Call", callPi)
            .build()

        val nm = NotificationManagerCompat.from(context)
        if (nm.areNotificationsEnabled()) {
            nm.notify(phone.hashCode(), notification)
        }
    }
}
