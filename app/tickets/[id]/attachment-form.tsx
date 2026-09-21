"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticketId: string;
}

export default function AttachmentForm({ ticketId }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/tickets/${ticketId}/attachments`, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (data.blocked) {
      setNotice(`"${file.name}" was blocked (${data.blockReason}) -- not available on this ticket.`);
    } else {
      setNotice(`"${file.name}" uploaded -- awaiting malware scan.`);
    }
    router.refresh();
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}
      {notice && <p className="banner">{notice}</p>}
      <input ref={fileInputRef} type="file" />
      <button type="button" disabled={busy} onClick={() => void submit()} style={{ marginLeft: "0.5rem" }}>
        Upload attachment
      </button>
    </div>
  );
}
