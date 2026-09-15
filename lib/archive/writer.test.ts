import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { archiveDir } from "./writer";

describe("archiveDir (§10 'Archive location': path derived from request_date, not closure date)", () => {
  it("builds hr-archive/{YYYY}/{MM}/{ticket_no}", () => {
    assert.equal(
      archiveDir({ requestDate: new Date("2026-06-05T00:00:00Z"), ticketNo: "260605000001" }),
      "hr-archive/2026/06/260605000001",
    );
  });

  it("zero-pads single-digit months", () => {
    assert.equal(
      archiveDir({ requestDate: new Date("2026-01-15T00:00:00Z"), ticketNo: "260115000002" }),
      "hr-archive/2026/01/260115000002",
    );
  });
});
