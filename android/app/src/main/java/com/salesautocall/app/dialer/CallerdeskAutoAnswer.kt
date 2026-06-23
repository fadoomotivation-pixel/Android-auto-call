package com.salesautocall.app.dialer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat

/**
 * One-tap CallerDesk calling. When the app places a cloud call, CallerDesk rings
 * the telecaller's own phone (the "agent leg") a couple of seconds later and only
 * bridges the customer once they answer — two actions for one call, and the
 * incoming-call notification can lag.
 *
 * [arm] is called the instant the call is placed: it registers a call-state
 * listener and, when the phone rings within a short window, answers it
 * automatically (`TelecomManager.acceptRingingCall`, needs ANSWER_PHONE_CALLS).
 * The rep taps Call once and is connected, hands-free.
 *
 * Lightweight on purpose — no foreground service (Android 14 restricts the
 * `phoneCall` FGS type before a call exists). The app is in the foreground on the
 * call screen during the window, so the process stays alive. Degrades gracefully:
 * if the permission isn't granted, nothing is auto-answered and the rep picks up
 * by hand as before.
 */
object CallerdeskAutoAnswer {

    private const val WINDOW_MS = 35_000L

    private var tm: TelephonyManager? = null
    private var callback: TelephonyCallback? = null
    private var legacy: PhoneStateListener? = null
    private var armedUntil = 0L
    private var answered = false

    @Synchronized
    fun arm(context: Context) {
        val app = context.applicationContext
        if (ActivityCompat.checkSelfPermission(app, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) return

        armedUntil = System.currentTimeMillis() + WINDOW_MS
        answered = false
        if (callback != null || legacy != null) return // already listening — just extended the window

        val manager = app.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        tm = manager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) = onState(app, state)
            }
            callback = cb
            runCatching { manager.registerTelephonyCallback(app.mainExecutor, cb) }
        } else {
            @Suppress("DEPRECATION")
            val l = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) = onState(app, state)
            }
            legacy = l
            @Suppress("DEPRECATION")
            runCatching { manager.listen(l, PhoneStateListener.LISTEN_CALL_STATE) }
        }

        // Safety: always stop listening a little after the window closes.
        Handler(Looper.getMainLooper()).postDelayed({ disarm() }, WINDOW_MS + 2_000)
    }

    private fun onState(ctx: Context, state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                if (!answered && System.currentTimeMillis() < armedUntil) {
                    answered = true
                    acceptRingingCall(ctx)
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> if (answered) disarm()
        }
    }

    private fun acceptRingingCall(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ANSWER_PHONE_CALLS)
            != PackageManager.PERMISSION_GRANTED
        ) return // permission not granted → rep answers manually
        runCatching {
            (ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).acceptRingingCall()
        }
    }

    @Synchronized
    private fun disarm() {
        val manager = tm
        if (manager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                callback?.let { runCatching { manager.unregisterTelephonyCallback(it) } }
            } else {
                @Suppress("DEPRECATION")
                legacy?.let { runCatching { manager.listen(it, PhoneStateListener.LISTEN_NONE) } }
            }
        }
        callback = null
        legacy = null
        armedUntil = 0L
    }
}
