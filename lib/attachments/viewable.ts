// In-browser viewing of attachments (John, 2026-10-19). Only formats the
// browser renders without running anything of the file's own -- never
// HTML/SVG/XML, which could execute script inline on the app's origin.
// The server decides from the file's own magic bytes (detectContentType),
// not the sender's declared type; the page uses detectedContentType only
// to decide whether to show the View link.
export const VIEWABLE_CONTENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif"];

export function isViewableType(contentType: string | null | undefined): boolean {
  return !!contentType && VIEWABLE_CONTENT_TYPES.includes(contentType.toLowerCase());
}
