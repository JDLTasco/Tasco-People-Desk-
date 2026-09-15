import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderTicketTxt, renderTicketXml } from "./render";
import type { ArchiveTicket } from "./load";

function ticket(overrides: Partial<ArchiveTicket> = {}): ArchiveTicket {
  const base = {
    ticketNo: "260615000001",
    subject: "Leave request",
    originalSubject: "Leave request",
    requesterEmail: "jane@example.com",
    requesterName: "Jane Requester",
    receivedAt: new Date("2026-06-15T00:00:00Z"),
    requestDate: new Date("2026-06-15T00:00:00Z"),
    category: { name: "Leave" },
    businessUnit: { name: "Retail" },
    priority: "P2",
    slaDueAt: new Date("2026-06-22T00:00:00Z"),
    targetDueAt: null,
    targetDueReason: null,
    status: "ARCHIVED",
    closeReason: "RESOLVED",
    assignee: { displayName: "Rebecca Johnson" },
    firstViewedAt: new Date("2026-06-15T01:00:00Z"),
    firstViewedBy: { displayName: "Rebecca Johnson" },
    closedAt: new Date("2026-06-18T00:00:00Z"),
    mergedIntoTicket: null,
    isLegalHold: false,
    legalHoldReason: null,
    legalHoldSetBy: null,
    legalHoldSetAt: null,
    legalHoldClearedBy: null,
    legalHoldClearedAt: null,
    outcomeForRequester: "Your leave has been approved.",
    outcomeSentAt: new Date("2026-06-17T00:00:00Z"),
    messages: [
      {
        direction: "INBOUND",
        receivedAt: new Date("2026-06-15T00:00:00Z"),
        sentAt: null,
        fromName: "Jane Requester",
        fromAddress: "jane@example.com",
        bodyText: "I would like to take leave.",
      },
      {
        direction: "OUTBOUND",
        receivedAt: null,
        sentAt: new Date("2026-06-15T02:00:00Z"),
        fromName: null,
        fromAddress: "hrtickets@tascopetroleum.com.au",
        bodyText: "Your request has been allocated.",
      },
    ],
    notes: [
      {
        createdAt: new Date("2026-06-16T00:00:00Z"),
        author: { displayName: "Rebecca Johnson" },
        body: "Checked with the manager, approved.",
        supersedesNoteId: "prior-note-id",
      },
    ],
    statusHistory: [
      { createdAt: new Date("2026-06-15T00:00:00Z"), fromStatus: null, toStatus: "NEW", actor: { displayName: "System" }, reason: null },
      {
        createdAt: new Date("2026-06-18T00:00:00Z"),
        fromStatus: "OUTCOME",
        toStatus: "CLOSED",
        actor: { displayName: "Rebecca Johnson" },
        reason: null,
      },
    ],
    attachments: [
      { filename: "leave-form.pdf", sizeBytes: 1024, sha256: "abc123", scanStatus: "CLEAN", blockReason: null },
    ],
  };
  return { ...base, ...overrides } as unknown as ArchiveTicket;
}

describe("renderTicketTxt (§10 archive artefact)", () => {
  it("includes the header fields", () => {
    const txt = renderTicketTxt(ticket());
    assert.match(txt, /260615000001/);
    assert.match(txt, /Leave request/);
    assert.match(txt, /Jane Requester/);
    assert.match(txt, /Leave/);
    assert.match(txt, /Retail/);
    assert.match(txt, /P2/);
  });

  it("interleaves correspondence and notes chronologically with the correct labels", () => {
    const txt = renderTicketTxt(ticket());
    const emailInIdx = txt.indexOf("[EMAIL IN]");
    const emailOutIdx = txt.indexOf("[EMAIL OUT]");
    const noteIdx = txt.indexOf("[INTERNAL NOTE]");
    assert.ok(emailInIdx > -1 && emailOutIdx > -1 && noteIdx > -1);
    assert.ok(emailInIdx < emailOutIdx);
    assert.ok(emailOutIdx < noteIdx);
  });

  it("marks a superseded note as (edited)", () => {
    const txt = renderTicketTxt(ticket());
    assert.match(txt, /\[INTERNAL NOTE\].*\(edited\)/);
  });

  it("includes the outcome text as sent", () => {
    const txt = renderTicketTxt(ticket());
    assert.match(txt, /Your leave has been approved\./);
  });

  it("includes full status history", () => {
    const txt = renderTicketTxt(ticket());
    assert.match(txt, /\(created\) -> NEW/);
    assert.match(txt, /OUTCOME -> CLOSED/);
  });

  it("includes the attachment manifest with hash and scan status", () => {
    const txt = renderTicketTxt(ticket());
    assert.match(txt, /leave-form\.pdf/);
    assert.match(txt, /abc123/);
    assert.match(txt, /CLEAN/);
  });

  it("shows the legal hold status and reason when set", () => {
    const txt = renderTicketTxt(
      ticket({
        isLegalHold: true,
        legalHoldReason: "Fair Work matter",
        legalHoldSetBy: { displayName: "JDL" } as never,
        legalHoldSetAt: new Date("2026-06-16T00:00:00Z"),
      }),
    );
    assert.match(txt, /ACTIVE/);
    assert.match(txt, /Fair Work matter/);
    assert.match(txt, /JDL/);
  });

  it("notes when a ticket was merged into another", () => {
    const txt = renderTicketTxt(ticket({ mergedIntoTicket: { ticketNo: "260601000099" } as never }));
    assert.match(txt, /Merged into:\s+260601000099/);
  });
});

describe("renderTicketXml (§10 archive artefact)", () => {
  it("produces well-formed, balanced XML with the ticket number and namespace", () => {
    const xml = renderTicketXml(ticket());
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<ticket xmlns="urn:tasco:hr-ticketing:archive">/);
    assert.match(xml, /<ticketNo>260615000001<\/ticketNo>/);

    // Basic well-formedness check (balanced open/close tags) -- no XSD
    // validator is available in this environment without a new
    // dependency; this at least catches gross structural errors.
    const opens = xml.match(/<[a-zA-Z][^/>]*(?<!\/)>/g)?.length ?? 0;
    const closes = xml.match(/<\/[a-zA-Z][^>]*>/g)?.length ?? 0;
    assert.equal(opens, closes);
  });

  it("escapes XML-significant characters in free text", () => {
    const xml = renderTicketXml(ticket({ subject: "Leave & <urgent>" }));
    assert.ok(!xml.includes("<urgent>"));
    assert.match(xml, /Leave &amp; &lt;urgent&gt;/);
  });

  it("represents correspondence entries with type and edited attributes", () => {
    const xml = renderTicketXml(ticket());
    assert.match(xml, /<entry type="EMAIL_IN" edited="false">/);
    assert.match(xml, /<entry type="INTERNAL_NOTE" edited="true">/);
  });
});
