"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OutcomeDispatchModal from "./outcome-dispatch-modal";
import MergeTicketForm from "./merge-ticket-form";

interface OutcomeNote {
  id: string;
  body: string;
  visibility: "INTERNAL" | "REQUESTER_VISIBLE";
}
interface OutcomeAttachment {
  id: string;
  filename: string;
}

interface Props {
  ticketId: string;
  version: number;
  status: string;
  categoryId: string | null;
  businessUnitId: string | null;
  isAssignedTicket: boolean;
  canEditMetadata: boolean;
  role: "ADMIN" | "HR_LEAD" | "HR_OFFICER";
  userId: string;
  ticketNo: string;
  displaySubject: string;
  requesterEmail: string;
  ccRecipients: string[];
  targetDueAt: string | null;
  targetDueReason: string | null;
  notes: OutcomeNote[];
  attachments: OutcomeAttachment[];
  isConfidential: boolean;
  isLegalHold: boolean;
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
  businessUnitId,
  isAssignedTicket,
  canEditMetadata,
  role,
  userId,
  ticketNo,
  displaySubject,
  requesterEmail,
  ccRecipients,
  targetDueAt,
  targetDueReason,
  notes,
  attachments,
  isConfidential,
  isLegalHold,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [categories, setCategories] = useState<SimpleLookup[]>([]);
  const [businessUnits, setBusinessUnits] = useState<SimpleLookup[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? "");
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState(businessUnitId ?? "");
  const [reverseTo, setReverseTo] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  // §8: target_due_at is an ISO string sliced to the datetime-local input's
  // expected "YYYY-MM-DDTHH:mm" shape; targetDueReason is mandatory
  // whenever a date is set (enforced server-side too -- see PATCH /api/tickets/[id]).
  const [targetDue, setTargetDue] = useState(targetDueAt ? targetDueAt.slice(0, 16) : "");
  const [targetDueReasonText, setTargetDueReasonText] = useState(targetDueReason ?? "");
  const [legalHoldReasonText, setLegalHoldReasonText] = useState("");
  const [deleteReasonText, setDeleteReasonText] = useState("");

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

      {canEditMetadata && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Target due date (§8 -- optional, for a specific external deadline)</h3>
          <label>
            Target due:{" "}
            <input type="datetime-local" value={targetDue} onChange={(e) => setTargetDue(e.target.value)} />
          </label>{" "}
          <label>
            Reason (required whenever a date is set):{" "}
            <input
              value={targetDueReasonText}
              onChange={(e) => setTargetDueReasonText(e.target.value)}
              placeholder="e.g. Fair Work response date"
              style={{ width: "16rem" }}
            />
          </label>{" "}
          <button
            disabled={busy || (targetDue !== "" && !targetDueReasonText.trim())}
            onClick={() =>
              run(async () => {
                const res = await fetch(`/api/tickets/${ticketId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    version,
                    targetDueAt: targetDue ? new Date(targetDue).toISOString() : null,
                    targetDueReason: targetDue ? targetDueReasonText : null,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                return { ok: res.ok, status: res.status, data };
              })
            }
          >
            Save target due date
          </button>{" "}
          {targetDue && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setTargetDue("");
                setTargetDueReasonText("");
                run(async () => {
                  const res = await fetch(`/api/tickets/${ticketId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ version, targetDueAt: null, targetDueReason: null }),
                  });
                  const data = await res.json().catch(() => ({}));
                  return { ok: res.ok, status: res.status, data };
                });
              }}
            >
              Clear
            </button>
          )}
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

        {status === "IN_ACTION" && (isAssignedTicket || role === "ADMIN" || role === "HR_LEAD") && (
          <OutcomeDispatchModal
            ticketId={ticketId}
            version={version}
            ticketNo={ticketNo}
            displaySubject={displaySubject}
            requesterEmail={requesterEmail}
            initialCcRecipients={ccRecipients}
            notes={notes}
            attachments={attachments}
          />
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

        {(status === "NEW" || status === "ALLOCATED" || status === "IN_ACTION") && (
          <button
            disabled={busy}
            onClick={() => run(() => postJson(`/api/tickets/${ticketId}/close-autoclose`, { version }))}
          >
            Autoclose (spam / no action needed)
          </button>
        )}
      </div>

      {canEditMetadata && (status === "NEW" || status === "ALLOCATED" || status === "IN_ACTION" || status === "OUTCOME") && (
        <div style={{ marginBottom: "1rem" }}>
          <MergeTicketForm ticketId={ticketId} ticketNo={ticketNo} version={version} />
        </div>
      )}

      {status === "NEW" && (role === "ADMIN" || role === "HR_LEAD") && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Assign to</h3>
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
            onClick={() => run(() => postJson(`/api/tickets/${ticketId}/assign`, { userId: selectedAssignee }))}
          >
            Assign
          </button>
        </div>
      )}

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

      {(role === "ADMIN" || role === "HR_LEAD") && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Confidential</h3>
          {!isConfidential ? (
            <button disabled={busy} onClick={() => run(() => postJson(`/api/tickets/${ticketId}/confidential`, { version, set: true }))}>
              Mark confidential
            </button>
          ) : (
            role === "ADMIN" && (
              <button
                disabled={busy}
                onClick={() => run(() => postJson(`/api/tickets/${ticketId}/confidential`, { version, set: false }))}
              >
                Clear confidential (requires a fresh step-up sign-in)
              </button>
            )
          )}
        </div>
      )}

      {role === "ADMIN" && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Legal hold (requires a fresh step-up sign-in)</h3>
          <input
            placeholder="Reason (required)"
            value={legalHoldReasonText}
            onChange={(e) => setLegalHoldReasonText(e.target.value)}
            style={{ width: "18rem" }}
          />{" "}
          <button
            disabled={busy || !legalHoldReasonText.trim()}
            onClick={() =>
              run(() => postJson(`/api/tickets/${ticketId}/legal-hold`, { version, set: !isLegalHold, reason: legalHoldReasonText }))
            }
          >
            {isLegalHold ? "Clear legal hold" : "Set legal hold"}
          </button>
        </div>
      )}

      {role === "ADMIN" && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Delete (ADMIN only, requires a fresh step-up sign-in)</h3>
          {isLegalHold ? (
            <p>Blocked while this ticket is under legal hold.</p>
          ) : (
            <>
              <input
                placeholder="Reason (required)"
                value={deleteReasonText}
                onChange={(e) => setDeleteReasonText(e.target.value)}
                style={{ width: "18rem" }}
              />{" "}
              <button
                disabled={busy || !deleteReasonText.trim()}
                onClick={() => run(() => postJson(`/api/tickets/${ticketId}/delete`, { version, reason: deleteReasonText }))}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
