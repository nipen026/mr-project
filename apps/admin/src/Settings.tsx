import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, json } from "./api";
import { useWorkspace } from "./context";
import {
  Button,
  ContentSkeleton,
  Notice,
  PageTitle,
  Table,
  useResource,
} from "./ui";
import { SupportRequests } from "./insights";
import { Permissions } from "./Permissions";
import { SelectField, TextField } from "./controls";
const policyLabels: Record<string, string> = {
  gpsRadiusMeters: "Visit verification radius (m)",
  maxAccuracyMeters: "Maximum GPS uncertainty (m)",
  staleAfterMinutes: "Missing-update threshold (minutes)",
  reportDeadlineDays: "Reporting window (days)",
  receiptRequiredAbove: "Receipt required from (₹)",
  localDA: "Local DA (₹)",
  exStationDA: "Ex-station DA (₹)",
  outstationDA: "Outstation DA (₹)",
  taPerKm: "TA per km (₹)",
  trackingIntervalSeconds: "Tracking interval (seconds)",
  retentionDays: "Location retention period (days)",
};
const policyGroups: { title: string; help: string; keys: string[] }[] = [
  {
    title: "Visit verification",
    help: "How strictly a call's GPS evidence is checked before it counts as verified.",
    keys: ["gpsRadiusMeters", "maxAccuracyMeters"],
  },
  {
    title: "Reporting",
    help: "When reports are due and when a person is treated as out of touch.",
    keys: ["reportDeadlineDays", "staleAfterMinutes", "weeklyOffDay"],
  },
  {
    title: "Allowances & expenses",
    help: "Rates used by the TA/DA calculator and the receipt rule for claims.",
    keys: [
      "localDA",
      "exStationDA",
      "outstationDA",
      "taPerKm",
      "receiptRequiredAbove",
    ],
  },
  {
    title: "Location tracking",
    help: "How often phones report their position and how long points are kept.",
    keys: ["trackingIntervalSeconds", "retentionDays"],
  },
];
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "No weekly off",
];
export function Settings() {
  const { workspace, refresh, notify, version } = useWorkspace();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") || "policies";
  const [values, setValues] = useState(workspace.policies);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: integrations, loading: integrationsLoading } = useResource(
    () =>
      workspace.user.role === "admin"
        ? api("/integrations")
        : Promise.resolve({ items: [] }),
    [version],
  );
  const { data: audit, loading: auditLoading } = useResource(
    () =>
      workspace.user.role === "admin"
        ? api("/reports/audit")
        : Promise.resolve({ items: [] }),
    [version],
  );
  const {
    data: roles,
    loading: rolesLoading,
    error: rolesError,
  } = useResource(() => api("/roles"), [version]);
  return (
    <>
      <PageTitle
        title="Workspace settings"
        description="Reporting policies, access permissions and connected services."
      />
      <div className="tabs">
        {[
          "policies",
          "roles",
          ...(workspace.user.role === "admin" ? ["permissions"] : []),
          "integrations",
          "audit",
          ...(workspace.user.role === "admin" ? ["support"] : []),
          "account",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setSearch({ tab: t })}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "policies" && (
        <section className="card">
          <h3>Company reporting policies</h3>
          <p className="muted">
            These are proposed defaults. Changes apply to new submissions and
            new tracking sessions.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(
                  "/policies",
                  json("PUT", values, crypto.randomUUID()),
                );
                await refresh();
                notify("Reporting policies saved");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {policyGroups.map((g) => (
              <fieldset className="policy-group" key={g.title}>
                <legend>{g.title}</legend>
                <p className="muted">{g.help}</p>
                <div className="form-grid">
                  {g.keys
                    .filter((k) => k in values)
                    .map((key) =>
                      key === "weeklyOffDay" ? (
                        <SelectField
                          key={key}
                          label="Weekly off day"
                          id="policy-weeklyOffDay"
                          hint="Filled in automatically on tour plans"
                          disabled={workspace.user.role !== "admin"}
                          value={String(values[key])}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [key]: Number(e.target.value),
                            })
                          }
                        >
                          {weekdays.map((d, n) => (
                            <option key={d} value={n}>
                              {d}
                            </option>
                          ))}
                        </SelectField>
                      ) : (
                        <TextField
                          key={key}
                          label={policyLabels[key] || key}
                          id={"policy-" + key}
                          type="number"
                          required
                          min={key === "taPerKm" ? 0 : 1}
                          max={key === "trackingIntervalSeconds" ? 900 : 100000}
                          step="any"
                          disabled={workspace.user.role !== "admin"}
                          value={values[key]}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [key]: Number(e.target.value),
                            })
                          }
                        />
                      ),
                    )}
                </div>
              </fieldset>
            ))}
            {error && <Notice tone="error">{error}</Notice>}
            {workspace.user.role === "admin" && (
              <div className="form-actions">
                <Button disabled={busy}>
                  {busy ? "Saving…" : "Save policies"}
                </Button>
              </div>
            )}
          </form>
        </section>
      )}
      {tab === "roles" &&
        (rolesLoading ? (
          <ContentSkeleton metrics={0} rows={3} />
        ) : rolesError ? (
          <Notice tone="error">{rolesError}</Notice>
        ) : (
          <section className="card no-padding">
            <div className="card-heading">
              <h3>Roles & permissions</h3>
            </div>
            <Table
              stack
              caption="Roles and permissions"
              rows={roles?.items || []}
              columns={[
                { key: "label", label: "Role" },
                { key: "people", label: "Active people" },
                { key: "scope", label: "Data scope" },
                {
                  key: "modulesRead",
                  label: "Modules",
                  render: (r) =>
                    `View ${r.modulesRead} · Edit ${r.modulesWrite}`,
                },
                { key: "approvals", label: "Approvals" },
                { key: "settings", label: "Settings" },
              ]}
            />
            <p className="card-note">
              Assign roles from Field team → Employee setup. These rows are read
              from the API rules that enforce access.
            </p>
          </section>
        ))}
      {tab === "permissions" && workspace.user.role === "admin" && (
        <Permissions />
      )}
      {tab === "integrations" && integrationsLoading && (
        <ContentSkeleton metrics={0} rows={4} />
      )}
      {tab === "integrations" && !integrationsLoading && (
        <section className="card no-padding">
          <Table
            rows={integrations?.items || []}
            columns={[
              { key: "name", label: "Service" },
              { key: "status", label: "Status" },
              { key: "description", label: "Setup required" },
            ]}
          />
        </section>
      )}
      {tab === "audit" && auditLoading && (
        <ContentSkeleton metrics={0} rows={6} />
      )}
      {tab === "audit" &&
        !auditLoading &&
        (workspace.user.role === "admin" ? (
          <section className="card no-padding">
            <Table
              rows={audit?.items || []}
              columns={[
                { key: "date", label: "Time" },
                { key: "actor", label: "Actor" },
                { key: "action", label: "Action" },
                { key: "entity", label: "Entity" },
              ]}
            />
          </section>
        ) : (
          <Notice>Administrator access is required for the audit log.</Notice>
        ))}
      {tab === "support" &&
        (workspace.user.role === "admin" ? (
          <SupportRequests />
        ) : (
          <Notice>
            Administrator access is required for support requests.
          </Notice>
        ))}
      {tab === "account" && <Account />}
    </>
  );
}
export function Account() {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card narrow">
      <h2>Account security</h2>
      <p>Changing your password signs out all devices.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== confirm) {
            setError("The new passwords do not match");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api(
              "/auth/password",
              json("POST", { currentPassword: current, newPassword: next }),
            );
            location.reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["current", "Current password", current, setCurrent],
          ["new", "New password", next, setNext],
          ["confirm", "Confirm new password", confirm, setConfirm],
        ].map(([key, title, value, set]) => (
          <TextField
            key={key as string}
            label={title as string}
            id={"pass-" + key}
            type="password"
            required
            minLength={key === "current" ? 1 : 12}
            value={value as string}
            onChange={(e) => (set as (v: string) => void)(e.target.value)}
            autoComplete={
              key === "current" ? "current-password" : "new-password"
            }
          />
        ))}
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}
