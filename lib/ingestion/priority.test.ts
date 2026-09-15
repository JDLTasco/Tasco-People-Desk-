import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPriority } from "./priority";

describe("classifyPriority", () => {
  it('"urgent" (any case) -> P1', () => {
    assert.equal(classifyPriority("URGENT: need help"), "P1");
    assert.equal(classifyPriority("this is Urgent"), "P1");
  });

  it('"action" (any case) -> P2', () => {
    assert.equal(classifyPriority("Action required: payslip"), "P2");
  });

  it("neither keyword -> P3", () => {
    assert.equal(classifyPriority("General question"), "P3");
  });

  it('"urgent" wins over "action" when both are present', () => {
    assert.equal(classifyPriority("Urgent action needed"), "P1");
  });

  it("empty/no-subject case is P3", () => {
    assert.equal(classifyPriority("(no subject)"), "P3");
  });
});
