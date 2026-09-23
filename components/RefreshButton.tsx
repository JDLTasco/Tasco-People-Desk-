"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Every list/detail page is a Server Component reading straight from the
// DB, but Next.js's client-side router cache can still serve a stale
// segment on plain <Link> navigation -- this forces a real re-fetch of the
// current route's server data without a full browser reload. Rendered
// once in NavBar so it's on every page automatically, not copy-pasted
// per route.
export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="nav-icon-btn"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      title="Refresh this page's data"
    >
      {isPending ? "Refreshing…" : "⟳ Refresh"}
    </button>
  );
}
