import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectContentType, validateAttachment } from "./attachments";

const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // "MZ" DOS header
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PLAIN_TEXT_BYTES = Buffer.from("hello world");

function attachment(overrides: Partial<Parameters<typeof validateAttachment>[0]>) {
  return {
    filename: "document.pdf",
    declaredContentType: "application/pdf",
    sizeBytes: PDF_BYTES.length,
    content: PDF_BYTES,
    isInline: false,
    ...overrides,
  };
}

describe("detectContentType", () => {
  it("recognizes known magic bytes", () => {
    assert.equal(detectContentType(PDF_BYTES), "application/pdf");
    assert.equal(detectContentType(ZIP_BYTES), "application/zip");
    assert.equal(detectContentType(EXE_BYTES), "application/x-msdownload");
    assert.equal(detectContentType(PNG_BYTES), "image/png");
  });

  it("returns null (not a mismatch) for unrecognized content", () => {
    assert.equal(detectContentType(PLAIN_TEXT_BYTES), null);
  });
});

describe("validateAttachment", () => {
  it("a normal PDF is accepted, PENDING", () => {
    const result = validateAttachment(attachment({}));
    assert.equal(result.scanStatus, "PENDING");
    assert.equal(result.blockReason, undefined);
  });

  it("over 25MB is BLOCKED with SIZE_EXCEEDED", () => {
    const result = validateAttachment(attachment({ sizeBytes: 26 * 1024 * 1024 }));
    assert.equal(result.scanStatus, "BLOCKED");
    assert.equal(result.blockReason, "SIZE_EXCEEDED");
  });

  it("an .exe is BLOCKED with EXECUTABLE_EXTENSION even if content looks like a PDF", () => {
    const result = validateAttachment(
      attachment({ filename: "invoice.exe", declaredContentType: "application/pdf" }),
    );
    assert.equal(result.scanStatus, "BLOCKED");
    assert.equal(result.blockReason, "EXECUTABLE_EXTENSION");
  });

  it("a real .exe by content is BLOCKED as EXECUTABLE_EXTENSION via its own extension", () => {
    const result = validateAttachment(attachment({ filename: "tool.exe", content: EXE_BYTES, declaredContentType: "application/x-msdownload" }));
    assert.equal(result.scanStatus, "BLOCKED");
    assert.equal(result.blockReason, "EXECUTABLE_EXTENSION");
  });

  it("an .iso is BLOCKED with CONTAINER_FORMAT", () => {
    const result = validateAttachment(attachment({ filename: "disk.iso", declaredContentType: "application/octet-stream" }));
    assert.equal(result.scanStatus, "BLOCKED");
    assert.equal(result.blockReason, "CONTAINER_FORMAT");
  });

  it("a .zip is ACCEPTED (PENDING), not blocked, per §7.3.1's explicit carve-out", () => {
    const result = validateAttachment(
      attachment({ filename: "documents.zip", declaredContentType: "application/zip", content: ZIP_BYTES }),
    );
    assert.equal(result.scanStatus, "PENDING");
  });

  it("a .pdf that is actually an executable (renamed) is BLOCKED as TYPE_MISMATCH", () => {
    const result = validateAttachment(attachment({ filename: "totally-a-pdf.pdf", content: EXE_BYTES }));
    assert.equal(result.scanStatus, "BLOCKED");
    assert.equal(result.blockReason, "TYPE_MISMATCH");
  });

  it("an unrecognized-by-signature type (e.g. plain .csv) is NOT blocked on sniffing alone", () => {
    const result = validateAttachment(
      attachment({ filename: "data.csv", declaredContentType: "text/csv", content: PLAIN_TEXT_BYTES }),
    );
    assert.equal(result.scanStatus, "PENDING");
  });

  it("a small inline image is SKIPPED (signature logo)", () => {
    const result = validateAttachment(
      attachment({
        filename: "logo.png",
        declaredContentType: "image/png",
        content: PNG_BYTES,
        sizeBytes: 2048,
        isInline: true,
      }),
    );
    assert.equal(result.scanStatus, "SKIPPED");
  });

  it("a LARGE inline image is NOT skipped -- still goes through normal validation", () => {
    const result = validateAttachment(
      attachment({
        filename: "banner.png",
        declaredContentType: "image/png",
        content: PNG_BYTES,
        sizeBytes: 50 * 1024,
        isInline: true,
      }),
    );
    assert.equal(result.scanStatus, "PENDING");
  });

  it("a non-inline small image is NOT skipped (isInline must also be true)", () => {
    const result = validateAttachment(
      attachment({ filename: "logo.png", declaredContentType: "image/png", content: PNG_BYTES, sizeBytes: 2048, isInline: false }),
    );
    assert.equal(result.scanStatus, "PENDING");
  });
});
