// Attachment handling (§7.3.1). Defender for Storage is the primary
// control; everything here is the synchronous, deterministic "supporting
// control" half -- extension/container blocklist, size limit, magic-byte
// content sniffing, and the inline-signature-image skip. The async
// PENDING -> CLEAN/MALICIOUS transition (Defender's actual verdict) is a
// genuinely open question the spec never answers (how the app learns of
// it -- webhook? polling? blob index tags?) -- not guessed at here, see
// STATUS.md.

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

const EXECUTABLE_EXTENSIONS = [
  ".exe", ".dll", ".bat", ".cmd", ".com", ".ps1", ".js", ".vbs", ".scr", ".jar", ".msi", ".hta", ".lnk",
];
const CONTAINER_EXTENSIONS = [".iso", ".img", ".vhd", ".vhdx", ".rar", ".7z", ".cab", ".ace"];
const INLINE_IMAGE_MAX_BYTES = 10 * 1024;

export type ScanStatus = "PENDING" | "BLOCKED" | "SKIPPED";
export type BlockReason = "SIZE_EXCEEDED" | "EXECUTABLE_EXTENSION" | "CONTAINER_FORMAT" | "TYPE_MISMATCH";

export interface AttachmentValidationResult {
  scanStatus: ScanStatus;
  blockReason?: BlockReason;
  detectedContentType: string;
}

export interface AttachmentInput {
  filename: string;
  declaredContentType: string;
  sizeBytes: number;
  content: Buffer;
  isInline: boolean;
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

// Deliberately small and conservative -- only formats with an unambiguous
// magic-byte signature. An unrecognized file is "unknown," never
// misreported as a specific type; TYPE_MISMATCH only fires when detection
// is actually confident.
const MAGIC_SIGNATURES: Array<{ contentType: string; bytes: number[] }> = [
  { contentType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { contentType: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { contentType: "application/x-msdownload", bytes: [0x4d, 0x5a] },
  { contentType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { contentType: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

/** Null means "not confidently determined" -- never used on its own to block. */
export function detectContentType(content: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (content.length >= sig.bytes.length && sig.bytes.every((b, i) => content[i] === b)) {
      return sig.contentType;
    }
  }
  return null;
}

// Extensions we can confidently check against a detected type. .docx/
// .xlsx/.pptx are OOXML -- ZIP containers -- so "application/zip" is the
// correct, non-mismatched detection for them.
const EXTENSION_EXPECTED_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"],
  ".zip": ["application/zip"],
  ".docx": ["application/zip"],
  ".xlsx": ["application/zip"],
  ".pptx": ["application/zip"],
};

export function validateAttachment(att: AttachmentInput): AttachmentValidationResult {
  const ext = extensionOf(att.filename);
  const detectedConfidently = detectContentType(att.content);
  const detectedContentType = detectedConfidently ?? att.declaredContentType;

  // §7.3.1: "Inline images under 10KB. Ignored (signature logos)."
  if (att.isInline && att.declaredContentType.startsWith("image/") && att.sizeBytes < INLINE_IMAGE_MAX_BYTES) {
    return { scanStatus: "SKIPPED", detectedContentType };
  }

  if (att.sizeBytes > MAX_SIZE_BYTES) {
    return { scanStatus: "BLOCKED", blockReason: "SIZE_EXCEEDED", detectedContentType };
  }

  if (EXECUTABLE_EXTENSIONS.includes(ext)) {
    return { scanStatus: "BLOCKED", blockReason: "EXECUTABLE_EXTENSION", detectedContentType };
  }

  if (CONTAINER_EXTENSIONS.includes(ext)) {
    return { scanStatus: "BLOCKED", blockReason: "CONTAINER_FORMAT", detectedContentType };
  }

  const expected = EXTENSION_EXPECTED_TYPES[ext];
  if (expected && detectedConfidently && !expected.includes(detectedConfidently)) {
    return { scanStatus: "BLOCKED", blockReason: "TYPE_MISMATCH", detectedContentType: detectedConfidently };
  }

  // .zip and everything else not otherwise blocked: accepted, quarantined
  // pending Defender's scan.
  return { scanStatus: "PENDING", detectedContentType };
}
