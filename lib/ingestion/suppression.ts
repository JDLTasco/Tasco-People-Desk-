// Suppression matching (§7.0.1, §7.3 step 1). The rule's own type decides
// what "value" is matched against. §7.3's ordering is explicit: this check
// runs first, before anything else.
//
// Judgment call, documented rather than guessed silently: the spec names
// the rule type SUBJECT_PATTERN but never says whether "pattern" means a
// regex, a glob, or a substring. A case-insensitive substring match is the
// simplest and safest default (no regex-injection surface from
// admin-entered values) -- flag this to the operator if literal regex
// support is actually wanted later.
export interface SuppressionRule {
  id: string;
  type: "SENDER" | "DOMAIN" | "SUBJECT_PATTERN";
  value: string;
}

export function matchSuppressionRule(
  message: { fromAddress: string; subject: string },
  rules: SuppressionRule[],
): SuppressionRule | null {
  const fromLower = message.fromAddress.toLowerCase();
  const domain = fromLower.split("@")[1] ?? "";
  const subjectLower = message.subject.toLowerCase();

  for (const rule of rules) {
    const valueLower = rule.value.toLowerCase();
    if (rule.type === "SENDER" && fromLower === valueLower) return rule;
    if (rule.type === "DOMAIN" && domain === valueLower) return rule;
    if (rule.type === "SUBJECT_PATTERN" && subjectLower.includes(valueLower)) return rule;
  }
  return null;
}

// Block list admin (John, 2026-10-05): tidies an admin-entered rule value
// and refuses ones that would block far more than intended. Returns the
// value to store (lower-cased, trimmed) or an error message.
export const OWN_DOMAIN = "tascopetroleum.com.au";
const MIN_SUBJECT_LENGTH = 4;

export function normaliseSuppressionValue(
  type: SuppressionRule["type"],
  raw: string,
): { value: string } | { error: string } {
  let value = raw.trim().toLowerCase();
  if (type === "SENDER") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: "Enter a full email address, e.g. noreply@example.com" };
  } else if (type === "DOMAIN") {
    value = value.replace(/^.*@/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return { error: "Enter a domain, e.g. example.com" };
    if (value === OWN_DOMAIN || value.endsWith(`.${OWN_DOMAIN}`)) {
      return { error: `Blocking ${OWN_DOMAIN} would block every Tasco staff member -- block a single sender instead` };
    }
  } else {
    value = value.replace(/\s+/g, " ");
    if (value.length < MIN_SUBJECT_LENGTH) {
      return { error: `Subject words must be at least ${MIN_SUBJECT_LENGTH} characters, or they'd block too much` };
    }
  }
  return { value };
}
