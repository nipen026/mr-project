import { Service, day, now, today } from "./service.ts";
import { Tracking } from "./tracking.ts";
import { assert } from "./auth.ts";
import { report, reportNames } from "./reports.ts";
import {
  moduleByKey,
  modules,
  type User,
} from "../../../packages/shared/src/index.ts";
export const analyticsTypes = [
  "productivity",
  "deviations",
  "missed-coverage",
  "product-reach",
] as const;
const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0;
const sum = (rows: any[], pick: (r: any) => number) =>
  rows.reduce((a, r) => a + (pick(r) || 0), 0);
const top = <T>(rows: T[], by: (r: T) => number, n = 8) =>
  [...rows].sort((a, b) => by(b) - by(a)).slice(0, n);
export class Insights {
  constructor(
    private s: Service,
    private tracking: Tracking,
  ) {}
  private range(q: Record<string, any>, fallbackToMonth = true) {
    const to = q.to ? day(q.to) : today();
    const from = q.from
      ? day(q.from)
      : fallbackToMonth
        ? to.slice(0, 7) + "-01"
        : undefined;
    assert(!from || from <= to, 400, "From date must not be after To date");
    return { from, to };
  }
  private names(u: User) {
    const out = new Map<string, string>();
    for (const row of this.s.store.all(
      "SELECT id,data FROM records WHERE tenant_id=? AND deleted=0",
      u.tenantId,
    )) {
      const d = JSON.parse(row.data);
      const name = d.name || d.title;
      if (name) out.set(row.id, name);
    }
    for (const row of this.s.store.all(
      "SELECT id,name FROM users WHERE tenant_id=?",
      u.tenantId,
    ))
      out.set(row.id, row.name);
    return out;
  }
  // ---- A43 Export center -------------------------------------------------
  private datasets(u: User) {
    const reports = reportNames
      .filter((n) => n !== "audit" || u.role === "admin")
      .map((key) => ({
        key: "report:" + key,
        group: "Reports",
        title: key.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase()),
        description: "Calculated report rows for the selected date range.",
      }));
    const records = [
      ...modules.filter((m) => !m.adminOnly || u.role === "admin"),
    ].map((m) => ({
      key: "records:" + m.key,
      group: "Records",
      title: m.title,
      description: "Every permitted " + m.singular.toLowerCase() + " record.",
    }));
    return [
      ...reports,
      {
        key: "records:visit",
        group: "Records",
        title: "Customer calls",
        description: "Captured visits with GPS verification outcome.",
      },
      {
        key: "records:dcr",
        group: "Records",
        title: "Daily call reports",
        description: "Submitted and draft daily reports.",
      },
      ...records,
    ];
  }
  exportRows(u: User, key: string, q: Record<string, any>) {
    const [group, name] = key.split(":");
    const { from, to } = this.range(q, false);
    const query = { ...q, from, to };
    if (
      group === "report" &&
      (reportNames as readonly string[]).includes(name)
    ) {
      assert(
        name !== "audit" || u.role === "admin",
        403,
        "Administrator access required",
      );
      return report(this.s, u, name, query)!;
    }
    assert(group === "records", 404, "Export not found");
    const names = this.names(u);
    const resolve = (v: any): any =>
      typeof v === "string" && names.has(v)
        ? names.get(v)
        : Array.isArray(v)
          ? v.map(resolve).join("; ")
          : v;
    if (name === "visit")
      return this.s.list(u, "visit", query).map((v) => ({
        date: v.date,
        representative: v.ownerName,
        customer: v.customerName,
        type: v.customerType,
        outcome: v.outcome,
        locationVerified: v.verified ? "Yes" : "No",
        distanceMeters: v.distanceMeters ?? "",
        exceptionReason: v.exceptionReason || "",
        pob: v.orderTotal,
      }));
    if (name === "dcr")
      return this.s.list(u, "dcr", query).map((r) => ({
        date: r.date,
        representative: r.ownerName,
        status: r.status,
        visits: r.visits ?? "",
        pob: r.pob ?? "",
        remarks: r.remarks || "",
      }));
    const mod = moduleByKey[name];
    assert(mod, 404, "Export not found");
    assert(
      !mod.adminOnly || u.role === "admin",
      403,
      "Administrator access required",
    );
    return this.s.list(u, name, query).map((r) => ({
      ...Object.fromEntries(mod.columns.map((k) => [k, resolve(r[k])])),
      status: r.status,
      owner: r.ownerName,
    }));
  }
  exportCatalog(u: User, q: Record<string, any>) {
    const { from, to } = this.range(q);
    const items = this.datasets(u).map((d) => ({
      ...d,
      rows: this.exportRows(u, d.key, { from, to }).length,
    }));
    const history = this.s.store
      .all(
        "SELECT a.entity_id AS dataset,a.details,a.created_at AS at,x.name AS actor FROM audit a JOIN users x ON x.id=a.actor_id WHERE a.tenant_id=? AND a.action='export.downloaded' ORDER BY a.created_at DESC LIMIT 100",
        u.tenantId,
      )
      .filter((h) => u.role === "admin" || h.actor === u.name)
      .slice(0, 15)
      .map((h) => ({ ...h, details: JSON.parse(h.details) }));
    return { from, to, items, history };
  }
  recordExport(u: User, key: string, q: Record<string, any>, rows: number) {
    this.s.audit(u, "export.downloaded", key, {
      from: q.from || null,
      to: q.to || null,
      rows,
    });
  }
  // ---- A30 / A31 POB orders ---------------------------------------------
  private orderNumbers(u: User) {
    const numbers = new Map<string, string>();
    let n = 0;
    for (const row of this.s.store.all(
      "SELECT id,data FROM records WHERE tenant_id=? AND kind='visit' AND deleted=0 ORDER BY created_at,id",
      u.tenantId,
    ))
      if (JSON.parse(row.data).orderLines?.length)
        numbers.set(row.id, "POB-" + String(++n).padStart(4, "0"));
    return numbers;
  }
  orders(u: User, q: Record<string, any>) {
    const { from, to } = this.range(q);
    const numbers = this.orderNumbers(u);
    const needle = String(q.q || "")
      .trim()
      .toLowerCase();
    const items = this.s
      .list(u, "visit", { from, to, ownerId: q.ownerId })
      .filter((v) => numbers.has(v.id))
      .map((v) => ({
        id: v.id,
        number: numbers.get(v.id)!,
        date: v.date,
        ownerId: v.ownerId,
        ownerName: v.ownerName,
        customerId: v.customerId,
        customerName: v.customerName,
        customerType: v.customerType,
        lines: v.orderLines.length,
        quantity: sum(v.orderLines, (l) => l.quantity),
        total: v.orderTotal,
        verified: !!v.verified,
      }))
      .filter(
        (o) =>
          !needle ||
          [o.number, o.customerName, o.ownerName].some((x) =>
            x.toLowerCase().includes(needle),
          ),
      )
      .filter(
        (o) => !q.verified || (q.verified === "yes" ? o.verified : !o.verified),
      );
    return {
      from,
      to,
      summary: {
        orders: items.length,
        total: round(sum(items, (o) => o.total)),
        units: sum(items, (o) => o.quantity),
        customers: new Set(items.map((o) => o.customerId)).size,
        average: items.length
          ? round(sum(items, (o) => o.total) / items.length)
          : 0,
        unverified: items.filter((o) => !o.verified).length,
      },
      items,
    };
  }
  order(u: User, id: string) {
    const numbers = this.orderNumbers(u);
    const v = this.s.record(u, id);
    assert(v.kind === "visit" && numbers.has(v.id), 404, "Order not found");
    const names = this.names(u);
    const name = (x: string) => names.get(x) || "Removed item";
    return {
      id: v.id,
      number: numbers.get(v.id),
      date: v.date,
      visitedAt: v.visitedAt,
      ownerId: v.ownerId,
      ownerName: v.ownerName,
      customerId: v.customerId,
      customerName: v.customerName,
      customerType: v.customerType,
      outcome: v.outcome,
      remarks: v.remarks,
      verified: !!v.verified,
      distanceMeters: v.distanceMeters ?? null,
      total: v.orderTotal,
      lines: v.orderLines.map((l: any) => ({
        itemId: l.itemId,
        product: name(l.itemId),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        total: l.total,
      })),
      samples: (v.samples || []).map((l: any) => ({
        product: name(l.itemId),
        quantity: l.quantity,
      })),
      inputs: (v.inputs || []).map((l: any) => ({
        item: name(l.itemId),
        quantity: l.quantity,
      })),
    };
  }
  // ---- A28 / A47 Verification exceptions and evidence --------------------
  exceptions(u: User, q: Record<string, any>) {
    assert(u.role !== "rep", 403, "Manager access required");
    const { from, to } = this.range(q);
    const all = this.s
      .list(u, "visit", { from, to, ownerId: q.ownerId })
      .filter((v) => !v.verified)
      .map((v) => ({
        id: v.id,
        date: v.date,
        visitedAt: v.visitedAt,
        ownerId: v.ownerId,
        ownerName: v.ownerName,
        customerName: v.customerName,
        customerType: v.customerType,
        reason: v.exceptionReason || "",
        distanceMeters: v.distanceMeters ?? null,
        accuracy: v.location?.accuracy ?? null,
        mocked: !!v.location?.mocked,
        noLocation: !v.location,
        review: v.review?.status || "pending",
        reviewedBy: v.review?.byName || null,
        reviewedAt: v.review?.at || null,
        reviewNote: v.review?.note || "",
      }));
    const items = q.review ? all.filter((x) => x.review === q.review) : all;
    return {
      from,
      to,
      summary: {
        total: all.length,
        pending: all.filter((x) => x.review === "pending").length,
        accepted: all.filter((x) => x.review === "accepted").length,
        flagged: all.filter((x) => x.review === "flagged").length,
        mocked: all.filter((x) => x.mocked).length,
      },
      items,
    };
  }
  reviewVisit(u: User, id: string, input: { decision: string; note: string }) {
    assert(u.role !== "rep", 403, "Manager access required");
    const v = this.s.record(u, id);
    assert(v.kind === "visit", 404, "Call not found");
    assert(v.ownerId !== u.id, 403, "You cannot review your own call");
    assert(!v.verified, 409, "Only location exceptions need review");
    assert(
      ["accept", "flag"].includes(input.decision),
      400,
      "Choose accept or flag",
    );
    const note = (input.note || "").trim();
    assert(note.length >= 5, 400, "Provide a note of at least five characters");
    assert(note.length <= 1000, 400, "Note is too long");
    const row = this.s.raw(u, id);
    const review = {
      status: input.decision === "accept" ? "accepted" : "flagged",
      note,
      by: u.id,
      byName: u.name,
      at: now(),
    };
    // Runs inside the route's idempotent transaction.
    this.s.store.run(
      "UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=?",
      JSON.stringify({ ...JSON.parse(row.data), review }),
      now(),
      id,
    );
    this.s.audit(u, "visit.exception_" + review.status, id, { note });
    return this.s.record(u, id);
  }
  evidence(u: User, id: string) {
    const v = this.s.record(u, id);
    assert(v.kind === "visit", 404, "Call not found");
    const policy = this.s.policies(u);
    const customer = this.s.record(u, v.customerId);
    const loc = v.location || null;
    const skew = loc
      ? Math.abs(Date.parse(loc.observedAt) - Date.parse(v.visitedAt))
      : null;
    const checks = [
      {
        key: "captured",
        label: "GPS location captured",
        passed: !!loc,
        detail: loc
          ? "Location was recorded with the call."
          : "No location was recorded.",
      },
      {
        key: "genuine",
        label: "Not a mock location",
        passed: !!loc && !loc.mocked,
        detail: loc?.mocked
          ? "Device reported a mock location."
          : "No mock flag.",
      },
      {
        key: "accuracy",
        label: `Accuracy within ${policy.maxAccuracyMeters} m`,
        passed: !!loc && loc.accuracy <= policy.maxAccuracyMeters,
        detail: loc ? `Reported accuracy ${round(loc.accuracy, 0)} m.` : "—",
      },
      {
        key: "fresh",
        label: "Fix taken at the time of the call",
        passed: skew !== null && skew <= 120000,
        detail:
          skew === null
            ? "—"
            : `Fix and call differ by ${Math.round(skew / 1000)} s.`,
      },
      {
        key: "radius",
        label: `Within ${policy.gpsRadiusMeters} m of the customer`,
        passed:
          v.distanceMeters !== null &&
          v.distanceMeters !== undefined &&
          v.distanceMeters <= policy.gpsRadiusMeters,
        detail:
          v.distanceMeters === null || v.distanceMeters === undefined
            ? "Customer has no saved location."
            : `${v.distanceMeters} m from the saved customer location.`,
      },
    ];
    const at = Date.parse(v.visitedAt);
    const trail = this.s.store
      .all(
        "SELECT observed_at AS observedAt,latitude,longitude,accuracy,mocked FROM points WHERE tenant_id=? AND user_id=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at",
        u.tenantId,
        v.ownerId,
        new Date(at - 30 * 60000).toISOString(),
        new Date(at + 30 * 60000).toISOString(),
      )
      .map((p) => ({ ...p, mocked: !!p.mocked }));
    return {
      id: v.id,
      date: v.date,
      visitedAt: v.visitedAt,
      ownerId: v.ownerId,
      ownerName: v.ownerName,
      customerName: v.customerName,
      customerType: v.customerType,
      outcome: v.outcome,
      remarks: v.remarks,
      verified: !!v.verified,
      exceptionReason: v.exceptionReason || "",
      distanceMeters: v.distanceMeters ?? null,
      thresholds: {
        radius: policy.gpsRadiusMeters,
        accuracy: policy.maxAccuracyMeters,
      },
      customer: {
        id: customer.id,
        latitude: customer.latitude ?? null,
        longitude: customer.longitude ?? null,
        address: customer.address || "",
      },
      location: loc,
      checks,
      trail,
      review: v.review || null,
      canReview: u.role !== "rep" && v.ownerId !== u.id && !v.verified,
    };
  }
  // ---- A33 to A36 visual reports -----------------------------------------
  analytics(u: User, type: string, q: Record<string, any>) {
    assert(
      (analyticsTypes as readonly string[]).includes(type),
      404,
      "Report not found",
    );
    const { from, to } = this.range(q);
    const rows = report(this.s, u, type, { ...q, from, to })!;
    const stat = (label: string, value: string | number, hint: string) => ({
      label,
      value,
      hint,
    });
    const bars = (
      title: string,
      unit: string,
      items: { label: string; value: number }[],
    ) => ({ title, unit, items });
    let summary: ReturnType<typeof stat>[] = [];
    let charts: ReturnType<typeof bars>[] = [];
    if (type === "productivity") {
      const calls = sum(rows, (r) => r.calls);
      summary = [
        stat("Total calls", calls, `${rows.length} representatives`),
        stat(
          "Verified calls",
          percent(
            sum(rows, (r) => r.verified),
            calls,
          ) + "%",
          "GPS evidence accepted",
        ),
        stat(
          "POB value",
          "₹" + round(sum(rows, (r) => r.pob)).toLocaleString("en-IN"),
          "Orders booked",
        ),
        stat(
          "Avg calls per day",
          round(
            calls /
              Math.max(
                1,
                sum(rows, (r) => r.days),
              ),
            1,
          ),
          "Across worked days",
        ),
      ];
      charts = [
        bars(
          "Calls by representative",
          "calls",
          rows.map((r) => ({ label: r.representative, value: r.calls })),
        ),
        bars(
          "POB by representative",
          "₹",
          rows.map((r) => ({ label: r.representative, value: r.pob })),
        ),
      ];
    } else if (type === "deviations") {
      const byRep = new Map<string, number>();
      for (const r of rows)
        byRep.set(r.representative, (byRep.get(r.representative) || 0) + 1);
      const planned = this.s.list(u, "dayplan", { from, to }).length;
      summary = [
        stat("Deviations", rows.length, "Days not on the approved tour route"),
        stat("Representatives", byRep.size, "With at least one deviation"),
        stat("Plan days", planned, "Day plans in the range"),
        stat(
          "Deviation rate",
          percent(rows.length, planned) + "%",
          "Of plan days",
        ),
      ];
      charts = [
        bars(
          "Deviations by representative",
          "days",
          [...byRep].map(([label, value]) => ({ label, value })),
        ),
      ];
    } else if (type === "missed-coverage") {
      const doctors = this.s
        .list(u, "customer")
        .filter((c) => c.type === "Doctor");
      const visits = this.s.list(u, "visit", { from, to });
      const required = sum(doctors, (c) => c.frequency || 1);
      const covered = sum(doctors, (c) =>
        Math.min(
          c.frequency || 1,
          visits.filter((v) => v.customerId === c.id).length,
        ),
      );
      const byArea = new Map<string, number>();
      for (const r of rows)
        byArea.set(
          r.area || "No area",
          (byArea.get(r.area || "No area") || 0) + r.missed,
        );
      summary = [
        stat(
          "Coverage",
          percent(covered, required) + "%",
          `${covered} of ${required} required calls`,
        ),
        stat("Doctors missed", rows.length, "Below required frequency"),
        stat(
          "Missed calls",
          sum(rows, (r) => r.missed),
          "Still to complete",
        ),
        stat("Doctors in scope", doctors.length, "Assigned to your team"),
      ];
      charts = [
        bars(
          "Missed calls by area",
          "calls",
          top(
            [...byArea].map(([label, value]) => ({ label, value })),
            (x) => x.value,
          ),
        ),
      ];
    } else {
      summary = [
        stat("Products", rows.length, "With detailing content"),
        stat(
          "Detailing calls",
          sum(rows, (r) => r.calls),
          "Product discussions",
        ),
        stat(
          "Unique customers",
          sum(rows, (r) => r.uniqueCustomers),
          "Summed across products",
        ),
        stat(
          "Sample units",
          sum(rows, (r) => r.sampleUnits),
          "Given in visits",
        ),
      ];
      charts = [
        bars(
          "Detailing calls by product",
          "calls",
          top(
            rows.map((r) => ({ label: r.product, value: r.calls })),
            (x) => x.value,
          ),
        ),
        bars(
          "Sample units by product",
          "units",
          top(
            rows.map((r) => ({ label: r.product, value: r.sampleUnits })),
            (x) => x.value,
          ),
        ),
      ];
    }
    return { type, from, to, summary, charts, rows };
  }
  // ---- A04 Employee profile ----------------------------------------------
  profile(u: User, id: string, q: Record<string, any>) {
    const { from, to } = this.range(q);
    const user = this.s.user(u, id);
    const row = this.s.store.get("SELECT manager_id FROM users WHERE id=?", id);
    const manager = row?.manager_id
      ? this.s.store.get("SELECT id,name FROM users WHERE id=?", row.manager_id)
      : null;
    const team = this.s.store.all(
      "SELECT id,name,role FROM users WHERE tenant_id=? AND manager_id=? ORDER BY name",
      u.tenantId,
      id,
    );
    let territory: string | null = null;
    if (user.territoryId) {
      try {
        const t = this.s.record(u, user.territoryId);
        territory = t.name || null;
      } catch {
        territory = null;
      }
    }
    const visits = this.s.list(u, "visit", { from, to, ownerId: id });
    const own = (kind: string) =>
      this.s.list(u, kind, { ownerId: id }).filter((r) => r.ownerId === id);
    const countBy = (rows: any[]) =>
      rows.reduce(
        (a: Record<string, number>, r) => ({
          ...a,
          [r.status]: (a[r.status] || 0) + 1,
        }),
        {},
      );
    const customers = this.s
      .list(u, "customer", { ownerId: id })
      .filter((c) => c.assignedTo === id);
    const dcrs = this.s.list(u, "dcr", { ownerId: id });
    const expenses = this.s.list(u, "expense", { from, to, ownerId: id });
    const trackingToday =
      user.role === "rep" ? this.tracking.view(u, id, today()) : null;
    return {
      user,
      manager,
      team,
      territory,
      from,
      to,
      kpis: {
        calls: visits.length,
        doctorCalls: visits.filter((v) => v.customerType === "Doctor").length,
        verifiedRate: percent(
          visits.filter((v) => v.verified).length,
          visits.length,
        ),
        pob: round(sum(visits, (v) => v.orderTotal)),
        workedDays: new Set(visits.map((v) => v.date)).size,
        expenses: round(sum(expenses, (e) => e.amount)),
        pendingApprovals: [
          ...own("expense"),
          ...own("leave"),
          ...own("tourplan"),
          ...dcrs,
        ].filter((r) => r.status === "pending").length,
      },
      customers: {
        total: customers.length,
        doctors: customers.filter((c) => c.type === "Doctor").length,
        chemists: customers.filter((c) => c.type === "Chemist").length,
        others: customers.filter((c) => !["Doctor", "Chemist"].includes(c.type))
          .length,
      },
      statuses: {
        expense: countBy(own("expense")),
        leave: countBy(own("leave")),
        dcr: countBy(dcrs),
      },
      recentVisits: visits.slice(0, 8).map((v) => ({
        id: v.id,
        date: v.date,
        customerName: v.customerName,
        outcome: v.outcome,
        verified: !!v.verified,
        orderTotal: v.orderTotal,
      })),
      recentReports: dcrs.slice(0, 5).map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        visits: r.visits ?? 0,
        pob: r.pob ?? 0,
      })),
      inventory: this.s
        .inventory(u)
        .filter((i) => i.userId === id)
        .map((i) => ({
          name: i.name,
          itemType: i.itemType,
          quantity: i.quantity,
        })),
      tracking: trackingToday && {
        state: trackingToday.state,
        km: trackingToday.km,
        lastFix: trackingToday.lastFix && {
          observedAt: trackingToday.lastFix.observed_at,
          accuracy: trackingToday.lastFix.accuracy,
        },
      },
    };
  }
}
