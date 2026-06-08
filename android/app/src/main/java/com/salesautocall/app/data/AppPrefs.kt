package com.salesautocall.app.data

import android.content.Context

/** Small persisted settings store (currently just the break time between calls). */
object AppPrefs {
    private const val FILE = "salesautocall_prefs"
    private const val KEY_BREAK = "break_seconds"

    fun getBreakSeconds(context: Context): Int =
        prefs(context).getInt(KEY_BREAK, 5)

    fun setBreakSeconds(context: Context, value: Int) =
        prefs(context).edit().putInt(KEY_BREAK, value.coerceIn(1, 59)).apply()

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
