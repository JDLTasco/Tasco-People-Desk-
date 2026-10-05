import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ASSIGNEE_COLOUR_COUNT, colourSlots } from "./colours";

describe("colourSlots", () => {
  it("gives each user a different slot, in order", () => {
    const slots = colourSlots(["a", "b", "c"]);
    assert.deepEqual([slots.get("a"), slots.get("b"), slots.get("c")], [0, 1, 2]);
  });

  it("adding a user doesn't change anyone else's colour", () => {
    const before = colourSlots(["a", "b"]);
    const after = colourSlots(["a", "b", "c"]);
    assert.equal(after.get("a"), before.get("a"));
    assert.equal(after.get("b"), before.get("b"));
  });

  it("wraps round once the palette is used up", () => {
    const ids = Array.from({ length: ASSIGNEE_COLOUR_COUNT + 1 }, (_, i) => `u${i}`);
    assert.equal(colourSlots(ids).get(`u${ASSIGNEE_COLOUR_COUNT}`), 0);
  });

  it("an admin-chosen colour wins; everyone else keeps their automatic slot", () => {
    const slots = colourSlots(["a", "b", "c"], new Map([["b", 4]]));
    assert.deepEqual([slots.get("a"), slots.get("b"), slots.get("c")], [0, 4, 2]);
  });
});
