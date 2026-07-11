package com.salesautocall.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.salesautocall.app.data.Contact
import org.json.JSONObject

/**
 * "Lead Ring" — inbound awareness. The CRM keeps a tiny on-device map of
 * phone → lead so that the instant a lead calls BACK (the highest-intent
 * moment in the funnel) we can say who it is, catch the missed ones, and
 * ask for the outcome afterwards. Notifications only — no window overlays,
 * so there is nothing to lag.
 */
object LeadRing {

    const val CHANNEL_RING = "lead_ring"
    const val CHANNEL_MISSED = "lead_missed"
    private const val FILE = "lead_ring_cache"

    data class Hit(
        val contactId: String,
        val name: String,
        val temperature: String?,
        val status: String?,
        /** One line of context to greet with — AI next action or the latest note. */
        val hint: String?,
    )

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_RING, "Lead calling", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shows who is calling when it's one of your leads"
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_MISSED, "Missed lead calls", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "A lead called you and you missed it — call back fast"
            }
        )
    }

    private fun digits(raw: String?): String = raw.orEmpty().filter { it.isDigit() }.takeLast(10)

    /** Refresh the on-device phone → lead map. Called whenever leads load. */
    fun cache(context: Context, leads: List<Contact>) {
        runCatching {
            val map = JSONObject()
            for (c in leads) {
                val id = c.id ?: continue
                val entry = JSONObject()
                    .put("id", id)
                    .put("name", c.name ?: "")
                    .put("temp", c.temperature ?: "")
                    .put("status", c.status)
                    .put("hint", (c.aiNextAction ?: c.notes)?.take(120) ?: "")
                digits(c.phone).takeIf { it.length >= 7 }?.let { map.put(it, entry) }
                digits(c.altPhone).takeIf { it.length >= 7 }?.let { map.put(it, entry) }
            }
            context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
                .edit().putString("map", map.toString()).apply()
        }
    }

    /** Instant, offline lookup used by the ring receiver. */
    fun lookup(context: Context, number: String?): Hit? {
        val key = digits(number)
        if (key.length < 7) return null
        return runCatching {
            val raw = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
                .getString("map", null) ?: return null
            val entry = JSONObject(raw).optJSONObject(key) ?: return null
            Hit(
                contactId = entry.getString("id"),
                name = entry.optString("name").ifBlank { number.orEmpty() },
                temperature = entry.optString("temp").ifBlank { null },
                status = entry.optString("status").ifBlank { null },
                hint = entry.optString("hint").ifBlank { null },
            )
        }.getOrNull()
    }
}
