"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewTicketForm() {
  const router = useRouter();
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"P1" | "P2" | "P3">("P3");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterName, requesterEmail, subject, description, priority }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    router.push(`/tickets/${data.ticketId}`);
  }

  return (
    <section className="section-card">
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <label>
          Requester name
          <br />
          <input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required style={{ width: "20rem" }} />
        </label>
        <br />
        <label>
          Requester email
          <br />
          <input
            type="email"
            value={requesterEmail}
            onChange={(e) => setRequesterEmail(e.target.value)}
            required
            style={{ width: "20rem" }}
          />
        </label>
        <br />
        <label>
          Subject
          <br />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required style={{ width: "28rem" }} />
        </label>
        <br />
        <label>
          Description
          <br />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            style={{ width: "28rem" }}
          />
        </label>
        <br />
        <label>
          Priority
          <br />
          <select value={priority} onChange={(e) => setPriority(e.target.value as "P1" | "P2" | "P3")}>
            <option value="P1">P1 -- 2 days</option>
            <option value="P2">P2 -- 7 days</option>
            <option value="P3">P3 -- 30 days</option>
          </select>
        </label>
        <br />
        <button
          type="submit"
          disabled={busy || !requesterName.trim() || !requesterEmail.trim() || !subject.trim() || !description.trim()}
          style={{ marginTop: "1rem" }}
        >
          Create ticket
        </button>
      </form>
    </section>
  );
}
