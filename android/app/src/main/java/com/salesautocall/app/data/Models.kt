package com.salesautocall.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class WebrtcConfig(
    val ok: Boolean = false,
    val ext: String = "",
    val password: String = "",
    val wss: String = "",
    val domain: String = "",
    // SIP-UDP registration details (for the native softphone).
    @SerialName("sip_server") val sipServer: String = "",
    @SerialName("sip_port") val sipPort: Int = 0,
    val transport: String = "",
    val error: String? = null,
)

@Serializable
data class CloudCallRequest(
    val customer_phone: String,
    val agent_id: String,
    val caller_id: String,
)

@Serializable
data class Company(
    val id: String,
    val name: String,
    @SerialName("join_code") val joinCode: String? = null,
    @SerialName("recording_enabled") val recordingEnabled: Boolean = true,
)

@Serializable
data class Profile(
    val id: String,
    @SerialName("company_id") val companyId: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val phone: String? = null,
    val role: String = "salesperson",
    @SerialName("sip_agent_id") val sipAgentId: String? = null,
    @SerialName("caller_id") val callerId: String? = null,
)

@Serializable
data class Campaign(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    val name: String,
    @SerialName("gap_seconds") val gapSeconds: Int = 5,
    val status: String = "active",
)

/** Backed by the v_campaign_stats view — drives the Analytics screen. */
@Serializable
data class CampaignStat(
    @SerialName("campaign_id") val campaignId: String,
    val name: String,
    @SerialName("gap_seconds") val gapSeconds: Int = 5,
    @SerialName("created_at") val createdAt: String? = null,
    val total: Int = 0,
    val completed: Int = 0,
)

@Serializable
data class Contact(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String? = null,
    @SerialName("campaign_id") val campaignId: String? = null,
    val name: String? = null,
    val phone: String,
    val email: String? = null,
    @SerialName("company_name") val companyName: String? = null,
    val notes: String? = null,
    val status: String = "new",
    /** Lead triage: "hot" | "warm" | "cold" (null = not scored yet). */
    val temperature: String? = null,
)

/** A scheduled callback for a lead. Drives the Follow-ups worklist + reminders. */
@Serializable
data class FollowUp(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    @SerialName("contact_id") val contactId: String? = null,
    val phone: String,
    val name: String? = null,
    @SerialName("due_at") val dueAt: String,
    val note: String? = null,
    val status: String = "pending",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
)

/** A salesperson's daily shift record (punch in / punch out). */
@Serializable
data class Attendance(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    @SerialName("work_date") val workDate: String? = null,
    @SerialName("punch_in_at") val punchInAt: String? = null,
    @SerialName("punch_out_at") val punchOutAt: String? = null,
    val status: String = "present",
)

/** One row of the company leaderboard (from the get_team_leaderboard RPC). */
@Serializable
data class LeaderboardRow(
    @SerialName("salesperson_id") val salespersonId: String,
    @SerialName("full_name") val fullName: String? = null,
    val calls: Int = 0,
    val connected: Int = 0,
    @SerialName("talk_seconds") val talkSeconds: Int = 0,
    val leads: Int = 0,
)

@Serializable
data class CallLog(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    @SerialName("campaign_id") val campaignId: String? = null,
    @SerialName("contact_id") val contactId: String? = null,
    val phone: String,
    val direction: String = "outgoing",
    val outcome: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("duration_seconds") val durationSeconds: Int = 0,
    @SerialName("sim_slot") val simSlot: Int? = null,
    val notes: String? = null,
    @SerialName("recording_status") val recordingStatus: String = "none",
    @SerialName("recording_seconds") val recordingSeconds: Int? = null,
    @SerialName("recording_source") val recordingSource: String? = null,
)
