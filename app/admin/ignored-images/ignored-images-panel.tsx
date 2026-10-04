"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function send(url: string, method: "POST" | "PATCH", body: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run(url: string, method: "POST" | "PATCH", body: object, done: (data: Record<string, unknown>) => string) {
    setBusy(true);
    setMessage(null);
    const result = await send(url, method, body);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.data?.error ?? `Request failed (${result.status})`);
      return;
    }
    setMessage(done(result.data));
    router.refresh();
  }
  return { busy, message, run };
}

const copies = (n: unknown) => `${n} cop${n === 1 ? "y" : "ies"}`;

export function IgnoreImageForm({ sha256, defaultLabel }: { sha256: string; defaultLabel: string }) {
  const [label, setLabel] = useState(defaultLabel);
  const { busy, message, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run("/api/admin/ignored-images", "POST", { sha256, label }, (d) => `Ignored -- ${copies(d.removed)} taken off tickets.`);
      }}
      style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} placeholder="e.g. Tasco 70 years logo" />
      <button type="submit" disabled={busy}>
        Ignore
      </button>
      {message && <span role="status">{message}</span>}
    </form>
  );
}

export function IgnoredImageToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { busy, message, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(`/api/admin/ignored-images/${id}`, "PATCH", { isActive: !isActive }, (d) =>
            isActive ? `Switched off -- ${copies(d.restored)} put back.` : `Ignored again -- ${copies(d.removed)} taken off.`,
          )
        }
      >
        {isActive ? "Switch off" : "Ignore again"}
      </button>
      {message && <span role="status"> {message}</span>}
    </>
  );
}
