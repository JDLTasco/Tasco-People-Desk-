"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAll } from "@/components/pending-saves";

// Green "Save & exit" at the top of the ticket page (John, 2026-10-03):
// saves whatever is unsaved on the page (details, a changed Current action,
// a typed note -- see components/pending-saves.ts) and goes back to My
// tickets, ready for the next one. Stays put and says why if a save fails.
export default function SaveExitButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAndExit() {
    setBusy(true);
    setError(null);
    const result = await saveAll();
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    router.push("/my-tickets");
    router.refresh();
  }

  return (
    <div className="save-exit no-print">
      <button type="button" className="btn-save-exit" disabled={busy} onClick={() => void saveAndExit()}>
        {busy ? "Saving…" : "Save & exit"}
      </button>
      {error && (
        <p role="alert" className="banner banner-error" style={{ marginTop: "0.5rem" }}>
          Not saved -- {error}
        </p>
      )}
    </div>
  );
}
