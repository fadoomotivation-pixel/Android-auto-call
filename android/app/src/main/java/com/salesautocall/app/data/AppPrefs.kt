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

    /**
     * Whether the Doze-exemption dialog has been thrown at the rep once already.
     *
     * The battery ask lives in PermissionOnboarding, where it has a reason next
     * to it. MainActivity keeps a safety net for installs that predate that
     * screen — but that check runs on EVERY onResume, so without this flag a rep
     * who says no gets the Settings screen shoved in their face every single
     * time they come back to the app. One ask, then the onboarding row (which
     * they can reach any time) is the only place it lives.
     */
    fun getBatteryAsked(context: Context): Boolean = prefs(context).getBoolean("battery_asked", false)
    fun setBatteryAsked(context: Context, v: Boolean) = prefs(context).edit().putBoolean("battery_asked", v).apply()

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

    // ---------- after a SIM call: shake, don't block ----------
    //
    // The disposition sheet is thrown up the moment a call ends. On a cloud call
    // that is instant, because the app is already in front. On a SIM call it is
    // not: the phone's own in-call screen owns the foreground, our app is behind
    // it, and the sheet only lands once Android has finished tearing that screen
    // down and handing focus back. The rep sits looking at their home screen for
    // a couple of seconds and then gets a full-screen modal thrown at them — it
    // reads as the app being slow, and it interrupts whatever they moved on to.
    //
    // Off (the default) the same question is asked quietly instead: the lead's
    // Update button shakes until it is answered. Nothing is lost — the lead
    // still has no outcome and still shows as unanswered everywhere — it just
    // waits for the rep rather than grabbing them.
    fun getPostCallPopup(context: Context): Boolean = prefs(context).getBoolean("post_call_popup", false)
    fun setPostCallPopup(context: Context, v: Boolean) = prefs(context).edit().putBoolean("post_call_popup", v).apply()

    // ---------- the assistant's own questions ----------

    /** Master switch for every assistant prompt (site visit / callback / day review). */
    fun getAssistantOn(context: Context): Boolean = prefs(context).getBoolean("assistant_on", true)
    fun setAssistantOn(context: Context, v: Boolean) = prefs(context).edit().putBoolean("assistant_on", v).apply()

    /**
     * The hour the day review is allowed to appear, 24h local. Default 7pm.
     *
     * A setting rather than a constant because the right hour is a question
     * about how a particular team works, not about the code: a company whose
     * reps stop calling at 6 wants it at 6, and one that runs till 8:30 does
     * not want the day summed up while there are still calls in it. Clamped to
     * the assistant's own working window — a review that fires at 2am is a
     * notification nobody asked for, whatever the setting says.
     */
    fun getDayReviewHour(context: Context): Int =
        prefs(context).getInt("day_review_hour", 19).coerceIn(12, 21)
    fun setDayReviewHour(context: Context, h: Int) =
        prefs(context).edit().putInt("day_review_hour", h.coerceIn(12, 21)).apply()

    /**
     * How many times we have asked this lead's "did they come?" question.
     *
     * The app asks, waits a day, asks once more, and then stops. A third ask
     * teaches the rep that prompts can be ignored, and once they have learned
     * that they ignore the useful ones too. After two the lead shows up in
     * v_pending_site_visit_outcomes with needs_manager set — an unanswered
     * visit stops being a notification and becomes a person's job.
     */
    fun getVisitAsks(context: Context, contactId: String): Int =
        prefs(context).getInt("visit_asks_$contactId", 0)
    fun bumpVisitAsks(context: Context, contactId: String) =
        prefs(context).edit()
            .putInt("visit_asks_$contactId", getVisitAsks(context, contactId) + 1).apply()

    /** Epoch millis of the last prompt shown — enforces the quiet gap between two. */
    fun getPromptLastAt(context: Context): Long = prefs(context).getLong("prompt_last_at", 0L)
    fun setPromptLastAt(context: Context, v: Long) = prefs(context).edit().putLong("prompt_last_at", v).apply()

    /** How many prompts have been shown on [isoDate] — the daily cap. */
    fun getPromptCount(context: Context, isoDate: String): Int =
        if (prefs(context).getString("prompt_day", "") == isoDate) prefs(context).getInt("prompt_day_count", 0) else 0

    fun bumpPromptCount(context: Context, isoDate: String) {
        val next = getPromptCount(context, isoDate) + 1
        prefs(context).edit().putString("prompt_day", isoDate).putInt("prompt_day_count", next).apply()
    }

    /**
     * Targets already asked about — "<kind>:<id>" keys, cleared each new day.
     *
     * The anti-spam rule that matters most. Without it the same unanswered site
     * visit is a fresh question every hour, which is exactly how a helpful app
     * turns into one the rep swipes away on reflex.
     */
    fun getAskedToday(context: Context, isoDate: String): Set<String> =
        if (prefs(context).getString("asked_day", "") == isoDate)
            prefs(context).getStringSet("asked_keys", emptySet()) ?: emptySet()
        else emptySet()

    fun markAsked(context: Context, isoDate: String, key: String) {
        val keys = getAskedToday(context, isoDate).toMutableSet().also { it.add(key) }
        prefs(context).edit().putString("asked_day", isoDate).putStringSet("asked_keys", keys).apply()
    }

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
