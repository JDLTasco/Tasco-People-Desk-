import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchSuppressionRule, normaliseSuppressionValue, type SuppressionRule } from "./suppression";

const rules: SuppressionRule[] = [
  { id: "1", type: "SENDER", value: "spammer@bad.com" },
  { id: "2", type: "DOMAIN", value: "noisy-vendor.com" },
  { id: "3", type: "SUBJECT_PATTERN", value: "out of office" },
];

describe("matchSuppressionRule", () => {
  it("matches a SENDER rule case-insensitively", () => {
    const match = matchSuppressionRule({ fromAddress: "Spammer@Bad.com", subject: "hi" }, rules);
    assert.equal(match?.id, "1");
  });

  it("matches a DOMAIN rule against the sender's domain", () => {
    const match = matchSuppressionRule({ fromAddress: "someone@noisy-vendor.com", subject: "hi" }, rules);
    assert.equal(match?.id, "2");
  });

  it("matches a SUBJECT_PATTERN rule as a case-insensitive substring", () => {
    const match = matchSuppressionRule({ fromAddress: "x@y.com", subject: "Re: Out Of Office reply" }, rules);
    assert.equal(match?.id, "3");
  });

  it("returns null when nothing matches", () => {
    const match = matchSuppressionRule({ fromAddress: "real@requester.com", subject: "Payroll question" }, rules);
    assert.equal(match, null);
  });

  it("first matching rule wins", () => {
    const twoRules: SuppressionRule[] = [
      { id: "a", type: "DOMAIN", value: "bad.com" },
      { id: "b", type: "SENDER", value: "spammer@bad.com" },
    ];
    const match = matchSuppressionRule({ fromAddress: "spammer@bad.com", subject: "hi" }, twoRules);
    assert.equal(match?.id, "a");
  });
});

describe("normaliseSuppressionValue", () => {
  it("lower-cases and trims a sender address", () => {
    assert.deepEqual(normaliseSuppressionValue("SENDER", "  NoReply@Apple.com "), { value: "noreply@apple.com" });
  });

  it("rejects a sender that isn't an email address", () => {
    assert.ok("error" in normaliseSuppressionValue("SENDER", "apple.com"));
  });

  it("accepts a domain typed with an @ or as an address", () => {
    assert.deepEqual(normaliseSuppressionValue("DOMAIN", "@Seek.com.au"), { value: "seek.com.au" });
    assert.deepEqual(normaliseSuppressionValue("DOMAIN", "jobs@seek.com.au"), { value: "seek.com.au" });
  });

  it("refuses to block Tasco's own domain or a subdomain of it", () => {
    assert.ok("error" in normaliseSuppressionValue("DOMAIN", "tascopetroleum.com.au"));
    assert.ok("error" in normaliseSuppressionValue("DOMAIN", "mail.tascopetroleum.com.au"));
  });

  it("collapses spaces in subject words and refuses very short ones", () => {
    assert.deepEqual(normaliseSuppressionValue("SUBJECT_PATTERN", " Still  Accepting Applications "), {
      value: "still accepting applications",
    });
    assert.ok("error" in normaliseSuppressionValue("SUBJECT_PATTERN", "re:"));
  });
});
