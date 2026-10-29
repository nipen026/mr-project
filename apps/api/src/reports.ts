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
          uniqueCustomers: new Set(calls.map((v) => v.customerId)).size,
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
