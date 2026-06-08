package com.salesautocall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

@Composable
fun AppRoot(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    if (state.signedIn) {
        MainScaffold(vm)
    } else {
        LoginScreen(vm)
    }
}

@Composable
private fun LoginScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    var signUp by remember { mutableStateOf(false) }
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("SalesAutoCall", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Text(if (signUp) "Create your salesperson account" else "Sign in")
        Spacer(Modifier.height(16.dp))

        if (signUp) {
            OutlinedTextField(fullName, { fullName = it }, label = { Text("Full name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(phone, { phone = it }, label = { Text("Phone") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
        }
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))

        Button(
            onClick = {
                if (signUp) vm.signUp(email, password, fullName, phone)
                else vm.signIn(email, password)
            },
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (state.loading) "Please wait…" else if (signUp) "Create account" else "Sign in") }

        TextButton(onClick = { signUp = !signUp }, modifier = Modifier.fillMaxWidth()) {
            Text(if (signUp) "Already have an account? Sign in" else "New here? Create an account")
        }

        state.error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

        Spacer(Modifier.height(8.dp))
        Text(
            "After signing up, ask your admin to add you to a company so you can import contacts.",
            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
        )
    }
}

private sealed class Tab(val route: String, val label: String) {
    data object Home : Tab("home", "Home")
    data object Import : Tab("import", "Import")
    data object Dialer : Tab("dialer", "Dialer")
    data object Logs : Tab("logs", "Logs")
}

@Composable
private fun MainScaffold(vm: MainViewModel) {
    val nav = rememberNavController()
    val tabs = listOf(Tab.Home, Tab.Import, Tab.Dialer, Tab.Logs)

    Scaffold(
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
                                when (tab) {
                                    Tab.Home -> Icons.Default.Home
                                    Tab.Import -> Icons.Default.Upload
                                    Tab.Dialer -> Icons.Default.Call
                                    Tab.Logs -> Icons.Default.List
                                },
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
            NavHost(nav, startDestination = Tab.Home.route) {
                composable(Tab.Home.route) { HomeScreen(vm) }
                composable(Tab.Import.route) { ImportScreen(vm) }
                composable(Tab.Dialer.route) { DialerScreen(vm) }
                composable(Tab.Logs.route) { LogsScreen(vm) }
            }
        }
    }
}

@Composable
private fun HomeScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Welcome", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)
        state.profile?.let {
            Text(it.fullName ?: "—")
            Text(if (it.companyId != null) "Company linked ✓" else "Not linked to a company yet — ask your admin.")
        }
        Spacer(Modifier.height(16.dp))
        Text("Queue: ${state.queue.size} contacts ready to call")
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = { vm.signOut() }) { Text("Sign out") }
    }
}
