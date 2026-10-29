import { useEffect, useState } from "react";
import { api, json } from "./api";
import { useWorkspace } from "./context";
import { Button, ContentSkeleton, Notice, useResource } from "./ui";

type Access = Record<string, { read: boolean; write: boolean }>;

export function Permissions() {
  const { notify, refresh, version } = useWorkspace();
  const [role, setRole] = useState("manager");
  const [draft, setDraft] = useState<Access>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {
    data,
    loading,
    error: loadError,
  } = useResource(() => api("/permissions"), [version]);
  const current = data?.roles.find((r: any) => r.role === role);
  useEffect(() => {
    if (current) setDraft(structuredClone(current.access));
  }, [current]);
  if (loading) return <ContentSkeleton metrics={0} rows={6} />;
  if (loadError) return <Notice tone="error">{loadError}</Notice>;
  const locked = !!current?.locked;
  const dirty = JSON.stringify(draft) !== JSON.stringify(current?.access);
  const set = (key: string, mode: "read" | "write", on: boolean) =>
    setDraft((d) => {
      const row = { ...d[key] };
      if (mode === "write") {
        row.write = on;
        if (on) row.read = true;
      } else {
        row.read = on;
        if (!on) row.write = false;
      }
      return { ...d, [key]: row };
    });
  const bulk = (mode: "read" | "write", on: boolean) =>
    setDraft((d) =>
      Object.fromEntries(
        Object.entries(d).map(([k, v]) => [
          k,
          mode === "write"
            ? { read: on ? true : v.read, write: on }
            : { read: on, write: on ? v.write : false },
        ]),
      ),
    );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(
        `/permissions/${role}`,
        json("PUT", { access: draft }, crypto.randomUUID()),
      );
      notify(`${current.label} permissions saved`);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    setError("");
    try {
      await api(
        `/permissions/${role}/reset`,
        json("POST", {}, crypto.randomUUID()),
      );
      notify(`${current.label} permissions restored to defaults`);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const groups: string[] = [
    ...new Set<string>(data.modules.map((m: any) => m.group)),
  ];
  return (
    <section className="card no-padding">
      <div className="card-heading">
        <h3>Role permissions</h3>
        <div className="tabs compact" role="tablist">
          {data.roles.map((r: any) => (
            <button
              key={r.role}
              role="tab"
              aria-selected={role === r.role}
              className={role === r.role ? "active" : ""}
              onClick={() => setRole(r.role)}
            >
              {r.label}
              {r.customized ? " •" : ""}
            </button>
          ))}
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {locked && (
        <Notice>
          Administrators always have Read and Write access to every module.
        </Notice>
      )}
      <div className="perm-actions">
        <Button secondary disabled={locked} onClick={() => bulk("read", true)}>
          Read all
        </Button>
        <Button secondary disabled={locked} onClick={() => bulk("write", true)}>
          Read & write all
        </Button>
        <Button
          secondary
          disabled={locked}
          onClick={() => bulk("write", false)}
        >
          Clear write
        </Button>
      </div>
      <div className="perm-grid" role="table" aria-label="Permissions">
        <div className="perm-row perm-head" role="row">
          <span role="columnheader">Module</span>
          <span role="columnheader">Read</span>
          <span role="columnheader">Write</span>
        </div>
        {groups.map((g) => (
          <div key={g} role="rowgroup">
            <div className="perm-group">{g}</div>
            {data.modules
              .filter((m: any) => m.group === g)
              .map((m: any) => {
                const p = draft[m.key] || { read: false, write: false };
                return (
                  <div className="perm-row" role="row" key={m.key}>
                    <span role="cell">{m.title}</span>
                    <label role="cell">
                      <input
                        type="checkbox"
                        checked={locked || p.read}
                        disabled={locked}
                        onChange={(e) => set(m.key, "read", e.target.checked)}
                        aria-label={`${m.title} read`}
                      />
                      <b>Read</b>
                    </label>
                    <label role="cell">
                      <input
                        type="checkbox"
                        checked={locked || p.write}
                        disabled={locked}
                        onChange={(e) => set(m.key, "write", e.target.checked)}
                        aria-label={`${m.title} write`}
                      />
                      <b>Write</b>
                    </label>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {!locked && (
        <div className="perm-actions perm-save">
          <Button disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save permissions"}
          </Button>
          <Button
            secondary
            disabled={busy || !current?.customized}
            onClick={reset}
          >
            Restore defaults
          </Button>
          <span className="muted">
            Write includes Read. Changes apply the next time the person opens or
            refreshes the app.
          </span>
        </div>
      )}
    </section>
  );
}
