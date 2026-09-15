import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderAllocationEmail, renderOutcomeEmail, renderEscalationEmail } from "./templates";

describe("renderAllocationEmail", () => {
  it("includes ticket number, subject, assignee name, and the priority's expected timeframe (§7.4)", () => {
    const email = renderAllocationEmail({
      ticketNo: "2609151030",
      displaySubject: "Leave request",
      assigneeDisplayName: "Rebecca Johnson",
      priority: "P1",
    });
    assert.match(email.subject, /2609151030/);
    assert.match(email.bodyText, /2609151030/);
    assert.match(email.bodyText, /Leave request/);
    assert.match(email.bodyText, /Rebecca Johnson/);
    assert.match(email.bodyText, /48 hours/);
  });

  it("uses the correct timeframe label per priority", () => {
    assert.match(
      renderAllocationEmail({ ticketNo: "x", displaySubject: "s", assigneeDisplayName: "a", priority: "P2" }).bodyText,
      /7 days/,
    );
    assert.match(
      renderAllocationEmail({ ticketNo: "x", displaySubject: "s", assigneeDisplayName: "a", priority: "P3" }).bodyText,
      /14 days/,
    );
  });

  it("escapes HTML-significant characters in user-influenced fields", () => {
    const email = renderAllocationEmail({
      ticketNo: "x",
      displaySubject: "<script>alert(1)</script>",
      assigneeDisplayName: "a",
      priority: "P1",
    });
    assert.ok(!email.bodyHtml.includes("<script>"));
    assert.match(email.bodyHtml, /&lt;script&gt;/);
  });
});

describe("renderOutcomeEmail", () => {
  it("includes the curated outcome text but no notes when none are ticked (§7.4: never sent automatically)", () => {
    const email = renderOutcomeEmail({
      ticketNo: "2609151030",
      displaySubject: "Leave request",
      outcomeForRequester: "Your leave has been approved.",
      includedNotes: [],
    });
    assert.match(email.bodyText, /Your leave has been approved\./);
    assert.match(email.subject, /Resolved/);
  });

  it("appends only the explicitly-included notes' bodies, never a note that wasn't passed in", () => {
    const email = renderOutcomeEmail({
      ticketNo: "x",
      displaySubject: "s",
      outcomeForRequester: "Curated text.",
      includedNotes: [{ body: "Ticked note body." }],
    });
    assert.match(email.bodyText, /Curated text\./);
    assert.match(email.bodyText, /Ticked note body\./);
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
