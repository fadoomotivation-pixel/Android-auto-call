package com.salesautocall.app.dialer

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import androidx.core.app.ActivityCompat
import com.salesautocall.app.incall.DefaultDialer
import com.salesautocall.app.incall.ServiceManagedCalls

/**
 * Single entry point for placing SIM calls.
 *
 * When the app is the default phone app the call is placed with
 * [TelecomManager.placeCall] and handled entirely by our own in-call screen —
 * the telecaller never leaves the CRM. Otherwise it falls back to the classic
 * ACTION_CALL intent through the system dialer.
 */
object CallRouter {

    /**
     * Places a call. [serviceManaged] marks calls that AutoDialerService /
     * ManualCallService already record + log, so the in-call session doesn't
     * duplicate that work.
     */
    fun place(context: Context, phone: String, simSlot: Int? = null, serviceManaged: Boolean = true): Boolean {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        if (serviceManaged) ServiceManagedCalls.expect(phone)

        val uri = Uri.fromParts("tel", phone, null)
        if (DefaultDialer.isDefault(context)) {
            val ok = runCatching {
                val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                val extras = Bundle()
                phoneAccountForSlot(context, simSlot)?.let {
                    extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
                }
                telecom.placeCall(uri, extras)
            }.isSuccess
            if (ok) return true
        }
        return placeViaIntent(context, phone, simSlot)
    }

    private fun placeViaIntent(context: Context, phone: String, simSlot: Int?): Boolean = try {
        fun buildIntent(withPackage: Boolean) = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            phoneAccountForSlot(context, simSlot)?.let {
                putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
            }
            // Force the device's default phone app so a SIP app (e.g. ZoiPer) can't
            // intercept the SIM call with an "Open with" chooser.
            if (withPackage) systemDialerPackage(context)?.let { pkg -> setPackage(pkg) }
        }
        try {
            context.startActivity(buildIntent(true))
        } catch (_: android.content.ActivityNotFoundException) {
            context.startActivity(buildIntent(false))
        }
        true
    } catch (e: SecurityException) {
        false
    }

    private fun systemDialerPackage(context: Context): String? = runCatching {
        (context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage
    }.getOrNull()

    /** Resolves the PhoneAccountHandle for a dual-SIM slot (0/1); null = system default SIM. */
    fun phoneAccountForSlot(context: Context, simSlot: Int?): PhoneAccountHandle? {
        if (simSlot == null) return null
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) return null
        return try {
            val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val subs = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val info = subs.activeSubscriptionInfoList?.firstOrNull { it.simSlotIndex == simSlot }
                ?: return null
            telecom.callCapablePhoneAccounts.firstOrNull { handle ->
                handle.id.contains(info.subscriptionId.toString())
            }
        } catch (e: SecurityException) {
            null
        }
    }
}
