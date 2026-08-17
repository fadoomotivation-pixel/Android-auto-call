package com.salesautocall.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.storage
import io.ktor.client.call.body
import io.ktor.client.plugins.timeout
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import android.content.Context
import android.provider.CallLog as AndroidCallLog
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * Thin data-access layer over Supabase. All reads/writes are constrained by
 * Row-Level Security on the server, so the salesperson only ever sees their own
 * company's data and their own assigned contacts.
 */
object Repository {

    private val client get() = Supabase.client

    /**
     * Compiled ONCE. `"\\D".toRegex()` inside a loop compiles a fresh Pattern
     * every iteration, and the call-log matcher runs it per native call PER
     * recent server log — for Shweta that is 102 × 168 ≈ 17,000 compilations in
     * a single sync, on an entry-level ITEL. The regex never changes; only the
     * string does.
     */
    private val NON_DIGITS = "\\D".toRegex()

    /** A phone number reduced to its digits. */
    private fun digitsOf(phone: String?): String = (phone ?: "").replace(NON_DIGITS, "")

    fun getSessionToken(): String? = client.auth.currentSessionOrNull()?.accessToken
    fun getFunctionsUrl(): String = com.salesautocall.app.BuildConfig.SUPABASE_URL + "/functions/v1"

    // ---------- auth ----------

    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signUp(
        email: String,
        password: String,
        fullName: String,
        phone: String,
        role: String,
        companyName: String,
    ) {
        client.auth.signUpWith(Email) {
            this.email = email
            this.password = password
            data = buildJsonObject {
                put("full_name", JsonPrimitive(fullName))
                put("phone", JsonPrimitive(phone))
                put("role", JsonPrimitive(role))
                if (companyName.isNotBlank()) put("company_name", JsonPrimitive(companyName))
            }
        }
    }

    suspend fun signOut() = client.auth.signOut()

    /** Suspends until the persisted session has finished loading from storage,
     *  so a cold start never mistakes "still loading" for "logged out". */
    suspend fun awaitSession() {
        runCatching { client.auth.awaitInitialization() }
    }

    fun currentUserId(): String? = client.auth.currentUserOrNull()?.id

    suspend fun myProfile(): Profile? {
        val uid = currentUserId() ?: return null
        return client.from("profiles").select {
            filter { eq("id", uid) }
        }.decodeSingleOrNull<Profile>()
    }

    // ---------- imports ----------

    // ---------- contacts ----------

    suspend fun updateContactStatus(contactId: String, status: String) {
        client.from("contacts").update(mapOf("status" to status)) {
            filter { eq("id", contactId) }
        }
    }

    // ---------- call logs ----------

    /** Inserts a call log and returns its new id (so a recording can be attached). */
    suspend fun logCall(log: CallLog): String? {
        return client.from("call_logs").insert(log) { select() }.decodeSingleOrNull<CallLog>()?.id
    }

    /**
     * Insert backfilled call logs in CHUNKS, not one HTTP request each.
     *
     * The backfill loop used to call logCall() per row and throw the returned id
     * away. On a phone that has never synced, that is the entire 7-day call log
     * in sequential round trips — Ankita's first run backfilled 118 — and on a
     * telecaller's 4G it takes minutes. That is why Shweta's "Test" button sat
     * on "Testing…": nothing was broken, it just had a hundred requests to get
     * through and no way to say so.
     *
     * A failed chunk falls back to one-at-a-time for that chunk only, so a
     * single bad row can't take the other ninety-nine down with it — the
     * resilience of the old loop, at one request instead of a hundred.
     */
    suspend fun logCallsBulk(logs: List<CallLog>): Int {
        if (logs.isEmpty()) return 0
        var saved = 0
        for (chunk in logs.chunked(100)) {
            val rows = chunk.map { rowFor(it) }
            if (runCatching { client.from("call_logs").insert(rows) }.isSuccess) {
                saved += chunk.size
            } else {
                for (one in chunk) if (runCatching { logCall(one) }.isSuccess) saved++
            }
        }
        return saved
    }

    /**
     * One backfill row, as an explicit map with a FIXED key set.
     *
     * Inserting the CallLog objects directly does not work in bulk, and it fails
     * on the normal path rather than a rare one. kotlinx.serialization omits any
     * field equal to its default, so the rows genuinely differ in shape: a lead
     * call carries contact_id and an off-CRM one does not, an incoming call
     * carries direction and an outgoing one does not, a connected call carries
     * duration_seconds and a missed one does not. PostgREST builds the column
     * list from the FIRST object of a bulk insert and rejects the whole batch
     * with PGRST102 "All object keys must match" the moment a later row differs
     * — so every chunk would have failed and fallen back to one-at-a-time, which
     * is slower than the loop this replaced.
     *
     * Same keys on every row, nulls written explicitly. `id` is left out
     * entirely: sending "id": null overrides the column's default instead of
     * letting Postgres generate one.
     */
    private fun rowFor(c: CallLog): JsonObject = buildJsonObject {
        put("company_id", c.companyId)
        put("salesperson_id", c.salespersonId)
        put("contact_id", c.contactId)
        put("phone", c.phone)
        put("direction", c.direction)
        put("outcome", c.outcome)
        put("started_at", c.startedAt)
        put("ended_at", c.endedAt)
        put("duration_seconds", c.durationSeconds)
        put("recording_status", c.recordingStatus)
        put("off_crm", c.offCrm)
    }

    /** Force a call's recording_status (e.g. "failed" when no audio was captured). */
    suspend fun markRecordingStatus(callLogId: String, status: String) {
        client.from("call_logs").update(mapOf("recording_status" to status)) {
            filter { eq("id", callLogId) }
        }
    }

    /** Logs an INCOMING cloud (SIP) call for the current user. Returns the new id. */
    suspend fun logIncomingCloudCall(number: String, recording: Boolean): String? {
        val p = myProfile() ?: return null
        val cid = p.companyId ?: return null
        return logCall(
            CallLog(
                companyId = cid, salespersonId = p.id,
                phone = number, direction = "incoming", notes = "cloud-incoming",
                startedAt = Instant.now().toString(),
                recordingStatus = if (recording) "recording" else "none",
                recordingSource = "sip",
            ),
        )
    }


    /**
     * Tell the server what this phone's call-log sync just did — including the
     * runs where it did nothing, and why.
     *
     * This exists because syncCallLogs() used to have three silent exits. A rep
     * whose READ_CALL_LOG permission had been revoked looked exactly like a rep
     * who made no calls: no rows, no error, no signal of any kind. One of them
     * worked a full day of fifteen calls and the CRM recorded one, and nobody
     * found out until the founder picked up her phone and compared it to the
     * dashboard.
     *
     * Best-effort on purpose. Reporting the heartbeat must never be able to
     * break the sync it is reporting on — if this throws, the calls still go up.
     *
     * But best-effort is not the same as UNOBSERVED. The Result was previously
     * discarded, so a heartbeat that never landed looked identical to a phone
     * that never ran. devansh singh's handset completed a scan and uploaded 96
     * calls this morning and wrote no row at all, while Ankita's row updated
     * the same morning — so the write path worked and something about his
     * failed, and there was no way to find out which. The failure is now kept
     * on the handset, where it is still reachable when the server write is the
     * thing that broke, and shown on the setup screen.
     */
    private suspend fun reportSyncHealth(
        context: Context,
        companyId: String,
        salesId: String,
        outcome: String,
        detail: String? = null,
        nativeSeen: Int = 0,
        backfilled: Int = 0,
        contactsLoaded: Int = 0,
    ) {
        val result = runCatching {
            val now = java.time.Instant.now().toString()
            client.from("device_sync_health").upsert(buildJsonObject {
                put("salesperson_id", salesId)
                put("company_id", companyId)
                put("last_run_at", now)
                // Only a completed scan sets last_ok_at. The gap between the two
                // timestamps is the entire diagnosis on the admin side.
                if (outcome == "ok") put("last_ok_at", now)
                put("outcome", outcome)
                put("detail", detail?.take(300))
                put("native_seen", nativeSeen)
                put("backfilled", backfilled)
                put("contacts_loaded", contactsLoaded)
                put("app_version", com.salesautocall.app.BuildConfig.VERSION_NAME)
                put("device_model", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
                put("android_sdk", android.os.Build.VERSION.SDK_INT)
                put("updated_at", now)
            }) { onConflict = "salesperson_id" }
        }
        AppPrefs.setHealthWriteError(
            context,
            result.exceptionOrNull()?.let { "${it.javaClass.simpleName}: ${it.message ?: "no message"}" },
        )
    }

    /**
     * ASK THE OFFICE WHETHER THIS PHONE HAS DELIVERED.
     *
     * The setup gate's proof lived ONLY in this phone's SharedPreferences. That
     * makes a locked-out rep unrecoverable from here: if the flag fails to
     * stick for any reason, the app stays shut and there is nothing the founder
     * can do about it remotely — no setting, no toggle, no re-send.
     *
     * devansh singh is that rep. His phone read its call log and delivered 96
     * calls at 08:39 this morning; the rows are in call_logs, timestamped, with
     * his salesperson_id on them. The office can SEE his phone working. The
     * gate never asked, kept showing "The phone still will not hand over its
     * call log", and no reinstall could clear it because the evidence it wanted
     * was the one thing that had gone missing locally.
     *
     * So the gate now accepts the server's own record as proof, and caches it
     * back into the local flag. This is strictly harder to fake than the local
     * pref, not easier: rows in call_logs are something the phone can only
     * produce by actually reading its call log and successfully uploading.
     */
    suspend fun serverSeenDelivery(context: Context): Boolean {
        val salesId = currentUserId() ?: return false
        val since = java.time.Instant.now().minus(12, java.time.temporal.ChronoUnit.HOURS).toString()
        val delivered = runCatching {
            client.from("call_logs")
                .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw(
                    "id, phone, started_at, company_id, salesperson_id",
                )) {
                    filter {
                        eq("salesperson_id", salesId)
                        gte("created_at", since)
                    }
                    limit(1)
                }.decodeList<CallLog>().isNotEmpty()
        }.getOrDefault(false)
        if (delivered) AppPrefs.setLastSyncOkAt(context, System.currentTimeMillis())
        return delivered
    }

    /**
     * Safety net: Reads the native Android CallLog, compares with Supabase,
     * and backfills any missing calls made to our CRM contacts.
     *
     * Every exit reports itself — see reportSyncHealth. A return that records
     * nothing is indistinguishable from a quiet day, and that ambiguity cost a
     * telecaller a day's credit and the founder their trust in the dashboard.
     */
    suspend fun syncCallLogs(context: Context) {
        // NO SESSION IS NOT A CALL-LOG PROBLEM.
        //
        // These two lines are the only exits that cannot report to the server —
        // reporting needs the very session they just found missing. So they
        // report to the handset instead. Without this the scan returned on line
        // two in total silence, and the setup screen, seeing no proof and no
        // exception, told devansh singh "The phone still will not hand over its
        // call log. Tell your admin." His call log was fine. His token had
        // expired an hour earlier.
        val salesId = currentUserId() ?: run {
            AppPrefs.setHealthWriteError(context, "signed out — sign in again")
            return
        }
        val companyId = myProfile()?.companyId ?: run {
            AppPrefs.setHealthWriteError(context, "signed out or profile unreadable — sign in again")
            return
        }

        // 1. Check permission
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            // The single most common way this phone goes blind, and until now
            // the most silent. Say it out loud so Phone Health can name the
            // rep, the handset and the setting to change.
            reportSyncHealth(context, companyId, salesId, "no_permission",
                "READ_CALL_LOG is not granted, so the app cannot see this phone's calls.")
            return
        }

        // Workplace-monitoring toggle: when the company turns this on, EVERY call
        // on this work phone is synced — including numbers that aren't CRM leads —
        // so the admin can see off-CRM calling (the app discloses this to the rep).
        val recordAll = runCatching { myCompany()?.recordAllCalls }.getOrNull() == true

        // 2. Fetch the user's CRM contacts
        // company_id is in the column list because Contact REQUIRES it — a
        // non-null field with no default. Asking for "id, phone" and decoding
        // into a model that needs a third column is a MissingFieldException
        // waiting for the right row, and this select is unguarded: it takes the
        // whole sync down before any heartbeat is written, so the phone reports
        // nothing at all rather than reporting a failure.
        val myContacts = client.from("contacts")
            .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw("id, phone, company_id")) {
                filter { eq("company_id", companyId) }
            }.decodeList<Contact>()

        val contactMap = myContacts.mapNotNull {
            val p = digitsOf(it.phone)
            if (p.isNotEmpty() && it.id != null) p to it.id else null
        }.toMap()

        // A company with no leads yet is NOT a broken phone.
        //
        // This used to `return` here, before the proof below is written — so a
        // rep in a brand-new tenant could never satisfy the setup gate and
        // never get into the app at all. It is the state EVERY new company is
        // in on its first day: the admin cannot import leads until the team is
        // set up, and the team cannot get past the gate until leads exist.
        //
        // The scan now runs to the end. With no contacts and monitoring off,
        // every native call is skipped, nothing is uploaded, and the heartbeat
        // says so honestly with contacts_loaded = 0 — which is the same
        // information the old "no_contacts" outcome carried, minus the deadlock.

        // 3. Fetch the CRM rows this scan could possibly be a duplicate of.
        //
        // THIS IS WHERE 5,397 DUPLICATE ROWS CAME FROM. It used to take the 500
        // most recent rows, "enough to catch missing ones" — and it is not,
        // because the native window below is SEVEN DAYS. Once a rep has more
        // than 500 rows in seven days, the oldest native calls can no longer
        // find their existing CRM row, so they are backfilled AGAIN. That adds
        // rows, which pushes even more of the window past the 500 cap, which
        // duplicates more calls on the next run. It compounds: one of Ankita's
        // calls is stored EIGHTY-FOUR times, and 2 Aug holds 4,792 rows for 84
        // distinct numbers.
        //
        // Fetch by the SAME window the scan uses instead of a row count — one
        // day wider, so a call at the boundary still finds its match. The limit
        // that remains is a sanity bound, not a correctness assumption.
        val dedupeSince = java.time.Instant.now().minus(8, java.time.temporal.ChronoUnit.DAYS).toString()
        val recentLogs = client.from("call_logs")
            .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw(
                "id, phone, started_at, company_id, salesperson_id",
            )) {
                filter {
                    eq("salesperson_id", salesId)
                    gte("started_at", dedupeSince)
                }
                order("started_at", Order.DESCENDING)
                limit(20000)
            }.decodeList<CallLog>()

        // 4. Query Android CallLog
        val timeLimitMillis = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L) // Last 7 days
        val cursor = context.contentResolver.query(
            AndroidCallLog.Calls.CONTENT_URI,
            arrayOf(
                AndroidCallLog.Calls.NUMBER,
                AndroidCallLog.Calls.TYPE,
                AndroidCallLog.Calls.DATE,
                AndroidCallLog.Calls.DURATION
            ),
            "${AndroidCallLog.Calls.DATE} > ?",
            arrayOf(timeLimitMillis.toString()),
            "${AndroidCallLog.Calls.DATE} ASC" // Ascending to process oldest first
        ) ?: run {
            // The OS refused the query even though the permission looked
            // granted — happens on some OEM builds after a restore.
            reportSyncHealth(context, companyId, salesId, "no_cursor",
                "Android returned no call-log cursor.", contactsLoaded = contactMap.size)
            return
        }

        data class NativeCall(val num: String, val cleanNum: String, val contactId: String?, val startedAt: Instant, val durationSec: Int, val type: Int)
        val nativeCalls = mutableListOf<NativeCall>()

        cursor.use { c ->
            val numIdx = c.getColumnIndex(AndroidCallLog.Calls.NUMBER)
            val typeIdx = c.getColumnIndex(AndroidCallLog.Calls.TYPE)
            val dateIdx = c.getColumnIndex(AndroidCallLog.Calls.DATE)
            val durIdx = c.getColumnIndex(AndroidCallLog.Calls.DURATION)

            while (c.moveToNext()) {
                val num = c.getString(numIdx) ?: continue
                val cleanNum = digitsOf(num)
                val type = c.getInt(typeIdx)
                val dateMillis = c.getLong(dateIdx)
                val durationSec = c.getInt(durIdx)

                // Sync EVERY direction of a lead call — outgoing, incoming AND
                // missed — so the admin sees the whole story, not just dials.
                val known = type in setOf(
                    AndroidCallLog.Calls.OUTGOING_TYPE,
                    AndroidCallLog.Calls.INCOMING_TYPE,
                    AndroidCallLog.Calls.MISSED_TYPE,
                    AndroidCallLog.Calls.REJECTED_TYPE,
                )
                if (!known) continue

                val contactId = contactMap[cleanNum] ?: contactMap.entries.firstOrNull { cleanNum.endsWith(it.key) || it.key.endsWith(cleanNum) }?.value
                // Not a CRM lead: skip unless the company monitors ALL calls, in
                // which case log it as an off-CRM call (no contact link).
                if (contactId == null && !recordAll) continue
                // Ignore obviously non-dialable rows (blank/short) even under
                // record-all, so we don't log service codes and voicemails.
                if (contactId == null && cleanNum.length < 7) continue

                nativeCalls.add(NativeCall(num, cleanNum, contactId, Instant.ofEpochMilli(dateMillis), durationSec, type))
            }
        }

        // 5. Greedy bipartite matching
        val matchedSupabaseIds = mutableSetOf<String>()
        // Collected, then written in one go — see logCallsBulk.
        val toBackfill = mutableListOf<CallLog>()

        for (nativeCall in nativeCalls) {
            // Find closest unmatched Supabase log within 120 seconds
            val closestLog = recentLogs
                .filter { it.id != null && !matchedSupabaseIds.contains(it.id) }
                // EXACT last-10 match, not endsWith either way.
                //
                // The loose rule is what stopped Ankita's lead calls reaching
                // the CRM. Her heartbeat: native_seen 760, backfilled 18 — the
                // app decided 742 of her calls were already here, on a day the
                // CRM held 47. Nine leads she demonstrably rang (Deepak, Govind,
                // Jp, Kanhiya, Pankaj, Sunny, Xwed, Ramroop) have ZERO call rows
                // between them, ever.
                //
                // "a.endsWith(b) || b.endsWith(a)" is a suffix test, and Indian
                // mobile numbers share suffixes constantly. Paired with a
                // 120-second window and a recentLogs set that #402 widened to
                // eight days and twenty thousand rows — 6,068 of them duplicates
                // — a native call could nearly always find SOME row that looked
                // like a match. Every one it found was a call it then refused to
                // send.
                //
                // Two numbers are the same number when their last ten digits are
                // the same. That is the rule link_call_to_contact and
                // backlink_calls_to_new_contact already use server-side, so all
                // three now agree.
                .filter { digitsOf(it.phone).takeLast(10) == nativeCall.cleanNum.takeLast(10) }
                .mapNotNull {
                    // Instant.parse rejects the API's "+00:00" offset. When it
                    // failed, this returned null and the candidate was dropped —
                    // so a phone recording could find no call log to attach to
                    // and simply never got matched. OffsetDateTime first.
                    // Elvis, not recoverCatching — inside recoverCatching `it`
                    // is the Throwable, not this call log.
                    val sbStart = runCatching { java.time.OffsetDateTime.parse(it.startedAt).toInstant() }.getOrNull()
                        ?: runCatching { Instant.parse(it.startedAt) }.getOrNull()
                        ?: return@mapNotNull null
                    val diff = Math.abs(sbStart.epochSecond - nativeCall.startedAt.epochSecond)
                    if (diff < 120) it to diff else null
                }
                .minByOrNull { it.second }
                ?.first

            if (closestLog != null) {
                // Matched!
                matchedSupabaseIds.add(closestLog.id!!)
            } else {
                // Unmatched: Backfill to Supabase
                val incoming = nativeCall.type == AndroidCallLog.Calls.INCOMING_TYPE
                val missed = nativeCall.type == AndroidCallLog.Calls.MISSED_TYPE ||
                    nativeCall.type == AndroidCallLog.Calls.REJECTED_TYPE
                val outcome = when {
                    missed -> "missed"
                    nativeCall.durationSec > 0 -> "connected"
                    else -> "no_answer"
                }
                val newLog = CallLog(
                    companyId = companyId,
                    salespersonId = salesId,
                    contactId = nativeCall.contactId,
                    phone = nativeCall.num,
                    direction = if (incoming || missed) "incoming" else "outgoing",
                    outcome = outcome,
                    startedAt = nativeCall.startedAt.toString(),
                    endedAt = nativeCall.startedAt.plusSeconds(nativeCall.durationSec.toLong()).toString(),
                    durationSeconds = nativeCall.durationSec,
                    recordingStatus = "none",
                    // Off-CRM = captured under record-all-calls, number isn't a lead.
                    offCrm = nativeCall.contactId == null,
                )
                toBackfill.add(newLog)
            }
        }

        // NOTHING TO SEND IS NOT A FAILED PHONE.
        //
        // The proof used to be the LAST statement of this function, after the
        // upload — so a phone with nothing to upload could never write it, and
        // the setup gate never opened. devansh singh sat on "1 thing to allow"
        // pressing Check now: his company runs record-all-calls with zero
        // leads, so his first scan had to ship his ENTIRE seven-day phone
        // history — 96 calls, sent one at a time when the bulk insert falls
        // back, which took two full minutes. The proof only landed if that
        // whole job survived on a coroutine scope tied to a screen showing
        // nothing but "…", and any interruption threw it away.
        //
        // When there is nothing to back-fill, everything the gate asks has
        // already been answered above: the profile and contacts queries
        // returned (network and auth are fine), READ_CALL_LOG is granted, and
        // the OS handed over its cursor. Requiring an upload that by
        // definition cannot happen is a gate with no key.
        //
        // When there IS something to send, the proof still waits for the
        // upload — deliberately. That is the case the gate was built for:
        // Shweta's phone held every permission, showed three green ticks, and
        // delivered nothing for five days. A read that works is not a delivery
        // that works, and this must keep saying so.
        if (toBackfill.isEmpty()) AppPrefs.setLastSyncOkAt(context, System.currentTimeMillis())

        val backfilled = logCallsBulk(toBackfill)

        // A completed scan. native_seen is what the PHONE believes happened;
        // backfilled is how much of it the CRM had missed. A phone reporting
        // fifteen seen and fourteen backfilled every run is a phone whose live
        // capture is dead and whose safety net is quietly carrying the day.
        reportSyncHealth(
            context, companyId, salesId, "ok",
            nativeSeen = nativeCalls.size,
            backfilled = backfilled,
            contactsLoaded = contactMap.size,
        )
        // A delivery actually happened — renew the proof, so the 12-hour window
        // is measured from the last END-TO-END success. The remaining early
        // returns above (no permission, no cursor, no network) still leave this
        // untouched, and the gate must not open on any of them.
        AppPrefs.setLastSyncOkAt(context, System.currentTimeMillis())
    }

    /** Uploads a recording file to the recording-upload edge function, which streams
     *  it to the company's Google Drive and marks the call log ready. */
    suspend fun uploadRecording(callLogId: String, source: String, durationSeconds: Int, bytes: ByteArray): String {
        val resp = client.functions.invoke("recording-upload") {
            // A recording upload streams the whole file up AND the function then
            // streams it into Drive, which easily blows past the default 10s Ktor
            // request timeout on longer calls. Give it a generous 2-minute window.
            timeout {
                requestTimeoutMillis = 120_000
                socketTimeoutMillis = 120_000
            }
            header("x-call-id", callLogId)
            header("x-source", source)
            header("x-duration", durationSeconds.toString())
            header("Content-Type", "application/octet-stream")
            setBody(bytes)
        }
        val body = resp.bodyAsText()
        // The function returns non-2xx when the company's Drive isn't connected or
        // the upload fails. Surface that as an error instead of a silent "success"
        // so the call log doesn't get stuck showing a recording that never lands.
        if (resp.status.value !in 200..299) {
            throw IllegalStateException("recording-upload ${resp.status.value}: ${body.take(180)}")
        }
        return body
    }

    /**
     * Backfills recordings for logged calls by matching the dialer's files
     * (oDialer/Truecaller name them "<phone>-<time>.<ext>") to each call by the
     * phone number in the filename, then the closest timestamp. Each matched file
     * is uploaded (which marks the call ready) and the AI summary is kicked off
     * automatically — so recordings AND their AI insights appear on their own.
     *
     * Shared by the manual "Sync" button and the hourly RecordingSyncWorker.
     * Returns (attached, failed, firstErrorMessage).
     */
    suspend fun syncRecordings(context: android.content.Context, sinceIso: String?): Triple<Int, Int, String?> {
        awaitSession()
        if (currentUserId() == null) return Triple(0, 0, "not signed in")
        if (!com.salesautocall.app.dialer.NativeRecordingHarvester.isConfigured(context)) return Triple(0, 0, "no folder")
        val files = runCatching {
            com.salesautocall.app.dialer.NativeRecordingHarvester.listAudioFiles(context)
        }.getOrDefault(emptyList()).toMutableList()
        if (files.isEmpty()) return Triple(0, 0, null)
        val calls = runCatching { fetchCalls(sinceIso) }.getOrDefault(emptyList())
            .sortedByDescending { recIsoMs(it.startedAt) ?: 0L }
        var attached = 0
        var failed = 0
        var firstError: String? = null
        for (c in calls) {
            val id = c.id ?: continue
            if (c.recordingStatus == "ready") continue
            val startMs = recIsoMs(c.startedAt) ?: continue
            val digits = c.phone.filter { it.isDigit() }.takeLast(10)
            val byName = if (digits.length >= 7)
                files.filter { f -> f.name.filter { it.isDigit() }.contains(digits) } else emptyList()
            val pick = byName.ifEmpty { files.filter { kotlin.math.abs(it.lastModified - startMs) < 300_000L } }
                .minByOrNull { kotlin.math.abs(it.lastModified - startMs) } ?: continue
            if (kotlin.math.abs(pick.lastModified - startMs) > 12L * 3600_000L) continue
            val bytes = runCatching {
                com.salesautocall.app.dialer.NativeRecordingHarvester.bytesOf(context, pick.docId)
            }.getOrNull()
            if (bytes == null || bytes.isEmpty()) continue
            runCatching { uploadRecording(id, "sim", c.durationSeconds, bytes) }
                .onSuccess {
                    attached++
                    files.remove(pick)
                    // Fire the AI summary/disposition for the freshly-attached recording.
                    runCatching { generateSummary(id) }
                }
                .onFailure { e -> failed++; if (firstError == null) firstError = e.message }
        }
        return Triple(attached, failed, firstError)
    }

    // The API's "+00:00" shape first — Instant.parse throws on it, and this runs
    // once per recording being matched.
    private fun recIsoMs(iso: String?): Long? = iso?.let {
        runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
            ?: runCatching { Instant.parse(it).toEpochMilli() }.getOrNull()
    }

    /** Downloads a recording's audio bytes (RLS-gated) for in-app playback. */
    suspend fun fetchRecording(callLogId: String): ByteArray? {
        val resp = client.functions.invoke(
            function = "recording-url",
            body = buildJsonObject { put("call_log_id", callLogId) },
        )
        if (resp.status.value !in 200..299) return null
        return runCatching { resp.body<ByteArray>() }.getOrNull()
    }

    /**
     * Asks the backend to generate (or return the cached) AI summary for a call.
     * Returns the summary text, or null if it failed / isn't ready.
     */
    suspend fun generateSummary(callLogId: String): String? {
        val resp = client.functions.invoke(
            function = "call-summary",
            body = buildJsonObject { put("call_log_id", callLogId) },
        )
        if (resp.status.value !in 200..299) return null
        return runCatching {
            resp.body<JsonObject>()["summary"]?.jsonPrimitive?.contentOrNull
        }.getOrNull()
    }

    /** RAG v4: a proactive "before you call" brief for one lead — grounded in
     *  the company's own knowledge (company-isolated server-side). */
    suspend fun leadBrief(contactId: String): String? {
        val resp = client.functions.invoke(
            function = "lead-brief",
            body = buildJsonObject { put("contact_id", contactId) },
        )
        if (resp.status.value !in 200..299) return null
        return runCatching {
            resp.body<JsonObject>()["brief"]?.jsonPrimitive?.contentOrNull
        }.getOrNull()
    }

    /**
     * Runs AI scoring over the rep's open leads (one Groq call). Writes
     * hot/warm/cold + a next action back to the leads. Returns how many scored.
     */
    suspend fun scoreLeads(): Int {
        val resp = client.functions.invoke(function = "lead-insights", body = buildJsonObject { })
        if (resp.status.value !in 200..299) return 0
        return runCatching {
            resp.body<JsonObject>()["scored"]?.jsonPrimitive?.intOrNull
        }.getOrNull() ?: 0
    }

    // ---------- WhatsApp (Cloud API, tracked) ----------

    /** Conversation thread for a lead (RLS-scoped to the rep / company). */
    suspend fun fetchWhatsThread(contactId: String): List<WhatsAppMessage> =
        client.from("whatsapp_messages").select {
            filter { eq("contact_id", contactId) }
            order("created_at", Order.ASCENDING)
        }.decodeList()

    /**
     * Sends a WhatsApp message through the company number (logged for the admin).
     * Returns null on success, or an error string (e.g. not connected) to show.
     */
    suspend fun sendWhatsApp(contactId: String, text: String): String? {
        val resp = client.functions.invoke(
            "whatsapp-send",
            buildJsonObject { put("contact_id", contactId); put("text", text) },
        )
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull()
        val ok = obj?.get("ok")?.jsonPrimitive?.booleanOrNull == true
        return if (ok) null else obj?.get("error")?.jsonPrimitive?.contentOrNull ?: "Couldn't send"
    }

    // ---------- AI assistant chat ----------

    /**
     * Asks the AI sales coach — or, in "roleplay" mode, the AI plays a customer
     * for the rep to practice against (RAG v10). Returns the reply, or null.
     */
    suspend fun assistantChat(messages: List<ChatMsg>, lead: Contact? = null, mode: String = "coach"): String? {
        val payload = buildJsonObject {
            put(
                "messages",
                buildJsonArray {
                    messages.forEach { add(buildJsonObject { put("role", it.role); put("content", it.content) }) }
                },
            )
            if (mode != "coach") put("mode", mode)
            lead?.let { l ->
                put("lead", buildJsonObject {
                    put("name", l.name ?: "")
                    put("status", l.status ?: "")
                    put("temperature", l.temperature ?: "")
                })
            }
        }
        val resp = client.functions.invoke("assistant-chat", payload)
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull()
        return if (obj?.get("ok")?.jsonPrimitive?.booleanOrNull == true) {
            obj["reply"]?.jsonPrimitive?.contentOrNull
        } else null
    }

    /**
     * "Aaj ke 5" — the AI sales manager's next-best calls for this rep, each
     * with a short reason and a ready-to-speak Hinglish opener grounded in the
     * company's own RAG facts. Reuses the focus-five function.
     */
    suspend fun focusFive(): List<FocusPick> {
        val resp = client.functions.invoke("focus-five", buildJsonObject { })
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull() ?: return emptyList()
        if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) return emptyList()
        val arr = obj["picks"] as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            FocusPick(
                contactId = id,
                reason = o["reason"]?.jsonPrimitive?.contentOrNull ?: "",
                opener = o["opener"]?.jsonPrimitive?.contentOrNull ?: "",
            )
        }
    }

    /**
     * The floating AI Coach panel: last-call feedback (>=30s calls only) + the
     * 10 AM / 6 PM day brief. All heavy lifting + caching lives in rep-coach.
     */
    suspend fun coachPanel(): CoachPanel? {
        val resp = client.functions.invoke("rep-coach", buildJsonObject { })
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull() ?: return null
        if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) return null
        val c = obj["coaching"] as? JsonObject
        val b = obj["brief"] as? JsonObject
        return CoachPanel(
            coaching = c?.let {
                CoachCallFeedback(
                    good = it["good"]?.jsonPrimitive?.contentOrNull,
                    improve = it["improve"]?.jsonPrimitive?.contentOrNull,
                    rating = it["rating"]?.jsonPrimitive?.intOrNull,
                    callAt = it["callAt"]?.jsonPrimitive?.contentOrNull,
                    leadName = it["leadName"]?.jsonPrimitive?.contentOrNull,
                )
            },
            brief = b?.let {
                val slot = it["slot"]?.jsonPrimitive?.contentOrNull
                val content = it["content"]?.jsonPrimitive?.contentOrNull
                if (slot != null && content != null) CoachBrief(slot, content) else null
            },
            tip = obj["tip"]?.jsonPrimitive?.contentOrNull,
        )
    }

    /** The rep's overall calling score = average of their coached call ratings
     *  (1-5). Shown right up front on Home. Returns (average, count) or null when
     *  no calls have been rated yet. RLS returns only the rep's own rows. */
    suspend fun callingScore(): Pair<Double, Int>? {
        val uid = currentUserId() ?: return null
        val rows = client.from("coach_feedback")
            .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw("rating")) {
                filter { eq("salesperson_id", uid) }
            }.decodeList<RatingRow>()
        val rated = rows.mapNotNull { it.rating }
        if (rated.isEmpty()) return null
        return rated.average() to rated.size
    }

    /**
     * Per-lead call coach: the coach "observes" THIS lead's last real call
     * (>=30s, transcript ready) and returns an honest 1-5 rating + one guidance
     * line, shown on the lead's own page. Same coach_feedback brain as the
     * floating coach — generated once, then cached. Returns null if no real call.
     */
    suspend fun leadCallCoach(contactId: String): CoachCallFeedback? {
        val resp = client.functions.invoke(
            "rep-coach",
            buildJsonObject {
                put("mode", "lead")
                put("contact_id", contactId)
            },
        )
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull() ?: return null
        if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) return null
        val c = obj["coaching"] as? JsonObject ?: return null
        return CoachCallFeedback(
            good = c["good"]?.jsonPrimitive?.contentOrNull,
            improve = c["improve"]?.jsonPrimitive?.contentOrNull,
            rating = c["rating"]?.jsonPrimitive?.intOrNull,
            callAt = c["callAt"]?.jsonPrimitive?.contentOrNull,
            leadName = null,
        )
    }

    /**
     * The 7pm day review that fills the assistant's day card.
     *
     * rep-coach counts the day, scores it and caches the whole thing per rep per
     * date, so opening the app three times in an evening costs one generation
     * and shows one review. Null when it could not be built — the card then
     * falls back to the four counters it has always had, which are computed on
     * the phone and never need the network.
     */
    suspend fun dayReview(): DayReview? {
        val resp = client.functions.invoke("rep-coach", buildJsonObject { put("mode", "day_review") })
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull() ?: return null
        if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) return null
        val r = obj["review"] as? JsonObject ?: return null
        val imp = r["improve"] as? JsonObject
        return DayReview(
            score = r["score"]?.jsonPrimitive?.doubleOrNull,
            calls = r["calls"]?.jsonPrimitive?.intOrNull ?: 0,
            connected = r["connected"]?.jsonPrimitive?.intOrNull ?: 0,
            conversations = r["conversations"]?.jsonPrimitive?.intOrNull ?: 0,
            visitsFixed = r["visitsFixed"]?.jsonPrimitive?.intOrNull ?: 0,
            bookings = r["bookings"]?.jsonPrimitive?.intOrNull ?: 0,
            wins = (r["wins"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList(),
            improve = imp?.let {
                val pattern = it["pattern"]?.jsonPrimitive?.contentOrNull?.trim()
                if (pattern.isNullOrBlank()) null
                else DayReviewImprove(pattern, it["say"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty())
            },
            priorities = (r["priorities"] as? JsonArray)?.mapNotNull { el ->
                val o = el as? JsonObject ?: return@mapNotNull null
                val lead = o["lead"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                DayReviewPriority(lead, o["why"]?.jsonPrimitive?.contentOrNull ?: "")
            } ?: emptyList(),
            bestCall = reviewCall(r["bestCall"] as? JsonObject),
            worstCall = reviewCall(r["worstCall"] as? JsonObject),
        )
    }

    private fun reviewCall(o: JsonObject?): DayReviewCall? {
        val rating = o?.get("rating")?.jsonPrimitive?.intOrNull ?: return null
        return DayReviewCall(
            lead = o["lead"]?.jsonPrimitive?.contentOrNull,
            rating = rating,
            why = o["why"]?.jsonPrimitive?.contentOrNull?.trim()?.ifBlank { null },
        )
    }

    /**
     * Two-way "ask the coach": the rep asks anything (Hindi/Hinglish/English) and
     * gets a short, practical answer grounded in the SAME company brain (playbook
     * + global guidebook + harvested wins), always nudging toward the next funnel
     * step. The question + answer is saved as the rep's coach memory server-side.
     */
    suspend fun coachAsk(question: String, contactId: String? = null): String? {
        val resp = client.functions.invoke(
            "rep-coach",
            buildJsonObject {
                put("mode", "ask")
                put("question", question.trim().take(800))
                if (contactId != null) put("contact_id", contactId)
            },
        )
        val obj = runCatching { resp.body<JsonObject>() }.getOrNull() ?: return null
        if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) return null
        return obj["answer"]?.jsonPrimitive?.contentOrNull
    }

    /**
     * RAG v9 — the "objection coach". The customer just said no; this returns
     * the EXACT words to say back, grounded in the company's own playbook (price
     * facts + lines from calls that actually closed). Reuses the assistant-chat
     * RAG brain (company-isolated, Groq — no extra key), so it's a fresh single
     * shot, not part of the coach chat history. Returns the rebuttal, or null.
     */
    /**
     * Hindi inflects the first person, so anything the AI writes for the rep to
     * say or send has to know who is speaking. Without this every draft came out
     * masculine ("kar raha hoon", "bataunga") — wrong for most of the team. When
     * the rep hasn't said, we ask for the neutral plural rather than guess.
     */
    private fun voiceRule(speaksAs: String?): String = when (speaksAs) {
        SelfVoice.FEMALE ->
            "The speaker is a WOMAN — use feminine first-person Hindi forms (kar rahi hoon, bataungi, chahti hoon). "
        SelfVoice.MALE ->
            "The speaker is a MAN — use masculine first-person Hindi forms (kar raha hoon, bataunga, chahta hoon). "
        else ->
            "Do NOT use gendered first-person Hindi verbs — use the neutral plural (kar rahe hain, batayenge, chahte hain). "
    }

    suspend fun objectionRebuttal(contact: Contact, objection: String, speaksAs: String? = null): String? {
        val prompt = buildString {
            append("On the call, the customer just objected: \"")
            append(objection.trim().take(300))
            append("\".\n")
            append("Give me the EXACT words to say back — a warm, confident counter in Hinglish ")
            append("(Roman script, how an Indian telecaller actually speaks). 2-3 short lines, ready to say out loud. ")
            append("Address the customer respectfully with 'aap' — never tu/tum. ")
            append("Ground it in our company's real facts (a price, an offer, a project USP, or a line from a call that closed) — ")
            append(voiceRule(speaksAs))
            append("quote the fact if we have it; if we don't, give the best honest counter and tell me in one line what to confirm. ")
            append("Finish with one question that nudges the customer to the next step. No preamble — just the lines to say.")
        }
        return assistantChat(listOf(ChatMsg("user", prompt)), lead = contact)
    }

    /**
     * Objection Buster (floating coach) — the SAME RAG v9 objection brain, but not
     * tied to an open lead. The rep is mid-call from any screen and just needs the
     * counter; the rebuttal is grounded in the company's own playbook (prices,
     * offers, closing lines). Returns the lines to say, or null.
     */
    suspend fun coachRebuttal(objection: String, speaksAs: String? = null): String? {
        val prompt = buildString {
            append("On a live sales call, the customer just objected: \"")
            append(objection.trim().take(300))
            append("\".\n")
            append("Give me the EXACT words to say back — a warm, confident counter in Hinglish ")
            append("(Roman script, how an Indian telecaller actually speaks). 2-3 short lines, ready to say out loud. ")
            append("Address the customer respectfully with 'aap' — never tu/tum. ")
            append("Ground it in our company's real facts (a price, an offer, a project USP, or a line from a call that closed) — ")
            append(voiceRule(speaksAs))
            append("quote the fact if we have it; if we don't, give the best honest counter. ")
            append("Finish with one question that nudges the customer to the next step. No preamble — just the lines to say.")
        }
        return assistantChat(listOf(ChatMsg("user", prompt)), lead = null)
    }

    /**
     * RAG v12 — the "after the call" move. Drafts a ready-to-send WhatsApp
     * follow-up for this lead, grounded in the company's own playbook: warm,
     * professional, respectful (aap-form), never inventing prices. Reuses the
     * assistant-chat RAG brain (company-isolated, Groq — no extra key). Returns
     * the message text, or null.
     */
    suspend fun draftFollowUp(contact: Contact, purpose: String = "follow_up", speaksAs: String? = null): String? {
        // RAG v14 — WhatsApp Smart Templates. Each purpose steers the same
        // company-grounded brain to a different ready-to-send message.
        val goal = when (purpose) {
            "intro" -> "a first-touch introduction right after this enquiry: introduce yourself and the project warmly, and ask for a good time to talk"
            "details" -> "share the project details / brochure highlights the customer wanted (key USPs, configuration, location)"
            "price" -> "share the current price and any live offer or payment scheme for the project"
            "site_visit" -> "invite the customer for a site visit and propose choosing a day and time"
            "festive" -> "a short, warm greeting that keeps the relationship alive — no hard selling"
            else -> "a gentle follow-up after your last conversation, nudging the next step"
        }
        val prompt = buildString {
            append("Write a short, ready-to-send WhatsApp message to this lead. Purpose: ").append(goal).append(".\n")
            append("Warm and professional Hinglish (Roman script, the way an Indian property advisor actually writes on WhatsApp). ")
            append("Address the customer respectfully with 'aap' — never tu/tum. Keep it to 2-4 short lines, WhatsApp-friendly (one or two emojis are fine). ")
            append(voiceRule(speaksAs))
            append("Ground it in our company's real facts (a price, an offer, a project USP, or the next step) — ")
            append("quote a real fact if we have it; never invent a price. ")
            append("End by nudging one clear next step. No preamble — just the message to send.")
        }
        return assistantChat(listOf(ChatMsg("user", prompt)), lead = contact)
    }

    /** RAG v13 — one "Second Chance" pick: a dead lead worth calling again + why + the re-opening line. */
    data class RevivePick(val id: String, val reason: String, val opener: String)

    /**
     * RAG v13 — "Second Chance". Asks the AI to mine the rep's dead pile
     * (lost / not interested / gone-cold, never DNC) for up to five leads a
     * fresh company offer could revive. Returns [] on any failure.
     */
    suspend fun fetchSecondChance(): List<RevivePick> {
        val resp = client.functions.invoke(function = "second-chance", body = buildJsonObject { })
        if (resp.status.value !in 200..299) return emptyList()
        return runCatching {
            val obj = resp.body<JsonObject>()
            if (obj["ok"]?.jsonPrimitive?.booleanOrNull != true) return@runCatching emptyList()
            (obj["picks"] as? kotlinx.serialization.json.JsonArray)?.mapNotNull { el ->
                val p = el as? JsonObject ?: return@mapNotNull null
                val id = p["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                RevivePick(
                    id = id,
                    reason = p["reason"]?.jsonPrimitive?.contentOrNull ?: "",
                    opener = p["opener"]?.jsonPrimitive?.contentOrNull ?: "",
                )
            } ?: emptyList()
        }.getOrDefault(emptyList())
    }

    suspend fun recentCalls(limit: Int = 100): List<CallLog> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("call_logs").select {
            filter { eq("salesperson_id", uid) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<CallLog>()
    }

    /** This salesperson's calls since local midnight (for the Today tracker). */
    /**
     * Today's WORK calls — the number on the home screen and the daily goal.
     *
     * Two things were wrong here. It filtered on created_at, which is when the
     * row reached the database, not when the call happened: the phone's call-log
     * sync backfills a week of history the first time it runs, so a rep who
     * installed the app today saw that whole week counted as today. On a live
     * phone that read "162 calls today" against 18 real ones.
     *
     * And it counted off-CRM calls — the rep's own calls to numbers that aren't
     * leads. The Calls tab hides those, so the count never matched the list
     * underneath it.
     *
     * So: filter by when the call actually STARTED, and count only lead calls.
     */
    suspend fun fetchTodayCalls(): List<CallLog> {
        val uid = currentUserId() ?: return emptyList()
        val start = java.time.LocalDate.now()
            .atStartOfDay(java.time.ZoneId.systemDefault())
            .toInstant().toString()
        return client.from("call_logs").select {
            filter {
                eq("salesperson_id", uid)
                gte("started_at", start)
            }
        }.decodeList<CallLog>().filter { !it.offCrm }
    }

    /** This salesperson's calls since [sinceIso] (null = no lower bound). Newest first. */
    suspend fun fetchCalls(sinceIso: String?, limit: Int = 300): List<CallLog> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("call_logs").select {
            filter {
                eq("salesperson_id", uid)
                if (sinceIso != null) gte("created_at", sinceIso)
            }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<CallLog>()
    }

    /** Full call history for one lead — newest first — for the lead detail page. */
    suspend fun fetchCallsForContact(contactId: String, limit: Int = 50): List<CallLog> {
        return client.from("call_logs").select {
            filter { eq("contact_id", contactId) }
            order("started_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<CallLog>()
    }

    /** Saves a free-text note onto a call log (used by the in-call Notes field). */
    suspend fun setCallNote(callLogId: String, note: String) {
        client.from("call_logs").update(mapOf("notes" to note)) { filter { eq("id", callLogId) } }
    }

    /**
     * Finalises a cloud (SIP) call log with its outcome + talk time. SIM/auto-dial
     * calls insert a complete row up-front, but cloud calls are logged the moment
     * the leg is placed (to attach a recording), so the outcome/duration have to be
     * written back when the call ends — otherwise the call never counts as
     * connected/no-answer in the summary, follow-ups or Today tracker.
     */
    suspend fun updateCallResult(callLogId: String, outcome: String, durationSeconds: Int) {
        client.from("call_logs").update(
            buildJsonObject {
                put("outcome", outcome)
                put("duration_seconds", durationSeconds)
                put("ended_at", java.time.Instant.now().toString())
            },
        ) { filter { eq("id", callLogId) } }
    }

    // ---------- content & reviews trust layer ----------

    /** The company's active shareable content (brochures / videos / reviews). */
    suspend fun fetchContentAssets(): List<ContentAsset> =
        client.from("content_assets").select {
            filter { eq("active", true) }
            order("created_at", Order.DESCENDING)
        }.decodeList()

    /** Creates a tracked share row and returns the token to build the open link. */
    suspend fun createContentShare(assetId: String, contactId: String?, channel: String = "whatsapp"): String? {
        val token = client.postgrest.rpc(
            "create_content_share",
            buildJsonObject {
                put("p_asset_id", assetId)
                put("p_contact_id", contactId)
                put("p_channel", channel)
            },
        ).decodeAs<String>()
        return token.ifBlank { null }
    }

    /** The public, tracked open-link for a share token (opening it reactivates the lead). */
    fun contentOpenUrl(token: String): String = "${getFunctionsUrl()}/content-open?t=$token"

    // ---------- multi-project interest ----------

    suspend fun fetchProjectInterests(contactId: String): List<LeadProjectInterest> =
        client.from("lead_project_interests").select {
            filter { eq("contact_id", contactId) }
            order("created_at", Order.DESCENDING)
        }.decodeList()

    suspend fun addProjectInterest(interest: LeadProjectInterest): LeadProjectInterest? =
        client.from("lead_project_interests").insert(interest) { select() }.decodeSingleOrNull()

    suspend fun deleteProjectInterest(id: String) {
        client.from("lead_project_interests").delete { filter { eq("id", id) } }
    }

    /** Clears an AI disposition suggestion after the rep confirms or dismisses it. */
    suspend fun clearSuggestedDisposition(callLogId: String) {
        client.from("call_logs").update(mapOf("suggested_disposition" to null as String?)) {
            filter { eq("id", callLogId) }
        }
    }

    // ---------- campaigns ----------

    /**
     * Creates a campaign and bulk-inserts its contacts, returning the stored
     * contacts (with ids) ready to be auto-dialed.
     */
    suspend fun createCampaignWithContacts(
        name: String,
        gapSeconds: Int,
        parsed: ParseResult,
    ): List<Contact> {
        val profile = myProfile() ?: error("No profile. Ask your admin to add you to a company.")
        val companyId = profile.companyId ?: error("You are not linked to a company yet.")
        val uid = profile.id

        val campaign = client.from("campaigns").insert(
            Campaign(companyId = companyId, salespersonId = uid, name = name, gapSeconds = gapSeconds),
        ) { select() }.decodeSingle<Campaign>()

        val contacts = parsed.contacts.map {
            Contact(
                companyId = companyId,
                salespersonId = uid,
                campaignId = campaign.id,
                name = it.name,
                phone = it.phone,
                email = it.email,
                companyName = it.companyName,
                notes = it.notes,
                status = "new",
            )
        }
        if (contacts.isEmpty()) return emptyList()
        return client.from("contacts").insert(contacts) { select() }.decodeList<Contact>()
    }

    /**
     * Clones the unanswered / call-back contacts of [sourceCampaignId] into a new
     * "Follow-up" campaign to be called the next day. Returns how many were added.
     */
    suspend fun createFollowUpCampaign(sourceCampaignId: String, gapSeconds: Int): Int {
        val profile = myProfile() ?: return 0
        val companyId = profile.companyId ?: return 0
        val uid = profile.id

        val pending = client.from("contacts").select {
            filter {
                eq("campaign_id", sourceCampaignId)
                isIn("status", listOf("no_answer", "busy", "callback"))
            }
        }.decodeList<Contact>()
        if (pending.isEmpty()) return 0

        val label = "Follow-up " + java.time.LocalDate.now().toString()
        val campaign = client.from("campaigns").insert(
            Campaign(companyId = companyId, salespersonId = uid, name = label, gapSeconds = gapSeconds),
        ) { select() }.decodeSingle<Campaign>()

        // Re-queue the SAME contacts into the follow-up campaign instead of
        // cloning new rows — cloning duplicated leads (and inflated counts /
        // pipeline value) every time a follow-up campaign was created.
        val ids = pending.mapNotNull { it.id }
        if (ids.isEmpty()) return 0
        client.from("contacts").update(
            mapOf("campaign_id" to campaign.id, "status" to "new"),
        ) {
            filter { isIn("id", ids) }
        }
        return ids.size
    }

    suspend fun fetchCampaignStats(): List<CampaignStat> {
        if (currentUserId() == null) return emptyList()
        return client.from("v_campaign_stats").select {
            order("created_at", Order.DESCENDING)
        }.decodeList<CampaignStat>()
    }

    suspend fun deleteCampaign(campaignId: String) {
        // Soft-delete: keep the campaign + its contacts (and notes) so admins /
        // super admins can still review them. Just mark it deleted.
        client.from("campaigns").update(mapOf("deleted_at" to java.time.Instant.now().toString())) {
            filter { eq("id", campaignId) }
        }
    }

    // ---------- company / team ----------

    suspend fun myCompany(): Company? {
        val cid = myProfile()?.companyId ?: return null
        return client.from("companies").select {
            filter { eq("id", cid) }
        }.decodeSingleOrNull<Company>()
    }

    /** This app channel's update policy (super-admin "force update" toggle). */
    suspend fun fetchUpdatePolicy(channel: String): UpdatePolicy =
        runCatching {
            client.from("app_update_policy").select {
                filter { eq("channel", channel) }
            }.decodeSingleOrNull<UpdatePolicy>()
        }.getOrNull() ?: UpdatePolicy()

    /**
     * The canonical stage vocabulary. Ten rows, readable by every authenticated
     * user, cached by the caller for the session — labels and colours come from
     * here so the phone can never disagree with the dashboard about what a
     * stage is called or what colour it is.
     */
    suspend fun fetchLeadStages(): List<LeadStage> =
        runCatching {
            client.from("lead_stages").select {
                order("sort_order", Order.ASCENDING)
            }.decodeList<LeadStage>()
        }.getOrElse { emptyList() }

    /**
     * Every open lead's DERIVED action state for this rep.
     *
     * Deliberately fetched, not computed on the phone. Two client-side
     * definitions of "due" are exactly how the Follow-up tab and the Follow Ups
     * screen ended up disagreeing about the same clock.
     */
    /** Today's arrivals: [arrived] = every call the office has, [toLeads] = the
     *  subset that was to a CRM lead. */
    data class TodaysCalls(val arrived: Int, val toLeads: Int)

    /**
     * How many of MY calls the office actually has for today.
     *
     * COUNTS EVERYTHING THAT ARRIVED, and returns the lead subset separately.
     * The first version excluded off_crm "so the rep's test and the founder's
     * report cannot give different answers" — which sounds right and is the
     * wrong rule for this question. The Daily Pulse asks "how much WORK did this
     * rep do", and a personal call is not work. This self-check asks "are my
     * calls reaching the office", and an off-CRM call reaches it exactly as well
     * as any other.
     *
     * Shweta's phone proved it. Her company has record-all-calls on, she spent
     * the day ringing numbers that aren't CRM leads, and all four of those calls
     * landed in the CRM — where a founder can see them. The test counted zero
     * and told her "your calls are on the phone but the office has none from
     * today", in red, under three green ticks. The plumbing was perfect; the
     * question was wrong.
     *
     * toLeads is still worth knowing — a day of calls with none to a lead is a
     * real thing to tell the rep — but it is a separate sentence, not a fault.
     */
    suspend fun myCallLogCountToday(): TodaysCalls {
        val uid = currentUserId() ?: return TodaysCalls(0, 0)
        val startIst = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"))
            .atStartOfDay(java.time.ZoneId.of("Asia/Kolkata")).toInstant().toString()
        // off_crm split in Kotlin rather than in the query: CallLog carries the
        // field with a default, and this file's proven select/decode shape is
        // columns + decodeList<CallLog>. Inventing filter syntax to save one
        // client-side predicate is how a green diff becomes a red build.
        return runCatching {
            val rows = client.from("call_logs")
                .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw(
                    "id, started_at, off_crm, phone, company_id, salesperson_id",
                )) {
                    filter {
                        eq("salesperson_id", uid)
                        gte("started_at", startIst)
                    }
                }.decodeList<CallLog>()
            TodaysCalls(arrived = rows.size, toLeads = rows.count { !it.offCrm })
        }.getOrDefault(TodaysCalls(0, 0))
    }

    suspend fun fetchWorkStates(salespersonId: String): List<LeadWork> =
        runCatching {
            client.from("v_lead_workstate").select(
                columns = io.github.jan.supabase.postgrest.query.Columns.raw(
                    "contact_id, action_state, due_at, last_call_at, last_call_seconds, calls_total",
                )
            ) {
                filter { eq("salesperson_id", salespersonId) }
            }.decodeList<LeadWork>()
        }.getOrElse { emptyList() }

    suspend fun fetchCampaignContacts(campaignId: String): List<Contact> {
        return client.from("contacts").select {
            filter { eq("campaign_id", campaignId) }
            order("created_at", Order.ASCENDING)
        }.decodeList<Contact>()
    }

    /** Records a salesperson's call outcome (disposition) + optional note. */
    suspend fun setDisposition(contactId: String, status: String, note: String?) {
        val patch = buildMap {
            put("status", status)
            if (note != null) put("notes", note)
        }
        client.from("contacts").update(patch) { filter { eq("id", contactId) } }
    }

    /** Saves custom details / notes for a contact without changing its status. */
    suspend fun setContactNote(contactId: String, note: String) {
        client.from("contacts").update(mapOf("notes" to note)) { filter { eq("id", contactId) } }
    }

    /** Edits the lead's name and/or optional second number, right from the lead page. */
    suspend fun updateLeadIdentity(contactId: String, name: String?, altPhone: String?) {
        client.from("contacts").update(
            mapOf<String, String?>("name" to name, "alt_phone" to altPhone),
        ) { filter { eq("id", contactId) } }
    }

    // ---------- team ----------

    /** Triggers a cloud click-to-call via the Edge Function. Returns the raw JSON response. */
    /** Fetches the tenant's WebRTC softphone config (ext, password, wss, domain) from uroperator. */
    suspend fun getWebrtcConfig(): String {
        val resp = client.functions.invoke("uro-webrtc", buildJsonObject { })
        return resp.bodyAsText()
    }

    suspend fun cloudCall(customerPhone: String, agentId: String, callerId: String): String {
        val resp = client.functions.invoke(
            function = "click-to-call",
            body = buildJsonObject {
                put("customer_phone", customerPhone)
                put("agent_id", agentId)
                put("caller_id", callerId)
            },
        )
        return resp.bodyAsText()
    }

    /** Triggers a CallerDesk click-to-call: the backend asks CallerDesk to ring this
     *  agent's own phone (from their profile) and bridge the customer, recording the
     *  call server-side. No SIP / no VPN. Returns the raw JSON response. */
    suspend fun callerdeskCall(customerPhone: String, contactId: String?, campaignId: String?): String {
        val resp = client.functions.invoke(
            function = "callerdesk-call",
            body = buildJsonObject {
                put("customer_phone", customerPhone)
                if (contactId != null) put("contact_id", contactId)
                if (campaignId != null) put("campaign_id", campaignId)
            },
        )
        return resp.bodyAsText()
    }

    suspend fun joinCompanyByCode(code: String) {
        client.postgrest.rpc(
            "join_company_by_code",
            buildJsonObject { put("p_code", code) },
        )
    }

    /** Updates the rep's own mobile number — the phone CallerDesk rings and bridges. */
    suspend fun updateMyPhone(phone: String) {
        val uid = currentUserId() ?: return
        client.from("profiles").update(buildJsonObject { put("phone", phone.trim()) }) {
            filter { eq("id", uid) }
        }
    }

    /** Saves how this rep refers to themselves in generated Hindi messages. */
    suspend fun updateSpeaksAs(value: String) {
        val uid = currentUserId() ?: return
        client.from("profiles").update(buildJsonObject { put("speaks_as", value) }) {
            filter { eq("id", uid) }
        }
    }

    // ---------- lead pipeline ----------

    /** Every contact this salesperson owns, newest activity first — the pipeline. */
    suspend fun fetchLeads(limit: Int = 500): List<Contact> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("contacts").select {
            filter { eq("salesperson_id", uid) }
            order("updated_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<Contact>()
    }

    /** Leads assigned to me after [sinceIso] (newest first) — for the app-open
     *  "new leads assigned while you were away" catch-up alert. */
    suspend fun fetchNewAssignments(sinceIso: String, limit: Int = 50): List<Contact> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("contacts").select {
            filter {
                eq("salesperson_id", uid)
                gt("assigned_at", sinceIso)
            }
            order("assigned_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<Contact>()
    }

    /** Sets the Hot/Warm/Cold triage flag on a lead. */
    suspend fun setTemperature(contactId: String, temperature: String) {
        client.from("contacts").update(mapOf("temperature" to temperature)) {
            filter { eq("id", contactId) }
        }
    }

    /** Patches any subset of a lead's editable fields (status/temperature/budget/notes). */
    suspend fun updateContact(contactId: String, patch: Map<String, String>) {
        if (patch.isEmpty()) return
        client.from("contacts").update(patch) { filter { eq("id", contactId) } }
    }

    // ---------- lead activity timeline ----------

    /** Appends a "who did what, when" entry to a lead's history. */
    suspend fun logLeadActivity(contactId: String, type: String, detail: String) {
        val uid = currentUserId() ?: return
        val profile = myProfile() ?: return
        val company = profile.companyId ?: return
        client.from("lead_activities").insert(
            LeadActivity(
                companyId = company,
                contactId = contactId,
                actorId = uid,
                actorName = profile.fullName,
                type = type,
                detail = detail,
            ),
        )
    }

    suspend fun fetchLeadActivities(contactId: String, limit: Int = 100): List<LeadActivity> =
        client.from("lead_activities").select {
            filter { eq("contact_id", contactId) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<LeadActivity>()

    // ---------- lead voice notes ----------

    /**
     * Uploads a spoken "how the call went" note to the private voice-notes
     * bucket, inserts its row, kicks off the AI transcript/summary in the
     * background, and stamps the lead's activity timeline. Returns the note.
     */
    suspend fun addVoiceNote(contactId: String, bytes: ByteArray, durationSeconds: Int): LeadVoiceNote? {
        val uid = currentUserId() ?: return null
        val profile = myProfile() ?: return null
        val company = profile.companyId ?: return null
        val path = "$company/$contactId/${java.util.UUID.randomUUID()}.m4a"
        client.storage.from("voice-notes").upload(path, bytes)
        val note = client.from("lead_voice_notes").insert(
            LeadVoiceNote(
                companyId = company,
                contactId = contactId,
                actorId = uid,
                actorName = profile.fullName,
                audioPath = path,
                durationSeconds = durationSeconds,
            ),
        ) { select() }.decodeSingleOrNull<LeadVoiceNote>()
        // The AI twist runs server-side: a DB trigger fires voice-note-ai the
        // moment the row lands (bulletproof — never depends on this device).
        note?.id?.let {
            runCatching {
                logLeadActivity(contactId, "note", "🎤 Voice note (${durationSeconds}s) recorded")
            }
        }
        return note
    }

    /** Re-kicks the AI for a note stuck in "pending" (e.g. trigger hiccup). */
    suspend fun requestVoiceNoteAi(noteId: String) {
        client.functions.invoke(
            function = "voice-note-ai",
            body = buildJsonObject { put("note_id", JsonPrimitive(noteId)) },
        )
    }

    suspend fun fetchVoiceNotes(contactId: String, limit: Int = 50): List<LeadVoiceNote> =
        client.from("lead_voice_notes").select {
            filter { eq("contact_id", contactId) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<LeadVoiceNote>()

    /** Downloads a voice note's audio (RLS/company-scoped) for in-app playback. */
    suspend fun downloadVoiceNote(path: String): ByteArray =
        client.storage.from("voice-notes").downloadAuthenticated(path)

    /**
     * The rep says the visit DID happen, after the fact.
     *
     * markSiteArrival() needs GPS because it proves the rep stood at the site.
     * This is the other half: answering "did they come?" from the office the
     * next morning, where there is no location to read and never will be. It
     * stamps the arrival so the visit stops looking unanswered, and deliberately
     * writes verified = false — it is a rep's word, not a geofence, and the two
     * must never be confused in the numbers.
     */
    suspend fun confirmSiteVisitHappened(contactId: String) {
        client.from("contacts").update(buildJsonObject {
            put("site_visit_arrived_at", java.time.Instant.now().toString())
            put("site_visit_verified", false)
        }) { filter { eq("id", contactId) } }
    }

    /**
     * The rep's own 0-100 read on a lead they have now met at the site.
     *
     * Kept apart from the stage on purpose. "site_visit" says where the lead is;
     * this says how close they are, and those are different facts — two leads
     * can both be "negotiating" with one at 20% and one at 85%. Written the
     * moment the rep moves the slider, with a timestamp, so a forecast can be
     * read as stale ("he said 80% three weeks ago") instead of as current truth.
     */
    suspend fun setCloseProbability(contactId: String, percent: Int) {
        client.from("contacts").update(buildJsonObject {
            put("close_probability", percent.coerceIn(0, 100))
            put("close_probability_at", java.time.Instant.now().toString())
        }) { filter { eq("id", contactId) } }
    }

    /**
     * Records one question the app asked and what the rep said back.
     *
     * Best-effort by design: the caller never waits on it and never fails
     * because of it. The rep's actual work — the stage move, the callback, the
     * note — is already saved by the time this runs; this is only the record of
     * having been asked, and losing one row of that must never cost the rep
     * their answer.
     */
    suspend fun logRepPrompt(
        contactId: String?,
        kind: String,
        answer: String?,
        reason: String? = null,
        probability: Int? = null,
        secondsToAnswer: Int? = null,
        dismissed: Boolean = false,
    ) {
        val uid = currentUserId() ?: return
        val company = myProfile()?.companyId ?: return
        client.from("rep_prompts").insert(
            RepPrompt(
                companyId = company,
                salespersonId = uid,
                contactId = contactId,
                kind = kind,
                answer = answer,
                reason = reason,
                probability = probability,
                secondsToAnswer = secondsToAnswer,
                dismissed = dismissed,
                answeredAt = if (answer != null) java.time.Instant.now().toString() else null,
            ),
        )
    }

    /** Buyer changed their mind: wipe the planned site visit date + project. */
    /**
     * What actually happened at a site visit — the row the whole funnel hangs on.
     *
     * Written to its own table rather than a column, because a serious buyer
     * visits twice and the second visit's reason is the interesting one.
     * [visitedAt] pins the row to a specific visit so a second one does not
     * silently overwrite the first (unique on contact + visited_at).
     *
     * The company is read from the rep's own profile, never passed in: this is
     * the row that decides which project gets called mispriced, and it must not
     * be possible to file it against another tenant.
     */
    suspend fun recordSiteVisitOutcome(
        contactId: String,
        outcome: String,
        note: String? = null,
        visitedAtIso: String? = null,
    ) {
        val profile = myProfile() ?: error("No profile yet.")
        val companyId = profile.companyId ?: error("You are not linked to a company yet.")
        client.from("site_visit_outcomes").upsert(
            buildJsonObject {
                put("company_id", companyId)
                put("contact_id", contactId)
                put("salesperson_id", profile.id)
                put("outcome", outcome)
                note?.trim()?.takeIf { it.isNotBlank() }?.let { put("note", it) }
                put("visited_at", visitedAtIso ?: java.time.Instant.now().toString())
            },
        ) { onConflict = "contact_id,visited_at" }
    }

    /** The money against a won deal, with the date it was taken. */
    suspend fun setTokenAmount(contactId: String, amount: Double) {
        client.from("contacts").update(buildJsonObject {
            put("token_amount", amount)
            put("token_paid_at", java.time.Instant.now().toString())
        }) { filter { eq("id", contactId) } }
    }

    suspend fun clearSiteVisit(contactId: String) {
        client.from("contacts").update(mapOf<String, String?>("site_visit_at" to null, "site_visit_project" to null)) {
            filter { eq("id", contactId) }
        }
    }

    /** Creates one lead, owned by the current rep's company. Returns the new row. */
    suspend fun addLead(name: String, phone: String, project: String?, budget: String?, note: String?): Contact {
        val profile = myProfile() ?: error("No profile yet. Ask your admin to add you to a company.")
        val companyId = profile.companyId ?: error("You are not linked to a company yet.")
        val contact = Contact(
            companyId = companyId,
            salespersonId = profile.id,
            name = name.trim().ifBlank { null },
            phone = phone.trim(),
            companyName = project?.trim()?.ifBlank { null },
            budget = budget?.trim()?.ifBlank { null },
            notes = note?.trim()?.ifBlank { null },
            status = "new",
        )
        return client.from("contacts").insert(contact) { select() }.decodeSingle<Contact>()
    }

    // ---------- push notifications ----------

    /** Registers (or refreshes) this device's FCM token so notify-rep can target it. */
    suspend fun registerDeviceToken(token: String) {
        if (token.isBlank()) return
        val uid = currentUserId() ?: return
        val companyId = runCatching { myProfile()?.companyId }.getOrNull()
        runCatching {
            client.from("device_tokens").upsert(buildJsonObject {
                put("token", token)
                put("user_id", uid)
                if (companyId != null) put("company_id", companyId)
                put("platform", "android")
                put("updated_at", java.time.Instant.now().toString())
            }) { onConflict = "token" }
        }
    }

    /** Removes this device's token on logout so pushes for the old login can
     *  never ring on a phone someone else signs into next. */
    suspend fun unregisterDeviceToken(token: String) {
        if (token.isBlank()) return
        runCatching {
            client.from("device_tokens").delete { filter { eq("token", token) } }
        }
    }

    // ---------- site-visit geofencing ----------

    /** All of the company's pinned project sites (RLS scopes to the company). */
    suspend fun fetchProjectSites(): List<ProjectSite> =
        runCatching { client.from("project_sites").select().decodeList<ProjectSite>() }.getOrDefault(emptyList())

    /** Pins (or re-pins) a project's location. Matches case-insensitively on name. */
    suspend fun upsertProjectSite(companyId: String, name: String, lat: Double, lng: Double, radiusM: Int = 200): ProjectSite? {
        val existing = runCatching {
            client.from("project_sites").select {
                filter { ilike("name", name.trim()) }
                limit(1)
            }.decodeList<ProjectSite>().firstOrNull()
        }.getOrNull()
        return runCatching {
            if (existing?.id != null) {
                client.from("project_sites").update(buildJsonObject {
                    put("lat", lat); put("lng", lng); put("radius_m", radiusM)
                    put("updated_at", java.time.Instant.now().toString())
                }) { filter { eq("id", existing.id) }; select() }.decodeList<ProjectSite>().firstOrNull()
            } else {
                client.from("project_sites").insert(buildJsonObject {
                    put("company_id", companyId); put("name", name.trim())
                    put("lat", lat); put("lng", lng); put("radius_m", radiusM)
                    put("created_by", currentUserId())
                }) { select() }.decodeList<ProjectSite>().firstOrNull()
            }
        }.getOrNull()
    }

    /** Stamps a (verified or not) site-visit arrival on the lead. */
    suspend fun markSiteArrival(contactId: String, lat: Double, lng: Double, distanceM: Int, verified: Boolean) {
        client.from("contacts").update(buildJsonObject {
            put("site_visit_arrived_at", java.time.Instant.now().toString())
            put("site_visit_arrived_lat", lat)
            put("site_visit_arrived_lng", lng)
            put("site_visit_distance_m", distanceM)
            put("site_visit_verified", verified)
        }) { filter { eq("id", contactId) } }
    }

    /** Records how many times this lead was tried without a real conversation. */
    suspend fun setAttempts(contactId: String, attempts: Int) {
        client.from("contacts").update(mapOf("attempts" to attempts)) { filter { eq("id", contactId) } }
    }

    // ---------- wada (AI-extracted call commitments) ----------

    /** Marks a call's wada as "applied" or "dismissed" after the rep's one tap. */
    suspend fun setWadaState(callLogId: String, state: String) {
        client.from("call_logs").update(mapOf("wada_state" to state)) { filter { eq("id", callLogId) } }
    }

    /**
     * Writes the facts the AI heard onto the lead: budget fills the budget field
     * (only if the rep hasn't already typed one), everything else lands as one
     * appended note line — never overwriting human input.
     */
    suspend fun applyWadaFacts(contact: Contact, wada: Wada) {
        val contactId = contact.id ?: return
        val updates = mutableMapOf<String, String>()
        if (!wada.budget.isNullOrBlank() && contact.budget.isNullOrBlank()) {
            updates["budget"] = wada.budget
        }
        val factLine = buildString {
            wada.preferences?.let { append("Chahiye: $it") }
            if (wada.objections.isNotEmpty()) {
                if (isNotEmpty()) append(" · ")
                append("Atka: ${wada.objections.joinToString(", ")}")
            }
            wada.timeline?.let {
                if (isNotEmpty()) append(" · ")
                append("Kab tak: $it")
            }
        }
        if (factLine.isNotBlank()) {
            val existing = contact.notes.orEmpty()
            // Don't stack the same auto-line on every re-confirm.
            if (!existing.contains(factLine)) {
                updates["notes"] = if (existing.isBlank()) "🤖 $factLine" else "$existing\n🤖 $factLine"
            }
        }
        if (updates.isNotEmpty()) {
            client.from("contacts").update(updates.toMap()) { filter { eq("id", contactId) } }
        }
    }

    // ---------- follow-ups ----------

    /** Schedules a callback for a lead at [dueAtIso]. Returns the stored row (with id). */
    suspend fun scheduleFollowUp(
        contactId: String?,
        phone: String,
        name: String?,
        dueAtIso: String,
        note: String?,
        /** false = auto-retry for a lead nobody answered: it must STAY in the
         *  New bucket, so don't stamp the "follow_up" status on the contact. */
        mirrorStatus: Boolean = true,
    ): FollowUp? {
        val profile = myProfile() ?: error("No profile. Ask your admin to add you to a company.")
        val companyId = profile.companyId ?: error("You are not linked to a company yet.")
        val fu = FollowUp(
            companyId = companyId,
            salespersonId = profile.id,
            contactId = contactId,
            phone = phone,
            name = name,
            dueAt = dueAtIso,
            note = note,
        )
        // Mirror the lead's stage so the pipeline shows it as a scheduled follow-up.
        if (mirrorStatus && contactId != null) runCatching { setDisposition(contactId, "follow_up", null) }
        // One lead = one pending follow-up: re-scheduling moves the existing
        // reminder instead of stacking a second row (auto-retries included).
        if (contactId != null) {
            val existing = runCatching {
                client.from("follow_ups").select {
                    filter { eq("contact_id", contactId); eq("status", "pending") }
                    order("created_at", Order.DESCENDING)
                    limit(1)
                }.decodeList<FollowUp>().firstOrNull()
            }.getOrNull()
            val existingId = existing?.id
            if (existingId != null) {
                client.from("follow_ups").update(mapOf("due_at" to dueAtIso, "note" to note)) {
                    filter { eq("id", existingId) }
                }
                return existing.copy(dueAt = dueAtIso, note = note)
            }
        }
        return client.from("follow_ups").insert(fu) { select() }.decodeSingleOrNull<FollowUp>()
    }

    /** This salesperson's follow-ups, soonest-due first. [includeDone] keeps history. */
    suspend fun fetchFollowUps(includeDone: Boolean = false): List<FollowUp> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("follow_ups").select {
            filter {
                eq("salesperson_id", uid)
                if (!includeDone) eq("status", "pending")
            }
            order("due_at", Order.ASCENDING)
            limit(300L)
        }.decodeList<FollowUp>()
    }

    /** Marks a follow-up done (after the callback has been made). */
    suspend fun completeFollowUp(id: String) {
        client.from("follow_ups").update(
            mapOf("status" to "done", "completed_at" to java.time.Instant.now().toString()),
        ) { filter { eq("id", id) } }
    }

    /** Moves a pending follow-up to a new due time (stays pending). */
    suspend fun rescheduleFollowUp(id: String, dueAtIso: String) {
        client.from("follow_ups").update(mapOf("due_at" to dueAtIso)) { filter { eq("id", id) } }
    }

    // ---------- attendance ----------

    /** Today's attendance row for this salesperson, or null if not punched in yet. */
    suspend fun todayAttendance(): Attendance? {
        val uid = currentUserId() ?: return null
        val today = java.time.LocalDate.now().toString()
        return client.from("attendance").select {
            filter { eq("salesperson_id", uid); eq("work_date", today) }
        }.decodeSingleOrNull<Attendance>()
    }

    /** Punches in for today with an optional selfie + GPS proof
     *  (idempotent — returns the existing row if already punched in). */
    suspend fun punchIn(
        selfie: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        locationLabel: String? = null,
    ): Attendance? {
        val existing = todayAttendance()
        if (existing != null) return existing
        val profile = myProfile() ?: error("No profile.")
        val companyId = profile.companyId ?: error("You are not linked to a company yet.")
        val row = Attendance(
            companyId = companyId,
            salespersonId = profile.id,
            punchInAt = java.time.Instant.now().toString(),
            punchInLat = lat,
            punchInLng = lng,
            selfie = selfie,
            locationLabel = locationLabel,
        )
        return client.from("attendance").insert(row) { select() }.decodeSingleOrNull<Attendance>()
    }

    /** Recent attendance rows for this salesperson (for the history list). */
    suspend fun recentAttendance(limit: Int = 14): List<Attendance> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("attendance").select {
            filter { eq("salesperson_id", uid) }
            order("work_date", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<Attendance>()
    }

    /** Punches out of today's shift. Returns the updated row. */
    suspend fun punchOut(): Attendance? {
        val existing = todayAttendance() ?: return null
        val id = existing.id ?: return existing
        return client.from("attendance").update(
            mapOf("punch_out_at" to java.time.Instant.now().toString()),
        ) { filter { eq("id", id) }; select() }.decodeSingleOrNull<Attendance>()
    }

    // ---------- leaderboard ----------

    /** Company rankings for [period] = "today" | "week" (via SECURITY DEFINER RPC). */
    suspend fun fetchLeaderboard(period: String): List<LeaderboardRow> {
        if (currentUserId() == null) return emptyList()
        return client.postgrest.rpc(
            "get_team_leaderboard",
            buildJsonObject { put("p_period", JsonPrimitive(period)) },
        ).decodeList<LeaderboardRow>()
    }

    // ---------- handing a lead to a colleague ----------

    /** The other telecallers in this rep's company, name and id only. */
    suspend fun fetchTeammates(): List<Teammate> {
        if (currentUserId() == null) return emptyList()
        return client.postgrest.rpc("my_teammates").decodeList<Teammate>()
    }

    /**
     * Give leads to a colleague. Returns how many actually moved.
     *
     * The RPC is the only door on purpose: a straight update of
     * contacts.salesperson_id moves the NAME on the lead and leaves the work
     * behind, because follow_ups carries its own salesperson_id and that is what
     * builds a rep's day. reassign_contacts moves both, and refuses a target who
     * is not in the same company as the leads.
     */
    suspend fun handOverLeads(contactIds: List<String>, toSalespersonId: String): Int {
        if (contactIds.isEmpty()) return 0
        return client.postgrest.rpc(
            "reassign_contacts",
            buildJsonObject {
                put("p_contact_ids", buildJsonArray { contactIds.forEach { add(JsonPrimitive(it)) } })
                put("p_salesperson_id", JsonPrimitive(toSalespersonId))
            },
        ).decodeAs<Int>()
    }
}

