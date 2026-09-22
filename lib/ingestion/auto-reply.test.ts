import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAutoReply } from "./auto-reply";

describe("isAutoReply", () => {
  it("true for Auto-Submitted: auto-replied", () => {
    assert.equal(isAutoReply([{ name: "Auto-Submitted", value: "auto-replied" }]), true);
  });

  it("true for Auto-Submitted: auto-generated (any auto-* value)", () => {
    assert.equal(isAutoReply([{ name: "auto-submitted", value: "Auto-Generated" }]), true);
  });

  it("false for Auto-Submitted: no (a real human reply explicitly marks this)", () => {
    assert.equal(isAutoReply([{ name: "Auto-Submitted", value: "no" }]), false);
  });

  it("false for X-Auto-Response-Suppress alone (Outlook sets this on ordinary outbound mail, not just real auto-replies -- confirmed against real traffic in the 2026-09-23 mailbox smoke test)", () => {
    assert.equal(isAutoReply([{ name: "X-Auto-Response-Suppress", value: "DR, OOF, AutoReply" }]), false);
    assert.equal(isAutoReply([{ name: "X-Auto-Response-Suppress", value: "All" }]), false);
  });

  it("true when both headers are present (Auto-Submitted still decides it)", () => {
    assert.equal(
      isAutoReply([
        { name: "X-Auto-Response-Suppress", value: "All" },
        { name: "Auto-Submitted", value: "auto-replied" },
      ]),
      true,
    );
  });

  it("false when neither header is present", () => {
    assert.equal(isAutoReply([{ name: "Subject", value: "Hello" }]), false);
    assert.equal(isAutoReply([]), false);
  });
});
