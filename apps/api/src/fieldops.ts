import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Service, now, today } from "./service.ts";
import { assert } from "./auth.ts";
import type { User } from "../../../packages/shared/src/index.ts";
const addDays = (date: string, n: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
      86400000,
  );
export const addressBody = z
  .object({
    label: z.string().trim().min(2).max(40),
    line: z.string().trim().min(5).max(500),
    city: z.string().trim().max(100).default(""),
    state: z.string().trim().max(100).default(""),
    pinCode: z
      .string()
      .trim()
      .regex(/^(\d{6})?$/, "PIN code must be 6 digits")
      .default(""),
    version: z.number().int().optional(),
  })
  .strict();
export class FieldOps {
  constructor(private s: Service) {}
  // ---- M33 customer addresses -------------------------------------------
  private customer(u: User, id: string) {
    const c = this.s.record(u, id);
    assert(c.kind === "customer", 404, "Customer not found");
    return c;
  }
  private userName(u: User, id: string) {
    return (
      this.s.store.get(
        "SELECT name FROM users WHERE tenant_id=? AND id=?",
        u.tenantId,
        id,
      )?.name || "Unassigned"
    );
  }
  private writable(u: User, c: any) {
    return (
      u.role === "admin" ||
      u.role === "manager" ||
      c.ownerId === u.id ||
      c.assignedTo === u.id
    );
  }
  addresses(u: User, customerId: string) {
    const c = this.customer(u, customerId);
    const master = [
      c.clinicAddress && {
        id: "clinic",
        label: "Clinic / business",
        line: c.clinicAddress,
        city: c.area || "",
        state: c.state || "",
        pinCode: c.pinCode || "",
      },
      c.residenceAddress && {
        id: "residence",
        label: "Residence",
        line: c.residenceAddress,
        city: "",
        state: c.state || "",
        pinCode: "",
      },
    ].filter(Boolean);
    const items = this.s.store
      .all(
        "SELECT * FROM customer_addresses WHERE tenant_id=? AND customer_id=? ORDER BY created_at",
        u.tenantId,
        customerId,
      )
      .map((r) => ({
        id: r.id,
        label: r.label,
        line: r.line,
        city: r.city,
        state: r.state,
        pinCode: r.pin_code,
        version: r.version,
      }));
    return {
      customer: { id: c.id, name: c.name, type: c.type },
      master,
      items,
      canEdit: this.writable(u, c),
    };
  }
  addAddress(u: User, customerId: string, input: z.infer<typeof addressBody>) {
    const c = this.customer(u, customerId);
    assert(this.writable(u, c), 403, "You cannot edit this customer");
    const count = this.s.store.get(
      "SELECT COUNT(*) AS n FROM customer_addresses WHERE tenant_id=? AND customer_id=?",
      u.tenantId,
      customerId,
    ).n;
    assert(count < 10, 409, "A customer can have at most 10 extra addresses");
    const id = randomUUID(),
      at = now();
    this.s.store.run(
      "INSERT INTO customer_addresses(id,tenant_id,customer_id,label,line,city,state,pin_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id,
      u.tenantId,
      customerId,
      input.label,
      input.line,
      input.city,
      input.state,
      input.pinCode,
      at,
      at,
    );
    this.s.audit(u, "customer.address_added", customerId, { id });
    return this.addresses(u, customerId);
  }
  private address(u: User, id: string) {
    const row = this.s.store.get(
      "SELECT * FROM customer_addresses WHERE tenant_id=? AND id=?",
      u.tenantId,
      id,
    );
    assert(row, 404, "Address not found");
    const c = this.customer(u, row.customer_id);
    assert(this.writable(u, c), 403, "You cannot edit this customer");
    return row;
  }
  updateAddress(u: User, id: string, input: z.infer<typeof addressBody>) {
    const row = this.address(u, id);
    assert(
      input.version === undefined || input.version === row.version,
      409,
      "This address changed on another device. Reload it before saving",
      "VERSION_CONFLICT",
    );
    this.s.store.run(
      "UPDATE customer_addresses SET label=?,line=?,city=?,state=?,pin_code=?,version=version+1,updated_at=? WHERE id=?",
      input.label,
      input.line,
      input.city,
      input.state,
      input.pinCode,
      now(),
      id,
    );
    this.s.audit(u, "customer.address_updated", row.customer_id, { id });
    return this.addresses(u, row.customer_id);
  }
  removeAddress(u: User, id: string) {
    const row = this.address(u, id);
    this.s.store.run("DELETE FROM customer_addresses WHERE id=?", id);
    this.s.audit(u, "customer.address_removed", row.customer_id, { id });
    return this.addresses(u, row.customer_id);
  }
  // ---- M57 campaign doctors ---------------------------------------------
  campaignDoctors(u: User, campaignId: string) {
    const campaign = this.s.record(u, campaignId);
    assert(campaign.kind === "campaign", 404, "Campaign not found");
    const visits = this.s
      .list(u, "visit", { from: campaign.fromDate, to: campaign.toDate })
      .filter((v) => v.campaignId === campaignId);
    let hidden = 0;
    const items: any[] = [];
    for (const id of campaign.customerIds || []) {
      let c: any;
      try {
        c = this.s.record(u, id);
      } catch {
        hidden++;
        continue;
      }
      const calls = visits.filter((v) => v.customerId === id);
      items.push({
        id: c.id,
        name: c.name,
        type: c.type,
        specialty: c.specialty || "",
        area: c.area || "",
        representative: this.userName(u, c.assignedTo),
        calls: calls.length,
        verifiedCalls: calls.filter((v) => v.verified).length,
        lastVisit:
          calls
            .map((v) => v.date)
            .sort()
            .at(-1) || null,
        status: calls.length ? "covered" : "pending",
        canRecord: c.assignedTo === u.id,
      });
    }
    items.sort((a, b) =>
      a.status === b.status
        ? a.name.localeCompare(b.name)
        : a.status === "pending"
          ? -1
          : 1,
    );
    const t = today();
    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        fromDate: campaign.fromDate,
        toDate: campaign.toDate,
        description: campaign.description,
        active: campaign.fromDate <= t && campaign.toDate >= t,
      },
      summary: {
        total: items.length,
        covered: items.filter((x) => x.status === "covered").length,
        pending: items.filter((x) => x.status === "pending").length,
        hidden,
      },
      items,
    };
  }
  // ---- M76 pending reporting dates --------------------------------------
  pendingReports(u: User) {
    const policy = this.s.policies(u);
    const t = today();
    const from = addDays(t, -(policy.reportDeadlineDays + 7));
    const visits = this.s
      .list(u, "visit", { from, to: t, ownerId: u.id })
      .filter((v) => v.ownerId === u.id);
    const reports = this.s
      .list(u, "dcr", { ownerId: u.id })
      .filter((r) => r.ownerId === u.id);
    const byDate = new Map<string, any[]>();
    for (const v of visits)
      byDate.set(v.date, [...(byDate.get(v.date) || []), v]);
    const items = [...byDate]
      .flatMap(([date, list]) => {
        const report = reports.find((r) => r.date === date);
        if (report && ["pending", "approved"].includes(report.status))
          return [];
        const deadline = addDays(date, policy.reportDeadlineDays);
        const daysLeft = daysBetween(t, deadline);
        return [
          {
            date,
            visits: list.length,
            pob:
              Math.round(list.reduce((a, v) => a + v.orderTotal, 0) * 100) /
              100,
            unverified: list.filter((v) => !v.verified).length,
            reportId: report?.id ?? null,
            reportStatus: report?.status ?? null,
            deadline,
            daysLeft,
            overdue: daysLeft < 0,
          },
        ];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      deadlineDays: policy.reportDeadlineDays,
      summary: {
        total: items.length,
        overdue: items.filter((x) => x.overdue).length,
        dueToday: items.filter((x) => x.daysLeft === 0).length,
        returned: items.filter((x) => x.reportStatus === "returned").length,
      },
      items,
    };
  }
}
