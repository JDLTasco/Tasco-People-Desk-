"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticketId: string;
  attachmentId: string;
  filename: string;
}

// Same inline reason-input pattern as ticket-actions.tsx's legal-hold/
// delete/reverse controls (an input with "Reason (required)" placeholder,
// button disabled until non-empty) -- kept as its own small component
// rather than folded into the already-large TicketActions, since it's an
// unrelated concern living in a different part of the page.
export default function AttachmentRemoveForm({ ticketId, attachmentId, filename }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)} style={{ marginLeft: "0.5rem" }}>
        Remove
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}/attachments/${attachmentId}/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <span style={{ marginLeft: "0.5rem" }}>
      {error && (
        <span role="alert" className="banner banner-error" style={{ display: "inline-block", marginRight: "0.5rem" }}>
          {error}
        </span>
      )}
      <input
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ width: "14rem" }}
        aria-label={`Reason for removing ${filename}`}
      />
      <button type="button" disabled={busy || !reason.trim()} onClick={() => void submit()} style={{ marginLeft: "0.35rem" }}>
        Confirm remove
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)} style={{ marginLeft: "0.35rem" }}>
        Cancel
      </button>
    </span>
  );
}
