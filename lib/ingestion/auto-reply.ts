// Auto-reply detection (§7.3 step 2). The spec's original text also named
// bare presence of X-Auto-Response-Suppress as a signal, but real traffic
// (found via the 2026-09-23 mailbox smoke test, see STATUS.md) proved that
// wrong: Outlook/Exchange Online attaches X-Auto-Response-Suppress (e.g.
// "DR, OOF, AutoReply") to essentially every normal human-composed outbound
// message -- it tells the RECIPIENT's system "don't auto-reply back to me,"
// it is not a claim that this message itself is auto-generated. Checking it
// caused every real inbound email in the smoke test to be silently
// discarded. Auto-Submitted (RFC 3834) is the header actually designed to
// mark a message as auto-generated, and is what real Exchange-generated
// auto-replies/NDRs/vacation responders set on themselves -- it alone is
// the reliable signal.
export function isAutoReply(headers: { name: string; value: string }[]): boolean {
  return headers.some((h) => {
    const name = h.name.toLowerCase();
    if (name === "auto-submitted") {
      return h.value.toLowerCase().startsWith("auto-");
    }
    return false;
  });
}
