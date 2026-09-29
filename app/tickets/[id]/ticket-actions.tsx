"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
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
  priority: "P1" | "P2" | "P3";
  categoryId: string | null;
  businessUnitId: string | null;
  isAssignedTicket: boolean;
  canEditMetadata: boolean;
  canMerge: boolean;
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
  /** CLOSED within the last 30 days and not merged away -- see lib/tickets/reopen.ts. */
  canReopen: boolean;
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

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  priority,
  categoryId,
  businessUnitId,
  isAssignedTicket,
  canEditMetadata,
  canMerge,
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
  canReopen,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [categories, setCategories] = useState<SimpleLookup[]>([]);
  const [businessUnits, setBusinessUnits] = useState<SimpleLookup[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<"P1" | "P2" | "P3">(priority);
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? "");
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState(businessUnitId ?? "");
  const [reverseTo, setReverseTo] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  // §8: target_due_at shown in the datetime-local input's "YYYY-MM-DDTHH:mm"
  // shape, in the browser's own time zone (it used to be the raw UTC slice,
  // so it read 10 hours off in Melbourne). Filled in after mount so the
  // server render (UTC) can't disagree with the browser's. targetDueReason
  // is mandatory whenever a date is set (enforced server-side too -- see
  // PATCH /api/tickets/[id]).
  const originalDue = targetDueAt ? toLocalInputValue(targetDueAt) : "";
  const [targetDue, setTargetDue] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setTargetDue(originalDue);
    setMounted(true);
  }, [originalDue]);
  const [targetDueReasonText, setTargetDueReasonText] = useState(targetDueReason ?? "");
  const [legalHoldReasonText, setLegalHoldReasonText] = useState("");
  const [deleteReasonText, setDeleteReasonText] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  // IN_ACTION and its two response sub-steps (see lib/tickets/transitions.ts).
  const isWorking = status === "IN_ACTION" || status === "AWAITING_RESPONSE" || status === "RESPONSE_RECEIVED";
  const canCloseEarly = status === "NEW" || status === "ALLOCATED" || isWorking;
  const isAssigneeOrLead = isAssignedTicket || role === "ADMIN" || role === "HR_LEAD";

  // Only the fields actually changed are sent, so an unchanged form never
  // writes an empty audit row (2026-09-29: one Save button for all details,
  // and every action button saves pending changes first).
  function pendingChanges(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    if (canEditMetadata) {
      if (selectedPriority !== priority) changes.priority = selectedPriority;
      if ((selectedCategory || null) !== categoryId) changes.categoryId = selectedCategory || null;
      if ((selectedBusinessUnit || null) !== businessUnitId) changes.businessUnitId = selectedBusinessUnit || null;
    }
    if (mounted && targetDue !== originalDue || (targetDue && targetDueReasonText !== (targetDueReason ?? ""))) {
      changes.targetDueAt = targetDue ? new Date(targetDue).toISOString() : null;
      changes.targetDueReason = targetDue ? targetDueReasonText : null;
    }
    return changes;
  }
  const hasPendingChanges = Object.keys(pendingChanges()).length > 0;

  type ApiResult = { ok: boolean; status: number; data: { error?: string; ticket?: { version: number } } };

  // Saves pending changes (if any) and returns the ticket's new version,
  // or the failed result so the caller can stop before running its action.
  async function saveChanges(): Promise<{ version: number } | ApiResult> {
    const changes = pendingChanges();
    if (Object.keys(changes).length === 0) return { version };
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, ...changes }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, data };
    return { version: data.ticket?.version ?? version + 1 };
  }

  /** Runs an action button: saves any pending detail changes first, then the action itself with the fresh version. */
  function runWithSave(action: (currentVersion: number) => Promise<ApiResult>) {
    return run(async () => {
      const saved = await saveChanges();
      if ("ok" in saved) return saved;
      return action(saved.version);
    });
  }

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
          {/* §6's step-up flow has no real trigger anywhere in the UI --
              nothing ever calls signIn("azure-ad-step-up"), so every
              step-up-gated action (this one included) has been unreachable
              for a real Entra sign-in until this button existed (found
              2026-09-19, building the admin user-identity-relink feature).
              The message text itself is the signal, not a separate flag --
              every step-up 403 from the API is worded "Step-up
              re-authentication required for ...". */}
          {error.startsWith("Step-up re-authentication required") && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => signIn("azure-ad-step-up", { callbackUrl: window.location.href })}
              >
                Re-authenticate
              </button>
            </>
          )}
        </p>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <h3>Metadata</h3>
        {canEditMetadata && (
          <p>
          <label>
            Priority:{" "}
            <select value={selectedPriority} onChange={(e) => setSelectedPriority(e.target.value as "P1" | "P2" | "P3")}>
              {["P1", "P2", "P3"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>{" "}
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
          </label>
          </p>
        )}

        {/* Target due date (§8 -- optional, for a specific external deadline).
            Editable by any signed-in staff member -- broadened at John's
            request (2026-09-16), see STATUS.md. */}
        <p>
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
        {targetDue && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setTargetDue("");
              setTargetDueReasonText("");
            }}
          >
            Clear date
          </button>
        )}
        </p>
        <button
          disabled={busy || !hasPendingChanges || (targetDue !== "" && !targetDueReasonText.trim())}
          onClick={() => runWithSave(async () => ({ ok: true, status: 200, data: {} }))}
        >
          Save changes
        </button>
        {hasPendingChanges && <em> Unsaved changes -- also saved automatically when you press any Action button.</em>}
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <h3>Action</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {status === "NEW" && (
            <button disabled={busy} onClick={() => runWithSave(() => postJson(`/api/tickets/${ticketId}/claim`, {}))}>
              Claim
            </button>
          )}

          {status === "ALLOCATED" && (isAssignedTicket || role === "ADMIN" || role === "HR_LEAD") && (
            <button
              disabled={busy}
              onClick={() => runWithSave((v) => postJson(`/api/tickets/${ticketId}/start-action`, { version: v }))}
            >
              Start action
            </button>
          )}

          {(status === "IN_ACTION" || status === "RESPONSE_RECEIVED") && (
            <button
              disabled={busy}
              onClick={() =>
                runWithSave((v) =>
                  postJson(`/api/tickets/${ticketId}/response-status`, { version: v, toStatus: "AWAITING_RESPONSE" }),
                )
              }
            >
              Mark awaiting response
            </button>
          )}

          {(status === "AWAITING_RESPONSE" || status === "RESPONSE_RECEIVED") && isAssigneeOrLead && (
            <button
              disabled={busy}
              onClick={() =>
                runWithSave((v) => postJson(`/api/tickets/${ticketId}/response-status`, { version: v, toStatus: "IN_ACTION" }))
              }
            >
              Back to in action
            </button>
          )}

          {isWorking && isAssigneeOrLead && (
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
            <button disabled={busy} onClick={() => runWithSave((v) => postJson(`/api/tickets/${ticketId}/close`, { version: v }))}>
              Close -- Resolved
            </button>
          )}

          {canCloseEarly && (
            <button
              disabled={busy}
              onClick={() => runWithSave((v) => postJson(`/api/tickets/${ticketId}/close-withdrawn`, { version: v }))}
            >
              Close -- Withdrawn
            </button>
          )}

          {canCloseEarly && (
            <button
              disabled={busy}
              onClick={() => runWithSave((v) => postJson(`/api/tickets/${ticketId}/close-not-a-request`, { version: v }))}
            >
              Close -- Not a request
            </button>
          )}

          {canCloseEarly && (
            <button
              disabled={busy}
              onClick={() => runWithSave((v) => postJson(`/api/tickets/${ticketId}/close-autoclose`, { version: v }))}
            >
              Close -- Autoclose (spam / no action needed)
            </button>
          )}

          {/* Reopen within 30 days of closing (2026-09-29) -- any staff member, reason required. */}
          {canReopen && (
            <span>
              <input
                placeholder="Reason for reopening (required)"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                style={{ width: "18rem" }}
              />{" "}
              <button
                disabled={busy || !reopenReason.trim()}
                onClick={() =>
                  runWithSave((v) => postJson(`/api/tickets/${ticketId}/reopen`, { version: v, reason: reopenReason }))
                }
              >
                Reopen
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Any staff member can record a requester's response (e.g. they took the
          call on someone else's ticket) -- the assignee gets an in-app alert. */}
      {(status === "IN_ACTION" || status === "AWAITING_RESPONSE") && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Response received</h3>
          <textarea
            value={responseNote}
            onChange={(e) => setResponseNote(e.target.value)}
            placeholder="What did the requester say? (required -- saved as an internal note)"
            rows={3}
            style={{ width: "100%", maxWidth: "40rem" }}
          />
          <div>
            <button
              disabled={busy || !responseNote.trim()}
              onClick={() =>
                runWithSave(async (v) => {
                  const result = await postJson(`/api/tickets/${ticketId}/response-status`, {
                    version: v,
                    toStatus: "RESPONSE_RECEIVED",
                    note: responseNote,
                  });
                  if (result.ok) setResponseNote("");
                  return result;
                })
              }
            >
              Mark response received
            </button>
          </div>
        </div>
      )}

      {canMerge && (status === "NEW" || status === "ALLOCATED" || isWorking || status === "OUTCOME") && (
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
                  {u.displayName}
                </option>
              ))}
          </select>{" "}
          <button
            disabled={busy || !selectedAssignee}
            onClick={() => runWithSave(() => postJson(`/api/tickets/${ticketId}/assign`, { userId: selectedAssignee }))}
          >
            Assign
          </button>
        </div>
      )}

      {(status === "ALLOCATED" || isWorking) && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Reassign</h3>
          <select value={selectedAssignee} onChange={(e) => setSelectedAssignee(e.target.value)}>
            <option value="">(choose a user)</option>
            {users
              .filter((u) => u.id !== userId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </select>{" "}
          <button
            disabled={busy || !selectedAssignee}
            onClick={() =>
              runWithSave((v) => postJson(`/api/tickets/${ticketId}/assign`, { userId: selectedAssignee, version: v }))
            }
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
            {["NEW", "ALLOCATED", "IN_ACTION", "AWAITING_RESPONSE", "RESPONSE_RECEIVED", "OUTCOME", "CLOSED"].map((s) => (
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
