@file:OptIn(ExperimentalComposeUiApi::class, ExperimentalMaterial3Api::class)

package com.salesautocall.app.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.activity.compose.BackHandler
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Leaderboard
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PinDrop
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.salesautocall.app.data.Contact
import com.salesautocall.app.data.LeadStage
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.salesautocall.app.data.AppPrefs
import kotlinx.coroutines.launch
import com.salesautocall.app.ui.design.AppColors

@Composable
fun AppRoot(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var crash by remember { mutableStateOf(AppPrefs.getLastCrash(context)) }

    // Fail-safe for missed assignment pushes: on every foreground, pull leads
    // assigned while the rep was away and alert locally (with sound).
    if (state.signedIn) {
        val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
        androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
            val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
                if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                    vm.checkNewAssignments()
                    // Restarts the assistant's "stay quiet for a bit" timer, so
                    // coming back to the app never lands straight on a question.
                    vm.onForeground()
                }
            }
            lifecycleOwner.lifecycle.addObserver(observer)
            onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
        }

        // The assistant's heartbeat. Everything that decides whether to ask
        // anything lives in tickAssistant(), and on almost every beat the answer
        // is no — a minute is slow enough to cost nothing and quick enough that
        // a callback going red is noticed while it still matters.
        LaunchedEffect(state.assistantOn) {
            while (state.assistantOn) {
                kotlinx.coroutines.delay(60_000L)
                vm.tickAssistant()
            }
        }
    }

    when {
        // Still restoring the saved session → hold on a calm splash so cold
        // start never flashes login → join-company → app.
        !state.authResolved -> BootSplash()
        state.signedIn -> MainShell(vm)
        else -> LoginScreen(vm)
    }

    // In-app softphone call overlay.
    if (state.signedIn && state.cloudCallNumber != null) {
        SoftphoneScreen(vm)
    }

    // Post-call disposition overlay.
    if (state.signedIn && state.postCallContactId != null) {
        PostCallDispositionSheet(vm)
    }

    // The assistant's own question — never at the same time as the sheet above
    // (tickAssistant refuses to arm one while a disposition is open).
    if (state.signedIn && state.assistantAsk != null) {
        AssistantPromptSheet(vm)
    }

    // Full-screen Settings overlay (below lead detail, so a lead opened from
    // settings shows on top and settings is dismissed cleanly).
    if (state.signedIn && state.showSettings) {
        SettingsScreen(vm, onBack = { vm.closeSettings() })
    }

    // Full-screen lead detail overlay.
    if (state.signedIn && state.leadDetailId != null) {
        LeadDetailScreen(vm)
    }

    // Quick "add a lead" sheet.
    if (state.signedIn && state.showAddLead) {
        AddLeadSheet(vm)
    }

    // The in-app SIM call cockpit was removed — it floated over the phone's own
    // in-call screen and was laggy without adding value (the native dialer handles
    // mute/speaker/end, and recordings are harvested automatically after the call).

    crash?.let { text ->
        AlertDialog(
            onDismissRequest = { AppPrefs.clearLastCrash(context); crash = null },
            title = { Text("Something went wrong") },
            text = {
                Text("The app ran into an issue last time. If this keeps happening, contact your admin.",
                    style = MaterialTheme.typography.bodyMedium)
            },
            confirmButton = {
                TextButton(onClick = { AppPrefs.clearLastCrash(context); crash = null }) { Text("OK") }
            },
        )
    }
}

/**
 * The update, out of the way. Sits above the bottom bar, shows how far the
 * download has got, and taps back open — so "an update is running" is visible
 * without being in the way of the next call.
 */
@Composable
private fun MinimizedUpdateChip(progress: Float, onExpand: () -> Unit) {
    val pct = (progress * 100).toInt().coerceIn(0, 100)
    Box(Modifier.fillMaxSize().padding(bottom = 96.dp), contentAlignment = Alignment.BottomCenter) {
        Surface(
            shape = RoundedCornerShape(50),
            color = MaterialTheme.colorScheme.secondaryContainer,
            tonalElevation = 6.dp,
            shadowElevation = 8.dp,
            modifier = Modifier.clickable { onExpand() },
        ) {
            Row(
                Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(
                    progress = progress,
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                )
                Text(
                    "Update $pct%",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
        }
    }
}

/** A quick single-lead create sheet — the missing "Add Lead" action. */
@Composable
private fun AddLeadSheet(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var project by remember { mutableStateOf("") }
    var budget by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    BackHandler { vm.closeAddLead() }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.Center,
    ) {
        Card(Modifier.fillMaxWidth(0.92f)) {
            Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState())) {
                Text("Add lead", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    phone, { phone = it }, label = { Text("Phone *") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(project, { project = it }, label = { Text("Project / location") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(budget, { budget = it }, label = { Text("Budget (e.g. 45 lakh)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(note, { note = it }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { vm.closeAddLead() }) { Text("Cancel") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { vm.addLead(name, phone, project, budget, note) },
                        enabled = !app.addingLead && phone.count { it.isDigit() } >= 7,
                    ) { Text(if (app.addingLead) "Adding…" else "Add lead") }
                }
            }
        }
    }
}

/** Calm branded splash shown while the saved session is being restored. */
@Composable
private fun BootSplash() {
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(64.dp).clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
            }
            Spacer(Modifier.height(20.dp))
            Text("Call Pro AI", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(18.dp))
            CircularProgressIndicator(Modifier.size(26.dp), strokeWidth = 2.5.dp)
        }
    }
}

@Composable
private fun LoginScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var signUp by remember { mutableStateOf(false) }
    var role by remember { mutableStateOf("salesperson") } // "admin" | "salesperson"
    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var companyName by remember { mutableStateOf("") }
    var companyCode by remember { mutableStateOf("") }
    var email by remember { mutableStateOf(AppPrefs.getLastEmail(context)) }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }
    val isAdmin = role == "admin"

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Call Pro AI", style = MaterialTheme.typography.headlineMedium)
        Text(if (signUp) "Create your account" else "Sign in")
        Spacer(Modifier.height(16.dp))

        if (signUp) {
            // Choose your role — admin creates a company, employee joins one.
            Text("I want to…", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = isAdmin,
                    onClick = { role = "admin"; formError = null },
                    label = { Text("Create company") },
                )
                FilterChip(
                    selected = !isAdmin,
                    onClick = { role = "salesperson"; formError = null },
                    label = { Text("Join company") },
                )
            }
            Spacer(Modifier.height(8.dp))
            Card(Modifier.fillMaxWidth()) {
                Text(
                    if (isAdmin)
                        "You'll create a new company and become its admin. After signing up you'll get an invite code to share with your team."
                    else
                        "Enter the Company code your admin shared with you to join their team. Don't have one? Ask your admin, or switch to “Create a company”.",
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
            if (isAdmin) {
                OutlinedTextField(
                    companyName, { companyName = it }, label = { Text("Company name *") }, singleLine = true,
                    isError = formError != null && companyName.isBlank(),
                    supportingText = { Text("Your business / team name.") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
            } else {
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
                phone, { phone = it }, label = { Text("Phone (optional)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth().autofill(listOf(AutofillType.PhoneNumber)) { phone = it },
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
                        isAdmin && companyName.isBlank() -> "Enter a name for your company."
                        !isAdmin && companyCode.isBlank() -> "Enter the Company code from your admin (shown above)."
                        !email.trim().contains("@") -> "Please enter a valid email address."
                        password.length < 6 -> "Password must be at least 6 characters."
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
                    if (signUp) vm.signUp(email.trim(), password, fullName, phone, role, companyName, companyCode)
                    else vm.signIn(email.trim(), password)
                }
            },
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                when {
                    state.loading -> "Please wait…"
                    signUp && isAdmin -> "Create company"
                    signUp -> "Create account"
                    else -> "Sign in"
                },
            )
        }

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
    data object Home : Tab("home", "Dashboard")
    data object Leads : Tab("leads", "Leads")
    data object Dialer : Tab("dialer", "Dialer")
    data object Campaign : Tab("campaign", "Call List")
    data object Calls : Tab("calls", "Calls")
    data object Team : Tab("team", "Reports")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(vm: MainViewModel) {
    val state by vm.state.collectAsState()

    if (state.company == null && !state.loading && state.profile != null) {
        RequireCompanyScreen(vm)
        return
    }

    val nav = rememberNavController()

    // Call history sits on the bottom bar; Reports stays one tap away in the drawer.
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val currentRoute = nav.currentBackStackEntryAsState().value?.destination?.route

    LaunchedEffect(state.requestedContactId) {
        if (state.requestedContactId != null) {
            nav.navigate("leads") {
                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    // A bottom-nav tap from inside an overlay (lead detail / settings) routes here.
    LaunchedEffect(state.pendingTab) {
        state.pendingTab?.let { route ->
            nav.navigate(route) {
                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
            vm.consumeTab()
        }
    }
    // "More" tapped from an overlay's bottom bar → open the drawer.
    LaunchedEffect(state.pendingDrawer) {
        if (state.pendingDrawer) {
            drawerState.open()
            vm.consumeDrawer()
        }
    }

    // A newer build was published → offer a one-tap in-app update. Forced updates
    // can't be dismissed; once started, the prompt shows a downloading state.
    //
    // The download begins on its own the moment an update is found, and it used
    // to hold the whole screen until it finished — a rep mid-shift simply had to
    // stop calling and watch a progress bar. It can now be pushed aside: the
    // download carries on in the background and a small chip shows the progress,
    // so the shift never pauses for a build.
    state.update?.let { rel ->
        val downloading = state.updateDownloading
        if (state.updateMinimized) {
            MinimizedUpdateChip(state.updateProgress) { vm.expandUpdate() }
            return@let
        }
        AlertDialog(
            // While downloading, back / outside-tap tucks it away rather than
            // doing nothing — including for a forced update, which still has to
            // be installed, just not stared at.
            onDismissRequest = {
                when {
                    downloading -> vm.minimizeUpdate()
                    !rel.forced -> vm.dismissUpdate()
                }
            },
            title = { Text(if (rel.forced) "🔒 Update required" else "🚀 Update available") },
            text = {
                Column {
                    Text("Version ${rel.versionName} is ready to install.")
                    Spacer(Modifier.height(8.dp))
                    // Always a generic, customer-safe line — never raw release
                    // notes, which could carry repo/branch/PR internals.
                    Text(
                        if (rel.forced) "This is an important update — please install it to keep using the app."
                        else "Includes the latest features, speed improvements and fixes.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (downloading) {
                        Spacer(Modifier.height(14.dp))
                        val pct = (state.updateProgress * 100).toInt().coerceIn(0, 100)
                        LinearProgressIndicator(progress = state.updateProgress, modifier = Modifier.fillMaxWidth())
                        Spacer(Modifier.height(6.dp))
                        Text("Downloading… $pct% — the installer opens automatically.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            },
            confirmButton = {
                if (downloading) {
                    // The one thing a rep on a shift actually needs here.
                    TextButton(onClick = { vm.minimizeUpdate() }) { Text("Chhota karo — kaam karne do") }
                } else {
                    TextButton(onClick = { vm.installUpdate() }) { Text("Update now") }
                }
            },
            dismissButton = {
                if (!rel.forced && !downloading) {
                    TextButton(onClick = { vm.dismissUpdate() }) { Text("Later") }
                }
            },
        )
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            AppDrawer(
                userName = state.profile?.fullName ?: "Your account",
                role = state.profile?.role ?: "salesperson",
                companyName = state.company?.name,
                currentRoute = currentRoute,
                followUps = state.followUpList.size,
                siteVisits = state.leads.count { it.status == "site_visit" },
                pipelineValue = pipelineValue(state.leads, state.leadStages),
                onNavigate = { route ->
                    vm.clearMessage()
                    scope.launch { drawerState.close() }
                    if (route == "add_lead") vm.openAddLead()
                    else nav.navigate(route) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                onSettings = {
                    scope.launch { drawerState.close() }
                    vm.openSettings()
                },
                onSignOut = {
                    scope.launch { drawerState.close() }
                    vm.signOut()
                },
            )
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("Call Pro AI", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("Real Estate Sales Simplified", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Menu")
                        }
                    },
                    actions = {
                        // THE AI COACH LIVES IN THE HEADER NOW.
                        //
                        // As a floating bubble it collided with something in
                        // every corner it was tried: top-right sat on the
                        // pipeline card's buttons, bottom-left on the lead
                        // cards' avatars, bottom-right squarely on a card's
                        // Call button — the one control a rep must never miss.
                        // A floating layer over a scrolling list will always
                        // land on somebody's content eventually. In the bar it
                        // cannot, and it is still one tap from every screen.
                        // Visible, reachable from every screen, and SECONDARY.
                        // In accent blue it competed with the Call buttons below
                        // it for the same attention; the one thing on this screen
                        // that should be the brightest is the button that dials.
                        // Same weight as Settings now — the sparkle is what makes
                        // it findable, not the colour.
                        IconButton(onClick = { vm.openCoach() }) {
                            Icon(Icons.Default.AutoAwesome, contentDescription = "AI Coach",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(21.dp))
                        }
                        IconButton(onClick = { vm.openSettings() }) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    },
                    // Clean white app bar with a blue menu icon — modern CRM signature.
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        navigationIconContentColor = MaterialTheme.colorScheme.primary,
                        actionIconContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                )
            },
            bottomBar = {
                val route = nav.currentBackStackEntryAsState().value?.destination?.route
                fun go(r: String) {
                    vm.clearMessage()
                    nav.navigate(r) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
                Column {
                    // The call that hasn't been written up yet, one line above
                    // the bottom bar. It sits here rather than inside a tab so
                    // it follows the rep wherever they go next — which is the
                    // whole point: the old popup caught them because it blocked
                    // the screen, and this has to catch them without doing that.
                    PendingUpdateBar(vm)
                    FloatingCallBar(
                        current = route,
                        onTab = { go(it) },
                        onDial = { go(Tab.Dialer.route) },
                        onMore = { scope.launch { drawerState.open() } },
                    )
                }
            },
        ) { padding ->

            Box(Modifier.padding(padding)) {
            Column {
                NavHost(
                    nav,
                    startDestination = Tab.Home.route,
                    // Instant tab switches — the default ~700ms crossfade reads as lag.
                    enterTransition = { EnterTransition.None },
                    exitTransition = { ExitTransition.None },
                    popEnterTransition = { EnterTransition.None },
                    popExitTransition = { ExitTransition.None },
                ) {
                    composable(Tab.Home.route) {
                        HomeScreen(
                            vm,
                            onOpenFollowUps = { nav.navigate("followups") },
                            onOpenLeads = {
                                nav.navigate(Tab.Leads.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            onNavigate = { route ->
                                if (route == "add_lead") vm.openAddLead()
                                else nav.navigate(route) { launchSingleTop = true }
                            },
                        )
                    }
                    composable(Tab.Leads.route) {
                        LeadsScreen(
                            vm,
                            onStartCampaign = {
                                nav.navigate(Tab.Campaign.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        )
                    }
                    composable(Tab.Dialer.route) { DialerScreen(vm) }
                    composable(Tab.Campaign.route) {
                        CampaignScreen(vm, onPickLeads = {
                            vm.requestLeadSelect()
                            nav.navigate(Tab.Leads.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        })
                    }
                    composable(Tab.Team.route) {
                        TeamScreen(
                            vm,
                            onCampaigns = { nav.navigate("analytics") },
                            onCallHistory = { nav.navigate("calls") },
                        )
                    }
                    composable("followups") { FollowUpsScreen(vm, onBack = { nav.popBackStack() }) }
                    composable("attendance") { AttendanceScreen(vm, onBack = { nav.popBackStack() }) }
                    composable("calendar") { CalendarScreen(vm, onBack = { nav.popBackStack() }) }
                    composable("ai") { AiAssistantScreen(vm, onBack = { nav.popBackStack() }) }
                    composable("calls") { CallsScreen(vm) }
                    composable("analytics") {
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
                }
            }

            if (state.coachOpen) {
                CoachSheet(
                    panel = state.coachPanel,
                    loading = state.coachLoading,
                    picks = state.coachPicks,
                    picksLoading = state.coachPicksLoading,
                    resolveLead = { id -> state.leads.firstOrNull { l -> l.id == id } },
                    objection = state.coachObjection,
                    onObjectionChange = { vm.setCoachObjection(it) },
                    rebuttal = state.coachRebuttal,
                    rebuttalLoading = state.coachRebuttalLoading,
                    onGetRebuttal = { vm.getCoachRebuttal(it) },
                    onClearRebuttal = { vm.clearCoachRebuttal() },
                    ask = state.coachAsk,
                    onAskChange = { vm.setCoachAsk(it) },
                    answer = state.coachAnswer,
                    answerLoading = state.coachAnswerLoading,
                    onAsk = { vm.askCoach() },
                    onClearAnswer = { vm.clearCoachAnswer() },
                    onCall = { phone ->
                        vm.closeCoach()
                        vm.dialManual(phone)
                    },
                    onDismiss = { vm.closeCoach() },
                )
            }
            }
        }
    }
}

// ---- The app's one jade accent, theme-aware. ----
// The app is light-only since Theme.kt dropped the dark scheme, so the dark
// branch here could only ever return a colour tuned for a dark background —
// bright indigo on a white card. Parameter kept so the ~5 call sites stay
// compiling untouched; it is deliberately ignored.
@Suppress("UNUSED_PARAMETER")
internal fun jadeAccent(dark: Boolean) = AppColors.Indigo

// CoachBubble is deleted. A floating layer over a scrolling list lands on
// somebody's content eventually — it hit the pipeline buttons, then the lead
// avatars, then a card's Call button. The coach lives in the app bar.

@Composable
private fun AiSpark(modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "ai")
    val pulse by t.animateFloat(
        initialValue = 0.82f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulse",
    )
    val spin by t.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(9000, easing = LinearEasing), RepeatMode.Restart),
        label = "spin",
    )
    Canvas(modifier) {
        val c = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height / 2f)
        val r = size.minDimension / 2f

        // A four-point star, built from two curves that pinch at the waist —
        // the "sparkle" shape an assistant is read as everywhere.
        fun spark(centre: androidx.compose.ui.geometry.Offset, radius: Float, alpha: Float) {
            val waist = radius * 0.30f
            val p = androidx.compose.ui.graphics.Path().apply {
                moveTo(centre.x, centre.y - radius)
                quadraticBezierTo(centre.x + waist, centre.y - waist, centre.x + radius, centre.y)
                quadraticBezierTo(centre.x + waist, centre.y + waist, centre.x, centre.y + radius)
                quadraticBezierTo(centre.x - waist, centre.y + waist, centre.x - radius, centre.y)
                quadraticBezierTo(centre.x - waist, centre.y - waist, centre.x, centre.y - radius)
                close()
            }
            drawPath(p, Color.White.copy(alpha = alpha))
        }

        spark(c, r * 0.92f * pulse, 0.97f)

        // The companion, orbiting slowly. Half a turn behind so the two are
        // never at their brightest together — it keeps the mark from reading
        // as a symmetrical logo and makes the movement noticeable at 24dp.
        val rad = Math.toRadians(spin.toDouble())
        val orbit = androidx.compose.ui.geometry.Offset(
            c.x + (r * 0.74f) * kotlin.math.cos(rad).toFloat(),
            c.y + (r * 0.74f) * kotlin.math.sin(rad).toFloat(),
        )
        spark(orbit, r * 0.26f * (1.82f - pulse), 0.85f)
    }
}

/**
 * The coach sheet: last-call feedback (kya acha tha / kya better ho sakta hai —
 * one point each, never a lecture) + the 10 AM "kal ka din" / 6 PM "aaj ka din"
 * brief. Opened from the AI Coach button in the app bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CoachSheet(
    panel: com.salesautocall.app.data.CoachPanel?,
    loading: Boolean,
    picks: List<com.salesautocall.app.data.FocusPick> = emptyList(),
    picksLoading: Boolean = false,
    resolveLead: (String) -> com.salesautocall.app.data.Contact? = { null },
    objection: String = "",
    onObjectionChange: (String) -> Unit = {},
    rebuttal: String? = null,
    rebuttalLoading: Boolean = false,
    onGetRebuttal: (String) -> Unit = {},
    onClearRebuttal: () -> Unit = {},
    ask: String = "",
    onAskChange: (String) -> Unit = {},
    answer: String? = null,
    answerLoading: Boolean = false,
    onAsk: () -> Unit = {},
    onClearAnswer: () -> Unit = {},
    onCall: (String) -> Unit = {},
    onDismiss: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
        ) {
            // The "Hide / Bada karo" button that used to sit at the end of this
            // row is gone with the floating bubble it shrank. With the coach in
            // the app bar there is nothing to minimise, and a button that does
            // nothing is worse than no button.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🎯 AI Coach", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))

            when {
                loading && panel == null -> Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                panel == null -> Text(
                    "Coach abhi data nahi laa paya — thodi der baad try kariye.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> {
                    // Last call FIRST — the rating + guidance the rep opens the
                    // coach for. Kept at the very front so it's never missed.
                    panel.coaching?.let { c ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        "📞 Last call" + (c.leadName?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                                        style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                                        modifier = Modifier.weight(1f),
                                    )
                                    c.rating?.let { r ->
                                        Text(
                                            "⭐".repeat(r.coerceIn(1, 5)) + " $r/5",
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.primary,
                                        )
                                    }
                                }
                                c.good?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(6.dp))
                                    Text("✅ $it", style = MaterialTheme.typography.bodyMedium)
                                }
                                // Only shown when the coach actually has a useful suggestion —
                                // a good call gets pure motivation, no forced "improve".
                                c.improve?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(6.dp))
                                    Text("💡 $it", style = MaterialTheme.typography.bodyMedium)
                                }
                                if ((c.rating ?: 0) >= 4 && c.improve.isNullOrBlank()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        "🔥 Shaandaar call! Aise hi karte rahiye.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    // Motivation + plan below the score: the day brief and one tip.
                    panel.brief?.let { b ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Text(
                                    if (b.slot == "morning") "🌅 Kal ka din" else "🌆 Aaj ka din",
                                    style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(b.content, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    panel.tip?.takeIf { it.isNotBlank() }?.let { t ->
                        Card(
                            Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                            ),
                        ) {
                            Column(Modifier.padding(14.dp)) {
                                Text(
                                    "💡 Aaj ka tip",
                                    style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    t, style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    if (panel.brief == null && panel.coaching == null) {
                        Text(
                            "Abhi coaching ke liye koi real call nahi mili (30 sec+ ki call chahiye). " +
                                "Ek achhi lambi call kijiye — coach yahin milega! 💪",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // ---- "Aaj ke 5" — the AI sales manager's next-best calls, each with
            // a ready-to-speak opener. One tap = dialing. THE founder-demo moment.
            Spacer(Modifier.height(14.dp))
            Text("🔥 Aaj ke 5 — sabse pehle ye calls", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            when {
                picksLoading -> Box(Modifier.fillMaxWidth().padding(18.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                }
                picks.isEmpty() -> Text(
                    "AI abhi aapke leads padh raha hai — thodi der me yahan aaj ke best 5 calls milengi.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> picks.forEach { p ->
                    val lead = resolveLead(p.contactId)
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        lead?.name?.takeIf { it.isNotBlank() } ?: lead?.phone ?: "Lead",
                                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                    )
                                    if (p.reason.isNotBlank()) {
                                        Text(
                                            p.reason, style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.primary, maxLines = 2,
                                        )
                                    }
                                }
                                lead?.phone?.let { ph ->
                                    Surface(
                                        shape = CircleShape,
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(40.dp).clip(CircleShape).clickable { onCall(ph) },
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.Call, contentDescription = "Call",
                                                tint = MaterialTheme.colorScheme.onPrimary,
                                                modifier = Modifier.size(19.dp),
                                            )
                                        }
                                    }
                                }
                            }
                            if (p.opener.isNotBlank()) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "🗣️ \"${p.opener}\"",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }

            // ---- 💬 Ask the coach — open two-way Q&A. Rep kuch bhi poochhe
            // (Hindi/Hinglish/English), jawab company brain (playbook + guidebook
            // + past wins) se aata hai, hamesha agle funnel step ki taraf.
            Spacer(Modifier.height(16.dp))
            Text("💬 Coach se poochho", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "Koi bhi sawaal — pitch, price, follow-up, site visit tak kaise le jaayein. Coach guide karega.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = ask,
                onValueChange = onAskChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Jaise: is lead ko site visit tak kaise le jaaun?") },
                maxLines = 4,
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = onAsk,
                enabled = ask.isNotBlank() && !answerLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (answerLoading) "Soch raha hoon…" else "Poochho →", fontWeight = FontWeight.Bold)
            }
            answer?.let { a ->
                Spacer(Modifier.height(12.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            "COACH 🎯", style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(a.trim(), style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { clipboard.setText(AnnotatedString(a.trim())) }) { Text("Copy") }
                            Spacer(Modifier.width(8.dp))
                            TextButton(onClick = onClearAnswer) { Text("Naya sawaal") }
                        }
                    }
                }
            }

            // ---- 🛡️ Objection Buster — customer ne mana kiya, turant sahi jawab.
            // RAG-grounded (company ke apne prices/offers/closing lines se), kisi
            // bhi screen se mid-call. Kisi open lead ki zaroorat nahi.
            Spacer(Modifier.height(16.dp))
            Text("🛡️ Objection Buster", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "Customer ne mana kiya? Tap karo ya likho — turant sahi jawab milega.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    "Too expensive", "Location too far", "Need to discuss at home",
                    "Just thinking about it", "Loan problem", "Cheaper elsewhere",
                ).forEach { c ->
                    FilterChip(
                        selected = false,
                        onClick = { if (!rebuttalLoading) { onObjectionChange(c); onGetRebuttal(c) } },
                        label = { Text(c) },
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = objection,
                onValueChange = onObjectionChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Customer ne kya kaha?") },
                maxLines = 3,
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = { onGetRebuttal(objection) },
                enabled = objection.isNotBlank() && !rebuttalLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (rebuttalLoading) "Soch raha hoon…" else "Jawab batao →", fontWeight = FontWeight.Bold)
            }
            rebuttal?.let { r ->
                Spacer(Modifier.height(12.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            "YE BOLIYE 👇", style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(r.trim(), style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { clipboard.setText(AnnotatedString(r.trim())) }) { Text("Copy") }
                            Spacer(Modifier.width(8.dp))
                            TextButton(onClick = onClearRebuttal) { Text("Naya sawaal") }
                        }
                    }
                }
            }
        }
    }
}

/**
 * The floating call bar — the app's bottom navigation, shared by MainShell and
 * the full-screen overlays (lead detail / settings). Four quiet destinations and
 * a raised centre **Dial** button: the telecaller's whole day is one thumb-tap
 * from anywhere. [current] highlights home/leads/calls; [onDial] opens the
 * dialer, [onMore] the drawer.
 */
@Composable
internal fun FloatingCallBar(
    current: String?,
    onTab: (String) -> Unit,
    onDial: () -> Unit,
    onMore: () -> Unit,
) {
    // Light-only now — the dark arms of these three were dead the moment the
    // dark colour scheme went, and worse than dead: they would have painted a
    // dark pill onto a light app for anyone whose phone is set to dark.
    val jade = AppColors.Indigo
    val pill = AppColors.Surface
    val hair = AppColors.Border
    // Kept deliberately darker than a normal secondary: inactive labels were
    // washing out in sunlight, which is where a telecaller actually works.
    val unsel = AppColors.TextSecondary
    val ring = MaterialTheme.colorScheme.background
    Box(Modifier.fillMaxWidth().height(84.dp).padding(horizontal = 14.dp), contentAlignment = Alignment.BottomCenter) {
        Row(
            Modifier.fillMaxWidth().height(60.dp).clip(RoundedCornerShape(22.dp))
                .background(pill).border(1.dp, hair, RoundedCornerShape(22.dp)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Follow Ups takes the slot Call history had.
            //
            // A telecaller's most frequent question is "who do I ring next", and
            // its answer lived two taps deep in the drawer. Call history is a
            // once-a-week, look-something-up screen and it had a permanent slot.
            // The bar has four places; they should go to the four things done
            // most often, and this swap is worth more than any amount of
            // rearranging the screens themselves. History is still one tap away
            // under More → Calls & Recordings.
            NavSlot("Home", Icons.Default.Home, current == "home", jade, unsel, Modifier.weight(1f)) { onTab("home") }
            NavSlot("Leads", Icons.Default.People, current == "leads", jade, unsel, Modifier.weight(1f)) { onTab("leads") }
            Spacer(Modifier.width(66.dp)) // room for the raised dial
            NavSlot("Follow Ups", Icons.Default.AccessTime, current == "followups", jade, unsel, Modifier.weight(1f)) { onTab("followups") }
            NavSlot("More", Icons.Default.Menu, false, jade, unsel, Modifier.weight(1f)) { onMore() }
        }
        // Raised centre Dial — the primary job, straddling the bar's top edge. A
        // ring in the surrounding colour "cuts" it out of the bar.
        Box(
            Modifier.align(Alignment.TopCenter).size(66.dp).clip(CircleShape).background(ring),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(56.dp).clip(RoundedCornerShape(19.dp)).background(jade).clickable { onDial() },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Default.Call, contentDescription = "Dial", tint = Color.White, modifier = Modifier.size(24.dp)) }
        }
    }
}

@Composable
private fun NavSlot(label: String, icon: ImageVector, on: Boolean, jade: Color, unsel: Color, modifier: Modifier, onClick: () -> Unit) {
    // The active tab used to differ only by tint, which on a bright phone in
    // daylight is close to no difference at all. It now carries a tinted pill
    // behind the icon as well — a shape change reads at arm's length where a
    // colour change does not.
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).clickable { onClick() }.padding(vertical = 5.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.clip(RoundedCornerShape(50))
                .background(if (on) jade.copy(alpha = 0.15f) else Color.Transparent)
                .padding(horizontal = 14.dp, vertical = 3.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = if (on) jade else unsel,
                modifier = Modifier.size(if (on) 23.dp else 21.dp))
        }
        Spacer(Modifier.height(2.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1,
            color = if (on) jade else unsel, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium)
    }
}

private data class NavRow(val label: String, val desc: String, val icon: ImageVector, val route: String?, val badge: String? = null)
private data class QuickAction(val label: String, val icon: ImageVector, val route: String?)

// Premium dark menu palette — one accent, everything else neutral.
// The More drawer was the last dark surface in the app, with a gold "Premium"
// badge — the two things the design direction rules out outright. Flipped to
// the same near-white canvas as every other screen by repointing the constants,
// so all 29 call sites below move together and none of the drawer's structure
// or behaviour changes.
private val MenuBg = AppColors.Canvas
private val MenuCard = AppColors.Surface
private val MenuText = AppColors.TextPrimary
private val MenuMuted = AppColors.TextSecondary
private val MenuDivider = AppColors.Border
private val MenuAccent = AppColors.Indigo
// Was gold. Violet reads as "premium" in this palette without the casino tint.
private val Gold = AppColors.Violet

/** Rough INR value of the open pipeline (excludes won/dead), for the menu card. */
private fun pipelineValue(leads: List<Contact>, stages: List<LeadStage>): String {
    // Open = not terminal, from lead_stages. The old list omitted `invalid`,
    // so bad numbers counted as live leads in this total.
    val open = leads.filter { c -> stages.firstOrNull { it.code == c.stage }?.isTerminal != true }
    val total = open.sumOf { menuBudgetRupees(it.budget) }
    return menuFormatRupees(total)
}

private fun menuBudgetRupees(s: String?): Double {
    if (s.isNullOrBlank()) return 0.0
    val t = s.lowercase().replace(",", "").trim()
    val num = Regex("[0-9]+(\\.[0-9]+)?").find(t)?.value?.toDoubleOrNull() ?: return 0.0
    return when {
        "cr" in t || "crore" in t -> num * 10_000_000
        "lakh" in t || "lac" in t || t.endsWith("l") -> num * 100_000
        t.endsWith("k") -> num * 1_000
        num < 1000 -> num * 100_000 // bare small number → lakhs (real-estate budgets)
        else -> num
    }
}

private fun menuFormatRupees(v: Double): String = when {
    v >= 10_000_000 -> "₹%.1f Cr".format(v / 10_000_000)
    v >= 100_000 -> "₹%.0f L".format(v / 100_000)
    v >= 1_000 -> "₹%.0f K".format(v / 1_000)
    else -> "₹0"
}

@Composable
private fun AppDrawer(
    userName: String,
    role: String,
    companyName: String?,
    currentRoute: String?,
    followUps: Int,
    siteVisits: Int,
    pipelineValue: String,
    onNavigate: (String) -> Unit,
    onSettings: () -> Unit,
    onSignOut: () -> Unit,
) {
    val context = LocalContext.current
    fun open(route: String?, label: String) {
        if (route != null) onNavigate(route)
        else android.widget.Toast.makeText(context, "$label — coming soon", android.widget.Toast.LENGTH_SHORT).show()
    }

    val main = listOf(
        NavRow("Dashboard", "Overview, performance & revenue", Icons.Default.Dashboard, "home"),
        NavRow("Leads", "Manage, auto-dial & activity", Icons.Default.People, "leads"),
        NavRow("Calling", "Dialer & call workflow", Icons.Default.Dialpad, "dialer"),
        NavRow("AI Sales Coach", "Insights, next actions & coach", Icons.Default.AutoAwesome, "ai", "NEW"),
        NavRow("Reports", "Team performance & analytics", Icons.Default.Leaderboard, "team"),
    )
    val quick = listOf(
        QuickAction("Start Calling", Icons.Default.Call, "dialer"),
        QuickAction("Add Lead", Icons.Default.People, "add_lead"),
        QuickAction("Schedule Follow-up", Icons.Default.CalendarMonth, "calendar"),
        QuickAction("Import Call List", Icons.Default.Campaign, "campaign"),
    )
    // "Projects" is gone from here. It routed nowhere and answered a tap with
    // "coming soon" — a menu entry whose only behaviour is to say no. A rep who
    // taps it once learns the menu lies; a rep who taps it twice stops reading
    // the menu. It comes back when there is a screen behind it.
    val more = listOf(
        NavRow("Follow Ups", "Your due-now worklist", Icons.Default.AccessTime, "followups"),
        NavRow("Attendance", "Selfie + GPS check-in", Icons.Default.PinDrop, "attendance"),
        NavRow("Calls & Recordings", "History and recordings", Icons.Default.Call, "calls"),
    )

    ModalDrawerSheet(
        Modifier.fillMaxWidth(0.86f),
        drawerContainerColor = MenuBg,
        drawerContentColor = MenuText,
    ) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // Brand header.
            Row(
                Modifier.fillMaxWidth()
                    .background(Brush.linearGradient(listOf(Color(0xFF1E3A8A), Color(0xFF0C1426))))
                    .padding(20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(MenuAccent),
                    contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Call, contentDescription = "Call Pro AI", tint = Color.White, modifier = Modifier.size(24.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Call Pro AI", style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Real Estate Sales Simplified", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.75f))
                }
                Box(Modifier.clip(RoundedCornerShape(50)).background(Gold.copy(alpha = 0.2f)).padding(horizontal = 9.dp, vertical = 3.dp)) {
                    Text("Premium", style = MaterialTheme.typography.labelSmall, color = Gold, fontWeight = FontWeight.Bold)
                }
            }

            // Today's Opportunities — a single calm card, three quiet stats.
            Column(Modifier.padding(16.dp)) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MenuCard).padding(16.dp)) {
                    Text("TODAY'S OPPORTUNITIES", style = MaterialTheme.typography.labelSmall, color = MenuMuted, letterSpacing = 1.sp)
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth()) {
                        OppStat(followUps.toString(), "Follow-ups", Modifier.weight(1f))
                        OppStat(siteVisits.toString(), "Site visits", Modifier.weight(1f))
                        OppStat(pipelineValue, "Pipeline", Modifier.weight(1f))
                    }
                }
            }

            DrawerSection("MAIN")
            main.forEach { row -> DrawerNavRow(row, selected = row.route == currentRoute) { open(row.route, row.label) } }

            Spacer(Modifier.height(16.dp))
            DrawerSection("QUICK ACTIONS")
            Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                quick.chunked(2).forEach { pair ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        pair.forEach { q -> QuickTile(q, Modifier.weight(1f)) { open(q.route, q.label) } }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            DrawerSection("MORE")
            more.forEach { row -> DrawerMoreRow(row.icon, row.label, selected = row.route == currentRoute) { open(row.route, row.label) } }
            DrawerMoreRow(Icons.Default.Settings, "Settings", selected = currentRoute == "settings") { onSettings() }

            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(MenuDivider))
            // Profile footer.
            Row(
                Modifier.fillMaxWidth().clickable { onSignOut() }.padding(20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(42.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)))), contentAlignment = Alignment.Center) {
                    Text(userName.trim().take(1).uppercase().ifBlank { "?" }, color = Color.White, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(userName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MenuText)
                    Text(
                        buildString {
                            // "Admin", not "Super Admin".
                            //
                            // Every company's own admin was being shown "Super
                            // Admin", which is a different and much larger thing:
                            // the platform owner, who sees every company. Telling
                            // six separate customers they are the super admin of
                            // the platform is a plain untruth on the first line
                            // of the menu, and after today's privilege-escalation
                            // work it is the exact word that must mean one thing.
                            append(if (role == "admin") "Admin" else "Telecaller")
                            companyName?.let { append(" · "); append(it) }
                        },
                        style = MaterialTheme.typography.bodySmall, color = MenuMuted,
                    )
                }
                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out", tint = MenuMuted)
            }
        }
    }
}

@Composable
private fun OppStat(value: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MenuMuted)
    }
}

@Composable
private fun DrawerSection(text: String) {
    Text(
        text, style = MaterialTheme.typography.labelSmall, color = MenuMuted,
        fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
        modifier = Modifier.padding(start = 20.dp, top = 6.dp, bottom = 6.dp),
    )
}

/** Prominent MAIN nav row: monochrome icon, label + description, accent highlight when active. */
@Composable
private fun DrawerNavRow(item: NavRow, selected: Boolean, onClick: () -> Unit) {
    val tint = if (selected) MenuAccent else MenuMuted
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) MenuAccent.copy(alpha = 0.14f) else Color.Transparent)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(item.icon, contentDescription = item.label, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.label, style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold, color = if (selected) Color.White else MenuText)
                item.badge?.let {
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.clip(RoundedCornerShape(50)).background(MenuAccent.copy(alpha = 0.22f)).padding(horizontal = 7.dp, vertical = 1.dp)) {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MenuAccent, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Text(item.desc, style = MaterialTheme.typography.bodySmall, color = MenuMuted, maxLines = 1)
        }
    }
}

/** Compact MORE row — just an icon and a label, no description, no colour. */
@Composable
private fun DrawerMoreRow(icon: ImageVector, label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 1.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) MenuAccent.copy(alpha = 0.14f) else Color.Transparent)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = label, tint = if (selected) MenuAccent else MenuMuted, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = if (selected) Color.White else MenuText)
    }
}

/** Quick-action tile — a small square button in the 2×2 grid. */
@Composable
private fun QuickTile(item: QuickAction, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.height(80.dp).clip(RoundedCornerShape(14.dp)).background(MenuCard).clickable { onClick() }
            .padding(horizontal = 8.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(item.icon, contentDescription = item.label, tint = MenuAccent, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(7.dp))
        Text(item.label, style = MaterialTheme.typography.labelMedium, color = MenuText, maxLines = 1)
    }
}

@Composable
private fun RequireCompanyScreen(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }
    
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier.fillMaxWidth(0.85f).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Default.Business,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(24.dp))
            Text(
                "Join your team",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "You need to join a company before using the app. Ask your admin for the 6-character invite code.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(32.dp))
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.uppercase() },
                label = { Text("Invite Code") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { vm.joinCompany(code) },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                enabled = code.isNotBlank() && !state.loading
            ) {
                if (state.loading) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                } else {
                    Text("Join Company")
                }
            }
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = { vm.signOut() }) {
                Text("Sign out", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
