// §7.4's outbound email templates (plus later operator additions) -- pure, isomorphic rendering
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

// Operator amendment (John, 2026-09-29): the requester is never quoted a
// per-priority timeframe (P3 read "30 days", which is what nearly every
// ticket got) -- just "as soon as practical". Internal due dates are separate.
const EXPECTED_RESPONSE_TEXT = "Expected response: as soon as practical";

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
// The acknowledgement (the requester's first email) shows it bold in yellow
// (John, 2026-10-03). Inline style, since email clients ignore stylesheets;
// #FFC000 is Office's standard yellow/gold -- pure #FFFF00 is unreadable on
// white. Plain-text bodies can't carry formatting, so only the HTML changes.
const TRACKING_NOTE_HTML_HIGHLIGHTED = `<p><strong style="color:#FFC000;">${TRACKING_NOTE_TEXT}</strong></p>`;

export interface AcknowledgementEmailInput {
  ticketNo: string;
  displaySubject: string;
}

/**
 * Operator amendment (John, 2026-10-03): sent to the requester as soon as
 * the ticket is created and numbered, replacing §7.4's allocation email
 * (which went out only once an officer claimed the ticket, and named them).
 */
export function renderAcknowledgementEmail(input: AcknowledgementEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] ${input.displaySubject}`;
  const intro =
    `Thank you -- your request has been received by HR.\n\n` +
    `Ticket number: ${input.ticketNo}\nSubject: ${input.displaySubject}\n${EXPECTED_RESPONSE_TEXT}\n\n` +
    `A member of the HR team will be in touch. You will receive further updates and questions once this matter has been investigated.`;
  return {
    subject,
    bodyText: `${intro}\n\n${TRACKING_NOTE_TEXT}\n\n${FOOTER_TEXT}`,
    bodyHtml: `${htmlParagraphs(intro)}\n${TRACKING_NOTE_HTML_HIGHLIGHTED}\n${FOOTER_HTML}`,
  };
}

export interface OutcomeEmailInput {
  ticketNo: string;
  displaySubject: string;
  outcomeForRequester: string;
}

/**
 * §7.4: "Outcome -- Requester + cc_recipients -- Ticket number, display
 * subject, the curated outcome_for_requester text." Operator amendment
 * (John, 2026-10-03): notes are internal only and can never be included
 * (the "requester-visible note" opt-in was removed).
 */
export function renderOutcomeEmail(input: OutcomeEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] ${input.displaySubject} -- Resolved`;
  const header = `Ticket number: ${input.ticketNo}\nSubject: ${input.displaySubject}`;
  const parts = [header, input.outcomeForRequester];
  const bodyText = `${parts.join("\n\n")}\n\n${TRACKING_NOTE_TEXT}\n\n${FOOTER_TEXT}`;
  const bodyHtml = `${parts.map(htmlParagraphs).join("\n")}\n${TRACKING_NOTE_HTML}\n${FOOTER_HTML}`;
  return { subject, bodyText, bodyHtml };
}

export interface RequesterQuestionEmailInput {
  ticketNo: string;
  displaySubject: string;
  question: string;
}

// Operator addition (John, 2026-10-01): an officer asks the requester
// something mid-investigation, without moving the ticket to OUTCOME. The
// tracking note matters most here -- the reply is what threads back on.
export function renderRequesterQuestionEmail(input: RequesterQuestionEmailInput): RenderedEmail {
  const subject = `[${input.ticketNo}] ${input.displaySubject} -- Question from HR`;
  const header = `Ticket number: ${input.ticketNo}\nSubject: ${input.displaySubject}`;
  const parts = [header, input.question, "Please reply to this email with your response."];
  return {
    subject,
    bodyText: `${parts.join("\n\n")}\n\n${TRACKING_NOTE_TEXT}\n\n${FOOTER_TEXT}`,
    bodyHtml: `${parts.map(htmlParagraphs).join("\n")}\n${TRACKING_NOTE_HTML}\n${FOOTER_HTML}`,
  };
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
