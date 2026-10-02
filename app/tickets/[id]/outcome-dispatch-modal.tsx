"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { renderOutcomeEmail } from "@/lib/email/templates";
import { parseRecipientList } from "@/lib/email/recipients";

interface Attachment {
  id: string;
  filename: string;
}

interface Props {
  ticketId: string;
  version: number;
  ticketNo: string;
  displaySubject: string;
  requesterEmail: string;
  initialCcRecipients: string[];
  attachments: Attachment[];
}

// §7.4 "Outcome dispatch preview -- mandatory": the only UI path to
// IN_ACTION -> OUTCOME. Renders the exact same pure template
// (lib/email/templates.ts) the real send uses server-side, so what's
// previewed here is genuinely "the final rendered body exactly as it will
// send," not a lookalike.
export default function OutcomeDispatchModal({
  ticketId,
  version,
  ticketNo,
  displaySubject,
  requesterEmail,
  initialCcRecipients,
  attachments,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcomeText, setOutcomeText] = useState("");
  // To defaults to the requester but can be changed (2026-10-03).
  const [to, setTo] = useState(requesterEmail);
  const [cc, setCc] = useState(initialCcRecipients.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // §7.4: "A navigation-away warning is shown if the draft is non-empty."
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (open && outcomeText.trim()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [open, outcomeText]);

  const rendered = useMemo(
    () =>
      renderOutcomeEmail({
        ticketNo,
        displaySubject,
        outcomeForRequester: outcomeText || "(draft outcome text will appear here)",
      }),
    [ticketNo, displaySubject, outcomeText],
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Draft outcome
      </button>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version,
        outcomeForRequester: outcomeText,
        toRecipients: parseRecipientList(to),
        ccRecipients: parseRecipientList(cc),
      }),
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

  return (
    <div className="modal-overlay">
      <div className="modal section-card">
        <h2>Send outcome -- {ticketNo}</h2>
        {error && (
          <p role="alert" className="banner banner-error">
            {error}
          </p>
        )}

        <label>
          Outcome for requester (free text):
          <textarea
            value={outcomeText}
            onChange={(e) => setOutcomeText(e.target.value)}
            rows={6}
            style={{ width: "100%" }}
          />
        </label>

        <p>
          <em>Internal notes are never included -- only the text above is sent.</em>
        </p>

        <label>
          To:{" "}
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="comma-separated addresses" style={{ width: "20rem" }} />
        </label>
        <br />
        <label>
          CC:{" "}
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated addresses" style={{ width: "20rem" }} />
        </label>

        {attachments.length > 0 && (
          <div>
            <strong>Attachments to be included:</strong>
            <ul>
              {attachments.map((a) => (
                <li key={a.id}>{a.filename}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="section-card">
          <strong>Preview -- the final rendered body exactly as it will send</strong>
          <div>
            <em>Subject:</em> {rendered.subject}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{rendered.bodyText}</div>
        </div>

        <button type="button" disabled={busy || !outcomeText.trim() || !to.trim()} onClick={() => void send()}>
          Approve &amp; Send Outcome
        </button>{" "}
        <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
