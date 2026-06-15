@file:OptIn(ExperimentalComposeUiApi::class, ExperimentalMaterial3Api::class)

package com.salesautocall.app.ui

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Description
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.salesautocall.app.data.AppPrefs
import kotlinx.coroutines.launch

@Composable
fun AppRoot(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var crash by remember { mutableStateOf(AppPrefs.getLastCrash(context)) }

    if (state.signedIn) MainShell(vm) else LoginScreen(vm)

    // In-app softphone call overlay.
    if (state.signedIn && state.cloudCallNumber != null) {
        SoftphoneScreen(vm)
    }

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
    data object Team : Tab("team", "Reports")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(vm: MainViewModel) {
    val state by vm.state.collectAsState()
    val nav = rememberNavController()
    val tabs = listOf(Tab.Home, Tab.Leads, Tab.Dialer, Tab.Campaign, Tab.Team)
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            AppDrawer(
                userName = state.profile?.fullName ?: "Your account",
                role = state.profile?.role ?: "salesperson",
                companyName = state.company?.name,
                onNavigate = { route ->
                    vm.clearMessage()
                    scope.launch { drawerState.close() }
                    nav.navigate(route) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                onSettings = {
                    scope.launch { drawerState.close() }
                    nav.navigate("settings") { launchSingleTop = true }
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
                        IconButton(onClick = { nav.navigate("settings") { launchSingleTop = true } }) {
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
                NavigationBar {
                    val current by nav.currentBackStackEntryAsState()
                    val route = current?.destination?.route
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                vm.clearMessage()
                                // Standard bottom-nav behaviour: don't stack tabs and keep
                                // each tab's state so switching back doesn't reload everything.
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(
                                    when (tab) {
                                        is Tab.Home -> Icons.Default.Home
                                        is Tab.Leads -> Icons.Default.People
                                        is Tab.Dialer -> Icons.Default.Dialpad
                                        is Tab.Campaign -> Icons.Default.Campaign
                                        else -> Icons.Default.Leaderboard
                                    },
                                    contentDescription = tab.label,
                                )
                            },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                    }
                }
            },
        ) { padding ->
            Column(Modifier.padding(padding)) {
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
                            onNavigate = { route -> nav.navigate(route) { launchSingleTop = true } },
                        )
                    }
                    composable(Tab.Leads.route) {
                        LeadsScreen(vm, onStartCampaign = {
                            nav.navigate(Tab.Campaign.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        })
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
                    composable("settings") { SettingsScreen(vm, onBack = { nav.popBackStack() }) }
                }
            }
        }
    }
}

private data class MenuItem(
    val label: String,
    val desc: String,
    val icon: ImageVector,
    val route: String?,        // null = "coming soon" / handled by onClick
    val color: Color,
    val badge: String? = null,
)

// Premium dark menu palette.
private val MenuBg = Color(0xFF0C1426)
private val MenuText = Color(0xFFE8EDF7)
private val MenuMuted = Color(0xFF8A97AE)
private val MenuDivider = Color(0xFF1B2740)
private val Gold = Color(0xFFF5B23E)

@Composable
private fun AppDrawer(
    userName: String,
    role: String,
    companyName: String?,
    onNavigate: (String) -> Unit,
    onSettings: () -> Unit,
    onSignOut: () -> Unit,
) {
    val context = LocalContext.current
    val items = listOf(
        MenuItem("Dashboard", "Calls, leads & team performance", Icons.Default.Dashboard, "home", Color(0xFF3B82F6)),
        MenuItem("Leads", "Manage and follow up your leads", Icons.Default.People, "leads", Color(0xFF22C55E)),
        MenuItem("AI Assistant", "Insights & next-best actions", Icons.Default.AutoAwesome, "ai", Color(0xFF8B5CF6), "NEW"),
        MenuItem("Follow-up Calendar", "Day & week callback planner", Icons.Default.CalendarMonth, "calendar", Color(0xFFF59E0B)),
        MenuItem("Follow Ups", "Your due-now worklist", Icons.Default.AccessTime, "followups", Color(0xFF14B8A6)),
        MenuItem("Attendance", "Selfie + GPS check-in", Icons.Default.PinDrop, "attendance", Color(0xFF10B981)),
        MenuItem("Calls", "Call history and recordings", Icons.Default.Call, "calls", Color(0xFFEC4899)),
        MenuItem("Call Lists", "Import lists & auto-dial", Icons.Default.Campaign, "campaign", Color(0xFFEF4444)),
        MenuItem("Reports & Team", "Leaderboard, talk-time, conversions", Icons.Default.Leaderboard, "team", Color(0xFFA855F7)),
        MenuItem("Investor Videos", "AI-generated property videos", Icons.Default.Videocam, null, Color(0xFFF43F5E), "Soon"),
        MenuItem("Brochures", "Smart brochures in one tap", Icons.Default.Description, null, Color(0xFF06B6D4), "Soon"),
    )

    ModalDrawerSheet(
        Modifier.fillMaxWidth(0.86f),
        drawerContainerColor = MenuBg,
        drawerContentColor = MenuText,
    ) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // Brand header — gradient band with a Premium chip.
            Column(
                Modifier.fillMaxWidth()
                    .background(Brush.linearGradient(listOf(Color(0xFF1E3A8A), Color(0xFF0C1426))))
                    .padding(20.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(Color(0xFF2563EB)),
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
                Spacer(Modifier.height(14.dp))
                Text("Everything you need. One app.", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
            }

            Spacer(Modifier.height(10.dp))
            items.forEach { item ->
                DrawerRow(item) {
                    if (item.route != null) onNavigate(item.route)
                    else android.widget.Toast.makeText(context, "${item.label} — coming soon", android.widget.Toast.LENGTH_SHORT).show()
                }
            }

            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(MenuDivider))
            Spacer(Modifier.height(8.dp))
            DrawerRow(MenuItem("Settings", "Calling, goals & cloud setup", Icons.Default.Settings, null, Color(0xFF64748B))) { onSettings() }
            DrawerRow(MenuItem("Help & Support", "Get help using the app", Icons.AutoMirrored.Filled.HelpOutline, null, Color(0xFF0EA5E9))) {
                android.widget.Toast.makeText(context, "Help & Support — coming soon", android.widget.Toast.LENGTH_SHORT).show()
            }

            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(MenuDivider))
            // Profile footer
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
                            append(if (role == "admin") "Super Admin" else "Telecaller")
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
private fun DrawerRow(item: MenuItem, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(item.color.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center) {
            Icon(item.icon, contentDescription = item.label, tint = item.color, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MenuText)
                item.badge?.let {
                    Spacer(Modifier.width(8.dp))
                    val badgeColor = if (it == "Soon") MenuMuted else item.color
                    Box(Modifier.clip(RoundedCornerShape(50)).background(badgeColor.copy(alpha = 0.2f)).padding(horizontal = 7.dp, vertical = 1.dp)) {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = badgeColor, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Text(item.desc, style = MaterialTheme.typography.bodySmall, color = MenuMuted, maxLines = 1)
        }
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MenuMuted, modifier = Modifier.size(18.dp))
    }
}
