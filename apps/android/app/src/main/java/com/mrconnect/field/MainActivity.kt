package com.mrconnect.field

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import androidx.activity.ComponentActivity
import androidx.activity.compose.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.*
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import org.json.*

class MainActivity : ComponentActivity() {
    private val model: FieldViewModel by viewModels()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setContent { FieldTheme { FieldApp(model) } }
    }

    override fun onStop() {
        super.onStop()
        if (model.repo.vault.pinHash.isNotEmpty() && model.repo.vault.token.isNotEmpty())
            model.locked = true
    }
}

@Composable
fun Primary(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        shape = RoundedCornerShape(10.dp),
    ) {
        Text(text, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun Secondary(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    FilledTonalButton(
        onClick = onClick,
        enabled = enabled,
        colors =
            ButtonDefaults.filledTonalButtonColors(
                containerColor = Color.White,
                contentColor = BrandStrong,
            ),
        border = BorderStroke(1.dp, LineStrong),
        modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp),
        shape = RoundedCornerShape(10.dp),
    ) {
        Text(text, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun FieldCard(
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = color,
        border = if (color == Color.White) BorderStroke(1.dp, Line) else null,
        shadowElevation = if (color == Color.White) 1.dp else 0.dp,
    ) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content,
        )
    }
}

@Composable
fun Message(text: String, error: Boolean = false) {
    Surface(
        color = if (error) DangerBg else Soft,
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text,
            Modifier.padding(16.dp),
            color = if (error) Color(0xFF912018) else Ink,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
fun Entry(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    required: Boolean = false,
    password: Boolean = false,
    number: Boolean = false,
    lines: Int = 1,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            label + if (required) " *" else "",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            singleLine = lines == 1,
            minLines = lines,
            visualTransformation =
                if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions =
                KeyboardOptions(
                    keyboardType =
                        if (password) KeyboardType.Password
                        else if (number) KeyboardType.Decimal else KeyboardType.Text
                ),
            colors =
                OutlinedTextFieldDefaults.colors(
                    unfocusedBorderColor = Line,
                    focusedBorderColor = Brand,
                    unfocusedContainerColor = Color.White,
                    focusedContainerColor = Color.White,
                ),
        )
    }
}

@Composable
fun Choice(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    required: Boolean = false,
) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            label + if (required) " *" else "",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Surface(
            onClick = { open = true },
            color = Color.White,
            border = BorderStroke(1.dp, Line),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    options.find { it.first == value }?.second ?: "Select ${label.lowercase()}",
                    Modifier.weight(1f),
                )
                Text("⌄", color = Brand)
            }
        }
    }
    if (open) {
        var q by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column(Modifier.heightIn(max = 450.dp)) {
                    Entry("Search", q, { q = it })
                    Spacer(Modifier.height(12.dp))
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        if (!required)
                            TextButton(
                                onClick = {
                                    onSelect("")
                                    open = false
                                }
                            ) {
                                Text("None")
                            }
                        options
                            .filter { it.second.contains(q, true) }
                            .take(100)
                            .forEach { (id, name) ->
                                TextButton(
                                    onClick = {
                                        onSelect(id)
                                        open = false
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(name, Modifier.fillMaxWidth())
                                }
                            }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text("Close") } },
        )
    }
}

@Composable
fun FieldApp(vm: FieldViewModel) {
    val context = LocalContext.current
    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            result ->
            if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true) vm.startShift()
            else vm.error = "Precise location permission is required to start shift tracking."
        }
    val capture =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r
            ->
            if (r[Manifest.permission.ACCESS_FINE_LOCATION] == true)
                vm.work {
                    val point = currentFix(context)
                    vm.repo.db.cache(vm.repo.owner, "location", point)
                    vm.message = "Current location captured"
                }
            else vm.error = "Location was not granted. Add a visit exception reason if necessary."
        }
    val locationAction = {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
            vm.work {
                val point = currentFix(context)
                vm.repo.db.cache(vm.repo.owner, "location", point)
                vm.message = "Current location captured"
            }
        else
            capture.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                )
            )
    }
    val shiftAction = {
        if (vm.repo.vault.shift.isNotEmpty()) vm.endShift()
        else if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
            vm.startShift()
        else
            permission.launch(
                if (Build.VERSION.SDK_INT >= 33)
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.POST_NOTIFICATIONS,
                    )
                else
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    )
            )
    }
    val auth = vm.screen in listOf("welcome", "login", "access-help")
    BackHandler(enabled = !auth && vm.screen != "home") { vm.navigate("home") }
    LaunchedEffect(vm.screen) {
        if (
            vm.screen == "home" &&
                vm.repo.vault.shift.isNotEmpty() &&
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
        )
            try {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, TrackingService::class.java),
                )
            } catch (_: Exception) {}
    }
    if (vm.locked && !auth) {
        Unlock(vm)
        return
    }
    Scaffold(
        containerColor = Canvas,
        topBar = {
            if (!auth)
                Surface(color = Color.White, shadowElevation = 1.dp) {
                    Row(
                        Modifier.statusBarsPadding()
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (vm.screen != "home")
                            TextButton(
                                onClick = { vm.navigate("home") },
                                contentPadding = PaddingValues(0.dp),
                                modifier = Modifier.width(36.dp),
                            ) {
                                Text("‹", fontSize = 30.sp)
                            }
                        Column(Modifier.weight(1f)) {
                            Text(
                                when {
                                    vm.screen == "home" ->
                                        if (vm.hindi)
                                            "नमस्ते, " + vm.user.text("name").substringBefore(' ')
                                        else
                                            "Good day, " + vm.user.text("name").substringBefore(' ')
                                    vm.screen == "calls" -> vm.t("Today’s visits")
                                    vm.screen == "plan" -> vm.t("Plan your day")
                                    vm.screen == "visit" -> vm.t("Record customer call")
                                    vm.screen == "more" -> vm.t("Your workspace")
                                    vm.screen == "reports" -> vm.t("My performance")
                                    vm.screen == "sync" -> vm.t("Sync center")
                                    vm.screen == "form" -> vm.t("Add / edit record")
                                    vm.screen == "detail" -> vm.t("Record detail")
                                    vm.screen == "dcr" -> vm.t("Daily call report")
                                    vm.screen == "account" -> vm.t("Account & settings")
                                    vm.screen == "help" -> vm.t("Help & support")
                                    vm.screen == "restricted" ->
                                        vm.t(
                                            if (vm.restrictedMessage.isEmpty()) "Your access"
                                            else "Access restricted"
                                        )
                                    vm.screen == "pending-reports" -> vm.t("Pending reporting dates")
                                    vm.screen == "campaign-doctors" -> vm.t("Campaign doctors")
                                    vm.screen == "addresses" -> vm.t("Customer addresses")
                                    vm.screen == "access-help" -> vm.t("Reset access")
                                    vm.screen == "tour-month" -> vm.t("Plan the month")
                                    else ->
                                        vm.modules
                                            .find { vm.screen == "module/" + it.text("key") }
                                            ?.text("title") ?: "MR Connect"
                                },
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Text(
                                localDate() +
                                    " · " +
                                    vm.t(if (vm.offline) "Offline" else "Company workspace"),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Muted,
                            )
                        }
                        TextButton(
                            onClick = { vm.navigate("module/announcement") },
                            modifier = Modifier.size(42.dp),
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            FieldIcon("bell")
                        }
                    }
                }
        },
        bottomBar = {
            if (!auth)
                Surface(color = Color.White, shadowElevation = 8.dp) {
                    Row(
                        Modifier.navigationBarsPadding()
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 8.dp)
                    ) {
                        listOf(
                                Triple("home", "house", "Today"),
                                Triple("calls", "stethoscope", "Calls"),
                                Triple("plan", "calendar-days", "Plan"),
                                Triple("reports", "chart-no-axes-combined", "Reports"),
                                Triple("more", "menu", "More"),
                            )
                            .forEach { (route, icon, title) ->
                                Surface(
                                    onClick = { vm.navigate(route) },
                                    modifier = Modifier.weight(1f),
                                    color = if (vm.screen == route) Soft else Color.White,
                                    shape = RoundedCornerShape(14.dp),
                                ) {
                                    Column(
                                        Modifier.padding(vertical = 8.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        FieldIcon(icon, 24)
                                        Text(
                                            vm.t(title),
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = if (vm.screen == route) BrandStrong else Muted,
                                            fontWeight =
                                                if (vm.screen == route) FontWeight.ExtraBold
                                                else FontWeight.Medium,
                                        )
                                    }
                                }
                            }
                    }
                }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Brand)
            if (vm.error.isNotEmpty())
                Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Message(vm.error, true)
                }
            if (vm.message.isNotEmpty())
                Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Message(vm.message)
                }
            if (vm.offline && !auth)
                Surface(
                    onClick = { vm.navigate("sync") },
                    color = WarnBg,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp).fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        FieldIcon("refresh-cw", 20)
                        Text(
                            "Offline. Saved work stays on this phone. Open sync center",
                            color = Warn,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            Column(
                Modifier.weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(if (auth) 24.dp else 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                when {
                    vm.screen == "welcome" -> Welcome { vm.navigate("login") }
                    vm.screen == "login" -> LoginScreen(vm)
                    vm.screen == "access-help" -> AccessHelp(vm)
                    vm.boot == null ->
                        if (vm.busy) SkeletonCards(4)
                        else Message("Sign in to load your company workspace.")
                    vm.screen == "home" -> Home(vm, shiftAction)
                    vm.screen == "calls" -> Calls(vm)
                    vm.screen == "plan" -> Plan(vm)
                    vm.screen == "visit" -> Visit(vm, locationAction)
                    vm.screen == "more" -> More(vm)
                    vm.screen == "form" -> RecordEditor(vm)
                    vm.screen == "detail" -> Detail(vm)
                    vm.screen == "dcr" -> DailyReport(vm)
                    vm.screen == "sync" -> SyncCenter(vm)
                    vm.screen == "account" -> AccountScreen(vm)
                    vm.screen == "reports" -> ReportsScreen(vm)
                    vm.screen == "permissions" -> PermissionsScreen(vm, locationAction)
                    vm.screen == "help" -> HelpScreen(vm)
                    vm.screen == "restricted" -> Restricted(vm)
                    vm.screen == "pending-reports" -> PendingReports(vm)
                    vm.screen == "tour-month" -> TourMonth(vm)
                    vm.screen == "campaign-doctors" -> CampaignDoctors(vm)
                    vm.screen == "addresses" -> CustomerAddresses(vm)
                    vm.screen.startsWith("module/") -> ModuleList(vm, vm.screen.substringAfter('/'))
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
fun Welcome(onContinue: () -> Unit) {
    Spacer(Modifier.height(16.dp))
    FieldCard(color = Navy) {
        FieldIcon("briefcase-medical", 32)
        Text(
            "Every visit.\nA stronger connection.",
            fontSize = 32.sp,
            lineHeight = 40.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
        Text(
            "Plan your day, meet your customers and report with confidence.",
            color = OnNavy,
        )
    }
    Text("YOUR FIELD WORKSPACE", color = Brand, style = MaterialTheme.typography.bodyMedium)
    listOf(
            "Plan with purpose" to "Routes, schedules and joint working",
            "Capture the complete visit" to "Detailing, samples and business",
            "Stay connected" to "Offline work and transparent shift tracking",
        )
        .forEach { (a, b) ->
            FieldCard {
                Text(a, fontWeight = FontWeight.Bold)
                Text(b, color = Muted)
            }
        }
    Primary("Get started", onClick = onContinue)
}

@Composable
fun LoginScreen(vm: FieldViewModel) {
    var company by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var base by remember { mutableStateOf(vm.repo.vault.baseUrl) }
    Text("Welcome back", style = MaterialTheme.typography.headlineMedium)
    Text("Sign in with your company account.", color = Muted)
    Entry("Company code", company, { company = it }, true)
    Entry("Employee ID / email", email, { email = it }, true)
    Entry("Password", password, { password = it }, true, password = true)
    Entry("Company server URL", base, { base = it }, true)
    Message("Your company administrator provides your account and server address.")
    Primary(
        "Sign in",
        !vm.busy && company.isNotBlank() && email.isNotBlank() && password.isNotEmpty(),
    ) {
        vm.login(company, email, password, base)
    }
    Secondary(vm.t("Forgot password?")) { vm.navigate("access-help") }
}

@Composable
fun Home(vm: FieldViewModel, shiftAction: () -> Unit) {
    val date = localDate()
    val plan =
        vm.records("dayplan").find {
            it.text("date") == date && it.text("ownerId") == vm.user.text("id")
        }
    val visits = vm.records("visit").filter { it.text("date") == date }
    val customers = vm.records("customer").filter { it.text("assignedTo") == vm.user.text("id") }
    val next = customers.firstOrNull { c -> visits.none { it.text("customerId") == c.text("id") } }
    LaunchedEffect(Unit) { vm.loadPending() }
    val reportsDue = vm.pendingReports?.optJSONObject("summary")
    Text(vm.t("Your workday"), style = MaterialTheme.typography.headlineMedium)
    if (plan == null) {
        FieldCard(color = Navy) {
            Text(
                vm.t("Ready for the field?"),
                color = Color.White,
                style = MaterialTheme.typography.titleLarge,
            )
            Text(vm.t("Start with a clear plan for your day."), color = Color.White)
            Primary(vm.t("Plan your day")) { vm.navigate("plan") }
        }
    } else {
        FieldCard(color = Soft) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FieldIcon("calendar-days")
                Column {
                    Text(vm.t("Your day, on track"), fontWeight = FontWeight.Bold)
                    Text(
                        vm.names(plan.text("routeId")),
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.weight(1f)) {
            FieldCard {
                Text(vm.t("Visits"), color = Muted)
                Text(
                    "${visits.size} / ${customers.size}",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    "${(customers.size-visits.size).coerceAtLeast(0)} customers remaining",
                    color = Brand,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        Box(Modifier.weight(1f)) {
            FieldCard {
                Text(vm.t("POB value"), color = Muted)
                Text(
                    rupees(visits.sumOf { it.optDouble("orderTotal", 0.0) }),
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    "Captured customer orders",
                    color = Brand,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
    if (next != null)
        FieldCard(color = Navy) {
            Text(vm.t("UP NEXT"), color = Color(0xFFD9FF59), style = MaterialTheme.typography.bodyMedium)
            Text(
                next.text("name"),
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(next.text("specialty") + " · " + next.text("area"), color = Color.White)
            Primary(vm.t("View visit")) {
                vm.selected = next
                vm.screen = "detail"
            }
        }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
                Triple("calls", "stethoscope", vm.t("Log a call")),
                Triple("module/expense", "receipt", vm.t("Expenses")),
                Triple("dcr", "file-text", vm.t("Daily report")),
            )
            .forEach { (route, icon, title) ->
                Box(Modifier.weight(1f)) {
                    Surface(
                        onClick = { vm.navigate(route) },
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, Line),
                        color = Color.White,
                    ) {
                        Column(
                            Modifier.fillMaxWidth().padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            FieldIcon(icon)
                            Text(title, fontSize = 11.sp)
                        }
                    }
                }
            }
    }
    FieldCard {
        Text(
            if (vm.repo.vault.shift.isEmpty()) vm.t("Shift tracking is off")
            else vm.t("Your work shift is active"),
            fontWeight = FontWeight.Bold,
        )
        Text(
            if (vm.repo.vault.shift.isEmpty())
                "Start after planning. Location is shared during your shift with a visible notification."
            else "Tracking continues while the screen is locked. Auto-stop after 16 hours.",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Primary(
            if (vm.repo.vault.shift.isEmpty()) vm.t("Start work shift") else vm.t("End work shift"),
            plan != null && !vm.busy,
            onClick = shiftAction,
        )
        Secondary(vm.t("Location permissions & status")) { vm.navigate("permissions") }
    }
    if ((reportsDue?.optInt("total") ?: 0) > 0) {
        if ((reportsDue?.optInt("overdue") ?: 0) > 0)
            Message("${reportsDue?.optInt("overdue")} daily report(s) are past the reporting window.", true)
        Secondary(vm.t("Pending reports") + " (${reportsDue?.optInt("total")})") {
            vm.navigate("pending-reports")
        }
    }
    Secondary(vm.t("Sync saved work") + " (${vm.repo.db.pending(vm.repo.owner).size})") { vm.navigate("sync") }
}

@Composable
fun Calls(vm: FieldViewModel) {
    var query by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("Doctor") }
    Choice(
        vm.t("Customer type"),
        type,
        listOf("Doctor", "Chemist", "Hospital", "Stockist", "Dietitian").map { it to it },
        { type = it },
    )
    Secondary(vm.t("Non-listed call")) { vm.startNonListedCall() }
    Entry(vm.t("Search customers"), query, { query = it })
    val visits = vm.records("visit").filter { it.text("date") == localDate() }
    val customers =
        vm.records("customer").filter {
            it.text("assignedTo") == vm.user.text("id") &&
                it.text("type") == type &&
                it.text("name").contains(query, true)
        }
    if (customers.isEmpty())
        Message(
            "No matching customers. Try a different search or add a customer from your workspace."
        )
    customers.take(100).forEach { c ->
        FieldCard {
            Text(c.text("name"), style = MaterialTheme.typography.titleMedium)
            Text(
                capitalizeWords(c.text("specialty") + " · " + c.text("area") + " · " + c.text("class")),
                color = Muted,
            )
            val last = vm.lastVisited(c.text("id"))
            if (last.isNotEmpty()) Text("Last visited: $last", color = Muted)
            Text(
                if (visits.any { it.text("customerId") == c.text("id") }) vm.t("Visited today")
                else vm.t("Planned customer"),
                color = Brand,
                style = MaterialTheme.typography.bodyMedium,
            )
            Secondary(vm.t("View customer")) {
                vm.selected = c
                vm.screen = "detail"
            }
        }
    }
}

@Composable
fun Plan(vm: FieldViewModel) {
    val existing =
        vm.records("dayplan").find {
            it.text("date") == localDate() && it.text("ownerId") == vm.user.text("id")
        }
    if (existing != null) {
        FieldCard {
            Text(vm.t("Day plan submitted"), style = MaterialTheme.typography.titleLarge)
            Text(vm.names(existing.text("routeId")))
            Text(existing.text("workType"))
            Text(existing.text("notes"))
        }
        Secondary(vm.t("Edit today’s plan")) { vm.edit(existing) }
        Primary(vm.t("Today’s visits")) { vm.navigate("calls") }
    } else {
        Message("Choose your route and working type for ${localDate()}.")
        Primary(vm.t("Create day plan")) { vm.add("dayplan") }
        Text("Joint working and route selection are included in your plan.", color = Muted)
    }
}

private data class MoreItem(
    val route: String,
    val icon: String,
    val label: String,
    /** When set, the item is shown only if this module is readable. */
    val module: String? = null,
)

/** Same task-based grouping as the admin sidebar. */
private val moreGroups =
    listOf(
        "Today" to
            listOf(
                MoreItem("module/dcr", "file-text", "Daily call reports"),
                MoreItem("pending-reports", "clipboard-check", "Pending reporting dates"),
                MoreItem("reports", "chart-no-axes-combined", "My performance"),
            ),
        "Planning" to
            listOf(
                MoreItem("tour-month", "calendar-days", "Plan the month"),
                MoreItem("module/tourplan", "clipboard-list", "Tour plans", "tourplan"),
                MoreItem("module/dayplan", "sun", "Day plans", "dayplan"),
                MoreItem("module/target", "target", "Targets", "target"),
                MoreItem("module/campaign", "megaphone", "Campaigns", "campaign"),
                MoreItem("module/leave", "plane", "Leave", "leave"),
            ),
        "People & masters" to
            listOf(
                MoreItem("module/route", "route", "Routes", "route"),
                MoreItem("module/territory", "building", "Head quarters", "territory"),
                MoreItem("module/product", "pill", "Products", "product"),
                MoreItem("module/input", "package", "Promotional inputs", "input"),
            ),
        "Money & stock" to
            listOf(
                MoreItem("module/expense", "receipt", "Expenses", "expense"),
                MoreItem("module/sale", "shopping-cart", "Sales activity", "sale"),
                MoreItem("module/stockstatement", "file-spreadsheet", "Stock statements", "stockstatement"),
                MoreItem("stock", "package", "Stock balances"),
                MoreItem("module/challan", "truck", "Challan receipts", "challan"),
                MoreItem("module/sponsorship", "gift", "Sponsorship", "sponsorship"),
            ),
        "Field records" to
            listOf(
                MoreItem("module/rcpa", "clipboard-check", "RCPA", "rcpa"),
                MoreItem("module/reminder", "bell", "Call reminders", "reminder"),
                MoreItem("module/announcement", "message-square", "Head-office updates", "announcement"),
            ),
        "Account" to
            listOf(
                MoreItem("sync", "refresh-cw", "Sync center"),
                MoreItem("account", "settings", "Account & settings"),
                MoreItem("access", "shield-check", "My access"),
                MoreItem("help", "circle-help", "Help & support"),
            ),
    )

@Composable
fun More(vm: FieldViewModel) {
    val role =
        if (vm.user.text("role") == "rep") "Representative"
        else vm.user.text("role").replaceFirstChar { it.uppercase() }
    FieldCard(color = Navy) {
        Text(vm.user.text("name"), color = Color.White, style = MaterialTheme.typography.titleLarge)
        Text(vm.user.text("email"), color = OnNavy)
        Text(
            role + " · " + vm.boot?.optJSONObject("company")?.text("code").orEmpty(),
            color = Color(0xFFD9FF59),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
        )
    }
    val readable = vm.modules.map { it.text("key") }.toSet()
    moreGroups.forEach { (group, items) ->
        val shown = items.filter { it.module == null || it.module in readable }
        if (shown.isEmpty()) return@forEach
        Text(
            group.uppercase(),
            color = Subtle,
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.padding(start = 4.dp, top = 4.dp),
        )
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = Color.White,
            border = BorderStroke(1.dp, Line),
        ) {
            Column {
                shown.forEachIndexed { n, item ->
                    if (n > 0) HorizontalDivider(color = Line)
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable {
                                when (item.route) {
                                    "stock" -> {
                                        vm.navigate("stock")
                                        vm.screen = "module/inventory"
                                    }
                                    "access" -> vm.openAccess()
                                    else -> vm.navigate(item.route)
                                }
                            }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Surface(shape = RoundedCornerShape(10.dp), color = Soft) {
                            Box(Modifier.size(38.dp), contentAlignment = Alignment.Center) {
                                FieldIcon(item.icon, 22)
                            }
                        }
                        Text(
                            vm.t(item.label),
                            Modifier.weight(1f),
                            fontWeight = FontWeight.SemiBold,
                        )
                        FieldIcon("chevron-right", 20)
                    }
                }
            }
        }
    }
}
