"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticketId: string;
  ticketNo: string;
  version: number;
}

interface SearchResult {
  id: string;
  ticketNo: string;
  subject: string;
  status: string;
  version: number;
}

// Ticket merging -- added directly with John, Sep 2026, not in the
// original v1.3 spec. This ticket is the one that will stop being the
// prominent case number if merged; the officer searches for the ticket
// it should merge INTO.
export default function MergeTicketForm({ ticketId, ticketNo, version }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    setQuery(q);
    setSelected(null);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/tickets/search?q=${encodeURIComponent(q)}`);
    const data = await res.json().catch(() => ({ tickets: [] }));
    setResults((data.tickets ?? []).filter((t: SearchResult) => t.id !== ticketId));
  }

  async function confirmMerge() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, intoTicketId: selected.id, intoVersion: selected.version }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Merge into another ticket
      </button>
    );
  }

  return (
    <div className="section-card">
      <h3>Merge {ticketNo} into another ticket</h3>
      <p>
        All correspondence, notes, and attachments from {ticketNo} will move into the ticket you choose below, which
        becomes the prominent case number. {ticketNo} itself will close (reason: Merged).
      </p>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}
      <label>
        Search by ticket number or subject:{" "}
        <input value={query} onChange={(e) => void search(e.target.value)} style={{ width: "16rem" }} />
      </label>
      {results.length > 0 && (
        <ul>
          {results.map((t) => (
            <li key={t.id}>
              <label>
                <input type="radio" name="merge-target" checked={selected?.id === t.id} onChange={() => setSelected(t)} />{" "}
                {t.ticketNo} -- {t.subject} ({t.status})
              </label>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && <p>No matching tickets.</p>}
      <button type="button" disabled={busy || !selected} onClick={() => void confirmMerge()}>
        Confirm merge
      </button>{" "}
      <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
