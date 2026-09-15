import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ticketNoBase, ticketNoWithSequence } from "./ticket-number";

describe("ticketNoBase", () => {
  it("formats YYMMDDHHMM in Australia/Melbourne time", () => {
    assert.equal(ticketNoBase(new Date("2026-06-15T04:30:00Z")), "2606151430");
  });
});

describe("ticketNoWithSequence", () => {
  it("appends a zero-padded 2-digit sequence", () => {
    assert.equal(ticketNoWithSequence(new Date("2026-06-15T04:30:00Z"), 1), "260615143001");
    assert.equal(ticketNoWithSequence(new Date("2026-06-15T04:30:00Z"), 12), "260615143012");
  });

  it("is exactly 12 characters, matching the varchar(12) column", () => {
    assert.equal(ticketNoWithSequence(new Date("2026-06-15T04:30:00Z"), 1).length, 12);
  });
});
