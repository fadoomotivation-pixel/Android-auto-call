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
    // Workplace monitoring: when on, the work phone syncs EVERY call (even
    // numbers not in the CRM) so the admin can see off-CRM calling. The app
    // shows the telecaller a clear notice when this is enabled.
    @SerialName("record_all_calls") val recordAllCalls: Boolean = false,
    // White-label branding — the app wears the company's colours (name always;
    // colour/logo when the company has set them).
    @SerialName("brand_color") val brandColor: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
)

/** Per-channel update policy set by the super-admin (web): force everyone to update. */
@Serializable
data class UpdatePolicy(
    val force: Boolean = false,
    @SerialName("min_version_code") val minVersionCode: Int = 0,
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
    val territory: String? = null,
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
    /** Optional second number the rep captured for this lead. */
    @SerialName("alt_phone") val altPhone: String? = null,
    val email: String? = null,
    @SerialName("company_name") val companyName: String? = null,
    val notes: String? = null,
    val status: String = "new",
    /** Lead triage: "hot" | "warm" | "cold" (null = not scored yet). */
    val temperature: String? = null,
    /** Free-text budget the rep captured (e.g. "₹45L", "1.2 Cr"). */
    val budget: String? = null,
    /** No-connect tries so far (no answer / busy / wrong person). Drives the
     *  attempt ladder: next-day retries, cold after 3 straight misses. */
    val attempts: Int = 0,
    /** AI-suggested next step for this lead (one short line); null = not scored. */
    @SerialName("ai_next_action") val aiNextAction: String? = null,
    @SerialName("ai_scored_at") val aiScoredAt: String? = null,
    val territory: String? = null,
    @SerialName("site_visit_at") val siteVisitAt: String? = null,
    @SerialName("site_visit_project") val siteVisitProject: String? = null,
    /** Booking/token amount collected when the lead reaches the "Token Paid" stage. */
    @SerialName("token_amount") val tokenAmount: Double? = null,
    @SerialName("token_paid_at") val tokenPaidAt: String? = null,
    /** Geo-fenced site-visit arrival: when the rep tapped "Arrived", and whether
     *  their GPS was within the project's radius (true = verified on site). */
    @SerialName("site_visit_arrived_at") val siteVisitArrivedAt: String? = null,
    @SerialName("site_visit_distance_m") val siteVisitDistanceM: Int? = null,
    @SerialName("site_visit_verified") val siteVisitVerified: Boolean? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("assigned_at") val assignedAt: String? = null,
    /** When this lead was last CALLED (any direction) — drives the "Today" view. */
    @SerialName("last_contacted_at") val lastContactedAt: String? = null,
)

/** A company project's pinned location, used to geo-fence site-visit arrivals. */
@Serializable
data class ProjectSite(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    @SerialName("radius_m") val radiusM: Int = 200,
    @SerialName("created_at") val createdAt: String? = null,
)

/** One turn in the in-app AI assistant chat (local only). */
data class ChatMsg(val role: String, val content: String)

/** What the floating AI Coach shows: last-call feedback + the day brief. */
data class CoachCallFeedback(
    val good: String?,
    val improve: String?,
    /** Honest 1-5 rating of the last call (null = not scored). */
    val rating: Int? = null,
    val callAt: String?,
    val leadName: String?,
)
data class CoachBrief(val slot: String, val content: String)
/** The floating coach panel: last-call feedback, the day brief, and ONE daily
 *  tip (grounded in the company brain — guidebook + past wins). */
data class CoachPanel(val coaching: CoachCallFeedback?, val brief: CoachBrief?, val tip: String? = null)

/** One "Aaj ke 5" pick — the AI's next-best call with a ready-to-speak opener. */
data class FocusPick(val contactId: String, val reason: String, val opener: String)

/** One WhatsApp message (either direction) shown in the in-app chat thread. */
@Serializable
data class WhatsAppMessage(
    val id: String? = null,
    @SerialName("contact_id") val contactId: String? = null,
    val direction: String = "out",
    val body: String? = null,
    val status: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
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
    @SerialName("punch_in_lat") val punchInLat: Double? = null,
    @SerialName("punch_in_lng") val punchInLng: Double? = null,
    val selfie: String? = null,
    @SerialName("location_label") val locationLabel: String? = null,
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

/** A telecaller's spoken note about a lead ("kya baat hui"), with the AI twist. */
@Serializable
data class LeadVoiceNote(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("contact_id") val contactId: String,
    @SerialName("actor_id") val actorId: String? = null,
    @SerialName("actor_name") val actorName: String? = null,
    @SerialName("audio_path") val audioPath: String,
    @SerialName("duration_seconds") val durationSeconds: Int = 0,
    val transcript: String? = null,
    val summary: String? = null,
    @SerialName("suggested_disposition") val suggestedDisposition: String? = null,
    /** pending | processing | ready | failed */
    @SerialName("ai_status") val aiStatus: String = "pending",
    @SerialName("created_at") val createdAt: String? = null,
)

/** One entry in a lead's activity timeline (what the telecaller did, and when). */
@Serializable
data class LeadActivity(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("contact_id") val contactId: String,
    @SerialName("actor_id") val actorId: String? = null,
    @SerialName("actor_name") val actorName: String? = null,
    val type: String = "update",
    val detail: String,
    @SerialName("created_at") val createdAt: String? = null,
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
    /** True when captured by record-all-calls and the number isn't a CRM lead. */
    @SerialName("off_crm") val offCrm: Boolean = false,
    val summary: String? = null,
    @SerialName("summary_status") val summaryStatus: String? = null,
    @SerialName("suggested_disposition") val suggestedDisposition: String? = null,
    /** "Wada": commitments/facts the AI heard on this call (null = none found). */
    @SerialName("ai_actions") val aiActions: Wada? = null,
    /** null | "pending" (awaiting the rep's one-tap confirm) | "applied" | "dismissed" */
    @SerialName("wada_state") val wadaState: String? = null,
)

/** Spoken commitments/facts the AI extracted from one call recording. */
@Serializable
data class Wada(
    /** ISO datetime the telecaller promised to call back (validated server-side). */
    @SerialName("promise_at") val promiseAt: String? = null,
    @SerialName("promise_note") val promiseNote: String? = null,
    val budget: String? = null,
    val preferences: String? = null,
    val objections: List<String> = emptyList(),
    val timeline: String? = null,
)

/** A shareable trust asset (brochure / video / review / testimonial) the rep can
 *  send to a buyer as a tracked link. Curated by the admin in the web dashboard. */
@Serializable
data class ContentAsset(
    val id: String,
    @SerialName("company_id") val companyId: String? = null,
    val kind: String = "link",
    val title: String,
    val url: String,
    val description: String? = null,
    val active: Boolean = true,
)

/** One project a buyer is interested in, with its own stage/budget/site-visit —
 *  lets a single lead carry a non-linear journey across several projects. */
@Serializable
data class LeadProjectInterest(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("contact_id") val contactId: String,
    val project: String,
    val stage: String = "new",
    val budget: String? = null,
    val temperature: String? = null,
    @SerialName("site_visit_at") val siteVisitAt: String? = null,
    val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)
