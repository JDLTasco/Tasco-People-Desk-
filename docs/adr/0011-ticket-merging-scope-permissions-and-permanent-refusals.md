# ADR-0011 — Ticket merging: scope, permissions and permanent refusals

**Status:** Accepted · 2026-09-15, refusals finalised 2026-09-16

**Context.** Duplicate requests arrive — the same person emails twice, or emails after phoning.

**Decision.** `POST /api/tickets/[id]/merge`, permitted to the **assignee of either ticket, or HR_LEAD or ADMIN**. Both tickets are version-checked atomically in one transaction. Messages, notes and attachments are re-parented from source to target with their own timestamps untouched. CC recipients are unioned. The source is CLOSED with `close_reason = MERGED` and a pointer to the target.

**What deliberately does not move.** The source ticket's `ticket_status_history` and `audit_log` rows stay on the source. They are the record of what happened to *that* ticket, including its own merge event. Only user-facing content moves.

**Two permanent refusals.**
- **Confidential tickets, either side.** Merging relocates content across two different ACL positions and there is no correct union of them. This began as a temporary refusal pending Stage 6's confidential work; that work has landed and the refusal is now permanent by decision, not by omission.
- **Tickets under legal hold, either side.** See ADR-0007.

**Why assignee-of-either rather than HR_LEAD-only.** The person who notices a duplicate is usually the one working one of them. Routing every merge through the lead makes duplicates stay open.

**Consequence.** Content that moves to the target is retained on the *target's* seven-year clock, derived from the target's request date. A merged conversation can therefore purge on a different date from the ticket it originally arrived on. Stated so it is not later reported as a retention bug.
