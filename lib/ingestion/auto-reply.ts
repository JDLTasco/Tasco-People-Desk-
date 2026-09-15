// Auto-reply detection (§7.3 step 2): "headers containing Auto-Submitted:
// auto-* or X-Auto-Response-Suppress create no ticket."
export function isAutoReply(headers: { name: string; value: string }[]): boolean {
  return headers.some((h) => {
    const name = h.name.toLowerCase();
    if (name === "auto-submitted") {
      return h.value.toLowerCase().startsWith("auto-");
    }
    // Presence alone is the signal for X-Auto-Response-Suppress -- the
    // spec's own wording ("headers containing... X-Auto-Response-Suppress")
    // never conditions this on a specific value.
    if (name === "x-auto-response-suppress") {
      return true;
    }
    return false;
  });
}
