import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentDisposition } from "./content-disposition";

describe("contentDisposition", () => {
  it("keeps a plain filename as-is", () => {
    assert.equal(
      contentDisposition("inline", "05102026080936-0001.pdf"),
      `inline; filename="05102026080936-0001.pdf"; filename*=UTF-8''05102026080936-0001.pdf`,
    );
  });

  it("replaces quotes and non-ASCII in the fallback, encodes the real name", () => {
    const header = contentDisposition("attachment", `Résumé "final".pdf`);
    assert.equal(header, `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`);
    assert.ok(/^[\x20-\x7e]*$/.test(header));
  });
});
