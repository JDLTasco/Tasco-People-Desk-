import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isViewableType } from "./viewable";

describe("isViewableType", () => {
  it("allows PDF and the common image types", () => {
    assert.equal(isViewableType("application/pdf"), true);
    assert.equal(isViewableType("image/png"), true);
    assert.equal(isViewableType("IMAGE/JPEG"), true);
    assert.equal(isViewableType("image/gif"), true);
  });

  it("refuses anything that could run script inline, and unknown types", () => {
    assert.equal(isViewableType("text/html"), false);
    assert.equal(isViewableType("image/svg+xml"), false);
    assert.equal(isViewableType("application/zip"), false);
    assert.equal(isViewableType(null), false);
    assert.equal(isViewableType(""), false);
  });
});
