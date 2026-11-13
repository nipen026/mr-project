import { Service } from "./service.ts";
import type { User } from "../../../packages/shared/src/index.ts";
export const reportNames = [
  "productivity",
  "deviations",
  "missed-coverage",
  "product-reach",
  "expenses",
  "pob",
  "sales",
  "rcpa",
  "call-average",
  "doctor-class",
  "target-achievement",
  "sample-gift-balance",
  "sample-gift-distribution",
  "inventory",
  "audit",
] as const;
export async function report(
  s: Service,
  u: User,
  type: string,
  q: Record<string, any>,
): Promise<any[]> {
  const byId = (rows: any[]) => new Map(rows.map((r) => [r.id, r]));
  switch (type) {
    case "productivity": {
      const [visits, plans, users] = await Promise.all([
        s.list(u, "visit", q),
        s.list(u, "dayplan", q),
        s.users(u),
      ]);
      return users
        .filter((x) => x.role === "rep")
        .map((x) => {
          const v = visits.filter((v) => v.ownerId === x.id);
          return {
            representative: x.name,
            calls: v.length,
            doctorCalls: v.filter((x) => x.customerType === "Doctor").length,
            verified: v.filter((x) => x.verified).length,
            days: plans.filter((p) => p.ownerId === x.id).length,
            pob: v.reduce((a, v) => a + v.orderTotal, 0),
          };
        });
    }
    case "deviations": {
      const [plans, tours, routes] = await Promise.all([
        s.list(u, "dayplan", q),
        s.list(u, "tourplan"),
        s.list(u, "route"),
      ]);
      const route = byId(routes);
      return plans.flatMap((p) => {
        const tour = tours.find(
          (t) =>
            t.date === p.date &&
            t.ownerId === p.ownerId &&
            t.status === "approved",
        );
        return tour && tour.routeId !== p.routeId
          ? [
              {
                date: p.date,
                representative: p.ownerName,
                plannedRoute: route.get(tour.routeId)?.name ?? "—",
                actualRoute: route.get(p.routeId)?.name ?? "—",
                notes: p.notes || "",
              },
            ]
          : [];
      });
    }
    case "missed-coverage": {
      const [visits, customers] = await Promise.all([
        s.list(u, "visit", q),
        s.list(u, "customer"),
      ]);
      return customers
        .filter((c) => c.type === "Doctor")
        .map((c) => {
          const actual = visits.filter((v) => v.customerId === c.id).length;
          return {
            doctor: c.name,
            area: c.area,
            required: c.frequency || 1,
            actual,
            missed: Math.max(0, (c.frequency || 1) - actual),
          };
        })
        .filter((c) => c.missed > 0);
    }
    case "product-reach": {
      const [visits, products] = await Promise.all([
        s.list(u, "visit", q),
        s.list(u, "product"),
      ]);
      return products.map((p) => {
        const calls = visits.filter((v) =>
          v.detailedProductIds?.includes(p.id),
        );
        return {
          product: p.name,
          calls: calls.length,
          uniqueCustomers: new Set(
            calls.map((v) => v.customerId).filter(Boolean),
          ).size,
          sampleUnits: visits
            .flatMap((v) => v.samples || [])
            .filter((x) => x.itemId === p.id)
            .reduce((a, x) => a + x.quantity, 0),
        };
      });
    }
    case "expenses":
      return (await s.list(u, "expense", q)).map((r) => ({
        date: r.date,
        representative: r.ownerName,
        category: r.category,
        amount: r.amount,
        status: r.status,
        remarks: r.remarks,
      }));
    case "pob": {
      const [visits, products] = await Promise.all([
        s.list(u, "visit", q),
        s.list(u, "product"),
      ]);
      const product = byId(products);
      return visits.flatMap((v) =>
        v.orderLines.map((l: any) => ({
          date: v.date,
          representative: v.ownerName,
          customer: v.customerName,
          product: product.get(l.itemId)?.name ?? "Removed item",
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
        })),
      );
    }
    case "sales": {
      const [sales, customers, products] = await Promise.all([
        s.list(u, "sale", q),
        s.list(u, "customer"),
        s.list(u, "product"),
      ]);
      const customer = byId(customers),
        product = byId(products);
      return sales.map((r) => ({
        date: r.date,
        representative: r.ownerName,
        type: r.saleType,
        customer: customer.get(r.customerId)?.name ?? "—",
        product: product.get(r.productId)?.name ?? "—",
        quantity: r.quantity,
        amount: r.amount,
      }));
    }
    case "rcpa": {
      const [rows, customers, products] = await Promise.all([
        s.list(u, "rcpa", q),
        s.list(u, "customer"),
        s.list(u, "product"),
      ]);
      const customer = byId(customers),
        product = byId(products);
      return rows.map((r) => {
        const extra = String(r.moreCompetitors || "")
          .split("\n")
          .reduce((a, l) => a + (Number(l.split(",")[2]) || 0), 0);
        const rival = (r.competitorQuantity ?? 0) + extra;
        const total = r.quantity + rival;
        return {
          date: r.date,
          representative: r.ownerName,
          chemist: customer.get(r.customerId)?.name ?? "—",
          doctor: customer.get(r.doctorId)?.name ?? "—",
          product: product.get(r.productId)?.name ?? "—",
          ourUnits: r.quantity,
          ourRate: r.rate ?? "",
          competitor: r.competitor,
          competitorUnits: rival,
          sharePercent: total
            ? Math.round((r.quantity / total) * 1000) / 10
            : 0,
          potential: r.potential ?? "",
          objective: r.objectiveQty ?? "",
          gapToObjective:
            r.objectiveQty !== undefined
              ? Math.max(0, r.objectiveQty - r.quantity)
              : "",
          action: r.action ?? "",
        };
      });
    }
    case "call-average": {
      const [visits, users, customers] = await Promise.all([
        s.list(u, "visit", q),
        s.users(u),
        s.list(u, "customer"),
      ]);
      const avg = (n: number, d: number) =>
        d ? Math.round((n / d) * 100) / 100 : 0;
      return users
        .filter((x) => x.role === "rep")
        .map((x) => {
          const mine = visits.filter((v) => v.ownerId === x.id && v.customerId);
          const days = new Set(mine.map((v) => v.date)).size;
          const doctors = customers.filter(
            (c) => c.type === "Doctor" && c.assignedTo === x.id,
          );
          const drCalls = mine.filter((v) => v.customerType === "Doctor");
          const met = new Set(drCalls.map((v) => v.customerId));
          const chem = mine.filter((v) => v.customerType === "Chemist");
          const stk = mine.filter((v) => v.customerType === "Stockist");
          return {
            representative: x.name,
            headQuarter: x.territoryName || "",
            workingDays: days,
            totalDoctorCalls: drCalls.length,
            totalDoctors: doctors.length,
            metDoctors: met.size,
            missedDoctors: doctors.filter((c) => !met.has(c.id)).length,
            doctorCoveragePercent: doctors.length
              ? Math.round((met.size / doctors.length) * 1000) / 10
              : 0,
            doctorCallAverage: avg(drCalls.length, days),
            chemistsMet: new Set(chem.map((v) => v.customerId)).size,
            chemistCallAverage: avg(chem.length, days),
            stockistCallAverage: avg(stk.length, days),
          };
        });
    }
    case "doctor-class": {
      const [visits, users, customers] = await Promise.all([
        s.list(u, "visit", q),
        s.users(u),
        s.list(u, "customer"),
      ]);
      const order = ["A+", "A", "B", "C", "Unclassified"];
      return users
        .filter((x) => x.role === "rep")
        .flatMap((x) =>
          order.flatMap((cls) => {
            const docs = customers.filter(
              (c) =>
                c.type === "Doctor" &&
                c.assignedTo === x.id &&
                (c.class || "Unclassified") === cls,
            );
            if (!docs.length) return [];
            const ids = new Set(docs.map((d) => d.id));
            const calls = visits.filter(
              (v) => v.ownerId === x.id && ids.has(v.customerId),
            );
            const met = new Set(calls.map((v) => v.customerId));
            const required = docs.reduce((a, d) => a + (d.frequency ?? 0), 0);
            return [
              {
                representative: x.name,
                class: cls,
                vip: cls === "A+" || cls === "A" ? "Yes" : "No",
                doctors: docs.length,
                met: met.size,
                missed: docs.length - met.size,
                calls: calls.length,
                requiredCalls: required,
                frequencyCompliancePercent: required
                  ? Math.min(
                      100,
                      Math.round((calls.length / required) * 1000) / 10,
                    )
                  : "",
              },
            ];
          }),
        );
    }
    case "target-achievement": {
      const [targets, visits, sales] = await Promise.all([
        s.list(u, "target"),
        s.list(u, "visit"),
        s.list(u, "sale"),
      ]);
      const from = (q.from ?? "").slice(0, 7),
        to = (q.to ?? "").slice(0, 7);
      const pct = (a: number, t?: number) =>
        t ? Math.round((a / t) * 1000) / 10 : "";
      return targets
        .filter((t) => (!from || t.month >= from) && (!to || t.month <= to))
        .map((t) => {
          const mine = visits.filter(
            (v) => v.ownerId === t.employeeId && v.date.startsWith(t.month),
          );
          const dr = mine.filter((v) => v.customerType === "Doctor").length;
          const ch = mine.filter((v) => v.customerType === "Chemist").length;
          const pob = mine.reduce((a, v) => a + (v.orderTotal || 0), 0);
          const sale = sales
            .filter(
              (x) => x.ownerId === t.employeeId && x.date.startsWith(t.month),
            )
            .reduce((a, x) => a + x.amount, 0);
          return {
            month: t.month,
            representative: t.ownerName,
            doctorCallsTarget: t.doctorCalls ?? "",
            doctorCallsActual: dr,
            doctorCallsPercent: pct(dr, t.doctorCalls),
            chemistCallsTarget: t.chemistCalls ?? "",
            chemistCallsActual: ch,
            chemistCallsPercent: pct(ch, t.chemistCalls),
            pobTarget: t.pobTarget ?? "",
            pobActual: Math.round(pob * 100) / 100,
            pobPercent: pct(pob, t.pobTarget),
            salesTarget: t.salesTarget ?? "",
            salesActual: Math.round(sale * 100) / 100,
            salesPercent: pct(sale, t.salesTarget),
          };
        });
    }
    case "sample-gift-balance": {
      const [stock, ledger, names] = await Promise.all([
        s.inventory(u),
        s.store.all(
          "SELECT user_id,item_type,item_id,delta,created_at FROM stock_ledger WHERE tenant_id=?",
          u.tenantId,
        ),
        s.users(u),
      ]);
      const ids = new Set(names.map((x) => x.id));
      const inRange = (d: string) =>
        (!q.from || d.slice(0, 10) >= q.from) &&
        (!q.to || d.slice(0, 10) <= q.to);
      const rows = new Map<string, any>();
      const row = (
        userId: string,
        type: string,
        item: string,
        who: string,
        name: string,
      ) => {
        const key = [userId, type, item].join("|");
        if (!rows.has(key))
          rows.set(key, {
            representative: who,
            type: type === "Input" ? "Gift / input" : "Sample",
            item: name,
            received: 0,
            distributed: 0,
            balance: 0,
          });
        return rows.get(key);
      };
      for (const x of stock)
        row(x.userId, x.itemType, x.itemId, x.ownerName, x.name).balance =
          x.quantity;
      const nameOf = new Map(stock.map((x) => [x.itemId, x.name]));
      const who = new Map(names.map((x) => [x.id, x.name]));
      for (const l of ledger) {
        if (!ids.has(l.user_id) || !inRange(l.created_at)) continue;
        const r = row(
          l.user_id,
          l.item_type,
          l.item_id,
          who.get(l.user_id) ?? "—",
          nameOf.get(l.item_id) ?? "—",
        );
        if (l.delta > 0) r.received += l.delta;
        else r.distributed += -l.delta;
      }
      return [...rows.values()].sort((a, b) =>
        (a.representative + a.type + a.item).localeCompare(
          b.representative + b.type + b.item,
        ),
      );
    }
    case "sample-gift-distribution": {
      const [visits, products, inputs] = await Promise.all([
        s.list(u, "visit", q),
        s.list(u, "product"),
        s.list(u, "input"),
      ]);
      const product = byId(products),
        input = byId(inputs);
      return visits.flatMap((v) => [
        ...(v.samples || []).map((l: any) => ({
          date: v.date,
          representative: v.ownerName,
          customer: v.customerName,
          class: v.customerClass ?? "",
          type: "Sample",
          item: product.get(l.itemId)?.name ?? "Removed item",
          quantity: l.quantity,
        })),
        ...(v.inputs || []).map((l: any) => ({
          date: v.date,
          representative: v.ownerName,
          customer: v.customerName,
          class: v.customerClass ?? "",
          type: "Gift / input",
          item: input.get(l.itemId)?.name ?? "Removed item",
          quantity: l.quantity,
        })),
      ]);
    }
    case "inventory":
      return s.inventory(u);
    case "audit":
      return (
        await s.store.all(
          "SELECT a.action,a.entity_id AS entity,a.details,a.created_at AS date,u.name AS actor FROM audit a LEFT JOIN users u ON a.actor_id=u.id WHERE a.tenant_id=? ORDER BY a.created_at DESC LIMIT 2000",
          u.tenantId,
        )
      )
        .filter((r) => !q.from || r.date.slice(0, 10) >= q.from)
        .filter((r) => !q.to || r.date.slice(0, 10) <= q.to);
    default:
      return [];
  }
}
export function csv(rows: Record<string, any>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : ["No records"];
  const cell = (v: any) => {
    let str =
      v === null || v === undefined
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    if (/^(?:\s*[=+\-@]|[\t\r])/.test(str)) str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n")
  );
}
