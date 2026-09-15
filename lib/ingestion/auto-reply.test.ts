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

  it("true whenever X-Auto-Response-Suppress is present, regardless of value", () => {
    assert.equal(isAutoReply([{ name: "X-Auto-Response-Suppress", value: "All" }]), true);
    assert.equal(isAutoReply([{ name: "X-Auto-Response-Suppress", value: "" }]), true);
  });

  it("false when neither header is present", () => {
    assert.equal(isAutoReply([{ name: "Subject", value: "Hello" }]), false);
    assert.equal(isAutoReply([]), false);
  });
});
