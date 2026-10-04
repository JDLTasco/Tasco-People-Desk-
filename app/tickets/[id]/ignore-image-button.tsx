"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ignored images (John, 2026-10-05): ADMIN-only "Always ignore" on an image
// attachment -- puts this exact image on Admin -> Ignored images, which also
// takes every existing copy off tickets (this one included).
export default function IgnoreImageButton({ attachmentId, filename }: { attachmentId: string; filename: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ignore() {
    const label = window.prompt(
      `Always ignore this image (${filename})? It will be skipped on future emails and taken off every ticket it's already on. Give it a name for the ignore list:`,
      filename,
    );
    if (label === null) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/ignored-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId, label }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Request failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button type="button" className="secondary" disabled={busy} onClick={() => void ignore()} style={{ marginLeft: "0.5rem" }}>
        Always ignore
      </button>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}
