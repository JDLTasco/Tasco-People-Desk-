# ADR-0009 — Subject ticket-number threading with no sender restriction

**Status:** Accepted · 2026-09-16 · **Known and accepted risk**

**Context.** Graph's `conversation_id` is the primary threading mechanism, but it fails when a requester composes a fresh email rather than replying, or when their client breaks the conversation chain. Outbound emails already carry the ticket number in the subject as `[TICKETNO]`.

**Decision.** When `conversation_id` finds no match, fall back to extracting a bracketed 12-digit ticket number from the subject and threading onto that ticket if it exists and is not ARCHIVED. **Matching is not restricted to the ticket's own requester or CC list.** Any sender whose subject carries a live ticket number is threaded onto it.

**Why this is recorded rather than fixed.** The question was put to the operator explicitly before any code was written, and the unrestricted option was chosen deliberately. It is not an oversight, and it should not be "corrected" by a future session that notices it.

**The actual exposure.** The ticket number is a predictable `YYMMDDHHMM`+sequence string, so it is a de facto write key into any live ticket's correspondence. This grants **no additional view access** — §9's confidential ACL still gates who can read the result. The exposure is data integrity (wrong content attributed to a thread), not confidentiality.

**Rejected:** restricting subject matching to the ticket's requester and CC recipients. Rejected because it would break the common legitimate case of a colleague or third party (a payroll provider, an insurer) replying into an existing matter.

**Consequence.** Revisit if spurious threading occurs in practice. The mitigation, if needed, is a sender allowlist per ticket rather than abandoning the fallback.
