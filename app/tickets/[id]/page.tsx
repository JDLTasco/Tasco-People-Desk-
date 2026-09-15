import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadTicketForViewer } from "@/lib/tickets/detail";
import { effectiveDueDate, isOverdue } from "@/lib/tickets/due-dates";
import { canActOnAssignedTicket } from "@/lib/rbac";
import TicketActions from "./ticket-actions";
import NoteForm from "./note-form";

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return null;

  const ticket = await loadTicketForViewer(params.id, session.user.id, session.user.role);
  if (!ticket) notFound();

  const isAssignedTicket = ticket.assignedToId === session.user.id;
  const canEditMetadata = canActOnAssignedTicket(session.user.role, isAssignedTicket);
  const due = effectiveDueDate(ticket.slaDueAt, ticket.targetDueAt);
  const overdue = isOverdue(ticket.slaDueAt, ticket.targetDueAt, ticket.status);

  return (
    <main>
      <h1>
        {ticket.ticketNo} -- {ticket.subject}
      </h1>

      {ticket.isLegalHold && (
        <p className="banner banner-legal-hold">
          LEGAL HOLD -- RETENTION PURGE SUSPENDED
          <br />
          Reason: {ticket.legalHoldReason} -- set by {ticket.legalHoldSetBy?.displayName ?? "(unknown)"} on{" "}
          {ticket.legalHoldSetAt?.toLocaleString()}
        </p>
      )}
      {ticket.isConfidential && (
        <p className="banner banner-confidential">
          🔒 Confidential -- set by {ticket.confidentialSetBy?.displayName ?? "(unknown)"} on{" "}
          {ticket.confidentialSetAt?.toLocaleString()}
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

      <section className="meta-grid">
        <div>
          <strong>Status:</strong> <span className={`chip chip-status-${ticket.status}`}>{ticket.status}</span>
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
          {ticket.assignee ? `${ticket.assignee.displayName} (${ticket.assignee.initials})` : <em>unassigned</em>}
        </div>
        <div className={overdue ? "overdue" : undefined}>
          <strong>Due:</strong> {due.toLocaleString()}
          {ticket.targetDueAt && (
            <>
              {" "}
              (target: {ticket.targetDueAt.toLocaleString()}, reason: {ticket.targetDueReason})
            </>
          )}
          {overdue && " -- OVERDUE"}
        </div>
        <div>
          <strong>First viewed:</strong>{" "}
          {ticket.firstViewedAt ? `${ticket.firstViewedAt.toLocaleString()} by ${ticket.firstViewedBy?.displayName}` : "not yet"}
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
        canEditMetadata={canEditMetadata}
        role={session.user.role}
        userId={session.user.id}
        ticketNo={ticket.ticketNo}
        displaySubject={ticket.subject}
        requesterEmail={ticket.requesterEmail}
        ccRecipients={ticket.ccRecipients}
        targetDueAt={ticket.targetDueAt ? ticket.targetDueAt.toISOString() : null}
        targetDueReason={ticket.targetDueReason}
        notes={ticket.notes.map((n) => ({ id: n.id, body: n.body, visibility: n.visibility }))}
        attachments={ticket.attachments.map((a) => ({ id: a.id, filename: a.filename }))}
        isConfidential={ticket.isConfidential}
        isLegalHold={ticket.isLegalHold}
      />

      <p className="no-print">
        Export: <a href={`/api/tickets/${ticket.id}/export`}>.txt</a> |{" "}
        <a href={`/api/tickets/${ticket.id}/export?attachments=true`}>.zip (with attachments)</a>
      </p>

      <section className="section-card">
        <h2>Correspondence</h2>
        {ticket.messages.length === 0 && <p>No messages yet.</p>}
        {ticket.messages.map((m) => (
          <article key={m.id} className="item-card">
            <div>
              <strong>[{m.direction === "INBOUND" ? "EMAIL IN" : "EMAIL OUT"}]</strong> {m.fromName} ({m.fromAddress})
              -- {(m.receivedAt ?? m.sentAt)?.toLocaleString()}
            </div>
            <div>{m.subject}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.bodyText}</div>
          </article>
        ))}
      </section>

      <section className="section-card">
        <h2>Attachments</h2>
        {ticket.attachments.length === 0 && <p>No attachments.</p>}
        {ticket.attachments.length > 0 && (
          <ul>
            {ticket.attachments.map((a) => (
              <li key={a.id}>
                {a.filename} ({(a.sizeBytes / 1024).toFixed(1)} KB) --{" "}
                {a.scanStatus === "PENDING" && "scanning"}
                {a.scanStatus === "CLEAN" && "clean"}
                {a.scanStatus === "BLOCKED" && `blocked (${a.blockReason})`}
                {a.scanStatus === "MALICIOUS" && "malicious"}
                {a.scanStatus === "SKIPPED" && "skipped (inline image)"}
                {/* Download isn't wired yet -- needs real Blob Storage, Stage 7. */}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-card">
        <h2>Internal notes</h2>
        {ticket.notes.length === 0 && <p>No notes yet.</p>}
        {ticket.notes.map((n) => (
          <article key={n.id} className="item-card">
            <div>
              <strong>[{n.visibility === "REQUESTER_VISIBLE" ? "NOTE -- REQUESTER-VISIBLE" : "INTERNAL NOTE"}]</strong>{" "}
              {n.author.displayName} ({n.author.initials}) -- {n.createdAt.toLocaleString()}{" "}
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
              {h.createdAt.toLocaleString()}: {h.fromStatus ?? "(created)"} -&gt; {h.toStatus} by {h.actor.displayName}
              {h.reason && ` -- ${h.reason}`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
