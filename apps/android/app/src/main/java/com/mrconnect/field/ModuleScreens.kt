package com.mrconnect.field

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.*

@Composable
fun ModuleList(vm: FieldViewModel, kind: String) {
    val mod = vm.modules.find { it.text("key") == kind }
    var q by remember(kind) { mutableStateOf("") }
    val admin = vm.user.text("role") == "admin"
    if (kind == "inventory") {
        val entries = vm.boot?.array("inventory") ?: emptyList()
        if (entries.isEmpty())
            Message("No stock balances yet. Acknowledge your challan receipts to receive stock.")
        entries.forEach {
            FieldCard {
                Text(it.text("name"), fontWeight = FontWeight.Bold)
                Text(
                    it.text("itemType") + " · " + it.optInt("quantity") + " available",
                    color = Brand,
                )
            }
        }
        return
    }
    if (kind == "dcr") Primary("Prepare daily report") { vm.navigate("dcr") }
    if (kind == "tourplan") Primary("Plan the whole month") { vm.navigate("tour-month") }
    if (kind == "expense") AutoExpenseCard(vm)
    if (mod != null && (!mod.optBoolean("readOnlyForRep") && !mod.optBoolean("adminOnly") || admin))
        if (kind == "tourplan") Secondary("Add " + mod.text("singular").lowercase()) { vm.add(kind) }
        else Primary("Add " + mod.text("singular").lowercase()) { vm.add(kind) }
    Entry("Search records", q, { q = it })
    val rows = vm.records(kind).filter { it.toString().contains(q, true) }
    if (rows.isEmpty())
        FieldCard {
            Text("No records yet", style = MaterialTheme.typography.titleMedium)
            Text("New submissions and saved records will appear here.", color = Muted)
        }
    rows.take(100).forEach { r ->
        FieldCard {
            Text(
                r.text(
                    "name",
                    r.text(
                        "title",
                        r.text("date", r.text("fromDate", mod?.text("singular") ?: kind)),
                    ),
                ),
                style = MaterialTheme.typography.titleMedium,
            )
            if (r.has("ownerName")) Text(r.text("ownerName"), color = Muted)
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StatusBadge(r.text("status"))
                if (r.optBoolean("queued"))
                    Text("Waiting to sync", color = Muted, style = MaterialTheme.typography.bodyMedium)
            }
            val heading =
                r.text(
                    "name",
                    r.text("title", r.text("date", r.text("fromDate", mod?.text("singular") ?: kind))),
                )
            (mod?.optJSONArray("columns") ?: JSONArray().put("visits").put("pob")).let { cols ->
                (0 until cols.length())
                    .map { cols.getString(it) }
                    .filter { key ->
                        r.has(key) &&
                            key !in listOf("name", "status", "ownerName") &&
                            vm.names(r.text(key)) != heading
                    }
                    .take(3)
                    .forEach { key ->
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                humanize(key) + ":",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Subtle,
                            )
                            Text(
                                vm.names(r.text(key)),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Ink,
                            )
                        }
                    }
            }
            Secondary("View details") {
                vm.selected = r
                vm.screen = "detail"
            }
        }
    }
    if (rows.size > 100)
        Message("Showing the first 100 records. Narrow your search to find older records.")
}

@Composable
fun RecordEditor(vm: FieldViewModel) {
    val mod = vm.modules.find { it.text("key") == vm.formKind } ?: return
    val initial = vm.formInitial
    val fields = mod.array("fields")
    val values =
        rememberSaveable(vm.formKind, initial?.text("id"), saver = StringMapSaver) {
            mutableStateMapOf<String, String>().apply {
                fields.forEach { f ->
                    val key = f.text("key")
                    put(
                        key,
                        initial?.text(key)
                            ?: when {
                                key == "assignedTo" || key == "recipientId" -> vm.user.text("id")
                                f.text("type") == "date" -> localDate()
                                key == "completed" -> "No"
                                else -> ""
                            },
                    )
                }
            }
        }
    val multiples =
        rememberSaveable(vm.formKind, initial?.text("id"), saver = StringListMapSaver) {
            mutableStateMapOf<String, List<String>>().apply {
                fields
                    .filter { it.text("type") == "multireference" }
                    .forEach { f ->
                        val a = initial?.optJSONArray(f.text("key"))
                        put(
                            f.text("key"),
                            a?.let { (0 until it.length()).map { i -> it.getString(i) } }
                                ?: emptyList(),
                        )
                    }
            }
        }
    val lineValues =
        rememberSaveable(vm.formKind, initial?.text("id"), saver = StringMapSaver) {
            mutableStateMapOf<String, String>().apply {
                fields
                    .filter { it.text("type") == "lines" }
                    .forEach { f ->
                        val a = initial?.optJSONArray(f.text("key")) ?: JSONArray()
                        for (i in 0 until a.length()) {
                            val row = a.getJSONObject(i)
                            f.array("lineFields").forEach { lf ->
                                val n = row.optInt(lf.text("key"))
                                if (n > 0)
                                    put(
                                        f.text("key") + "|" + row.text("itemId") + "|" + lf.text("key"),
                                        n.toString(),
                                    )
                            }
                        }
                    }
            }
        }
    val context = LocalContext.current
    var uploadKey by remember { mutableStateOf("") }
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null)
                vm.work {
                    val bytes =
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                            ?: error("Cannot read file")
                    var name = "receipt"
                    context.contentResolver.query(uri, null, null, null, null)?.use {
                        if (it.moveToFirst()) {
                            val c = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            if (c >= 0) name = it.getString(c)
                        }
                    }
                    val result =
                        vm.repo.upload(
                            bytes,
                            name,
                            context.contentResolver.getType(uri) ?: "application/octet-stream",
                        )
                    values[uploadKey] = result.getString("id")
                    vm.message =
                        if (result.optBoolean("queued")) "Attachment saved offline"
                        else "Attachment uploaded"
                }
        }
    vm.conflictServer?.let { server ->
        Message("Review the differences before saving. The form below contains your saved values.")
        fields
            .filter { f ->
                val key = f.text("key")
                server.text(key) != initial?.text(key)
            }
            .forEach { f ->
                FieldCard {
                    Text(f.text("label"), style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Current on server: " + vm.names(server.text(f.text("key"))),
                        color = Muted,
                    )
                    Text(
                        "Saved on this phone: " + vm.names(initial?.text(f.text("key")) ?: ""),
                        color = Brand,
                    )
                }
            }
    }
    Text(mod.text("singular"), style = MaterialTheme.typography.titleLarge)
    Text(
        "Fields marked * are required. All values are checked again by your company server.",
        color = Muted,
        style = MaterialTheme.typography.bodyMedium,
    )
    fields.forEach { f ->
        val key = f.text("key")
        val type = f.text("type")
        val value = values[key] ?: ""
        when (type) {
            "reference" -> {
                val opts =
                    if (f.text("ref") == "users")
                        vm.boot
                            ?.array("users")
                            ?.filter { it.optBoolean("active") }
                            ?.map { it.text("id") to it.text("name") } ?: emptyList()
                    else
                        vm.records(f.text("ref")).map {
                            it.text("id") to it.text("name", it.text("title"))
                        }
                Choice(f.text("label"), value, opts, { values[key] = it }, f.optBoolean("required"))
            }
            "select" -> {
                val a = f.optJSONArray("options") ?: JSONArray()
                Choice(
                    f.text("label"),
                    value,
                    (0 until a.length()).map { a.getString(it) to a.getString(it) },
                    { values[key] = it },
                    f.optBoolean("required"),
                )
            }
            "lines" -> {
                Text(f.text("label"), color = Muted)
                vm.records(f.text("ref")).forEach { p ->
                    FieldCard {
                        Text(p.text("name"), style = MaterialTheme.typography.titleMedium)
                        f.array("lineFields").forEach { lf ->
                            val k = key + "|" + p.text("id") + "|" + lf.text("key")
                            Entry(lf.text("label"), lineValues[k] ?: "", { lineValues[k] = it }, number = true)
                        }
                    }
                }
            }
            "multireference" -> {
                Text(f.text("label"), color = Muted)
                vm.records(f.text("ref")).forEach { r ->
                    val checked = multiples[key]?.contains(r.text("id")) == true
                    Row {
                        Checkbox(
                            checked,
                            onCheckedChange = { on ->
                                multiples[key] =
                                    if (on) (multiples[key] ?: emptyList()) + r.text("id")
                                    else (multiples[key] ?: emptyList()) - r.text("id")
                            },
                        )
                        Text(r.text("name", r.text("title")), Modifier.padding(top = 12.dp))
                    }
                }
            }
            "file" -> {
                Text(f.text("label"), color = Muted)
                Secondary(if (value.isEmpty()) "Attach PDF / image" else "Replace attachment") {
                    uploadKey = key
                    picker.launch(arrayOf("application/pdf", "image/jpeg", "image/png"))
                }
                if (value.isNotEmpty())
                    Text(
                        "Attachment saved",
                        color = Brand,
                        style = MaterialTheme.typography.bodyMedium,
                    )
            }
            else ->
                Entry(
                    f.text("label"),
                    value,
                    { values[key] = it },
                    f.optBoolean("required"),
                    number = type == "number",
                    lines = if (type == "textarea") 3 else 1,
                )
        }
        if (f.text("hint").isNotEmpty())
            Text(f.text("hint"), style = MaterialTheme.typography.bodyMedium, color = Muted)
    }
    Primary(
        if (vm.formKind == "dayplan") "Submit day plan"
        else "Save " + mod.text("singular").lowercase(),
        !vm.busy,
    ) {
        try {
            val data = JSONObject()
            fields.forEach { f ->
                val key = f.text("key")
                val v = values[key] ?: ""
                require(!f.optBoolean("required") || v.isNotBlank()) {
                    f.text("label") + " is required"
                }
                if (f.text("type") == "multireference")
                    data.put(key, JSONArray(multiples[key] ?: emptyList<String>()))
                else if (f.text("type") == "lines") {
                    val rows = JSONArray()
                    vm.records(f.text("ref")).forEach { p ->
                        val row = JSONObject().put("itemId", p.text("id"))
                        var any = false
                        f.array("lineFields").forEach { lf ->
                            val raw = lineValues[key + "|" + p.text("id") + "|" + lf.text("key")] ?: ""
                            val n = if (raw.isBlank()) 0 else raw.toIntOrNull()
                                ?: error(lf.text("label") + " must be a whole number")
                            require(n >= 0) { lf.text("label") + " cannot be negative" }
                            if (n > 0) any = true
                            row.put(lf.text("key"), n)
                        }
                        if (any) rows.put(row)
                    }
                    data.put(key, rows)
                }
                else if (v.isNotBlank()) {
                    if (f.text("type") == "number") {
                        val n = v.toDoubleOrNull() ?: error(f.text("label") + " must be a number")
                        require(
                            n >= f.optDouble("min", -Double.MAX_VALUE) &&
                                n <= f.optDouble("max", Double.MAX_VALUE)
                        ) {
                            f.text("label") + " is outside the allowed range"
                        }
                        data.put(key, n)
                    } else data.put(key, v.trim())
                }
            }
            vm.save(vm.formKind, data, initial)
        } catch (e: Exception) {
            vm.error = e.message ?: "Check the fields"
        }
    }
    Secondary("Cancel") { vm.navigate("module/" + vm.formKind) }
}

@Composable
fun Detail(vm: FieldViewModel) {
    val r = vm.selected ?: return
    val kind = r.text("kind")
    val mod = vm.modules.find { it.text("key") == kind }
    var confirming by remember { mutableStateOf(false) }
    var qty by remember(r) { mutableStateOf(r.optInt("quantity").toString()) }
    var notes by remember { mutableStateOf("") }
    Text(
        r.text("name", r.text("title", r.text("date", "Record detail"))),
        style = MaterialTheme.typography.titleLarge,
    )
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusBadge(r.text("status"))
        if (r.optBoolean("queued"))
            Text("Pending sync", color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
    val fields =
        mod?.array("fields")
            ?: r.keys()
                .asSequence()
                .filter {
                    it !in
                        listOf(
                            "id",
                            "ownerId",
                            "ownerName",
                            "version",
                            "createdAt",
                            "updatedAt",
                            "decisions",
                            "status",
                            "kind",
                        )
                }
                .map { JSONObject().put("key", it).put("label", it) }
                .toList()
    fields.forEach { f ->
        val key = f.text("key")
        if (r.has(key)) {
            FieldCard {
                Text(f.text("label"), color = Muted, style = MaterialTheme.typography.bodyMedium)
                val value = r.opt(key)
                when {
                    f.text("type") == "file" && r.text(key).isNotEmpty() ->
                        Secondary("Open attachment") { vm.viewAttachment(r.text(key)) }
                    value is JSONArray ->
                        value.let { a ->
                            (0 until a.length()).forEach { i ->
                                val x = a.opt(i)
                                Text(
                                    if (x is JSONObject && x.has("closing"))
                                        vm.names(x.text("itemId")) +
                                            " · opening " + x.optInt("opening") +
                                            " · receipts " + x.optInt("receipts") +
                                            " · sales " + x.optInt("sales") +
                                            (if (x.optInt("carriedIn") > 0)
                                                " · moved in " + x.optInt("carriedIn")
                                            else "") +
                                            " · closing " + x.optInt("closing")
                                    else if (x is JSONObject)
                                        vm.names(x.text("itemId")) + " × " + x.optInt("quantity")
                                    else vm.names(x.toString())
                                )
                            }
                        }
                    else -> Text(vm.names(r.text(key)))
                }
            }
        }
    }
    if (kind == "customer" && r.text("assignedTo") == vm.user.text("id")) {
        Primary("Record " + r.text("type").lowercase() + " call") {
            val plan =
                vm.records("dayplan").find {
                    it.text("date") == localDate() && it.text("ownerId") == vm.user.text("id")
                }
            if (plan == null) {
                vm.error = "Submit today’s day plan before recording a call"
            } else vm.screen = "visit"
        }
        Secondary("Set a call reminder") { vm.add("reminder") }
    }
    if (kind == "customer") Secondary(vm.t("Addresses")) { vm.openAddresses(r) }
    if (kind == "campaign") Secondary(vm.t("Campaign doctors")) { vm.openCampaignDoctors(r.text("id")) }
    if (kind == "product" && r.text("contentId").isNotEmpty())
        Primary("Open product presentation") { vm.viewAttachment(r.text("contentId")) }
    r.array("decisions").forEach { d ->
        Message(d.text("actorName") + " · " + d.text("action") + "\n" + d.text("reason"))
    }
    val writable =
        r.text("status") in listOf("active", "draft", "returned") &&
            !r.optBoolean("queued") &&
            (r.text("ownerId") == vm.user.text("id") || vm.user.text("role") == "admin")
    if (
        writable &&
            mod != null &&
            (!mod.optBoolean("readOnlyForRep") || vm.user.text("role") == "admin")
    ) {
        Secondary("Edit record") { vm.edit(r) }
        Secondary("Remove record") { confirming = true }
    }
    if (
        (mod?.optBoolean("approvable") == true || kind == "dcr") &&
            r.text("status") in listOf("draft", "returned")
    )
        Primary("Submit for review", !vm.busy) { vm.submit(r) }
    if (
        kind == "stockstatement" &&
            r.text("ownerId") == vm.user.text("id") &&
            r.text("status") in listOf("draft", "returned") &&
            !r.optBoolean("queued")
    )
        Secondary("Move sales to next month", !vm.busy) { vm.moveSales(r) }
    if (
        kind == "challan" && r.text("ownerId") == vm.user.text("id") && r.text("status") == "active"
    ) {
        Entry("Received quantity", qty, { qty = it }, number = true)
        Entry("Discrepancy notes", notes, { notes = it }, lines = 3)
        Primary("Acknowledge challan") { vm.acknowledge(r, qty.toIntOrNull() ?: -1, notes) }
    }
    if (confirming)
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Remove this record?") },
            text = {
                Text(
                    "Referenced records remain protected. This action is recorded in the audit log."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirming = false
                        vm.delete(r)
                    }
                ) {
                    Text("Remove")
                }
            },
            dismissButton = { TextButton(onClick = { confirming = false }) { Text("Cancel") } },
        )
}

@Composable
fun DailyReport(vm: FieldViewModel) {
    var date by rememberSaveable(vm.reportDate) { mutableStateOf(vm.reportDate.ifEmpty { localDate() }) }
    var remarks by rememberSaveable { mutableStateOf("") }
    Entry("Reporting date", date, { date = it }, true)
    val calls = vm.records("visit").filter { it.text("date") == date }
    val expenses = vm.records("expense").filter { it.text("date") == date }
    FieldCard {
        Text("Daily summary", style = MaterialTheme.typography.titleMedium)
        Text("${calls.size} customer visits")
        Text("POB: " + rupees(calls.sumOf { it.optDouble("orderTotal", 0.0) }))
        Text("Expenses: " + rupees(expenses.sumOf { it.optDouble("amount", 0.0) }))
        Text("Review every call and expense before submitting.", color = Muted)
    }
    calls.forEach {
        FieldCard {
            Text(it.text("customerName", vm.names(it.text("customerId"))))
            Text(
                if (it.optBoolean("verified")) "GPS verified" else "Location needs review",
                color = Brand,
            )
        }
    }
    Entry("Daily remarks", remarks, { remarks = it }, lines = 3)
    Primary("Prepare report for review", !vm.busy) { vm.saveDcr(date, remarks) }
    Message(
        "A submitted daily report locks its field activity. Your manager can return it for correction."
    )
}

@Composable
fun AutoExpenseCard(vm: FieldViewModel) {
    var date by rememberSaveable { mutableStateOf(localDate()) }
    FieldCard {
        Text("Auto-calculate TA/DA", style = MaterialTheme.typography.titleMedium)
        Text(
            "Uses your day plan route and the company rates. Creates draft claims you can review.",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Entry("Date (YYYY-MM-DD)", date, { date = it })
        Secondary("Calculate", !vm.busy) { vm.loadExpenseSuggestion(date) }
        vm.expenseSuggestion?.let { s ->
            if (s.text("reason").isNotEmpty()) Message(s.text("reason"))
            else {
                val lines = s.array("lines")
                lines.forEach { l ->
                    Text(
                        l.text("category") + ": " + rupees(l.optDouble("amount")) + "\n" + l.text("remarks"),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Text("Total: " + rupees(s.optDouble("total")), color = Brand)
                val claimedArray = s.optJSONArray("claimed") ?: JSONArray()
                val claimed = (0 until claimedArray.length()).map { claimedArray.getString(it) }
                if (lines.all { it.text("category") in claimed })
                    Message("TA and DA are already claimed for this date.")
                else Primary("Create draft claims", !vm.busy) { vm.autoExpenses(date) }
            }
        }
    }
}

@Composable
fun TourMonth(vm: FieldViewModel) {
    val current = localDate().take(7)
    val following = java.time.YearMonth.parse(current).plusMonths(1).toString()
    var month by rememberSaveable { mutableStateOf(following) }
    var workType by rememberSaveable { mutableStateOf("Field work") }
    var defaultRoute by rememberSaveable { mutableStateOf("") }
    val routes = vm.records("route").map { it.text("id") to it.text("name") }
    val picks = rememberSaveable(month, saver = StringMapSaver) { mutableStateMapOf<String, String>() }
    val types = rememberSaveable(month, saver = StringMapSaver) { mutableStateMapOf<String, String>() }
    val partners = rememberSaveable(month, saver = StringMapSaver) { mutableStateMapOf<String, String>() }
    val workTypes = listOf("Field work", "Joint work", "Meeting", "Training", "Administration")
    val people =
        vm.boot?.array("users")
            ?.filter { it.optBoolean("active") && it.text("id") != vm.user.text("id") }
            ?.map { it.text("id") to it.text("name") } ?: emptyList()
    LaunchedEffect(month) { vm.loadTourMonth(month) }
    val grid = vm.tourGrid
    LaunchedEffect(grid) {
        grid?.array("days")?.forEach { d ->
            val date = d.text("date")
            val rec = d.optJSONObject("record")
            if (rec != null && picks[date] == null && rec.text("routeId").isNotEmpty())
                picks[date] = rec.text("routeId")
            if (rec != null && types[date] == null && rec.text("workType").isNotEmpty())
                types[date] = rec.text("workType")
            if (rec != null && partners[date] == null && rec.text("jointWith").isNotEmpty())
                partners[date] = rec.text("jointWith")
        }
    }
    Choice("Month", month, listOf(current to current, following to following), { month = it })
    Choice(
        "Default working type",
        workType,
        workTypes.map { it to it },
        { workType = it },
    )
    Choice("Route for all working days", defaultRoute, routes, { defaultRoute = it })
    if (grid == null) {
        SkeletonCards(3)
        return
    }
    val days = grid.array("days")
    Secondary("Apply route and type to every open working day", defaultRoute.isNotEmpty()) {
        days.forEach { d ->
            val st = d.optJSONObject("record")?.text("status") ?: ""
            if (!d.optBoolean("weeklyOff") && st !in listOf("pending", "approved")) {
                picks[d.text("date")] = defaultRoute
                types[d.text("date")] = workType
            }
        }
    }
    val names = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
    days.forEach { d ->
        val date = d.text("date")
        val rec = d.optJSONObject("record")
        val locked = rec != null && rec.text("status") in listOf("pending", "approved")
        FieldCard {
            Text(date + " · " + names[d.optInt("weekday")], style = MaterialTheme.typography.titleMedium)
            when {
                d.optBoolean("weeklyOff") -> Text("Weekly off", color = Muted)
                locked ->
                    Text(
                        rec!!.text("status") + " · " + vm.names(rec.text("routeId")),
                        color = Brand,
                    )
                else -> {
                    Choice(
                        "Working type",
                        types[date] ?: workType,
                        workTypes.map { it to it },
                        { types[date] = it },
                    )
                    Choice("Route", picks[date] ?: "", routes, { picks[date] = it })
                    if ((types[date] ?: workType) == "Joint work")
                        Choice(
                            "Work with",
                            partners[date] ?: "",
                            people,
                            { partners[date] = it },
                        )
                }
            }
        }
    }
    fun body(submit: Boolean): JSONArray {
        val out = JSONArray()
        days.forEach { d ->
            val st = d.optJSONObject("record")?.text("status") ?: ""
            val date = d.text("date")
            val route = picks[date] ?: ""
            if (!d.optBoolean("weeklyOff") && st !in listOf("pending", "approved") && route.isNotEmpty())
                out.put(
                    JSONObject()
                        .put("date", date)
                        .put("routeId", route)
                        .put("workType", types[date] ?: workType)
                        .apply {
                            val w = partners[date] ?: ""
                            if ((types[date] ?: workType) == "Joint work" && w.isNotEmpty())
                                put("jointWith", w)
                        }
                )
        }
        return out
    }
    Secondary("Save draft", !vm.busy) { vm.saveTourMonth(month, body(false), false) }
    Primary("Submit month for approval", !vm.busy) { vm.saveTourMonth(month, body(true), true) }
    Message(
        "Every working day needs a route before the month can be submitted. Weekly offs are added for you. Choose a different working type on any day, and a partner for joint work."
    )
}
