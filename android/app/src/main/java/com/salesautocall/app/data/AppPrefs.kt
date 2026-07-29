package com.salesautocall.app.data

import android.content.Context

/** Small persisted settings store (currently just the break time between calls). */
object AppPrefs {
    private const val FILE = "salesautocall_prefs"
    private const val KEY_BREAK = "break_seconds"
    private const val KEY_EMAIL = "last_email"
    private const val KEY_CRASH = "last_crash"
    private const val KEY_REVIEW = "review_after_call"
    private const val KEY_GOAL = "daily_goal"
    private const val KEY_CLOUD = "cloud_enabled"
    private const val KEY_INCOMING = "cloud_incoming_enabled"
    private const val KEY_AGENT = "cloud_agent_id"
    private const val KEY_CALLERID = "cloud_caller_id"

    fun getCloudEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_CLOUD, false)
    fun setCloudEnabled(context: Context, v: Boolean) = prefs(context).edit().putBoolean(KEY_CLOUD, v).apply()
    
    fun getIncomingEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_INCOMING, false)
    fun setIncomingEnabled(context: Context, v: Boolean) = prefs(context).edit().putBoolean(KEY_INCOMING, v).apply()

    /**
     * Which WhatsApp a message opens in. Some reps run plain WhatsApp, some the
     * Business one, some both — and on a two-app phone Android otherwise asks
     * every single time, which is a tap on every message all day. "" = ask each
     * time (the system chooser), otherwise the chosen package.
     */
    fun getWhatsAppPkg(context: Context): String = prefs(context).getString("whatsapp_pkg", "") ?: ""
    fun setWhatsAppPkg(context: Context, pkg: String) = prefs(context).edit().putString("whatsapp_pkg", pkg).apply()

    /** Whether we've already sent the rep to the OEM Autostart screen once. */
    fun getAutostartPrompted(context: Context): Boolean = prefs(context).getBoolean("autostart_prompted", false)
    fun setAutostartPrompted(context: Context, v: Boolean) = prefs(context).edit().putBoolean("autostart_prompted", v).apply()

    /** The floating AI Coach shrinks to a mini dot for ONE day only — it never
     *  disappears (still one tap away), and returns to full size tomorrow. */
    fun getCoachMiniDate(context: Context): String = prefs(context).getString("coach_hidden_date", "") ?: ""
    fun setCoachMiniDate(context: Context, isoDate: String) = prefs(context).edit().putString("coach_hidden_date", isoDate).apply()
    fun clearCoachMini(context: Context) = prefs(context).edit().remove("coach_hidden_date").apply()
    
    fun getAgentId(context: Context): String = prefs(context).getString(KEY_AGENT, "") ?: ""
    fun setAgentId(context: Context, v: String) = prefs(context).edit().putString(KEY_AGENT, v.trim()).apply()
    fun getCallerId(context: Context): String = prefs(context).getString(KEY_CALLERID, "") ?: ""
    fun setCallerId(context: Context, v: String) = prefs(context).edit().putString(KEY_CALLERID, v.trim()).apply()
    fun getSipPassword(context: Context): String = prefs(context).getString("cloud_sip_password", "") ?: ""
    fun setSipPassword(context: Context, v: String) = prefs(context).edit().putString("cloud_sip_password", v.trim()).apply()

    // Optional manual SIP server override (e.g. a private IP reached over VPN, like
    // the 10.10.10.3:5060 that Zoiper uses). Blank => use the value uroperator returns.
    fun getSipServer(context: Context): String = prefs(context).getString("cloud_sip_server", "") ?: ""
    fun setSipServer(context: Context, v: String) = prefs(context).edit().putString("cloud_sip_server", v.trim()).apply()
    fun getSipPort(context: Context): String = prefs(context).getString("cloud_sip_port", "") ?: ""
    fun setSipPort(context: Context, v: String) = prefs(context).edit().putString("cloud_sip_port", v.trim()).apply()

    // CallerDesk one-tap cloud calling. When ON, a cloud call asks the backend to
    // ring this agent's own phone and bridge the customer (click-to-call) — no SIP,
    // no VPN. The call happens on the native dialer and is recorded server-side.
    fun getCallerdeskCalling(context: Context): Boolean = prefs(context).getBoolean("callerdesk_calling", false)
    fun setCallerdeskCalling(context: Context, v: Boolean) = prefs(context).edit().putBoolean("callerdesk_calling", v).apply()

    // Latest FCM device token (re-registered with the backend after login).
    fun getPushToken(context: Context): String = prefs(context).getString("push_token", "") ?: ""
    fun setPushToken(context: Context, v: String) = prefs(context).edit().putString("push_token", v).apply()

    /** ISO timestamp up to which the rep has already seen assigned-lead alerts. */
    fun getAssignSeenAt(context: Context): String = prefs(context).getString("assign_seen_at", "") ?: ""
    fun setAssignSeenAt(context: Context, v: String) = prefs(context).edit().putString("assign_seen_at", v).apply()

    // Phone's native call-recording folder (SAF tree URI). When set, we harvest
    // the OEM's own both-sides recording instead of the mic-only MediaRecorder.
    fun getRecordingFolder(context: Context): String = prefs(context).getString("native_rec_folder", "") ?: ""
    fun setRecordingFolder(context: Context, uri: String) = prefs(context).edit().putString("native_rec_folder", uri).apply()
    fun clearRecordingFolder(context: Context) = prefs(context).edit().remove("native_rec_folder").apply()

    // Auto-answer the CallerDesk agent-leg callback so the rep taps once, not twice.
    // On by default; reps who share their phone can switch it off and pick up by hand.
    fun getAutoAnswer(context: Context): Boolean = prefs(context).getBoolean("callerdesk_autoanswer", true)
    fun setAutoAnswer(context: Context, v: Boolean) = prefs(context).edit().putBoolean("callerdesk_autoanswer", v).apply()

    fun getDailyGoal(context: Context): Int =
        prefs(context).getInt(KEY_GOAL, 50)

    fun setDailyGoal(context: Context, value: Int) =
        prefs(context).edit().putInt(KEY_GOAL, value.coerceIn(10, 500)).apply()

    fun getBreakSeconds(context: Context): Int =
        prefs(context).getInt(KEY_BREAK, 5)

    fun setBreakSeconds(context: Context, value: Int) =
        prefs(context).edit().putInt(KEY_BREAK, value.coerceIn(1, 59)).apply()

    fun getReviewAfterCall(context: Context): Boolean =
        prefs(context).getBoolean(KEY_REVIEW, true)

    fun setReviewAfterCall(context: Context, value: Boolean) =
        prefs(context).edit().putBoolean(KEY_REVIEW, value).apply()

    fun getLastEmail(context: Context): String =
        prefs(context).getString(KEY_EMAIL, "") ?: ""

    fun setLastEmail(context: Context, email: String) =
        prefs(context).edit().putString(KEY_EMAIL, email).apply()

    fun getLastCrash(context: Context): String? =
        prefs(context).getString(KEY_CRASH, null)

    fun setLastCrash(context: Context, text: String) =
        prefs(context).edit().putString(KEY_CRASH, text).apply()

    fun clearLastCrash(context: Context) =
        prefs(context).edit().remove(KEY_CRASH).apply()

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
