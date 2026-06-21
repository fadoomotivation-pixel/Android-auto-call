package com.salesautocall.app.sip

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import com.salesautocall.app.data.AppPrefs

/**
 * Opens the OEM "Autostart" / "background start" screen on phones that aggressively
 * kill background apps (Xiaomi/MIUI, Oppo/Realme/ColorOS, Vivo/Funtouch, Huawei,
 * Letv, Honor). Without Autostart enabled there, NO app — ours, WhatsApp, Zoiper —
 * can reliably receive a call after being swiped away or for a while in the
 * background; this is an OS policy we can only point the user at, not override.
 *
 * Shown once (per install) when the rep turns on incoming calls. Best-effort: if a
 * vendor screen isn't found, falls back to this app's details page.
 */
object OemAutostart {

    // Known vendor Autostart activities (component names are stable across versions).
    private val INTENTS = listOf(
        "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
        "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
        "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
        "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
        "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
    )

    /** Opens the vendor Autostart screen the first time only. */
    fun openIfNeeded(context: Context) {
        if (AppPrefs.getAutostartPrompted(context)) return
        AppPrefs.setAutostartPrompted(context, true)
        open(context)
    }

    /** Opens the vendor Autostart screen (or app details as a fallback). */
    fun open(context: Context) {
        for ((pkg, cls) in INTENTS) {
            val intent = Intent().apply {
                component = ComponentName(pkg, cls)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (context.packageManager.resolveActivity(intent, 0) != null) {
                if (runCatching { context.startActivity(intent) }.isSuccess) {
                    toast(context, "Enable Autostart for this app so calls keep coming in the background.")
                    return
                }
            }
        }
        // No vendor screen (e.g. Pixel) → app details, where battery/background live.
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    private fun toast(context: Context, msg: String) =
        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
}
