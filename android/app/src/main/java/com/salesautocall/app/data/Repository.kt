package com.salesautocall.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Thin data-access layer over Supabase. All reads/writes are constrained by
 * Row-Level Security on the server, so the salesperson only ever sees their own
 * company's data and their own assigned contacts.
 */
object Repository {

    private val client get() = Supabase.client

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

    /** Uploads a recording file to the recording-upload edge function, which streams
     *  it to the company's Google Drive and marks the call log ready. */
    suspend fun uploadRecording(callLogId: String, source: String, durationSeconds: Int, bytes: ByteArray): String {
        val resp = client.functions.invoke("recording-upload") {
            header("x-call-id", callLogId)
            header("x-source", source)
            header("x-duration", durationSeconds.toString())
            header("Content-Type", "application/octet-stream")
            setBody(bytes)
        }
        return resp.bodyAsText()
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

    suspend fun recentCalls(limit: Int = 100): List<CallLog> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("call_logs").select {
            filter { eq("salesperson_id", uid) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<CallLog>()
    }

    /** This salesperson's calls since local midnight (for the Today tracker). */
    suspend fun fetchTodayCalls(): List<CallLog> {
        val uid = currentUserId() ?: return emptyList()
        val start = java.time.LocalDate.now()
            .atStartOfDay(java.time.ZoneId.systemDefault())
            .toInstant().toString()
        return client.from("call_logs").select {
            filter {
                eq("salesperson_id", uid)
                gte("created_at", start)
            }
        }.decodeList<CallLog>()
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

    /** Saves a free-text note onto a call log (used by the in-call Notes field). */
    suspend fun setCallNote(callLogId: String, note: String) {
        client.from("call_logs").update(mapOf("notes" to note)) { filter { eq("id", callLogId) } }
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

        val clones = pending.map {
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
        client.from("contacts").insert(clones)
        return clones.size
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

    suspend fun joinCompanyByCode(code: String) {
        client.postgrest.rpc(
            "join_company_by_code",
            buildJsonObject { put("p_code", code) },
        )
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

    // ---------- follow-ups ----------

    /** Schedules a callback for a lead at [dueAtIso]. Returns the stored row (with id). */
    suspend fun scheduleFollowUp(
        contactId: String?,
        phone: String,
        name: String?,
        dueAtIso: String,
        note: String?,
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
        if (contactId != null) runCatching { setDisposition(contactId, "follow_up", null) }
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
}

