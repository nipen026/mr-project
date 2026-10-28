package com.mrconnect.field

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject

private val Danger = Color(0xFFBC3F45)

/** M04: public request to reset access from the sign-in screen. */
@Composable
fun AccessHelp(vm: FieldViewModel) {
    var company by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    Text(vm.t("Reset access"), style = MaterialTheme.typography.headlineMedium)
    Text(
        vm.t("Your administrator verifies your identity before resetting access."),
        color = Muted,
    )
    Entry(vm.t("Company code"), company, { company = it }, true)
    Entry(vm.t("Employee ID / email"), email, { email = it }, true)
    Entry(vm.t("What do you need help with?"), reason, { reason = it }, lines = 3)
    Primary(vm.t("Send request"), !vm.busy && company.isNotBlank() && email.isNotBlank()) {
        vm.requestAccess(company, email, reason)
    }
    if (vm.accessReference.isNotEmpty())
        FieldCard(color = Soft) {
            Text(vm.t("Request reference"), color = Muted, style = MaterialTheme.typography.bodyMedium)
            Text(vm.accessReference, style = MaterialTheme.typography.titleLarge)
            Text(
                vm.t("Quote this reference when you contact your administrator."),
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    Secondary(vm.t("Back to sign-in")) {
        vm.accessReference = ""
        vm.navigate("login")
    }
}

private fun statusLabel(vm: FieldViewModel, status: String) =
    vm.t(
        when (status) {
            "in_progress" -> "In progress"
            "resolved" -> "Resolved"
            else -> "Open"
        }
    )

/** M64: help topics, administrator contact and the employee's own support requests. */
@Composable
fun HelpScreen(vm: FieldViewModel) {
    LaunchedEffect(Unit) { vm.loadSupport() }
    val data = vm.support
    var category by remember { mutableStateOf("other") }
    var subject by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    val ticketCount = data?.array("tickets")?.size ?: 0
    LaunchedEffect(ticketCount) {
        subject = ""
        body = ""
    }
    if (data == null) Message(vm.t("Loading…"))
    data?.optJSONObject("contact")?.let { c ->
        FieldCard(color = Navy) {
            Text(
                vm.t("Your administrator"),
                color = Color(0xFFD9FF59),
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(c.text("name"), color = Color.White, style = MaterialTheme.typography.titleLarge)
            Text(c.text("email"), color = Color(0xFFBED1D7))
        }
    }
    data?.array("topics")?.forEach { topic ->
        FieldCard {
            Text(topic.text("title"), fontWeight = FontWeight.Bold)
            Text(topic.text("body"), color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
    Text(vm.t("Raise a request"), style = MaterialTheme.typography.titleMedium)
    Choice(
        vm.t("Category"),
        category,
        listOf(
            "sync" to vm.t("Sync problem"),
            "location" to vm.t("Location or GPS"),
            "access" to vm.t("Access or password"),
            "report" to vm.t("Daily report"),
            "other" to vm.t("Something else"),
        ),
        { category = it.ifEmpty { "other" } },
        required = true,
    )
    Entry(vm.t("Subject"), subject, { subject = it }, true)
    Entry(vm.t("Describe the problem"), body, { body = it }, true, lines = 4)
    Primary(
        vm.t("Send request"),
        !vm.busy && subject.trim().length >= 3 && body.trim().length >= 5,
    ) {
        vm.createTicket(category, subject.trim(), body.trim(), "")
    }
    val tickets = data?.array("tickets") ?: emptyList()
    if (tickets.isNotEmpty()) Text(vm.t("Your requests"), style = MaterialTheme.typography.titleMedium)
    tickets.forEach { t ->
        FieldCard {
            Text(t.text("subject"), fontWeight = FontWeight.Bold)
            Text(
                t.text("code") + " · " + statusLabel(vm, t.text("status")),
                color = Brand,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(t.text("message"), color = Muted, style = MaterialTheme.typography.bodyMedium)
            if (t.text("response").isNotEmpty()) Message(t.text("response"))
        }
    }
}

/** M70: shown when the server refuses an action, and from "My access". */
@Composable
fun Restricted(vm: FieldViewModel) {
    LaunchedEffect(Unit) { vm.loadAccess() }
    val denied = vm.restrictedMessage.isNotEmpty()
    FieldCard(color = if (denied) Color(0xFFFDEEF0) else Soft) {
        Text(
            vm.t(if (denied) "Access restricted" else "Your access"),
            style = MaterialTheme.typography.titleLarge,
            color = if (denied) Danger else Ink,
        )
        Text(
            if (denied) vm.restrictedMessage
            else vm.t("These are the areas your role can open and change."),
            color = Ink,
        )
    }
    if (denied) Primary(vm.t("Request access"), !vm.busy) { vm.requestModuleAccess() }
    vm.access?.array("modules")?.forEach { m ->
        FieldCard {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(m.text("title"), Modifier.weight(1f), fontWeight = FontWeight.Bold)
                Text(
                    vm.t(
                        if (m.optBoolean("write")) "View & edit"
                        else if (m.optBoolean("read")) "View only" else "No access"
                    ),
                    color = Brand,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (m.text("reason").isNotEmpty())
                Text(m.text("reason"), color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
    Secondary(vm.t("Back to Today")) { vm.navigate("home") }
}

/** M76: dates with calls that still need a daily report. */
@Composable
fun PendingReports(vm: FieldViewModel) {
    LaunchedEffect(Unit) { vm.loadPending() }
    val data = vm.pendingReports
    if (data == null) {
        Message(vm.t("Loading…"))
        return
    }
    val s = data.optJSONObject("summary") ?: JSONObject()
    FieldCard(color = Navy) {
        Text(
            vm.t("Pending reporting dates"),
            color = Color.White,
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            "${s.optInt("total")} · overdue ${s.optInt("overdue")} · due today ${s.optInt("dueToday")} · returned ${s.optInt("returned")}",
            color = Color(0xFFBED1D7),
        )
        Text(
            "Reports must be submitted within ${data.optInt("deadlineDays")} days of the visit date.",
            color = Color(0xFFBED1D7),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
    val items = data.array("items")
    if (items.isEmpty()) Message(vm.t("All reports are up to date."))
    items.forEach { item ->
        val left = item.optInt("daysLeft")
        val overdue = item.optBoolean("overdue")
        FieldCard {
            Text(item.text("date"), style = MaterialTheme.typography.titleMedium)
            Text(
                "${item.optInt("visits")} visits · POB " + rupees(item.optDouble("pob", 0.0)),
                color = Muted,
            )
            Text(
                if (overdue) "Overdue by ${-left} day" + (if (-left == 1) "" else "s")
                else if (left == 0) vm.t("Due today") else "$left days left",
                color = if (overdue) Danger else Brand,
                fontWeight = FontWeight.Bold,
            )
            if (item.optInt("unverified") > 0)
                Text(
                    "${item.optInt("unverified")} call(s) need location review",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            if (item.text("reportStatus") == "returned") Message(vm.t("Returned for correction"), true)
            Primary(
                vm.t(if (item.text("reportStatus").isEmpty()) "Prepare report" else "Continue report"),
                !vm.busy,
            ) {
                vm.prepareReport(item.text("date"))
            }
            if (overdue) Secondary(vm.t("Ask for help")) { vm.navigate("help") }
        }
    }
}

/** M57: doctors taking part in a campaign and how far each has been covered. */
@Composable
fun CampaignDoctors(vm: FieldViewModel) {
    LaunchedEffect(vm.campaignId) { vm.loadCampaignDoctors() }
    val data = vm.campaignDoctors
    if (data == null) {
        Message(vm.t("Loading…"))
        return
    }
    val c = data.optJSONObject("campaign") ?: JSONObject()
    val s = data.optJSONObject("summary") ?: JSONObject()
    FieldCard(color = Navy) {
        Text(c.text("name"), color = Color.White, style = MaterialTheme.typography.titleLarge)
        Text(c.text("fromDate") + " → " + c.text("toDate"), color = Color(0xFFBED1D7))
        Text(c.text("description"), color = Color(0xFFBED1D7), style = MaterialTheme.typography.bodyMedium)
    }
    FieldCard {
        Text(
            "${s.optInt("covered")} / ${s.optInt("total")} " + vm.t("covered"),
            style = MaterialTheme.typography.headlineMedium,
        )
        if (s.optInt("hidden") > 0)
            Text(
                "${s.optInt("hidden")} participating customers belong to other teams.",
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )
    }
    data.array("items").forEach { d ->
        FieldCard {
            Text(d.text("name"), style = MaterialTheme.typography.titleMedium)
            Text(
                listOf(d.text("type"), d.text("specialty"), d.text("area"))
                    .filter { it.isNotEmpty() }
                    .joinToString(" · "),
                color = Muted,
            )
            Text(d.text("representative"), color = Muted, style = MaterialTheme.typography.bodyMedium)
            Text(
                if (d.text("status") == "covered")
                    "${d.optInt("calls")} call(s) · last visit ${d.text("lastVisit")}"
                else vm.t("Not yet visited"),
                color = if (d.text("status") == "covered") Brand else Danger,
                fontWeight = FontWeight.Bold,
            )
            if (d.optBoolean("canRecord")) Secondary(vm.t("Record call")) { vm.startCall(d.text("id")) }
        }
    }
}

/** M33: clinic, residence and any additional addresses for a customer. */
@Composable
fun CustomerAddresses(vm: FieldViewModel) {
    val customer = vm.addressCustomer ?: return
    LaunchedEffect(customer.text("id")) { vm.loadAddresses() }
    val data = vm.addresses
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    var removing by remember { mutableStateOf<JSONObject?>(null) }
    Text(customer.text("name"), style = MaterialTheme.typography.titleLarge)
    if (data == null) {
        Message(vm.t("Loading…"))
        return
    }
    Text(vm.t("Saved on the customer record"), style = MaterialTheme.typography.titleMedium)
    data.array("master").forEach { a ->
        FieldCard {
            Text(a.text("label"), fontWeight = FontWeight.Bold)
            Text(a.text("line"))
            Text(
                listOf(a.text("city"), a.text("state"), a.text("pinCode"))
                    .filter { it.isNotEmpty() }
                    .joinToString(" · "),
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
    val canEdit = data.optBoolean("canEdit")
    Text(vm.t("Additional addresses"), style = MaterialTheme.typography.titleMedium)
    data.array("items").forEach { a ->
        FieldCard {
            Text(a.text("label"), fontWeight = FontWeight.Bold)
            Text(a.text("line"))
            Text(
                listOf(a.text("city"), a.text("state"), a.text("pinCode"))
                    .filter { it.isNotEmpty() }
                    .joinToString(" · "),
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )
            if (canEdit)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) {
                        Secondary(vm.t("Edit")) {
                            editing = a
                            adding = false
                        }
                    }
                    Box(Modifier.weight(1f)) { Secondary(vm.t("Remove")) { removing = a } }
                }
        }
    }
    if (canEdit && !adding && editing == null)
        Primary(vm.t("Add address")) { adding = true }
    if (adding || editing != null)
        AddressForm(vm, customer.text("id"), editing) {
            adding = false
            editing = null
        }
    removing?.let { a ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text(vm.t("Remove") + " " + a.text("label") + "?") },
            text = { Text(a.text("line")) },
            confirmButton = {
                TextButton(
                    onClick = {
                        removing = null
                        vm.removeAddress(a.text("id"))
                    }
                ) {
                    Text(vm.t("Remove"))
                }
            },
            dismissButton = { TextButton(onClick = { removing = null }) { Text(vm.t("Cancel")) } },
        )
    }
}

@Composable
private fun AddressForm(
    vm: FieldViewModel,
    customerId: String,
    existing: JSONObject?,
    onDone: () -> Unit,
) {
    var label by remember(existing) { mutableStateOf(existing?.text("label") ?: "") }
    var line by remember(existing) { mutableStateOf(existing?.text("line") ?: "") }
    var city by remember(existing) { mutableStateOf(existing?.text("city") ?: "") }
    var state by remember(existing) { mutableStateOf(existing?.text("state") ?: "") }
    var pin by remember(existing) { mutableStateOf(existing?.text("pinCode") ?: "") }
    val valid =
        label.trim().length >= 2 &&
            line.trim().length >= 5 &&
            (pin.isEmpty() || Regex("\\d{6}").matches(pin))
    FieldCard {
        Entry(vm.t("Label"), label, { label = it }, true)
        Entry(vm.t("Address"), line, { line = it }, true, lines = 3)
        Entry(vm.t("City"), city, { city = it })
        Entry(vm.t("State"), state, { state = it })
        Entry(vm.t("PIN code"), pin, { pin = it.filter { c -> c.isDigit() }.take(6) }, number = true)
        Primary(vm.t("Save address"), valid && !vm.busy) {
            vm.saveAddress(
                customerId,
                existing,
                label.trim(),
                line.trim(),
                city.trim(),
                state.trim(),
                pin,
                onDone,
            )
        }
        Secondary(vm.t("Cancel"), onClick = onDone)
    }
}
