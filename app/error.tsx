"use client";

import { useEffect, useState } from "react";
import { tryAutoReload } from "@/lib/recover-reload";

// Catches a client-side crash on any page (inside the root layout, so the
// nav bar stays). Usually this is a tab left open across a deploy -- it
// reloads itself once; see lib/recover-reload.ts. (2026-10-03)
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(true);

  useEffect(() => {
    console.error(error);
    if (!tryAutoReload()) setReloading(false);
  }, [error]);

  if (reloading) {
    return (
      <main>
        <p>Loading the latest version of the People Desk...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Something went wrong on this page</h1>
      <p>
        Please reload the page. If it keeps happening, tell the People Desk administrator what you were doing and
        when{error.digest ? ` (reference: ${error.digest})` : ""}.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload page
      </button>{" "}
      <button type="button" className="secondary" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
