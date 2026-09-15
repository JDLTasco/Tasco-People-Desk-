"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticketId: string;
  mode: "create" | "edit";
  noteId?: string;
  initialBody?: string;
}

export default function NoteForm({ ticketId, mode, noteId, initialBody }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(mode === "create");
  const [body, setBody] = useState(initialBody ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);

    const url = mode === "create" ? `/api/tickets/${ticketId}/notes` : `/api/tickets/${ticketId}/notes/${noteId}`;
    const method = mode === "create" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }

    if (mode === "create") setBody("");
    setEditing(mode === "create");
    router.refresh();
  }

  if (mode === "edit" && !editing) {
    return (
      <button type="button" className="secondary" onClick={() => setEditing(true)} style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}>
        Edit
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ width: "100%" }} />
      <br />
      <button type="button" disabled={busy || !body.trim()} onClick={() => void submit()} style={{ marginTop: "0.4rem" }}>
        {mode === "create" ? "Add note" : "Save revision"}
      </button>
      {mode === "edit" && (
        <button type="button" className="secondary" onClick={() => setEditing(false)} style={{ marginLeft: "0.5rem" }}>
          Cancel
        </button>
      )}
    </div>
  );
}
