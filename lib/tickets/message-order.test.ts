import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortMessagesChronologically } from "./message-order";

describe("sortMessagesChronologically", () => {
  it("interleaves inbound (received_at) and outbound (sent_at) messages by actual chronological time", () => {
    const original = { direction: "INBOUND", receivedAt: new Date("2026-01-01T00:00:00Z"), sentAt: null };
    const allocation = { direction: "OUTBOUND", receivedAt: null, sentAt: new Date("2026-01-01T00:00:10Z") };
    const reply = { direction: "INBOUND", receivedAt: new Date("2026-01-01T00:00:20Z"), sentAt: null };

    // Fed in an order that would reproduce the bug if sorted by received_at
    // alone (allocation's null received_at would push it after reply).
    const sorted = sortMessagesChronologically([reply, allocation, original]);

    assert.deepEqual(sorted, [original, allocation, reply]);
  });

  it("does not mutate the input array", () => {
    const a = { direction: "INBOUND", receivedAt: new Date("2026-01-02T00:00:00Z"), sentAt: null };
    const b = { direction: "INBOUND", receivedAt: new Date("2026-01-01T00:00:00Z"), sentAt: null };
    const input = [a, b];
    sortMessagesChronologically(input);
    assert.deepEqual(input, [a, b]);
  });
});
