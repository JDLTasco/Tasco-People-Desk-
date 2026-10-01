"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { renderRequesterQuestionEmail } from "@/lib/email/templates";

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
// without moving to OUTCOME. Same review-before-send shape as the outcome
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
        Ask requester a question
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
        ccRecipients: cc
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    setQuestion("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="modal-overlay">
      <div className="modal section-card">
        <h2>Ask the requester a question -- {ticketNo}</h2>
        {error && (
          <p role="alert" className="banner banner-error">
            {error}
          </p>
        )}
        <p>Sending moves the ticket to AWAITING_RESPONSE. The requester&apos;s reply threads back onto this ticket.</p>

        <label>
          Question:
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={6} style={{ width: "100%" }} />
        </label>

        <label>
          To: <input value={requesterEmail} disabled style={{ width: "20rem" }} />
        </label>
        <br />
        <label>
          CC:{" "}
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated addresses" style={{ width: "20rem" }} />
        </label>

        <div className="section-card">
          <strong>Preview -- the final rendered body exactly as it will send</strong>
          <div>
            <em>Subject:</em> {rendered.subject}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{rendered.bodyText}</div>
        </div>

        <button type="button" disabled={busy || !question.trim()} onClick={() => void send()}>
          Approve &amp; Send Question
        </button>{" "}
        <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
