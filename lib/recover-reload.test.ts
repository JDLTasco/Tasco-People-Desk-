import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RELOAD_WINDOW_MS, shouldAutoReload } from "./recover-reload";

describe("shouldAutoReload", () => {
  const now = 1_000_000;

  it("reloads the first time", () => {
    assert.equal(shouldAutoReload(null, "/pool", now), true);
  });

  it("does not reload again on the same page straight away (no loop on a real bug)", () => {
    assert.equal(shouldAutoReload(JSON.stringify({ path: "/pool", at: now - 5_000 }), "/pool", now), false);
  });

  it("reloads again on a different page, or after the window", () => {
    assert.equal(shouldAutoReload(JSON.stringify({ path: "/pool", at: now - 5_000 }), "/my-tickets", now), true);
    assert.equal(shouldAutoReload(JSON.stringify({ path: "/pool", at: now - RELOAD_WINDOW_MS - 1 }), "/pool", now), true);
  });

  it("treats junk in storage as no previous reload", () => {
    assert.equal(shouldAutoReload("not json", "/pool", now), true);
  });
});
