import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isIgnoredImage } from "./ignored-images";

const ignored = new Set(["abc123"]);

describe("isIgnoredImage", () => {
  it("ignores an image whose hash is on the list", () => {
    assert.equal(isIgnoredImage("image/jpeg", "abc123", ignored), true);
    assert.equal(isIgnoredImage("IMAGE/PNG", "abc123", ignored), true);
  });

  it("keeps an image whose hash isn't on the list (e.g. a pasted screenshot)", () => {
    assert.equal(isIgnoredImage("image/png", "def456", ignored), false);
  });

  it("never ignores a non-image, even with a matching hash", () => {
    assert.equal(isIgnoredImage("application/pdf", "abc123", ignored), false);
    assert.equal(isIgnoredImage(null, "abc123", ignored), false);
  });
});
