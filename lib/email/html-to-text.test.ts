import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailHtmlToText, messageDisplayText } from "./html-to-text";

describe("emailHtmlToText", () => {
  it("empty input stays empty", () => {
    assert.equal(emailHtmlToText(""), "");
    assert.equal(emailHtmlToText("   "), "");
  });

  it("strips tags and preserves paragraph breaks", () => {
    const html = "<html><body><p>Hi HR,</p><p>Can I get a reference check for Jane Doe?</p></body></html>";
    const text = emailHtmlToText(html);
    assert.match(text, /Hi HR,/);
    assert.match(text, /Can I get a reference check for Jane Doe\?/);
    assert.ok(text.includes("\n"), "paragraphs should be separated by a line break");
  });

  it("drops inline signature images instead of rendering their alt text as noise", () => {
    const html = '<p>Regards,</p><img src="cid:logo123" alt="Tasco Petroleum" width="120">';
    const text = emailHtmlToText(html);
    assert.match(text, /Regards,/);
    assert.ok(!text.includes("Tasco Petroleum"), "the decorative logo's alt text should not appear in the body");
  });

  it("renders link text without dumping the raw href inline", () => {
    const html = '<p>See the <a href="https://example.com/policy">leave policy</a> for details.</p>';
    const text = emailHtmlToText(html);
    assert.match(text, /See the leave policy for details\./);
  });

  it("decodes HTML entities", () => {
    const text = emailHtmlToText("<p>Tom &amp; Jerry&#39;s request &mdash; urgent</p>");
    assert.match(text, /Tom & Jerry's request/);
  });
});

describe("messageDisplayText", () => {
  it("uses bodyText when it's actually populated", () => {
    assert.equal(messageDisplayText({ bodyText: "Plain text body", bodyHtml: "<p>ignored</p>" }), "Plain text body");
  });

  it("falls back to deriving from bodyHtml when bodyText is blank -- the exact shape of the 17 real tickets ingested before the 2026-09-23 fix", () => {
    const text = messageDisplayText({ bodyText: "", bodyHtml: "<p>Can I get a reference check for Jane Doe?</p>" });
    assert.match(text, /Can I get a reference check for Jane Doe\?/);
  });

  it("falls back when bodyText is whitespace-only", () => {
    const text = messageDisplayText({ bodyText: "   ", bodyHtml: "<p>Real content</p>" });
    assert.match(text, /Real content/);
  });

  it("both blank -> empty string, not an error", () => {
    assert.equal(messageDisplayText({ bodyText: "", bodyHtml: "" }), "");
    assert.equal(messageDisplayText({ bodyText: null, bodyHtml: null }), "");
  });
});
