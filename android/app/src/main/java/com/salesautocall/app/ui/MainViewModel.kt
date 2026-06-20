package com.salesautocall.app.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.Attendance
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.ChatMsg
import com.salesautocall.app.data.CampaignStat
import com.salesautocall.app.data.Company
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.ContactImport
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.data.LeaderboardRow
import com.salesautocall.app.data.ParseResult
import com.salesautocall.app.data.Profile
import com.salesautocall.app.data.Repository
import com.salesautocall.app.data.WhatsAppMessage
import com.salesautocall.app.notify.FollowUpReminder
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
    // active in-app softphone call
    val cloudCallNumber: String? = null,
    val cloudCallContactId: String? = null,
    val cloudCallCampaignId: String? = null,
    val cloudCallStatus: String = "",
    val cloudBridged: Boolean = false,
    val cloudCallExt: String = "",
    val cloudCallPass: String = "",
    val cloudCallLogId: String? = null,
    val todayCalls: Int = 0,
    val todayConnected: Int = 0,
    val todayTalk: Int = 0,
    val followUpInfo: String? = null,
    val followUpDone: Boolean = false,
    val pendingParse: ParseResult? = null,
    val pendingFileName: String? = null,
    val selectedCampaignId: String? = null,
    val selectedCampaignName: String = "",
    val campaignContacts: List<Contact> = emptyList(),
    // telecaller "Calls" tab: history, follow-ups and the summary card
    val callFilter: CallFilter = CallFilter.TODAY,
    val callList: List<CallLog> = emptyList(),
    val callsLoading: Boolean = false,
    val callSummary: CallSummary = CallSummary(),
    /** id of the call whose recording is currently playing/loading (null = none). */
    val playingCallId: String? = null,
    /** id of the call whose AI summary is currently being generated (null = none). */
    val summarizingCallId: String? = null,
    // notes typed during an active cloud call
    val inCallNote: String = "",
    // lead pipeline (all my contacts across campaigns)
    val leads: List<Contact> = emptyList(),
    val leadsLoading: Boolean = false,
    /** True while the AI lead-scoring call is running. */
    val aiScoringLeads: Boolean = false,
    val leadFilter: String = "open",
    /** Set when another screen (e.g. Campaign tab) asks Leads to open in select mode. */
    val leadsSelectRequested: Boolean = false,
    // in-app WhatsApp chat (tracked via the company number)
    val waChatContact: Contact? = null,
    val waThread: List<WhatsAppMessage> = emptyList(),
    val waLoading: Boolean = false,
    val waSending: Boolean = false,
    val waError: String? = null,
    // AI assistant chat
    val assistantMessages: List<ChatMsg> = emptyList(),
    val assistantThinking: Boolean = false,
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
)

enum class CallFilter(val label: String) { TODAY("Today"), WEEK("This week"), ALL("All time") }

/** Lead-pipeline filters shown on the Leads tab. */
enum class LeadFilter(val key: String, val label: String, val statuses: Set<String>) {
    OPEN("open", "Open", setOf("new", "queued", "callback", "follow_up", "no_answer", "busy")),
    HOT("hot", "Hot", emptySet()),           // filtered by temperature, not status
    INTERESTED("interested", "Interested", setOf("interested")),
    BOOKED("booked", "Booked", setOf("booked")),
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
        ),
    )
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        com.salesautocall.app.sip.SipManager.appContext = app
        // Persistent inbound listener so incoming/missed cloud calls get logged
        // (the outgoing onState callback only exists during an active dial).
        com.salesautocall.app.sip.SipManager.onIncoming = { event, number -> onIncomingCall(event, number) }
        refreshSession()
    }

    private val lenientJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
    private var cloudConnectedAt: Long = 0L
    /** Guards the outgoing call's outcome write so it happens exactly once. */
    private var cloudResultLogged: Boolean = false
    // Inbound (incoming) call bookkeeping.
    private var incomingLogId: String? = null
    private var incomingConnectedAt: Long = 0L
    private var incomingRecordPath: String? = null

    private fun set(transform: (AppState) -> AppState) {
        _state.value = transform(_state.value)
    }

    // ---------- auth ----------

    fun refreshSession() {
        viewModelScope.launch {
            // Wait for the saved session to load before deciding — otherwise a cold
            // start can flash the login screen and "log out" an active telecaller.
            Repository.awaitSession()
            val uid = Repository.currentUserId()
            if (uid == null) {
                set { it.copy(signedIn = false, profile = null) }
                return@launch
            }
            runCatching { Repository.myProfile() }
                .onSuccess { p -> set { it.copy(signedIn = true, profile = p) } }
                .onFailure { set { it.copy(signedIn = true) } }
            runCatching { Repository.myCompany() }
                .onSuccess { c -> set { it.copy(company = c) } }
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
            runCatching { Repository.signOut() }
            set { AppState(breakSeconds = it.breakSeconds) }
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
        AppPrefs.setIncomingEnabled(getApplication(), v)
        set { it.copy(cloudIncomingEnabled = v) }
        if (v) {
            com.salesautocall.app.sip.SipBackgroundService.start(getApplication())
        } else {
            com.salesautocall.app.sip.SipBackgroundService.stop(getApplication())
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

    private fun agentId(): String = _state.value.profile?.sipAgentId?.ifBlank { null } ?: _state.value.cloudAgentId
    private fun callerId(): String = _state.value.profile?.callerId?.ifBlank { null } ?: _state.value.cloudCallerId

    /** Opens the in-app native softphone for a cloud call. Auto-fetches SIP config
     *  from uroperator; falls back to the manual Settings values if that fails. */
    fun cloudCall(phone: String, contactId: String?, campaignId: String?) {
        // Strip spaces/dashes so the SIP/URI and the API get clean digits.
        val clean = phone.filter { it.isDigit() || it == '+' }
        cloudResultLogged = false
        set {
            it.copy(
                error = null, message = null,
                cloudCallNumber = clean,
                cloudCallContactId = contactId,
                cloudCallCampaignId = campaignId,
                cloudCallStatus = "Fetching SIP config…",
                cloudBridged = false,
                cloudCallExt = "", cloudCallPass = "",
            )
        }
        // Route SIP engine state changes back into our status mapping.
        com.salesautocall.app.sip.SipManager.onState = { raw -> onSipState(raw) }

        viewModelScope.launch {
            val cfg = runCatching {
                val body = Repository.getWebrtcConfig()
                lenientJson.decodeFromString(com.salesautocall.app.data.WebrtcConfig.serializer(), body)
            }.getOrNull()

            // Manually-entered credentials WIN over the auto-fetched ones: a private
            // PBX (e.g. 10.10.10.3) can have a different password for the same
            // extension than uroperator's public API returns. Auto-fetch is only a
            // fallback for when the user hasn't filled Settings.
            val ext = _state.value.cloudAgentId.ifBlank { null }
                ?: _state.value.profile?.sipAgentId?.ifBlank { null }
                ?: cfg?.ext?.ifBlank { null } ?: ""
            val pass = _state.value.cloudSipPassword.ifBlank { null }
                ?: cfg?.password?.ifBlank { null } ?: ""
            // Server/port: manual override (e.g. private IP) > uroperator-provided > public default.
            val server = _state.value.cloudSipServer.ifBlank { null }
                ?: cfg?.sipServer?.ifBlank { null } ?: "sip.uroperator.com"
            val port = _state.value.cloudSipPort.toIntOrNull()
                ?: cfg?.sipPort?.takeIf { it > 0 } ?: 6060
            val transport = cfg?.transport?.ifBlank { null } ?: "udp"

            if (ext.isBlank() || pass.isBlank()) {
                set { it.copy(cloudCallStatus = "Couldn't get SIP login from uroperator. Set your agent ID + SIP password in Settings, or ask your admin.") }
                return@launch
            }
            set { it.copy(cloudCallExt = ext, cloudCallPass = pass, cloudCallStatus = "Connecting to phone system…") }
            runCatching {
                com.salesautocall.app.sip.SipManager.register(
                    getApplication(), ext, pass, server, port, transport,
                )
            }.onFailure { e ->
                set { it.copy(cloudCallStatus = "Couldn't start SIP: ${e.message}") }
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

        if (raw == "connected") cloudConnectedAt = System.currentTimeMillis()
        if (raw == "ended" || raw.startsWith("callfailed")) {
            finalizeCloudResult(failed = raw.startsWith("callfailed"))
            uploadCloudRecording()
        }

        // Once registered: log the call (to get its id, and set the recording file
        // before the leg is answered), then ask uroperator to place the call
        // (click-to-call): their server rings our extension (the app auto-answers)
        // and bridges the customer through the proper trunk.
        if (raw == "registered" && !s.cloudBridged) {
            set { it.copy(cloudBridged = true, cloudCallStatus = "Ringing you, then the customer…") }
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
                                recordingStatus = if (recordingEnabled()) "recording" else "none",
                                recordingSource = "sip",
                            ),
                        )
                    }.getOrNull()
                } else null
                set { it.copy(cloudCallLogId = logId) }
                // Arm recording (captures both legs once the call is answered).
                if (logId != null && recordingEnabled()) {
                    val f = java.io.File(getApplication<Application>().cacheDir, "rec_$logId.wav")
                    com.salesautocall.app.sip.SipManager.setRecordFile(f.absolutePath)
                } else {
                    com.salesautocall.app.sip.SipManager.setRecordFile(null)
                }

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
                if (f.exists() && f.length() > 0) {
                    Repository.uploadRecording(id, "sip", dur, f.readBytes())
                    f.delete()
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

    /**
     * Inbound cloud-call lifecycle from the SIP engine. Logs every incoming leg —
     * including unanswered ones as "no_answer" — so the telecaller can see missed
     * calls in the Calls tab, and records answered calls like outgoing ones.
     */
    fun onIncomingCall(event: String, number: String?) {
        when (event) {
            "ringing" -> {
                val p = _state.value.profile
                val cid = p?.companyId ?: return
                incomingConnectedAt = 0L
                incomingRecordPath = null
                incomingLogId = null
                val rec = recordingEnabled()
                viewModelScope.launch {
                    val logId = runCatching {
                        Repository.logCall(
                            CallLog(
                                companyId = cid, salespersonId = p.id,
                                phone = number ?: "Unknown", direction = "incoming", notes = "cloud",
                                recordingStatus = if (rec) "recording" else "none",
                                recordingSource = "sip",
                            ),
                        )
                    }.getOrNull()
                    incomingLogId = logId
                    if (logId != null && rec) {
                        val f = java.io.File(getApplication<Application>().cacheDir, "rec_in_$logId.wav")
                        incomingRecordPath = f.absolutePath
                        com.salesautocall.app.sip.SipManager.setRecordFile(f.absolutePath)
                    }
                }
            }
            "connected" -> incomingConnectedAt = System.currentTimeMillis()
            "ended" -> finalizeIncoming()
        }
    }

    private fun finalizeIncoming() {
        val id = incomingLogId ?: return
        incomingLogId = null
        val connected = incomingConnectedAt > 0
        val dur = if (connected) ((System.currentTimeMillis() - incomingConnectedAt) / 1000).toInt() else 0
        val outcome = if (connected) "connected" else "no_answer" // never answered = missed
        val path = incomingRecordPath
        incomingRecordPath = null
        incomingConnectedAt = 0L
        com.salesautocall.app.sip.SipManager.setRecordFile(null)
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { Repository.updateCallResult(id, outcome, dur) }
            if (path != null && connected) {
                runCatching {
                    val f = java.io.File(path)
                    if (f.exists() && f.length() > 0) {
                        Repository.uploadRecording(id, "sip", dur, f.readBytes())
                        f.delete()
                    }
                }
            }
        }
    }

    private fun recordingEnabled(): Boolean = _state.value.company?.recordingEnabled ?: true

    fun endCloudCall() {
        if (_state.value.inCallNote.isNotBlank()) saveInCallNote()
        finalizeCloudResult(failed = false)
        uploadCloudRecording()
        runCatching { com.salesautocall.app.sip.SipManager.stop() }
        com.salesautocall.app.sip.SipManager.onState = null
        cloudConnectedAt = 0L
        set {
            it.copy(
                cloudCallNumber = null, cloudCallStatus = "", cloudBridged = false,
                cloudCallLogId = null, inCallNote = "",
            )
        }
    }

    fun setMuted(muted: Boolean) = com.salesautocall.app.sip.SipManager.setMuted(muted)

    fun setSpeaker(on: Boolean) = com.salesautocall.app.sip.SipManager.setSpeaker(on)

    fun isRecording(): Boolean = com.salesautocall.app.sip.SipManager.isRecording()

    /** Manually pause/resume recording of the active cloud call. Returns the new state. */
    fun toggleRecording(): Boolean = com.salesautocall.app.sip.SipManager.toggleRecording()

    fun recordingAllowed(): Boolean = recordingEnabled()

    fun loadToday() {
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
        loadCalls()
    }

    fun loadCalls() {
        val filter = _state.value.callFilter
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
        }
    }

    /** Contacts worth chasing: not-connected calls, most-recent attempt per number. */
    fun followUps(): List<CallLog> =
        _state.value.callList
            .filter { it.outcome == "no_answer" || it.outcome == "failed" }
            .distinctBy { it.phone }

    /** Places a manually-keyed SIM call (recorded + logged) via the in-app keypad. */
    fun dialManual(phone: String) {
        val clean = phone.trim()
        if (clean.isEmpty()) return
        com.salesautocall.app.dialer.ManualCallService.dial(
            getApplication(), clean, _state.value.company?.id, null, recordingEnabled(),
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
        val callable = contacts.filter {
            it.status in setOf("new", "queued", "callback", "no_answer", "busy")
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

    fun loadCampaigns() {
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
    fun loadHome() {
        loadToday()
        loadAttendance()
        loadFollowUps()
        loadLeaderboard(_state.value.leaderboardPeriod)
    }

    // ---------- lead pipeline ----------

    fun setLeadFilter(f: LeadFilter) {
        if (f.key == _state.value.leadFilter) return
        set { it.copy(leadFilter = f.key) }
    }

    /** Ask the Leads tab to open directly in multi-select ("start campaign") mode. */
    fun requestLeadSelect() = set { it.copy(leadsSelectRequested = true) }
    fun consumeLeadSelect() = set { it.copy(leadsSelectRequested = false) }

    fun loadLeads() {
        viewModelScope.launch {
            set { it.copy(leadsLoading = true) }
            runCatching { Repository.fetchLeads() }
                .onSuccess { list -> set { it.copy(leads = list, leadsLoading = false) } }
                .onFailure { e -> set { it.copy(leadsLoading = false, error = e.message) } }
        }
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

    // ---------- AI assistant chat ----------

    /** Sends a question to the AI sales coach and appends its reply. */
    fun askAssistant(text: String) {
        val q = text.trim()
        if (q.isBlank() || _state.value.assistantThinking) return
        val msgs = _state.value.assistantMessages + ChatMsg("user", q)
        set { it.copy(assistantMessages = msgs, assistantThinking = true) }
        viewModelScope.launch {
            val reply = runCatching { Repository.assistantChat(msgs) }.getOrNull()
            set {
                it.copy(
                    assistantMessages = it.assistantMessages +
                        ChatMsg("assistant", reply ?: "Sorry, I couldn't answer right now. Please try again."),
                    assistantThinking = false,
                )
            }
        }
    }

    fun clearAssistant() = set { it.copy(assistantMessages = emptyList(), assistantThinking = false) }

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
    fun applyLead(contactId: String, status: String?, temperature: String?, budget: String?, note: String?, svProj: String? = null, svAt: String? = null) {
        viewModelScope.launch {
            val patch = buildMap<String, String> {
                if (status != null) put("status", status)
                if (temperature != null) put("temperature", temperature)
                if (budget != null) put("budget", budget)
                if (note != null) put("notes", note)
                if (svProj != null) put("site_visit_project", svProj)
                if (svAt != null) put("site_visit_at", svAt)
            }
            runCatching { Repository.updateContact(contactId, patch) }
                .onSuccess {
                    set { st ->
                        st.copy(leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(
                                status = status ?: c.status,
                                temperature = temperature ?: c.temperature,
                                budget = budget ?: c.budget,
                                notes = note ?: c.notes,
                                siteVisitProject = svProj ?: c.siteVisitProject,
                                siteVisitAt = svAt ?: c.siteVisitAt,
                            ) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun setLeadTemperature(contactId: String, temperature: String) {
        viewModelScope.launch {
            runCatching { Repository.setTemperature(contactId, temperature) }
                .onSuccess {
                    set { st ->
                        st.copy(leads = st.leads.map { c ->
                            if (c.id == contactId) c.copy(temperature = temperature) else c
                        })
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    // ---------- follow-up scheduler ----------

    fun loadFollowUps() {
        viewModelScope.launch {
            set { it.copy(followUpsLoading = true) }
            runCatching { Repository.fetchFollowUps() }
                .onSuccess { list -> set { it.copy(followUpList = list, followUpsLoading = false) } }
                .onFailure { e -> set { it.copy(followUpsLoading = false, error = e.message) } }
        }
    }

    /** Schedules a callback [dueAtMillis] from now and arms an on-device reminder. */
    fun scheduleFollowUp(contactId: String?, phone: String, name: String?, dueAtMillis: Long, note: String?) {
        viewModelScope.launch {
            val iso = java.time.Instant.ofEpochMilli(dueAtMillis).toString()
            runCatching { Repository.scheduleFollowUp(contactId, phone, name, iso, note) }
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
                        set { st ->
                            st.copy(leads = st.leads.map { c ->
                                if (c.id == contactId) c.copy(status = "follow_up") else c
                            })
                        }
                    }
                }
                .onFailure { e -> set { it.copy(error = e.message) } }
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

    /** Count of follow-ups due now or overdue — the red badge on Home. */
    fun dueNowCount(): Int {
        val now = System.currentTimeMillis()
        return _state.value.followUpList.count { parseInstant(it.dueAt) <= now }
    }

    // ---------- attendance ----------

    fun loadAttendance() {
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
    fun loadCalendar() {
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

    fun loadLeaderboard(period: String) {
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

    private fun parseInstant(iso: String): Long =
        runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrDefault(Long.MAX_VALUE)

    private fun shortWhen(millis: Long): String =
        java.time.ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(millis), java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM, h:mm a"))

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
