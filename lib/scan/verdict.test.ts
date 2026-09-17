import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapDefenderVerdict } from "./verdict";

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
