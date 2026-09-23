import { htmlToText } from "html-to-text";

// Real bug, found 2026-09-23 via John's own live use: lib/graph/client.ts
// used to hardcode bodyText to "" on the theory it'd be "derived at render
// time" -- nothing ever did, and the ticket detail page's correspondence
// thread only ever rendered bodyText, never bodyHtml. Every real ingested
// email showed staff nothing but the header line. Graph gives HTML
// (Outlook doesn't reliably populate a plain-text body on its own), so
// it's converted here.
export function emailHtmlToText(html: string): string {
  if (!html.trim()) return "";
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
    ],
  }).trim();
}

/**
 * What to actually display/export for a message body. Ingestion now
 * populates bodyText correctly going forward (see emailHtmlToText above),
 * but real tickets ingested before that fix (2026-09-23) already have an
 * empty bodyText permanently stored, with the real content only ever
 * having been captured correctly in bodyHtml. Deriving on the fly here
 * fixes those existing tickets immediately -- no backfill migration
 * needed -- and is a harmless no-op once bodyText is populated normally.
 */
export function messageDisplayText(message: { bodyText: string | null; bodyHtml: string | null }): string {
  if (message.bodyText && message.bodyText.trim()) return message.bodyText;
  return emailHtmlToText(message.bodyHtml ?? "");
}
