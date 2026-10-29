import { randomUUID } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.ts";
import { seedDemo, demoPassword } from "../src/seed.ts";
import { now } from "../src/service.ts";
const temp = mkdtempSync(join(tmpdir(), "mr-mobile-test-"));
let ctx: Awaited<ReturnType<typeof buildApp>>;
const tokens: Record<string, string> = {};
const req = (method: string, path: string, body?: unknown, user = "admin") =>
  ctx.app.inject({
    method: method as any,
    url: "/api" + path,
    payload: body as any,
    headers: tokens[user] ? { authorization: "Bearer " + tokens[user] } : {},
  });
const result = async (
  method: string,
  path: string,
  body?: unknown,
  user = "admin",
) => {
  const r = await req(method, path, body, user);
  assert.ok(r.statusCode < 300, r.body);
  return r.json();
};
let customer: any, plan: any, campaign: any;
before(async () => {
  // Set TEST_DATABASE_URL (a direct PostgreSQL URL) to run against PostgreSQL
  // in a throwaway schema instead of a temporary SQLite file.
  if (process.env.TEST_DATABASE_URL)
    process.env.DATABASE_SCHEMA =
      "mrtest_" + randomUUID().replaceAll("-", "").slice(0, 12);
  ctx = await buildApp({
    databasePath: process.env.TEST_DATABASE_URL || join(temp, "db.sqlite"),
    uploads: join(temp, "uploads"),
    serveWeb: false,
  });
  await seedDemo(ctx.store);
  for (const user of ["admin", "manager", "aman", "priya"]) {
    const r = await req(
      "POST",
      "/auth/login",
      {
        companyCode: "VIDYA",
        email: user + "@mrconnect.test",
        password: demoPassword,
        client: "android",
      },
      "none",
    );
    tokens[user] = r.json().token;
  }
  customer = (
    await result("GET", "/records/customer", undefined, "aman")
  ).items.find((x: any) => x.type === "Doctor");
  plan = (await result("GET", "/records/dayplan", undefined, "aman")).items[0];
  campaign = (await result("GET", "/records/campaign")).items[0];
});
after(async () => {
  await ctx.store.destroy();
  await ctx.app.close();
  rmSync(temp, { recursive: true, force: true });
});
test("access request is stored without revealing whether the account exists", async () => {
  const known = await req(
    "POST",
    "/auth/access-help",
    {
      companyCode: "vidya",
      email: "AMAN@mrconnect.test",
      reason: "Forgot my password",
    },
    "none",
  );
  const unknown = await req(
    "POST",
    "/auth/access-help",
    { companyCode: "NOPE", email: "x@y.z" },
    "none",
  );
  assert.equal(known.statusCode, 200);
  assert.equal(unknown.statusCode, 200);
  assert.equal(known.json().message, unknown.json().message);
  assert.match(known.json().reference, /^SR-[0-9A-F]{6}$/);
  const again = await req(
    "POST",
    "/auth/access-help",
    { companyCode: "VIDYA", email: "aman@mrconnect.test" },
    "none",
  );
  assert.equal(again.json().reference, known.json().reference);
  const list = (await result("GET", "/support/tickets?status=open")).items;
  const mine = list.filter((t: any) => t.kind === "access_reset");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].requesterName, "Aman Sharma");
  assert.equal(
    (await result("GET", "/support/tickets", undefined, "priya")).items.length,
    0,
  );
});
test("support tickets are scoped to the requester and resolved only by admins", async () => {
  const help = await result("GET", "/support", undefined, "aman");
  assert.ok(help.topics.length >= 4);
  assert.ok(help.contact.email);
  const t = await result(
    "POST",
    "/support/tickets",
    {
      category: "sync",
      subject: "Visit stuck",
      message: "One visit will not sync",
      reference: "visit-1",
    },
    "aman",
  );
  assert.equal(t.status, "open");
  assert.equal(
    (
      await req(
        "POST",
        "/support/tickets",
        { category: "sync", subject: "ab", message: "short body here" },
        "aman",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/support/tickets",
        { category: "bogus", subject: "Hello", message: "Message body" },
        "aman",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await result("GET", "/support", undefined, "aman")).tickets.length,
    2, // Aman's own access request from the first test is also his ticket
  );
  assert.equal(
    (await result("GET", "/support", undefined, "priya")).tickets.length,
    0,
  );
  assert.equal(
    (
      await req(
        "PUT",
        `/support/tickets/${t.id}`,
        { status: "resolved", response: "Done now" },
        "aman",
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await req("PUT", `/support/tickets/${t.id}`, {
        status: "resolved",
        response: "ok",
      })
    ).statusCode,
    400,
  );
  const done = await result("PUT", `/support/tickets/${t.id}`, {
    status: "resolved",
    response: "Synced from the server side",
  });
  assert.equal(done.status, "resolved");
  const admin = (await result("GET", "/auth/me")).user;
  assert.equal(done.resolvedByName, admin.name);
  assert.equal(
    (await result("GET", "/support", undefined, "aman")).tickets[0].response,
    "Synced from the server side",
  );
});
test("access map reflects role restrictions", async () => {
  const rep = await result("GET", "/access", undefined, "aman");
  const territory = rep.modules.find((m: any) => m.key === "territory");
  assert.equal(territory.read, false);
  assert.ok(territory.reason.length > 0);
  const campaignAccess = rep.modules.find((m: any) => m.key === "campaign");
  assert.deepEqual([campaignAccess.read, campaignAccess.write], [true, false]);
  const admin = await result("GET", "/access", undefined, "admin");
  assert.ok(admin.modules.every((m: any) => m.read && m.write));
});
test("language preference persists per user and is returned at bootstrap", async () => {
  assert.equal(
    (await result("GET", "/preferences", undefined, "aman")).language,
    "en",
  );
  await result("PUT", "/preferences", { language: "hi" }, "aman");
  assert.equal(
    (await result("GET", "/bootstrap", undefined, "aman")).preferences.language,
    "hi",
  );
  assert.equal(
    (await result("GET", "/preferences", undefined, "priya")).language,
    "en",
  );
  assert.equal(
    (await req("PUT", "/preferences", { language: "fr" }, "aman")).statusCode,
    400,
  );
});
test("customer addresses are validated, scoped and versioned", async () => {
  const base = await result(
    "GET",
    `/customers/${customer.id}/addresses`,
    undefined,
    "aman",
  );
  assert.ok(base.master.length >= 1);
  assert.equal(base.canEdit, true);
  const added = await result(
    "POST",
    `/customers/${customer.id}/addresses`,
    {
      label: "Nursing home",
      line: "12 Park Street, Sector 4",
      city: "Delhi",
      pinCode: "110031",
    },
    "aman",
  );
  assert.equal(added.items.length, 1);
  const addr = added.items[0];
  assert.equal(
    (
      await req(
        "POST",
        `/customers/${customer.id}/addresses`,
        { label: "Bad", line: "12 Park Street", pinCode: "12" },
        "aman",
      )
    ).statusCode,
    400,
  );
  const updated = await result(
    "PUT",
    `/customer-addresses/${addr.id}`,
    {
      label: "Nursing home",
      line: "14 Park Street, Sector 4",
      version: addr.version,
    },
    "aman",
  );
  assert.equal(updated.items[0].version, addr.version + 1);
  assert.equal(
    (
      await req(
        "PUT",
        `/customer-addresses/${addr.id}`,
        {
          label: "Nursing home",
          line: "Old copy of address",
          version: addr.version,
        },
        "aman",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await req(
        "GET",
        `/customers/${customer.id}/addresses`,
        undefined,
        "priya",
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (await req("DELETE", `/customer-addresses/${addr.id}`, undefined, "priya"))
      .statusCode,
    404, // customer is outside Priya's scope, so it is not revealed
  );
  const removed = await result(
    "DELETE",
    `/customer-addresses/${addr.id}`,
    undefined,
    "aman",
  );
  assert.equal(removed.items.length, 0);
  assert.equal(
    (await req("GET", `/customers/${plan.id}/addresses`, undefined, "aman"))
      .statusCode,
    404,
  );
});
test("campaign doctors report coverage from linked visits", async () => {
  const start = await result(
    "GET",
    `/campaigns/${campaign.id}/doctors`,
    undefined,
    "manager",
  );
  assert.equal(start.campaign.id, campaign.id);
  assert.equal(start.summary.total, start.items.length);
  assert.equal(
    start.summary.covered + start.summary.pending,
    start.summary.total,
  );
  const target =
    start.items.find((x: any) => x.canRecord === false) || start.items[0];
  assert.ok(target);
  assert.equal(
    (
      await req(
        "GET",
        "/campaigns/not-a-campaign/doctors",
        undefined,
        "manager",
      )
    ).statusCode,
    404,
  );
  const mine = await result(
    "GET",
    `/campaigns/${campaign.id}/doctors`,
    undefined,
    "aman",
  );
  const doctor = mine.items.find(
    (x: any) => x.canRecord && x.type === "Doctor",
  );
  if (doctor) {
    await result(
      "POST",
      "/visits",
      {
        customerId: doctor.id,
        planId: plan.id,
        campaignId: campaign.id,
        visitedAt: now(),
        remarks: "Campaign visit",
        location: null,
        exceptionReason: "No GPS at the clinic basement",
      },
      "aman",
    );
    const after = await result(
      "GET",
      `/campaigns/${campaign.id}/doctors`,
      undefined,
      "aman",
    );
    const row = after.items.find((x: any) => x.id === doctor.id);
    assert.equal(row.calls, 1);
    assert.equal(row.status, "covered");
    assert.ok(row.lastVisit);
  }
});
test("pending reports list unreported dates and drop them once submitted", async () => {
  const before = await result("GET", "/dcr/pending", undefined, "aman");
  assert.equal(before.deadlineDays, 7);
  assert.ok(before.summary.total >= 1);
  const item = before.items[0];
  assert.equal(item.overdue, false);
  assert.equal(item.daysLeft, 7);
  assert.equal(item.reportStatus, null);
  const dcr = await result(
    "POST",
    "/dcr",
    { date: item.date, remarks: "Day done" },
    "aman",
  );
  const draft = (await result("GET", "/dcr/pending", undefined, "aman"))
    .items[0];
  assert.equal(draft.reportStatus, "draft");
  await result(
    "POST",
    `/record/${dcr.id}/submit`,
    { version: dcr.version },
    "aman",
  );
  const done = await result("GET", "/dcr/pending", undefined, "aman");
  assert.ok(!done.items.some((x: any) => x.date === item.date));
  const manager = await result("GET", "/dcr/pending", undefined, "manager");
  assert.equal(manager.summary.total, 0);
});
test("roles matrix comes from the enforced rules and performance matches the profile", async () => {
  const roles = (await result("GET", "/roles", undefined, "manager")).items;
  assert.deepEqual(
    roles.map((r: any) => r.role),
    ["admin", "manager", "rep"],
  );
  const admin = roles.find((r: any) => r.role === "admin");
  const rep = roles.find((r: any) => r.role === "rep");
  assert.ok(admin.modulesWrite > rep.modulesWrite);
  assert.equal(rep.people, 2);
  assert.equal((await req("GET", "/roles", undefined, "none")).statusCode, 401);
  const mine = await result("GET", "/performance", undefined, "aman");
  const me = (await result("GET", "/auth/me", undefined, "aman")).user;
  const profile = await result(
    "GET",
    `/users/${me.id}/profile`,
    undefined,
    "manager",
  );
  assert.deepEqual(mine.kpis, profile.kpis);
  assert.ok(mine.customers.total >= 1);
  assert.equal(
    (await req("GET", "/performance?from=2026-02-30", undefined, "aman"))
      .statusCode,
    400,
  );
});
test("administrators configure Read and Write per role and the API enforces it", async () => {
  const matrix = await result("GET", "/permissions");
  assert.equal(matrix.roles[0].locked, true);
  assert.equal(
    (await req("GET", "/permissions", undefined, "manager")).statusCode,
    403,
  );
  // Defaults: representatives can read announcements but not publish them.
  const before = (await result("GET", "/permissions")).roles.find(
    (r: any) => r.role === "rep",
  );
  assert.deepEqual(before.access.announcement, { read: true, write: false });
  assert.equal(
    (await req("GET", "/records/expense", undefined, "aman")).statusCode,
    200,
  );
  // Remove Read from expenses for representatives.
  const saved = await result("PUT", "/permissions/rep", {
    access: { expense: { read: false, write: true } },
  });
  // Write implies Read.
  assert.deepEqual(
    saved.roles.find((r: any) => r.role === "rep").access.expense,
    { read: true, write: true },
  );
  await result("PUT", "/permissions/rep", {
    access: { expense: { read: false, write: false } },
  });
  assert.equal(
    (await req("GET", "/records/expense", undefined, "aman")).statusCode,
    403,
  );
  const access = await result("GET", "/access", undefined, "aman");
  assert.equal(
    access.modules.find((m: any) => m.key === "expense").read,
    false,
  );
  const boot = await result("GET", "/bootstrap", undefined, "aman");
  assert.ok(!boot.modules.some((m: any) => m.key === "expense"));
  // Grant Write on announcements to managers only.
  await result("PUT", "/permissions/manager", {
    access: { announcement: { read: true, write: true } },
  });
  assert.equal(
    (await req("POST", "/records/announcement", {}, "manager")).statusCode,
    400,
  );
  assert.equal(
    (await req("POST", "/records/announcement", {}, "aman")).statusCode,
    403,
  );
  // Administrators cannot be restricted; unknown modules are rejected.
  assert.equal(
    (
      await req("PUT", "/permissions/admin", {
        access: { expense: { read: false, write: false } },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await req("PUT", "/permissions/rep", {
        access: { nothing: { read: true, write: true } },
      })
    ).statusCode,
    400,
  );
  // Restore defaults.
  const reset = await result("POST", "/permissions/rep/reset", {});
  assert.equal(
    reset.roles.find((r: any) => r.role === "rep").customized,
    false,
  );
  assert.equal(
    (await req("GET", "/records/expense", undefined, "aman")).statusCode,
    200,
  );
  await result("POST", "/permissions/manager/reset", {});
});
