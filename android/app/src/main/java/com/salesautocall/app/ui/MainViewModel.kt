package com.salesautocall.app.ui

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.salesautocall.app.data.CallLog
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.CsvTsvParser
import com.salesautocall.app.data.Profile
import com.salesautocall.app.data.Repository
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
    val queue: List<Contact> = emptyList(),
    val logs: List<CallLog> = emptyList(),
    val message: String? = null,
    val error: String? = null,
)

class MainViewModel : ViewModel() {

    private val _state = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        refreshSession()
    }

    private fun set(transform: (AppState) -> AppState) {
        _state.value = transform(_state.value)
    }

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

    fun signIn(email: String, password: String) = auth {
        Repository.signIn(email, password)
    }

    fun signUp(email: String, password: String, fullName: String, phone: String) = auth {
        Repository.signUp(email, password, fullName, phone)
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

    fun signOut() {
        viewModelScope.launch {
            runCatching { Repository.signOut() }
            set { AppState(signedIn = false) }
        }
    }

    fun importFile(resolver: ContentResolver, uri: Uri) {
        viewModelScope.launch {
            set { it.copy(loading = true, error = null, message = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    val name = displayName(resolver, uri)
                    val format = if (name.lowercase().endsWith(".tsv")) "tsv" else "csv"
                    val parsed = resolver.openInputStream(uri)!!.bufferedReader().use {
                        CsvTsvParser.parse(it, name)
                    }
                    val stored = Repository.importContacts(parsed, name, format)
                    Triple(stored, parsed.totalRows, parsed.skippedRows)
                }
            }.onSuccess { (stored, total, skipped) ->
                set {
                    it.copy(
                        loading = false,
                        message = "Imported $stored contacts from $total rows ($skipped skipped).",
                    )
                }
                loadQueue()
            }.onFailure { e ->
                set { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun loadQueue() {
        viewModelScope.launch {
            runCatching { Repository.fetchCallQueue() }
                .onSuccess { q -> set { it.copy(queue = q) } }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun loadLogs() {
        viewModelScope.launch {
            runCatching { Repository.recentCalls() }
                .onSuccess { l -> set { it.copy(logs = l) } }
                .onFailure { e -> set { it.copy(error = e.message) } }
        }
    }

    fun clearMessages() = set { it.copy(message = null, error = null) }

    private fun displayName(resolver: ContentResolver, uri: Uri): String {
        var name = "import.csv"
        resolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) name = c.getString(idx)
        }
        return name
    }
}
