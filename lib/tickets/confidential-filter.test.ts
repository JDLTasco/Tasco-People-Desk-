import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { confidentialFilter } from "./queries";

// §9 (re-checked 2026-10-03 for the HR dashboard, which aggregates only rows
// that pass this filter -- lib/dashboard/load.ts).
describe("confidentialFilter", () => {
  it("ADMIN and HR_LEAD see every ticket (§3, §9.2)", () => {
    assert.deepEqual(confidentialFilter("u1", "ADMIN"), {});
    assert.deepEqual(confidentialFilter("u1", "HR_LEAD"), {});
  });

  it("an HR_OFFICER only gets non-confidential tickets, or confidential ones assigned/granted to them", () => {
    assert.deepEqual(confidentialFilter("u1", "HR_OFFICER"), {
      OR: [
        { isConfidential: false },
        { isConfidential: true, assignedToId: "u1" },
        { isConfidential: true, accessGrants: { some: { userId: "u1" } } },
      ],
    });
  });
});
