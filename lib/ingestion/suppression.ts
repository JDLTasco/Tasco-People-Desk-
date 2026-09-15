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
