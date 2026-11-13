import {
  DateField,
  FieldShell,
  SelectField,
  TextAreaField,
  TextField,
} from "./controls";
import { Fragment, useEffect, useState } from "react";
import { api, json } from "./api";
import { Button, Notice, Modal } from "./ui";
import { humanize } from "./nav";
import { useWorkspace, label } from "./context";
import type {
  Field,
  Module,
  RecordData,
} from "../../../packages/shared/src/index.ts";
export function RecordForm({
  mod,
  initial,
  onClose,
  onSaved,
}: {
  mod: Module;
  initial?: RecordData;
  onClose: () => void;
  onSaved: (r: RecordData) => void;
}) {
  const { workspace } = useWorkspace();
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      mod.fields.map((f) => [
        f.key,
        initial?.[f.key] ??
          (f.type === "multireference" || f.type === "lines"
            ? []
            : f.key === "assignedTo" || f.key === "recipientId"
              ? workspace.user.id
              : f.type === "date"
                ? new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Kolkata",
                  })
                : f.key === "completed"
                  ? "No"
                  : ""),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== ""),
      );
      const r = await api(
        initial ? "/record/" + initial.id : "/records/" + mod.key,
        json(
          initial ? "PUT" : "POST",
          initial ? { data, version: initial.version } : { data },
          crypto.randomUUID(),
        ),
      );
      onSaved(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={(initial ? "Edit " : "Add ") + mod.singular.toLowerCase()}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          {mod.fields.map((f) => (
            <Fragment key={f.key}>
              {f.section && <h3 className="form-section full">{f.section}</h3>}
              <FieldInput
                field={f}
                value={values[f.key]}
                onChange={(v) => setValues({ ...values, [f.key]: v })}
              />
            </Fragment>
          ))}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="form-actions">
          <Button type="button" secondary onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save " + mod.singular.toLowerCase()}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function FieldInput({
  field: f,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  const { workspace } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const options =
    f.ref === "users"
      ? workspace.users
          .filter((u) => u.active)
          .map((u) => ({ id: u.id, name: u.name }))
      : (workspace.records[f.ref || ""] || []).map((r) => ({
          id: r.id,
          name: r.name || r.title || r.id,
        }));
  const id = "field-" + f.key;
  const label = f.label;
  const hint = f.hint || "";
  if (f.type === "select" || f.type === "reference")
    return (
      <SelectField
        label={label}
        id={id}
        hint={hint}
        required={f.required}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select {f.label.toLowerCase()}</option>
        {f.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
    );
  if (f.type === "lines") {
    const rows: any[] = Array.isArray(value) ? value : [];
    const cols = f.lineFields ?? [];
    const set = (itemId: string, key: string, raw: string) => {
      const n = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
      const next = rows.some((r) => r.itemId === itemId)
        ? rows.map((r) => (r.itemId === itemId ? { ...r, [key]: n } : r))
        : [
            ...rows,
            {
              itemId,
              ...Object.fromEntries(cols.map((c) => [c.key, 0])),
              [key]: n,
            },
          ];
      onChange(next.filter((r) => cols.some((c) => r[c.key] > 0)));
    };
    return (
      <FieldShell label={label} id={id} className="full" required={f.required}>
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {options.map((o) => {
              const row = rows.find((r) => r.itemId === o.id);
              return (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  {cols.map((c) => (
                    <td key={c.key}>
                      <input
                        className="control"
                        type="number"
                        min={0}
                        step={1}
                        aria-label={o.name + " " + c.label}
                        value={row?.[c.key] ?? ""}
                        onChange={(e) => set(o.id, c.key, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </FieldShell>
    );
  }
  if (f.type === "multireference")
    return (
      <SelectField
        label={label}
        id={id}
        className="full"
        hint={hint || "Hold Ctrl / Command to select multiple entries."}
        multiple
        value={value || []}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
        }
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
    );
  if (f.type === "textarea")
    return (
      <TextAreaField
        label={label}
        id={id}
        hint={hint}
        required={f.required}
        value={value || ""}
        maxLength={5000}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (f.type === "date")
    return (
      <DateField
        label={label}
        id={id}
        hint={hint}
        required={f.required}
        min={f.min}
        max={f.max}
        value={value ?? ""}
        onChange={onChange}
      />
    );
  if (f.type === "file")
    return (
      <FieldShell
        label={label}
        id={id}
        className="full"
        required={f.required}
        error={error}
      >
        <input
          id={id}
          type="file"
          className="control"
          accept=".pdf,.png,.jpg,.jpeg"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            setError("");
            try {
              const body = new FormData();
              body.append("file", file);
              const a = await api("/attachments", { method: "POST", body });
              onChange(a.id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
        {uploading ? (
          <small>Uploading…</small>
        ) : (
          value && (
            <small>
              Attachment saved ·{" "}
              <a href={"/api/attachments/" + value}>Download</a>{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => onChange("")}
              >
                Remove
              </button>
            </small>
          )
        )}
      </FieldShell>
    );
  return (
    <TextField
      label={label}
      id={id}
      hint={hint}
      type={f.type === "number" ? "number" : "text"}
      required={f.required}
      min={f.min}
      max={f.max}
      step={f.type === "number" ? "any" : undefined}
      maxLength={f.type === "text" ? 5000 : undefined}
      value={value ?? ""}
      onChange={(e) =>
        onChange(
          f.type === "number" && e.target.value !== ""
            ? Number(e.target.value)
            : e.target.value,
        )
      }
    />
  );
}
export function RecordDetail({
  record,
  onClose,
  onEdit,
  onChanged,
}: {
  record: RecordData;
  onClose: () => void;
  onEdit?: (r: RecordData) => void;
  onChanged: () => void;
}) {
  const { workspace, notify } = useWorkspace();
  const [r, setRecord] = useState(record);
  const [reason, setReason] = useState("");
  const [received, setReceived] = useState(record.quantity || 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mod = workspace.modules.find((m) => m.key === r.kind);
  // A daily report stores visit ids; show the calls themselves instead.
  const [calls, setCalls] = useState<any[] | null>(null);
  useEffect(() => {
    if (r.kind !== "dcr") return;
    api(`/records/visit?ownerId=${r.ownerId}&date=${r.date}`)
      .then((d) =>
        setCalls(
          d.items.filter(
            (v: any) => !r.visitIds?.length || r.visitIds.includes(v.id),
          ),
        ),
      )
      .catch(() => setCalls([]));
  }, [r.id, r.kind]);
  const own = r.ownerId === workspace.user.id,
    admin = workspace.user.role === "admin";
  const unlocked = ["draft", "active", "returned"].includes(r.status);
  const editable =
    unlocked &&
    (admin ||
      own ||
      (r.kind === "customer" && r.assignedTo === workspace.user.id)) &&
    (!mod?.readOnlyForRep || admin);
  async function action(path: string, body: any, message: string) {
    setBusy(true);
    setError("");
    try {
      const updated = await api(
        "/record/" + r.id + path,
        json("POST", body, crypto.randomUUID()),
      );
      setRecord(updated);
      notify(message);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fields =
    mod?.fields ||
    Object.keys(r)
      .filter(
        (k) =>
          ![
            "id",
            "kind",
            "ownerId",
            "ownerName",
            "version",
            "status",
            "decisions",
            "createdAt",
            "updatedAt",
          ].includes(k),
      )
      .map(
        (key) =>
          ({
            key,
            label: humanize(key),
            type: "text",
          }) as Field,
      );
  return (
    <Modal
      title={
        r.name ||
        r.title ||
        `${mod?.singular || (r.kind === "dcr" ? "Daily call report" : r.kind)} · ${r.date || r.ownerName}`
      }
      onClose={onClose}
      wide
    >
      <div className="detail-meta">
        <span>
          {r.ownerName} · Version {r.version}
        </span>
        <span className={"badge " + r.status}>{r.status}</span>
      </div>
      <dl className="details">
        {fields.map((f) =>
          f.key === "visitIds" ? (
            <div key={f.key} className="full">
              <dt>Calls included</dt>
              <dd className="call-list">
                {calls === null
                  ? "Loading calls…"
                  : calls.length === 0
                    ? "—"
                    : calls.map((v) => (
                        <div key={v.id} className="call-row">
                          <strong>{v.customerName}</strong>
                          <span>{v.customerType}</span>
                          <span>
                            {v.visitedAt
                              ? new Date(v.visitedAt).toLocaleTimeString(
                                  "en-IN",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "Asia/Kolkata",
                                  },
                                )
                              : "—"}
                          </span>
                          <span>
                            {v.orderTotal ? "₹" + v.orderTotal : "No order"}
                          </span>
                          <span
                            className={
                              "badge " + (v.verified ? "Verified" : "stale")
                            }
                          >
                            {v.verified ? "Verified" : "Needs review"}
                          </span>
                        </div>
                      ))}
              </dd>
            </div>
          ) : (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>
                {f.type === "lines" ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        {(f.lineFields ?? []).map((c) => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                        <th>Moved in</th>
                        <th>Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r[f.key] ?? []).map((v: any) => (
                        <tr key={v.itemId}>
                          <td>{label(workspace, "itemId", v.itemId)}</td>
                          {(f.lineFields ?? []).map((c) => (
                            <td key={c.key}>{v[c.key]}</td>
                          ))}
                          <td>{v.carriedIn ?? 0}</td>
                          <td>{v.closing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : f.type === "file" && r[f.key] ? (
                  <a href={"/api/attachments/" + r[f.key]}>
                    Download attachment
                  </a>
                ) : Array.isArray(r[f.key]) &&
                  typeof r[f.key][0] === "object" ? (
                  r[f.key].map((v: any, i: number) => (
                    <div key={i}>
                      {label(workspace, "itemId", v.itemId)} × {v.quantity}
                      {v.total !== undefined ? " · ₹" + v.total : ""}
                    </div>
                  ))
                ) : (
                  label(workspace, f.key, r[f.key])
                )}
              </dd>
            </div>
          ),
        )}
      </dl>
      {r.decisions?.length > 0 && (
        <div className="history">
          <h3>Decision history</h3>
          {r.decisions.map((d: any) => (
            <p key={d.id}>
              <strong>
                {d.actorName} · {d.action}
              </strong>
              <br />
              {d.reason || "Approved"}
              <br />
              <small>{new Date(d.created_at).toLocaleString()}</small>
            </p>
          ))}
        </div>
      )}
      {r.kind === "challan" && own && r.status === "active" && (
        <div className="form-grid">
          <TextField
            label="Received quantity"
            id="received"
            type="number"
            min={0}
            max={r.quantity}
            value={received}
            onChange={(e) => setReceived(Number(e.target.value))}
          />
          <TextField
            label="Discrepancy notes"
            id="ack-notes"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            disabled={busy}
            onClick={() =>
              action(
                "/acknowledge",
                { version: r.version, receivedQty: received, notes: reason },
                "Challan acknowledged",
              )
            }
          >
            Acknowledge receipt
          </Button>
        </div>
      )}
      {r.status === "pending" && !own && workspace.user.role !== "rep" && (
        <>
          <TextAreaField
            label="Decision note (required for return / rejection)"
            id="decision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="form-actions">
            <Button
              danger
              disabled={busy}
              onClick={() =>
                action(
                  "/decision",
                  { version: r.version, action: "reject", reason },
                  "Submission rejected",
                )
              }
            >
              Reject
            </Button>
            <Button
              secondary
              disabled={busy}
              onClick={() =>
                action(
                  "/decision",
                  { version: r.version, action: "return", reason },
                  "Returned for correction",
                )
              }
            >
              Return for correction
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                action(
                  "/decision",
                  { version: r.version, action: "approve", reason },
                  "Submission approved",
                )
              }
            >
              Approve submission
            </Button>
          </div>
        </>
      )}
      {deleting && (
        <Notice tone="warning">
          Remove this record? Referenced records are protected.{" "}
          <Button
            danger
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  "/record/" + r.id,
                  json("DELETE", { version: r.version }, crypto.randomUUID()),
                );
                notify("Record removed");
                onChanged();
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm removal
          </Button>{" "}
          <Button secondary onClick={() => setDeleting(false)}>
            Keep record
          </Button>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-actions">
        {editable && mod && !["challan"].includes(r.kind) && (
          <Button danger onClick={() => setDeleting(true)}>
            Remove record
          </Button>
        )}
        {editable && mod && onEdit && (
          <Button secondary onClick={() => onEdit(r)}>
            Edit record
          </Button>
        )}
        {(own || admin) &&
          ["draft", "returned"].includes(r.status) &&
          (mod?.approvable || r.kind === "dcr") && (
            <Button
              disabled={busy}
              onClick={() =>
                action(
                  "/submit",
                  { version: r.version },
                  "Submitted for review",
                )
              }
            >
              Submit for review
            </Button>
          )}
        <Button secondary onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
