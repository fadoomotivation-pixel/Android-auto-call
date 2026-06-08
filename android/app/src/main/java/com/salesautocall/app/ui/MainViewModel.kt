package com.salesautocall.app.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.salesautocall.app.data.AppPrefs
import com.salesautocall.app.data.CampaignStat
import com.salesautocall.app.data.ContactImport
import com.salesautocall.app.data.ParseResult
import com.salesautocall.app.data.Profile
import com.salesautocall.app.data.Repository
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
    val campaigns: List<CampaignStat> = emptyList(),
    val campaignName: String = "",
    val breakSeconds: Int = 5,
    val pendingParse: ParseResult? = null,
    val pendingFileName: String? = null,
    val message: String? = null,
    val error: String? = null,
)

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(AppState(breakSeconds = AppPrefs.getBreakSeconds(app)))
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        refreshSession()
    }

    private fun set(transform: (AppState) -> AppState) {
        _state.value = transform(_state.value)
    }

    // ---------- auth ----------

    fun refreshSession() {
        viewModelScope.launch {
            val uid = Repository.currentUserId()
            if (uid == null) {
                set { it.copy(signedIn = false, profile = null) }
                return@launch
            }
            runCatching { Repository.myProfile() }
                .onSuccess { p -> set { it.copy(signedIn = true, profile = p) } }
                .onFailure { set { it.copy(signedIn = true) } }
        }
    }

    fun signIn(email: String, password: String) = auth { Repository.signIn(email, password) }

    fun signUp(email: String, password: String, fullName: String, phone: String) =
        auth { Repository.signUp(email, password, fullName, phone) }

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

    // ---------- file pick ----------

    fun pickFile(uri: Uri) {
        viewModelScope.launch {
            set { it.copy(loading = true, error = null, message = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    val name = displayName(uri)
                    val bytes = getApplication<Application>().contentResolver
                        .openInputStream(uri)!!.use { it.readBytes() }
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
                    DialerConfig(gapSeconds = s.breakSeconds),
                    s.campaignName.ifBlank { "Campaign" },
                )
                AutoDialerService.start(getApplication())
                set { it.copy(loading = false, pendingParse = null, pendingFileName = null, campaignName = "", message = null) }
                loadCampaigns()
            }.onFailure { e -> set { it.copy(loading = false, error = e.message) } }
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
