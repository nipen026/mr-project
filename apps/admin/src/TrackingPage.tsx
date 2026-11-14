import { useEffect, useState } from "react";
import { api } from "./api";
import { useWorkspace } from "./context";
import {
  Badge,
  Button,
  Empty,
  Metric,
  Notice,
  PageTitle,
  ContentSkeleton,
  Table,
  useResource,
} from "./ui";
import { DateField, SelectField } from "./controls";
import { RouteReplay } from "./RouteReplay";
export function TrackingPage() {
  const { workspace, version } = useWorkspace();
  const users = workspace.users.filter((u) => u.role === "rep");
  const [employee, setEmployee] = useState(users[0]?.id || workspace.user.id);
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(
    () => api("/tracking/" + employee + "?date=" + date),
    [employee, date, version, tick],
  );
  const { data: overview } = useResource(
    () => api("/tracking?date=" + date),
    [date, version, tick],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  const points = data?.points || [];
  return (
    <>
      <PageTitle
        title="Field activity map"
        description="Recorded GPS evidence, route replay and gaps. Locations refresh every 30 seconds."
        actions={
          <Button secondary onClick={() => setTick((t) => t + 1)}>
            Refresh activity
          </Button>
        }
      />
      <div className="filter-bar">
        <SelectField
          label="Representative"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
        <DateField
          label="Activity date"
          value={date}
          onChange={(v) => setDate(v)}
        />
        {data && <Badge status={data.state.replaceAll("_", " ")} />}
      </div>
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : loading && !data ? (
        <ContentSkeleton metrics={0} rows={4} />
      ) : (
        data && (
          <>
            <div className="metrics">
              <Metric
                label="Recorded distance"
                value={data.km + " km"}
                hint="Gaps and poor fixes excluded"
              />
              <Metric
                label="Location points"
                value={points.length}
                hint={`${points.filter((p: any) => p.mocked).length} marked as mock locations`}
              />
              <Metric
                label="Last location fix"
                value={
                  data.lastFix
                    ? new Date(data.lastFix.observed_at).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "—"
                }
                hint={
                  data.lastFix
                    ? "Accuracy ±" + Math.round(data.lastFix.accuracy) + " m"
                    : "Awaiting location evidence"
                }
              />
              <Metric
                label="Recorded gaps"
                value={data.gaps.length}
                hint="Reason may be unknown"
              />
            </div>
            <div className="tracking-grid">
              <section className="card">
                <div className="card-heading">
                  <h3>Route replay</h3>
                  <span className="muted">{points.length} captured fixes</span>
                </div>
                {points.length ? (
                  <>
                    <RouteReplay points={points} gaps={data.gaps} />
                  </>
                ) : (
                  <Empty
                    title="No location points for this date"
                    body={
                      data.state === "not_started"
                        ? "No shift was started. Start a shift from the Android app after submitting a day plan."
                        : "The shift has no uploaded location fixes yet. Check permissions, location services and sync on the phone."
                    }
                  />
                )}
              </section>
              <section className="card">
                <h3>Shift & evidence</h3>
                <dl className="details single">
                  <div>
                    <dt>Shift started</dt>
                    <dd>
                      {data.shift
                        ? new Date(data.shift.started_at).toLocaleString()
                        : "Not started"}
                    </dd>
                  </div>
                  <div>
                    <dt>Shift ended</dt>
                    <dd>
                      {data.shift?.ended_at
                        ? new Date(data.shift.ended_at).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last server receipt</dt>
                    <dd>
                      {data.lastFix
                        ? new Date(data.lastFix.received_at).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                </dl>
                {data.gaps.map((g: any, i: number) => (
                  <Notice key={i} tone="warning">
                    {new Date(g.from).toLocaleTimeString()} –{" "}
                    {new Date(g.to).toLocaleTimeString()} · {g.minutes} minute
                    gap
                  </Notice>
                ))}
                {data.events.map((e: any) => (
                  <p key={e.id}>
                    {e.event.replaceAll("_", " ")}
                    <br />
                    <small>{new Date(e.observed_at).toLocaleString()}</small>
                  </p>
                ))}
              </section>
            </div>
          </>
        )
      )}
      {overview && (
        <section className="card no-padding">
          <div className="card-heading">
            <h3>Mobile area tracking</h3>
          </div>
          <Table
            rows={overview.items}
            columns={[
              { key: "name", label: "Representative" },
              {
                key: "state",
                label: "Tracking",
                render: (r) => <Badge status={r.state.replaceAll("_", " ")} />,
              },
              { key: "km", label: "Recorded km" },
              {
                key: "lastFix",
                label: "Last fix",
                render: (r) =>
                  r.lastFix
                    ? new Date(r.lastFix.observed_at).toLocaleString()
                    : "—",
              },
            ]}
            onRow={(r) => {
              setEmployee(r.userId);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </section>
      )}
    </>
  );
}
