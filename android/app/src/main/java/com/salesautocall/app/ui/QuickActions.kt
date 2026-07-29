package com.salesautocall.app.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.core.content.ContextCompat

/** One-tap shortcuts used by the telecaller call list / follow-up rows. */
object QuickActions {

    /**
     * Places a direct SIM call when we hold CALL_PHONE — through
     * [com.salesautocall.app.dialer.ManualCallService] so the call is logged,
     * recorded (best-effort) and shows the in-app call screen. Without the
     * permission it falls back to opening the dialer pre-filled.
     */
    fun call(context: Context, phone: String) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) {
            runCatching {
                com.salesautocall.app.dialer.ManualCallService.dial(context, phone, null, null, record = true)
            }.onFailure { toast(context, "Couldn't start call") }
            return
        }
        runCatching {
            context.startActivity(
                Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { toast(context, "Couldn't start call") }
    }

    /** Opens a WhatsApp chat with the number, in whichever WhatsApp the rep chose. */
    fun whatsApp(context: Context, phone: String) {
        if (!com.salesautocall.app.data.WhatsAppLauncher.open(context, phone)) {
            toast(context, "WhatsApp not available")
        }
    }

    /** Opens a WhatsApp chat with the number, pre-filling [text] (e.g. a content link). */
    fun whatsAppText(context: Context, phone: String, text: String) {
        if (!com.salesautocall.app.data.WhatsAppLauncher.open(context, phone, text)) {
            toast(context, "WhatsApp not available")
        }
    }

    fun copy(context: Context, phone: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("phone", phone))
        toast(context, "Number copied")
    }

    private fun toast(context: Context, msg: String) =
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
}
