"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAll } from "@/components/pending-saves";

// Green "Save & exit" at the top of the ticket page (John, 2026-10-03):
// saves whatever is unsaved on the page (details, a changed Current action,
// a typed note -- see components/pending-saves.ts) and goes back to My
// tickets, ready for the next one. Stays put and says why if a save fails.
//
// Burgundy "Cancel" beside it (John, 2026-10-05): leaves for My tickets
// WITHOUT saving -- unsaved edits on the page are simply dropped, so the
// ticket stays as it was last saved. Anything already applied with its own
// button (Claim, an action, an added note) was saved at the time and isn't
// undone.
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

  function cancelAndExit() {
    if (!window.confirm("Leave this ticket without saving? Any changes you haven't saved will be lost.")) return;
    router.push("/my-tickets");
    router.refresh();
  }

  return (
    <div className="save-exit no-print">
      <div className="save-exit-buttons">
        <button type="button" className="btn-cancel-exit" disabled={busy} onClick={cancelAndExit}>
          Cancel
        </button>
        <button type="button" className="btn-save-exit" disabled={busy} onClick={() => void saveAndExit()}>
          {busy ? "Saving…" : "Save & exit"}
        </button>
      </div>
      {error && (
        <p role="alert" className="banner banner-error" style={{ marginTop: "0.5rem" }}>
          Not saved -- {error}
        </p>
      )}
    </div>
  );
}
