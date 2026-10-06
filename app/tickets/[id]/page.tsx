import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadTicketForViewer } from "@/lib/tickets/detail";
import { effectiveDueDate, isOverdue } from "@/lib/tickets/due-dates";
import { isAutoTargetReason } from "@/lib/tickets/target-due";
import { getAssigneeColourMap } from "@/lib/users/colours";
import { loadHolidaySet } from "@/lib/calendar/holidays";
import { validateReopen } from "@/lib/tickets/reopen";
import { canActOnAssignedTicket, canEditTicketMetadata, canManageAdminSettings } from "@/lib/rbac";
import { formatAuDateTime } from "@/lib/format-date";
import { messageDisplayText } from "@/lib/email/html-to-text";
import { currentActionLabel, displayStatus } from "@/lib/tickets/action-status";
import TicketActions from "./ticket-actions";
import NoteForm from "./note-form";
import AttachmentForm from "./attachment-form";
import AttachmentRemoveForm from "./attachment-remove-form";
import IgnoreImageButton from "./ignore-image-button";
import SaveExitButton from "./save-exit-button";

// Correspondence label (John, 2026-10-05): outbound emails are named by type
// (was a plain "EMAIL OUT"), so the Outcome stands out from the rest.
const OUTBOUND_LABELS: Record<string, string> = {
  OUTCOME: "OUTCOME SENT",
  REQUESTER_QUESTION: "QUESTION SENT",
  ACKNOWLEDGEMENT: "ACKNOWLEDGEMENT",
  CLOSED_RESOLVED: "CLOSED NOTICE",
  ALLOCATION: "ALLOCATION",
  SLA_ESCALATION: "OVERDUE ALERT",
};
function correspondenceLabel(m: { messageType: string; direction: string }): string {
  if (m.messageType === "MANUAL") return "MANUAL ENTRY";
  if (m.direction === "INBOUND") return "EMAIL IN";
  return OUTBOUND_LABELS[m.messageType] ?? "EMAIL OUT";
}

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return null;

  const ticket = await loadTicketForViewer(params.id, session.user.id, session.user.role);
  if (!ticket) notFound();

  const isAssignedTicket = ticket.assignedToId === session.user.id;
  const canEditMetadata = canEditTicketMetadata(session.user.role);
  const canMerge = canActOnAssignedTicket(session.user.role, isAssignedTicket);
  const due = effectiveDueDate(ticket.slaDueAt, ticket.targetDueAt);
  const overdue = isOverdue(ticket.slaDueAt, ticket.targetDueAt, ticket.status);
  const lastChange = ticket.statusHistory[ticket.statusHistory.length - 1];
  const assigneeColour = ticket.assignee ? ((await getAssigneeColourMap()).get(ticket.assignee.id) ?? null) : null;
  // For the target-date preview when priority is changed (2026-10-05).
  const holidayKeys = Array.from(await loadHolidaySet());

  return (
    <main className="ticket-page">
      <div className="ticket-title-row">
        <h1>
          {ticket.ticketNo} -- {ticket.subject}
        </h1>
        <SaveExitButton />
      </div>

      {/* "Current action" banner (John, 2026-10-01) -- where the ticket is up
          to, plus who last moved it and when (latest status history row). */}
      <p className={`banner banner-current-action current-action-${ticket.status}`}>
        Current action: <strong>{currentActionLabel(ticket)}</strong>
        {lastChange && (
          <span className="current-action-meta">
            {" "}
            -- set by {lastChange.actor.displayName} on {formatAuDateTime(lastChange.createdAt)}
          </span>
        )}
      </p>

      {ticket.responseAlertPending && isAssignedTicket && (
        <p role="alert" className="banner banner-response">
          🔔 A response was received on this ticket -- see the latest email or note.
        </p>
      )}

      {ticket.isLegalHold && (
        <p className="banner banner-legal-hold">
          LEGAL HOLD -- RETENTION PURGE SUSPENDED
          <br />
          Reason: {ticket.legalHoldReason} -- set by {ticket.legalHoldSetBy?.displayName ?? "(unknown)"} on{" "}
          {ticket.legalHoldSetAt ? formatAuDateTime(ticket.legalHoldSetAt) : ""}
        </p>
      )}
      {ticket.isConfidential && (
        <p className="banner banner-confidential">
          🔒 Confidential -- set by {ticket.confidentialSetBy?.displayName ?? "(unknown)"} on{" "}
          {ticket.confidentialSetAt ? formatAuDateTime(ticket.confidentialSetAt) : ""}
        </p>
      )}
      {ticket.mergedIntoTicket && (
        <p className="banner banner-error">
          This ticket was merged into{" "}
          <a href={`/tickets/${ticket.mergedIntoTicket.id}`}>{ticket.mergedIntoTicket.ticketNo}</a> -- see that ticket for
          the full correspondence.
        </p>
      )}
      {ticket.mergedFromTickets.length > 0 && (
        <p className="banner banner-confidential">
          Merged from:{" "}
          {ticket.mergedFromTickets.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <a href={`/tickets/${t.id}`}>{t.ticketNo}</a>
            </span>
          ))}
        </p>
      )}

      {/* Split layout (John, 2026-10-01): details, actions, attachments, notes
          and history on the left, staying in view while the correspondence on
          the right scrolls, newest first. One column on narrow screens. */}
      <div className="ticket-split">
        <div className="ticket-left">
          <section className="meta-grid">
            <div>
              <strong>Status:</strong> <span className={`chip chip-status-${ticket.status}${ticket.actionStatus ? " chip-action-item" : ""}`}>
                {displayStatus(ticket)}
              </span>
            </div>
            <div>
              <strong>Priority:</strong> <span className={`chip chip-priority-${ticket.priority}`}>{ticket.priority}</span>
            </div>
            <div>
              <strong>Category:</strong>{" "}
              {ticket.category?.name ?? <em>none {ticket.status === "ALLOCATED" && "-- required before starting work"}</em>}
            </div>
            <div>
              <strong>Business unit:</strong> {ticket.businessUnit?.name ?? <em>optional, not set</em>}
            </div>
            <div>
              <strong>Assignee:</strong>{" "}
              {ticket.assignee ? (
                <span className={`chip chip-assignee assignee-colour-${assigneeColour ?? 0}`}>{ticket.assignee.displayName}</span>
              ) : (
                <em>unassigned</em>
              )}
            </div>
            <div className={overdue ? "overdue" : undefined}>
              {/* The target due date is the KPI (2026-10-03); tickets from before
                  then with no target still show their old SLA date. */}
              <strong>{ticket.targetDueAt ? "Target due:" : "Due (SLA):"}</strong> {formatAuDateTime(due)}
              {ticket.targetDueAt && ticket.targetDueReason && (
                <>
                  {" "}
                  ({isAutoTargetReason(ticket.targetDueReason) ? ticket.targetDueReason.replace(/^Automatic:\s*/, "automatic, ") : `override: ${ticket.targetDueReason}`})
                </>
              )}
              {overdue && " -- OVERDUE"}
            </div>
            <div>
              <strong>First viewed:</strong>{" "}
              {ticket.firstViewedAt ? `${formatAuDateTime(ticket.firstViewedAt)} by ${ticket.firstViewedBy?.displayName}` : "not yet"}
            </div>
          </section>

          {ticket.messages.some((m) => m.emailLog.length > 0 && !m.emailLog.some((l) => l.status === "SENT")) && (
            <p className="banner banner-error">
              One or more emails for this ticket failed to send after 3 attempts -- see Admin &rarr; Failed sends.
            </p>
          )}

          <TicketActions
            ticketId={ticket.id}
            version={ticket.version}
            status={ticket.status}
            priority={ticket.priority}
            categoryId={ticket.categoryId}
            businessUnitId={ticket.businessUnitId}
            isAssignedTicket={isAssignedTicket}
            assignedToId={ticket.assignedToId}
            canEditMetadata={canEditMetadata}
            canMerge={canMerge}
            role={session.user.role}
            userId={session.user.id}
            ticketNo={ticket.ticketNo}
            displaySubject={ticket.subject}
            requesterEmail={ticket.requesterEmail}
            ccRecipients={ticket.ccRecipients}
            targetDueAt={ticket.targetDueAt ? ticket.targetDueAt.toISOString() : null}
            targetDueReason={ticket.targetDueReason}
            receivedAt={ticket.receivedAt.toISOString()}
            holidayKeys={holidayKeys}
            attachments={ticket.attachments.map((a) => ({ id: a.id, filename: a.filename }))}
            isConfidential={ticket.isConfidential}
            isLegalHold={ticket.isLegalHold}
            canReopen={validateReopen(ticket, new Set(holidayKeys)).ok}
            actionStatusId={ticket.actionStatusId}
            actionStatusName={ticket.actionStatus?.name ?? null}
          />

          <p className="no-print">
            Export: <a href={`/api/tickets/${ticket.id}/export`}>.txt</a> |{" "}
            <a href={`/api/tickets/${ticket.id}/export?attachments=true`}>.zip (with attachments)</a>
          </p>

          <section className="section-card">
            <h2>Attachments</h2>
            {ticket.attachments.length === 0 && <p>No attachments.</p>}
            {ticket.attachments.length > 0 && (
              <ul>
                {ticket.attachments.map((a) => (
                  <li key={a.id}>
                    {a.scanStatus === "CLEAN" ? (
                      <a href={`/api/tickets/${ticket.id}/attachments/${a.id}`}>{a.filename}</a>
                    ) : (
                      a.filename
                    )}{" "}
                    ({(a.sizeBytes / 1024).toFixed(1)} KB) --{" "}
                    {a.scanStatus === "PENDING" && "scanning"}
                    {a.scanStatus === "CLEAN" && "clean"}
                    {a.scanStatus === "BLOCKED" && `blocked (${a.blockReason})`}
                    {a.scanStatus === "MALICIOUS" && "malicious"}
                    {/* SKIPPED (inline signature/footer images) are no longer stored at all
                        (2026-09-23) -- this branch is dead for anything ingested from now on,
                        kept only so any already-stored SKIPPED row from before the fix still
                        renders sensibly instead of blank. */}
                    {a.scanStatus === "SKIPPED" && "skipped (inline image)"}
                    {a.source === "UPLOAD" && ` -- uploaded by ${a.uploadedBy?.displayName ?? "(unknown)"}`}
                    {canEditMetadata && !ticket.isLegalHold && (
                      <AttachmentRemoveForm ticketId={ticket.id} attachmentId={a.id} filename={a.filename} />
                    )}
                    {/* Signature / footer logos (2026-10-05) -- ADMIN, emailed images only. */}
                    {canManageAdminSettings(session.user.role) &&
                      a.source === "EMAIL" &&
                      (a.detectedContentType ?? a.declaredContentType ?? "").toLowerCase().startsWith("image/") && (
                        <IgnoreImageButton attachmentId={a.id} filename={a.filename} />
                      )}
                  </li>
                ))}
              </ul>
            )}
            <AttachmentForm ticketId={ticket.id} />
          </section>

          <section className="section-card">
            <h2>Internal notes</h2>
            {ticket.notes.length === 0 && <p>No notes yet.</p>}
            {ticket.notes.map((n) => (
              <article key={n.id} className="item-card">
                <div>
                  <strong>[{n.visibility === "REQUESTER_VISIBLE" ? "NOTE -- REQUESTER-VISIBLE" : "INTERNAL NOTE"}]</strong>{" "}
                  {n.author.displayName} --{formatAuDateTime(n.createdAt)}{" "}
                  {n.supersedesNoteId && <em>(edited)</em>}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                {n.authorId === session.user.id && <NoteForm ticketId={ticket.id} noteId={n.id} initialBody={n.body} mode="edit" />}
              </article>
            ))}
            <NoteForm ticketId={ticket.id} mode="create" />
          </section>

          <section className="section-card">
            <h2>Status history</h2>
            <ul>
              {ticket.statusHistory.map((h) => (
                <li key={h.id}>
                  {formatAuDateTime(h.createdAt)}: {h.fromStatus ?? "(created)"} -&gt; {h.toStatus} by {h.actor.displayName}
                  {h.reason && ` -- ${h.reason}`}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="ticket-right">
          <section className="section-card ticket-correspondence">
            <h2>Correspondence <small>(newest first)</small></h2>
            {ticket.messages.length === 0 && <p>No messages yet.</p>}
            {[...ticket.messages].reverse().map((m) => (
              <article key={m.id} className={m.messageType === "OUTCOME" ? "item-card message-outcome" : "item-card"}>
                <div>
                  <strong>[{correspondenceLabel(m)}]</strong>{" "}
                  {m.fromName} ({m.fromAddress})
                  -- {(m.receivedAt ?? m.sentAt) ? formatAuDateTime((m.receivedAt ?? m.sentAt)!) : ""}
                </div>
                {/* Who sent it (2026-10-03). Automated emails (acknowledgement,
                    overdue escalation) are sent by the seeded System user. */}
                {m.direction === "OUTBOUND" && m.sentBy && (
                  <div className="text-muted">
                    {m.sentBy.entraObjectId === "system" ? "Sent automatically by the system" : `Sent by ${m.sentBy.displayName}`}
                    {m.toRecipients.length > 0 && ` -- to ${m.toRecipients.join(", ")}`}
                    {m.ccRecipients.length > 0 && ` -- cc ${m.ccRecipients.join(", ")}`}
                  </div>
                )}
                <div>{m.subject}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{messageDisplayText(m)}</div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
