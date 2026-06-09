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
