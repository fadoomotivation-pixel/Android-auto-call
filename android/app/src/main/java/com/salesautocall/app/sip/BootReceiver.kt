package com.salesautocall.app.sip

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.salesautocall.app.data.AppPrefs

/**
 * Restarts the SIP foreground service after a reboot (or app update) so the
 * telecaller keeps receiving inbound cloud calls without having to re-open the
 * app and re-toggle the "Receive incoming calls" switch.
 *
 * Only starts when the rep has actually opted in (incoming enabled) and has SIP
 * credentials saved — otherwise there's nothing to register.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            action != "android.intent.action.MY_PACKAGE_REPLACED"
        ) return

        if (!AppPrefs.getIncomingEnabled(context)) return
        if (AppPrefs.getAgentId(context).isBlank() || AppPrefs.getSipPassword(context).isBlank()) return

        SipBackgroundService.start(context)
        SipWatchdogWorker.schedule(context)
    }
}
