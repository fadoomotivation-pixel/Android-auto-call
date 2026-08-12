package com.salesautocall.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

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
    /** How this rep refers to themselves in generated Hindi messages:
     *  "f" = kar rahi hoon, "m" = kar raha hoon, null/"neutral" = kar rahe hain. */
    @SerialName("speaks_as") val speaksAs: String? = null,
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
    /**
     * The LAST DISPOSITION — what happened on the most recent call.
     *
     * This used to carry the lifecycle position too, and the two fought: a
     * no-answer on an interested lead overwrote the qualification and it was
     * gone. It is now only ever "what happened last time"; where the deal is
     * lives in [stage].
     */
    val status: String = "new",
    /**
     * WHERE THE DEAL IS. Maintained by the database from [status] and never
     * allowed to move backwards (migration 0143). Joins to `lead_stages`, which
     * owns its label, colour and meaning — the app must not decide any of that
     * for itself, or the phone and the dashboard drift apart again.
     */
    val stage: String = "new",
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
    /** The rep's own 0-100 read on how likely this lead is to buy, given after
     *  they have met at the site. A stage says where the lead IS; this says how
     *  close they are, which is the number a manager actually sorts by. */
    @SerialName("close_probability") val closeProbability: Int? = null,
    @SerialName("close_probability_at") val closeProbabilityAt: String? = null,
    /**
     * EVERYTHING THE CUSTOMER ACTUALLY ANSWERED, exactly as the source sent it.
     *
     * facebook-poll has always stored the whole lead form under
     * extra.raw_fields, and the phone has never asked for it. The "dholera
     * vishesh" form asks three questions — budget, purpose, and whether they
     * want a site visit this month — and a rep opening that lead saw only the
     * budget. "Industrial, just information" and "future home, this month" are
     * the same card today, and they are not the same call.
     *
     * Read-only on the phone: the app never writes it back, so a locally built
     * Contact leaves it null and bulk inserts keep one shared key set.
     */
    val extra: JsonObject? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("assigned_at") val assignedAt: String? = null,
    /** When this lead was last CALLED (any direction). A call alone is not work:
     *  a mis-tap stamps this too, which is why it no longer moves a lead. */
    @SerialName("last_contacted_at") val lastContactedAt: String? = null,
    /** When the rep actually RECORDED an outcome — a funnel status, a voice note,
     *  a typed note or a booked callback. This is what moves a lead out of New. */
    @SerialName("handled_at") val handledAt: String? = null,
)

/**
 * One row of `lead_stages` — the canonical lifecycle vocabulary.
 *
 * The app used to declare its own seven-stage list AND a separate set of eight
 * tab buckets, neither of which matched the web dashboard's nine chips. All
 * three now read these rows, so a count on the phone and a count on the web are
 * the same number by construction.
 */
@Serializable
data class LeadStage(
    val code: String,
    val label: String,
    /** The name a narrow surface uses (a phone filter chip). Canonical too —
     *  see migration 0149; the app must not invent its own abbreviations. */
    @SerialName("short_label") val shortLabel: String = "",
    val color: String,
    @SerialName("sort_order") val sortOrder: Int,
    @SerialName("is_terminal") val isTerminal: Boolean = false,
    /** "open" | "won" | "lost" | "excluded" */
    val outcome: String = "open",
    /** Deal in motion: past qualification, before the close. "Pipeline". */
    @SerialName("is_pipeline") val isPipeline: Boolean = false,
    @SerialName("is_advanced") val isAdvanced: Boolean = false,
    @SerialName("counts_as_sale") val countsAsSale: Boolean = false,
    @SerialName("rep_visible") val repVisible: Boolean = true,
)

/**
 * A lead's DERIVED action state, from `v_lead_action_state`.
 *
 * Fetched rather than computed. The app computing "is this due" itself is how
 * the Follow-up tab and the Follow Ups screen came to disagree about the same
 * clock; there is one definition and it lives in the database.
 */
@Serializable
data class LeadWork(
    @SerialName("contact_id") val contactId: String,
    /** overdue | call_now | due_today | scheduled | awaiting_visit | no_next_step | none */
    @SerialName("action_state") val actionState: String,
    @SerialName("due_at") val dueAt: String? = null,
    /** The last real dial (off-CRM calls excluded) and how long it lasted.
     *  Duration is what separates a conversation from a ring-out: on the day
     *  this shipped, 170 of 419 called leads had a last call under 30 seconds. */
    @SerialName("last_call_at") val lastCallAt: String? = null,
    @SerialName("last_call_seconds") val lastCallSeconds: Int = 0,
    @SerialName("calls_total") val callsTotal: Int = 0,
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

/**
 * The 7pm day review, built by rep-coach and cached there for the day.
 *
 * Every count is counted server-side, never estimated — a rep will argue with a
 * score, and they have to be able to win that argument by pointing at their own
 * call list. [wins] and [improve] are the only parts the model writes.
 */
data class DayReview(
    /** 0-10, one decimal. Null when there were no calls to score. */
    val score: Double?,
    val calls: Int,
    val connected: Int,
    /** Calls long enough to have been a real conversation, not a brush-off. */
    val conversations: Int,
    val visitsFixed: Int,
    val bookings: Int,
    val wins: List<String>,
    /** The habit that repeated today, and the exact words to use instead. Null
     *  when the day showed no real repeated weakness — never invented. */
    val improve: DayReviewImprove?,
    /** Tomorrow's first calls, most urgent first. */
    val priorities: List<DayReviewPriority>,
    /** The day's highest- and lowest-rated call. Both null unless at least two
     *  calls were rated and they actually differ — with one rated call, the
     *  "worst call of the day" is also the best one. */
    val bestCall: DayReviewCall? = null,
    val worstCall: DayReviewCall? = null,
)
data class DayReviewImprove(val pattern: String, val say: String)
data class DayReviewPriority(val lead: String, val why: String)
/** One end of the day's call range: who it was with, its honest 1-5 rating, and
 *  the line the coach already wrote about it. */
data class DayReviewCall(val lead: String?, val rating: Int, val why: String?)

/** A single rating row from coach_feedback — used to compute the Home calling score. */
@Serializable
data class RatingRow(val rating: Int? = null)

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

/**
 * A colleague this rep can hand a lead to (from the my_teammates RPC).
 *
 * Name and id only, on purpose. A rep cannot read a teammate's profile row —
 * RLS gives them their own and nothing else — so this comes through a narrow
 * SECURITY DEFINER function that returns exactly what a picker needs. No phone,
 * no email. Widening the profile policy for the sake of a dropdown would have
 * handed every rep every colleague's number.
 */
@Serializable
data class Teammate(
    val id: String,
    @SerialName("full_name") val fullName: String = "Telecaller",
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

/**
 * One question the app asked the rep, and what came back.
 *
 * Stored for two reasons and only two: so a question is never asked twice, and
 * so the pattern of answers ("busy" every time a callback slips, 90% on every
 * site visit that never books) can be read back as coaching material. It is a
 * discipline record, not a scoreboard.
 */
@Serializable
data class RepPrompt(
    val id: String? = null,
    @SerialName("company_id") val companyId: String,
    @SerialName("salesperson_id") val salespersonId: String,
    @SerialName("contact_id") val contactId: String? = null,
    /** "visit_check" | "callback_check" | "day_review" */
    val kind: String,
    /** "came" | "no_show" | "postponed" | "called" | "not_yet" | "reviewed" | "skipped" */
    val answer: String? = null,
    val reason: String? = null,
    val probability: Int? = null,
    @SerialName("seconds_to_answer") val secondsToAnswer: Int? = null,
    val dismissed: Boolean = false,
    @SerialName("answered_at") val answeredAt: String? = null,
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
