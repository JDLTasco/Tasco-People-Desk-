"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// "Check mailbox" (John, 2026-10-08): imports new emails from the HR
// mailbox now instead of waiting. Starts POST /api/mailbox/check, then polls
// GET until the run finishes, shows what it found for a few seconds, and
// refreshes the page so new tickets appear.
type Run = {
  status: string;
  startedAt: string;
  processed: number | null;
  created: number | null;
  threaded: number | null;
  error: string | null;
};

const POLL_MS = 3000;
const GIVE_UP_MS = 15 * 60 * 1000;

export default function CheckMailboxButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  function show(text: string, tone: "ok" | "error") {
    setMessage({ text, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), tone === "ok" ? 8000 : 12000);
  }

  async function check() {
    setBusy(true);
    setMessage(null);
    const clickedAt = Date.now();
    try {
      const res = await fetch("/api/mailbox/check", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      // 409 = someone else's check is already running; follow that one instead.
      if (!res.ok && res.status !== 409) throw new Error(data.error ?? "Couldn't start the mailbox check.");
      const since = res.status === 409 && data.startedAt ? new Date(data.startedAt).getTime() : clickedAt;

      while (Date.now() - clickedAt < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const poll = await fetch("/api/mailbox/check").then((r) => r.json()).catch(() => null);
        const run: Run | null = poll?.run ?? null;
        if (!run || new Date(run.startedAt).getTime() < since - 5000 || run.status === "RUNNING") continue;
        if (run.status === "FAILED") throw new Error(run.error ?? "The mailbox check failed.");
        const created = run.created ?? 0;
        const threaded = run.threaded ?? 0;
        const parts = [
          created === 0 ? "No new tickets" : `${created} new ticket${created === 1 ? "" : "s"}`,
          threaded > 0 ? `${threaded} repl${threaded === 1 ? "y" : "ies"} added to existing tickets` : null,
        ].filter(Boolean);
        show(`Mailbox checked: ${parts.join(", ")}.`, "ok");
        router.refresh();
        return;
      }
      throw new Error("The mailbox check is taking a long time -- it will carry on in the background. Refresh later.");
    } catch (err) {
      show(err instanceof Error ? err.message : "The mailbox check failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="mailbox-check">
      <button
        type="button"
        className="btn-mailbox"
        onClick={check}
        disabled={busy}
        title="Bring in new emails from the HR mailbox now, instead of waiting"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
        <img src="/icons/check-mailbox.png" alt="" width={18} height={18} className={busy ? "mailbox-icon-busy" : undefined} />
        {busy ? "Checking…" : "Check mailbox"}
      </button>
      {message && (
        <span role="status" className={`mailbox-check-msg mailbox-check-${message.tone}`}>
          {message.text}
        </span>
      )}
    </span>
  );
}
