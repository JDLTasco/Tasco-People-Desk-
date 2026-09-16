"use client";

import { useState } from "react";

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  ticketId: string | null;
  accessBasis: string | null;
  reason: string | null;
  correlationId: string;
  createdAt: string;
  actor: { displayName: string; initials: string };
  ticket: { ticketNo: string } | null;
}

export default function AuditLogClient() {
  const [ticketNo, setTicketNo] = useState("");
  const [action, setAction] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    const params = new URLSearchParams();
    if (ticketNo) params.set("ticketNo", ticketNo);
    if (action) params.set("action", action);
    if (correlationId) params.set("correlationId", correlationId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
    const data = await res.json().catch(() => ({ entries: [] }));
    setEntries(data.entries ?? []);
    setBusy(false);
  }

  return (
    <>
      <div className="filter-bar">
        <input
          placeholder="Ticket number..."
          value={ticketNo}
          onChange={(e) => setTicketNo(e.target.value)}
          style={{ width: "9rem" }}
        />
        <input placeholder="Action..." value={action} onChange={(e) => setAction(e.target.value)} style={{ width: "12rem" }} />
        <input
          placeholder="Correlation ID..."
          value={correlationId}
          onChange={(e) => setCorrelationId(e.target.value)}
          style={{ width: "18rem" }}
        />
        <label>
          From: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" disabled={busy} onClick={() => void search()}>
          Search
        </button>
      </div>

      {entries !== null && (
        <>
          <p>{entries.length} entr{entries.length === 1 ? "y" : "ies"}</p>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Ticket</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Access basis</th>
                <th>Reason</th>
                <th>Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.ticket?.ticketNo ?? ""}</td>
                  <td>{e.action}</td>
                  <td>
                    {e.actor.displayName} ({e.actor.initials})
                  </td>
                  <td>
                    {e.entity} {e.entityId}
                  </td>
                  <td>{e.accessBasis ?? ""}</td>
                  <td>{e.reason ?? ""}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{e.correlationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
