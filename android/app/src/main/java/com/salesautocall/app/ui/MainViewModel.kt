package com.salesautocall.app.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.Attendance
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.CampaignStat
import com.salesautocall.app.data.Company
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.ContactImport
import com.salesautocall.app.data.FollowUp
import com.salesautocall.app.data.LeaderboardRow
import com.salesautocall.app.data.ParseResult
import com.salesautocall.app.data.Profile
import com.salesautocall.app.data.Repository
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
    val leadFilter: String = "open",
    /** Set when another screen (e.g. Campaign tab) asks Leads to open in select mode. */
    val leadsSelectRequested: Boolean = false,
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
        refreshSession()
    }

    private val lenientJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
    private var cloudConnectedAt: Long = 0L

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
        if (raw == "ended" || raw.startsWith("callfailed")) uploadCloudRecording()

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

    private fun recordingEnabled(): Boolean = _state.value.company?.recordingEnabled ?: true

    fun endCloudCall() {
        if (_state.value.inCallNote.isNotBlank()) saveInCallNote()
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
    fun applyLead(contactId: String, status: String?, temperature: String?, budget: String?, note: String?) {
        viewModelScope.launch {
            val patch = buildMap<String, String> {
                if (status != null) put("status", status)
                if (temperature != null) put("temperature", temperature)
                if (budget != null) put("budget", budget)
                if (note != null) put("notes", note)
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
    private var player: android.media.MediaPlayer? = null

    /** Streams a call's recording from the cloud and plays it in-app. */
    fun playRecording(callId: String) {
        stopRecording()
        set { it.copy(playingCallId = callId, message = "Loading recording…") }
        viewModelScope.launch {
            val bytes = withContext(Dispatchers.IO) { runCatching { Repository.fetchRecording(callId) }.getOrNull() }
            if (bytes == null || bytes.isEmpty()) {
                set { it.copy(playingCallId = null, message = null, error = "Recording not available yet.") }
                return@launch
            }
            runCatching {
                val f = java.io.File(getApplication<Application>().cacheDir, "play_rec.audio")
                withContext(Dispatchers.IO) { f.writeBytes(bytes) }
                val mp = android.media.MediaPlayer().apply {
                    setDataSource(f.absolutePath)
                    setOnCompletionListener { stopRecording() }
                    prepare()
                    start()
                }
                player = mp
                set { it.copy(message = null) }
            }.onFailure { e ->
                set { it.copy(playingCallId = null, message = null, error = "Playback error: ${e.message}") }
            }
        }
    }

    fun stopRecording() {
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
        if (_state.value.playingCallId != null) set { it.copy(playingCallId = null) }
    }

    override fun onCleared() {
        runCatching { player?.release() }
        player = null
        super.onCleared()
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
