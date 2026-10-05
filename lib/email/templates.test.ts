import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderAcknowledgementEmail, renderOutcomeEmail, renderEscalationEmail, renderRequesterQuestionEmail } from "./templates";

describe("renderAcknowledgementEmail", () => {
  it("includes ticket number, subject and 'as soon as practical' (2026-10-03, replaces allocation)", () => {
    const email = renderAcknowledgementEmail({ ticketNo: "2609151030", displaySubject: "Leave request" });
    assert.match(email.subject, /2609151030/);
    assert.match(email.bodyText, /2609151030/);
    assert.match(email.bodyText, /Leave request/);
    assert.match(email.bodyText, /received by HR/);
    assert.match(email.bodyText, /Expected response: as soon as practical/);
    assert.match(email.bodyText, /keep the ticket number in the subject/);
  });

  it("shows the keep-the-ticket-number line bold and yellow in the HTML (2026-10-03)", () => {
    const email = renderAcknowledgementEmail({ ticketNo: "x", displaySubject: "s" });
    assert.ok(
      email.bodyHtml.includes(
        '<strong style="color:#FFC000;">When replying, please keep the ticket number in the subject line so your response can be tracked against this ticket.</strong>',
      ),
    );
  });

  it("never quotes an SLA timeframe to the requester", () => {
    const email = renderAcknowledgementEmail({ ticketNo: "x", displaySubject: "s" });
    assert.doesNotMatch(email.bodyText, /48 hours|7 days|30 days|working days|timeframe/);
    assert.doesNotMatch(email.bodyHtml, /48 hours|7 days|30 days|working days|timeframe/);
  });

  it("escapes HTML-significant characters in user-influenced fields", () => {
    const email = renderAcknowledgementEmail({ ticketNo: "x", displaySubject: "<script>alert(1)</script>" });
    assert.ok(!email.bodyHtml.includes("<script>"));
    assert.match(email.bodyHtml, /&lt;script&gt;/);
  });
});

describe("renderOutcomeEmail", () => {
  it("includes the curated outcome text", () => {
    const email = renderOutcomeEmail({
      ticketNo: "2609151030",
      displaySubject: "Leave request",
      outcomeForRequester: "Your leave has been approved.",
    });
    assert.match(email.bodyText, /Your leave has been approved\./);
    assert.match(email.subject, /-- Outcome of your enquiry$/);
    assert.match(email.bodyText, /^OUTCOME OF YOUR ENQUIRY/);
    assert.match(email.bodyHtml, /Outcome of your enquiry/);
  });
});

describe("renderEscalationEmail", () => {
  it("states which deadline was breached and by how long, plus the portal URL (§8)", () => {
    const email = renderEscalationEmail({
      ticketNo: "2609151030",
      displaySubject: "Leave request",
      priority: "P1",
      elapsedHours: 60,
      breachedDeadline: "SLA",
      breachedByHours: 12,
      portalUrl: "https://hr.tascopetroleum.com.au/tickets/abc",
    });
    assert.match(email.subject, /OVERDUE/);
    assert.match(email.bodyText, /SLA/);
    assert.match(email.bodyText, /12 hours/);
    assert.match(email.bodyText, /60 hours/);
    assert.match(email.bodyText, /https:\/\/hr\.tascopetroleum\.com\.au\/tickets\/abc/);
  });

  it("labels a target-due breach distinctly from an SLA breach", () => {
    const email = renderEscalationEmail({
      ticketNo: "x",
      displaySubject: "s",
      priority: "P2",
      elapsedHours: 10,
      breachedDeadline: "TARGET",
      breachedByHours: 2,
      portalUrl: "https://example.test",
    });
    assert.match(email.bodyText, /target due date/);
  });
});

describe("renderRequesterQuestionEmail", () => {
  const rendered = renderRequesterQuestionEmail({
    ticketNo: "261001093001",
    displaySubject: "Leave balance",
    question: "Which pay period are you asking about?\n\n<b>thanks</b>",
  });

  it("keeps the ticket number in the subject so the reply threads back", () => {
    assert.equal(rendered.subject, "[261001093001] Leave balance -- Question from HR");
    assert.match(rendered.bodyText, /keep the ticket number in the subject/);
  });

  it("includes the question and escapes it in HTML", () => {
    assert.match(rendered.bodyText, /Which pay period are you asking about\?/);
    assert.match(rendered.bodyHtml, /&lt;b&gt;thanks&lt;\/b&gt;/);
    assert.doesNotMatch(rendered.bodyHtml, /<b>thanks/);
  });
});
