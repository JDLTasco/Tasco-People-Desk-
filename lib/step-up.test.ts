import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasRecentStepUp, requireRecentStepUp, StepUpRequiredError, STEP_UP_WINDOW_MS } from "./step-up";

const NOW = 1_000_000_000_000;

describe("hasRecentStepUp", () => {
  it("is true immediately after step-up", () => {
    assert.equal(hasRecentStepUp(NOW, NOW), true);
  });

  it("is true right up to the 5-minute boundary", () => {
    assert.equal(hasRecentStepUp(NOW - STEP_UP_WINDOW_MS, NOW), true);
  });

  it("is false just past the 5-minute boundary", () => {
    assert.equal(hasRecentStepUp(NOW - STEP_UP_WINDOW_MS - 1, NOW), false);
  });

  it("is false when no step-up has ever happened", () => {
    assert.equal(hasRecentStepUp(undefined, NOW), false);
    assert.equal(hasRecentStepUp(null, NOW), false);
  });

  it("is false for a future/clock-skewed timestamp", () => {
    assert.equal(hasRecentStepUp(NOW + 1000, NOW), false);
  });
});

describe("requireRecentStepUp", () => {
  it("does not throw when fresh", () => {
    assert.doesNotThrow(() => requireRecentStepUp(NOW, "LEGAL_HOLD_SET", NOW));
  });

  it("throws StepUpRequiredError when stale or absent", () => {
    assert.throws(() => requireRecentStepUp(undefined, "LEGAL_HOLD_SET", NOW), StepUpRequiredError);
    assert.throws(
      () => requireRecentStepUp(NOW - STEP_UP_WINDOW_MS - 1, "SOFT_DELETE", NOW),
      /Step-up re-authentication required for SOFT_DELETE/,
    );
  });
});
