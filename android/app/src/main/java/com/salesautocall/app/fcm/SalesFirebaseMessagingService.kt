package com.salesautocall.app.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.salesautocall.app.MainActivity
import com.salesautocall.app.R
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.Repository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Receives Firebase Cloud Messaging pushes (e.g. "new hot lead") and shows a
 * heads-up notification so the rep can call within seconds. Also keeps the
 * device's FCM token registered with the backend so [notify-rep] can target it.
 */
class SalesFirebaseMessagingService : FirebaseMessagingService() {

    /** A fresh token arrives here on install, app-data clear, or rotation. */
    override fun onNewToken(token: String) {
        AppPrefs.setPushToken(this, token)
        // Best-effort immediate registration; if not signed in yet, the app
        // re-registers this saved token after login.
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { Repository.registerDeviceToken(token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = message.notification?.title ?: data["title"] ?: "New lead"
        val body = message.notification?.body ?: data["body"] ?: "Tap to open and call."
        notify(this, title, body, data["contact_id"], data["channel"] ?: CHANNEL_ID)
    }

    companion object {
        const val CHANNEL_ID = "hot_leads"
        const val ASSIGN_CHANNEL_ID = "lead_assignments"

        /** Creates every high-importance push channel (so background system
         *  notifications can ring on the channel the server names). */
        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(NotificationManager::class.java)
                if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                    nm.createNotificationChannel(
                        NotificationChannel(CHANNEL_ID, "Hot leads", NotificationManager.IMPORTANCE_HIGH).apply {
                            description = "Instant alerts when a new lead needs a call"
                        }
                    )
                }
                if (nm.getNotificationChannel(ASSIGN_CHANNEL_ID) == null) {
                    nm.createNotificationChannel(
                        NotificationChannel(ASSIGN_CHANNEL_ID, "Lead assignments", NotificationManager.IMPORTANCE_HIGH).apply {
                            description = "When new leads are assigned to you"
                        }
                    )
                }
            }
        }

        fun notify(context: Context, title: String, body: String, contactId: String?, channelId: String = CHANNEL_ID) {
            ensureChannel(context)
            // Only ring on a known channel; fall back to hot_leads otherwise.
            val ch = if (channelId == ASSIGN_CHANNEL_ID) ASSIGN_CHANNEL_ID else CHANNEL_ID
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (contactId != null) putExtra("open_contact_id", contactId)
            }
            val pi = PendingIntent.getActivity(
                context, contactId?.hashCode() ?: 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            // Auto-Call Intent
            val callIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (contactId != null) putExtra("auto_call_contact_id", contactId)
            }
            val callPi = PendingIntent.getActivity(
                context, (contactId?.hashCode() ?: 0) + 1, callIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val builder = NotificationCompat.Builder(context, ch)
                .setSmallIcon(R.drawable.ic_hot_lead_push)
                .setColor(0xFFEF4444.toInt()) // Red color
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setContentIntent(pi)
            // A direct "Call Now" only makes sense for a single-lead push.
            if (contactId != null) {
                builder.addAction(android.R.drawable.ic_menu_call, "📞 Call Now", callPi)
            }
            context.getSystemService(NotificationManager::class.java)
                .notify((contactId ?: title).hashCode(), builder.build())
        }
    }
}
