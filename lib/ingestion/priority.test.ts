import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPriority } from "./priority";

describe("classifyPriority", () => {
  it('"urgent" (any case) -> P1', () => {
    assert.equal(classifyPriority("URGENT: need help"), "P1");
    assert.equal(classifyPriority("this is Urgent"), "P1");
  });

  it('no "urgent" keyword -> P3, determined explicitly at allocation instead (2026-09-16 amendment)', () => {
    assert.equal(classifyPriority("Action required: payslip"), "P3");
    assert.equal(classifyPriority("General question"), "P3");
  });

  it("empty/no-subject case is P3", () => {
    assert.equal(classifyPriority("(no subject)"), "P3");
  });
});
