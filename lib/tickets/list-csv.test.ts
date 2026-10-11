import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csvCell, ticketListCsv } from "./list-csv";
import type { TicketListRow } from "./queries";

describe("csvCell", () => {
  it("quotes commas, quotes and new lines", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("a, b"), '"a, b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
    assert.equal(csvCell(null), "");
  });

  it("defuses spreadsheet formulas", () => {
    assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.equal(csvCell("-5"), "'-5");
    assert.equal(csvCell("@sum"), "'@sum");
  });
});

describe("ticketListCsv", () => {
  it("writes a header and one row per ticket, in the order given", () => {
    const base = {
      subject: "Leave, annual",
      requesterName: "Sam Smith",
      status: "IN_ACTION",
      priority: "P2",
      receivedAt: new Date("2026-10-01T00:00:00Z"),
      slaDueAt: new Date("2030-01-01T00:00:00Z"),
      targetDueAt: null,
      isConfidential: false,
      responseAlertPending: false,
      version: 1,
      category: { name: "Leave" },
      businessUnit: null,
      actionStatus: null,
      assignee: { id: "u1", displayName: "Lisa Ferguson", initials: "LF" },
      assigneeColour: 0,
    };
    const rows = [
      { ...base, id: "a", ticketNo: "2610010000-1" },
      { ...base, id: "b", ticketNo: "2610010000-2", isConfidential: true, assignee: null },
    ] as unknown as TicketListRow[];
    const csv = ticketListCsv(rows);
    assert.ok(csv.startsWith("﻿Ticket,Received,Subject"));
    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^2610010000-1,"01\/10\/2026, 10:00 am","Leave, annual",Sam Smith,/);
    assert.match(lines[1], /,Lisa Ferguson,.*,No,No$/);
    assert.match(lines[2], /^2610010000-2,.*,,"01\/01\/2030, 11:00 am",No,Yes$/);
  });
});
