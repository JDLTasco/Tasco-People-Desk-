import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesFilters } from "./filters";
import type { TicketListRow } from "./queries";

const NOW = new Date("2026-06-15T00:00:00Z");

function ticket(overrides: Partial<TicketListRow> = {}): TicketListRow {
  return {
    id: "t1",
    ticketNo: "260615000001",
    subject: "Test",
    requesterName: "Jane Requester",
    status: "ALLOCATED",
    priority: "P2",
    receivedAt: NOW,
    slaDueAt: new Date("2026-06-20T00:00:00Z"),
    targetDueAt: null,
    isConfidential: false,
    category: null,
    businessUnit: null,
    assignee: null,
    ...overrides,
  } as TicketListRow;
}

describe("matchesFilters: requester", () => {
  it("matches a case-insensitive substring of requesterName", () => {
    assert.equal(matchesFilters(ticket({ requesterName: "Jane Smith" }), { requester: "jane" }), true);
    assert.equal(matchesFilters(ticket({ requesterName: "Jane Smith" }), { requester: "bob" }), false);
  });

  it("empty requester filter matches everything", () => {
    assert.equal(matchesFilters(ticket(), { requester: "" }), true);
  });
});

describe("matchesFilters: status / priority", () => {
  it("matches exact status", () => {
    assert.equal(matchesFilters(ticket({ status: "IN_ACTION" }), { status: "IN_ACTION" }), true);
    assert.equal(matchesFilters(ticket({ status: "IN_ACTION" }), { status: "NEW" }), false);
  });

  it("matches exact priority", () => {
    assert.equal(matchesFilters(ticket({ priority: "P1" }), { priority: "P1" }), true);
    assert.equal(matchesFilters(ticket({ priority: "P1" }), { priority: "P3" }), false);
  });
});

describe("matchesFilters: business unit", () => {
  it("matches by name", () => {
    const t = ticket({ businessUnit: { name: "Retail" } });
    assert.equal(matchesFilters(t, { businessUnit: "Retail" }), true);
    assert.equal(matchesFilters(t, { businessUnit: "Depots" }), false);
  });

  it("__none__ matches tickets with no business unit set", () => {
    assert.equal(matchesFilters(ticket({ businessUnit: null }), { businessUnit: "__none__" }), true);
    assert.equal(
      matchesFilters(ticket({ businessUnit: { name: "Retail" } }), { businessUnit: "__none__" }),
      false,
    );
  });
});

describe("matchesFilters: assignee", () => {
  it("matches by 'Display Name (Initials)' label", () => {
    const t = ticket({ assignee: { id: "u1", displayName: "Jane Officer", initials: "JO" } });
    assert.equal(matchesFilters(t, { assignee: "Jane Officer (JO)" }), true);
    assert.equal(matchesFilters(t, { assignee: "Other Person (OP)" }), false);
  });

  it("__unassigned__ matches tickets with no assignee", () => {
    assert.equal(matchesFilters(ticket({ assignee: null }), { assignee: "__unassigned__" }), true);
    assert.equal(
      matchesFilters(ticket({ assignee: { id: "u1", displayName: "X", initials: "X" } }), { assignee: "__unassigned__" }),
      false,
    );
  });
});

describe("matchesFilters: due", () => {
  it("OVERDUE matches only tickets past their effective due date", () => {
    const overdue = ticket({ slaDueAt: new Date("2026-06-01T00:00:00Z"), status: "ALLOCATED" });
    const notOverdue = ticket({ slaDueAt: new Date("2026-07-01T00:00:00Z"), status: "ALLOCATED" });
    assert.equal(matchesFilters(overdue, { due: "OVERDUE" }, NOW), true);
    assert.equal(matchesFilters(notOverdue, { due: "OVERDUE" }, NOW), false);
  });

  it("WEEK matches tickets due within the next 7 days, not further out", () => {
    const dueSoon = ticket({ slaDueAt: new Date("2026-06-18T00:00:00Z") });
    const dueLater = ticket({ slaDueAt: new Date("2026-07-15T00:00:00Z") });
    assert.equal(matchesFilters(dueSoon, { due: "WEEK" }, NOW), true);
    assert.equal(matchesFilters(dueLater, { due: "WEEK" }, NOW), false);
  });

  it("no due filter matches everything", () => {
    assert.equal(matchesFilters(ticket(), { due: "" }, NOW), true);
  });
});

describe("matchesFilters: combined criteria (AND, not OR)", () => {
  it("all criteria must match", () => {
    const t = ticket({
      requesterName: "Jane Smith",
      status: "ALLOCATED",
      priority: "P2",
      businessUnit: { name: "Retail" },
    });
    assert.equal(
      matchesFilters(t, { requester: "jane", status: "ALLOCATED", priority: "P2", businessUnit: "Retail" }, NOW),
      true,
    );
    assert.equal(
      matchesFilters(t, { requester: "jane", status: "ALLOCATED", priority: "P1" /* wrong */ }, NOW),
      false,
    );
  });
});
