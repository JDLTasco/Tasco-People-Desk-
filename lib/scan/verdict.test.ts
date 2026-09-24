import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canApplyVerdict, mapDefenderVerdict } from "./verdict";

describe("mapDefenderVerdict", () => {
  it("maps a clean result", () => {
    assert.equal(mapDefenderVerdict("No threats found"), "CLEAN");
  });

  it("maps a malicious result", () => {
    assert.equal(mapDefenderVerdict("Malicious"), "MALICIOUS");
  });

  it("maps Error and Not scanned to SCAN_UNAVAILABLE, per §7.3.2 fail-closed", () => {
    assert.equal(mapDefenderVerdict("Error"), "SCAN_UNAVAILABLE");
    assert.equal(mapDefenderVerdict("Not scanned"), "SCAN_UNAVAILABLE");
  });

  it("returns null for an unrecognized value rather than guessing", () => {
    assert.equal(mapDefenderVerdict("something new Defender starts sending"), null);
  });
});

describe("canApplyVerdict", () => {
  const pending = { scanStatus: "PENDING" as const, blockReason: null };
  const timedOut = { scanStatus: "BLOCKED" as const, blockReason: "SCAN_TIMEOUT" };

  it("any verdict may resolve a PENDING attachment", () => {
    for (const v of ["CLEAN", "MALICIOUS", "SCAN_UNAVAILABLE", "SCAN_TIMEOUT"] as const) {
      assert.equal(canApplyVerdict(pending, v), true);
    }
  });

  it("a real Defender verdict may replace a timeout (verdict arrived late)", () => {
    assert.equal(canApplyVerdict(timedOut, "CLEAN"), true);
    assert.equal(canApplyVerdict(timedOut, "MALICIOUS"), true);
    assert.equal(canApplyVerdict(timedOut, "SCAN_UNAVAILABLE"), true);
  });

  it("a timeout never replaces a timeout", () => {
    assert.equal(canApplyVerdict(timedOut, "SCAN_TIMEOUT"), false);
  });

  it("real verdicts stay final -- a MALICIOUS or CLEAN attachment is never flipped", () => {
    assert.equal(canApplyVerdict({ scanStatus: "MALICIOUS", blockReason: null }, "CLEAN"), false);
    assert.equal(canApplyVerdict({ scanStatus: "CLEAN", blockReason: null }, "MALICIOUS"), false);
    assert.equal(canApplyVerdict({ scanStatus: "BLOCKED", blockReason: "SCAN_UNAVAILABLE" }, "CLEAN"), false);
    assert.equal(canApplyVerdict({ scanStatus: "BLOCKED", blockReason: "EXECUTABLE_EXTENSION" }, "CLEAN"), false);
  });
});
