import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSendAcknowledgement } from "./acknowledgement";

const NOW = new Date("2026-10-03T00:00:00Z");
const HR = "hrtickets@tascopetroleum.com.au";

describe("shouldSendAcknowledgement", () => {
  it("acknowledges a fresh request", () => {
    const receivedAt = new Date("2026-10-02T23:50:00Z");
    assert.equal(shouldSendAcknowledgement({ receivedAt, requesterEmail: "jo@example.com" }, NOW, HR), true);
  });

  it("does not acknowledge mail older than 24 hours (backlog/history imports)", () => {
    const receivedAt = new Date("2026-10-01T23:00:00Z");
    assert.equal(shouldSendAcknowledgement({ receivedAt, requesterEmail: "jo@example.com" }, NOW, HR), false);
  });

  it("never acknowledges the HR mailbox itself, case-insensitively", () => {
    assert.equal(shouldSendAcknowledgement({ receivedAt: NOW, requesterEmail: "HRTickets@TascoPetroleum.com.au" }, NOW, HR), false);
  });

  it("skips a requester with no usable email address", () => {
    assert.equal(shouldSendAcknowledgement({ receivedAt: NOW, requesterEmail: "Jo Bloggs" }, NOW, HR), false);
  });
});
