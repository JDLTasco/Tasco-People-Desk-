"use client";

import { useState } from "react";
import { formatAuDateTime } from "@/lib/format-date";
import { ADDRESS_SOURCE_LABELS, type AddressSource } from "@/lib/address-book-labels";

interface Row {
  email: string;
  name: string | null;
  sources: AddressSource[];
  ticketCount: number;
  tickets: { id: string; ticketNo: string }[];
  timesEmailedByHr: number;
  firstSeen: string | null;
  lastSeen: string | null;
  lastEmailedByHrAt: string | null;
  lastEmailedByHrBy: string | null;
}

const MAX_TICKET_LINKS = 5;

export default function AddressBookTable({ entries }: { entries: Row[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const rows = query
    ? entries.filter((e) => e.email.includes(query) || (e.name ?? "").toLowerCase().includes(query))
    : entries;

  return (
    <>
      <div className="filter-bar no-print">
        <input placeholder="Search name or address..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "18rem" }} />
        <button type="button" className="secondary" disabled={!q} onClick={() => setQ("")}>
          Clear all filters
        </button>
        <span className="text-muted">
          {rows.length} of {entries.length} addresses
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Seen as</th>
            <th>Tickets</th>
            <th>Emailed by HR</th>
            <th>Last emailed by HR</th>
            <th>First seen</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.email}>
              <td>{e.name ?? <em>unknown</em>}</td>
              <td>{e.email}</td>
              <td>{e.sources.map((s) => ADDRESS_SOURCE_LABELS[s]).join(", ")}</td>
              <td>
                {e.tickets.slice(0, MAX_TICKET_LINKS).map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ", "}
                    <a href={`/tickets/${t.id}`}>{t.ticketNo}</a>
                  </span>
                ))}
                {e.ticketCount > MAX_TICKET_LINKS && ` +${e.ticketCount - MAX_TICKET_LINKS} more`}
              </td>
              <td>{e.timesEmailedByHr > 0 ? `${e.timesEmailedByHr} time${e.timesEmailedByHr === 1 ? "" : "s"}` : "never"}</td>
              <td>
                {e.lastEmailedByHrAt
                  ? `${formatAuDateTime(e.lastEmailedByHrAt)}${e.lastEmailedByHrBy ? ` by ${e.lastEmailedByHrBy}` : ""}`
                  : ""}
              </td>
              <td>{e.firstSeen ? formatAuDateTime(e.firstSeen) : ""}</td>
              <td>{e.lastSeen ? formatAuDateTime(e.lastSeen) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
