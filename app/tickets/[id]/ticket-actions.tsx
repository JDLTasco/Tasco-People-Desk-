"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticketId: string;
  version: number;
  status: string;
  categoryId: string | null;
  isAssignedTicket: boolean;
  canEditMetadata: boolean;
  role: "ADMIN" | "HR_LEAD" | "HR_OFFICER";
  userId: string;
}

interface SimpleUser {
  id: string;
  displayName: string;
  initials: string;
}
interface SimpleLookup {
  id: string;
  name: string;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function TicketActions({
  ticketId,
  version,
  status,
  categoryId,
  isAssignedTicket,
  canEditMetadata,
  role,
  userId,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [categories, setCategories] = useState<SimpleLookup[]>([]);
  const [businessUnits, setBusinessUnits] = useState<SimpleLookup[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? "");
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState("");
  const [reverseTo, setReverseTo] = useState("");
  const [reverseReason, setReverseReason] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/business-units")
      .then((r) => r.json())
      .then((d) => setBusinessUnits(d.businessUnits ?? []));
  }, []);

  async function run(action: () => Promise<{ ok: boolean; status: number; data: { error?: string } }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      if (result.status === 409) {
        setError("This ticket changed since it was loaded -- reloading.");
        router.refresh();
        return;
      }
      setError(result.data?.error ?? `Request failed (${result.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <section className="section-card">
      <h2>Actions</h2>
      {error && (
        <p role="alert" className="banner banner-error">
          {error}
        </p>
      )}

      {canEditMetadata && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Metadata</h3>
          <label>
            Category:{" "}
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="">(none)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            Business unit:{" "}
            <select value={selectedBusinessUnit} onChange={(e) => setSelectedBusinessUnit(e.target.value)}>
              <option value="">(none)</option>
              {businessUnits.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>{" "}
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const res = await fetch(`/api/tickets/${ticketId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    version,
                    categoryId: selectedCategory || null,
                    businessUnitId: selectedBusinessUnit || null,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                return { ok: res.ok, status: res.status, data };
              })
            }
          >
            Save metadata
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {status === "NEW" && (
          <button disabled={busy} onClick={() => run(() => postJson(`/api/tickets/${ticketId}/claim`, {}))}>
            Claim
          </button>
        )}

        {status === "ALLOCATED" && (isAssignedTicket || role === "ADMIN" || role === "HR_LEAD") && (
          <button
            disabled={busy}
            onClick={() => run(() => postJson(`/api/tickets/${ticketId}/start-action`, { version }))}
          >
            Start action
          </button>
        )}

        {status === "OUTCOME" && (isAssignedTicket || role === "ADMIN" || role === "HR_LEAD") && (
          <button disabled={busy} onClick={() => run(() => postJson(`/api/tickets/${ticketId}/close`, { version }))}>
            Close
          </button>
        )}

        {(status === "NEW" || status === "ALLOCATED" || status === "IN_ACTION") && (
          <button
            disabled={busy}
            onClick={() => run(() => postJson(`/api/tickets/${ticketId}/close-not-a-request`, { version }))}
          >
            &quot;Not a request&quot; close
          </button>
        )}
      </div>

      {(status === "ALLOCATED" || status === "IN_ACTION") && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Reassign</h3>
          <select value={selectedAssignee} onChange={(e) => setSelectedAssignee(e.target.value)}>
            <option value="">(choose a user)</option>
            {users
              .filter((u) => u.id !== userId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.initials})
                </option>
              ))}
          </select>{" "}
          <button
            disabled={busy || !selectedAssignee}
            onClick={() => run(() => postJson(`/api/tickets/${ticketId}/assign`, { userId: selectedAssignee, version }))}
          >
            Reassign
          </button>
        </div>
      )}

      {role === "ADMIN" && (
        <div>
          <h3>Reverse (ADMIN only, requires a fresh step-up sign-in)</h3>
          <select value={reverseTo} onChange={(e) => setReverseTo(e.target.value)}>
            <option value="">(target status)</option>
            {["NEW", "ALLOCATED", "IN_ACTION", "OUTCOME", "CLOSED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>{" "}
          <input
            placeholder="Reason (required)"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
          />{" "}
          <button
            disabled={busy || !reverseTo || !reverseReason.trim()}
            onClick={() =>
              run(() => postJson(`/api/tickets/${ticketId}/reverse`, { toStatus: reverseTo, reason: reverseReason, version }))
            }
          >
            Reverse
          </button>
        </div>
      )}
    </section>
  );
}
