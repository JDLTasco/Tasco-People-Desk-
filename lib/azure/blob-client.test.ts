import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitBlobPath } from "./blob-client";

describe("splitBlobPath", () => {
  it("splits an attachment path into container and blob name", () => {
    assert.deepEqual(splitBlobPath("attachments/ticket-1/msg-1/file.pdf"), {
      container: "attachments",
      blobName: "ticket-1/msg-1/file.pdf",
    });
  });

  it("splits an archive path", () => {
    assert.deepEqual(splitBlobPath("hr-archive/2026/09/2609160001/ticket.xml"), {
      container: "hr-archive",
      blobName: "2026/09/2609160001/ticket.xml",
    });
  });

  it("throws for a path with no container segment", () => {
    assert.throws(() => splitBlobPath("no-slash-here"));
  });
});
