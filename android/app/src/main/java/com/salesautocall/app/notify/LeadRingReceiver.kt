package com.salesautocall.app.notify

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.salesautocall.app.MainActivity
import com.salesautocall.app.R

/**
 * Watches the SIM line for INBOUND calls from leads. Three moments, all
 * plain notifications (never a window overlay, so nothing can lag):
 *
 *  1. RINGING  → heads-up "Ramesh Kumar · Hot · last: price pe atka tha"
 *                so the rep answers with the lead's name, not "hello, kaun?"
 *  2. MISSED   → loud "Call back now" with a one-tap dial action.
 *  3. ANSWERED → after hang-up, "kya baat hui?" that opens the lead so the
 *                conversation gets logged instead of dying.
 *
 * Outbound calls never pass through RINGING, so the auto-dialer flows are
 * untouched. Numbers that aren't leads are ignored completely — personal
 * calls stay personal.
 */
class LeadRingReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        // Delivered only when READ_CALL_LOG is granted; the system also fires a
        // second copy of each broadcast without the number — we keep the first
        // non-blank one we see for the ringing episode.
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                if (!number.isNullOrBlank() && number != ringingNumber) {
                    ringingNumber = number
                    answered = false
                    val hit = LeadRing.lookup(context, number) ?: return
                    notify(context, RING_ID, ringNotification(context, hit, number))
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (ringingNumber != null) {
                    answered = true
                    NotificationManagerCompat.from(context).cancel(RING_ID)
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                val num = ringingNumber ?: return
                val wasAnswered = answered
                ringingNumber = null
                answered = false
                NotificationManagerCompat.from(context).cancel(RING_ID)
                val hit = LeadRing.lookup(context, num) ?: return
                // A lead's inbound call just ended on this phone — pull it into
                // the CRM NOW (log within seconds, recording ~2 min later once
                // the phone's recorder finishes writing the file) instead of
                // waiting for the hourly sync. The admin sees the call, its
                // recording and the AI summary almost live.
                scheduleImmediateSync(context)
                if (wasAnswered) {
                    notify(context, LOG_ID, logNotification(context, hit))
                } else {
                    notify(context, MISSED_ID, missedNotification(context, hit, num))
                }
            }
        }
    }

    // ---------- notifications ----------

    private fun openLeadPi(context: Context, contactId: String, req: Int): PendingIntent =
        PendingIntent.getActivity(
            context, req,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("open_contact_id", contactId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun who(hit: LeadRing.Hit): String {
        val flame = when (hit.temperature?.lowercase()) {
            "hot" -> " 🔥"
            "warm" -> " ☀️"
            else -> ""
        }
        return hit.name + flame
    }

    private fun subtitle(hit: LeadRing.Hit): String = buildString {
        hit.status?.takeIf { it.isNotBlank() }?.let { append(it.replace('_', ' ')) }
        hit.hint?.let {
            if (isNotEmpty()) append(" · ")
            append(it)
        }
        if (isEmpty()) append("Your lead is calling")
    }

    private fun ringNotification(context: Context, hit: LeadRing.Hit, number: String) =
        NotificationCompat.Builder(context, LeadRing.CHANNEL_RING)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("📞 ${who(hit)} is calling")
            .setContentText(subtitle(hit))
            .setStyle(NotificationCompat.BigTextStyle().bigText(subtitle(hit)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            // The phone is already ringing out loud — stay silent, just be seen.
            .setSilent(true)
            .setAutoCancel(true)
            .setTimeoutAfter(60_000L)
            .setContentIntent(openLeadPi(context, hit.contactId, number.hashCode()))
            .build()

    private fun missedNotification(context: Context, hit: LeadRing.Hit, number: String) =
        NotificationCompat.Builder(context, LeadRing.CHANNEL_MISSED)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Missed: ${who(hit)} called YOU")
            .setContentText("They dialled you themselves — call back while it's hot.")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "${hit.name} just tried to reach you. A lead who calls back is the hottest lead you have — return the call now.",
            ))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setAutoCancel(true)
            .setContentIntent(openLeadPi(context, hit.contactId, number.hashCode()))
            .addAction(
                R.drawable.ic_launcher_foreground, "Call back",
                PendingIntent.getActivity(
                    context, number.hashCode() + 1,
                    Intent(Intent.ACTION_CALL, Uri.parse("tel:$number")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            .build()

    private fun logNotification(context: Context, hit: LeadRing.Hit) =
        NotificationCompat.Builder(context, LeadRing.CHANNEL_RING)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Talked to ${hit.name} — what happened?")
            .setContentText("Tap to log the outcome so nothing is forgotten.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setSilent(true)
            .setAutoCancel(true)
            .setTimeoutAfter(30 * 60_000L)
            .setContentIntent(openLeadPi(context, hit.contactId, hit.contactId.hashCode()))
            .build()

    private fun notify(context: Context, id: Int, n: android.app.Notification) {
        val nm = NotificationManagerCompat.from(context)
        if (nm.areNotificationsEnabled()) runCatching { nm.notify(id, n) }
    }

    /** One-shot call-log sync right away + a recording harvest ~2 minutes later
     *  (the phone's recorder needs a moment to close the file). Unique names
     *  coalesce bursts, e.g. a missed call followed by an instant retry. */
    private fun scheduleImmediateSync(context: Context) = runCatching {
        val net = androidx.work.Constraints.Builder()
            .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build()
        val wm = androidx.work.WorkManager.getInstance(context)
        wm.enqueueUniqueWork(
            "lead_call_ended_log",
            androidx.work.ExistingWorkPolicy.REPLACE,
            androidx.work.OneTimeWorkRequestBuilder<com.salesautocall.app.data.CallLogSyncWorker>()
                .setConstraints(net).build(),
        )
        wm.enqueueUniqueWork(
            "lead_call_ended_recording",
            androidx.work.ExistingWorkPolicy.REPLACE,
            androidx.work.OneTimeWorkRequestBuilder<com.salesautocall.app.data.RecordingSyncWorker>()
                .setConstraints(net)
                .setInputData(
                    androidx.work.Data.Builder()
                        .putBoolean(com.salesautocall.app.data.RecordingSyncWorker.KEY_FORCE, true).build(),
                )
                .setInitialDelay(2, java.util.concurrent.TimeUnit.MINUTES).build(),
        )
    }

    companion object {
        private const val RING_ID = 4101
        private const val MISSED_ID = 4102
        private const val LOG_ID = 4103

        // One ringing episode at a time; broadcasts arrive on the main thread
        // so plain vars are safe.
        private var ringingNumber: String? = null
        private var answered = false
    }
}
