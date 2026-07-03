package com.salesautocall.app.incall

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.TelecomManager

/**
 * Helpers around the "default phone app" (ROLE_DIALER) status.
 *
 * When this app holds the dialer role, SIM calls placed with
 * [TelecomManager.placeCall] are delivered to our [CrmInCallService] and the
 * whole call runs inside the CRM — no jump to the system dialer — and Android
 * permits the app to capture call audio, which is what makes SIM recording
 * work reliably on Android 10+.
 */
object DefaultDialer {

    fun isDefault(context: Context): Boolean {
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        return telecom.defaultDialerPackage == context.packageName
    }

    /** Intent that asks the user to make this app the default phone app (null if unsupported). */
    fun requestIntent(context: Context): Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roles = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
        if (roles.isRoleAvailable(RoleManager.ROLE_DIALER) && !roles.isRoleHeld(RoleManager.ROLE_DIALER)) {
            roles.createRequestRoleIntent(RoleManager.ROLE_DIALER)
        } else null
    } else {
        Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
            .putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, context.packageName)
    }
}
