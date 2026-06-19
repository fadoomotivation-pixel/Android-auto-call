package com.salesautocall.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import com.salesautocall.app.ui.IncomingCallActivity

/**
 * Shows a reliable, WhatsApp-style ringing incoming-call screen the moment a SIP
 * INVITE arrives — independent of Android's Telecom "calling account" (which must
 * be manually enabled and silently fails otherwise). Uses a high-importance
 * full-screen-intent notification so it rings even when the app is backgrounded or
 * the phone is locked.
 */
object IncomingCallNotifier {
    const val CHANNEL = "incoming_calls"
    const val NOTIF_ID = 7711
    const val EXTRA_NUMBER = "number"
    const val ACTION_ACCEPT = "com.salesautocall.app.INCOMING_ACCEPT"
    const val ACTION_DECLINE = "com.salesautocall.app.INCOMING_DECLINE"

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    fun show(context: Context, number: String) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            val ch = NotificationChannel(CHANNEL, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Ringing for incoming cloud calls"
                setSound(null, null) // we play the ringtone ourselves so we can loop + stop it
                enableVibration(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(ch)
        }

        fun activityPi(action: String?, req: Int): PendingIntent {
            val i = Intent(context, IncomingCallActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(EXTRA_NUMBER, number)
            if (action != null) i.action = action
            var flags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getActivity(context, req, i, flags)
        }

        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle("Incoming call")
            .setContentText(number)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(activityPi(null, 0), true)
            .addAction(android.R.drawable.sym_action_call, "Answer", activityPi(ACTION_ACCEPT, 1))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", activityPi(ACTION_DECLINE, 2))
            .build()
        nm.notify(NOTIF_ID, n)

        startRinging(context)
    }

    fun cancel(context: Context) {
        runCatching { ringtone?.stop() }; ringtone = null
        runCatching { vibrator?.cancel() }; vibrator = null
        context.getSystemService(NotificationManager::class.java)?.cancel(NOTIF_ID)
    }

    private fun startRinging(context: Context) {
        runCatching {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(context, uri)?.apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    isLooping = true
                    audioAttributes = android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                }
                play()
            }
        }
        runCatching {
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            vibrator = v
            val pattern = longArrayOf(0, 800, 800)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION") v?.vibrate(pattern, 0)
            }
        }
    }
}
