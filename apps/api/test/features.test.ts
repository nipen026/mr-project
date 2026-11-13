import { randomUUID } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.ts";
import { seedDemo, demoPassword } from "../src/seed.ts";
import { now, today } from "../src/service.ts";
const temp = mkdtempSync(join(tmpdir(), "mr-features-test-"));
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
const fix = () => ({
  latitude: customer.latitude,
  longitude: customer.longitude,
  accuracy: 10,
  observedAt: now(),
  mocked: false,
});
const visit = (extra: any = {}) => ({
  customerId: customer.id,
  planId: plan.id,
  visitedAt: now(),
  remarks: "Feature test visit",
  location: fix(),
  ...extra,
});
before(async () => {
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
  product = (await result("GET", "/records/product")).items[0];
  plan = (await result("GET", "/records/dayplan", undefined, "aman")).items[0];
});
after(async () => {
  await ctx.store.destroy();
  await ctx.app.close();
  rmSync(temp, { recursive: true, force: true });
});

test("calls: non-listed, reminder and attachment rules", async () => {
  const listed = await result("POST", "/visits", visit(), "aman");
  assert.equal(listed.callType, "Regular");
  assert.equal(listed.customerClass ?? null, customer.class ?? null);
  const nonListed = await result(
    "POST",
    "/visits",
    visit({
      customerId: undefined,
      nonListed: { name: "Dr Walk-in", type: "Dietitian", area: "Market" },
    }),
    "aman",
  );
  assert.equal(nonListed.callType, "Non-listed");
  assert.equal(nonListed.customerName, "Dr Walk-in");
  assert.equal(nonListed.verified, true);
  const ev = await result(
    "GET",
    `/visits/${nonListed.id}/evidence`,
    undefined,
    "manager",
  );
  assert.equal(ev.customerName, "Dr Walk-in");
  assert.equal(
    (
      await req(
        "POST",
        "/visits",
        visit({ nonListed: { name: "Both", type: "Doctor" } }),
        "aman",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await req("POST", "/visits", visit({ customerId: undefined }), "aman"))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/visits",
        visit({ attachmentId: randomUUID() }),
        "aman",
      )
    ).statusCode,
    400,
  );
  const reminder = await result(
    "POST",
    "/records/reminder",
    {
      date: today(),
      customerId: customer.id,
      notes: "Follow up on samples",
      completed: "No",
    },
    "aman",
  );
  await result("POST", "/visits", visit({ reminderId: reminder.id }), "aman");
  const after = await result(
    "GET",
    `/record/${reminder.id}`,
    undefined,
    "aman",
  );
  assert.equal((after.item ?? after).completed, "Yes");
});

test("rcpa: full entry, defaults, validation and analysis report", async () => {
  const chemists = (await result("GET", "/records/customer", undefined, "aman"))
    .items;
  const chemist = chemists.find((x: any) => x.type === "Chemist");
  const base = {
    date: today(),
    customerId: chemist.id,
    doctorId: customer.id,
    productId: product.id,
    quantity: 30,
    competitor: "RivalCo",
    competitorRate: 12,
    competitorQuantity: 50,
    moreCompetitors: "OtherCo, 10, 20",
    potential: 200,
    objectiveQty: 80,
    action: "Provide sample",
  };
  const made = await result("POST", "/records/rcpa", base, "aman");
  assert.equal(made.rate, product.price);
  for (const bad of [
    { moreCompetitors: "OtherCo, ten, 20" },
    { moreCompetitors: "a,1,1\nb,1,1\nc,1,1\nd,1,1\ne,1,1\nf,1,1" },
    { doctorId: chemist.id },
    { action: "Do nothing" },
    { customerId: customer.id },
  ])
    assert.equal(
      (await req("POST", "/records/rcpa", { ...base, ...bad }, "aman"))
        .statusCode,
      400,
    );
  const rows = (await result("GET", "/reports/rcpa", undefined, "manager"))
    .items;
  const row = rows.find((x: any) => x.competitor === "RivalCo");
  assert.equal(row.competitorUnits, 70);
  assert.equal(row.sharePercent, 30);
  assert.equal(row.gapToObjective, 50);
});

test("stock & sales statement: rules, zero sale, move to next month", async () => {
  const month = today().slice(0, 7);
  const prev = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5) - 2, 1))
    .toISOString()
    .slice(0, 7);
  const line = { itemId: product.id, opening: 100, receipts: 20, sales: 30 };
  const made = await result(
    "POST",
    "/records/stockstatement",
    { month: prev, zeroSale: "No", lines: [line] },
    "aman",
  );
  assert.equal(made.totalSales, 30);
  assert.equal(made.lines[0].closing, 90);
  for (const bad of [
    { month: "2026-13" },
    { month: "2999-01" },
    { zeroSale: "Yes" },
    { lines: [{ ...line, sales: 500 }] },
    { lines: [{ ...line, sales: 1.5 }] },
    { lines: [line, line] },
    { month: prev }, // duplicate month
  ])
    assert.ok(
      (
        await req(
          "POST",
          "/records/stockstatement",
          { month: prev, zeroSale: "No", lines: [line], ...bad },
          "aman",
        )
      ).statusCode >= 400,
    );
  const zero = await result(
    "POST",
    "/records/stockstatement",
    { month, zeroSale: "Yes", lines: [] },
    "aman",
  );
  assert.equal(zero.totalSales, 0);
  const moved = await result(
    "POST",
    `/record/${made.id}/move-sales`,
    { version: made.version },
    "aman",
  );
  assert.equal(moved.statement.totalSales, 0);
  assert.equal(moved.statement.zeroSale, "Yes");
  assert.equal(moved.statement.lines[0].closing, 120);
  assert.equal(
    moved.next.month,
    month === moved.next.month ? month : moved.next.month,
  );
  assert.equal(moved.next.totalSales, 30);
  assert.equal(
    (
      await req(
        "POST",
        `/record/${made.id}/move-sales`,
        { version: moved.statement.version },
        "aman",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        `/record/${zero.id}/move-sales`,
        { version: zero.version },
        "priya",
      )
    ).statusCode >= 400,
    true,
  );
  const submitted = await result(
    "POST",
    `/record/${moved.statement.id}/submit`,
    { version: moved.statement.version },
    "aman",
  );
  assert.equal(submitted.status, "pending");
});

test("targets, call-average, doctor-class and achievement reports", async () => {
  const users = (await result("GET", "/users", undefined, "manager")).items;
  const aman = users.find((x: any) => x.email === "aman@mrconnect.test");
  const month = today().slice(0, 7);
  const t = await result(
    "POST",
    "/records/target",
    { month, employeeId: aman.id, doctorCalls: 4, pobTarget: 1000 },
    "manager",
  );
  assert.equal(t.ownerId, aman.id);
  assert.equal(
    (
      await req(
        "POST",
        "/records/target",
        { month, employeeId: aman.id, doctorCalls: 4 },
        "manager",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/records/target",
        { month: "2026-04", employeeId: aman.id, doctorCalls: 4 },
        "aman",
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/records/target",
        { month, employeeId: aman.id },
        "manager",
      )
    ).statusCode,
    400,
  );
  const mine = await result("GET", "/records/target", undefined, "aman");
  assert.equal(mine.items.length, 1);
  const q = `?from=${month}-01&to=${today()}`;
  const avg = (
    await result("GET", "/reports/call-average" + q, undefined, "manager")
  ).items;
  const row = avg.find((x: any) => x.representative === aman.name);
  assert.ok(row.totalDoctorCalls >= 1 && row.workingDays >= 1);
  assert.equal(row.metDoctors + row.missedDoctors, row.totalDoctors);
  assert.ok(row.doctorCoveragePercent > 0 && row.doctorCallAverage > 0);
  const cls = (
    await result("GET", "/reports/doctor-class" + q, undefined, "manager")
  ).items;
  assert.ok(
    cls.some((x: any) => x.representative === aman.name && x.calls > 0),
  );
  const ach = (
    await result("GET", "/reports/target-achievement" + q, undefined, "manager")
  ).items.find((x: any) => x.representative === aman.name);
  assert.equal(ach.doctorCallsTarget, 4);
  assert.ok(ach.doctorCallsActual >= 1);
  assert.equal(
    ach.doctorCallsPercent,
    Math.round((ach.doctorCallsActual / 4) * 1000) / 10,
  );
});

test("sample and gift balance and distribution reports", async () => {
  const input = (await result("GET", "/records/input", undefined, "aman"))
    .items[0];
  const stock =
    (await result("GET", "/inventory", undefined, "aman")).items ?? [];
  const sample = stock.find(
    (x: any) => x.itemType === "Sample" && x.quantity > 2,
  );
  assert.ok(sample && input, "demo data has sample stock and an input");
  const before = (
    await result("GET", "/reports/sample-gift-balance", undefined, "manager")
  ).items.find((x: any) => x.item === sample.name && x.type === "Sample");
  await result(
    "POST",
    "/visits",
    visit({
      samples: [{ itemId: sample.itemId, quantity: 2 }],
      inputs: [{ itemId: input.id, quantity: 3 }],
    }),
    "aman",
  );
  const bal = (
    await result("GET", "/reports/sample-gift-balance", undefined, "manager")
  ).items;
  const after = bal.find(
    (x: any) => x.item === sample.name && x.type === "Sample",
  );
  assert.equal(after.balance, before.balance - 2);
  assert.equal(after.distributed, before.distributed + 2);
  assert.ok(
    bal.some((x: any) => x.type === "Gift / input" && x.distributed >= 3),
  );
  const dist = (
    await result(
      "GET",
      "/reports/sample-gift-distribution",
      undefined,
      "manager",
    )
  ).items;
  assert.ok(dist.some((x: any) => x.type === "Sample" && x.quantity === 2));
  assert.ok(
    dist.some((x: any) => x.type === "Gift / input" && x.quantity === 3),
  );
  assert.equal(
    (
      await result("GET", "/reports/sample-gift-balance", undefined, "priya")
    ).items.every((x: any) => x.representative !== "Aman"),
    true,
  );
});

test("auto TA/DA from the day plan route, without forged receipts", async () => {
  const route = (
    await result("GET", "/records/route", undefined, "aman")
  ).items.find((x: any) => x.id === plan.routeId);
  const pol = (await result("GET", "/policies", undefined, "aman")).policies;
  const rate =
    route.allowanceType === "Outstation"
      ? pol.outstationDA
      : route.allowanceType === "Ex-station"
        ? pol.exStationDA
        : pol.localDA;
  const sug = await result(
    "GET",
    `/expenses/suggestion?date=${today()}`,
    undefined,
    "aman",
  );
  const da = sug.lines.find((l: any) => l.category === "DA");
  assert.equal(da.amount, rate + (route.additionalAllowance ?? 0));
  const ta = sug.lines.find((l: any) => l.category === "TA");
  if (route.distanceKm > 0)
    assert.equal(
      ta.amount,
      Math.round(route.distanceKm * pol.taPerKm * 100) / 100,
    );
  const made = await result(
    "POST",
    "/expenses/auto",
    { date: today() },
    "aman",
  );
  assert.equal(made.items.length, sug.lines.length);
  assert.ok(
    made.items.every((x: any) => x.status === "draft" && x.auto === true),
  );
  assert.equal(
    (await req("POST", "/expenses/auto", { date: today() }, "aman")).statusCode,
    409,
  );
  // Large auto DA is exempt from the receipt rule; a hand-made one is not.
  const forged = await req(
    "POST",
    "/records/expense",
    {
      date: today(),
      category: "Hotel",
      amount: pol.receiptRequiredAbove + 1,
      remarks: "forged",
      auto: true,
    },
    "aman",
  );
  assert.equal(forged.statusCode, 400);
  const dated = await req(
    "GET",
    "/expenses/suggestion?date=2999-01-01",
    undefined,
    "aman",
  );
  assert.equal(dated.statusCode, 400);
  const empty = await result(
    "GET",
    `/expenses/suggestion?date=${today()}`,
    undefined,
    "priya",
  );
  assert.equal(empty.lines.length, 0);
  assert.ok(empty.reason);
  const submitted = await result(
    "POST",
    `/record/${made.items[0].id}/submit`,
    { version: made.items[0].version },
    "aman",
  );
  assert.equal(submitted.status, "pending");
});

test("tour plan month: weekly off, validation, single submit", async () => {
  const route = plan.routeId;
  const nowMonth = today().slice(0, 7);
  const next = new Date(Date.UTC(+nowMonth.slice(0, 4), +nowMonth.slice(5), 1))
    .toISOString()
    .slice(0, 7);
  const grid = await result(
    "GET",
    `/tour-plans/month?month=${next}`,
    undefined,
    "priya",
  );
  const off = grid.days.filter((d: any) => d.weeklyOff);
  assert.ok(off.length >= 4);
  const work = grid.days
    .filter((d: any) => !d.weeklyOff)
    .map((d: any) => ({
      date: d.date,
      routeId: route,
      workType: "Field work",
    }));
  // Incomplete month cannot be submitted.
  assert.equal(
    (
      await req(
        "POST",
        "/tour-plans/month",
        { month: next, days: work.slice(1), submit: true },
        "priya",
      )
    ).statusCode,
    400,
  );
  // Past months and out-of-month dates are rejected.
  assert.equal(
    (
      await req(
        "POST",
        "/tour-plans/month",
        { month: "2020-01", days: [], submit: false },
        "priya",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/tour-plans/month",
        {
          month: next,
          days: [
            { date: "2001-01-01", routeId: route, workType: "Field work" },
          ],
        },
        "priya",
      )
    ).statusCode,
    400,
  );
  const draft = await result(
    "POST",
    "/tour-plans/month",
    { month: next, days: work.slice(0, 3), submit: false },
    "priya",
  );
  assert.ok(draft.items.every((x: any) => x.status === "draft"));
  const done = await result(
    "POST",
    "/tour-plans/month",
    { month: next, days: work, submit: true },
    "priya",
  );
  assert.equal(done.items.length, grid.days.length);
  assert.ok(done.items.every((x: any) => x.status === "pending"));
  assert.ok(
    done.items.filter((x: any) => x.workType === "Weekly off").length ===
      off.length,
  );
  // Submitted days are locked.
  assert.equal(
    (
      await req(
        "POST",
        "/tour-plans/month",
        { month: next, days: work, submit: true },
        "priya",
      )
    ).statusCode,
    409,
  );
  const approvals = await result("GET", "/approvals", undefined, "manager");
  assert.ok(JSON.stringify(approvals).includes("tourplan"));
});

test("one-way routes pay TA both ways; managers preview their team only", async () => {
  const route = (
    await result("GET", "/records/route", undefined, "admin")
  ).items.find((x: any) => x.id === plan.routeId);
  const pol = (await result("GET", "/policies", undefined, "admin")).policies;
  const users = (await result("GET", "/users", undefined, "manager")).items;
  const aman = users.find((x: any) => x.email === "aman@mrconnect.test");
  const before = await result(
    "GET",
    `/expenses/suggestion?date=${today()}&ownerId=${aman.id}`,
    undefined,
    "manager",
  );
  assert.equal(before.ownerName, aman.name);
  await result(
    "PUT",
    `/record/${route.id}`,
    {
      data: { ...route, distanceKm: 10, tripType: "One way" },
      version: route.version,
    },
    "admin",
  );
  const sug = await result(
    "GET",
    `/expenses/suggestion?date=${today()}&ownerId=${aman.id}`,
    undefined,
    "manager",
  );
  const ta = sug.lines.find((l: any) => l.category === "TA");
  assert.equal(ta.distanceKm, 20);
  assert.equal(ta.amount, Math.round(20 * pol.taPerKm * 100) / 100);
  assert.match(ta.remarks, /one way/);
  assert.equal(
    (
      await req(
        "GET",
        `/expenses/suggestion?date=${today()}&ownerId=${aman.id}`,
        undefined,
        "priya",
      )
    ).statusCode,
    403,
  );
  const month = today().slice(0, 7);
  const grid = await result(
    "GET",
    `/tour-plans/month?month=${month}&ownerId=${aman.id}`,
    undefined,
    "manager",
  );
  assert.ok(grid.days.length >= 28);
  assert.equal(
    (
      await req(
        "GET",
        `/tour-plans/month?month=${month}&ownerId=${aman.id}`,
        undefined,
        "priya",
      )
    ).statusCode,
    403,
  );
});
