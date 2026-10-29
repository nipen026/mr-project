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
  private async customer(u: User, id: string) {
    const c = await this.s.record(u, id);
    assert(c.kind === "customer", 404, "Customer not found");
    return c;
  }
  private async userName(u: User, id: string) {
    const row = await this.s.store.get(
      "SELECT name FROM users WHERE tenant_id=? AND id=?",
      u.tenantId,
      id,
    );
    return row?.name || "Unassigned";
  }
  private writable(u: User, c: any) {
    return (
      u.role === "admin" ||
      u.role === "manager" ||
      c.ownerId === u.id ||
      c.assignedTo === u.id
    );
  }
  async addresses(u: User, customerId: string) {
    const c = await this.customer(u, customerId);
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
    const stored = await this.s.store.all(
      "SELECT * FROM customer_addresses WHERE tenant_id=? AND customer_id=? ORDER BY created_at",
      u.tenantId,
      customerId,
    );
    const items = stored.map((r) => ({
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
  async addAddress(
    u: User,
    customerId: string,
    input: z.infer<typeof addressBody>,
  ) {
    const c = await this.customer(u, customerId);
    assert(this.writable(u, c), 403, "You cannot edit this customer");
    const count = (
      await this.s.store.get(
        "SELECT COUNT(*) AS n FROM customer_addresses WHERE tenant_id=? AND customer_id=?",
        u.tenantId,
        customerId,
      )
    ).n;
    assert(count < 10, 409, "A customer can have at most 10 extra addresses");
    const id = randomUUID(),
      at = now();
    await this.s.store.run(
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
    await this.s.audit(u, "customer.address_added", customerId, { id });
    return await this.addresses(u, customerId);
  }
  private async address(u: User, id: string) {
    const row = await this.s.store.get(
      "SELECT * FROM customer_addresses WHERE tenant_id=? AND id=?",
      u.tenantId,
      id,
    );
    assert(row, 404, "Address not found");
    const c = await this.customer(u, row.customer_id);
    assert(this.writable(u, c), 403, "You cannot edit this customer");
    return row;
  }
  async updateAddress(u: User, id: string, input: z.infer<typeof addressBody>) {
    const row = await this.address(u, id);
    assert(
      input.version === undefined || input.version === row.version,
      409,
      "This address changed on another device. Reload it before saving",
      "VERSION_CONFLICT",
    );
    await this.s.store.run(
      "UPDATE customer_addresses SET label=?,line=?,city=?,state=?,pin_code=?,version=version+1,updated_at=? WHERE id=?",
      input.label,
      input.line,
      input.city,
      input.state,
      input.pinCode,
      now(),
      id,
    );
    await this.s.audit(u, "customer.address_updated", row.customer_id, { id });
    return await this.addresses(u, row.customer_id);
  }
  async removeAddress(u: User, id: string) {
    const row = await this.address(u, id);
    await this.s.store.run("DELETE FROM customer_addresses WHERE id=?", id);
    await this.s.audit(u, "customer.address_removed", row.customer_id, { id });
    return await this.addresses(u, row.customer_id);
  }
  // ---- M57 campaign doctors ---------------------------------------------
  async campaignDoctors(u: User, campaignId: string) {
    const campaign = await this.s.record(u, campaignId);
    assert(campaign.kind === "campaign", 404, "Campaign not found");
    const [allVisits, customers, users] = await Promise.all([
      this.s.list(u, "visit", { from: campaign.fromDate, to: campaign.toDate }),
      this.s.list(u, "customer"),
      this.s.users(u),
    ]);
    const visits = allVisits.filter((v) => v.campaignId === campaignId);
    const known = new Map(customers.map((c) => [c.id, c]));
    const userNames = new Map(users.map((x) => [x.id, x.name]));
    let hidden = 0;
    const items: any[] = [];
    for (const id of campaign.customerIds || []) {
      const c: any = known.get(id);
      if (!c) {
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
        representative: userNames.get(c.assignedTo) || "Unassigned",
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
  async pendingReports(u: User) {
    const policy = await this.s.policies(u);
    const t = today();
    const from = addDays(t, -(policy.reportDeadlineDays + 7));
    const [allVisits, allReports] = await Promise.all([
      this.s.list(u, "visit", { from, to: t, ownerId: u.id }),
      this.s.list(u, "dcr", { ownerId: u.id }),
    ]);
    const visits = allVisits.filter((v) => v.ownerId === u.id);
    const reports = allReports.filter((r) => r.ownerId === u.id);
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
