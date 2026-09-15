import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CORRELATION_ID_HEADER, getOrCreateCorrelationId, newCorrelationId } from "./correlation";

const UUID_RE = /^[0-9a-f-]{36}$/i;

describe("newCorrelationId", () => {
  it("returns a well-formed, unique UUID each time", () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    assert.match(a, UUID_RE);
    assert.notEqual(a, b);
  });
});

describe("getOrCreateCorrelationId", () => {
  it("adopts a valid supplied X-Correlation-Id", () => {
    const supplied = "11111111-1111-1111-1111-111111111111";
    const headers = new Headers({ [CORRELATION_ID_HEADER]: supplied });
    assert.equal(getOrCreateCorrelationId(headers), supplied);
  });

  it("mints a fresh one when the header is absent", () => {
    const id = getOrCreateCorrelationId(new Headers());
    assert.match(id, UUID_RE);
  });

  it("mints a fresh one when the header is malformed, never trusting garbage", () => {
    const headers = new Headers({ [CORRELATION_ID_HEADER]: "'; DROP TABLE audit_log; --" });
    const id = getOrCreateCorrelationId(headers);
    assert.match(id, UUID_RE);
  });
});
