import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.ts";
import { seedDemo, demoPassword } from "../src/seed.ts";
import { now } from "../src/service.ts";
const temp = mkdtempSync(join(tmpdir(), "mr-insights-test-"));
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
let customer: any, product: any, plan: any;
const visit = (extra: any = {}) => ({
  customerId: customer.id,
  planId: plan.id,
  visitedAt: now(),
  remarks: "Insight test visit",
  location: {
    latitude: customer.latitude,
    longitude: customer.longitude,
    accuracy: 10,
    observedAt: now(),
    mocked: false,
  },
  ...extra,
});
let orderVisit: any, exceptionVisit: any;
before(async () => {
  ctx = await buildApp({
    databasePath: join(temp, "db.sqlite"),
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
  product = (await result("GET", "/records/product")).items[0];
  plan = (await result("GET", "/records/dayplan", undefined, "aman")).items[0];
  orderVisit = await result(
    "POST",
    "/visits",
    visit({ orderLines: [{ itemId: product.id, quantity: 4 }] }),
    "aman",
  );
  exceptionVisit = await result(
    "POST",
    "/visits",
    visit({
      location: {
        latitude: 0,
        longitude: 0,
        accuracy: 10,
        observedAt: now(),
        mocked: false,
      },
      exceptionReason: "Customer moved clinic; master location is outdated",
    }),
    "aman",
  );
});
after(async () => {
  await ctx.app.close();
  rmSync(temp, { recursive: true, force: true });
});
test("orders list and detail expose numbered POB with priced lines", async () => {
  const list = await result("GET", "/orders", undefined, "manager");
  const row = list.items.find((x: any) => x.id === orderVisit.id);
  assert.match(row.number, /^POB-\d{4}$/);
  assert.equal(row.total, product.price * 4);
  assert.ok(list.summary.orders >= 1 && list.summary.total >= row.total);
  const detail = (
    await result("GET", `/orders/${orderVisit.id}`, undefined, "manager")
  ).item;
  assert.equal(detail.number, row.number);
  assert.equal(detail.lines[0].product, product.name);
  assert.equal(detail.lines[0].quantity, 4);
  assert.equal(
    (await result("GET", `/orders?q=${row.number}`, undefined, "manager")).items
      .length,
    1,
  );
  assert.equal(
    (await req("GET", `/orders/${exceptionVisit.id}`, undefined, "manager"))
      .statusCode,
    404,
  );
  assert.equal(
    (await req("GET", `/orders/${orderVisit.id}`, undefined, "priya"))
      .statusCode,
    404,
  );
  assert.equal(
    (await req("GET", "/orders?from=2026-02-30", undefined, "manager"))
      .statusCode,
    400,
  );
});
test("exception queue lists unverified calls and enforces review rules", async () => {
  const q = await result("GET", "/exceptions", undefined, "manager");
  const row = q.items.find((x: any) => x.id === exceptionVisit.id);
  assert.equal(row.review, "pending");
  assert.ok(q.summary.pending >= 1);
  assert.ok(!q.items.some((x: any) => x.id === orderVisit.id));
  assert.equal(
    (await req("GET", "/exceptions", undefined, "aman")).statusCode,
    403,
  );
  const path = `/visits/${exceptionVisit.id}/review`;
  assert.equal(
    (await req("POST", path, { decision: "accept", note: "ok" }, "aman"))
      .statusCode,
    403,
  );
  assert.equal(
    (await req("POST", path, { decision: "accept", note: "ok" }, "manager"))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        `/visits/${orderVisit.id}/review`,
        { decision: "accept", note: "Verified call" },
        "manager",
      )
    ).statusCode,
    409,
  );
  const done = await result(
    "POST",
    path,
    { decision: "flag", note: "Location does not match the clinic" },
    "manager",
  );
  assert.equal(done.review.status, "flagged");
  assert.equal(done.version, exceptionVisit.version + 1);
  const after = await result(
    "GET",
    "/exceptions?review=flagged",
    undefined,
    "manager",
  );
  const me = (await result("GET", "/auth/me", undefined, "manager")).user;
  assert.equal(
    after.items.find((x: any) => x.id === exceptionVisit.id).reviewedBy,
    me.name,
  );
  assert.ok(after.items.some((x: any) => x.id === exceptionVisit.id));
  const audit = await result("GET", "/reports/audit");
  assert.ok(
    audit.items.some((a: any) => a.action === "visit.exception_flagged"),
  );
});
test("evidence reports each GPS check and nearby trail", async () => {
  const ok = await result(
    "GET",
    `/visits/${orderVisit.id}/evidence`,
    undefined,
    "aman",
  );
  assert.ok(ok.checks.every((c: any) => c.passed));
  assert.equal(ok.canReview, false);
  const bad = await result(
    "GET",
    `/visits/${exceptionVisit.id}/evidence`,
    undefined,
    "manager",
  );
  assert.equal(bad.checks.find((c: any) => c.key === "radius").passed, false);
  assert.equal(bad.canReview, true);
  assert.equal(bad.customer.latitude, customer.latitude);
  assert.equal(bad.review.status, "flagged");
  assert.equal(
    (
      await req(
        "GET",
        `/visits/${exceptionVisit.id}/evidence`,
        undefined,
        "priya",
      )
    ).statusCode,
    404,
  );
});
test("analytics returns summaries and charts for four report types", async () => {
  for (const type of [
    "productivity",
    "deviations",
    "missed-coverage",
    "product-reach",
  ]) {
    const r = await result("GET", `/analytics/${type}`, undefined, "manager");
    assert.equal(r.type, type);
    assert.equal(r.summary.length, 4);
    assert.ok(Array.isArray(r.charts) && Array.isArray(r.rows));
  }
  const p = await result(
    "GET",
    "/analytics/productivity",
    undefined,
    "manager",
  );
  assert.ok(p.summary[0].value >= 2);
  assert.equal(
    (await req("GET", "/analytics/expenses", undefined, "manager")).statusCode,
    404,
  );
  assert.equal(
    (
      await req(
        "GET",
        "/analytics/productivity?from=2026-05-02&to=2026-05-01",
        undefined,
        "manager",
      )
    ).statusCode,
    400,
  );
});
test("employee profile aggregates activity and respects team scope", async () => {
  const aman = (await result("GET", "/users")).items.find(
    (u: any) => u.email === "aman@mrconnect.test",
  );
  const p = await result(
    "GET",
    `/users/${aman.id}/profile`,
    undefined,
    "manager",
  );
  assert.equal(p.user.email, "aman@mrconnect.test");
  assert.ok(p.kpis.calls >= 2);
  assert.ok(p.manager);
  assert.ok(p.customers.total >= 1);
  assert.ok(p.recentVisits.length >= 2);
  const priya = (await result("GET", "/users")).items.find(
    (u: any) => u.email === "priya@mrconnect.test",
  );
  assert.equal(
    (await req("GET", `/users/${aman.id}/profile`, undefined, "priya"))
      .statusCode,
    404,
  );
  assert.equal(
    (await req("GET", `/users/${priya.id}/profile`, undefined, "aman"))
      .statusCode,
    404,
  );
  assert.equal(
    (await req("GET", `/users/missing/profile`, undefined, "admin")).statusCode,
    404,
  );
});
test("export center counts rows, streams safe CSV and audits downloads", async () => {
  const c = await result("GET", "/exports", undefined, "manager");
  assert.ok(c.items.some((x: any) => x.key === "report:productivity"));
  assert.ok(c.items.some((x: any) => x.key === "records:visit" && x.rows >= 2));
  assert.ok(!c.items.some((x: any) => x.key === "report:audit"));
  const file = await req("GET", "/exports/records:visit", undefined, "manager");
  assert.equal(file.statusCode, 200);
  assert.match(file.headers["content-type"] as string, /text\/csv/);
  assert.match(
    file.headers["content-disposition"] as string,
    /mr-connect-records-visit\.csv/,
  );
  assert.ok(
    file.body.startsWith("\uFEFF") && file.body.includes("locationVerified"),
  );
  assert.equal(
    (await req("GET", "/exports/report:audit", undefined, "manager"))
      .statusCode,
    403,
  );
  assert.equal(
    (await req("GET", "/exports/nothing:here", undefined, "manager"))
      .statusCode,
    404,
  );
  const admin = await result("GET", "/exports", undefined, "admin");
  assert.ok(
    admin.history.some(
      (h: any) => h.dataset === "records:visit" && h.details.rows >= 2,
    ),
  );
  assert.equal(
    (await req("GET", "/exports", undefined, "none")).statusCode,
    401,
  );
});
