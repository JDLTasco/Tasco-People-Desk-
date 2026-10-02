import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidEmailAddress, parseRecipientList, validateRecipients } from "./recipients";

describe("parseRecipientList", () => {
  it("splits on commas, semicolons and spaces, trims and de-duplicates", () => {
    assert.deepEqual(parseRecipientList(" a@x.com; b@y.com,  A@X.com  c@z.com "), ["a@x.com", "b@y.com", "c@z.com"]);
  });

  it("returns an empty list for blank input", () => {
    assert.deepEqual(parseRecipientList("  "), []);
  });
});

describe("isValidEmailAddress", () => {
  it("accepts ordinary addresses and rejects obvious junk", () => {
    assert.equal(isValidEmailAddress("jo.bloggs@tascopetroleum.com.au"), true);
    assert.equal(isValidEmailAddress("Jo Bloggs"), false);
    assert.equal(isValidEmailAddress("jo@localhost"), false);
  });
});

describe("validateRecipients", () => {
  it("lets a question go to the requester's manager instead of the requester, with CCs", () => {
    const result = validateRecipients(["manager@tasco.com.au"], ["requester@tasco.com.au"]);
    assert.deepEqual(result, { ok: true, to: ["manager@tasco.com.au"], cc: ["requester@tasco.com.au"] });
  });

  it("requires at least one To address", () => {
    assert.equal(validateRecipients([], ["a@x.com"]).ok, false);
  });

  it("rejects an invalid address anywhere", () => {
    const result = validateRecipients(["a@x.com"], ["not-an-email"]);
    assert.equal(result.ok, false);
  });

  it("drops a CC that is already in To", () => {
    const result = validateRecipients(["a@x.com"], ["A@x.com", "b@x.com"]);
    assert.deepEqual(result, { ok: true, to: ["a@x.com"], cc: ["b@x.com"] });
  });
});
