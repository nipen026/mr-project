import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, json } from "./api";
import { useWorkspace } from "./context";
import {
  Badge,
  BarChart,
  Button,
  Empty,
  Metric,
  Modal,
  Notice,
  PageTitle,
  ContentSkeleton,
  Table,
  useResource,
} from "./ui";
import { money } from "../../../packages/shared/src/index.ts";
import { DateField, SelectField, TextAreaField, TextField } from "./controls";
const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthStart = () => todayIst().slice(0, 7) + "-01";
const dateTime = (v?: string) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function useRange() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIst());
  return { from, to, setFrom, setTo, query: `from=${from}&to=${to}` };
}
function RangeFields({ r }: { r: ReturnType<typeof useRange> }) {
  return (
    <>
      <DateField
        label="From"
        value={r.from}
        max={r.to}
        onChange={(v) => v && r.setFrom(v)}
      />
      <DateField
        label="To"
        value={r.to}
        min={r.from}
        onChange={(v) => v && r.setTo(v)}
      />
    </>
  );
}
function Loaded<T>({
  state,
  children,
}: {
  state: { data?: T; error: string; loading: boolean };
  children: (data: T) => ReactNode;
}) {
  if (state.loading && !state.data) return <ContentSkeleton />;
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  return <>{state.data && children(state.data)}</>;
}
function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="back-link" to={to}>
      ← {children}
    </Link>
  );
}
function RepSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { workspace } = useWorkspace();
  if (workspace.user.role === "rep") return null;
  return (
    <SelectField
      label="Representative"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All representatives</option>
      {workspace.users
        .filter((u) => u.role === "rep")
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
    </SelectField>
  );
}
/* ---------------- A43 Export center ---------------- */
export function ExportCenter() {
  const { version } = useWorkspace();
  const range = useRange();
  const [downloaded, setDownloaded] = useState(0);
  const state = useResource(
    () => api("/exports?" + range.query),
    [range.query, version, downloaded],
  );
  return (
    <>
      <PageTitle
        eyebrow="REPORTS"
        title="Export center"
        description="Download reports and records as CSV. Every download is written to the audit log."
        actions={
          <Link className="button secondary" to="/reports">
            Back to reports
          </Link>
        }
      />
      <div className="filter-bar">
        <RangeFields r={range} />
      </div>
      <Loaded state={state}>
        {(d: any) => (
          <>
            {["Reports", "Records"].map((group) => (
              <div key={group}>
                <div className="section-label">{group.toUpperCase()}</div>
                <div className="export-grid">
                  {d.items
                    .filter((i: any) => i.group === group)
                    .map((i: any) => (
                      <article className="export-card" key={i.key}>
                        <h3>{i.title}</h3>
                        <p>{i.description}</p>
                        <span className="count">
                          {i.rows} {i.rows === 1 ? "row" : "rows"}
                        </span>
                        {i.rows ? (
                          <a
                            className="button secondary"
                            href={`/api/exports/${i.key}?${range.query}`}
                            onClick={() =>
                              setTimeout(
                                () => setDownloaded((n) => n + 1),
                                1500,
                              )
                            }
                          >
                            Download CSV
                          </a>
                        ) : (
                          <Button secondary disabled>
                            Nothing to export
                          </Button>
                        )}
                      </article>
                    ))}
                </div>
              </div>
            ))}
            <section className="card no-padding">
              <div className="card-heading">
                <h3>Recent downloads</h3>
              </div>
              <Table
                stack
                caption="Recent downloads"
                rows={d.history}
                empty={
                  <Empty
                    title="No downloads yet"
                    body="Downloaded exports will be listed here."
                  />
                }
                columns={[
                  {
                    key: "dataset",
                    label: "Export",
                    render: (r) => (
                      <strong>{r.dataset.replace(":", " · ")}</strong>
                    ),
                  },
                  { key: "actor", label: "Downloaded by" },
                  {
                    key: "range",
                    label: "Range",
                    render: (r) =>
                      r.details.from || r.details.to
                        ? `${r.details.from || "start"} → ${r.details.to || "today"}`
                        : "All dates",
                  },
                  {
                    key: "rows",
                    label: "Rows",
                    render: (r) => r.details.rows,
                  },
                  { key: "at", label: "When", render: (r) => dateTime(r.at) },
                ]}
              />
            </section>
          </>
        )}
      </Loaded>
    </>
  );
}
/* ---------------- A30 POB orders ---------------- */
export function PobTabs({ active }: { active: "orders" | "sales" }) {
  return (
    <div className="tabs">
      <Link className={active === "orders" ? "active" : ""} to="/pob">
        POB orders
      </Link>
      <Link className={active === "sales" ? "active" : ""} to="/module/sale">
        Secondary sales
      </Link>
    </div>
  );
}
export function OrdersPage() {
  const { version } = useWorkspace();
  const navigate = useNavigate();
  const range = useRange();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [verified, setVerified] = useState("");
  const query = `${range.query}&q=${encodeURIComponent(q)}&ownerId=${owner}&verified=${verified}`;
  const state = useResource(() => api("/orders?" + query), [query, version]);
  return (
    <>
      <PageTitle
        title="POB & sales activity"
        description="Orders booked during customer calls, priced by the server from the product master."
        actions={
          <a
            className="button secondary"
            href={`/api/exports/report:pob?${range.query}`}
          >
            Download CSV
          </a>
        }
      />
      <PobTabs active="orders" />
      <div className="filter-bar">
        <TextField
          label="Search"
          className="grow"
          type="search"
          placeholder="Order number, customer or representative"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <RepSelect value={owner} onChange={setOwner} />
        <RangeFields r={range} />
        <SelectField
          label="Location"
          value={verified}
          onChange={(e) => setVerified(e.target.value)}
        >
          <option value="">All calls</option>
          <option value="yes">Verified</option>
          <option value="no">Needs review</option>
        </SelectField>
      </div>
      <Loaded state={state}>
        {(d: any) => (
          <>
            <div className="metrics">
              <Metric
                label="Orders"
                value={d.summary.orders}
                hint={`${d.summary.customers} customers`}
              />
              <Metric
                label="POB value"
                value={money(d.summary.total)}
                hint={`${d.summary.units} units`}
              />
              <Metric
                label="Average order"
                value={money(d.summary.average)}
                hint="Per order"
              />
              <Metric
                label="Needs review"
                value={d.summary.unverified}
                hint="Location exceptions"
              />
            </div>
            <section className="card no-padding">
              <Table
                stack
                caption="POB orders"
                rows={d.items}
                onRow={(r) => navigate("/pob/" + r.id)}
                empty={
                  <Empty
                    title="No orders in this range"
                    body="Orders appear when representatives book POB during a call."
                  />
                }
                columns={[
                  { key: "number", label: "Order" },
                  { key: "date", label: "Date" },
                  { key: "ownerName", label: "Representative" },
                  { key: "customerName", label: "Customer" },
                  { key: "lines", label: "Lines" },
                  {
                    key: "total",
                    label: "Value",
                    render: (r) => money(r.total),
                  },
                  {
                    key: "verified",
                    label: "Location",
                    render: (r) => (
                      <Badge
                        status={r.verified ? "Verified" : "Needs review"}
                      />
                    ),
                  },
                ]}
              />
            </section>
          </>
        )}
      </Loaded>
    </>
  );
}
/* ---------------- A31 Order detail ---------------- */
export function OrderDetail() {
  const { id } = useParams();
  const state = useResource(() => api("/orders/" + id), [id]);
  return (
    <Loaded state={state}>
      {({ item: o }: any) => (
        <>
          <BackLink to="/pob">All orders</BackLink>
          <PageTitle
            title={`Order ${o.number}`}
            description={`${o.customerName} · ${o.customerType} · booked by ${o.ownerName} on ${o.date}`}
            actions={
              <Link className="button secondary" to={"/calls/" + o.id}>
                Location evidence
              </Link>
            }
          />
          <div className="metrics three">
            <Metric
              label="Order value"
              value={money(o.total)}
              hint={`${o.lines.length} product lines`}
            />
            <Metric
              label="Units"
              value={o.lines.reduce((a: number, l: any) => a + l.quantity, 0)}
              hint="Ordered"
            />
            <Metric
              label="Call location"
              value={o.verified ? "Verified" : "Needs review"}
              hint={
                o.distanceMeters === null
                  ? "No distance"
                  : `${o.distanceMeters} m from customer`
              }
            />
          </div>
          <section className="card no-padding">
            <div className="card-heading">
              <h3>Order lines</h3>
            </div>
            <div className="table-wrap stack">
              <table>
                <caption className="sr-only">Order lines</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Unit price</th>
                    <th scope="col">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l: any) => (
                    <tr key={l.itemId}>
                      <td data-label="Product">
                        <strong>{l.product}</strong>
                      </td>
                      <td data-label="Quantity">{l.quantity}</td>
                      <td data-label="Unit price">{money(l.unitPrice)}</td>
                      <td data-label="Line total">{money(l.total)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td data-label="Product">Order total</td>
                    <td data-label="Quantity">
                      {o.lines.reduce((a: number, l: any) => a + l.quantity, 0)}
                    </td>
                    <td data-label="Unit price" />
                    <td data-label="Line total">{money(o.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <div className="chart-grid">
            <section className="card">
              <div className="card-heading">
                <h3>Samples given</h3>
              </div>
              {o.samples.length ? (
                o.samples.map((s: any, i: number) => (
                  <div className="kv" key={i}>
                    <span>{s.product}</span>
                    <strong>{s.quantity}</strong>
                  </div>
                ))
              ) : (
                <p className="muted">No samples were given on this call.</p>
              )}
              {o.inputs.map((s: any, i: number) => (
                <div className="kv" key={"i" + i}>
                  <span>{s.item}</span>
                  <strong>{s.quantity}</strong>
                </div>
              ))}
            </section>
            <section className="card">
              <div className="card-heading">
                <h3>Call notes</h3>
              </div>
              <div className="kv">
                <span>Outcome</span>
                <strong>{o.outcome}</strong>
              </div>
              <div className="kv">
                <span>Visited</span>
                <strong>{dateTime(o.visitedAt)}</strong>
              </div>
              <p className="muted">{o.remarks}</p>
            </section>
          </div>
        </>
      )}
    </Loaded>
  );
}
/* ---------------- A28 Verification exceptions ---------------- */
const reviewTabs: [string, string][] = [
  ["", "All exceptions"],
  ["pending", "Pending review"],
  ["accepted", "Accepted"],
  ["flagged", "Flagged"],
];
export function Exceptions() {
  const { workspace, version } = useWorkspace();
  const navigate = useNavigate();
  const range = useRange();
  const [review, setReview] = useState("");
  const [owner, setOwner] = useState("");
  const query = `${range.query}&ownerId=${owner}&review=${review}`;
  const state = useResource(
    () => api("/exceptions?" + query),
    [query, version],
  );
  if (workspace.user.role === "rep") return <Navigate to="/" replace />;
  return (
    <>
      <PageTitle
        eyebrow="APPROVALS"
        title="Visit verification exceptions"
        description="Calls saved without passing the GPS checks. Review the evidence, then accept or flag each one."
        actions={
          <Link className="button secondary" to="/approvals">
            Back to approvals
          </Link>
        }
      />
      <div className="filter-bar">
        <RepSelect value={owner} onChange={setOwner} />
        <RangeFields r={range} />
      </div>
      <div className="tabs">
        {reviewTabs.map(([k, t]) => (
          <button
            key={k}
            className={review === k ? "active" : ""}
            onClick={() => setReview(k)}
          >
            {t}
          </button>
        ))}
      </div>
      <Loaded state={state}>
        {(d: any) => (
          <>
            <div className="metrics">
              <Metric
                label="Pending review"
                value={d.summary.pending}
                hint="Need a decision"
              />
              <Metric
                label="Accepted"
                value={d.summary.accepted}
                hint="Reason accepted"
              />
              <Metric
                label="Flagged"
                value={d.summary.flagged}
                hint="Follow up with the representative"
              />
              <Metric
                label="Mock locations"
                value={d.summary.mocked}
                hint="Device reported mock GPS"
              />
            </div>
            <section className="card no-padding">
              <Table
                stack
                caption="Visit verification exceptions"
                rows={d.items}
                onRow={(r) => navigate("/calls/" + r.id)}
                empty={
                  <Empty
                    title="No exceptions"
                    body="Every call in this range passed GPS verification or has no matching filter."
                  />
                }
                columns={[
                  { key: "date", label: "Date" },
                  { key: "ownerName", label: "Representative" },
                  { key: "customerName", label: "Customer" },
                  {
                    key: "reason",
                    label: "Reason given",
                    render: (r) => r.reason || "—",
                  },
                  {
                    key: "distanceMeters",
                    label: "Distance",
                    render: (r) =>
                      r.noLocation
                        ? "No GPS"
                        : r.distanceMeters === null
                          ? "—"
                          : r.distanceMeters + " m",
                  },
                  {
                    key: "review",
                    label: "Review",
                    render: (r) => (
                      <Badge
                        status={
                          r.review === "accepted"
                            ? "approved"
                            : r.review === "flagged"
                              ? "returned"
                              : "pending"
                        }
                      />
                    ),
                  },
                ]}
              />
            </section>
          </>
        )}
      </Loaded>
    </>
  );
}
/* ---------------- A47 Location evidence ---------------- */
function EvidenceMap({ ev }: { ev: any }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const first = ev.location || ev.customer;
    const m = L.map(ref.current, { scrollWheelZoom: false }).setView(
      first.latitude === null
        ? [20.5937, 78.9629]
        : [first.latitude, first.longitude],
      15,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
    const bounds: L.LatLngExpression[] = [];
    const c = ev.customer;
    if (c.latitude !== null) {
      const at: L.LatLngExpression = [c.latitude, c.longitude];
      L.circle(at, {
        radius: ev.thresholds.radius,
        color: "#087f83",
        weight: 2,
        dashArray: "6 6",
        fillOpacity: 0.08,
      }).addTo(m);
      L.circleMarker(at, {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#12313c",
        fillOpacity: 1,
      })
        .addTo(m)
        .bindTooltip("Customer location");
      const rb = L.latLng(c.latitude, c.longitude).toBounds(
        ev.thresholds.radius * 2.4,
      );
      bounds.push(rb.getSouthWest(), rb.getNorthEast());
    }
    if (ev.trail.length > 1)
      L.polyline(
        ev.trail.map((p: any) => [p.latitude, p.longitude]),
        { color: "#9bb4b8", weight: 3 },
      ).addTo(m);
    ev.trail.forEach((p: any) => bounds.push([p.latitude, p.longitude]));
    const loc = ev.location;
    if (loc) {
      const at: L.LatLngExpression = [loc.latitude, loc.longitude];
      const colour = ev.verified ? "#26804f" : "#bc3f45";
      L.circle(at, {
        radius: loc.accuracy,
        color: colour,
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(m);
      L.circleMarker(at, {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: colour,
        fillOpacity: 1,
      })
        .addTo(m)
        .bindTooltip("Location at time of call");
      bounds.push(at);
    }
    if (bounds.length)
      m.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 17 });
    else m.setView([20.5937, 78.9629], 4);
    return () => {
      m.remove();
    };
  }, [ev]);
  return (
    <div
      ref={ref}
      className="evidence-map"
      role="img"
      aria-label="Map of the customer location, the call location and nearby trail"
    />
  );
}
export function Evidence() {
  const { id } = useParams();
  const { notify } = useWorkspace();
  const [reload, setReload] = useState(0);
  const state = useResource(
    () => api("/visits/" + id + "/evidence"),
    [id, reload],
  );
  const [decision, setDecision] = useState("accept");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api(
        "/visits/" + id + "/review",
        json("POST", { decision, note }, crypto.randomUUID()),
      );
      notify(
        decision === "accept" ? "Exception accepted" : "Exception flagged",
      );
      setNote("");
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Loaded state={state}>
      {(ev: any) => (
        <>
          <BackLink to="/exceptions">Verification exceptions</BackLink>
          <PageTitle
            eyebrow="CALLS & TRACKING"
            title="Visit location evidence"
            description={`${ev.customerName} · ${ev.customerType} · ${ev.ownerName} · ${dateTime(ev.visitedAt)}`}
            actions={
              <Badge status={ev.verified ? "Verified" : "Needs review"} />
            }
          />
          <div className="split">
            <section className="card">
              <div className="card-heading">
                <h3>Map</h3>
                <small>
                  Dashed circle = {ev.thresholds.radius} m allowed radius
                </small>
              </div>
              {ev.customer.latitude === null && !ev.location ? (
                <Empty
                  title="No location data"
                  body="This call has no GPS fix and the customer has no saved location."
                />
              ) : (
                <EvidenceMap ev={ev} />
              )}
              {ev.customer.address && (
                <p className="card-note">
                  Customer address: {ev.customer.address}
                </p>
              )}
            </section>
            <div className="stack-col">
              <section className="card">
                <div className="card-heading">
                  <h3>Verification checks</h3>
                </div>
                <ul className="check-list">
                  {ev.checks.map((c: any) => (
                    <li key={c.key}>
                      <span
                        className={c.passed ? "check-mark" : "check-mark fail"}
                        aria-hidden="true"
                      >
                        {c.passed ? "✓" : "✕"}
                      </span>
                      <span>
                        <b>
                          {c.label}
                          <span className="sr-only">
                            {c.passed ? " — passed" : " — failed"}
                          </span>
                        </b>
                        {c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {ev.exceptionReason && (
                <section className="card">
                  <div className="card-heading">
                    <h3>Reason given</h3>
                  </div>
                  <p className="muted">{ev.exceptionReason}</p>
                </section>
              )}
              {!ev.verified && (
                <section className="card">
                  <div className="card-heading">
                    <h3>Review</h3>
                  </div>
                  {ev.review && (
                    <div className="history">
                      <p>
                        <strong>
                          {ev.review.status === "accepted"
                            ? "Accepted"
                            : "Flagged"}
                        </strong>{" "}
                        by {ev.review.byName} · {dateTime(ev.review.at)}
                      </p>
                      <p>{ev.review.note}</p>
                    </div>
                  )}
                  {ev.canReview ? (
                    <>
                      {error && <Notice tone="error">{error}</Notice>}
                      <SelectField
                        label="Decision"
                        id="review-decision"
                        value={decision}
                        onChange={(e) => setDecision(e.target.value)}
                      >
                        <option value="accept">Accept the reason</option>
                        <option value="flag">Flag for follow-up</option>
                      </SelectField>
                      <TextAreaField
                        label="Note (required)"
                        id="review-note"
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <Button
                        disabled={busy || note.trim().length < 5}
                        onClick={submit}
                      >
                        {ev.review ? "Update review" : "Save review"}
                      </Button>
                    </>
                  ) : (
                    !ev.review && (
                      <p className="muted">
                        Only a manager can review this exception.
                      </p>
                    )
                  )}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </Loaded>
  );
}
/* ---------------- A33 to A36 Visual reports ---------------- */
export const visualReports = [
  "productivity",
  "deviations",
  "missed-coverage",
  "product-reach",
];
const pretty = (k: string) =>
  k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
export function VisualReport({
  type,
  from,
  to,
}: {
  type: string;
  from: string;
  to: string;
}) {
  const { version } = useWorkspace();
  const state = useResource(
    () => api(`/analytics/${type}?from=${from}&to=${to}`),
    [type, from, to, version],
  );
  return (
    <Loaded state={state}>
      {(d: any) => (
        <>
          <div className="metrics">
            {d.summary.map((s: any) => (
              <Metric
                key={s.label}
                label={s.label}
                value={s.value}
                hint={s.hint}
              />
            ))}
          </div>
          <div className="chart-grid">
            {d.charts.map((c: any) => (
              <BarChart
                key={c.title}
                title={c.title}
                items={c.items}
                format={(n) => (c.unit === "₹" ? money(n) : String(n))}
                hint={c.unit === "₹" ? undefined : c.unit}
              />
            ))}
          </div>
          <section className="card no-padding">
            <div className="card-heading">
              <h3>Detail</h3>
            </div>
            <Table
              stack
              caption="Report detail"
              rows={d.rows}
              empty={
                <Empty
                  title="Nothing to report"
                  body="No rows match this date range."
                />
              }
              columns={Object.keys(d.rows[0] || { result: "" }).map((k) => ({
                key: k,
                label: pretty(k),
                render: (r: any) =>
                  k === "pob" ? money(r[k]) : String(r[k] ?? "—"),
              }))}
            />
          </section>
        </>
      )}
    </Loaded>
  );
}
/* ---------------- A04 Employee profile ---------------- */
export function EmployeeProfile() {
  const { id } = useParams();
  const { version } = useWorkspace();
  const range = useRange();
  const state = useResource(
    () => api(`/users/${id}/profile?${range.query}`),
    [id, range.query, version],
  );
  return (
    <>
      <BackLink to="/team">Field team</BackLink>
      <div className="filter-bar">
        <RangeFields r={range} />
      </div>
      <Loaded state={state}>
        {(p: any) => (
          <>
            <section className="profile-head">
              <span className="avatar" aria-hidden="true">
                {p.user.name
                  .split(" ")
                  .map((x: string) => x[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <h1>{p.user.name}</h1>
                <p>
                  {p.user.role} · {p.user.email} ·{" "}
                  {p.territory || "No HQ assigned"}
                </p>
                <p>
                  Reports to{" "}
                  {p.manager ? (
                    <Link className="text-button" to={"/team/" + p.manager.id}>
                      {p.manager.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {p.team.length > 0 && ` · ${p.team.length} direct reports`}
                </p>
              </div>
              <div className="actions">
                <Badge status={p.user.active ? "active" : "Disabled"} />
                <Link className="button secondary" to="/tracking">
                  Open tracking
                </Link>
              </div>
            </section>
            <div className="metrics">
              <Metric
                label="Calls"
                value={p.kpis.calls}
                hint={`${p.kpis.doctorCalls} doctor calls`}
              />
              <Metric
                label="Verified calls"
                value={p.kpis.verifiedRate + "%"}
                hint="GPS evidence accepted"
              />
              <Metric
                label="POB value"
                value={money(p.kpis.pob)}
                hint={`${p.kpis.workedDays} worked ${p.kpis.workedDays === 1 ? "day" : "days"}`}
              />
              <Metric
                label="Expenses"
                value={money(p.kpis.expenses)}
                hint={`${p.kpis.pendingApprovals} awaiting approval`}
              />
            </div>
            <div className="split">
              <section className="card no-padding">
                <div className="card-heading">
                  <h3>Recent calls</h3>
                </div>
                <Table
                  stack
                  caption="Recent calls"
                  rows={p.recentVisits}
                  empty={
                    <Empty
                      title="No calls in this range"
                      body="Calls recorded by this person will appear here."
                    />
                  }
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "customerName", label: "Customer" },
                    { key: "outcome", label: "Outcome" },
                    {
                      key: "orderTotal",
                      label: "POB",
                      render: (r) => money(r.orderTotal),
                    },
                    {
                      key: "id",
                      label: "Evidence",
                      render: (r) => (
                        <Link className="text-button" to={"/calls/" + r.id}>
                          {r.verified ? "Verified" : "Needs review"} →
                        </Link>
                      ),
                    },
                  ]}
                />
              </section>
              <div className="stack-col">
                <section className="card">
                  <div className="card-heading">
                    <h3>Customers</h3>
                  </div>
                  <div className="kv">
                    <span>Assigned</span>
                    <strong>{p.customers.total}</strong>
                  </div>
                  <div className="kv">
                    <span>Doctors</span>
                    <strong>{p.customers.doctors}</strong>
                  </div>
                  <div className="kv">
                    <span>Chemists</span>
                    <strong>{p.customers.chemists}</strong>
                  </div>
                  <div className="kv">
                    <span>Hospitals & stockists</span>
                    <strong>{p.customers.others}</strong>
                  </div>
                </section>
                <section className="card">
                  <div className="card-heading">
                    <h3>Today's tracking</h3>
                  </div>
                  {p.tracking ? (
                    <>
                      <div className="kv">
                        <span>State</span>
                        <strong>{p.tracking.state.replace("_", " ")}</strong>
                      </div>
                      <div className="kv">
                        <span>Distance</span>
                        <strong>{p.tracking.km} km</strong>
                      </div>
                      <div className="kv">
                        <span>Last fix</span>
                        <strong>
                          {dateTime(p.tracking.lastFix?.observedAt)}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <p className="muted">
                      Tracking applies to representatives only.
                    </p>
                  )}
                </section>
                <section className="card">
                  <div className="card-heading">
                    <h3>Requests</h3>
                  </div>
                  {(["expense", "leave", "dcr"] as const).map((k) => (
                    <div className="kv" key={k}>
                      <span>
                        {
                          {
                            expense: "Expenses",
                            leave: "Leave",
                            dcr: "Daily reports",
                          }[k]
                        }
                      </span>
                      <strong>
                        {Object.entries(p.statuses[k])
                          .map(([s, n]) => `${n} ${s}`)
                          .join(" · ") || "None"}
                      </strong>
                    </div>
                  ))}
                </section>
              </div>
            </div>
            <div className="chart-grid">
              <section className="card no-padding">
                <div className="card-heading">
                  <h3>Daily reports</h3>
                </div>
                <Table
                  stack
                  caption="Daily reports"
                  rows={p.recentReports}
                  empty={
                    <Empty
                      title="No reports"
                      body="Submitted daily reports will appear here."
                    />
                  }
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "visits", label: "Calls" },
                    { key: "pob", label: "POB", render: (r) => money(r.pob) },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Badge status={r.status} />,
                    },
                  ]}
                />
              </section>
              <section className="card no-padding">
                <div className="card-heading">
                  <h3>Stock held</h3>
                </div>
                <Table
                  stack
                  caption="Stock held"
                  rows={p.inventory}
                  empty={
                    <Empty
                      title="No stock"
                      body="Acknowledged challans add samples and inputs here."
                    />
                  }
                  columns={[
                    { key: "name", label: "Item" },
                    { key: "itemType", label: "Type" },
                    { key: "quantity", label: "Quantity" },
                  ]}
                />
              </section>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
/* ---------------- Support requests (mobile help, access and reset) ------------- */
const ticketTabs: [string, string][] = [
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["resolved", "Resolved"],
  ["", "All"],
];
const ticketBadge = (s: string) =>
  s === "resolved" ? "approved" : s === "in_progress" ? "draft" : "pending";
export function SupportRequests() {
  const { notify, version } = useWorkspace();
  const [status, setStatus] = useState("open");
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<any>();
  const state = useResource(
    () => api("/support/tickets?status=" + status),
    [status, reload, version],
  );
  return (
    <>
      <div className="tabs">
        {ticketTabs.map(([k, t]) => (
          <button
            key={k}
            className={status === k ? "active" : ""}
            onClick={() => setStatus(k)}
          >
            {t}
          </button>
        ))}
      </div>
      <Loaded state={state}>
        {(d: any) => (
          <section className="card no-padding">
            <Table
              stack
              caption="Support requests"
              rows={d.items}
              onRow={setDetail}
              empty={
                <Empty
                  title="No requests"
                  body="Help, access and password-reset requests from the field app appear here."
                />
              }
              columns={[
                { key: "code", label: "Ref" },
                {
                  key: "kind",
                  label: "Type",
                  render: (r) =>
                    r.kind === "access_reset" ? "Access reset" : r.category,
                },
                {
                  key: "requesterName",
                  label: "From",
                  render: (r) => r.requesterName || r.contact,
                },
                { key: "subject", label: "Subject" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Badge status={ticketBadge(r.status)} />,
                },
                {
                  key: "createdAt",
                  label: "Raised",
                  render: (r) => dateTime(r.createdAt),
                },
              ]}
            />
          </section>
        )}
      </Loaded>
      {detail && (
        <TicketDialog
          ticket={detail}
          onClose={() => setDetail(undefined)}
          onSaved={() => {
            setDetail(undefined);
            setReload((n) => n + 1);
            notify("Request updated");
          }}
        />
      )}
    </>
  );
}
function TicketDialog({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(ticket.status);
  const [response, setResponse] = useState(ticket.response || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(
        "/support/tickets/" + ticket.id,
        json("PUT", { status, response }, crypto.randomUUID()),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`${ticket.code} · ${ticket.subject}`} onClose={onClose} wide>
      <dl className="details">
        <div>
          <dt>From</dt>
          <dd>{ticket.requesterName || "Unknown user"}</dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>{ticket.contact}</dd>
        </div>
        <div>
          <dt>Raised</dt>
          <dd>{dateTime(ticket.createdAt)}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>{ticket.reference || "—"}</dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>Message</dt>
          <dd>{ticket.message}</dd>
        </div>
      </dl>
      {ticket.kind === "access_reset" && (
        <Notice>
          To reset this person's password, open Field team, choose the employee
          and set a temporary password. They must change it at next sign-in.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <SelectField
        label="Status"
        id="ticket-status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
      </SelectField>
      <TextAreaField
        label="Response shown to the employee in the app"
        id="ticket-response"
        rows={3}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
      />
      <div className="form-actions">
        <Button secondary onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
