// Operator amendment (John, 2026-10-03): question and outcome emails can go
// to people other than the requester (e.g. the requester's manager), with
// CCs. Pure helpers shared by the modals and the routes.

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

/** "a@x.com, b@y.com; c@z.com" -> trimmed, de-duplicated (case-insensitive) list. */
export function parseRecipientList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,;\s]+/)) {
    const address = part.trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

/**
 * Validates a To + CC pair from a request body. To must have at least one
 * address; every address must look like an email. Returns the cleaned lists
 * or an error message for a 400.
 */
export function validateRecipients(
  to: unknown,
  cc: unknown,
): { ok: true; to: string[]; cc: string[] } | { ok: false; error: string } {
  if (!Array.isArray(to) || !to.every((a) => typeof a === "string")) return { ok: false, error: "toRecipients must be a list of email addresses" };
  if (!Array.isArray(cc) || !cc.every((a) => typeof a === "string")) return { ok: false, error: "ccRecipients must be a list of email addresses" };
  const toList = parseRecipientList(to.join(","));
  const ccList = parseRecipientList(cc.join(",")).filter((a) => !toList.some((t) => t.toLowerCase() === a.toLowerCase()));
  if (toList.length === 0) return { ok: false, error: "At least one To address is required" };
  const bad = [...toList, ...ccList].find((a) => !isValidEmailAddress(a));
  if (bad) return { ok: false, error: `"${bad}" is not a valid email address` };
  return { ok: true, to: toList, cc: ccList };
}
