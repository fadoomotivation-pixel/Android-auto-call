package com.salesautocall.app.dialer

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

/**
 * Disabled call overlay.
 *
 * We used to draw the in-app call cockpit in a SYSTEM_ALERT_WINDOW that floated
 * over the phone's own in-call screen (Truecaller/oDialer style). It caused
 * noticeable lag and — now that recordings are harvested from the dialer's own
 * folder — served no real purpose. The phone's native in-call screen simply
 * stays in front, and the CRM is used before/after the call.
 *
 * The object is kept (as a no-op) so existing callers don't need to change.
 */
object CallOverlay {

    /** No longer used for gating UI; kept for compatibility. */
    fun canDraw(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    /** Intent that opens this app's "Display over other apps" settings page. */
    fun permissionIntent(context: Context): Intent =
        Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:${context.packageName}"),
        )

    /** No-op: the over-the-dialer overlay is intentionally not shown anymore. */
    fun init(context: Context) {
        // intentionally empty
    }
}
