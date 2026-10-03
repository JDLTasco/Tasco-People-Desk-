"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { groupCalendar, type CalendarRow } from "@/lib/calendar/admin";

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });
const auDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default function CalendarAdminPanel({ days }: { days: CalendarRow[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name, isRecurring }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    setDate("");
    setName("");
    setIsRecurring(false);
    router.refresh();
  }

  async function remove(row: CalendarRow) {
    if (!window.confirm(`Remove ${row.name} (${auDate(row.date)}) from the calendar? It will count as a working day again.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/calendar/${row.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <section className="section-card">
        <h2>Add a non-working day</h2>
        {error && (
          <p role="alert" className="banner banner-error">
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>
            Date
            <br />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Name
            <br />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Tasco Christmas shutdown"
              style={{ width: "18rem" }}
            />
          </label>
          <label style={{ paddingBottom: "0.4rem" }}>
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} /> Same date every
            year
          </label>
          <button type="button" disabled={busy || !date || !name.trim()} onClick={() => void add()}>
            Add date
          </button>
        </div>
      </section>

      {groupCalendar(days).map((y) => (
        <section key={y.year} className="section-card">
          <h2>{y.year}</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {y.months.flatMap((m) =>
                m.days.map((d, i) => (
                  <tr key={d.id}>
                    <td>
                      {i === 0 && <strong style={{ display: "block", fontSize: "0.75rem", color: "var(--tasco-navy)" }}>{m.month}</strong>}
                      {d.isRecurring ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)} every year` : `${weekday(d.date)} ${auDate(d.date)}`}
                    </td>
                    <td>{d.name}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="secondary" disabled={busy} onClick={() => void remove(d)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      ))}
      {days.length === 0 && <p>No non-working days listed -- every Monday to Friday counts as a working day.</p>}
    </>
  );
}
