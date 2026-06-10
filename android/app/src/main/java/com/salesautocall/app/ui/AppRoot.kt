@file:OptIn(ExperimentalComposeUiApi::class, ExperimentalMaterial3Api::class)

package com.salesautocall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.salesautocall.app.data.AppPrefs

@Composable
fun AppRoot(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var crash by remember { mutableStateOf(AppPrefs.getLastCrash(context)) }

    if (state.signedIn) MainShell(vm) else LoginScreen(vm)

    crash?.let { text ->
        AlertDialog(
            onDismissRequest = { AppPrefs.clearLastCrash(context); crash = null },
            title = { Text("Last crash details") },
            text = {
                Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
                    Text(text, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = { AppPrefs.clearLastCrash(context); crash = null }) { Text("Dismiss") }
            },
        )
    }
}

@Composable
private fun LoginScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var signUp by remember { mutableStateOf(false) }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var companyCode by remember { mutableStateOf("") }
    var email by remember { mutableStateOf(AppPrefs.getLastEmail(context)) }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Bulk Caller", style = MaterialTheme.typography.headlineMedium)
        Text(if (signUp) "Create your salesperson account" else "Sign in")
        Spacer(Modifier.height(16.dp))

        if (signUp) {
            // Explain the company code up front — the #1 first-time confusion.
            Card(Modifier.fillMaxWidth()) {
                Text(
                    "Joining your team? Enter the Company code your admin shares with you.\n" +
                        "Setting up a brand-new company instead? Create it on the web dashboard first, then share its code with your team.",
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                fullName, { fullName = it }, label = { Text("Full name *") }, singleLine = true,
                isError = formError != null && fullName.isBlank(),
                modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.PersonFullName)) { fullName = it },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                phone, { phone = it }, label = { Text("Phone (optional)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.PhoneNumber)) { phone = it },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                companyCode, { companyCode = it.uppercase() }, label = { Text("Company code *") },
                singleLine = true,
                isError = formError != null && companyCode.isBlank(),
                supportingText = { Text("The 6-character code from your team admin, e.g. EB5FC8.") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
        }

        OutlinedTextField(
            email, { email = it }, label = { Text("Email *") }, singleLine = true,
            isError = formError != null && !email.trim().contains("@"),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.EmailAddress, AutofillType.Username)) { email = it },
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            password, { password = it }, label = { Text("Password *") }, singleLine = true,
            isError = formError != null && password.length < 6,
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            supportingText = if (signUp) ({ Text("At least 6 characters.") }) else null,
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (showPassword) "Hide password" else "Show password",
                    )
                }
            },
            modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.Password)) { password = it },
        )
        Spacer(Modifier.height(16.dp))

        Button(
            onClick = {
                val err = if (signUp) {
                    when {
                        fullName.isBlank() -> "Please enter your full name."
                        !email.trim().contains("@") -> "Please enter a valid email address."
                        password.length < 6 -> "Password must be at least 6 characters."
                        companyCode.isBlank() -> "Enter the Company code from your admin (shown above)."
                        else -> null
                    }
                } else {
                    when {
                        !email.trim().contains("@") -> "Please enter a valid email address."
                        password.isBlank() -> "Please enter your password."
                        else -> null
                    }
                }
                formError = err
                if (err == null) {
                    AppPrefs.setLastEmail(context, email.trim())
                    if (signUp) vm.signUp(email.trim(), password, fullName, phone, companyCode)
                    else vm.signIn(email.trim(), password)
                }
            },
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (state.loading) "Please wait…" else if (signUp) "Create account" else "Sign in") }

        TextButton(
            onClick = { signUp = !signUp; formError = null },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (signUp) "Already have an account? Sign in" else "New here? Create an account")
        }
        formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

private sealed class Tab(val route: String, val label: String) {
    data object Campaign : Tab("campaign", "Campaign")
    data object Analytics : Tab("analytics", "Analytics")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(vm: MainViewModel) {
    val nav = rememberNavController()
    val tabs = listOf(Tab.Campaign, Tab.Analytics)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Bulk Caller") },
                actions = {
                    IconButton(onClick = { nav.navigate("settings") }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                val current by nav.currentBackStackEntryAsState()
                val route = current?.destination?.route
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = route == tab.route,
                        onClick = { nav.navigate(tab.route) { launchSingleTop = true } },
                        icon = {
                            Icon(
                                if (tab is Tab.Campaign) Icons.Default.Campaign else Icons.Default.QueryStats,
                                contentDescription = tab.label,
                            )
                        },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            NavHost(nav, startDestination = Tab.Campaign.route) {
                composable(Tab.Campaign.route) { CampaignScreen(vm) }
                composable(Tab.Analytics.route) {
                    AnalyticsScreen(vm, onOpen = { id, name ->
                        vm.openCampaign(id, name)
                        nav.navigate("campaign_detail")
                    })
                }
                composable("campaign_detail") {
                    CampaignDetailScreen(
                        vm,
                        onBack = { nav.popBackStack() },
                        onStarted = {
                            nav.navigate(Tab.Campaign.route) {
                                popUpTo(Tab.Campaign.route) { inclusive = false }
                                launchSingleTop = true
                            }
                        },
                    )
                }
                composable("settings") { SettingsScreen(vm, onBack = { nav.popBackStack() }) }
            }
        }
    }
}
