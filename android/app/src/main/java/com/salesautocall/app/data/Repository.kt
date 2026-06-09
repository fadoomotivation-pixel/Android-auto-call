package com.salesautocall.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Thin data-access layer over Supabase. All reads/writes are constrained by
 * Row-Level Security on the server, so the salesperson only ever sees their own
 * company's data and their own assigned contacts.
 */
object Repository {

    private val client get() = Supabase.client

    // ---------- auth ----------

    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signUp(email: String, password: String, fullName: String, phone: String) {
        client.auth.signUpWith(Email) {
            this.email = email
            this.password = password
            data = buildJsonObject {
                put("full_name", JsonPrimitive(fullName))
                put("phone", JsonPrimitive(phone))
                put("role", JsonPrimitive("salesperson"))
            }
        }
    }

    suspend fun signOut() = client.auth.signOut()

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

    suspend fun logCall(log: CallLog) {
        client.from("call_logs").insert(log)
    }

    suspend fun recentCalls(limit: Int = 100): List<CallLog> {
        val uid = currentUserId() ?: return emptyList()
        return client.from("call_logs").select {
            filter { eq("salesperson_id", uid) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList<CallLog>()
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
        // Remove the campaign's contacts first, then the campaign itself.
        client.from("contacts").delete { filter { eq("campaign_id", campaignId) } }
        client.from("campaigns").delete { filter { eq("id", campaignId) } }
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

    suspend fun joinCompanyByCode(code: String) {
        client.postgrest.rpc(
            "join_company_by_code",
            buildJsonObject { put("p_code", code) },
        )
    }
}

