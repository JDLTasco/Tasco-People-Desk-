import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoResponseReceivedFor } from "./auto-response";

const HR = "hrtickets@tascopetroleum.com.au";
const assigned = (status: string) => ({ status, assignedToId: "user-1" });

describe("autoResponseReceivedFor", () => {
  it("moves a worked ticket to RESPONSE_RECEIVED", () => {
    assert.equal(autoResponseReceivedFor(assigned("IN_ACTION"), "jo@example.com", HR), "SET_RESPONSE_RECEIVED");
    assert.equal(autoResponseReceivedFor(assigned("AWAITING_RESPONSE"), "jo@example.com", HR), "SET_RESPONSE_RECEIVED");
  });

  it("only alerts on ALLOCATED (category guard) and on an existing RESPONSE_RECEIVED", () => {
    assert.equal(autoResponseReceivedFor(assigned("ALLOCATED"), "jo@example.com", HR), "ALERT_ONLY");
    assert.equal(autoResponseReceivedFor(assigned("RESPONSE_RECEIVED"), "jo@example.com", HR), "ALERT_ONLY");
  });

  it("does nothing for unassigned, OUTCOME or CLOSED tickets", () => {
    assert.equal(autoResponseReceivedFor({ status: "NEW", assignedToId: null }, "jo@example.com", HR), "NONE");
    assert.equal(autoResponseReceivedFor(assigned("OUTCOME"), "jo@example.com", HR), "NONE");
    assert.equal(autoResponseReceivedFor(assigned("CLOSED"), "jo@example.com", HR), "NONE");
  });

  it("ignores a copy from the HR mailbox itself", () => {
    assert.equal(autoResponseReceivedFor(assigned("IN_ACTION"), "HRTickets@tascopetroleum.com.au", HR), "NONE");
  });
});
