// §10: the two archive artefacts, ticket.txt and ticket.xml. Pure string
// builders -- no I/O, no Prisma types beyond ArchiveTicket's shape -- so
// both are independently unit-testable against fixture data.
import type { ArchiveTicket } from "./load";

function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString() : "(not set)";
}

interface ThreadEntry {
  timestamp: Date;
  label: "EMAIL IN" | "EMAIL OUT" | "MANUAL ENTRY" | "INTERNAL NOTE";
  author: string;
  content: string;
  edited: boolean;
}

// §15's own acceptance test: a manually created ticket's first message is
// labelled MANUAL ENTRY, not EMAIL IN, in both the live view and the
// archive -- message_type is the authoritative signal, direction alone
// (both are INBOUND) can't distinguish it from real inbound email.
function messageLabel(m: ArchiveTicket["messages"][number]): ThreadEntry["label"] {
  if (m.messageType === "MANUAL") return "MANUAL ENTRY";
  return m.direction === "INBOUND" ? "EMAIL IN" : "EMAIL OUT";
}

function buildThread(ticket: ArchiveTicket): ThreadEntry[] {
  const messageEntries: ThreadEntry[] = ticket.messages.map((m) => ({
    timestamp: (m.direction === "INBOUND" ? m.receivedAt : m.sentAt) ?? new Date(0),
    label: messageLabel(m),
    author: m.direction === "INBOUND" ? `${m.fromName ?? ""} <${m.fromAddress}>`.trim() : m.fromAddress,
    content: m.bodyText ?? "",
    edited: false,
  }));
  const noteEntries: ThreadEntry[] = ticket.notes.map((n) => ({
    timestamp: n.createdAt,
    label: "INTERNAL NOTE",
    author: n.author.displayName,
    content: n.body,
    edited: n.supersedesNoteId !== null,
  }));
  return [...messageEntries, ...noteEntries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export function renderTicketTxt(ticket: ArchiveTicket): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("TASCO HR TICKETING -- ARCHIVE RECORD");
  push("=".repeat(60));
  push(`Ticket number:    ${ticket.ticketNo}`);
  push(`Subject:          ${ticket.subject}`);
  push(`Requester:        ${ticket.requesterName} <${ticket.requesterEmail}>`);
  push(`Category:         ${ticket.category?.name ?? "(none)"}`);
  push(`Business unit:    ${ticket.businessUnit?.name ?? "(none)"}`);
  push(`Received:         ${fmt(ticket.receivedAt)}`);
  push(`Request date:     ${ticket.requestDate.toISOString().slice(0, 10)}`);
  push(`Priority:         ${ticket.priority}`);
  push(`SLA due:          ${fmt(ticket.slaDueAt)}`);
  if (ticket.targetDueAt) {
    push(`Target due:       ${fmt(ticket.targetDueAt)} (${ticket.targetDueReason ?? "no reason recorded"})`);
  }
  push(`Assignee:         ${ticket.assignee?.displayName ?? "(unassigned)"}`);
  push(
    `First viewed:     ${ticket.firstViewedAt ? `${fmt(ticket.firstViewedAt)} by ${ticket.firstViewedBy?.displayName ?? "(unknown)"}` : "(not yet)"}`,
  );
  push(`Final status:     ${ticket.status}${ticket.closeReason ? ` (${ticket.closeReason})` : ""}`);
  if (ticket.mergedIntoTicket) {
    push(`Merged into:      ${ticket.mergedIntoTicket.ticketNo} (correspondence/notes/attachments moved there)`);
  }
  if (ticket.isLegalHold || ticket.legalHoldSetAt) {
    push(
      `Legal hold:       ${ticket.isLegalHold ? "ACTIVE" : "cleared"} -- ${ticket.legalHoldReason ?? ""} (set by ${ticket.legalHoldSetBy?.displayName ?? "(unknown)"} at ${fmt(ticket.legalHoldSetAt)}${
        !ticket.isLegalHold ? `, cleared by ${ticket.legalHoldClearedBy?.displayName ?? "(unknown)"} at ${fmt(ticket.legalHoldClearedAt)}` : ""
      })`,
    );
  }
  push();

  push("CORRESPONDENCE AND NOTES");
  push("-".repeat(60));
  for (const entry of buildThread(ticket)) {
    push(`[${entry.label}] ${entry.author} -- ${fmt(entry.timestamp)}${entry.edited ? " (edited)" : ""}`);
    push(entry.content);
    push();
  }

  if (ticket.outcomeForRequester) {
    push("OUTCOME (as sent)");
    push("-".repeat(60));
    push(`Sent: ${fmt(ticket.outcomeSentAt)}`);
    push(ticket.outcomeForRequester);
    push();
  }

  push("STATUS HISTORY");
  push("-".repeat(60));
  for (const h of ticket.statusHistory) {
    push(`${fmt(h.createdAt)}: ${h.fromStatus ?? "(created)"} -> ${h.toStatus} by ${h.actor.displayName}${h.reason ? ` -- ${h.reason}` : ""}`);
  }
  push();

  push("ATTACHMENTS");
  push("-".repeat(60));
  if (ticket.attachments.length === 0) {
    push("(none)");
  }
  for (const a of ticket.attachments) {
    push(`${a.filename} -- ${a.sizeBytes} bytes -- SHA-256 ${a.sha256} -- scan: ${a.scanStatus}${a.blockReason ? ` (${a.blockReason})` : ""}`);
  }

  return lines.join("\n");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function el(tag: string, value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `<${tag}>${xmlEscape(value)}</${tag}>`;
}

/** ticket.xml -- the same content as ticket.txt, structured per the committed XSD (lib/archive/xsd/ticket.xsd). */
export function renderTicketXml(ticket: ArchiveTicket): string {
  const thread = buildThread(ticket)
    .map(
      (entry) =>
        `<entry type="${entry.label.replace(/\s+/g, "_")}" edited="${entry.edited}">` +
        `${el("timestamp", entry.timestamp.toISOString())}${el("author", entry.author)}${el("content", entry.content)}` +
        `</entry>`,
    )
    .join("");

  const statusHistory = ticket.statusHistory
    .map(
      (h) =>
        `<event>${el("timestamp", h.createdAt.toISOString())}${el("fromStatus", h.fromStatus)}${el("toStatus", h.toStatus)}${el(
          "actor",
          h.actor.displayName,
        )}${el("reason", h.reason)}</event>`,
    )
    .join("");

  const attachments = ticket.attachments
    .map(
      (a) =>
        `<attachment>${el("filename", a.filename)}${el("sizeBytes", String(a.sizeBytes))}${el("sha256", a.sha256)}${el(
          "scanStatus",
          a.scanStatus,
        )}${el("blockReason", a.blockReason)}</attachment>`,
    )
    .join("");

  const legalHold = ticket.isLegalHold || ticket.legalHoldSetAt
    ? `<legalHold active="${ticket.isLegalHold}">${el("reason", ticket.legalHoldReason)}${el(
        "setBy",
        ticket.legalHoldSetBy?.displayName,
      )}${el("setAt", ticket.legalHoldSetAt?.toISOString())}${el("clearedBy", ticket.legalHoldClearedBy?.displayName)}${el(
        "clearedAt",
        ticket.legalHoldClearedAt?.toISOString(),
      )}</legalHold>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ticket xmlns="urn:tasco:hr-ticketing:archive">` +
    el("ticketNo", ticket.ticketNo) +
    el("subject", ticket.subject) +
    el("originalSubject", ticket.originalSubject) +
    el("requesterEmail", ticket.requesterEmail) +
    el("requesterName", ticket.requesterName) +
    el("receivedAt", ticket.receivedAt.toISOString()) +
    el("requestDate", ticket.requestDate.toISOString().slice(0, 10)) +
    el("category", ticket.category?.name) +
    el("businessUnit", ticket.businessUnit?.name) +
    el("priority", ticket.priority) +
    el("slaDueAt", ticket.slaDueAt.toISOString()) +
    el("targetDueAt", ticket.targetDueAt?.toISOString()) +
    el("targetDueReason", ticket.targetDueReason) +
    el("status", ticket.status) +
    el("closeReason", ticket.closeReason) +
    el("mergedIntoTicketNo", ticket.mergedIntoTicket?.ticketNo) +
    el("assignee", ticket.assignee?.displayName) +
    el("firstViewedAt", ticket.firstViewedAt?.toISOString()) +
    el("firstViewedBy", ticket.firstViewedBy?.displayName) +
    el("closedAt", ticket.closedAt?.toISOString()) +
    legalHold +
    el("outcomeForRequester", ticket.outcomeForRequester) +
    el("outcomeSentAt", ticket.outcomeSentAt?.toISOString()) +
    `<correspondence>${thread}</correspondence>` +
    `<statusHistory>${statusHistory}</statusHistory>` +
    `<attachments>${attachments}</attachments>` +
    `</ticket>`
  );
}
