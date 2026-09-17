# ADR-0007 — Legal hold overrides retention and blocks content movement

**Status:** Accepted · 2026-09-16

**Context.** Records are purged at seven years from request date. Some records become relevant to litigation, Fair Work, WorkCover or regulatory matters and must not be destroyed on schedule.

**Decision.** ADMIN-only legal hold, step-up re-authentication and mandatory reason both ways, audit-logged. While active: the retention purge excludes the ticket entirely; soft-delete is blocked (409); merging is blocked in either direction (409). Archive amendment remains available, because the versioned-alongside mechanism never overwrites an original.

**Why the merge block.** Merging moves messages, notes and attachments off the source ticket. Doing that to a held ticket empties the held record — the precise outcome a hold exists to prevent, reached through a side door the soft-delete block does not cover. This was a real gap between the merge feature and the legal hold feature, neither of which was wrong in isolation.

**Why soft-delete is blocked but amendment is not.** Deleting a record under hold is spoliation. Amending it, with the original preserved as a separate versioned artefact and both states in the audit log, is correction with a full trail.

**Consequence.** A hold that nobody reviews becomes indefinite retention of personal data, which is a records problem in its own right. The Admin legal holds view sorts oldest first and flags holds over twelve months for review. That view is not decoration.
