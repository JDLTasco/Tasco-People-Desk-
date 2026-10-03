import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesFilters, sortTickets } from "./filters";
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

describe("matchesFilters: ticketNo", () => {
  it("matches a case-insensitive substring of ticketNo", () => {
    assert.equal(matchesFilters(ticket({ ticketNo: "260615000042" }), { ticketNo: "0042" }), true);
    assert.equal(matchesFilters(ticket({ ticketNo: "260615000042" }), { ticketNo: "9999" }), false);
  });

  it("empty ticketNo filter matches everything", () => {
    assert.equal(matchesFilters(ticket(), { ticketNo: "" }), true);
  });
});

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
    assert.equal(matchesFilters(ticket({ status: "IN_ACTION" }), { status: ["IN_ACTION"] }), true);
    assert.equal(matchesFilters(ticket({ status: "IN_ACTION" }), { status: ["NEW"] }), false);
  });

  it("matches exact priority", () => {
    assert.equal(matchesFilters(ticket({ priority: "P1" }), { priority: ["P1"] }), true);
    assert.equal(matchesFilters(ticket({ priority: "P1" }), { priority: ["P3"] }), false);
  });
});

describe("matchesFilters: business unit", () => {
  it("matches by name", () => {
    const t = ticket({ businessUnit: { name: "Retail" } });
    assert.equal(matchesFilters(t, { businessUnit: ["Retail"] }), true);
    assert.equal(matchesFilters(t, { businessUnit: ["Depots"] }), false);
  });

  it("__none__ matches tickets with no business unit set", () => {
    assert.equal(matchesFilters(ticket({ businessUnit: null }), { businessUnit: ["__none__"] }), true);
    assert.equal(
      matchesFilters(ticket({ businessUnit: { name: "Retail" } }), { businessUnit: ["__none__"] }),
      false,
    );
  });
});

describe("matchesFilters: assignee", () => {
  it("matches by 'Display Name (Initials)' label", () => {
    const t = ticket({ assignee: { id: "u1", displayName: "Jane Officer", initials: "JO" } });
    assert.equal(matchesFilters(t, { assignee: ["Jane Officer"] }), true);
    assert.equal(matchesFilters(t, { assignee: ["Other Person"] }), false);
  });

  it("__unassigned__ matches tickets with no assignee", () => {
    assert.equal(matchesFilters(ticket({ assignee: null }), { assignee: ["__unassigned__"] }), true);
    assert.equal(
      matchesFilters(ticket({ assignee: { id: "u1", displayName: "X", initials: "X" } }), { assignee: ["__unassigned__"] }),
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
      matchesFilters(t, { requester: "jane", status: ["ALLOCATED"], priority: ["P2"], businessUnit: ["Retail"] }, NOW),
      true,
    );
    assert.equal(
      matchesFilters(t, { requester: "jane", status: ["ALLOCATED"], priority: ["P1"] /* wrong */ }, NOW),
      false,
    );
  });
});

describe("matchesFilters: action items (2026-10-01)", () => {
  it("filters an IN_ACTION ticket by its action item's name, not IN_ACTION", () => {
    const t = ticket({ status: "IN_ACTION", actionStatus: { name: "On Hold" } });
    assert.equal(matchesFilters(t, { status: ["On Hold"] }), true);
    assert.equal(matchesFilters(t, { status: ["IN_ACTION"] }), false);
  });
});

describe("matchesFilters: several choices in one filter (2026-10-03)", () => {
  it("matches ANY ticked value within a filter", () => {
    assert.equal(matchesFilters(ticket({ priority: "P1" }), { priority: ["P1", "P2"] }), true);
    assert.equal(matchesFilters(ticket({ priority: "P3" }), { priority: ["P1", "P2"] }), false);
    assert.equal(matchesFilters(ticket({ status: "NEW" }), { status: ["NEW", "ALLOCATED"] }), true);
  });

  it("still combines different filters with AND", () => {
    const t = ticket({ status: "NEW", priority: "P3" });
    assert.equal(matchesFilters(t, { status: ["NEW", "ALLOCATED"], priority: ["P1", "P2"] }), false);
    assert.equal(matchesFilters(t, { status: ["NEW", "ALLOCATED"], priority: ["P2", "P3"] }), true);
  });

  it("an empty list means any", () => {
    assert.equal(matchesFilters(ticket(), { status: [], priority: [] }), true);
  });

  it("mixes a named business unit with (none set)", () => {
    assert.equal(matchesFilters(ticket({ businessUnit: null }), { businessUnit: ["Retail", "__none__"] }), true);
  });
});

describe("sortTickets (2026-10-03)", () => {
  const a = ticket({ id: "a", priority: "P2", status: "IN_ACTION", requesterName: "Zoe" });
  const b = ticket({ id: "b", priority: "P1", status: "NEW", requesterName: "Amy" });
  const c = ticket({ id: "c", priority: "P1", status: "IN_ACTION", requesterName: "Bob" });
  const ids = (rows: TicketListRow[]) => rows.map((r) => r.id).join("");

  it("no keys keeps the original order", () => {
    assert.equal(ids(sortTickets([a, b, c], [])), "abc");
  });

  it("sorts by priority, then status in lifecycle order", () => {
    assert.equal(
      ids(sortTickets([a, b, c], [{ field: "priority", direction: "asc" }, { field: "status", direction: "asc" }])),
      "bca",
    );
  });

  it("second key breaks ties, descending works", () => {
    assert.equal(
      ids(sortTickets([a, b, c], [{ field: "priority", direction: "asc" }, { field: "requester", direction: "desc" }])),
      "cba",
    );
  });

  it("unassigned sorts after named assignees", () => {
    const x = ticket({ id: "x", assignee: null });
    const y = ticket({ id: "y", assignee: { id: "u", displayName: "Lisa", initials: "LF" } });
    assert.equal(ids(sortTickets([x, y], [{ field: "assignee", direction: "asc" }])), "yx");
  });
});
