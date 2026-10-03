"use client";

import { useEffect, useState } from "react";
import { tryAutoReload } from "@/lib/recover-reload";

// Last-resort boundary for a crash in the root layout itself (replaces the
// whole page, so it brings its own <html>/<body> and plain styling). Same
// reload-once behaviour as app/error.tsx. (2026-10-03)
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [reloading, setReloading] = useState(true);

  useEffect(() => {
    console.error(error);
    if (!tryAutoReload()) setReloading(false);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", padding: "2rem" }}>
        {reloading ? (
          <p>Loading the latest version of the People Desk...</p>
        ) : (
          <>
            <h1>Something went wrong</h1>
            <p>
              Please reload the page. If it keeps happening, tell the People Desk administrator
              {error.digest ? ` (reference: ${error.digest})` : ""}.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </>
        )}
      </body>
    </html>
  );
}
