package com.salesautocall.app.data

import android.content.Context

/** Small persisted settings store (currently just the break time between calls). */
object AppPrefs {
    private const val FILE = "salesautocall_prefs"
    private const val KEY_BREAK = "break_seconds"
    private const val KEY_EMAIL = "last_email"

    fun getBreakSeconds(context: Context): Int =
        prefs(context).getInt(KEY_BREAK, 5)

    fun setBreakSeconds(context: Context, value: Int) =
        prefs(context).edit().putInt(KEY_BREAK, value.coerceIn(1, 59)).apply()

    fun getLastEmail(context: Context): String =
        prefs(context).getString(KEY_EMAIL, "") ?: ""

    fun setLastEmail(context: Context, email: String) =
        prefs(context).edit().putString(KEY_EMAIL, email).apply()

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
