// Content-Disposition for attachment downloads/views (2026-10-20). Filenames
// come from the sender, so they can hold quotes, accents or other non-ASCII
// characters that aren't valid in a raw header value. `filename=` gets a safe
// ASCII stand-in for old browsers; `filename*=` (RFC 6266/5987) carries the
// real name, UTF-8 percent-encoded.
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "attachment";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
