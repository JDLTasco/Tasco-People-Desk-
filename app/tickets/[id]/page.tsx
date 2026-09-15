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
    <main style={{ padding: "1rem", maxWidth: 900 }}>
      <h1>
        {ticket.ticketNo} -- {ticket.subject}
      </h1>

      {ticket.isLegalHold && (
        <p style={{ background: "#fff3cd", padding: "0.5rem", fontWeight: "bold" }}>
          LEGAL HOLD -- RETENTION PURGE SUSPENDED
        </p>
      )}
      {ticket.isConfidential && <p style={{ background: "#f0f0f0", padding: "0.5rem" }}>🔒 Confidential</p>}

      <section style={{ display: "flex", gap: "2rem", flexWrap: "wrap", margin: "1rem 0" }}>
        <div>
          <strong>Status:</strong> {ticket.status}
        </div>
        <div>
          <strong>Priority:</strong> {ticket.priority}
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
        <div style={overdue ? { color: "#b00020", fontWeight: "bold" } : undefined}>
          <strong>Due:</strong> {due.toLocaleString()}
          {ticket.targetDueAt && (
            <> (target: {ticket.targetDueAt.toLocaleString()}, reason: {ticket.targetDueReason})</>
          )}
          {overdue && " -- OVERDUE"}
        </div>
        <div>
          <strong>First viewed:</strong>{" "}
          {ticket.firstViewedAt ? `${ticket.firstViewedAt.toLocaleString()} by ${ticket.firstViewedBy?.displayName}` : "not yet"}
        </div>
      </section>

      <TicketActions
        ticketId={ticket.id}
        version={ticket.version}
        status={ticket.status}
        categoryId={ticket.categoryId}
        isAssignedTicket={isAssignedTicket}
        canEditMetadata={canEditMetadata}
        role={session.user.role}
        userId={session.user.id}
      />

      <section style={{ marginTop: "2rem" }}>
        <h2>Correspondence</h2>
        {ticket.messages.length === 0 && <p>No messages yet.</p>}
        {ticket.messages.map((m) => (
          <article key={m.id} style={{ border: "1px solid #ddd", padding: "0.5rem", marginBottom: "0.5rem" }}>
            <div>
              <strong>[{m.direction === "INBOUND" ? "EMAIL IN" : "EMAIL OUT"}]</strong> {m.fromName} ({m.fromAddress})
              -- {(m.receivedAt ?? m.sentAt)?.toLocaleString()}
            </div>
            <div>{m.subject}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.bodyText}</div>
          </article>
        ))}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Internal notes</h2>
        {ticket.notes.length === 0 && <p>No notes yet.</p>}
        {ticket.notes.map((n) => (
          <article key={n.id} style={{ border: "1px solid #ddd", padding: "0.5rem", marginBottom: "0.5rem" }}>
            <div>
              <strong>[INTERNAL NOTE]</strong> {n.author.displayName} ({n.author.initials}) --{" "}
              {n.createdAt.toLocaleString()} {n.supersedesNoteId && <em>(edited)</em>}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
            {n.authorId === session.user.id && <NoteForm ticketId={ticket.id} noteId={n.id} initialBody={n.body} mode="edit" />}
          </article>
        ))}
        <NoteForm ticketId={ticket.id} mode="create" />
      </section>

      <section style={{ marginTop: "2rem" }}>
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
