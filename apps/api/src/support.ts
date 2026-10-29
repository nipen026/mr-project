import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Service, now } from "./service.ts";
import { assert } from "./auth.ts";
import { modules, type User } from "../../../packages/shared/src/index.ts";
export const languages = ["en", "hi"] as const;
export const ticketCategories = [
  "sync",
  "location",
  "access",
  "report",
  "other",
] as const;
export const ticketStatuses = ["open", "in_progress", "resolved"] as const;
const code = (id: string) => "SR-" + id.slice(0, 6).toUpperCase();
export class Support {
  constructor(private s: Service) {}
  // M04: public access request. The reply never reveals whether the company
  // or user exists, so it cannot be used to enumerate accounts.
  async accessRequest(input: {
    companyCode: string;
    email: string;
    reason?: string;
  }) {
    const contact = input.email.trim().toLowerCase();
    const reason =
      (input.reason || "").trim() || "Forgot password or need access";
    assert(contact.length > 0, 400, "Enter your employee ID or email");
    assert(reason.length <= 1000, 400, "Reason is too long");
    const reply = {
      message:
        "If the company code and user ID match an active account, your administrator has been notified. They will verify your identity and reset your access.",
      reference: code(randomUUID()),
    };
    const tenant = await this.s.store.get(
      "SELECT id FROM tenants WHERE upper(code)=?",
      input.companyCode.trim().toUpperCase(),
    );
    if (!tenant) return reply;
    const user = await this.s.store.get(
      "SELECT id FROM users WHERE tenant_id=? AND lower(email)=?",
      tenant.id,
      contact,
    );
    const open = await this.s.store.get(
      "SELECT id FROM support_requests WHERE tenant_id=? AND kind='access_reset' AND contact=? AND status!='resolved'",
      tenant.id,
      contact,
    );
    if (open) return { ...reply, reference: code(open.id) };
    const id = randomUUID(),
      at = now();
    await this.s.store.run(
      "INSERT INTO support_requests(id,tenant_id,user_id,kind,category,subject,message,contact,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id,
      tenant.id,
      user?.id ?? null,
      "access_reset",
      "access",
      user ? "Access reset requested" : "Access requested for unknown user ID",
      reason,
      contact,
      at,
      at,
    );
    await this.s.store.run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      tenant.id,
      null,
      "support.access_requested",
      id,
      JSON.stringify({ known: !!user }),
      at,
    );
    return { ...reply, reference: code(id) };
  }
  // M64: help content and the caller's own tickets.
  async help(u: User) {
    const policies = await this.s.policies(u);
    const admin = await this.s.store.get(
      "SELECT name,email FROM users WHERE tenant_id=? AND role='admin' AND active=1 ORDER BY name LIMIT 1",
      u.tenantId,
    );
    return {
      company: await this.s.store.get(
        "SELECT code,name FROM tenants WHERE id=?",
        u.tenantId,
      ),
      contact: admin || null,
      topics: [
        {
          id: "sync",
          title: "My work is not syncing",
          body: "Saved work stays on your phone and retries automatically. Open Sync center to review, retry or discard an item. A conflict means someone changed the record first: open it, review the server copy and save again.",
        },
        {
          id: "location",
          title: "Location needs review on a call",
          body: `A call is verified when the GPS fix is genuine, accurate to ${policies.maxAccuracyMeters} m, taken at the time of the call and within ${policies.gpsRadiusMeters} m of the customer. Otherwise write a clear reason and your manager will review it.`,
        },
        {
          id: "report",
          title: "Daily report deadline",
          body: `Submit each daily report within ${policies.reportDeadlineDays} days of the visit date. Open Pending reporting dates to see what is due. A submitted report locks its calls until your manager returns it.`,
        },
        {
          id: "access",
          title: "I cannot sign in or open a screen",
          body: "Use Forgot password on the sign-in screen, or raise an access request below. Your administrator verifies your identity before changing access.",
        },
      ],
      tickets: (await this.tickets(u, {})).slice(0, 20),
    };
  }
  async createTicket(
    u: User,
    input: {
      category: string;
      subject: string;
      message: string;
      reference?: string;
    },
  ) {
    const subject = input.subject.trim(),
      message = input.message.trim();
    assert(
      subject.length >= 3 && subject.length <= 120,
      400,
      "Enter a subject of 3 to 120 characters",
    );
    assert(
      message.length >= 5 && message.length <= 2000,
      400,
      "Describe the problem in 5 to 2000 characters",
    );
    const id = randomUUID(),
      at = now();
    await this.s.store.run(
      "INSERT INTO support_requests(id,tenant_id,user_id,kind,category,subject,message,reference,contact,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      u.tenantId,
      u.id,
      "support",
      input.category,
      subject,
      message,
      (input.reference || "").trim().slice(0, 100),
      u.email,
      at,
      at,
    );
    await this.s.audit(u, "support.created", id, { category: input.category });
    return await this.ticket(u, id);
  }
  private map(row: any) {
    return {
      id: row.id,
      code: code(row.id),
      kind: row.kind,
      category: row.category,
      subject: row.subject,
      message: row.message,
      reference: row.reference,
      contact: row.contact,
      status: row.status,
      response: row.response,
      requesterName: row.requester_name || null,
      resolvedByName: row.resolver_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  private async ticket(u: User, id: string) {
    const row = await this.s.store.get(
      "SELECT r.*,x.name AS requester_name,y.name AS resolver_name FROM support_requests r LEFT JOIN users x ON x.id=r.user_id LEFT JOIN users y ON y.id=r.resolved_by WHERE r.tenant_id=? AND r.id=?",
      u.tenantId,
      id,
    );
    assert(
      row && (u.role === "admin" || row.user_id === u.id),
      404,
      "Request not found",
    );
    return this.map(row);
  }
  async tickets(u: User, q: Record<string, any>) {
    assert(
      !q.status || (ticketStatuses as readonly string[]).includes(q.status),
      400,
      "Unknown status",
    );
    const rows = await this.s.store.all(
      "SELECT r.*,x.name AS requester_name,y.name AS resolver_name FROM support_requests r LEFT JOIN users x ON x.id=r.user_id LEFT JOIN users y ON y.id=r.resolved_by WHERE r.tenant_id=? ORDER BY r.created_at DESC LIMIT 500",
      u.tenantId,
    );
    return rows
      .filter((r) => u.role === "admin" || r.user_id === u.id)
      .filter((r) => !q.status || r.status === q.status)
      .map((r) => this.map(r));
  }
  async updateTicket(
    u: User,
    id: string,
    input: { status: string; response: string },
  ) {
    assert(u.role === "admin", 403, "Administrator access required");
    const current = await this.ticket(u, id);
    const response = input.response.trim();
    assert(response.length <= 2000, 400, "Response is too long");
    assert(
      input.status !== "resolved" || response.length >= 5,
      400,
      "Write a response of at least five characters before resolving",
    );
    await this.s.store.run(
      "UPDATE support_requests SET status=?,response=?,resolved_by=?,updated_at=? WHERE id=?",
      input.status,
      response,
      input.status === "resolved" ? u.id : null,
      now(),
      current.id,
    );
    await this.s.audit(u, "support." + input.status, id, { response });
    return await this.ticket(u, id);
  }
  // M70: what the signed-in role may open or change.
  async access(u: User) {
    const all = await this.s.permissions(u.tenantId);
    return {
      role: u.role,
      modules: modules.map((m) => {
        const p = all[u.role]?.[m.key] ?? { read: false, write: false };
        return {
          key: m.key,
          title: m.title,
          read: p.read,
          write: p.write,
          reason: !p.read
            ? "Your administrator has not given your role Read access to this."
            : !p.write
              ? "Your role can view this but not change it."
              : "",
        };
      }),
    };
  }
  // Settings → Roles & permissions, derived from the same rules the API enforces.
  async roles(u: User) {
    const counts = await this.s.store.all(
      "SELECT role,COUNT(*) AS n FROM users WHERE tenant_id=? AND active=1 GROUP BY role",
      u.tenantId,
    );
    const people = new Map(counts.map((c) => [c.role, c.n]));
    const rows = [
      {
        role: "admin",
        label: "Administrator",
        scope: "Entire company",
        approvals: "Team submissions except own",
        settings: "Manage",
      },
      {
        role: "manager",
        label: "Manager",
        scope: "Own reporting hierarchy",
        approvals: "Team submissions except own",
        settings: "Read policies",
      },
      {
        role: "rep",
        label: "Representative",
        scope: "Own data and assigned customers",
        approvals: "Submit, correct and resubmit own",
        settings: "Own account",
      },
    ];
    const all = await this.s.permissions(u.tenantId);
    return {
      items: rows.map((r) => {
        const row = Object.values(all[r.role]);
        return {
          ...r,
          people: people.get(r.role) || 0,
          modulesRead: row.filter((p) => p.read).length,
          modulesWrite: row.filter((p) => p.write).length,
        };
      }),
    };
  }
  // Settings → Permissions: the editable Read / Write matrix for every role.
  async permissionMatrix(u: User) {
    const all = await this.s.permissions(u.tenantId);
    const saved = await this.s.store.all(
      "SELECT DISTINCT role FROM role_permissions WHERE tenant_id=?",
      u.tenantId,
    );
    const custom = new Set(saved.map((r) => r.role));
    return {
      modules: modules.map((m) => ({
        key: m.key,
        title: m.title,
        group: m.group,
      })),
      roles: [
        { role: "admin", label: "Administrator", locked: true },
        { role: "manager", label: "Manager", locked: false },
        { role: "rep", label: "Representative", locked: false },
      ].map((r) => ({
        ...r,
        customized: custom.has(r.role),
        access: all[r.role],
      })),
    };
  }
  async setPermissions(
    u: User,
    role: string,
    input: { access: Record<string, { read: boolean; write: boolean }> },
  ) {
    assert(
      ["manager", "rep"].includes(role),
      400,
      "Administrator permissions cannot be changed",
    );
    const keys = Object.keys(input.access);
    for (const k of keys)
      assert(
        modules.some((m) => m.key === k),
        400,
        "Unknown module " + k,
      );
    await this.s.store.transaction(async () => {
      for (const k of keys) {
        const write = input.access[k].write;
        const read = input.access[k].read || write;
        await this.s.store.run(
          "INSERT INTO role_permissions(tenant_id,role,module,can_read,can_write,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,role,module) DO UPDATE SET can_read=excluded.can_read,can_write=excluded.can_write,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
          u.tenantId,
          role,
          k,
          read ? 1 : 0,
          write ? 1 : 0,
          u.id,
          now(),
        );
      }
      await this.s.audit(u, "permissions.updated", role, {
        modules: keys.length,
      });
    });
    return await this.permissionMatrix(u);
  }
  async resetPermissions(u: User, role: string) {
    assert(
      ["manager", "rep"].includes(role),
      400,
      "Administrator permissions cannot be changed",
    );
    await this.s.store.transaction(async () => {
      await this.s.store.run(
        "DELETE FROM role_permissions WHERE tenant_id=? AND role=?",
        u.tenantId,
        role,
      );
      await this.s.audit(u, "permissions.reset", role);
    });
    return await this.permissionMatrix(u);
  }
  // M63: language preference.
  async preferences(u: User) {
    const row = await this.s.store.get(
      "SELECT language FROM preferences WHERE user_id=?",
      u.id,
    );
    return { language: row?.language || "en", languages };
  }
  async setPreferences(u: User, input: { language: string }) {
    await this.s.store.run(
      "INSERT INTO preferences(user_id,language,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,updated_at=excluded.updated_at",
      u.id,
      input.language,
      now(),
    );
    return await this.preferences(u);
  }
}
export const ticketBody = z
  .object({
    category: z.enum(ticketCategories),
    subject: z.string().max(200),
    message: z.string().max(5000),
    reference: z.string().max(200).optional(),
  })
  .strict();
export const ticketUpdate = z
  .object({
    status: z.enum(ticketStatuses),
    response: z.string().max(5000).default(""),
  })
  .strict();
export const preferencesBody = z
  .object({ language: z.enum(languages) })
  .strict();
export const permissionsBody = z.object({
  access: z.record(
    z.string(),
    z.object({ read: z.boolean(), write: z.boolean() }),
  ),
});
