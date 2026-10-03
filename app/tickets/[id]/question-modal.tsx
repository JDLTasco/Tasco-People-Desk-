"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { renderRequesterQuestionEmail } from "@/lib/email/templates";
import { parseRecipientList } from "@/lib/email/recipients";
import RecipientInput from "@/components/RecipientInput";

interface Props {
  ticketId: string;
  ticketNo: string;
  displaySubject: string;
  requesterEmail: string;
  initialCcRecipients: string[];
  /** Saves any pending detail changes first and returns the fresh version, or an error message. */
  saveChanges: () => Promise<{ version: number } | { error: string }>;
}

// Operator addition (John, 2026-10-01): email the requester a question
// without moving to OUTCOME. Since 2026-10-03 the To line can be changed,
// e.g. to ask the requester's manager, with CCs. Same review-before-send shape as the outcome
// dispatch modal -- the preview uses the exact template the server sends.
export default function QuestionModal({
  ticketId,
  ticketNo,
  displaySubject,
  requesterEmail,
  initialCcRecipients,
  saveChanges,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [to, setTo] = useState(requesterEmail);
  const [cc, setCc] = useState(initialCcRecipients.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (open && question.trim()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [open, question]);

  const rendered = useMemo(
    () =>
      renderRequesterQuestionEmail({
        ticketNo,
        displaySubject,
        question: question || "(your question will appear here)",
      }),
    [ticketNo, displaySubject, question],
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Email a question
      </button>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const saved = await saveChanges();
    if ("error" in saved) {
      setBusy(false);
      setError(saved.error);
      return;
    }
    const res = await fetch(`/api/tickets/${ticketId}/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: saved.version,
        question,
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
    setQuestion("");
    setTo(requesterEmail);
    setOpen(false);
    router.refresh();
  }

  // Rendered into <body> (2026-10-03): the button lives in the ticket page's
  // sticky left column, which forms its own stacking context, so without a
  // portal the window would sit underneath the frozen nav bar.
  return createPortal(
    <div className="modal-overlay">
      <div className="modal section-card">
        <h2>Email a question -- {ticketNo}</h2>
        {error && (
          <p role="alert" className="banner banner-error">
            {error}
          </p>
        )}
        <p>
          Goes to the requester by default -- change To to ask someone else (e.g. their manager), and add CCs. Sending
          moves the ticket to AWAITING_RESPONSE; a reply that keeps the ticket number in the subject threads back onto this
          ticket and marks it Response received.
        </p>

        <label>
          Question:
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={6} style={{ width: "100%" }} />
        </label>

        <label>
          To:{" "}
          <RecipientInput value={to} onChange={setTo} placeholder="start typing a name or address" ariaLabel="To" />
        </label>
        <br />
        <label>
          CC:{" "}
          <RecipientInput value={cc} onChange={setCc} placeholder="start typing a name or address" ariaLabel="CC" />
        </label>

        <div className="section-card">
          <strong>Preview -- the final rendered body exactly as it will send</strong>
          <div>
            <em>Subject:</em> {rendered.subject}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{rendered.bodyText}</div>
        </div>

        <button type="button" disabled={busy || !question.trim() || !to.trim()} onClick={() => void send()}>
          Approve &amp; Send Question
        </button>{" "}
        <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
