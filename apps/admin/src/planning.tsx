import { useState } from "react";
import { Link } from "react-router-dom";
import { api, json } from "./api";
import { label, useWorkspace } from "./context";
import { DateField, SelectField } from "./controls";
import {
  Badge,
  Button,
  ContentSkeleton,
  Metric,
  Notice,
  PageTitle,
  Table,
  useResource,
} from "./ui";
import { money } from "../../../packages/shared/src/index.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function monthOptions() {
  const [y, m] = todayIst().slice(0, 7).split("-").map(Number);
  return [-2, -1, 0, 1, 2, 3].map((d) => {
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    return dt.toISOString().slice(0, 7);
  });
}

/** People whose plans and claims the signed-in user may look at. */
function usePeople() {
  const { workspace } = useWorkspace();
  const people = workspace.users.filter(
    (u) => u.active && (u.role === "rep" || u.id === workspace.user.id),
  );
  return { workspace, people };
}

export function TourCalendar() {
  const { version } = useWorkspace();
  const { workspace, people } = usePeople();
  const [owner, setOwner] = useState(people[0]?.id ?? workspace.user.id);
  const [month, setMonth] = useState(todayIst().slice(0, 7));
  const { data, error, loading } = useResource(
    () => api(`/tour-plans/month?month=${month}&ownerId=${owner}`),
    [month, owner, version],
  );
  const days: any[] = data?.days ?? [];
  const planned = days.filter((d) => d.record);
  const count = (s: string) =>
    planned.filter((d) => d.record.status === s).length;
  const open = days.filter((d) => !d.weeklyOff && !d.record).length;
  return (
    <>
      <PageTitle
        title="Tour calendar"
        description="See a representative's whole month at a glance: planned routes, weekly offs and approval status."
        actions={
          <Link className="button secondary" to="/approvals">
            Review approvals
          </Link>
        }
      />
      <div className="filter-bar">
        <SelectField
          label="Representative"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          {people.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {monthOptions().map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectField>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {loading && <ContentSkeleton metrics={4} />}
      {data && (
        <>
          <div className="metrics">
            <Metric
              label="Planned days"
              value={planned.length}
              hint={`of ${days.length} days`}
            />
            <Metric
              label="Awaiting approval"
              value={count("pending")}
              hint="Pending manager decision"
            />
            <Metric
              label="Approved"
              value={count("approved")}
              hint="Locked plan"
            />
            <Metric
              label="Not planned"
              value={open}
              hint="Working days with no entry"
            />
          </div>
          <section className="card">
            <div
              className="tour-grid"
              role="grid"
              aria-label={"Tour plan " + month}
            >
              {WEEKDAYS.map((w) => (
                <div key={w} className="tour-head" role="columnheader">
                  {w}
                </div>
              ))}
              {Array.from({ length: days[0]?.weekday ?? 0 }, (_, i) => (
                <div key={"pad" + i} className="tour-cell blank" />
              ))}
              {days.map((d) => (
                <div
                  key={d.date}
                  role="gridcell"
                  className={
                    "tour-cell" +
                    (d.weeklyOff ? " off" : d.record ? "" : " empty") +
                    (d.date === todayIst() ? " today" : "")
                  }
                >
                  <strong>{Number(d.date.slice(8))}</strong>
                  {d.weeklyOff ? (
                    <small>Weekly off</small>
                  ) : d.record ? (
                    <>
                      <small>{d.record.workType}</small>
                      {d.record.routeId && (
                        <small>
                          {label(workspace, "routeId", d.record.routeId)}
                        </small>
                      )}
                      {d.record.jointWith && (
                        <small>
                          With{" "}
                          {label(workspace, "jointWith", d.record.jointWith)}
                        </small>
                      )}
                      <Badge status={d.record.status} />
                    </>
                  ) : (
                    <small>Not planned</small>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function AllowanceCalculator() {
  const { refresh, notify, version } = useWorkspace();
  const { workspace, people } = usePeople();
  const [owner, setOwner] = useState(people[0]?.id ?? workspace.user.id);
  const [date, setDate] = useState(todayIst());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(
    () => api(`/expenses/suggestion?date=${date}&ownerId=${owner}`),
    [date, owner, version, tick],
  );
  const mine = owner === workspace.user.id;
  const unclaimed = (data?.lines ?? []).filter(
    (l: any) => !data.claimed.includes(l.category),
  );
  async function create() {
    setBusy(true);
    setFailure("");
    try {
      const r = await api(
        "/expenses/auto",
        json("POST", { date }, crypto.randomUUID()),
      );
      notify(`${r.items.length} draft claim(s) created`);
      await refresh();
      setTick((t) => t + 1);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="TA/DA calculator"
        description="Preview the allowance company policy pays for a day, from the day plan's route. GPS distance is evidence only and is not used."
        actions={
          <Link className="button secondary" to="/module/expense">
            Expense claims
          </Link>
        }
      />
      <div className="filter-bar">
        <SelectField
          label="Representative"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          {people.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
        <DateField
          label="Date"
          value={date}
          max={todayIst()}
          onChange={(v) => v && setDate(v)}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {loading && <ContentSkeleton metrics={0} />}
      {data && data.reason && <Notice>{data.reason}</Notice>}
      {data && !data.reason && (
        <>
          <div className="metrics">
            <Metric label="Route" value={data.route} hint={data.ownerName} />
            <Metric
              label="Total allowance"
              value={money(data.total)}
              hint="Per company policy"
            />
            <Metric
              label="Already claimed"
              value={data.claimed.length ? data.claimed.join(", ") : "None"}
              hint="Rejected claims do not count"
            />
          </div>
          <section className="card no-padding">
            <Table
              caption="Calculated allowances"
              rows={data.lines}
              columns={[
                { key: "category", label: "Category" },
                {
                  key: "amount",
                  label: "Amount",
                  render: (r: any) => money(r.amount),
                },
                {
                  key: "distanceKm",
                  label: "Billed km",
                  render: (r: any) => r.distanceKm ?? "—",
                },
                { key: "remarks", label: "How it was calculated" },
              ]}
            />
          </section>
          {failure && <Notice tone="error">{failure}</Notice>}
          {mine ? (
            <div className="form-actions">
              <Button
                disabled={busy || unclaimed.length === 0}
                onClick={create}
              >
                {unclaimed.length === 0
                  ? "Already claimed"
                  : busy
                    ? "Creating…"
                    : "Create draft claims"}
              </Button>
            </div>
          ) : (
            <Notice>
              Claims are created by the representative from their own account,
              so this is a preview.
            </Notice>
          )}
        </>
      )}
    </>
  );
}
