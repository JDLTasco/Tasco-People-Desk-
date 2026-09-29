import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { closedLast } from "./sort";

describe("closedLast", () => {
  it("moves CLOSED and ARCHIVED tickets to the bottom, keeping order within each group", () => {
    const rows = [
      { id: "a", status: "CLOSED" },
      { id: "b", status: "IN_ACTION" },
      { id: "c", status: "ARCHIVED" },
      { id: "d", status: "NEW" },
      { id: "e", status: "RESPONSE_RECEIVED" },
    ];
    assert.deepEqual(
      closedLast(rows).map((r) => r.id),
      ["b", "d", "e", "a", "c"],
    );
  });

  it("does not mutate its input", () => {
    const rows = [{ status: "CLOSED" }, { status: "NEW" }];
    closedLast(rows);
    assert.equal(rows[0].status, "CLOSED");
  });
});
