"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { renderOutcomeEmail } from "@/lib/email/templates";
import { parseRecipientList } from "@/lib/email/recipients";
import RecipientInput from "@/components/RecipientInput";

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

  // Rendered into <body> (2026-10-03): the button lives in the ticket page's
  // sticky left column, which forms its own stacking context, so without a
  // portal the window would sit underneath the frozen nav bar.
  return createPortal(
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
          <RecipientInput value={to} onChange={setTo} placeholder="start typing a name or address" ariaLabel="To" />
        </label>
        <br />
        <label>
          CC:{" "}
          <RecipientInput value={cc} onChange={setCc} placeholder="start typing a name or address" ariaLabel="CC" />
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
    </div>,
    document.body,
  );
}
