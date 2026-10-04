"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RULE_TYPE_LABELS } from "./rule-labels";

interface AdminRule {
  id: string;
  type: string;
  value: string;
  isActive: boolean;
  addedBy: string;
  addedAt: string;
  blocked: number;
}

async function send(url: string, method: "POST" | "PATCH", body: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Shared with Admin -> Blocked emails, so a wrongly-caught email's rule can
// be switched off from the log itself.
export function RuleToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await send(`/api/admin/suppression-rules/${id}`, "PATCH", { isActive: !isActive });
          setBusy(false);
          if (!result.ok) setError(result.data?.error ?? `Request failed (${result.status})`);
          else router.refresh();
        }}
      >
        {isActive ? "Switch off" : "Turn back on"}
      </button>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}

export default function BlockListPanel({ rules }: { rules: AdminRule[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("SENDER");
  const [value, setValue] = useState("");

  async function add() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await send("/api/admin/suppression-rules", "POST", { type, value });
    setBusy(false);
    if (!result.ok) {
      setError(result.data?.error ?? `Request failed (${result.status})`);
      return;
    }
    setValue("");
    if (result.data?.alreadyActive) setMessage("That rule is already on the block list.");
    else if (result.data?.reactivated) setMessage("That rule was switched off -- it's now back on.");
    router.refresh();
  }

  return (
    <>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}
      {message && <p className="banner">{message}</p>}

      <section className="section-card">
        <h2>Add a rule</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <label>
            Type
            <br />
            <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
              <option value="SENDER">Sender</option>
              <option value="DOMAIN">Domain</option>
              <option value="SUBJECT_PATTERN">Subject contains</option>
            </select>
          </label>
          <label style={{ flex: "1 1 18rem" }}>
            {type === "SENDER" ? "Email address" : type === "DOMAIN" ? "Domain" : "Words in the subject"}
            <br />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                type === "SENDER"
                  ? "noreply@example.com"
                  : type === "DOMAIN"
                    ? "example.com"
                    : "still accepting applications"
              }
              disabled={busy}
              required
              style={{ width: "100%" }}
            />
          </label>
          <button type="submit" disabled={busy || !value.trim()}>
            Add to block list
          </button>
        </form>
      </section>

      {rules.length === 0 ? (
        <p>No rules yet -- nothing is being blocked.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Blocks</th>
              <th>Emails blocked</th>
              <th>Added</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{RULE_TYPE_LABELS[r.type] ?? r.type}</td>
                <td style={{ wordBreak: "break-word" }}>{r.value}</td>
                <td>{r.blocked > 0 ? <a href={`/admin/blocked-emails?rule=${r.id}`}>{r.blocked}</a> : 0}</td>
                <td>
                  {r.addedAt}
                  <br />
                  <small>{r.addedBy}</small>
                </td>
                <td>
                  <span className={r.isActive ? "chip chip-status-ALLOCATED" : "chip chip-status-CLOSED"}>
                    {r.isActive ? "Active" : "Switched off"}
                  </span>
                </td>
                <td>
                  <RuleToggleButton id={r.id} isActive={r.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
