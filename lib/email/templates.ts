// §7.4's three outbound email templates -- pure, isomorphic rendering
// functions (no Prisma, no fetch, no server-only imports) so the exact
// same code renders the live "final body exactly as it will send" in the
// outcome dispatch preview modal (a client component) and the real send
// path (lib/email/send.ts). Nothing here decides recipients, threading
// headers, or retry behaviour -- that's the send path's job.
import type { Priority } from "../ingestion/priority";

export interface RenderedEmail {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

const TIMEFRAME_LABEL: Record<Priority, string> = { P1: "48 hours", P2: "7 days", P3: "30 days" };

// Outbound HTML is generated here from user-influenced text (subjects,
// outcome drafts, note bodies) and sent to a real mailbox -- escaped at
// generation time, matching §5's "body_html ... sanitised on render,
// never on store" posture for the reverse (inbound) direction.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

const FOOTER_TEXT = "Tasco Human Resources";
const FOOTER_HTML = `<p>${FOOTER_TEXT}</p>`;

// Operator addition (not in v1.3 spec): requester-facing emails only --
// Escalation goes to internal HR_LEAD staff, not the requester, so it's
// deliberately excluded. Keeping the ticket number in the subject when
// replying is what lets lib/ingestion/subject-ticket-match.ts thread the
// reply onto this ticket even without matching conversation_id headers.
const TRACKING_NOTE_TEXT =
  "When replying, please keep the ticket number in the subject line so your response can be tracked against this ticket.";
const TRACKING_NOTE_HTML = `<p>${TRACKING_NOTE_TEXT}</p>`;

export interface AllocationEmailInput {
  ticketNo: string;
  displaySubject: string;
  assigneeDisplayName: string;
  priority: Priority;
}

/** §7.4: "Allocation -- Requester -- Ticket number, display subject, assigned officer display name, expected response timeframe." */
export function renderAllocationEmail(input: AllocationEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] ${input.displaySubject}`;
  const timeframe = TIMEFRAME_LABEL[input.priority];
  const intro =
    `Your request has been allocated to ${input.assigneeDisplayName} in HR.\n\n` +
    `Ticket number: ${input.ticketNo}\nSubject: ${input.displaySubject}\nExpected response timeframe: ${timeframe}\n\n` +
    `You will receive further updates and questions once this matter has been investigated.`;
  return {
    subject,
    bodyText: `${intro}\n\n${TRACKING_NOTE_TEXT}\n\n${FOOTER_TEXT}`,
    bodyHtml: `${htmlParagraphs(intro)}\n${TRACKING_NOTE_HTML}\n${FOOTER_HTML}`,
  };
}

export interface OutcomeEmailIncludedNote {
  body: string;
}

export interface OutcomeEmailInput {
  ticketNo: string;
  displaySubject: string;
  outcomeForRequester: string;
  includedNotes: OutcomeEmailIncludedNote[];
}

/**
 * §7.4: "Outcome -- Requester + cc_recipients -- Ticket number, display
 * subject, the curated outcome_for_requester text, plus any notes the
 * officer explicitly ticked. Internal staff notes are never dumped or
 * sent automatically." includedNotes here must already be the caller's
 * filtered, explicitly-ticked selection -- this function has no concept
 * of "internal" vs "requester-visible" and trusts its input completely.
 */
export function renderOutcomeEmail(input: OutcomeEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] ${input.displaySubject} -- Resolved`;
  const header = `Ticket number: ${input.ticketNo}\nSubject: ${input.displaySubject}`;
  const parts = [header, input.outcomeForRequester, ...input.includedNotes.map((n) => n.body)];
  const bodyText = `${parts.join("\n\n")}\n\n${TRACKING_NOTE_TEXT}\n\n${FOOTER_TEXT}`;
  const bodyHtml = `${parts.map(htmlParagraphs).join("\n")}\n${TRACKING_NOTE_HTML}\n${FOOTER_HTML}`;
  return { subject, bodyText, bodyHtml };
}

export interface ClosedResolvedEmailInput {
  ticketNo: string;
  displaySubject: string;
}

// Added directly with John, 2026-09-21 (not in the original spec): a
// short standardised confirmation sent when a ticket is closed via
// "Close -- Resolved," separate from the OUTCOME email -- that email
// already carried the actual resolution content; this is just the
// formal closing notice, sent at the point of final closure.
export function renderClosedResolvedEmail(input: ClosedResolvedEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] ${input.displaySubject} -- Closed`;
  const intro =
    `Ticket number: ${input.ticketNo}\nSubject: ${input.displaySubject}\n\n` +
    `The HR team considers this matter resolved. If you would like more information, or believe this matter ` +
    `has not been resolved, please reach out to the team and quote this ticket number.`;
  return {
    subject,
    bodyText: `${intro}\n\n${TRACKING_NOTE_TEXT}\n\n${FOOTER_TEXT}`,
    bodyHtml: `${htmlParagraphs(intro)}\n${TRACKING_NOTE_HTML}\n${FOOTER_HTML}`,
  };
}

export interface EscalationEmailInput {
  ticketNo: string;
  displaySubject: string;
  priority: Priority;
  elapsedHours: number;
  breachedDeadline: "SLA" | "TARGET";
  breachedByHours: number;
  portalUrl: string;
}

/** §8: "The escalation email states which deadline was breached and by how long." */
export function renderEscalationEmail(input: EscalationEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] OVERDUE -- ${input.displaySubject}`;
  const deadlineLabel = input.breachedDeadline === "TARGET" ? "target due date" : "SLA";
  const intro =
    `Ticket ${input.ticketNo} (${input.priority}) is overdue.\n\n` +
    `Subject: ${input.displaySubject}\n` +
    `Elapsed: ${input.elapsedHours} hours\n` +
    `Breached deadline: ${deadlineLabel}, by ${input.breachedByHours} hours\n\n` +
    `View this ticket: ${input.portalUrl}`;
  return {
    subject,
    bodyText: `${intro}\n\n${FOOTER_TEXT}`,
    bodyHtml: `${htmlParagraphs(intro)}\n${FOOTER_HTML}`,
  };
}
