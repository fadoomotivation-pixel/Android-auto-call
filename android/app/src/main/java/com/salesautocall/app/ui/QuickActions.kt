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

    /** Places a direct SIM call when we hold CALL_PHONE, else opens the dialer pre-filled. */
    fun call(context: Context, phone: String) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) ==
            PackageManager.PERMISSION_GRANTED
        val action = if (granted) Intent.ACTION_CALL else Intent.ACTION_DIAL
        runCatching {
            context.startActivity(
                Intent(action, Uri.parse("tel:$phone")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { toast(context, "Couldn't start call") }
    }

    /** Opens a WhatsApp chat with the number (digits only, country code kept). */
    fun whatsApp(context: Context, phone: String) {
        val digits = phone.filter { it.isDigit() }
        if (digits.isEmpty()) return
        runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { toast(context, "WhatsApp not available") }
    }

    fun copy(context: Context, phone: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("phone", phone))
        toast(context, "Number copied")
    }

    private fun toast(context: Context, msg: String) =
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
}
