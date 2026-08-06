package com.salesautocall.app.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.Attendance
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.LeadStage
import com.salesautocall.app.data.LeadWork
import com.salesautocall.app.data.ChatMsg
import com.salesautocall.app.data.CampaignStat
import com.salesautocall.app.data.Company
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.ContactImport
import com.salesautocall.app.data.ContentAsset
import com.salesautocall.app.data.DayReview
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.data.LeadProjectInterest
import com.salesautocall.app.data.LeaderboardRow
import com.salesautocall.app.data.ParseResult
import com.salesautocall.app.data.Profile
import com.salesautocall.app.data.ProjectSite
import com.salesautocall.app.data.Repository
import com.salesautocall.app.data.WhatsAppMessage
import com.salesautocall.app.notify.FollowUpReminder
import com.salesautocall.app.update.AppUpdater
import com.salesautocall.app.dialer.AutoDialerService
import com.salesautocall.app.dialer.DialerConfig
import com.salesautocall.app.dialer.DialerController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AppState(
    val loading: Boolean = false,
    // False until the saved session (and, if signed in, profile + company) has
    // been restored. Gates the UI on a splash so cold start never flashes the
    // login → join-company → app sequence.
    val authResolved: Boolean = false,
    val signedIn: Boolean = false,
    val profile: Profile? = null,
    val company: Company? = null,
    val campaigns: List<CampaignStat> = emptyList(),
    val campaignName: String = "",
    val breakSeconds: Int = 5,
    val reviewAfterCall: Boolean = true,
    val dailyGoal: Int = 50,
    val cloudEnabled: Boolean = false,
    val cloudIncomingEnabled: Boolean = false,
    val cloudAgentId: String = "",
    val cloudCallerId: String = "",
    val cloudSipPassword: String = "",
    val cloudSipServer: String = "",
    val cloudSipPort: String = "",
    // CallerDesk one-tap calling: backend rings this agent's phone + bridges the
    // customer (no SIP / no VPN). When on, cloud calls use this instead of SIP.
    val callerdeskCalling: Boolean = false,
    // Auto-pick-up the CallerDesk agent-leg callback so it's truly one-tap.
    // Off → the rep answers the ring by hand (timer/auto-dismiss still work).
    val autoAnswer: Boolean = true,
    // active in-app softphone call
    val cloudCallNumber: String? = null,
    val cloudCallContactId: String? = null,
    val cloudCallCampaignId: String? = null,
    val cloudCallStatus: String = "",
    val cloudBridged: Boolean = false,
    // Wall-clock ms when the cloud call connected (>0 → drives the live call timer).
    val callConnectedAt: Long = 0L,
    val cloudCallExt: String = "",
    val cloudCallPass: String = "",
    val cloudCallLogId: String? = null,
    val todayCalls: Int = 0,
    val todayConnected: Int = 0,
    val todayTalk: Int = 0,
    // Overall calling score (avg of the rep's coached call ratings, 1-5) — shown
    // right up front on Home. Null until at least one call is rated.
    val callingScore: Double? = null,
    val callingScoreCount: Int = 0,
    val followUpInfo: String? = null,
    val followUpDone: Boolean = false,
    val pendingParse: ParseResult? = null,
    val pendingFileName: String? = null,
    val selectedCampaignId: String? = null,
    val selectedCampaignName: String = "",
    val campaignContacts: List<Contact> = emptyList(),
    // telecaller "Calls" tab: history, follow-ups and the summary card
    val callFilter: CallFilter = CallFilter.ALL,
    val callList: List<CallLog> = emptyList(),
    val callsLoading: Boolean = false,
    val recordingSyncing: Boolean = false,
    val recordingSyncMsg: String? = null,
    // Phone's own system call log (every call, in/out/missed) for the fast recents tab.
    val deviceRecents: List<com.salesautocall.app.data.DeviceCall> = emptyList(),
    val callSummary: CallSummary = CallSummary(),
    /** id of the call whose recording is currently playing/loading (null = none). */
    val playingCallId: String? = null,
    /** id of the call whose AI summary is currently being generated (null = none). */
    val summarizingCallId: String? = null,
    // notes typed during an active cloud call
    val inCallNote: String = "",
    // lead pipeline (all my contacts across campaigns)
    val leads: List<Contact> = emptyList(),
    /** The canonical stage vocabulary (labels, colours, order, semantics). */
    val leadStages: List<LeadStage> = emptyList(),
    /** contact id -> its row from v_lead_workstate: the derived action state
     *  AND the last real call. Never computed on the phone — one clock, and it
     *  lives in the database. */
    val workByLead: Map<String, LeadWork> = emptyMap(),
    /** Company project pins, for geo-fencing site-visit arrivals. */
    val projectSites: List<ProjectSite> = emptyList(),
    val leadsLoading: Boolean = false,
    /** True while the AI lead-scoring call is running. */
    val aiScoringLeads: Boolean = false,
    val leadFilter: String = "open",
    /** Set when another screen (e.g. Campaign tab) asks Leads to open in select mode. */
    val leadsSelectRequested: Boolean = false,
    /** Drives the quick "Add lead" sheet + its in-flight saving state. */
    val showAddLead: Boolean = false,
    val addingLead: Boolean = false,
    /** Settings is a full-screen overlay (like lead detail), not a nav route, so
     *  it never lingers behind another screen. */
    val showSettings: Boolean = false,
    /** A bottom-nav tap from inside an overlay (lead detail / settings): the
     *  overlay closes and MainShell switches to this route, then clears it. */
    val pendingTab: String? = null,
    /** "More" tapped from an overlay's bottom bar: close overlays, open the drawer. */
    val pendingDrawer: Boolean = false,
    // in-app WhatsApp chat (tracked via the company number)
    val waChatContact: Contact? = null,
    val waThread: List<WhatsAppMessage> = emptyList(),
    val waLoading: Boolean = false,
    val waSending: Boolean = false,
    val waError: String? = null,
    // shareable content library + a lead's per-project interests
    val contentAssets: List<ContentAsset> = emptyList(),
    val projectInterests: List<LeadProjectInterest> = emptyList(),
    // AI assistant chat
    val assistantMessages: List<ChatMsg> = emptyList(),
    val assistantThinking: Boolean = false,
    // RAG v10 — "coach" (advice) or "roleplay" (AI plays a customer to practice against).
    val assistantMode: String = "coach",
    // follow-up / callback scheduler
    val followUpList: List<FollowUp> = emptyList(),
    val followUpsLoading: Boolean = false,
    // attendance (today's shift)
    val attendance: Attendance? = null,
    val attendanceBusy: Boolean = false,
    val attendanceHistory: List<Attendance> = emptyList(),
    // follow-up calendar (includes completed)
    val calendar: List<FollowUp> = emptyList(),
    val calendarLoading: Boolean = false,
    // team leaderboard
    val leaderboard: List<LeaderboardRow> = emptyList(),
    val leaderboardPeriod: String = "today",
    val leaderboardLoading: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    // Deep linking from push notifications
    val requestedContactId: String? = null,
    val autoCallContactId: String? = null,
    // Post-call disposition: captured from finishCloudCall before clearing the overlay.
    val postCallContactId: String? = null,
    val postCallPhone: String? = null,
    val postCallName: String? = null,
    val postCallCampaignId: String? = null,
    val postCallConnected: Boolean = false,
    // The SAME prompt, opened by hand from a follow-up's Update button rather
    // than by a call ending. Manual means it is dismissable (a mis-tap must not
    // trap the rep) while still asking the funnel question. The follow-up id
    // rides along so answering the prompt closes the callback it came from.
    val postCallManual: Boolean = false,
    val postCallFollowUpId: String? = null,
    /** When false (the default), a finished SIM call shakes the lead's Update
     *  button instead of throwing the disposition sheet up a beat too late. */
    val postCallPopup: Boolean = false,
    /** Calls that have ended with nothing recorded yet — these are the leads
     *  whose Update button is shaking, and the ones the nudge bar counts. */
    val pendingUpdates: List<PendingUpdate> = emptyList(),
    /** Master switch for the assistant's own questions. */
    val assistantOn: Boolean = true,
    /** The one question the assistant is asking right now (null = silent). */
    val assistantAsk: AssistantAsk? = null,
    /** The coached half of the 7pm card — score, wins, the habit to fix,
     *  tomorrow's first calls. Null until it lands; the card works without it. */
    val dayReview: DayReview? = null,
    val dayReviewLoading: Boolean = false,
    // In-app update: set when a newer build is published; drives the update prompt.
    val update: AppUpdater.Release? = null,
    val checkingUpdate: Boolean = false,
    /** True once the update download starts (keeps the prompt in a downloading state). */
    val updateDownloading: Boolean = false,
    /** Download progress 0f..1f while an update is being fetched. */
    val updateProgress: Float = 0f,
    /** Prompt pushed aside so the rep can keep calling while the APK downloads.
     *  The download itself is unaffected — only the dialog is hidden. */
    val updateMinimized: Boolean = false,
    // Lead detail page (full-screen overlay): which lead is open + its call history.
    val leadDetailId: String? = null,
    val leadDetailCalls: List<CallLog> = emptyList(),
    /** "Who did what, when" timeline entries for the open lead. */
    val leadDetailActivities: List<com.salesautocall.app.data.LeadActivity> = emptyList(),
    val leadDetailLoading: Boolean = false,
    // Per-lead call coach: honest rating + guidance from THIS lead's last real
    // call recording. Shown on the lead's own page.
    val leadCoach: com.salesautocall.app.data.CoachCallFeedback? = null,
    val leadCoachLoading: Boolean = false,
    // RAG v4: proactive "before you call" AI brief for the open lead.
    val leadBrief: String? = null,
    val leadBriefLoading: Boolean = false,
    // RAG v9: on-the-spot objection rebuttal for the open lead ("customer ne mana kiya").
    val rebuttal: String? = null,
    val rebuttalLoading: Boolean = false,
    // RAG v12: a ready-to-send WhatsApp follow-up drafted for the open lead.
    val messageDraft: String? = null,
    val messageDraftLoading: Boolean = false,
    /** One-line failure notice for the AI Coach card (never mixed into results,
     *  so an error can never be copied or WhatsApp'd to a customer). */
    val coachError: String? = null,
    // RAG v13 — "Second Chance": AI picks from the dead pile worth calling again.
    val revivePicks: List<com.salesautocall.app.data.Repository.RevivePick> = emptyList(),
    val reviveLoading: Boolean = false,
    /** True once a fetch finished this session — empty then means "truly nothing". */
    val reviveLoaded: Boolean = false,
    // Voice notes on the open lead ("kya baat hui" in the rep's own voice).
    val voiceNotes: List<com.salesautocall.app.data.LeadVoiceNote> = emptyList(),
    // Floating AI Coach (top-right bubble): panel data + open/loading state.
    val coachPanel: com.salesautocall.app.data.CoachPanel? = null,
    val coachOpen: Boolean = false,
    val coachLoading: Boolean = false,
    val coachPicks: List<com.salesautocall.app.data.FocusPick> = emptyList(),
    val coachPicksLoading: Boolean = false,
    // Objection Buster inside the floating coach: the objection being typed, the
    // rebuttal (null = none yet), and whether we're fetching. Not tied to a lead.
    val coachObjection: String = "",
    val coachRebuttal: String? = null,
    val coachRebuttalLoading: Boolean = false,
    // "Ask the coach": open two-way Q&A inside the floating coach. The rep types
    // any question (Hindi/Hinglish/English) and gets a grounded, goal-oriented
    // answer from the company brain (playbook + guidebook + past wins).
    val coachAsk: String = "",
    val coachAnswer: String? = null,
    val coachAnswerLoading: Boolean = false,
    /** True while the mic is capturing a new voice note. */
    val voiceRecording: Boolean = false,
    /** True while a finished take uploads + registers. */
    val voiceUploading: Boolean = false,
    /** Voice note currently playing (null = none). */
    val playingNoteId: String? = null,
)

/**
 * A call that has finished with no outcome recorded against it.
 *
 * The lead is not lost — it still sits in New / Follow-up with nothing stamped
 * on it, exactly as before. This just remembers WHICH one so the app can point
 * at it (a shaking Update button, one line above the bottom bar) instead of
 * blocking the screen to ask.
 */
data class PendingUpdate(
    val contactId: String,
    val phone: String,
    val name: String? = null,
    val connected: Boolean = false,
    val at: Long = System.currentTimeMillis(),
)

/**
 * One question the assistant is asking the rep right now.
 *
 * There is never more than one. Everything about this feature that could go
 * wrong goes wrong by asking too much, so the whole design is a single slot: if
 * it is full, nothing else can be asked, and it only refills after the rep has
 * answered and the quiet gap has passed.
 */
data class AssistantAsk(
    /** "visit_check" | "callback_check" | "day_review" */
    val kind: String,
    /**
     * The once-a-day identity of this question ("visit_check:<lead>").
     *
     * Carried on the ask rather than rebuilt from its fields, because the two
     * have to agree exactly: the candidate search skips anything already asked,
     * and the marker records what was asked. Derive it in two places and a
     * callback with no linked lead gets asked over and over.
     */
    val key: String,
    val contactId: String? = null,
    val phone: String? = null,
    val name: String? = null,
    /** Which project's site visit is in question. */
    val project: String? = null,
    /** Human phrase for when it was due / booked ("45 minutes ago", "Tuesday"). */
    val whenLabel: String = "",
    /** Why the callback exists, in the rep's own words. */
    val why: String? = null,
    val followUpId: String? = null,
    /** For measuring how long the rep leaves the question sitting there. */
    val shownAt: Long = System.currentTimeMillis(),
    // ---- day_review payload ----
    val calls: Int = 0,
    val connected: Int = 0,
    val interested: Int = 0,
    val visitsBooked: Int = 0,
    val notUpdated: Int = 0,
)

enum class CallFilter(val label: String) { TODAY("Today"), WEEK("This week"), ALL("All time") }

/**
 * Lead-pipeline filters shown on the Leads tab.
 *
 * These were status sets — a fourth private taxonomy, disagreeing with the
 * other three. They are STAGE codes now, matched against contacts.stage, so
 * "Open" means whatever lead_stages currently says is not terminal rather than
 * whatever this line happened to list.
 */
enum class LeadFilter(val key: String, val label: String, val stages: Set<String>) {
    OPEN("open", "Open", setOf("new", "contacted")),
    HOT("hot", "Hot", emptySet()),           // filtered by temperature, not stage
    INTERESTED("interested", "Interested", setOf("interested")),
    BOOKED("booked", "Won", setOf("won")),
    ALL("all", "All", emptySet()),
}

/** Roll-up shown in the Calls-tab summary card. */
data class CallSummary(
    val total: Int = 0,
    val connected: Int = 0,
    val noAnswer: Int = 0,
    val failed: Int = 0,
    val talkSeconds: Int = 0,
)

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(
        AppState(
            breakSeconds = AppPrefs.getBreakSeconds(app),
            reviewAfterCall = AppPrefs.getReviewAfterCall(app),
            dailyGoal = AppPrefs.getDailyGoal(app),
            cloudEnabled = AppPrefs.getCloudEnabled(app),
            cloudIncomingEnabled = AppPrefs.getIncomingEnabled(app),
            cloudAgentId = AppPrefs.getAgentId(app),
            cloudCallerId = AppPrefs.getCallerId(app),
            cloudSipPassword = AppPrefs.getSipPassword(app),
            cloudSipServer = AppPrefs.getSipServer(app),
            cloudSipPort = AppPrefs.getSipPort(app),
            callerdeskCalling = AppPrefs.getCallerdeskCalling(app),
            autoAnswer = AppPrefs.getAutoAnswer(app),
            postCallPopup = AppPrefs.getPostCallPopup(app),
            assistantOn = AppPrefs.getAssistantOn(app),
        ),
    )
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        com.salesautocall.app.sip.SipManager.appContext = app
        // If the rep opted in to inbound calls, make sure the SIP listener is
        // running on every app start — the system may have killed the service
        // (swipe-away / low memory) while the app wasn't open, which is why
        // incoming calls stopped arriving until the app was reopened.
        if (AppPrefs.getIncomingEnabled(app) &&
            AppPrefs.getAgentId(app).isNotBlank() &&
            AppPrefs.getSipPassword(app).isNotBlank()
        ) {
            runCatching { com.salesautocall.app.sip.SipBackgroundService.start(app) }
            runCatching { com.salesautocall.app.sip.SipWatchdogWorker.schedule(app) }
        }
        observeSimCalls()
        refreshSession()
    }

    /**
     * A MANUAL SIM dial just ended → arm the post-call disposition sheet, so a
     * connected call never leaves the lead sitting in "new" without an outcome
     * (which is why called leads used to look untouched the next day). Campaign
     * calls are skipped — the auto-dialer runs its own after-call review. Only
     * CRM leads qualify; a random/off-CRM number has no lead to update.
     */
    private fun observeSimCalls() {
        viewModelScope.launch {
            var last: com.salesautocall.app.dialer.SimCallUi? = null
            com.salesautocall.app.dialer.SimCallMonitor.state.collect { cur ->
                val prev = last
                last = cur
                val ended = cur == null && prev != null
                if (!ended) return@collect
                if (com.salesautocall.app.dialer.DialerController.state.value.isRunning) return@collect
                if (!_state.value.reviewAfterCall) return@collect
                val phone = prev!!.phone
                val key = phone.filter { it.isDigit() }.takeLast(10)
                val lead = _state.value.leads.firstOrNull {
                    it.phone.filter { c -> c.isDigit() }.takeLast(10) == key
                } ?: return@collect
                val contactId = lead.id ?: return@collect
                val didConnect = prev.activeAtMillis > 0
                // A SIM call ends behind the phone's own in-call screen, so the
                // sheet cannot land until Android hands focus back — which is
                // the "popup aata hai kaafi slow" the reps described, followed by
                // a modal landing on whatever they had already moved on to.
                //
                // Default is to ask quietly instead: remember the call, shake the
                // lead's Update button, and let the rep answer when they look. The
                // lead is no better off than before — still no outcome, still
                // unanswered everywhere — so nothing is lost by not blocking.
                if (!AppPrefs.getPostCallPopup(getApplication())) {
                    set {
                        it.copy(
                            pendingUpdates = it.pendingUpdates.filterNot { p -> p.contactId == contactId } +
                                PendingUpdate(contactId, phone, lead.name, didConnect),
                        )
                    }
                    return@collect
                }
                set {
                    it.copy(
                        postCallContactId = contactId,
                        postCallPhone = phone,
                        postCallName = lead.name,
                        postCallCampaignId = null,
                        // Off-hook (activeAtMillis>0) = a real conversation → force an outcome.
                        postCallConnected = didConnect,
                    )
                }
            }
        }
    }

    private val lenientJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
    private var cloudConnectedAt: Long = 0L
    /** Guards the outgoing call's outcome write so it happens exactly once. */
    private var cloudResultLogged: Boolean = false
    /** Bumped per outbound call so a delayed auto-dismiss only closes its own call. */
    private var cloudCallToken: Int = 0

    private fun set(transform: (AppState) -> AppState) {
        _state.value = transform(_state.value)
    }

    // ---- screen-load cache ----
    // Bottom-nav uses a NavHost, which re-runs each screen's LaunchedEffect every
    // time you switch to its tab. Without this guard, every Home/Leads/Calls switch
    // fired fresh network calls → visible lag. We keep the already-loaded data in
    // state (it survives navigation) and only re-fetch when it's actually stale, so
    // switching tabs is instant. Manual refresh passes force = true to bypass it.
    private val lastLoadedAt = HashMap<String, Long>()
    private fun shouldLoad(key: String, force: Boolean, ttlMs: Long = 45_000L): Boolean {
        if (force) { lastLoadedAt[key] = System.currentTimeMillis(); return true }
        val now = System.currentTimeMillis()
        if (now - (lastLoadedAt[key] ?: 0L) < ttlMs) return false
        lastLoadedAt[key] = now
        return true
    }
    private fun invalidateCaches() = lastLoadedAt.clear()

    // ---------- auth ----------

    fun refreshSession() {
        viewModelScope.launch {
            // Wait for the saved session to load before deciding — otherwise a cold
            // start can flash the login screen and "log out" an active telecaller.
            Repository.awaitSession()
            val uid = Repository.currentUserId()
            if (uid == null) {
                set { it.copy(signedIn = false, profile = null, authResolved = true) }
                return@launch
            }
            // Fetch profile AND company before flipping signedIn, so the shell
            // never briefly renders "join a company" while the company is still
            // loading. One atomic state update = no flicker.
            val profile = runCatching { Repository.myProfile() }.getOrNull()
            val company = runCatching { Repository.myCompany() }.getOrNull()
            set { it.copy(signedIn = true, profile = profile, company = company, authResolved = true) }
            registerPushToken()
            checkForUpdate()
        }
    }

    /** Checks the public GitHub release for a newer build; surfaces an update prompt. */
    fun checkForUpdate(manual: Boolean = false) {
        viewModelScope.launch {
            if (manual) set { it.copy(checkingUpdate = true) }
            val result = runCatching { AppUpdater.check() }.getOrElse {
                AppUpdater.Result.Failed(it.message ?: "error")
            }
            var rel = (result as? AppUpdater.Result.Available)?.release
            if (rel != null) {
                // Super-admin can force everyone on this channel to update (web toggle).
                val policy = runCatching {
                    Repository.fetchUpdatePolicy(com.salesautocall.app.BuildConfig.UPDATE_TAG)
                }.getOrNull()
                val forced = rel.forced || (policy?.force == true) ||
                    (com.salesautocall.app.BuildConfig.VERSION_CODE < (policy?.minVersionCode ?: 0))
                rel = rel.copy(forced = forced)
            }
            // Only speak up on a MANUAL check: found → the prompt shows; up-to-date
            // → confirm; failed → say so honestly (don't pretend it's the latest).
            val note = when {
                !manual -> null
                rel != null -> null
                result is AppUpdater.Result.Failed ->
                    "Couldn't check for updates — check your internet and try again."
                else -> "You're on the latest version ✓ (v${com.salesautocall.app.BuildConfig.VERSION_NAME})"
            }
            set {
                it.copy(
                    update = rel,
                    checkingUpdate = false,
                    message = note ?: it.message,
                )
            }
            // Makkhan: as soon as an update is found, download it in the background
            // so it's ready to install with a single tap — no waiting.
            if (rel != null) installUpdate()
        }
    }

    /** Downloads the newer APK in the background (with progress) then opens the installer. */
    fun installUpdate() {
        val rel = _state.value.update ?: return
        if (_state.value.updateDownloading) return
        set { it.copy(updateDownloading = true, updateProgress = 0f) }
        viewModelScope.launch {
            val ctx = getApplication<android.app.Application>()
            val file = runCatching {
                AppUpdater.download(ctx, rel) { p -> set { it.copy(updateProgress = p) } }
            }.getOrNull()
            if (file != null) {
                AppUpdater.install(ctx, file)
                set { it.copy(message = "Update ready — tap Install.") }
            } else {
                set { it.copy(updateDownloading = false, message = "Update download failed — will retry next time.") }
            }
        }
    }

    /** Saves how the rep refers to themselves in generated Hindi messages. */
    fun setSpeaksAs(value: String) {
        set { st -> st.copy(profile = st.profile?.copy(speaksAs = value)) }
        viewModelScope.launch { runCatching { Repository.updateSpeaksAs(value) } }
    }

    fun dismissUpdate() = set { it.copy(update = null, updateDownloading = false, updateProgress = 0f, updateMinimized = false) }

    /** Push the update prompt aside. The download keeps running in viewModelScope,
     *  so the rep can carry on calling instead of watching a progress bar — a
     *  shift shouldn't stop because a build was published. */
    fun minimizeUpdate() = set { it.copy(updateMinimized = true) }

    /** Bring the minimized prompt back (from the progress chip). */
    fun expandUpdate() = set { it.copy(updateMinimized = false) }

    /** Registers this device's FCM token so the backend can push hot-lead alerts.
     *  Also re-sends any token captured before the rep signed in. */
    fun registerPushToken() {
        val ctx = getApplication<Application>()
        val saved = AppPrefs.getPushToken(ctx)
        if (saved.isNotBlank()) viewModelScope.launch { runCatching { Repository.registerDeviceToken(saved) } }
        runCatching {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (!token.isNullOrBlank()) {
                        AppPrefs.setPushToken(ctx, token)
                        viewModelScope.launch { runCatching { Repository.registerDeviceToken(token) } }
                    }
                }
        }
    }

    /** Saves the rep's own mobile number (the phone CallerDesk rings) and reflects it locally. */
    fun setMyPhone(phone: String) {
        val clean = phone.trim()
        viewModelScope.launch {
            runCatching { Repository.updateMyPhone(clean) }
                .onSuccess {
                    set { it.copy(profile = it.profile?.copy(phone = clean), message = "Mobile number saved ✓") }
                }
                .onFailure { e -> set { it.copy(error = e.message ?: "Couldn't save your number") } }
        }
    }

    fun signIn(email: String, password: String) = auth { Repository.signIn(email, password) }

    fun signUp(
        email: String,
        password: String,
        fullName: String,
        phone: String,
        role: String,
        companyName: String,
        companyCode: String,
    ) = auth {
        Repository.signUp(email, password, fullName, phone, role, companyName)
        // Employee with a code + an active session → join their company now.
        // (Admins get their company created automatically by the signup trigger.)
        if (role == "salesperson" && companyCode.isNotBlank() && Repository.currentUserId() != null) {
            Repository.joinCompanyByCode(companyCode.trim())
        }
    }

    private fun auth(block: suspend () -> Unit) {
        viewModelScope.launch {
            set { it.copy(loading = true, error = null) }
            runCatching { block() }
                .onSuccess {
                    set { it.copy(loading = false) }
                    refreshSession()
                }
                .onFailure { e -> set { it.copy(loading = false, error = e.message) } }
        }
    }

    /** A salesperson (already signed in) joins their company with the admin's code. */
    fun joinCompany(code: String) {
        if (code.isBlank()) return
        viewModelScope.launch {
            set { it.copy(loading = true, error = null) }
            runCatching { Repository.joinCompanyByCode(code.trim()) }
                .onSuccess {
                    set { it.copy(loading = false, message = "✓ Joined your company. You can start calling now.") }
                    refreshSession()
                    loadCampaigns()
                    loadToday()
                }
                .onFailure { e -> set { it.copy(loading = false, error = "Couldn't join: ${e.message}") } }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            // Unregister this phone's push token BEFORE the session dies —
            // otherwise the old login keeps receiving pushes on this device,
            // which leaks one company's lead alerts to whoever signs in next.
            runCatching { Repository.unregisterDeviceToken(AppPrefs.getPushToken(getApplication())) }
            runCatching { Repository.signOut() }
            invalidateCaches() // next user starts with fresh data, not cached TTLs
            // Keep authResolved so we land straight on the login screen (not the
            // boot splash) after signing out.
            set { AppState(breakSeconds = it.breakSeconds, authResolved = true) }
        }
    }

    // ---------- settings ----------

    fun setCampaignName(name: String) = set { it.copy(campaignName = name) }

    fun setBreakSeconds(value: Int) {
        AppPrefs.setBreakSeconds(getApplication(), value)
        set { it.copy(breakSeconds = value.coerceIn(1, 59)) }
    }

    fun setReviewAfterCall(value: Boolean) {
        AppPrefs.setReviewAfterCall(getApplication(), value)
        set { it.copy(reviewAfterCall = value) }
    }

    fun setDailyGoal(value: Int) {
        AppPrefs.setDailyGoal(getApplication(), value)
        set { it.copy(dailyGoal = value.coerceIn(10, 500)) }
    }

    fun setCloudEnabled(v: Boolean) {
        AppPrefs.setCloudEnabled(getApplication(), v)
        set { it.copy(cloudEnabled = v) }
        if (!v && _state.value.cloudIncomingEnabled) {
            setIncomingEnabled(false)
        }
    }

    fun setIncomingEnabled(v: Boolean) {
        val app = getApplication<Application>()
        AppPrefs.setIncomingEnabled(app, v)
        set { it.copy(cloudIncomingEnabled = v) }
        if (v) {
            com.salesautocall.app.sip.SipBackgroundService.start(app)
            // Periodic safety net that revives the service if an OEM kills it.
            com.salesautocall.app.sip.SipWatchdogWorker.schedule(app)
            // On phones that kill background apps, incoming calls only survive if
            // the user also keeps "Autostart" on — guide them to that screen once.
            runCatching { com.salesautocall.app.sip.OemAutostart.openIfNeeded(app) }
        } else {
            com.salesautocall.app.sip.SipBackgroundService.stop(app)
            com.salesautocall.app.sip.SipWatchdogWorker.cancel(app)
        }
    }

    fun setCloudAgentId(v: String) {
        AppPrefs.setAgentId(getApplication(), v)
        set { it.copy(cloudAgentId = v.trim()) }
    }

    fun setCloudCallerId(v: String) {
        AppPrefs.setCallerId(getApplication(), v)
        set { it.copy(cloudCallerId = v.trim()) }
    }

    /** Cloud click-to-call: rings the agent's extension, then bridges to the customer. */
    fun setCloudSipPassword(v: String) {
        AppPrefs.setSipPassword(getApplication(), v)
        set { it.copy(cloudSipPassword = v.trim()) }
    }

    fun setCloudSipServer(v: String) {
        AppPrefs.setSipServer(getApplication(), v)
        set { it.copy(cloudSipServer = v.trim()) }
    }

    fun setCloudSipPort(v: String) {
        AppPrefs.setSipPort(getApplication(), v)
        set { it.copy(cloudSipPort = v.trim()) }
    }

    fun setCallerdeskCalling(v: Boolean) {
        AppPrefs.setCallerdeskCalling(getApplication(), v)
        set { it.copy(callerdeskCalling = v) }
    }

    fun setAutoAnswer(v: Boolean) {
        AppPrefs.setAutoAnswer(getApplication(), v)
        set { it.copy(autoAnswer = v) }
    }

    private fun agentId(): String = _state.value.profile?.sipAgentId?.ifBlank { null } ?: _state.value.cloudAgentId
    private fun callerId(): String = _state.value.profile?.callerId?.ifBlank { null } ?: _state.value.cloudCallerId

    /** Opens the in-app native softphone for a cloud call. Auto-fetches SIP config
     *  from uroperator; falls back to the manual Settings values if that fails. */
    fun cloudCall(phone: String, contactId: String?, campaignId: String?) {
        // Strip spaces/dashes so the SIP/URI and the API get clean digits.
        val clean = phone.filter { it.isDigit() || it == '+' }
        // CallerDesk mode: no SIP/VPN — the backend rings this agent's phone and
        // bridges the customer. Hand off and stop here.
        if (_state.value.callerdeskCalling) { startCallerdeskCall(clean, contactId, campaignId); return }
        // CallerDesk is off → just dial through the SIM. The legacy SIP/uroperator
        // path (and its VPN/login errors) was retired; turn Cloud Calling on in
        // Settings for bridged calls + recordings.
        dialManual(clean)
    }

    /** CallerDesk one-tap cloud call. Asks the backend to ring this agent's own
     *  phone and bridge the customer — no SIP, no VPN. The conversation happens on
     *  the native dialer; the result + recording arrive later via the webhook. The
     *  [SoftphoneScreen] shows a simple "answer your phone" card while this is on. */
    private fun startCallerdeskCall(number: String, contactId: String?, campaignId: String?) {
        cloudCallToken++
        // Arm the auto-answer FIRST so the listener is live before CallerDesk rings
        // back — the rep taps once and the phone picks up on its own. Its lifecycle
        // callbacks drive the in-app card: live timer on connect, auto-close on hang-up.
        runCatching {
            com.salesautocall.app.dialer.CallerdeskAutoAnswer.onConnected = {
                cloudConnectedAt = System.currentTimeMillis()
                set { it.copy(callConnectedAt = cloudConnectedAt, cloudCallStatus = "🔊 Connected — you're live") }
            }
            com.salesautocall.app.dialer.CallerdeskAutoAnswer.onEnded = {
                finishCloudCall(reload = true) // call ended on the phone → dismiss the card
            }
            com.salesautocall.app.dialer.CallerdeskAutoAnswer.arm(getApplication(), _state.value.autoAnswer)
        }
        set {
            it.copy(
                error = null, message = null,
                cloudCallNumber = number,
                cloudCallContactId = contactId,
                cloudCallCampaignId = campaignId,
                cloudBridged = true, // no SIP login phase — skip the watchdog/“logging in” UI
                cloudCallStatus = if (_state.value.autoAnswer) "Starting call… connecting you automatically."
                                  else "Starting call… your phone will ring in a moment.",
                inCallNote = "",
            )
        }
        val auto = _state.value.autoAnswer
        viewModelScope.launch {
            val body = runCatching { Repository.callerdeskCall(number, contactId, campaignId) }.getOrNull()
            if (body == null) {
                set { it.copy(cloudCallStatus = "Couldn't reach the calling service. Check your connection and try again.") }
                return@launch
            }
            if (body.contains("\"ok\":true")) {
                set { it.copy(cloudCallStatus =
                    if (auto) "📞 Connecting you to $number…\nYour phone answers automatically. The call is recorded."
                    else "📞 Connecting you to $number…\nYour phone will ring — tap answer. The call is recorded.") }
            } else {
                // Surface CallerDesk's own message (e.g. "Agent on break/Inactive").
                val msg = Regex("\"(?:error|message)\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.getOrNull(1)
                set { it.copy(cloudCallStatus = msg ?: "Couldn't start the call. Please try again.") }
            }
        }
    }

    /** Called by the native SIP engine as its registration / call state changes. */
    fun onSipState(raw: String) {
        val s = _state.value
        val number = s.cloudCallNumber ?: return
        val pretty = when {
            raw == "registering" -> "Logging in to phone system…"
            raw == "registered" -> "Connecting your call…"
            raw == "unregistered" -> "Signed out."
            raw == "ringing" -> "Ringing…"
            raw == "connected" -> "🔊 Connected — you're live"
            raw == "ended" -> "Call ended"
            raw.startsWith("callfailed") -> {
                val info = raw.substringAfter(':', "").trim()
                val code = info.substringBefore(' ')
                when (code) {
                    "403" -> "Rejected by PBX (403) — this extension isn't allowed to dial out, or needs a caller ID/DID set."
                    "404" -> "Number not routed (404) — the PBX didn't recognise $number. It likely needs a dialing prefix (e.g. 0 or 91)."
                    "488", "606" -> "Media not accepted ($code) — codec mismatch."
                    "486", "603" -> "Busy / declined ($code)."
                    "407", "401" -> "Call auth required ($code) — SIP password issue on dialing."
                    else -> "Call failed ($info)"
                }
            }
            raw.startsWith("regfailed") ->
                "SIP login failed — check your extension/password. If your PBX is a private address, turn the VPN ON."
            raw.startsWith("callerror") -> "Call failed: ${raw.substringAfter(':', "")}"
            else -> raw
        }
        set { it.copy(cloudCallStatus = pretty) }

        if (raw == "connected") {
            cloudConnectedAt = System.currentTimeMillis()
            set { it.copy(callConnectedAt = cloudConnectedAt) }
        }
        if (raw == "ended" || raw.startsWith("callfailed")) {
            val failed = raw.startsWith("callfailed")
            finalizeCloudResult(failed = failed)
            uploadCloudRecording()
            // The remote hung up / the call failed. Detach immediately so a later
            // inbound call rings instead of being auto-answered, then auto-dismiss
            // the in-call screen (keeping the reason on-screen briefly).
            com.salesautocall.app.sip.SipManager.expectingOutbound = false
            val token = cloudCallToken
            viewModelScope.launch {
                kotlinx.coroutines.delay(if (failed) 3500 else 1200)
                if (cloudCallToken == token) finishCloudCall(reload = true)
            }
        }

        // Once registered: log the call (to get its id, and set the recording file
        // before the leg is answered), then ask uroperator to place the call
        // (click-to-call): their server rings our extension (the app auto-answers)
        // and bridges the customer through the proper trunk.
        if (raw == "registered" && !s.cloudBridged) {
            val ctx = getApplication<Application>()
            val sipServer = com.salesautocall.app.data.AppPrefs.getSipServer(ctx)
            // A self-hosted PBX (FreeSWITCH/Asterisk) has no UrOperator click-to-call
            // bridge API, so dial DIRECTLY over SIP — exactly like Zoiper does. Only
            // UrOperator's gateway uses the server-side bridge.
            val directDial = sipServer.isNotBlank() && !sipServer.contains("uroperator", ignoreCase = true)
            set { it.copy(cloudBridged = true, cloudCallStatus = if (directDial) "Dialing $number…" else "Ringing you, then the customer…") }
            val ext = _state.value.cloudCallExt.ifBlank { agentId() }
            viewModelScope.launch {
                val p = _state.value.profile
                val logId = if (p?.companyId != null) {
                    runCatching {
                        Repository.logCall(
                            com.salesautocall.app.data.CallLog(
                                companyId = p.companyId, salespersonId = p.id,
                                contactId = s.cloudCallContactId, campaignId = s.cloudCallCampaignId,
                                phone = number, direction = "outgoing", notes = "cloud",
                                startedAt = java.time.Instant.now().toString(),
                                recordingStatus = if (recordingEnabled()) "recording" else "none",
                                recordingSource = "sip",
                            ),
                        )
                    }.getOrNull()
                } else null
                set { it.copy(cloudCallLogId = logId) }
                // Arm recording (captures both legs once the call is answered).
                if (logId != null && recordingEnabled()) {
                    val f = java.io.File(ctx.cacheDir, "rec_$logId.wav")
                    com.salesautocall.app.sip.SipManager.setRecordFile(f.absolutePath)
                } else {
                    com.salesautocall.app.sip.SipManager.setRecordFile(null)
                }

                if (directDial) {
                    // Send the INVITE ourselves to <number>@<pbx>; the PBX dialplan routes it.
                    runCatching { com.salesautocall.app.sip.SipManager.call(number) }
                        .onFailure { e -> set { it.copy(cloudCallStatus = "Couldn't dial: ${e.message}") } }
                } else {
                    runCatching { Repository.cloudCall(number, ext, callerId()) }
                        .onSuccess { body ->
                            if (!body.contains("\"ok\":true")) {
                                set { it.copy(cloudCallStatus = "uroperator: ${body.take(160)}") }
                            }
                        }
                        .onFailure { e -> set { it.copy(cloudCallStatus = "Couldn't start call: ${e.message}") } }
                }
            }
        }
    }

    /** Reads the just-finished recording and ships it to Drive via the edge function.
     *  Idempotent: consumes the record path so it only uploads once. */
    private fun uploadCloudRecording() {
        val id = _state.value.cloudCallLogId ?: return
        val path = com.salesautocall.app.sip.SipManager.takeRecording() ?: return
        com.salesautocall.app.sip.SipManager.setRecordFile(null) // consume → guard against double upload
        val dur = if (cloudConnectedAt > 0) ((System.currentTimeMillis() - cloudConnectedAt) / 1000).toInt() else 0
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val f = java.io.File(path)
                if (f.exists() && f.length() > 44) { // >WAV header = real audio captured
                    Repository.uploadRecording(id, "sip", dur, f.readBytes())
                    f.delete()
                } else {
                    // No audio was captured (empty recording) — mark it so the status
                    // isn't stuck on "recording" and the admin sees the truth.
                    runCatching { Repository.markRecordingStatus(id, "failed") }
                    runCatching { f.delete() }
                }
            }
        }
    }

    /**
     * Writes the finished outgoing cloud call's outcome + talk time back onto its
     * log row. Idempotent: a call is finalised once, whether it ends via the SIP
     * engine (onSipState) or the user tapping hang-up (endCloudCall, which kills
     * the SIP listener before the End event can arrive).
     */
    private fun finalizeCloudResult(failed: Boolean) {
        val id = _state.value.cloudCallLogId ?: return
        if (cloudResultLogged) return
        cloudResultLogged = true
        val connected = cloudConnectedAt > 0
        val dur = if (connected) ((System.currentTimeMillis() - cloudConnectedAt) / 1000).toInt() else 0
        val outcome = when {
            failed -> "failed"
            connected -> "connected"
            else -> "no_answer"
        }
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { Repository.updateCallResult(id, outcome, dur) }
        }
    }

    private fun recordingEnabled(): Boolean = _state.value.company?.recordingEnabled ?: true

    /** Hang-up tapped by the rep. */
    fun endCloudCall() = finishCloudCall(reload = true)

    /**
     * Single teardown path for a cloud call, used both when the rep taps hang-up
     * and when the call ends on its own. Saves notes, finalises the log, hangs up
     * and dismisses the in-call screen. Idempotent — safe to call more than once.
     *
     * Critically, it does NOT unregister SIP when the rep is listening for inbound
     * calls (that would silence incoming calls after every outbound one); it only
     * fully stops the engine when inbound is off, to save battery.
     */
    fun finishCloudCall(reload: Boolean = false) {
        if (_state.value.cloudCallNumber == null) return // already torn down
        cloudCallToken++ // cancel any pending auto-dismiss for this call
        // Detach the CallerDesk auto-answer callbacks so a later state change can't
        // re-trigger teardown for an already-finished call.
        com.salesautocall.app.dialer.CallerdeskAutoAnswer.onConnected = null
        com.salesautocall.app.dialer.CallerdeskAutoAnswer.onEnded = null
        if (_state.value.inCallNote.isNotBlank()) saveInCallNote()
        finalizeCloudResult(failed = false)
        uploadCloudRecording()
        com.salesautocall.app.sip.SipManager.expectingOutbound = false
        com.salesautocall.app.sip.SipManager.onState = null
        if (_state.value.cloudIncomingEnabled) {
            runCatching { com.salesautocall.app.sip.SipManager.hangup() } // keep registration alive
        } else {
            runCatching { com.salesautocall.app.sip.SipManager.stop() }
        }
        // Capture the contact info for the post-call disposition sheet BEFORE
        // clearing the overlay state. This lets the rep log what happened.
        val s = _state.value
        val wasConnected = cloudConnectedAt > 0L
        val postContactId = s.cloudCallContactId
        val postPhone = s.cloudCallNumber
        val postCampaignId = s.cloudCallCampaignId
        // Try to find the contact name from leads.
        val postName = postPhone?.let { ph ->
            s.leads.find { it.phone == ph || it.id == postContactId }?.name
        }
        cloudConnectedAt = 0L
        set {
            it.copy(
                cloudCallNumber = null, cloudCallStatus = "", cloudBridged = false,
                callConnectedAt = 0L, cloudCallLogId = null, inCallNote = "",
                // Arm the post-call disposition popup (only if we know who was called).
                postCallContactId = postContactId,
                postCallPhone = postPhone,
                postCallName = postName,
                postCallCampaignId = postCampaignId,
                postCallConnected = wasConnected,
                // An incoming call can land while the assistant has a question
                // open — the rep answers the phone, and the disposition sheet
                // then stacks on a prompt they never saw the end of. A real call
                // wins; the question comes back tomorrow.
                assistantAsk = null,
            )
        }
        // Refresh the Calls list so the just-finished call shows up. The recording
        // is uploaded asynchronously and only flips to "ready" (→ shows the Play
        // button) a few seconds later, so refresh again after the upload settles.
        if (reload) {
            loadCalls(force = true)
            val token = cloudCallToken
            viewModelScope.launch {
                kotlinx.coroutines.delay(6000)
                if (cloudCallToken == token) loadCalls(force = true)
            }
        }
    }

    fun setMuted(muted: Boolean) = com.salesautocall.app.sip.SipManager.setMuted(muted)

    fun setSpeaker(on: Boolean) = com.salesautocall.app.sip.SipManager.setSpeaker(on)

    fun isRecording(): Boolean = com.salesautocall.app.sip.SipManager.isRecording()

    /** Manually pause/resume recording of the active cloud call. Returns the new state. */
    fun toggleRecording(): Boolean = com.salesautocall.app.sip.SipManager.toggleRecording()

    fun recordingAllowed(): Boolean = recordingEnabled()

    fun loadToday(force: Boolean = false) {
        if (!shouldLoad("today", force)) return
        viewModelScope.launch {
            runCatching { Repository.fetchTodayCalls() }
                .onSuccess { list ->
                    set {
                        it.copy(
                            todayCalls = list.size,
                            todayConnected = list.count { c -> c.outcome == "connected" },
                            todayTalk = list.sumOf { c -> c.durationSeconds },
                        )
                    }
                }
        }
    }

    // ---------- Calls tab (history / follow-up / summary) ----------

    fun setCallFilter(f: CallFilter) {
        if (f == _state.value.callFilter) return
        set { it.copy(callFilter = f) }
        loadCalls(force = true) // filter changed → fetch the new range now
    }

    /** Reads the phone's own call log for the fast recents tab (needs READ_CALL_LOG).
     *  The ContentResolver query runs on IO — on Main it froze scrolling. */
    fun loadDeviceRecents() {
        viewModelScope.launch {
            val list = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching { com.salesautocall.app.data.DeviceRecents.read(getApplication()) }.getOrDefault(emptyList())
            }
            set { it.copy(deviceRecents = list) }
        }
    }

    fun loadCalls(force: Boolean = false) {
        val filter = _state.value.callFilter
        // Key by filter so changing Today/Week/All always refetches, but returning
        // to the Calls tab on the same filter uses the cached list instantly.
        if (!shouldLoad("calls:${filter.name}", force)) return
        val since: String? = when (filter) {
            CallFilter.TODAY -> java.time.LocalDate.now()
                .atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toString()
            CallFilter.WEEK -> java.time.LocalDate.now().minusDays(6)
                .atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toString()
            CallFilter.ALL -> null
        }
        viewModelScope.launch {
            set { it.copy(callsLoading = true) }
            runCatching { Repository.fetchCalls(since) }
                .onSuccess { list ->
                    val summary = CallSummary(
                        total = list.size,
                        connected = list.count { c -> c.outcome == "connected" },
                        noAnswer = list.count { c -> c.outcome == "no_answer" },
                        failed = list.count { c -> c.outcome == "failed" },
                        talkSeconds = list.sumOf { c -> c.durationSeconds },
                    )
                    set { it.copy(callList = list, callSummary = summary, callsLoading = false) }
                }
                .onFailure { e -> set { it.copy(callsLoading = false, error = e.message ?: "Couldn't load calls") } }
        }
    }

    /**
     * Backfills recordings for already-logged calls by matching the dialer's
     * files (oDialer/Truecaller name their files "<phone>-<time>.<ext>") to each
     * call by the phone number in the filename, then the closest timestamp. This
     * is more reliable than the live per-call harvest, which can miss a file the
     * dialer flushes only after we've stopped polling. One tap attaches every
     * recording the app can see in the connected folder.
     */
    fun syncRecordings() {
        if (_state.value.recordingSyncing) return
        val ctx = getApplication<Application>()
        if (!com.salesautocall.app.dialer.NativeRecordingHarvester.isConfigured(ctx)) {
            set { it.copy(recordingSyncMsg = "Connect your recording folder first.") }
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            set { it.copy(recordingSyncing = true, recordingSyncMsg = "Syncing…") }
            val (attached, failed, firstError) = runCatching { Repository.syncRecordings(ctx, null) }
                .getOrElse { Triple(0, 0, it.message ?: "error") }
            val msg = when {
                attached > 0 && failed == 0 -> "✓ $attached recording(s) attached — AI summaries are on the way. Open the Calls tab."
                attached > 0 -> "✓ $attached attached, $failed failed. ${firstError ?: ""}"
                failed > 0 -> "Upload failed: ${firstError ?: "unknown"}."
                // attached == 0 && failed == 0: recordings made from the app are
                // attached automatically right after each call, so a manual sync
                // usually has nothing left to do. Say so plainly instead of alarming.
                else -> "✓ Nothing new to sync — your recordings are already attached. Open the Calls tab to play them."
            }
            set { it.copy(recordingSyncing = false, recordingSyncMsg = msg) }
            loadCalls(force = true)
        }
    }

    /**
     * Generates (or fetches the cached) AI summary for a call and merges the
     * result back into the visible call list so it shows inline.
     */
    fun generateSummary(callLogId: String) {
        if (_state.value.summarizingCallId != null) return
        viewModelScope.launch {
            set { it.copy(summarizingCallId = callLogId) }
            val text = runCatching { Repository.generateSummary(callLogId) }.getOrNull()
            set { st ->
                val updated = st.callList.map { c ->
                    if (c.id == callLogId && text != null)
                        c.copy(summary = text, summaryStatus = "ready") else c
                }
                st.copy(
                    callList = updated,
                    summarizingCallId = null,
                    error = if (text == null) "Couldn't summarize this call yet." else st.error,
                )
            }
            // The summary run may also have extracted a wada — reload the open
            // lead so its confirm card appears right away.
            if (text != null && _state.value.leadDetailId != null) refreshLeadDetail()
        }
    }

    /** Contacts worth chasing: not-connected calls, most-recent attempt per number. */
    fun followUps(): List<CallLog> =
        _state.value.callList
            .filter { it.outcome == "no_answer" || it.outcome == "failed" }
            .distinctBy { it.phone }

    /**
     * Missed calls in the dialer sense: an inbound call the rep didn't answer.
     * This is what the "Missed" tab shows so a telecaller can quickly see who
     * tried to reach them and call back.
     */
    fun missedCalls(): List<CallLog> =
        _state.value.callList.filter { it.direction == "incoming" && it.outcome != "connected" }

    /** Places a manually-keyed SIM call (recorded + logged) via the in-app keypad. */
    fun dialManual(phone: String) {
        val clean = phone.trim()
        if (clean.isEmpty()) return
        // Resolve the lead's name now so the in-call screen (and the system
        // overlay) can show it — the call screen no longer holds a ViewModel.
        val key = clean.filter { it.isDigit() }.takeLast(10)
        val name = _state.value.leads.firstOrNull {
            !it.name.isNullOrBlank() && it.phone.filter { c -> c.isDigit() }.takeLast(10) == key
        }?.name
        com.salesautocall.app.dialer.ManualCallService.dial(
            getApplication(), clean, _state.value.company?.id, null, recordingEnabled(), name,
        )
    }

    fun setInCallNote(v: String) = set { it.copy(inCallNote = v) }

    /** Persists the in-call note onto the active cloud call's log row. */
    fun saveInCallNote() {
        val id = _state.value.cloudCallLogId ?: return
        val note = _state.value.inCallNote
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { Repository.setCallNote(id, note) }
        }
    }

    // ---------- file pick ----------

    fun pickFile(uri: Uri) {
        viewModelScope.launch {
            set { it.copy(loading = true, error = null, message = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    val name = displayName(uri)
                    val bytes = getApplication<Application>().contentResolver
                        .openInputStream(uri)?.use { it.readBytes() }
                        ?: throw Exception("Could not read file")
                    name to ContactImport.parse(bytes, name)
                }
            }.onSuccess { (name, parsed) ->
                set {
                    it.copy(
                        loading = false,
                        pendingParse = parsed,
                        pendingFileName = name,
                        message = "${parsed.contacts.size} contacts ready (${parsed.skippedRows} skipped).",
                    )
                }
            }.onFailure { e -> set { it.copy(loading = false, error = e.message) } }
        }
    }

    fun clearPending() = set { it.copy(pendingParse = null, pendingFileName = null, message = null) }

    // ---------- campaign start ----------

    fun startCampaign() {
        val s = _state.value
        val parsed = s.pendingParse
        if (parsed == null || parsed.contacts.isEmpty()) {
            set { it.copy(error = "Choose a file with at least one valid phone number first.") }
            return
        }
        viewModelScope.launch {
            set { it.copy(loading = true, error = null) }
            runCatching {
                Repository.createCampaignWithContacts(
                    name = s.campaignName.ifBlank { "Campaign ${s.campaigns.size + 1}" },
                    gapSeconds = s.breakSeconds,
                    parsed = parsed,
                )
            }.onSuccess { contacts ->
                DialerController.prepare(
                    contacts,
                    DialerConfig(gapSeconds = s.breakSeconds, reviewAfterEachCall = s.reviewAfterCall),
                    s.campaignName.ifBlank { "Campaign" },
                    contacts.firstOrNull()?.campaignId ?: "",
                )
                AutoDialerService.start(getApplication())
                set { it.copy(loading = false, pendingParse = null, pendingFileName = null, campaignName = "", message = null, followUpInfo = null, followUpDone = false) }
                loadCampaigns()
            }.onFailure { e -> set { it.copy(loading = false, error = e.message) } }
        }
    }

    // ---------- in-session controls ----------

    fun pauseCampaign() = DialerController.pause()
    fun resumeCampaign() = DialerController.resume()

    fun quickDisposition(contactId: String, status: String) {
        viewModelScope.launch {
            runCatching { Repository.setDisposition(contactId, status, null) }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun saveNote(contactId: String, note: String) {
        viewModelScope.launch {
            runCatching { Repository.setContactNote(contactId, note) }
                .onSuccess {
                    set { st ->
                        st.copy(campaignContacts = st.campaignContacts.map { c ->
                            if (c.id == contactId) c.copy(notes = note) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /** Starts auto-dialing an existing campaign (e.g. a follow-up) from its loaded contacts. */
    fun startExistingCampaign(campaignId: String, campaignName: String, contacts: List<Contact>) {
        // Callable = the action queue, same rule the Leads screen power-dials
        // from. It used to be a status list that quietly excluded a lead whose
        // callback was genuinely due just because its disposition was 'called'.
        val work = _state.value.workByLead
        val callable = contacts.filter {
            val a = it.id?.let { id -> work[id]?.actionState }
            a == "overdue" || a == "call_now"
        }
        if (callable.isEmpty()) {
            set { it.copy(error = "No contacts left to call in this campaign.") }
            return
        }
        val s = _state.value
        DialerController.prepare(
            callable,
            DialerConfig(gapSeconds = s.breakSeconds, reviewAfterEachCall = s.reviewAfterCall),
            campaignName,
            campaignId,
        )
        AutoDialerService.start(getApplication())
    }

    /** Power-dial an arbitrary list of leads back-to-back (e.g. the current
     *  Leads filter, or today's due follow-ups) — reuses the auto-dialer engine
     *  so each call auto-advances to the next with the post-call sheet between. */
    fun callList(contacts: List<Contact>, label: String) {
        val callable = contacts.filter { it.phone.isNotBlank() }
        if (callable.isEmpty()) { set { it.copy(error = "No leads to call here.") }; return }
        val s = _state.value
        DialerController.prepare(
            callable,
            DialerConfig(gapSeconds = s.breakSeconds, reviewAfterEachCall = true),
            label,
            callable.firstOrNull()?.campaignId ?: "",
        )
        AutoDialerService.start(getApplication())
        set { it.copy(message = "📞 Calling ${callable.size} lead${if (callable.size == 1) "" else "s"} back-to-back") }
    }

    /** Bundles the just-finished campaign's unanswered numbers into a follow-up campaign. */
    fun createFollowUp() {
        if (_state.value.followUpDone) return
        val sourceId = DialerController.campaignId
        if (sourceId.isBlank()) return
        set { it.copy(followUpDone = true) }
        viewModelScope.launch {
            runCatching { Repository.createFollowUpCampaign(sourceId, _state.value.breakSeconds) }
                .onSuccess { n ->
                    set {
                        it.copy(
                            followUpInfo = if (n > 0) "Follow-up campaign created with $n unanswered numbers — call them tomorrow."
                            else "No unanswered numbers to follow up.",
                        )
                    }
                    loadCampaigns()
                }
                .onFailure { e -> set { it.copy(error = e.message, followUpDone = false) } }
        }
    }

    // ---------- analytics ----------

    fun loadCampaigns(force: Boolean = false) {
        if (!shouldLoad("campaigns", force)) return
        viewModelScope.launch {
            runCatching { Repository.fetchCampaignStats() }
                .onSuccess { c -> set { it.copy(campaigns = c) } }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun deleteCampaign(id: String) {
        viewModelScope.launch {
            runCatching { Repository.deleteCampaign(id) }
                .onSuccess { loadCampaigns() }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun openCampaign(id: String, name: String) {
        set { it.copy(selectedCampaignId = id, selectedCampaignName = name, campaignContacts = emptyList()) }
        viewModelScope.launch {
            runCatching { Repository.fetchCampaignContacts(id) }
                .onSuccess { c -> set { it.copy(campaignContacts = c) } }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun setDisposition(contactId: String, status: String, note: String?) {
        viewModelScope.launch {
            runCatching { Repository.setDisposition(contactId, status, note) }
                .onSuccess {
                    set { st ->
                        st.copy(campaignContacts = st.campaignContacts.map { c ->
                            if (c.id == contactId) c.copy(status = status, notes = note ?: c.notes) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /**
     * Confirms the AI's suggested disposition: sets the linked lead's status and
     * clears the suggestion. Optimistically updates the visible call/lead lists.
     */
    fun applyDisposition(callLogId: String, contactId: String, status: String) {
        viewModelScope.launch {
            runCatching {
                Repository.setDisposition(contactId, status, null)
                Repository.clearSuggestedDisposition(callLogId)
            }.onSuccess {
                set { st ->
                    st.copy(
                        callList = st.callList.map { c ->
                            if (c.id == callLogId) c.copy(suggestedDisposition = null) else c
                        },
                        leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(status = status) else c
                        },
                        message = "Lead updated ✓",
                    )
                }
            }.onFailure { e -> set { it.copy(error = e.message ?: "Couldn't update the lead") } }
        }
    }

    /** Dismisses the AI suggestion without changing the lead. */
    fun dismissDisposition(callLogId: String) {
        viewModelScope.launch {
            runCatching { Repository.clearSuggestedDisposition(callLogId) }
            set { st ->
                st.copy(callList = st.callList.map { c ->
                    if (c.id == callLogId) c.copy(suggestedDisposition = null) else c
                })
            }
        }
    }

    // ---------- Home dashboard ----------

    /** Loads everything the Home tab needs in one go. */
    fun loadHome(force: Boolean = false) {
        loadToday(force)
        loadAttendance(force)
        loadFollowUps(force)
        loadLeaderboard(_state.value.leaderboardPeriod, force)
        viewModelScope.launch {
            runCatching { Repository.callingScore() }.getOrNull()?.let { (avg, n) ->
                set { it.copy(callingScore = avg, callingScoreCount = n) }
            }
        }
    }

    // ---------- lead pipeline ----------

    fun setLeadFilter(f: LeadFilter) {
        if (f.key == _state.value.leadFilter) return
        set { it.copy(leadFilter = f.key) }
    }

    /** Ask the Leads tab to open directly in multi-select ("start campaign") mode. */
    fun requestLeadSelect() = set { it.copy(leadsSelectRequested = true) }
    fun consumeLeadSelect() = set { it.copy(leadsSelectRequested = false) }

    fun requestOpenContact(id: String) = set { it.copy(requestedContactId = id) }
    fun consumeOpenContact() = set { it.copy(requestedContactId = null) }

    fun requestAutoCall(id: String) {
        val contact = _state.value.leads.find { it.id == id }
        if (contact != null) {
            if (_state.value.cloudEnabled || !_state.value.profile?.sipAgentId.isNullOrBlank()) {
                cloudCall(contact.phone, id, contact.campaignId)
            } else {
                dialManual(contact.phone)
            }
        }
        set { it.copy(autoCallContactId = id, requestedContactId = id) } // Also open it
    }
    fun consumeAutoCall() = set { it.copy(autoCallContactId = null) }

    fun loadLeads(force: Boolean = false) {
        if (!shouldLoad("leads", force)) return
        viewModelScope.launch {
            set { it.copy(leadsLoading = true) }
            // Stages and action states load alongside the leads: a tab row that
            // renders before its vocabulary arrives would flash the wrong labels.
            val stages = Repository.fetchLeadStages()
            val work = Repository.currentUserId()?.let { Repository.fetchWorkStates(it) } ?: emptyList()
            runCatching { Repository.fetchLeads() }
                .onSuccess { list ->
                    set {
                        it.copy(
                            leads = list, leadsLoading = false,
                            leadStages = if (stages.isNotEmpty()) stages else it.leadStages,
                            workByLead = work.associateBy { w -> w.contactId },
                        )
                    }
                    // Keep the on-device phone → lead map fresh so Lead Ring can
                    // name an inbound caller instantly, even offline.
                    runCatching { com.salesautocall.app.notify.LeadRing.cache(getApplication(), list) }
                }
                // Keep whatever leads are already on screen on a network failure
                // (don't blank the list) and show a friendly, non-technical message.
                .onFailure { set { it.copy(leadsLoading = false, error = "Couldn't refresh leads — check your connection and try again.") } }
            runCatching { Repository.fetchProjectSites() }
                .onSuccess { sites -> set { it.copy(projectSites = sites) } }
        }
    }

    /**
     * App-open catch-up for lead assignments — the fail-safe for the push:
     * if a lead was assigned while the rep's device wasn't registered (fresh
     * install / token rotated), the FCM alert is lost. On every foreground we
     * pull leads assigned since we last checked and fire a local notification
     * (with the assignment sound) so nothing is ever missed.
     */
    fun checkNewAssignments() {
        val ctx = getApplication<Application>()
        viewModelScope.launch {
            if (Repository.currentUserId() == null) return@launch
            val seen = AppPrefs.getAssignSeenAt(ctx)
            // First run on this device: seed the watermark, don't alert old leads.
            if (seen.isBlank()) {
                AppPrefs.setAssignSeenAt(ctx, java.time.Instant.now().toString())
                return@launch
            }
            val fresh = runCatching { Repository.fetchNewAssignments(seen) }.getOrNull().orEmpty()
            if (fresh.isEmpty()) return@launch
            // Advance the watermark past the newest assignment we just saw.
            val newest = fresh.mapNotNull { it.assignedAt }.maxOrNull() ?: java.time.Instant.now().toString()
            AppPrefs.setAssignSeenAt(ctx, newest)

            val n = fresh.size
            val names = fresh.mapNotNull { it.name?.takeIf { nm -> nm.isNotBlank() } }.take(3).joinToString(", ")
            val body = when {
                n == 1 && names.isNotBlank() -> "$names — tap to start calling"
                names.isNotBlank() -> "$n new leads ($names${if (n > 3) " +${n - 3} more" else ""}) — tap to start calling"
                else -> "$n new lead${if (n > 1) "s" else ""} assigned — tap to start calling"
            }
            com.salesautocall.app.fcm.SalesFirebaseMessagingService.notify(
                ctx,
                title = "📋 New leads assigned",
                body = body,
                contactId = fresh.firstOrNull()?.id,
                channelId = com.salesautocall.app.fcm.SalesFirebaseMessagingService.ASSIGN_CHANNEL_ID,
            )
            // Refresh the list so the badge/leads reflect the new work immediately.
            loadLeads(force = true)
        }
    }

    // ---------- site-visit geofencing ----------

    /**
     * "Arrived at Site": reads the rep's GPS and compares it to the project's
     * pinned location. Within the radius → a verified on-site check-in. If the
     * project isn't pinned yet, the first arrival drops the pin here (you're on
     * site to do it) and counts as verified; later visits then verify against it.
     */
    fun arriveAtSite(contact: Contact) {
        val contactId = contact.id ?: return
        val project = contact.siteVisitProject?.trim().orEmpty()
        viewModelScope.launch {
            val loc = currentLocation()
            if (loc == null) {
                set { it.copy(message = "📍 Turn on location and try again — couldn't read your GPS.") }
                return@launch
            }
            val companyId = _state.value.profile?.companyId
            var pin = _state.value.projectSites.firstOrNull { it.name.equals(project, ignoreCase = true) }
            // No pin yet for this project → set it from where the rep is standing.
            if (pin == null && project.isNotBlank() && companyId != null) {
                val created = Repository.upsertProjectSite(companyId, project, loc.latitude, loc.longitude)
                if (created != null) {
                    pin = created
                    set { it.copy(projectSites = it.projectSites + created) }
                }
            }
            val site = pin
            if (site == null) {
                // Still no site (no project name on the lead) → record an unverified arrival.
                Repository.markSiteArrival(contactId, loc.latitude, loc.longitude, 0, false)
                applyArrival(contactId, verified = false, distance = 0)
                set { it.copy(message = "✓ Arrival logged. Tip: set a Site Visit Project to geo-verify next time.") }
                return@launch
            }
            val out = FloatArray(1)
            android.location.Location.distanceBetween(loc.latitude, loc.longitude, site.lat, site.lng, out)
            val distance = out[0].toInt()
            val verified = distance <= site.radiusM
            Repository.markSiteArrival(contactId, loc.latitude, loc.longitude, distance, verified)
            applyArrival(contactId, verified, distance)
            set {
                it.copy(message = if (verified)
                    "✅ Verified on site at ${site.name} ($distance m from the pin)."
                else
                    "⚠️ You're ${formatMeters(distance)} from ${site.name} — not at the site.")
            }
        }
    }

    /**
     * "Did they come?" answered in one tap from Home.
     *
     * This is the most valuable unanswered question in the whole funnel: a
     * site_visit lead counts as QUALIFIED in the ad autopsy, so every visit
     * nobody confirms is a lead-quality number built on a guess. It used to be
     * answerable only by opening the lead and hunting for a stage.
     *
     * came = true  → the visit really happened; the lead reads "Visit done"
     *                everywhere instead of "did they come?", and the Update
     *                prompt opens so the rep says what's next while it's fresh.
     * came = false → the visit did not happen; the planned date is cleared so
     *                it stops asking, and the prompt opens to book the next step.
     */
    fun answerVisitHappened(contactId: String, phone: String, name: String?, came: Boolean) {
        viewModelScope.launch {
            runCatching {
                if (came) Repository.confirmSiteVisitHappened(contactId)
                else Repository.clearSiteVisit(contactId)
            }.onSuccess {
                val nowIso = java.time.Instant.now().toString()
                set { st ->
                    st.copy(
                        leads = st.leads.map { c ->
                            if (c.id != contactId) c
                            else if (came) c.copy(siteVisitArrivedAt = nowIso, siteVisitVerified = false)
                            else c.copy(siteVisitAt = null, siteVisitProject = null)
                        },
                        message = if (came) "✅ Visit confirmed — what's next?" else "Visit didn't happen — book the next step.",
                    )
                }
                launchActivityLog(contactId) {
                    add("site_visit" to if (came) "Rep confirmed the site visit happened"
                                        else "Rep confirmed the customer did not come")
                }
                // Straight into the same prompt everything else uses, so the
                // answer and the next step are one action, not two.
                openFollowUpUpdate(contactId, phone, name, null)
            }.onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    private fun applyArrival(contactId: String, verified: Boolean, distance: Int) {
        val nowIso = java.time.Instant.now().toString()
        set { st ->
            st.copy(leads = st.leads.map { c ->
                if (c.id == contactId) c.copy(
                    siteVisitArrivedAt = nowIso, siteVisitVerified = verified, siteVisitDistanceM = distance,
                ) else c
            })
        }
    }

    private fun formatMeters(m: Int): String = if (m >= 1000) "%.1f km".format(m / 1000.0) else "$m m"

    /** Best last-known location across providers (mirrors the attendance punch-in read). */
    private fun currentLocation(): android.location.Location? {
        val ctx = getApplication<Application>()
        val fine = android.content.pm.PackageManager.PERMISSION_GRANTED ==
            androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = android.content.pm.PackageManager.PERMISSION_GRANTED ==
            androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_COARSE_LOCATION)
        if (!fine && !coarse) return null
        return runCatching {
            val lm = ctx.getSystemService(android.content.Context.LOCATION_SERVICE) as android.location.LocationManager
            var best: android.location.Location? = null
            for (p in lm.getProviders(true)) {
                val l = runCatching { lm.getLastKnownLocation(p) }.getOrNull() ?: continue
                if (best == null || l.accuracy < best!!.accuracy) best = l
            }
            best
        }.getOrNull()
    }

    /**
     * AI-scores the rep's open leads (hot/warm/cold + a next action) in one call,
     * then reloads so the new triage + tips show immediately.
     */
    fun scoreLeads() {
        if (_state.value.aiScoringLeads) return
        viewModelScope.launch {
            set { it.copy(aiScoringLeads = true) }
            val n = runCatching { Repository.scoreLeads() }.getOrDefault(0)
            runCatching { Repository.fetchLeads() }
                .onSuccess { list -> set { it.copy(leads = list, aiScoringLeads = false,
                    message = if (n > 0) "AI scored $n lead(s) ✨" else "Couldn't score leads right now") } }
                .onFailure { set { it.copy(aiScoringLeads = false) } }
        }
    }

    // ---------- content sharing (trust layer) ----------

    fun loadContentAssets(force: Boolean = false) {
        if (!shouldLoad("content", force)) return
        viewModelScope.launch {
            runCatching { Repository.fetchContentAssets() }
                .onSuccess { list -> set { it.copy(contentAssets = list) } }
        }
    }

    /**
     * Creates a tracked share link for [asset] → [contact] and hands the ready-to-send
     * message (title + link) back to the UI to fire off over WhatsApp. When the buyer
     * opens the link, the backend logs the open and reactivates the lead.
     */
    fun shareContent(contact: Contact, asset: ContentAsset, onReady: (String) -> Unit) {
        viewModelScope.launch {
            val token = runCatching { Repository.createContentShare(asset.id, contact.id) }.getOrNull()
            if (token == null) {
                set { it.copy(error = "Couldn't create a share link. Try again.") }
                return@launch
            }
            onReady("${asset.title}\n${Repository.contentOpenUrl(token)}")
        }
    }

    // ---------- multi-project interest ----------

    fun loadProjectInterests(contactId: String) {
        viewModelScope.launch {
            runCatching { Repository.fetchProjectInterests(contactId) }
                .onSuccess { list -> set { it.copy(projectInterests = list) } }
                .onFailure { set { it.copy(projectInterests = emptyList()) } }
        }
    }

    fun addProjectInterest(contactId: String, project: String, stage: String, budget: String?, temperature: String?) {
        val companyId = _state.value.profile?.companyId ?: return
        if (project.isBlank()) return
        viewModelScope.launch {
            runCatching {
                Repository.addProjectInterest(
                    LeadProjectInterest(
                        companyId = companyId, contactId = contactId, project = project.trim(),
                        stage = stage, budget = budget?.ifBlank { null }, temperature = temperature,
                    ),
                )
            }.onSuccess { loadProjectInterests(contactId) }
                .onFailure { e -> set { it.copy(error = e.message ?: "Couldn't add project") } }
        }
    }

    fun deleteProjectInterest(id: String, contactId: String) {
        viewModelScope.launch {
            runCatching { Repository.deleteProjectInterest(id) }
                .onSuccess { loadProjectInterests(contactId) }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    // ---------- AI assistant chat ----------

    /** Sends a question to the AI sales coach (or the practice customer) and appends its reply. */
    fun askAssistant(text: String) {
        val q = text.trim()
        if (q.isBlank() || _state.value.assistantThinking) return
        val mode = _state.value.assistantMode
        val msgs = _state.value.assistantMessages + ChatMsg("user", q)
        set { it.copy(assistantMessages = msgs, assistantThinking = true) }
        viewModelScope.launch {
            val reply = runCatching { Repository.assistantChat(msgs, mode = mode) }.getOrNull()
            set {
                it.copy(
                    assistantMessages = it.assistantMessages +
                        ChatMsg("assistant", reply ?: "Sorry, I couldn't answer right now. Please try again."),
                    assistantThinking = false,
                )
            }
        }
    }

    /**
     * RAG v10 — starts a live practice call: the AI plays a realistic customer
     * (objections grounded in the company playbook) and opens the conversation.
     * The rep replies by voice or text; typing "score" ends it with a scorecard.
     */
    fun startRoleplay() {
        if (_state.value.assistantThinking) return
        set { it.copy(assistantMode = "roleplay", assistantMessages = emptyList(), assistantThinking = true) }
        viewModelScope.launch {
            val reply = runCatching {
                Repository.assistantChat(listOf(ChatMsg("user", "__begin__")), mode = "roleplay")
            }.getOrNull()
            set {
                it.copy(
                    assistantMessages = listOf(
                        ChatMsg("assistant", reply ?: "Haan ji boliye… waise rate thoda zyada nahi lag raha?"),
                    ),
                    assistantThinking = false,
                )
            }
        }
    }

    fun clearAssistant() = set { it.copy(assistantMessages = emptyList(), assistantThinking = false, assistantMode = "coach") }

    // ---------- WhatsApp chat ----------

    fun openWaChat(c: Contact) {
        set { it.copy(waChatContact = c, waThread = emptyList(), waError = null) }
        c.id?.let { loadWaThread(it) }
    }

    fun closeWaChat() = set { it.copy(waChatContact = null, waError = null) }

    fun loadWaThread(contactId: String) {
        viewModelScope.launch {
            set { it.copy(waLoading = true) }
            runCatching { Repository.fetchWhatsThread(contactId) }
                .onSuccess { list -> set { it.copy(waThread = list, waLoading = false) } }
                .onFailure { set { it.copy(waLoading = false) } }
        }
    }

    /** Sends via the company WhatsApp number (tracked). Reloads the thread on success. */
    fun sendWa(text: String) {
        val contactId = _state.value.waChatContact?.id ?: return
        if (text.isBlank() || _state.value.waSending) return
        viewModelScope.launch {
            set { it.copy(waSending = true, waError = null) }
            val err = runCatching { Repository.sendWhatsApp(contactId, text) }.getOrDefault("Couldn't send")
            if (err == null) {
                runCatching { Repository.fetchWhatsThread(contactId) }
                    .onSuccess { list -> set { it.copy(waThread = list, waSending = false) } }
                    .onFailure { set { it.copy(waSending = false) } }
            } else {
                set { it.copy(waSending = false, waError = err) }
            }
        }
    }

    /**
     * One-tap campaign for telecallers: auto-dial a hand-picked set of leads with
     * no file upload or campaign setup. The admin uploads the leads; the rep just
     * selects (all or by choice) and starts.
     */
    fun startSelectedLeads(contacts: List<Contact>) {
        val callable = contacts.filter { it.id != null && it.status != "dnc" }
        if (callable.isEmpty()) {
            set { it.copy(error = "Select at least one callable lead (DNC are skipped).") }
            return
        }
        val s = _state.value
        DialerController.prepare(
            callable,
            DialerConfig(gapSeconds = s.breakSeconds, reviewAfterEachCall = s.reviewAfterCall),
            "Selected leads (${callable.size})",
            callable.firstOrNull()?.campaignId ?: "",
        )
        AutoDialerService.start(getApplication())
        set { it.copy(message = "▶ Calling ${callable.size} selected leads…") }
    }

    /** Optimistically updates the in-memory lead so the chip reflects instantly. */
    fun setLeadDisposition(contactId: String, status: String) {
        viewModelScope.launch {
            runCatching { Repository.setDisposition(contactId, status, null) }
                .onSuccess {
                    launchActivityLog(contactId) { add("status" to "Stage → ${stageDisplay(status)}") }
                    set { st ->
                        st.copy(leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(status = status) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /** Applies any subset of lead edits (stage/temperature/budget/note) at once. */
    // ---------- quick add lead ----------
    fun openAddLead() = set { it.copy(showAddLead = true) }
    fun closeAddLead() = set { it.copy(showAddLead = false) }

    fun openSettings() = set { it.copy(showSettings = true) }

    /** Floating AI Coach: open the sheet and (re)load the panel + "Aaj ke 5".
     *  The backend caches per call / per day-slot; the picks load once per
     *  session — so repeat opens are instant and cheap. */
    fun openCoach() {
        set {
            it.copy(
                coachOpen = true,
                coachLoading = it.coachPanel == null,
                coachPicksLoading = it.coachPicks.isEmpty(),
            )
        }
        loadLeads(force = false) // so picks can resolve to names/phones
        viewModelScope.launch {
            val panel = runCatching { Repository.coachPanel() }.getOrNull()
            set { it.copy(coachPanel = panel ?: it.coachPanel, coachLoading = false) }
        }
        viewModelScope.launch {
            if (_state.value.coachPicks.isEmpty()) {
                val picks = runCatching { Repository.focusFive() }.getOrDefault(emptyList())
                set { it.copy(coachPicks = picks, coachPicksLoading = false) }
            } else {
                set { it.copy(coachPicksLoading = false) }
            }
        }
    }
    fun closeCoach() = set { it.copy(coachOpen = false) }

    // ---- Ask the coach (open Q&A inside the floating coach) ----
    fun setCoachAsk(text: String) = set { it.copy(coachAsk = text) }
    fun clearCoachAnswer() = set { it.copy(coachAnswer = null, coachAsk = "") }
    fun askCoach() {
        val q = _state.value.coachAsk.trim()
        if (q.isEmpty() || _state.value.coachAnswerLoading) return
        set { it.copy(coachAnswerLoading = true, coachAnswer = null) }
        viewModelScope.launch {
            val ans = runCatching { Repository.coachAsk(q) }.getOrNull()
            set {
                it.copy(
                    coachAnswerLoading = false,
                    coachAnswer = ans ?: "Abhi jawab nahi mila — thodi der me phir try kijiye.",
                )
            }
        }
    }

    // ---- Objection Buster (floating coach) ----
    fun setCoachObjection(text: String) = set { it.copy(coachObjection = text) }
    fun clearCoachRebuttal() = set { it.copy(coachRebuttal = null, coachObjection = "") }

    /** The customer objected mid-call → the exact RAG-grounded line to say back.
     *  Standalone (no open lead needed) so it works from any screen. */
    fun getCoachRebuttal(objection: String) {
        val q = objection.trim()
        if (q.isBlank() || _state.value.coachRebuttalLoading) return
        set { it.copy(coachRebuttalLoading = true, coachRebuttal = null) }
        viewModelScope.launch {
            val reply = runCatching { Repository.coachRebuttal(q, _state.value.profile?.speaksAs) }.getOrNull()
            // A failure never lands in the result field — the rep must not read an
            // error as "the line to say".
            set { it.copy(coachRebuttal = reply, coachRebuttalLoading = false) }
        }
    }

    fun closeSettings() = set { it.copy(showSettings = false) }

    /** From an overlay's bottom nav: close overlays and ask MainShell to switch tab. */
    fun goToTab(route: String) = set { it.copy(showSettings = false, leadDetailId = null, pendingTab = route) }
    fun consumeTab() = set { it.copy(pendingTab = null) }

    /** From an overlay's "More": close overlays and open the app drawer. */
    fun openDrawerFromOverlay() = set { it.copy(showSettings = false, leadDetailId = null, pendingDrawer = true) }
    fun consumeDrawer() = set { it.copy(pendingDrawer = false) }

    /** Creates one lead from the quick-add sheet, then refreshes the list. */
    fun addLead(name: String, phone: String, project: String?, budget: String?, note: String?) {
        val cleanPhone = phone.filter { it.isDigit() || it == '+' }
        if (cleanPhone.length < 7) { set { it.copy(error = "Enter a valid phone number.") }; return }
        viewModelScope.launch {
            set { it.copy(addingLead = true) }
            runCatching { Repository.addLead(name, cleanPhone, project, budget, note) }
                .onSuccess { c ->
                    set { st -> st.copy(leads = listOf(c) + st.leads, addingLead = false, showAddLead = false, message = "Lead added ✓") }
                }
                .onFailure { e -> set { it.copy(addingLead = false, error = e.message ?: "Couldn't add the lead.") } }
        }
    }

    fun applyLead(contactId: String, status: String?, temperature: String?, budget: String?, note: String?, svProj: String? = null, svAt: String? = null, tokenAmount: String? = null, name: String? = null) {
        viewModelScope.launch {
            // Persist a positive token amount whenever it's supplied. The sheet
            // asks for it on BOOKED as well as Token Paid, so paid-at has to be
            // stamped on both — otherwise money recorded against a won deal has
            // no date on it, and every report that asks "what did we collect
            // this month" silently misses it.
            val token = tokenAmount?.toDoubleOrNull()?.takeIf { it > 0 }
            val patch = buildMap<String, String> {
                if (name != null) put("name", name)
                if (status != null) put("status", status)
                if (temperature != null) put("temperature", temperature)
                if (budget != null) put("budget", budget)
                if (note != null) put("notes", note)
                if (svProj != null) put("site_visit_project", svProj)
                if (svAt != null) put("site_visit_at", svAt)
                if (token != null) {
                    put("token_amount", token.toString())
                    if (status == "token_paid" || status == "booked") {
                        put("token_paid_at", java.time.Instant.now().toString())
                    }
                }
            }
            runCatching { Repository.updateContact(contactId, patch) }
                .onSuccess {
                    // Record what changed in the lead's history timeline.
                    launchActivityLog(contactId) {
                        if (status != null) add("status" to "Stage → ${stageDisplay(status)}")
                        if (temperature != null) add("temperature" to "Marked ${temperature.replaceFirstChar { c -> c.uppercase() }}")
                        if (budget != null) add("budget" to "Budget: $budget")
                        if (note != null) add("note" to "Note: $note")
                        if (svProj != null || svAt != null) {
                            val at = svAt?.let { s -> " on ${prettyDateTime(s)}" } ?: ""
                            add("site_visit" to "Site visit${svProj?.let { p -> ": $p" } ?: ""}$at")
                        }
                        if (token != null) add("budget" to "Token amount: ₹${if (token % 1.0 == 0.0) token.toLong() else token}")
                    }
                    set { st ->
                        st.copy(leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(
                                status = status ?: c.status,
                                temperature = temperature ?: c.temperature,
                                budget = budget ?: c.budget,
                                notes = note ?: c.notes,
                                siteVisitProject = svProj ?: c.siteVisitProject,
                                siteVisitAt = svAt ?: c.siteVisitAt,
                                tokenAmount = token ?: c.tokenAmount,
                            ) else c
                        })
                    }
                    // A "callback" lead rests in Working only while it has a pending
                    // reminder; the DB auto-creates one (migration 0086). Pull the
                    // fresh follow-up list so the lead leaves New right away instead
                    // of lingering until the next manual refresh.
                    if (status == "callback") loadFollowUps(force = true)
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /** Buyer changed their mind: remove the planned site visit and, if the lead
     *  was parked at Site Visit, walk it back to Interested. */
    fun clearSiteVisit(contactId: String) {
        viewModelScope.launch {
            runCatching { Repository.clearSiteVisit(contactId) }
                .onSuccess {
                    val revert = _state.value.leads.find { it.id == contactId }?.status == "site_visit"
                    if (revert) runCatching { Repository.updateContact(contactId, mapOf("status" to "interested")) }
                    set { st ->
                        st.copy(
                            leads = st.leads.map { c ->
                                if (c.id == contactId) c.copy(
                                    siteVisitAt = null, siteVisitProject = null,
                                    status = if (revert) "interested" else c.status,
                                ) else c
                            },
                            message = "Site visit removed",
                        )
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun setLeadTemperature(contactId: String, temperature: String) {
        viewModelScope.launch {
            runCatching { Repository.setTemperature(contactId, temperature) }
                .onSuccess {
                    launchActivityLog(contactId) {
                        add("temperature" to "Marked ${temperature.replaceFirstChar { c -> c.uppercase() }}")
                    }
                    set { st ->
                        st.copy(leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(temperature = temperature) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /** Edits the lead's name and/or second number from the lead page. */
    fun updateLeadIdentity(contactId: String, name: String?, altPhone: String?) {
        val cleanName = name?.trim()?.ifBlank { null }
        val cleanAlt = altPhone?.filter { it.isDigit() || it == '+' }?.ifBlank { null }
        viewModelScope.launch {
            runCatching { Repository.updateLeadIdentity(contactId, cleanName, cleanAlt) }
                .onSuccess {
                    set { st ->
                        st.copy(leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(name = cleanName, altPhone = cleanAlt) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message ?: "Couldn't save changes") } }
        }
    }

    // ---------- follow-up scheduler ----------

    fun loadFollowUps(force: Boolean = false) {
        if (!shouldLoad("followups", force)) return
        viewModelScope.launch {
            set { it.copy(followUpsLoading = true) }
            runCatching { Repository.fetchFollowUps() }
                .onSuccess { list ->
                    set { it.copy(followUpList = list, followUpsLoading = false) }
                    // Arm the on-device alarm for every upcoming follow-up —
                    // including ones the SERVER created (Wada auto-apply), which
                    // this phone has never seen. Re-arming is idempotent: the
                    // PendingIntent id is the follow-up id.
                    val now = System.currentTimeMillis()
                    list.forEach { f ->
                        val ms = runCatching { java.time.OffsetDateTime.parse(f.dueAt).toInstant().toEpochMilli() }
                            .recoverCatching { java.time.Instant.parse(f.dueAt).toEpochMilli() }
                            .getOrNull()
                        if (ms != null && ms > now) {
                            FollowUpReminder.schedule(getApplication(), f.id ?: f.phone, f.name, f.phone, f.note, ms)
                        }
                    }
                }
                .onFailure { e -> set { it.copy(followUpsLoading = false, error = e.message) } }
        }
    }

    /** Schedules a callback [dueAtMillis] from now and arms an on-device reminder.
     *  [mirrorStatus] false = auto-retry: the lead stays in its current bucket. */
    fun scheduleFollowUp(contactId: String?, phone: String, name: String?, dueAtMillis: Long, note: String?, mirrorStatus: Boolean = true) {
        viewModelScope.launch {
            val iso = java.time.Instant.ofEpochMilli(dueAtMillis).toString()
            runCatching { Repository.scheduleFollowUp(contactId, phone, name, iso, note, mirrorStatus) }
                .onSuccess { saved ->
                    FollowUpReminder.schedule(
                        getApplication(),
                        id = saved?.id ?: phone,
                        name = name,
                        phone = phone,
                        note = note,
                        dueAtMillis = dueAtMillis,
                    )
                    set { it.copy(message = "⏰ Follow-up set for ${shortWhen(dueAtMillis)}") }
                    loadFollowUps()
                    if (contactId != null) {
                        if (mirrorStatus) set { st ->
                            st.copy(leads = st.leads.map { c ->
                                if (c.id == contactId) c.copy(status = "follow_up") else c
                            })
                        }
                        launchActivityLog(contactId) {
                            add("follow_up" to buildString {
                                append("Follow-up scheduled for ${shortWhen(dueAtMillis)}")
                                if (!note.isNullOrBlank()) append(" — $note")
                            })
                        }
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /** Bulk-moves the given follow-ups to [dueAtMillis] and re-arms their reminders. */
    fun rescheduleFollowUps(items: List<FollowUp>, dueAtMillis: Long) {
        if (items.isEmpty()) return
        val iso = java.time.Instant.ofEpochMilli(dueAtMillis).toString()
        viewModelScope.launch {
            items.forEach { f ->
                val id = f.id ?: return@forEach
                runCatching { Repository.rescheduleFollowUp(id, iso) }
                FollowUpReminder.schedule(getApplication(), id, f.name, f.phone, f.note, dueAtMillis)
            }
            set { it.copy(message = "Moved ${items.size} follow-up${if (items.size == 1) "" else "s"} to tomorrow 10 AM") }
            loadFollowUps(force = true)
        }
    }

    fun completeFollowUp(id: String) {
        viewModelScope.launch {
            runCatching { Repository.completeFollowUp(id) }
                .onSuccess {
                    set { st -> st.copy(followUpList = st.followUpList.filterNot { it.id == id }) }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    /** Snooze a follow-up: complete the old one and create a new one +[hours] from now. */
    fun snoozeFollowUp(id: String, hours: Int = 1) {
        val f = _state.value.followUpList.find { it.id == id } ?: return
        viewModelScope.launch {
            runCatching { Repository.completeFollowUp(id) }
            val newDue = System.currentTimeMillis() + hours * 3600_000L
            scheduleFollowUp(f.contactId, f.phone, f.name, newDue, f.note)
        }
    }

    // ---------- post-call disposition ----------

    /** 1-tap disposition from the post-call popup. Optionally stamps the lead's
     *  temperature and a quick note in the same step, and auto-schedules a retry
     *  when the call didn't connect — so "No answer"/"Busy" never gets forgotten. */
    fun postCallDispose(status: String, temperature: String? = null, note: String? = null) {
        val contactId = _state.value.postCallContactId ?: return
        val phone = _state.value.postCallPhone
        val name = _state.value.postCallName
        // Answering the prompt IS finishing the callback it was opened from, so
        // the old one closes. Read before the work below, because the reschedule
        // path routes through here after booking the NEXT one — closing by id
        // can then never take the new callback down with the old.
        val fromFollowUp = _state.value.postCallFollowUpId
        val cleanNote = note?.trim()?.ifBlank { null }
        // The question has been answered, so the Update button stops shaking —
        // whether it was asked by a popup, by the nudge bar, or by the rep
        // opening the lead themselves.
        clearPendingUpdate(contactId)
        viewModelScope.launch {
            runCatching { Repository.setDisposition(contactId, status, cleanNote) }
                .onSuccess {
                    if (temperature != null) runCatching { Repository.setTemperature(contactId, temperature) }
                    set { st ->
                        st.copy(
                            leads = st.leads.map { c ->
                                // handledAt locally too, so the lead leaves New the
                                // instant the rep answers the prompt rather than on
                                // the next server refresh.
                                if (c.id == contactId) c.copy(status = status, temperature = temperature ?: c.temperature, notes = cleanNote ?: c.notes, handledAt = java.time.Instant.now().toString()) else c
                            },
                        )
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
        // Attempt ladder: nobody answered (or the wrong person did) → the lead
        // STAYS in New, the next attempt books itself for the next day in the
        // OPPOSITE half of the day (morning miss → evening try, and vice
        // versa — people who miss at 11 AM often pick up at 5 PM). After 3
        // straight misses the lead goes cold and the ladder stops: persistence,
        // not harassment.
        if (status in setOf("no_answer", "busy", "wrong_person") && !phone.isNullOrBlank()) {
            val tries = (_state.value.leads.find { it.id == contactId }?.attempts ?: 0) + 1
            viewModelScope.launch { runCatching { Repository.setAttempts(contactId, tries) } }
            set { st -> st.copy(leads = st.leads.map { if (it.id == contactId) it.copy(attempts = tries) else it }) }
            if (tries >= 3) {
                viewModelScope.launch { runCatching { Repository.setTemperature(contactId, "cold") } }
                set { st ->
                    st.copy(
                        leads = st.leads.map { if (it.id == contactId) it.copy(temperature = "cold") else it },
                        message = "3 attempts, koi jawab nahi — lead cold. Auto-retry band.",
                    )
                }
            } else {
                scheduleFollowUp(
                    contactId, phone, name,
                    dueAtMillis = nextAttemptMillis(tries),
                    note = "Attempt ${tries + 1} — pichhli baar nahi uthaya",
                    mirrorStatus = false,
                )
            }
        }
        fromFollowUp?.let { completeFollowUp(it) }
        dismissPostCall()
    }

    /** When to try a no-answer lead again: attempt 2 = next day, attempt 3 =
     *  two days later; always the opposite half of the day from right now. */
    private fun nextAttemptMillis(triesSoFar: Int): Long {
        val cal = java.util.Calendar.getInstance()
        val morningNow = cal.get(java.util.Calendar.HOUR_OF_DAY) < 14
        cal.add(java.util.Calendar.DAY_OF_YEAR, if (triesSoFar >= 2) 2 else 1)
        cal.set(java.util.Calendar.HOUR_OF_DAY, if (morningNow) 17 else 11)
        cal.set(java.util.Calendar.MINUTE, if (morningNow) 0 else 15)
        cal.set(java.util.Calendar.SECOND, 0)
        return cal.timeInMillis
    }

    /**
     * Open that same prompt by hand, from a follow-up's Update button.
     *
     * A rep ringing their callbacks had no way to say what happened without
     * leaving the list and opening the lead. "Done" only ticked the callback
     * off; it never moved the funnel, so a customer who said "interested, call
     * Friday" needed a screen change, a stage tap, a back, and a fresh
     * follow-up. This is the same one-screen answer the post-call prompt
     * already gives, reached from where the work actually is.
     *
     * Deliberately the SAME sheet, not a copy: one prompt means the funnel
     * moves, the temperature, the note, the voice note and the rescheduling all
     * behave identically whether the rep answers it after a call or from here.
     */
    fun openFollowUpUpdate(contactId: String?, phone: String, name: String?, followUpId: String?) = set {
        it.copy(
            postCallContactId = contactId, postCallPhone = phone,
            postCallName = name, postCallCampaignId = null,
            postCallConnected = true, postCallManual = true,
            postCallFollowUpId = followUpId,
        )
    }

    /** Dismiss the post-call popup without logging any disposition. */
    fun dismissPostCall() = set {
        it.copy(
            postCallContactId = null, postCallPhone = null,
            postCallName = null, postCallCampaignId = null,
            postCallConnected = false, postCallManual = false,
            postCallFollowUpId = null,
        )
    }

    /** Schedule a follow-up from the post-call popup, carrying any temperature /
     *  note captured on the sheet, then dismiss it. [status] lets the Interested
     *  flow stamp the lead "interested" while still locking in the next touch. */
    fun postCallScheduleFollowUp(dueAtMillis: Long, note: String?, temperature: String? = null, status: String = "callback") {
        val s = _state.value
        val contactId = s.postCallContactId
        val phone = s.postCallPhone ?: return
        val name = s.postCallName
        // postCallDispose (below) stamps the real status; don't let the
        // follow-up mirror overwrite it. A "callback" lead must STAY callback
        // so it sleeps in Working and wakes back up in New at its due time.
        scheduleFollowUp(contactId, phone, name, dueAtMillis, note, mirrorStatus = false)
        // "Kal call karna" is still an unfinished attempt — count it, so the
        // lead resurfaces tomorrow wearing "Attempt 2/3" like the no-answers.
        if (status == "callback" && contactId != null) {
            val tries = (_state.value.leads.find { it.id == contactId }?.attempts ?: 0) + 1
            viewModelScope.launch { runCatching { Repository.setAttempts(contactId, tries) } }
            set { st -> st.copy(leads = st.leads.map { if (it.id == contactId) it.copy(attempts = tries) else it }) }
        }
        postCallDispose(status, temperature, note)
    }

    /** "Skip" with a note/temperature typed: save what was captured without
     *  touching the lead's status, so nothing the rep wrote is ever lost. */
    fun postCallSaveContext(temperature: String?, note: String?) {
        val contactId = _state.value.postCallContactId
        val cleanNote = note?.trim()?.ifBlank { null }
        if (contactId != null && (cleanNote != null || temperature != null)) clearPendingUpdate(contactId)
        if (contactId != null && (cleanNote != null || temperature != null)) {
            viewModelScope.launch {
                runCatching {
                    if (cleanNote != null) Repository.setContactNote(contactId, cleanNote)
                    if (temperature != null) Repository.setTemperature(contactId, temperature)
                }
                set { st ->
                    st.copy(leads = st.leads.map { c ->
                        if (c.id == contactId) {
                            // A typed note IS an answer to the prompt — stamp it so
                            // the lead moves out of New straight away.
                            c.copy(
                                notes = cleanNote ?: c.notes,
                                temperature = temperature ?: c.temperature,
                                handledAt = if (cleanNote != null) java.time.Instant.now().toString() else c.handledAt,
                            )
                        } else c
                    }, message = "✓ Note saved")
                }
            }
        }
        dismissPostCall()
    }

    /** Safety net: give every unprotected interested/callback lead a follow-up
     *  tomorrow 10 AM in one tap — no lead ever sits without a next action. */
    fun protectLeads(items: List<Contact>) {
        if (items.isEmpty()) return
        val due = java.time.ZonedDateTime.now().plusDays(1)
            .withHour(10).withMinute(0).withSecond(0).toInstant().toEpochMilli()
        viewModelScope.launch {
            val iso = java.time.Instant.ofEpochMilli(due).toString()
            items.forEach { c ->
                runCatching { Repository.scheduleFollowUp(c.id, c.phone, c.name, iso, "Safety net — don't lose this lead") }
                    .onSuccess { saved ->
                        FollowUpReminder.schedule(getApplication(), saved?.id ?: c.phone, c.name, c.phone,
                            "Safety net — don't lose this lead", due)
                    }
            }
            set { it.copy(message = "🛡️ ${items.size} lead${if (items.size == 1) "" else "s"} protected — follow-up tomorrow 10 AM") }
            loadFollowUps(force = true)
        }
    }

    // ════════════════════════════════════════════════════════════
    //  THE ASSISTANT — the app asking, instead of only recording
    // ════════════════════════════════════════════════════════════
    //
    // Two questions decide more deals than anything else in this CRM, and until
    // now neither was ever asked:
    //
    //   "The visit was Tuesday. Did they actually come — and how close are they?"
    //   "That callback was due at 4. Did you make it? If not, what stopped you?"
    //
    // Both were answerable only by the rep going and looking, and nobody looks.
    // So the app asks. Once, at the right moment, about one lead, with the
    // answer wired straight into the funnel so answering it IS the work.
    //
    // Everything below exists to stop this becoming spam. A rep who learns that
    // the app interrupts them will dismiss the next prompt without reading it,
    // and then the feature is worse than nothing — it has trained them to ignore
    // us. The rules are therefore deliberately strict and all of them are hard
    // limits, not preferences:
    //
    //   · one prompt on screen, ever — the slot is a single nullable field
    //   · never over a call, the dialler, the disposition sheet or an update
    //   · a quiet gap between any two prompts
    //   · a hard daily cap
    //   · one question per lead per day, whatever the answer — including
    //     "dismissed", because re-asking something the rep just waved away is
    //     the single fastest way to lose them
    //   · working hours only, and never in the first minute and a half after
    //     the app opens: let them start their day before we start talking

    /** Minimum quiet time between any two assistant prompts. */
    private val PROMPT_GAP_MS = 40 * 60_000L
    /** Hard ceiling on prompts in one day. The day review is the only exception. */
    private val PROMPT_DAILY_CAP = 5
    /** A callback has to be properly late before we ask — not "due 3 minutes ago". */
    private val CALLBACK_LATE_MS = 30 * 60_000L
    /** …and not so old that the rep has obviously already decided to leave it. */
    private val CALLBACK_STALE_MS = 2 * 24 * 3600_000L
    /** A visit day has to be well past before "did they come?" is a fair question. */
    private val VISIT_SETTLE_MS = 2 * 3600_000L
    private val VISIT_STALE_MS = 30L * 24 * 3600_000L

    /** When the app last came to the foreground — we stay quiet right after. */
    @Volatile private var foregroundAt: Long = System.currentTimeMillis()

    fun onForeground() {
        foregroundAt = System.currentTimeMillis()
        expirePendingUpdates()
    }

    fun setAssistantOn(value: Boolean) {
        AppPrefs.setAssistantOn(getApplication(), value)
        set { it.copy(assistantOn = value, assistantAsk = if (value) it.assistantAsk else null) }
    }

    fun setPostCallPopup(value: Boolean) {
        AppPrefs.setPostCallPopup(getApplication(), value)
        set { it.copy(postCallPopup = value) }
    }

    /** Stops the shake on one lead — its call has an outcome now. */
    fun clearPendingUpdate(contactId: String) =
        set { it.copy(pendingUpdates = it.pendingUpdates.filterNot { p -> p.contactId == contactId }) }

    /** A call nobody answered for six hours isn't a fresh nudge any more. */
    private fun expirePendingUpdates() {
        val cutoff = System.currentTimeMillis() - 6 * 3600_000L
        val kept = _state.value.pendingUpdates.filter { it.at >= cutoff }
        if (kept.size != _state.value.pendingUpdates.size) set { it.copy(pendingUpdates = kept) }
    }

    /** Opens the standard Update sheet for the call the rep hasn't answered yet. */
    fun openPendingUpdate(p: PendingUpdate) {
        val fu = _state.value.followUpList.firstOrNull { it.contactId == p.contactId }
        openFollowUpUpdate(p.contactId, p.phone, p.name, fu?.id)
    }

    /**
     * Decide whether to ask something, and what. Called on a slow tick and on
     * every foreground; returns without doing anything the overwhelming
     * majority of the time, which is the point.
     */
    fun tickAssistant() {
        val ctx = getApplication<Application>()
        val s = _state.value
        expirePendingUpdates()
        if (!s.signedIn || !s.assistantOn || s.assistantAsk != null) return
        // Never on top of something the rep is already doing.
        if (s.postCallContactId != null || s.cloudCallNumber != null || s.update != null) return
        if (s.leadDetailId != null || s.showAddLead || s.showSettings) return
        if (DialerController.state.value.isRunning) return
        if (com.salesautocall.app.dialer.SimCallMonitor.state.value != null) return
        // An unanswered call outranks anything we might want to ask about.
        if (s.pendingUpdates.isNotEmpty()) return

        val now = System.currentTimeMillis()
        if (now - foregroundAt < 90_000L) return
        val zone = java.time.ZonedDateTime.now()
        if (zone.hour < 9 || zone.hour >= 21) return
        if (now - AppPrefs.getPromptLastAt(ctx) < PROMPT_GAP_MS) return

        val today = java.time.LocalDate.now().toString()
        val asked = AppPrefs.getAskedToday(ctx, today)
        val overCap = AppPrefs.getPromptCount(ctx, today) >= PROMPT_DAILY_CAP

        // After 7pm the calling day is effectively over, so the review comes
        // first — a callback we ask about at 8pm is one the rep can't act on.
        val ask = (if (zone.hour >= AppPrefs.getDayReviewHour(ctx)) dayReviewAsk(asked, now) else null)
            ?: (if (overCap) null else visitCheckAsk(asked, now))
            ?: (if (overCap) null else callbackCheckAsk(asked, now))
        if (ask == null) return

        AppPrefs.setPromptLastAt(ctx, now)
        AppPrefs.bumpPromptCount(ctx, today)
        AppPrefs.markAsked(ctx, today, ask.key)
        set { it.copy(assistantAsk = ask.copy(shownAt = now)) }

        // The card opens on the counters the phone already has, and the coached
        // half fills in behind it. Waiting on the network before showing
        // anything would make the one prompt of the day feel broken on a bad
        // connection — and if the fetch never lands, the card is still the day
        // review it has always been.
        if (ask.kind == "day_review") loadDayReview()
    }

    /** Fetch (or re-fetch) the coached half of the 7pm card. Cached server-side
     *  per rep per date, so this is cheap on the second and third open. */
    fun loadDayReview() {
        if (_state.value.dayReviewLoading) return
        set { it.copy(dayReviewLoading = true) }
        viewModelScope.launch {
            val r = runCatching { Repository.dayReview() }.getOrNull()
            set { it.copy(dayReview = r ?: it.dayReview, dayReviewLoading = false) }
        }
    }

    /** The oldest site visit whose day has gone by with nothing to show for it. */
    private fun visitCheckAsk(asked: Set<String>, now: Long): AssistantAsk? {
        val ctx = getApplication<Application>()
        // Finished, and "moved on past the visit", from the canonical rows.
        val stages = _state.value.leadStages
        fun terminal(code: String) = stages.firstOrNull { it.code == code }?.isTerminal ?: false
        fun pastVisit(code: String) =
            (stages.firstOrNull { it.code == code }?.sortOrder ?: 0) >
            (stages.firstOrNull { it.code == "site_visit" }?.sortOrder ?: 40)
        val c = _state.value.leads
            .asSequence()
            .filter { it.id != null && "visit_check:${it.id}" !in asked }
            .filter { !terminal(it.stage) && !pastVisit(it.stage) && it.siteVisitArrivedAt == null }
            // Asked twice already and still no answer. Stop. A third prompt
            // teaches the rep that these can be ignored, and after that they
            // ignore the useful ones too. It is the manager's problem now —
            // the lead is sitting in v_pending_site_visit_outcomes with
            // needs_manager set, waiting for a person rather than a popup.
            .filter { AppPrefs.getVisitAsks(ctx, it.id!!) < 2 }
            .mapNotNull { lead -> parseInstantOrNull(lead.siteVisitAt)?.let { lead to it } }
            .filter { (_, ms) -> ms < now - VISIT_SETTLE_MS && ms > now - VISIT_STALE_MS }
            .minByOrNull { it.second } ?: return null
        c.first.id?.let { AppPrefs.bumpVisitAsks(ctx, it) }
        return AssistantAsk(
            kind = "visit_check",
            key = "visit_check:${c.first.id}",
            contactId = c.first.id,
            phone = c.first.phone,
            name = c.first.name ?: c.first.phone,
            project = c.first.siteVisitProject,
            whenLabel = agoLabel(now - c.second),
        )
    }

    /**
     * The freshest missed callback, not the oldest.
     *
     * A callback three days red is one the rep has already seen and decided
     * about; asking again teaches them we don't know what's going on. One that
     * went red forty minutes ago is the one still worth saving today.
     *
     * "Did you call?" is only a fair question if we don't already know the
     * answer — a lead dialled since the callback came due is skipped outright.
     */
    private fun callbackCheckAsk(asked: Set<String>, now: Long): AssistantAsk? {
        val leadsById = _state.value.leads.associateBy { it.id }
        val f = _state.value.followUpList
            .asSequence()
            .mapNotNull { fu -> parseInstantOrNull(fu.dueAt)?.let { fu to it } }
            .filter { (fu, due) ->
                due <= now - CALLBACK_LATE_MS && due > now - CALLBACK_STALE_MS &&
                    "callback_check:${fu.contactId ?: fu.phone}" !in asked
            }
            .filterNot { (fu, due) ->
                val called = parseInstantOrNull(leadsById[fu.contactId]?.lastContactedAt) ?: 0L
                called >= due
            }
            .maxByOrNull { it.second } ?: return null
        val note = f.first.note?.trim()?.takeIf { it.isNotEmpty() }
        return AssistantAsk(
            kind = "callback_check",
            key = "callback_check:${f.first.contactId ?: f.first.phone}",
            contactId = f.first.contactId,
            phone = f.first.phone,
            name = f.first.name ?: f.first.phone,
            whenLabel = agoLabel(now - f.second),
            why = when {
                note == null -> null
                note.startsWith("AI:", ignoreCase = true) -> note.removePrefix("AI:").removePrefix("ai:").trim()
                else -> note
            },
            followUpId = f.first.id,
        )
    }

    /** One honest look back at the day, once, after 7pm, if the rep worked. */
    private fun dayReviewAsk(asked: Set<String>, now: Long): AssistantAsk? {
        val today = java.time.LocalDate.now().toString()
        if ("day_review:$today" in asked) return null
        val s = _state.value
        if (s.todayCalls < 1) return null
        val startOfDay = java.time.LocalDate.now().atStartOfDay(java.time.ZoneId.systemDefault())
            .toInstant().toEpochMilli()
        val notUpdated = s.leads.count { c ->
            val called = parseInstantOrNull(c.lastContactedAt) ?: return@count false
            called >= startOfDay && (parseInstantOrNull(c.handledAt) ?: 0L) < called
        }
        return AssistantAsk(
            kind = "day_review",
            key = "day_review:$today",
            whenLabel = today,
            calls = s.todayCalls,
            connected = s.todayConnected,
            interested = s.leads.count { it.status == "interested" },
            visitsBooked = s.leads.count { c ->
                (parseInstantOrNull(c.siteVisitAt) ?: 0L) >= now
            },
            notUpdated = notUpdated,
        )
    }

    // ---------- answering the assistant ----------

    /** Closes the prompt and records that it went unanswered. Never punished. */
    fun assistantDismiss() {
        val ask = _state.value.assistantAsk ?: return
        set { it.copy(assistantAsk = null) }
        logPrompt(ask, answer = null, dismissed = true)
    }

    /**
     * "Yes, they came" — with the rep's own read on how close the deal is.
     *
     * All of it lands in one write: the visit is confirmed (so it stops being an
     * unanswered question and stops inflating the ad report's qualified count),
     * the forecast is stored against the lead, and the stage moves to whatever
     * the rep picked. If that stage still needs a next touch and the lead has
     * none, one is booked — this feature must not create leads with nowhere to go.
     */
    fun assistantVisitCame(percent: Int, nextStatus: String) {
        val ask = _state.value.assistantAsk ?: return
        val contactId = ask.contactId ?: return
        set { it.copy(assistantAsk = null) }
        viewModelScope.launch {
            runCatching {
                Repository.confirmSiteVisitHappened(contactId)
                Repository.setCloseProbability(contactId, percent)
                Repository.setDisposition(contactId, nextStatus, null)
            }.onSuccess {
                val nowIso = java.time.Instant.now().toString()
                set { st ->
                    st.copy(
                        leads = st.leads.map { c ->
                            if (c.id != contactId) c
                            else c.copy(
                                status = nextStatus, siteVisitArrivedAt = nowIso,
                                siteVisitVerified = false, closeProbability = percent,
                                closeProbabilityAt = nowIso, handledAt = nowIso,
                            )
                        },
                        message = "✅ Visit confirmed · $percent% chance saved",
                    )
                }
                launchActivityLog(contactId) {
                    add("site_visit" to "Customer came to the site — rep's read: $percent% chance of closing")
                }
                // No lead without a next action: if this stage is still live and
                // nothing is booked, put a call in the diary for tomorrow.
                if (nextStatus in setOf("interested", "negotiation", "callback") &&
                    _state.value.followUpList.none { it.contactId == contactId }
                ) {
                    val due = java.time.ZonedDateTime.now().plusDays(1)
                        .withHour(11).withMinute(0).withSecond(0).toInstant().toEpochMilli()
                    scheduleFollowUp(contactId, ask.phone ?: return@onSuccess, ask.name, due,
                        "After the site visit — $percent% chance", mirrorStatus = false)
                }
                loadLeads(force = true)
            }.onFailure { e -> set { it.copy(error = e.message) } }
        }
        logPrompt(ask, answer = "came", probability = percent, reason = nextStatus)
    }

    /**
     * "No, they didn't come."
     *
     * The planned date is wiped either way — leaving it there is what makes the
     * app keep insisting a visit is on the books when everyone involved knows it
     * isn't. [reason] then decides where the lead goes: still alive and worth a
     * call, or honestly dead.
     */
    fun assistantVisitNoShow(reason: String) {
        val ask = _state.value.assistantAsk ?: return
        val contactId = ask.contactId ?: return
        set { it.copy(assistantAsk = null) }
        val nextStatus = when (reason) {
            "lost_interest" -> "not_interested"
            "competitor" -> "lost"
            else -> "callback"
        }
        viewModelScope.launch {
            runCatching {
                Repository.clearSiteVisit(contactId)
                Repository.setDisposition(contactId, nextStatus, null)
            }.onSuccess {
                val nowIso = java.time.Instant.now().toString()
                set { st ->
                    st.copy(
                        leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(
                                status = nextStatus, siteVisitAt = null,
                                siteVisitProject = null, handledAt = nowIso,
                            ) else c
                        },
                        message = "Visit didn't happen — lead updated",
                    )
                }
                launchActivityLog(contactId) {
                    add("site_visit" to "Customer did not come — ${reasonLabel(reason)}")
                }
                // Still alive → it gets a next call, not silence.
                if (nextStatus == "callback" && _state.value.followUpList.none { it.contactId == contactId }) {
                    val due = java.time.ZonedDateTime.now().plusDays(1)
                        .withHour(11).withMinute(0).withSecond(0).toInstant().toEpochMilli()
                    scheduleFollowUp(contactId, ask.phone ?: return@onSuccess, ask.name, due,
                        "Visit missed — ${reasonLabel(reason)}", mirrorStatus = false)
                }
                loadLeads(force = true)
            }.onFailure { e -> set { it.copy(error = e.message) } }
        }
        logPrompt(ask, answer = "no_show", reason = reason)
    }

    /**
     * The visit moved to a new day — the one answer that is neither yes nor no.
     *
     * The lead stays exactly where it is in the funnel; only the date changes,
     * and a reminder goes in for the morning of the new date so the rep is not
     * relying on remembering it.
     */
    fun assistantVisitPostponed(newVisitMillis: Long) {
        val ask = _state.value.assistantAsk ?: return
        val contactId = ask.contactId ?: return
        set { it.copy(assistantAsk = null) }
        val iso = java.time.Instant.ofEpochMilli(newVisitMillis).toString()
        viewModelScope.launch {
            runCatching { Repository.updateContact(contactId, mapOf("site_visit_at" to iso)) }
                .onSuccess {
                    set { st ->
                        st.copy(
                            leads = st.leads.map { c -> if (c.id == contactId) c.copy(siteVisitAt = iso) else c },
                            message = "📅 Visit moved to ${shortWhen(newVisitMillis)}",
                        )
                    }
                    launchActivityLog(contactId) {
                        add("site_visit" to "Visit rescheduled to ${shortWhen(newVisitMillis)}")
                    }
                    scheduleFollowUp(
                        contactId, ask.phone ?: return@onSuccess, ask.name,
                        // Ring the rep three hours before, not on the dot — a visit
                        // needs confirming in the morning, not announcing as it starts.
                        (newVisitMillis - 3 * 3600_000L).coerceAtLeast(System.currentTimeMillis() + 600_000L),
                        "Confirm the site visit", mirrorStatus = false,
                    )
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
        logPrompt(ask, answer = "postponed")
    }

    /**
     * The whole site-visit answer, in one call.
     *
     * Every branch of the approved flow lands here — came or didn't, booked or
     * lost — because the four things that must happen afterwards are the same
     * every time and must never depend on which button was pressed: the outcome
     * is recorded, the lead's stage moves, a next action is booked if the lead
     * is still alive, and the whole thing is written to the activity log.
     *
     * NO NEXT ACTION IS THE BUG THIS FIXES. The data showed 146 active leads
     * with nothing booked next — the single largest leak in the pipeline. So
     * "still thinking", "needs follow-up" and "moved the date" all create the
     * follow-up here, automatically. A rep who has just told the app the lead is
     * alive must never then have to remember to book the call themselves.
     *
     * The 0-100 slider is gone. It was one question too many for a flow that
     * has to finish in fifteen seconds, and the answer was always implied by
     * the outcome anyway — so it is inferred, and the column still fills.
     */
    fun assistantVisitOutcome(
        outcome: String,
        note: String? = null,
        tokenAmount: Double? = null,
        nextDueMillis: Long? = null,
    ) {
        val ask = _state.value.assistantAsk ?: return
        val contactId = ask.contactId ?: return
        val phone = ask.phone
        set { it.copy(assistantAsk = null) }

        // Where the lead sits afterwards. "Didn't work out" reasons all close it
        // — that is what the rep just said — while a visit that never happened
        // leaves the lead alive and owed another call.
        val nextStatus = when (outcome) {
            "booked" -> "booked"
            "thinking" -> "interested"
            "follow_up" -> "callback"
            "rescheduled" -> "site_visit"
            "no_show", "cancelled", "not_reachable" -> "callback"
            else -> "lost"           // price · location · family · finance · competitor · trust · other
        }
        // Inferred, not asked. A booking is certainty; a named objection is not.
        val probability = when (outcome) {
            "booked" -> 100
            "thinking" -> 50
            "follow_up" -> 40
            "rescheduled", "no_show", "cancelled", "not_reachable" -> 20
            else -> 0
        }
        val stillAlive = outcome in setOf("thinking", "follow_up", "rescheduled", "no_show", "cancelled", "not_reachable")

        viewModelScope.launch {
            runCatching {
                // The outcome row goes FIRST. Migration 0131 refuses to let a
                // visited lead be closed without one, so writing the status
                // before the reason would fail on exactly the branches that
                // matter most — the lost ones.
                Repository.recordSiteVisitOutcome(contactId, outcome, note)
                if (outcome == "rescheduled" && nextDueMillis != null) {
                    Repository.updateContact(
                        contactId,
                        mapOf("site_visit_at" to java.time.Instant.ofEpochMilli(nextDueMillis).toString()),
                    )
                } else if (outcome in setOf("no_show", "cancelled")) {
                    Repository.clearSiteVisit(contactId)
                }
                if (tokenAmount != null && tokenAmount > 0) Repository.setTokenAmount(contactId, tokenAmount)
                Repository.setCloseProbability(contactId, probability)
                Repository.setDisposition(contactId, nextStatus, null)
            }.onSuccess {
                val nowIso = java.time.Instant.now().toString()
                set { st ->
                    st.copy(
                        leads = st.leads.map { c ->
                            if (c.id != contactId) c
                            else c.copy(
                                status = nextStatus, closeProbability = probability,
                                closeProbabilityAt = nowIso, handledAt = nowIso,
                                tokenAmount = tokenAmount ?: c.tokenAmount,
                            )
                        },
                        message = visitOutcomeToast(outcome, tokenAmount),
                    )
                }
                launchActivityLog(contactId) {
                    add("site_visit" to "Visit outcome: ${visitOutcomeLabel(outcome)}${note?.let { " — $it" } ?: ""}")
                }
                loadLeads(force = true)
            }.onFailure { e -> set { it.copy(error = e.message) } }
        }

        // The next action, booked without being asked for. A lead the rep has
        // just called alive leaves this screen with a real date on it or the
        // whole flow has failed at its one job.
        if (stillAlive && phone != null) {
            val due = nextDueMillis ?: java.time.ZonedDateTime.now().plusDays(1)
                .withHour(11).withMinute(0).withSecond(0).toInstant().toEpochMilli()
            scheduleFollowUp(contactId, phone, ask.name, due, visitOutcomeLabel(outcome), mirrorStatus = false)
        }
        logPrompt(ask, answer = outcome, probability = probability, reason = note)
    }

    /**
     * "Not yet" — the rep genuinely does not know.
     *
     * A legitimate answer, and logged as one. The prompt engine's one-per-lead
     * -per-day rule means it comes back tomorrow on its own; after the second
     * ask the lead appears in v_pending_site_visit_outcomes with needs_manager
     * set, and it stops being the rep's problem. Nagging a third time is how
     * reps learn to dismiss prompts unread.
     */
    fun assistantVisitUnknown() {
        val ask = _state.value.assistantAsk ?: return
        set { it.copy(assistantAsk = null, message = "Theek hai — kal phir poochenge.") }
        logPrompt(ask, answer = "not_yet")
    }

    private fun visitOutcomeLabel(o: String): String = when (o) {
        "booked" -> "Booked"
        "thinking" -> "Still thinking"
        "follow_up" -> "Needs follow-up"
        "price" -> "Price"
        "location" -> "Location"
        "family" -> "Family discussion"
        "finance" -> "Finance / loan"
        "competitor" -> "Went to a competitor"
        "trust" -> "Trust"
        "no_show" -> "Did not come"
        "cancelled" -> "Cancelled"
        "rescheduled" -> "Moved to a new date"
        "not_reachable" -> "Could not reach them"
        else -> "Other"
    }

    private fun visitOutcomeToast(o: String, token: Double?): String = when {
        o == "booked" && token != null && token > 0 ->
            "🎉 Booking saved · ₹${token.toLong()}"
        o == "booked" -> "🎉 Booking saved — add the amount when you know it"
        o in setOf("thinking", "follow_up", "rescheduled") -> "Saved · next call booked"
        else -> "Saved — thanks for writing it down"
    }

    /** "Yes, I called" → straight into the one Update sheet the whole app uses. */
    fun assistantCallbackCalled() {
        val ask = _state.value.assistantAsk ?: return
        set { it.copy(assistantAsk = null) }
        logPrompt(ask, answer = "called")
        openFollowUpUpdate(ask.contactId, ask.phone ?: return, ask.name, ask.followUpId)
    }

    /**
     * "Not yet" — and the reason is the whole point of asking.
     *
     * Every answer books a real time, so the callback moves instead of just
     * going redder. And the reason is kept: one rep saying "busy" on every
     * single callback and another saying "not reachable" are two completely
     * different coaching conversations, and neither is visible from a list of
     * overdue rows.
     */
    fun assistantCallbackNotYet(reason: String) {
        val ask = _state.value.assistantAsk ?: return
        set { it.copy(assistantAsk = null) }
        val phone = ask.phone ?: return
        val now = java.time.ZonedDateTime.now()
        val due = when (reason) {
            "busy" -> now.plusMinutes(30)
            "evening" -> if (now.hour < 18) now.withHour(18).withMinute(0) else now.plusDays(1).withHour(18).withMinute(0)
            "not_reachable" -> now.plusHours(2)
            else -> now.plusDays(1).withHour(11).withMinute(0)   // wrong_time
        }.withSecond(0).withNano(0).toInstant().toEpochMilli()
        ask.followUpId?.let { completeFollowUp(it) }
        scheduleFollowUp(ask.contactId, phone, ask.name, due, reasonLabel(reason), mirrorStatus = false)
        ask.contactId?.let { id ->
            launchActivityLog(id) { add("follow_up" to "Callback pushed to ${shortWhen(due)} — ${reasonLabel(reason)}") }
        }
        logPrompt(ask, answer = "not_yet", reason = reason)
    }

    /** The day review's one question, and the tally that came with it. */
    fun assistantDayReviewAnswer(reason: String) {
        val ask = _state.value.assistantAsk ?: return
        set { it.copy(assistantAsk = null, message = "Thanks — see you tomorrow 👋") }
        logPrompt(ask, answer = "reviewed", reason = reason)
    }

    /** From the day review: open the first call of the day nobody wrote up. */
    fun assistantFixFirstUnupdated() {
        val ask = _state.value.assistantAsk
        val startOfDay = java.time.LocalDate.now().atStartOfDay(java.time.ZoneId.systemDefault())
            .toInstant().toEpochMilli()
        val lead = _state.value.leads.firstOrNull { c ->
            val called = parseInstantOrNull(c.lastContactedAt) ?: return@firstOrNull false
            c.id != null && called >= startOfDay && (parseInstantOrNull(c.handledAt) ?: 0L) < called
        }
        set { it.copy(assistantAsk = null) }
        if (ask != null) logPrompt(ask, answer = "reviewed", reason = "fixing_updates")
        if (lead?.id == null) {
            set { it.copy(message = "Nothing left to update — well done 👏") }
            return
        }
        val fu = _state.value.followUpList.firstOrNull { it.contactId == lead.id }
        openFollowUpUpdate(lead.id, lead.phone, lead.name, fu?.id)
    }

    /** Best-effort record of the question and its answer. Never blocks the rep. */
    private fun logPrompt(
        ask: AssistantAsk,
        answer: String?,
        reason: String? = null,
        probability: Int? = null,
        dismissed: Boolean = false,
    ) {
        val seconds = ((System.currentTimeMillis() - ask.shownAt) / 1000L).toInt().coerceIn(0, 24 * 3600)
        viewModelScope.launch {
            runCatching {
                Repository.logRepPrompt(
                    contactId = ask.contactId, kind = ask.kind, answer = answer,
                    reason = reason, probability = probability,
                    secondsToAnswer = seconds, dismissed = dismissed,
                )
            }
        }
    }

    /** Plain-English label for a reason chip, used in notes and the timeline. */
    private fun reasonLabel(reason: String): String = when (reason) {
        "busy" -> "Rep was busy"
        "evening" -> "Will call in the evening"
        "not_reachable" -> "Number not reachable"
        "wrong_time" -> "Wrong time to call them"
        "postponed" -> "Customer postponed the visit"
        "lost_interest" -> "Customer lost interest"
        "competitor" -> "Went with someone else"
        else -> reason.replace('_', ' ')
    }

    /** "45 minutes ago", "3 hours ago", "2 days ago" — never a raw timestamp. */
    private fun agoLabel(deltaMs: Long): String {
        val mins = deltaMs / 60_000L
        return when {
            mins < 90 -> "$mins minutes ago"
            mins < 48 * 60 -> "${mins / 60} hours ago"
            else -> "${mins / (60 * 24)} days ago"
        }
    }

    /** Millis from an ISO timestamp, tolerating both "Z" and "+00:00". */
    private fun parseInstantOrNull(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
            .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
            .getOrNull()
    }

    /** Count of follow-ups due now or overdue — the red badge on Home. */
    fun dueNowCount(): Int {
        val now = System.currentTimeMillis()
        return _state.value.followUpList.count { parseInstant(it.dueAt) <= now }
    }

    // ---------- attendance ----------

    fun loadAttendance(force: Boolean = false) {
        if (!shouldLoad("attendance", force)) return
        viewModelScope.launch {
            runCatching { Repository.todayAttendance() }
                .onSuccess { a -> set { it.copy(attendance = a) } }
        }
        viewModelScope.launch {
            runCatching { Repository.recentAttendance() }
                .onSuccess { list -> set { it.copy(attendanceHistory = list) } }
        }
    }

    /** Punch in, optionally with a selfie (base64 data-URL) + GPS proof. */
    fun punchIn(selfie: String? = null, lat: Double? = null, lng: Double? = null, locationLabel: String? = null) {
        viewModelScope.launch {
            set { it.copy(attendanceBusy = true) }
            runCatching { Repository.punchIn(selfie, lat, lng, locationLabel) }
                .onSuccess { a ->
                    set { it.copy(attendance = a, attendanceBusy = false, message = "✓ Punched in. Have a great shift!") }
                    loadAttendance()
                }
                .onFailure { e -> set { it.copy(attendanceBusy = false, error = e.message) } }
        }
    }

    /** Loads every follow-up (pending + completed) for the calendar view. */
    fun loadCalendar(force: Boolean = false) {
        if (!shouldLoad("calendar", force)) return
        viewModelScope.launch {
            set { it.copy(calendarLoading = true) }
            runCatching { Repository.fetchFollowUps(includeDone = true) }
                .onSuccess { list -> set { it.copy(calendar = list, calendarLoading = false) } }
                .onFailure { e -> set { it.copy(calendarLoading = false, error = e.message) } }
        }
    }

    fun punchOut() {
        viewModelScope.launch {
            set { it.copy(attendanceBusy = true) }
            runCatching { Repository.punchOut() }
                .onSuccess { a -> set { it.copy(attendance = a, attendanceBusy = false, message = "✓ Punched out. See you tomorrow!") } }
                .onFailure { e -> set { it.copy(attendanceBusy = false, error = e.message) } }
        }
    }

    // ---------- leaderboard ----------

    fun setLeaderboardPeriod(period: String) {
        if (period == _state.value.leaderboardPeriod) return
        set { it.copy(leaderboardPeriod = period) }
        loadLeaderboard(period)
    }

    fun loadLeaderboard(period: String, force: Boolean = false) {
        if (!shouldLoad("leaderboard:$period", force)) return
        viewModelScope.launch {
            set { it.copy(leaderboardLoading = true) }
            runCatching { Repository.fetchLeaderboard(period) }
                .onSuccess { rows ->
                    // Rank by a simple sales score: leads weigh most, then connects, then calls.
                    val sorted = rows.sortedWith(
                        compareByDescending<LeaderboardRow> { it.leads * 100 + it.connected * 5 + it.calls },
                    )
                    set { it.copy(leaderboard = sorted, leaderboardLoading = false) }
                }
                .onFailure { e -> set { it.copy(leaderboardLoading = false, error = e.message) } }
        }
    }

    fun clearMessage() = set { it.copy(message = null, error = null) }

    // ---------- recording playback ----------

    /**
     * Opens the inline [AudioPlayer] (streaming ExoPlayer with a seek bar) for a
     * call. Playback itself is owned by that composable — we only flag which row
     * is expanded. (Previously this also span up a second hidden MediaPlayer,
     * which fought the ExoPlayer and produced double audio with a frozen slider.)
     */
    fun playRecording(callId: String) {
        set { it.copy(playingCallId = callId) }
    }

    fun stopRecording() {
        if (_state.value.playingCallId != null) set { it.copy(playingCallId = null) }
    }

    // ---------- lead detail page ----------

    /** RAG v4: fetch the proactive "before you call" brief for the open lead. */
    fun loadLeadBrief(contactId: String) {
        if (_state.value.leadBriefLoading) return
        set { it.copy(leadBriefLoading = true, coachError = null) }
        viewModelScope.launch {
            val brief = runCatching { Repository.leadBrief(contactId) }.getOrNull()
            set {
                if (it.leadDetailId == contactId) it.copy(
                    leadBrief = brief, leadBriefLoading = false,
                    coachError = if (brief == null) "Couldn't build the pitch. Please try again." else null,
                )
                else it.copy(leadBriefLoading = false)
            }
        }
    }

    /**
     * RAG v9: the objection just raised on the call → the exact rebuttal to say,
     * grounded in the company's own playbook. One-shot, tied to the open lead.
     */
    fun getRebuttal(contact: Contact, objection: String) {
        val q = objection.trim()
        if (q.isBlank() || _state.value.rebuttalLoading) return
        set { it.copy(rebuttalLoading = true, rebuttal = null, coachError = null) }
        viewModelScope.launch {
            val reply = runCatching { Repository.objectionRebuttal(contact, q, _state.value.profile?.speaksAs) }.getOrNull()
            set {
                // A failure NEVER lands in the result field — the rep must not be
                // able to copy an error message as "the line to say".
                if (it.leadDetailId == contact.id) it.copy(
                    rebuttal = reply, rebuttalLoading = false,
                    coachError = if (reply == null) "Couldn't get a reply. Please try again." else null,
                )
                else it.copy(rebuttalLoading = false)
            }
        }
    }

    fun clearRebuttal() = set { it.copy(rebuttal = null, coachError = null) }

    /**
     * RAG v12 — the "after the call" move. Drafts a ready-to-send WhatsApp
     * follow-up for the open lead, grounded in the company's playbook. One-shot,
     * tied to the lead so a stale reply never lands on the wrong lead.
     */
    fun draftMessage(contact: Contact, purpose: String = "follow_up") {
        if (_state.value.messageDraftLoading) return
        set { it.copy(messageDraftLoading = true, messageDraft = null, coachError = null) }
        viewModelScope.launch {
            val reply = runCatching { Repository.draftFollowUp(contact, purpose, _state.value.profile?.speaksAs) }.getOrNull()
            set {
                // A failure NEVER becomes the draft — otherwise the error text
                // shows under "READY TO SEND" and could be WhatsApp'd verbatim.
                if (it.leadDetailId == contact.id) it.copy(
                    messageDraft = reply, messageDraftLoading = false,
                    coachError = if (reply == null) "Couldn't draft the message. Please try again." else null,
                )
                else it.copy(messageDraftLoading = false)
            }
        }
    }

    fun clearMessageDraft() = set { it.copy(messageDraft = null, coachError = null) }

    /**
     * RAG v13 — "Second Chance". One tap: the AI mines the rep's dead leads
     * (lost / not interested / gone-cold — never DNC) for ones a fresh company
     * offer could revive. Session-cached; pull-to-refresh via force.
     */
    fun loadSecondChance(force: Boolean = false) {
        if (_state.value.reviveLoading) return
        if (!force && _state.value.reviveLoaded) return
        set { it.copy(reviveLoading = true) }
        viewModelScope.launch {
            val picks = runCatching { Repository.fetchSecondChance() }.getOrDefault(emptyList())
            set { it.copy(revivePicks = picks, reviveLoading = false, reviveLoaded = true) }
        }
    }

    /** Opens the full-screen lead detail overlay and loads that lead's call history. */
    fun openLeadDetail(contactId: String) {
        set { it.copy(leadDetailId = contactId, showSettings = false, leadDetailCalls = emptyList(), leadDetailActivities = emptyList(), voiceNotes = emptyList(), leadDetailLoading = true, leadCoach = null, leadCoachLoading = true, leadBrief = null, leadBriefLoading = false, rebuttal = null, rebuttalLoading = false, messageDraft = null, messageDraftLoading = false, coachError = null) }
        viewModelScope.launch {
            val calls = runCatching { Repository.fetchCallsForContact(contactId) }.getOrDefault(emptyList())
            val acts = runCatching { Repository.fetchLeadActivities(contactId) }.getOrDefault(emptyList())
            val notes = runCatching { Repository.fetchVoiceNotes(contactId) }.getOrDefault(emptyList())
            set {
                if (it.leadDetailId == contactId)
                    it.copy(leadDetailCalls = calls, leadDetailActivities = acts, voiceNotes = notes, leadDetailLoading = false)
                else it
            }
            // Wada auto-apply: normally the server applies it the moment the
            // summary lands; this catches any leftover pending one (e.g. the
            // server couldn't match a contact at the time). Zero taps.
            calls.firstOrNull { it.wadaState == "pending" && it.aiActions != null }?.let { applyWada(it) }
        }
        // Per-lead call coach (rating + guidance from this lead's last recording).
        // Separate coroutine — it may generate on first view, so it shouldn't
        // hold up the rest of the lead page.
        viewModelScope.launch {
            val coach = runCatching { Repository.leadCallCoach(contactId) }.getOrNull()
            set {
                if (it.leadDetailId == contactId) it.copy(leadCoach = coach, leadCoachLoading = false)
                else it
            }
        }
    }

    fun refreshLeadDetail() { _state.value.leadDetailId?.let { openLeadDetail(it) } }

    // ---------- wada (AI-heard commitments, one-tap confirm) ----------

    /**
     * One tap = every promise kept: schedules the promised callback (with the
     * on-device alarm), writes the heard facts onto the lead, and marks the
     * call's wada applied.
     */
    fun applyWada(call: com.salesautocall.app.data.CallLog) {
        val wada = call.aiActions ?: return
        val callId = call.id ?: return
        viewModelScope.launch {
            val contact = _state.value.leads.find { it.id == call.contactId }
            // 1. The promise → a real follow-up + alarm.
            val dueMs = wada.promiseAt?.let { iso ->
                runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
                    .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
                    .getOrNull()
            }
            if (dueMs != null && dueMs > System.currentTimeMillis()) {
                scheduleFollowUp(
                    contactId = call.contactId,
                    phone = contact?.phone ?: call.phone,
                    name = contact?.name,
                    dueAtMillis = dueMs,
                    note = wada.promiseNote ?: "Wada — call pe promise kiya tha",
                )
            }
            // 2. The facts → the lead card (never overwriting human input).
            if (contact != null) runCatching { Repository.applyWadaFacts(contact, wada) }
            // 3. Mark done + reflect locally.
            runCatching { Repository.setWadaState(callId, "applied") }
            set { st ->
                st.copy(leadDetailCalls = st.leadDetailCalls.map {
                    if (it.id == callId) it.copy(wadaState = "applied") else it
                })
            }
            // scheduleFollowUp announces the ⏰ itself; only speak when there was no promise.
            if (dueMs == null) set { it.copy(message = "🤝 Wada saved — lead update ho gayi") }
            if (call.contactId != null) loadLeads(force = true)
        }
    }

    /** The AI misheard — drop this call's wada quietly. */
    fun dismissWada(call: com.salesautocall.app.data.CallLog) {
        val callId = call.id ?: return
        viewModelScope.launch {
            runCatching { Repository.setWadaState(callId, "dismissed") }
            set { st ->
                st.copy(leadDetailCalls = st.leadDetailCalls.map {
                    if (it.id == callId) it.copy(wadaState = "dismissed") else it
                })
            }
        }
    }

    fun closeLeadDetail() {
        stopVoiceNotePlayback()
        if (_state.value.voiceRecording) com.salesautocall.app.data.VoiceNoteRecorder.cancel()
        set {
            it.copy(
                leadDetailId = null, leadDetailCalls = emptyList(), leadDetailActivities = emptyList(),
                voiceNotes = emptyList(), voiceRecording = false, playingCallId = null,
            )
        }
    }

    // ---------- voice notes (rep's own voice, with the AI twist) ----------

    private var notePlayer: android.media.MediaPlayer? = null

    fun startVoiceNote() {
        if (_state.value.voiceRecording) return
        stopVoiceNotePlayback()
        val ok = com.salesautocall.app.data.VoiceNoteRecorder.start(getApplication())
        if (ok) set { it.copy(voiceRecording = true) }
        else set { it.copy(error = "Mic not available — allow the Microphone permission.") }
    }

    fun cancelVoiceNote() {
        com.salesautocall.app.data.VoiceNoteRecorder.cancel()
        set { it.copy(voiceRecording = false) }
    }

    /**
     * Post-call prompt version: records the outcome as a SPOKEN note against the
     * lead whose call just ended, then closes the sheet. Talking is the fastest
     * of the three ways to answer the prompt, and it counts the same — the voice
     * note stamps handled_at server-side, which is what moves the lead into
     * Today. Without it the lead simply stays in New.
     */
    fun finishPostCallVoiceNote() {
        val contactId = _state.value.postCallContactId ?: run { cancelVoiceNote(); return }
        // A rejected take must leave the sheet open — the rep still has to
        // answer the prompt, and closing it would look like the note was saved.
        if (!finishVoiceNote(contactId)) return
        dismissPostCall()
        // handled_at is stamped when the note row lands, so give the upload a
        // moment before re-reading — otherwise the list refreshes just too early
        // and the lead looks like it stayed in New.
        viewModelScope.launch {
            kotlinx.coroutines.delay(4_000)
            loadLeads(force = true)
        }
    }

    /**
     * Stops the take and ships it: upload → row → AI → refresh the list.
     * Returns false when nothing was saved, so callers can keep their UI open.
     *
     * The guard below is the backstop for the mis-tap the reps kept hitting: the
     * Save button used to land exactly where the record button had been, so a
     * second tap — the natural "did that register?" tap — ended the take after a
     * second and a half. The buttons no longer overlap and Save stays locked for
     * the first three seconds, but a take that somehow still comes in under the
     * minimum is thrown away here rather than saved as a note nobody can use.
     */
    fun finishVoiceNote(targetContactId: String? = null): Boolean {
        val contactId = targetContactId ?: _state.value.leadDetailId ?: run { cancelVoiceNote(); return false }
        if (com.salesautocall.app.data.VoiceNoteRecorder.elapsedMs < com.salesautocall.app.data.VoiceNoteRecorder.MIN_MS) {
            com.salesautocall.app.data.VoiceNoteRecorder.cancel()
            set { it.copy(voiceRecording = false, message = "Too short to save — tap record and speak for a few seconds.") }
            return false
        }
        val take = com.salesautocall.app.data.VoiceNoteRecorder.stop()
        set { it.copy(voiceRecording = false) }
        if (take == null) {
            set { it.copy(error = "Nothing recorded — try again.") }
            return false
        }
        val (file, seconds) = take
        viewModelScope.launch {
            set { it.copy(voiceUploading = true) }
            val note = runCatching {
                withContext(Dispatchers.IO) { Repository.addVoiceNote(contactId, file.readBytes(), seconds) }
            }.getOrNull()
            runCatching { file.delete() }
            if (note != null) {
                set { st ->
                    st.copy(
                        voiceUploading = false,
                        // Only prepend when THIS lead's detail page is open — a note
                        // recorded from the post-call sheet must not surface under
                        // whatever lead happens to be open.
                        voiceNotes = if (st.leadDetailId == contactId) listOf(note) + st.voiceNotes else st.voiceNotes,
                        message = "🎤 Voice note saved — AI summary ban raha hai…",
                    )
                }
                // Poll every 5s (up to ~60s) until the AI finishes, then refresh
                // everything — it may have set a site visit / callback / budget.
                var kicked = false
                repeat(12) { attempt ->
                    kotlinx.coroutines.delay(5_000)
                    if (_state.value.leadDetailId != contactId) return@launch
                    val fresh = runCatching { Repository.fetchVoiceNotes(contactId) }.getOrNull() ?: return@repeat
                    set { if (it.leadDetailId == contactId) it.copy(voiceNotes = fresh) else it }
                    val mine = fresh.firstOrNull { it.id == note.id } ?: return@repeat
                    when (mine.aiStatus) {
                        "ready" -> {
                            refreshLeadDetail()
                            loadLeads(force = true)
                            loadFollowUps(force = true)
                            return@launch
                        }
                        // "failed" deliberately falls through and keeps polling:
                        // the server re-dispatches a failed note within a minute
                        // and it almost always reads fine the second time, so
                        // showing the rep a dead end would be a lie.
                        //
                        // Still "pending" after 15s = the server trigger hiccuped; kick once.
                        "pending" -> if (!kicked && attempt >= 2) {
                            kicked = true
                            val id = note.id
                            if (id != null) viewModelScope.launch(Dispatchers.IO) {
                                runCatching { Repository.requestVoiceNoteAi(id) }
                            }
                        }
                    }
                }
            } else {
                set { it.copy(voiceUploading = false, error = "Couldn't save the voice note. Check internet and retry.") }
            }
        }
        return true
    }

    /** Re-pulls notes (e.g. the "AI processing" one) for the open lead, and
     *  re-kicks the AI for any note that never left "pending". */
    fun refreshVoiceNotes() {
        val contactId = _state.value.leadDetailId ?: return
        viewModelScope.launch {
            runCatching { Repository.fetchVoiceNotes(contactId) }.getOrNull()?.let { fresh ->
                set { if (it.leadDetailId == contactId) it.copy(voiceNotes = fresh) else it }
                fresh.filter { it.aiStatus == "pending" }.forEach { n ->
                    val id = n.id ?: return@forEach
                    viewModelScope.launch(Dispatchers.IO) { runCatching { Repository.requestVoiceNoteAi(id) } }
                }
            }
        }
    }

    fun playVoiceNote(note: com.salesautocall.app.data.LeadVoiceNote) {
        val id = note.id ?: return
        stopVoiceNotePlayback()
        set { it.copy(playingNoteId = id) }
        viewModelScope.launch {
            val bytes = runCatching {
                withContext(Dispatchers.IO) { Repository.downloadVoiceNote(note.audioPath) }
            }.getOrNull()
            if (bytes == null || _state.value.playingNoteId != id) {
                if (bytes == null) set { it.copy(playingNoteId = null, error = "Couldn't load the audio.") }
                return@launch
            }
            runCatching {
                val f = java.io.File(getApplication<Application>().cacheDir, "vn_play.m4a")
                f.writeBytes(bytes)
                val p = android.media.MediaPlayer()
                p.setDataSource(f.absolutePath)
                p.prepare()
                p.setOnCompletionListener { stopVoiceNotePlayback() }
                p.start()
                notePlayer = p
            }.onFailure {
                set { st -> st.copy(playingNoteId = null, error = "Playback failed.") }
            }
        }
    }

    fun stopVoiceNotePlayback() {
        runCatching { notePlayer?.stop() }
        runCatching { notePlayer?.release() }
        notePlayer = null
        if (_state.value.playingNoteId != null) set { it.copy(playingNoteId = null) }
    }

    // ---------- lead activity logging ----------

    /** Fire-and-forget history entries; failures never disturb the main flow. */
    private fun launchActivityLog(contactId: String, build: MutableList<Pair<String, String>>.() -> Unit) {
        val entries = mutableListOf<Pair<String, String>>().apply(build)
        if (entries.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            entries.forEach { (type, detail) ->
                runCatching { Repository.logLeadActivity(contactId, type, detail) }
            }
        }
    }

    /** Human label for a pipeline status key ("token_paid" → "Token Paid"). */
    private fun stageDisplay(status: String): String = when (status) {
        "new", "queued" -> "New enquiry"
        "called", "no_answer", "busy" -> "Contacted"
        "wrong_person" -> "Wrong person"
        "callback" -> "Callback"
        "follow_up" -> "Follow-up"
        "interested" -> "Interested"
        "site_visit" -> "Site Visit"
        "negotiation", "proposal" -> "Negotiation"
        "token_paid" -> "Token Paid"
        "booked" -> "Booked / Won"
        "not_interested" -> "Not interested"
        "lost" -> "Lost"
        "dnc" -> "Do Not Call"
        else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }

    /**
     * OffsetDateTime FIRST, because that is the shape the API actually sends.
     *
     * Instant.parse wants a "Z"; Postgres sends "+00:00". This drove
     * dueNowCount(), so on the real format every follow-up fell to the
     * Long.MAX_VALUE default and none of them ever counted as due — the "Due
     * now" tile could sit on 0 with overdue callbacks right underneath it. The
     * fallback keeps "Z" timestamps working.
     */
    private fun parseInstant(iso: String): Long =
        runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
            .recoverCatching { java.time.Instant.parse(iso).toEpochMilli() }
            .getOrDefault(Long.MAX_VALUE)

    private fun shortWhen(millis: Long): String =
        java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(millis), java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM, h:mm a"))

    private fun prettyDateTime(iso: String): String = runCatching {
        java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern("d MMM, h:mm a"))
    }.recoverCatching {
        java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern("d MMM, h:mm a"))
    }.getOrDefault(iso.take(16).replace('T', ' '))

    private fun displayName(uri: Uri): String {
        var name = "import.csv"
        getApplication<Application>().contentResolver
            .query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) name = c.getString(idx)
            }
        return name
    }
}
