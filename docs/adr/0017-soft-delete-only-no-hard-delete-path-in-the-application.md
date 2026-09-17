# ADR-0017 — Soft delete only; no hard delete path in the application

**Status:** Accepted · 2026-09-16

**Context.** The original request was for an administrator password permitting archive amendments and deletions.

**Decision.** Soft delete only — ADMIN, step-up re-authentication, mandatory reason. Removed from every view except the ADMIN Deleted list. Blob artefacts are never removed. **There is no hard-delete path in the application at all.** Hard deletion happens only via the scheduled retention purge at seven years.

**Why.** A seven-year retention obligation and an administrator who can empty the archive on demand are in direct tension. If the archive can be destroyed at will, it is not an archive. Soft delete gives the practical ability to fix mistakes without creating a "someone deleted the file" scenario nobody can answer for.

**Why the Deleted view is a list, not a drill-down.** The ticket loader excludes deleted tickets from every view, including that one. The spec asks for a list of what was deleted, by whom, when and why — not a working way to read deleted content.

**Consequence.** Soft-deleted tickets are **still purged on the normal schedule** unless under legal hold. Soft delete is not a retention override; legal hold is. Do not "fix" the purge job to skip soft-deleted rows.
