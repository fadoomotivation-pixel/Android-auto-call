package com.salesautocall.app.data

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * The one place a WhatsApp chat is opened from.
 *
 * Reps don't all run the same WhatsApp: some have the plain one, some have
 * Business, and plenty have both on the same work phone. With both installed
 * Android asks which to use on EVERY message — a tap on every single lead, all
 * day — and a rep who once ticked "always" is stuck sending from the wrong
 * account with no way back.
 *
 * So the choice belongs to the rep and is remembered: plain, Business, or ask
 * each time. Only apps actually on the phone are ever offered, and a preference
 * pointing at an app that has since been uninstalled quietly falls back to the
 * chooser instead of failing.
 */
object WhatsAppLauncher {

    const val PKG_NORMAL = "com.whatsapp"
    const val PKG_BUSINESS = "com.whatsapp.w4b"

    data class Option(val pkg: String, val label: String)

    /** WhatsApp apps present on this phone, in the order we offer them. */
    fun installed(context: Context): List<Option> {
        val pm = context.packageManager
        fun has(p: String) = runCatching { pm.getPackageInfo(p, 0); true }.getOrDefault(false)
        return buildList {
            if (has(PKG_NORMAL)) add(Option(PKG_NORMAL, "WhatsApp"))
            if (has(PKG_BUSINESS)) add(Option(PKG_BUSINESS, "WhatsApp Business"))
        }
    }

    /** The package a message will go to right now, or null to let Android ask. */
    fun preferred(context: Context): String? {
        val saved = AppPrefs.getWhatsAppPkg(context)
        val here = installed(context)
        // Only one installed → no question to ask.
        if (here.size == 1) return here.first().pkg
        // Saved choice, but only while that app is still on the phone.
        return saved.takeIf { it.isNotBlank() && here.any { o -> o.pkg == it } }
    }

    /**
     * Opens a chat with [phone], optionally pre-filling [text]. A bare 10-digit
     * Indian number is given its country code — wa.me silently fails without one.
     */
    fun open(context: Context, phone: String, text: String? = null): Boolean {
        val digits = phone.filter { it.isDigit() }.let { if (it.length == 10) "91$it" else it }
        if (digits.isEmpty()) return false
        val url = buildString {
            append("https://wa.me/").append(digits)
            if (!text.isNullOrBlank()) append("?text=").append(Uri.encode(text))
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        preferred(context)?.let { intent.setPackage(it) }
        if (runCatching { context.startActivity(intent); true }.getOrDefault(false)) return true
        // Pinned app refused the intent — never leave the rep stuck, retry open.
        val open = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { context.startActivity(open); true }.getOrDefault(false)
    }
}
