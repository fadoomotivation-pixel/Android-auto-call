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
        notify(this, title, body, data["contact_id"], data["channel"] ?: CHANNEL_ID, data["open_tab"])
    }

    companion object {
        const val CHANNEL_ID = "hot_leads"
        const val ASSIGN_CHANNEL_ID = "lead_assignments"
        const val FOLLOWUP_CHANNEL_ID = "followups"
        const val AGENDA_CHANNEL_ID = "agenda"
        const val QUOTES_CHANNEL_ID = "quotes"

        private val KNOWN_CHANNELS =
            setOf(CHANNEL_ID, ASSIGN_CHANNEL_ID, FOLLOWUP_CHANNEL_ID, AGENDA_CHANNEL_ID, QUOTES_CHANNEL_ID)

        /** Small professional chime bundled in res/raw, as a channel sound URI. */
        private fun soundUri(context: Context, resId: Int): android.net.Uri =
            android.net.Uri.parse("android.resource://${context.packageName}/$resId")

        /** Creates every push channel — each with its own small, professional
         *  sound — so background notifications ring on the channel the server names. */
        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(NotificationManager::class.java)
                val audio = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()

                fun create(id: String, name: String, desc: String, soundRes: Int?, importance: Int) {
                    if (nm.getNotificationChannel(id) != null) return
                    nm.createNotificationChannel(
                        NotificationChannel(id, name, importance).apply {
                            description = desc
                            if (soundRes != null) setSound(soundUri(context, soundRes), audio)
                        },
                    )
                }
                create(CHANNEL_ID, "Hot leads", "Instant alerts when a new lead needs a call", null, NotificationManager.IMPORTANCE_HIGH)
                create(
                    ASSIGN_CHANNEL_ID, "Lead assignments", "When new leads are assigned to you",
                    R.raw.chime_followup, NotificationManager.IMPORTANCE_HIGH,
                )
                create(
                    FOLLOWUP_CHANNEL_ID, "Follow-up & visit reminders",
                    "Callback times, site-visit reminders and forgotten-lead nudges",
                    R.raw.chime_followup, NotificationManager.IMPORTANCE_HIGH,
                )
                create(
                    AGENDA_CHANNEL_ID, "Daily agenda", "Aaj ka plan — your 9:30 AM morning brief",
                    R.raw.chime_agenda, NotificationManager.IMPORTANCE_HIGH,
                )
                create(
                    QUOTES_CHANNEL_ID, "Motivation", "Aaj ka funda — quick sales tips",
                    R.raw.chime_quote, NotificationManager.IMPORTANCE_DEFAULT,
                )
            }
        }

        fun notify(context: Context, title: String, body: String, contactId: String?, channelId: String = CHANNEL_ID, openTab: String? = null) {
            ensureChannel(context)
            // Only ring on a known channel; fall back to hot_leads otherwise.
            val ch = if (channelId in KNOWN_CHANNELS) channelId else CHANNEL_ID
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (contactId != null) putExtra("open_contact_id", contactId)
                // Server pushes can deep-link a tab (Morning Brief → Leads).
                if (openTab != null) putExtra("open_tab", openTab)
            }
            val pi = PendingIntent.getActivity(
                context, (contactId ?: openTab ?: ch).hashCode(), intent,
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
