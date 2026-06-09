@file:OptIn(ExperimentalComposeUiApi::class, ExperimentalMaterial3Api::class)

package com.salesautocall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material3.Button
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
    if (state.signedIn) MainShell(vm) else LoginScreen(vm)
}

@Composable
private fun LoginScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var signUp by remember { mutableStateOf(false) }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf(AppPrefs.getLastEmail(context)) }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Bulk Caller", style = MaterialTheme.typography.headlineMedium)
        Text(if (signUp) "Create your salesperson account" else "Sign in")
        Spacer(Modifier.height(16.dp))

        if (signUp) {
            OutlinedTextField(
                fullName, { fullName = it }, label = { Text("Full name") }, singleLine = true,
                modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.PersonFullName)) { fullName = it },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                phone, { phone = it }, label = { Text("Phone") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.PhoneNumber)) { phone = it },
            )
            Spacer(Modifier.height(8.dp))
        }

        OutlinedTextField(
            email, { email = it }, label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.EmailAddress, AutofillType.Username)) { email = it },
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") }, singleLine = true,
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
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
                AppPrefs.setLastEmail(context, email.trim())
                if (signUp) vm.signUp(email.trim(), password, fullName, phone)
                else vm.signIn(email.trim(), password)
            },
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (state.loading) "Please wait…" else if (signUp) "Create account" else "Sign in") }

        TextButton(onClick = { signUp = !signUp }, modifier = Modifier.fillMaxWidth()) {
            Text(if (signUp) "Already have an account? Sign in" else "New here? Create an account")
        }
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
                composable(Tab.Analytics.route) { AnalyticsScreen(vm) }
                composable("settings") { SettingsScreen(vm, onBack = { nav.popBackStack() }) }
            }
        }
    }
}
