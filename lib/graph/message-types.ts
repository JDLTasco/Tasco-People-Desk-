// The normalized shape every inbound message is converted to before
// reaching lib/ingestion's pipeline (§7.3) -- whether it came from a real
// Graph API response (once §14 exists) or a synthetic fixture (until
// then). Keeping the pipeline's own input Graph-agnostic is what lets it
// be fully built and tested now: nothing downstream of this type cares
// where the message came from.
export interface NormalizedAttachment {
  filename: string;
  declaredContentType: string;
  sizeBytes: number;
  /** Raw bytes -- from Graph's attachment API in real ingestion, from a test fixture buffer for now. */
  content: Buffer;
  /** Graph's own isInline flag -- true for a signature logo referenced via cid: in the HTML body, not a "real" attachment. */
  isInline: boolean;
}

export interface NormalizedMessage {
  graphMessageId: string;
  internetMessageId: string;
  conversationId: string;
  fromAddress: string;
  fromName: string;
  toRecipients: string[];
  ccRecipients: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  receivedAt: Date;
  /** §7.3: "headers containing Auto-Submitted: auto-* or X-Auto-Response-Suppress create no ticket." */
  internetMessageHeaders: { name: string; value: string }[];
  attachments: NormalizedAttachment[];
}
