# ADR-0008 — Priority methodology: urgent → P1, everything else provisionally P3

**Status:** Accepted · 2026-09-16 · Supersedes the rule in Spec v1.3 §7.3

**Context.** The original classifier read the subject line: "urgent" → P1, "action" → P2, otherwise P3. The operator asked that a non-urgent ticket's real priority be determined at allocation by the officer picking it up, rather than guessed from a keyword. P3's SLA was separately changed from 336 hours (14 days) to 720 hours (30 days).

**Decision.** Subject contains "urgent" (case-insensitive) → P1. Everything else → P3. The "action" → P2 rule is removed. P2 is reachable only by manual amendment via the priority selector on the ticket.

**Why P3 and not null.** `priority` and `sla_due_at` are both NOT NULL, and every overdue, escalation and list calculation depends on `sla_due_at` existing from the moment of creation. "Determined at allocation" cannot mean the column stays empty until then. P3 — the most generous clock — is the safe provisional default.

**Rejected:** P2 as the provisional default; a nullable priority with allocation blocked until it is set.

**Consequence, stated plainly.** The default escalation clock for almost every ticket is now 30 days, and nothing auto-classifies as P2. The SLA safety net is materially looser than it was and depends on officers setting priority at allocation rather than on the system catching neglect. If that proves wrong in practice, the fix is P2 as the provisional default, not a return to keyword classification.

**Related.** The SLA hours table previously existed in four places, including a presentational copy in the email templates, and the copies drifted. It now exists in exactly one module.
