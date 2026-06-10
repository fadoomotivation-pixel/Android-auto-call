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
)
