"use client";

import { useState } from "react";
import Link from "next/link";

interface Result {
  id: string;
  ticketNo: string;
  subject: string;
  requesterName: string;
  status: string;
  priority: string;
  category: { name: string } | null;
  businessUnit: { name: string } | null;
  assignee: { displayName: string; initials: string } | null;
}

interface Props {
  canBulkExport: boolean;
}

export default function ArchiveSearchClient({ canBulkExport }: Props) {
  const [ticketNo, setTicketNo] = useState("");
  const [requester, setRequester] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeNotARequest, setIncludeNotARequest] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    const params = new URLSearchParams();
    if (ticketNo) params.set("ticketNo", ticketNo);
    if (requester) params.set("requester", requester);
    if (subject) params.set("subject", subject);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (includeNotARequest) params.set("includeNotARequest", "true");
    const res = await fetch(`/api/archive-search?${params.toString()}`);
    const data = await res.json().catch(() => ({ tickets: [] }));
    setResults(data.tickets ?? []);
    setBusy(false);
  }

  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");

  return (
    <>
      <section className="section-card">
        <h2>Search archived tickets</h2>
        <div className="filter-bar">
          <input placeholder="Ticket number..." value={ticketNo} onChange={(e) => setTicketNo(e.target.value)} style={{ width: "9rem" }} />
          <input placeholder="Requester..." value={requester} onChange={(e) => setRequester(e.target.value)} style={{ width: "10rem" }} />
          <input placeholder="Subject..." value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "12rem" }} />
          <label>
            From: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={includeNotARequest} onChange={(e) => setIncludeNotARequest(e.target.checked)} /> Include
            &quot;Not a request&quot; closures
          </label>
          <button type="button" disabled={busy} onClick={() => void search()}>
            Search
          </button>
        </div>

        {results !== null && (
          <>
            <p>{results.length} result(s)</p>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Requester</th>
                  <th>Category</th>
                  <th>Business unit</th>
                  <th>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {results.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/tickets/${t.id}`}>
                        {t.ticketNo} -- {t.subject}
                      </Link>
                    </td>
                    <td>{t.requesterName}</td>
                    <td>{t.category?.name ?? ""}</td>
                    <td>{t.businessUnit?.name ?? ""}</td>
                    <td>{t.assignee ? `${t.assignee.displayName} (${t.assignee.initials})` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {canBulkExport && (
        <section className="section-card">
          <h2>Bulk export (CSV)</h2>
          <label>
            From: <input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} />
          </label>{" "}
          <label>
            To: <input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} />
          </label>{" "}
          <button
            type="button"
            disabled={!bulkFrom || !bulkTo}
            onClick={() => {
              window.location.href = `/api/exports/bulk?from=${bulkFrom}&to=${bulkTo}`;
            }}
          >
            Download CSV
          </button>
        </section>
      )}
    </>
  );
}
