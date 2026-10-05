package com.salesautocall.app.data

import java.time.Instant
import java.time.OffsetDateTime

/**
 * Is THIS rep's WhatsApp capture dead?
 *
 * Same clock as `admin/lib/capture-health.ts`: status, last_seen_at, and the
 * newest captured message. `link_ok_at` is not an input. A heartbeat writes
 * that column while WhatsApp has already logged the session out — on 4 Oct
 * 2026 it was minutes old while the only session had been logged out since
 * 26 Sep.
 *
 * `connected` and `connecting` stay quiet. A worker restart is not an outage,
 * and a fresh heartbeat cannot cancel a dead status because this function
 * never sees one. The watchdog is what turns a stopped worker into `offline`.
 */
object CaptureHealth {

    enum class Reason {
        LoggedOut,
        Disconnected,
        NeedsScan,
        Stale,
        Unproven,
    }

    data class Dead(
        val reason: Reason,
        val status: String,
        /** Session row's last_seen_at, when the timestamp parses. Not a heartbeat. */
        val lastSeenAt: String?,
    )

    data class Notice(val title: String, val detail: String)

    /**
     * Pending until the first read returns. Live is the only state that may
     * teach the follow-up loop. A failed read is [Snapshot.Down] — a blank
     * screen would look like capture is working.
     */
    sealed class Snapshot {
        data object Pending : Snapshot()
        data object Live : Snapshot()
        /** The read succeeded and this rep has no wa_rep_sessions row. */
        data object Unlinked : Snapshot()
        /** [proven] is false when the read itself failed. That is not "capture is fine". */
        data class Down(val notice: Notice, val proven: Boolean = true) : Snapshot()
    }

    private val LOGGED_OUT = Regex("logged out|logged this session out", RegexOption.IGNORE_CASE)

    /**
     * A session the phone must shout about, or null when this row is not an
     * outage. A missing row is not passed here — the caller maps that to
     * [Snapshot.Unlinked].
     */
    fun classify(status: String?, lastSeenAt: String?, lastError: String?): Dead? {
        val cleaned = status?.trim()?.lowercase().orEmpty()
        if (cleaned == "connected" || cleaned == "connecting") return null
        val reason = when {
            cleaned == "logged_out" || LOGGED_OUT.containsMatchIn(lastError.orEmpty()) -> Reason.LoggedOut
            cleaned == "qr" -> Reason.NeedsScan
            cleaned == "offline" -> Reason.Stale
            cleaned == "disconnected" || cleaned.isEmpty() -> Reason.Disconnected
            else -> Reason.Unproven
        }
        return Dead(
            reason = reason,
            status = cleaned.ifEmpty { "disconnected" },
            lastSeenAt = cleanIso(lastSeenAt),
        )
    }

    fun fromSession(
        status: String?,
        lastSeenAt: String?,
        lastError: String?,
        lastMessageAt: String?,
        messageLookupFailed: Boolean,
        nowMs: Long = System.currentTimeMillis(),
    ): Snapshot {
        val dead = classify(status, lastSeenAt, lastError) ?: return Snapshot.Live
        return Snapshot.Down(downNotice(dead, lastMessageAt, messageLookupFailed, nowMs))
    }

    fun unreadableNotice(): Notice = Notice(
        title = "WhatsApp capture status could not be read",
        detail = "This is not saying capture is working. Pull down to try again.",
    )

    /**
     * One line on the draft itself. Null while the read is still in flight or
     * capture is proven live — the banner covers the dead case everywhere else.
     */
    fun draftWarning(snapshot: Snapshot): String? = when (snapshot) {
        is Snapshot.Live, Snapshot.Pending -> null
        Snapshot.Unlinked -> "WhatsApp capture is not linked. This message will not be saved."
        is Snapshot.Down -> if (snapshot.proven) {
            "WhatsApp capture is down. This message will not be saved."
        } else {
            "WhatsApp capture status could not be read. This message will not be saved."
        }
    }

    /** True only when a send can be proved later by the observer. */
    fun recordsSends(snapshot: Snapshot): Boolean = snapshot is Snapshot.Live

    private fun downNotice(
        dead: Dead,
        lastMessageAt: String?,
        messageLookupFailed: Boolean,
        nowMs: Long,
    ): Notice {
        val why = when (dead.reason) {
            Reason.LoggedOut -> "WhatsApp logged you out."
            Reason.Disconnected -> "The link is disconnected."
            Reason.NeedsScan -> "A QR scan is waiting."
            Reason.Stale -> "The watcher has stopped."
            Reason.Unproven -> "This is not a live capture."
        }
        val ask = when (dead.reason) {
            Reason.NeedsScan, Reason.LoggedOut ->
                "Ask your manager for the QR, then scan it in WhatsApp."
            else -> "Ask your manager to link your WhatsApp again."
        }
        val clock = clockSentence(dead.lastSeenAt, lastMessageAt, messageLookupFailed, nowMs)
        return Notice(
            title = "WhatsApp capture is down",
            detail = "$why $clock Messages you send now are not saved. $ask",
        )
    }

    /**
     * The last captured message is the clock. last_seen_at is the fallback,
     * and a failed message read is said out loud — never treated as "no message".
     */
    private fun clockSentence(
        lastSeenAt: String?,
        lastMessageAt: String?,
        messageLookupFailed: Boolean,
        nowMs: Long,
    ): String {
        val seen = epoch(lastSeenAt)?.let { ago(it, nowMs) }
        val message = if (messageLookupFailed) null else epoch(lastMessageAt)?.let { ago(it, nowMs) }
        return when {
            message != null -> "Last message saved $message."
            messageLookupFailed && seen != null ->
                "The last message could not be read. Last update $seen."
            messageLookupFailed ->
                "The last message could not be read, so how long this has been down is unknown."
            seen != null -> "No saved message. Last update $seen."
            else -> "No saved message, so how long this has been down is unknown."
        }
    }

    private fun cleanIso(iso: String?): String? = iso?.takeIf { epoch(it) != null }

    private fun epoch(iso: String?): Long? {
        val raw = iso?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        parse(raw)?.let { return it }
        // "2026-09-29 14:01:19+00" shows up from some clients.
        return parse(raw.replace(' ', 'T'))
    }

    private fun parse(raw: String): Long? {
        runCatching { return Instant.parse(raw).toEpochMilli() }
        runCatching { return OffsetDateTime.parse(raw).toInstant().toEpochMilli() }
        return null
    }

    private fun ago(thenMs: Long, nowMs: Long): String {
        val min = (nowMs - thenMs) / 60_000
        return when {
            min < 1 -> "just now"
            min < 60 -> "${min}m ago"
            min < 1_440 -> "${min / 60}h ago"
            else -> "${min / 1_440}d ago"
        }
    }
}
