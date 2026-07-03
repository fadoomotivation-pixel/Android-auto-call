package com.salesautocall.app.incall

import android.app.PendingIntent
import android.content.Intent
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.salesautocall.app.SalesAutoCallApp

/**
 * Receives every SIM call while this app is the default phone app and hands it
 * to [InCallSession], which drives the Compose in-call screen. This is what
 * keeps the telecaller inside the CRM for the whole call instead of bouncing
 * out to the system dialer.
 */
class CrmInCallService : InCallService() {

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        InCallSession.bind(this, call)
        startActivity(
            Intent(this, InCallActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        postOngoingNotification(call)
    }

    override fun onCallRemoved(call: Call) {
        NotificationManagerCompat.from(this).cancel(NOTIF_ID)
        InCallSession.unbind(call)
        super.onCallRemoved(call)
    }

    override fun onCallAudioStateChanged(audioState: CallAudioState) {
        super.onCallAudioStateChanged(audioState)
        InCallSession.onAudioState(audioState)
    }

    override fun onDestroy() {
        NotificationManagerCompat.from(this).cancel(NOTIF_ID)
        InCallSession.serviceDestroyed(this)
        super.onDestroy()
    }

    /** Tap-to-return notification so leaving the call screen never loses the call. */
    private fun postOngoingNotification(call: Call) {
        val phone = call.details?.handle?.schemeSpecificPart ?: "call"
        val tap = PendingIntent.getActivity(
            this, 0,
            Intent(this, InCallActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(this, SalesAutoCallApp.DIALER_CHANNEL_ID)
            .setContentTitle("Call in progress")
            .setContentText(phone)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setOngoing(true)
            .setContentIntent(tap)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(NOTIF_ID, n) }
    }

    private companion object {
        const val NOTIF_ID = 4747
    }
}
