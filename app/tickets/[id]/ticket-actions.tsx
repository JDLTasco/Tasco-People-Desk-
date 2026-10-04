"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import OutcomeDispatchModal from "./outcome-dispatch-modal";
import MergeTicketForm from "./merge-ticket-form";
import QuestionModal from "./question-modal";
import { isAutoTargetReason } from "@/lib/tickets/target-due";
import { registerSaver, type SaveResult } from "@/components/pending-saves";

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
  attachments: OutcomeAttachment[];
  isConfidential: boolean;
  isLegalHold: boolean;
  /** CLOSED within the last 30 days and not merged away -- see lib/tickets/reopen.ts. */
  canReopen: boolean;
  /** Current action item (e.g. "On Hold"), only ever set while IN_ACTION -- see lib/tickets/action-status.ts. */
  actionStatusId: string | null;
  actionStatusName: string | null;
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
  attachments,
  isConfidential,
  isLegalHold,
  canReopen,
  actionStatusId,
  actionStatusName,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [categories, setCategories] = useState<SimpleLookup[]>([]);
  const [businessUnits, setBusinessUnits] = useState<SimpleLookup[]>([]);
  const [actionItems, setActionItems] = useState<SimpleLookup[]>([]);
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

  // Current action dropdown (2026-10-01). Values: the two response
  // sub-statuses, plain IN_ACTION, or "item:<id>" for an action item.
  const currentAction =
    status === "IN_ACTION" ? (actionStatusId ? `item:${actionStatusId}` : "IN_ACTION") : status;
  const [selectedAction, setSelectedAction] = useState(currentAction);
  useEffect(() => setSelectedAction(currentAction), [currentAction]);
  const actionOptions: { value: string; label: string; allowed: boolean }[] = [
    // Back to plain IN_ACTION from anything else is assignee/HR_LEAD/ADMIN only.
    { value: "IN_ACTION", label: "In action", allowed: isAssigneeOrLead },
    { value: "AWAITING_RESPONSE", label: "Awaiting response", allowed: true },
    { value: "RESPONSE_RECEIVED", label: "Response received", allowed: true },
    ...actionItems.map((a) => ({
      value: `item:${a.id}`,
      label: a.name,
      // From a response sub-step, setting an item moves the ticket back to IN_ACTION.
      allowed: status === "IN_ACTION" || isAssigneeOrLead,
    })),
  ];
  // A deactivated item still on this ticket isn't in the active list -- show it so the dropdown reads correctly.
  if (actionStatusId && status === "IN_ACTION" && !actionItems.some((a) => a.id === actionStatusId)) {
    actionOptions.push({ value: `item:${actionStatusId}`, label: actionStatusName ?? "Action item", allowed: true });
  }

  function changeAction(target: string, v: number): Promise<ApiResult> {
    if (target.startsWith("item:")) {
      return postJson(`/api/tickets/${ticketId}/action-status`, { version: v, actionStatusId: target.slice(5) });
    }
    if (target === "IN_ACTION" && status === "IN_ACTION") {
      return postJson(`/api/tickets/${ticketId}/action-status`, { version: v, actionStatusId: null });
    }
    return postJson(`/api/tickets/${ticketId}/response-status`, {
      version: v,
      toStatus: target,
      ...(target === "RESPONSE_RECEIVED" ? { note: responseNote } : {}),
    });
  }

  // Save & exit (2026-10-03): saves pending detail changes, then applies a
  // Current action that was picked but not yet applied with Update action.
  // A ref keeps the registered saver reading the latest state.
  const saveForExit = useRef<() => Promise<SaveResult>>(async () => ({ ok: true }));
  saveForExit.current = async () => {
    if (targetDue !== "" && pendingChanges().targetDueAt !== undefined && !targetDueReasonText.trim()) {
      return { ok: false, error: "give a reason for the target due date (Metadata panel)." };
    }
    const saved = await saveChanges();
    if ("ok" in saved) {
      return { ok: false, error: saved.status === 409 ? "this ticket changed since you opened it -- reload and try again." : (saved.data?.error ?? `saving changes failed (${saved.status})`) };
    }
    if (isWorking && selectedAction !== currentAction) {
      if (selectedAction === "RESPONSE_RECEIVED" && !responseNote.trim()) {
        return { ok: false, error: "type what the requester said for Response received (Current action), or change it back." };
      }
      const result = await changeAction(selectedAction, saved.version);
      if (!result.ok) {
        return { ok: false, error: result.status === 409 ? "this ticket changed since you opened it -- reload and try again." : (result.data?.error ?? `updating the current action failed (${result.status})`) };
      }
    }
    return { ok: true };
  };
  useEffect(() => registerSaver("ticket-actions", () => saveForExit.current()), []);

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
    fetch("/api/action-statuses")
      .then((r) => r.json())
      .then((d) => setActionItems(d.actionStatuses ?? []));
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

        {/* Target due date -- the KPI (2026-10-03). Set automatically from the
            priority in working days (P1 3, P2 10, P3 20) and follows priority
            changes until someone overrides it with a reason. Editable by any
            signed-in staff member (2026-09-16), see STATUS.md. */}
        <p>
        <label>
          Target due (KPI):{" "}
          <input
            type="datetime-local"
            value={targetDue}
            onChange={(e) => {
              setTargetDue(e.target.value);
              // Overriding the automatic date needs a real reason.
              if (isAutoTargetReason(targetDueReasonText)) setTargetDueReasonText("");
            }}
          />
        </label>{" "}
        <label>
          Reason (required when you change the date):{" "}
          <input
            value={targetDueReasonText}
            onChange={(e) => setTargetDueReasonText(e.target.value)}
            placeholder="e.g. Fair Work response date"
            readOnly={isAutoTargetReason(targetDueReasonText)}
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

      {/* Current action (John, 2026-10-01): one dropdown for where the
          ticket is up to while it's being worked -- in action, awaiting
          response, response received, or any admin-managed action item
          (e.g. On Hold). Each choice calls the same routes the separate
          buttons used to; the server still enforces who may do what. */}
      {isWorking && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Current action</h3>
          <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)} disabled={busy}>
            {actionOptions.map((o) => (
              <option key={o.value} value={o.value} disabled={!o.allowed}>
                {o.label}
                {o.value === currentAction ? " (current)" : !o.allowed ? " (assignee, HR Lead or Admin only)" : ""}
              </option>
            ))}
          </select>{" "}
          <button
            disabled={busy || selectedAction === currentAction || (selectedAction === "RESPONSE_RECEIVED" && !responseNote.trim())}
            onClick={() =>
              runWithSave(async (v) => {
                const result = await changeAction(selectedAction, v);
                if (result.ok) setResponseNote("");
                return result;
              })
            }
          >
            Update action
          </button>
          {selectedAction === "RESPONSE_RECEIVED" && selectedAction !== currentAction && (
            <div style={{ marginTop: "0.5rem" }}>
              <textarea
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder="What did the requester say? (required -- saved as an internal note; the assignee gets an alert)"
                rows={3}
                style={{ width: "100%", maxWidth: "40rem" }}
              />
            </div>
          )}
        </div>
      )}

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

          {isWorking && isAssigneeOrLead && (
            <OutcomeDispatchModal
              ticketId={ticketId}
              version={version}
              ticketNo={ticketNo}
              displaySubject={displaySubject}
              requesterEmail={requesterEmail}
              initialCcRecipients={ccRecipients}
              attachments={attachments}
            />
          )}

          {isWorking && isAssigneeOrLead && (
            <QuestionModal
              ticketId={ticketId}
              ticketNo={ticketNo}
              displaySubject={displaySubject}
              requesterEmail={requesterEmail}
              initialCcRecipients={ccRecipients}
              saveChanges={async () => {
                const saved = await saveChanges();
                if ("ok" in saved) return { error: saved.data?.error ?? `Saving changes failed (${saved.status})` };
                return saved;
              }}
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

          {/* Info only / Autoclose (2026-10-03): close and archive straight away --
              no priority, category or target date needed, and any unsaved
              detail edits are deliberately NOT saved first (they'd only get in
              the way of closing). Confirmed, because an archived ticket can't
              be reopened. */}
          {canCloseEarly && (
            <button
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Close as Info only and archive it now? It can't be reopened afterwards.")) return;
                void run(() => postJson(`/api/tickets/${ticketId}/close-not-a-request`, { version }));
              }}
            >
              Close -- Info only
            </button>
          )}

          {canCloseEarly && (
            <button
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Close as Autoclose (spam / no action needed) and archive it now? It can't be reopened afterwards.")) return;
                void run(() => postJson(`/api/tickets/${ticketId}/close-autoclose`, { version }));
              }}
            >
              Close -- Autoclose (spam / no action needed)
            </button>
          )}

          {/* Block this sender (John, 2026-10-05): ADMIN only, since the
              block list is ADMIN-maintained (§3). Adds a Sender rule for the
              requester, then closes as Info only (which archives). Not offered
              for Tasco's own staff -- blocking one would also drop their
              replies on other tickets. */}
          {canCloseEarly && role === "ADMIN" && !requesterEmail.toLowerCase().endsWith("@tascopetroleum.com.au") && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `Block ${requesterEmail}? Future emails from this address won't become tickets (they're listed under Admin -> Blocked emails). This ticket is then closed as Info only and archived -- it can't be reopened.`,
                  )
                )
                  return;
                void run(async () => {
                  const blocked = await postJson("/api/admin/suppression-rules", { type: "SENDER", value: requesterEmail });
                  if (!blocked.ok) return blocked;
                  return postJson(`/api/tickets/${ticketId}/close-not-a-request`, { version });
                });
              }}
            >
              Block this sender
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

      {canMerge && (status === "NEW" || status === "ALLOCATED" || isWorking || status === "OUTCOME") && (
        <div style={{ marginBottom: "1rem" }}>
          <MergeTicketForm ticketId={ticketId} ticketNo={ticketNo} version={version} />
        </div>
      )}

      {/* Any HR role may assign a pooled ticket to someone else (2026-10-03). */}
      {status === "NEW" && (
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
