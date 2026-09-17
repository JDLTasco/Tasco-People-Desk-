# ADR-0016 — Append-only audit enforced by database grant, not application code

**Status:** Accepted · 2026-09-15

**Context.** `audit_log` must be append-only. The obvious implementation is to simply never write update or delete code.

**Decision.** The application's Postgres role (`app_role`) holds INSERT and SELECT on `audit_log` and nothing else. No UPDATE grant, no DELETE grant. Enforced in a migration.

**Why.** Application-level discipline fails the moment someone writes a well-meaning cleanup script, or an ORM helper does something clever. A missing grant fails loudly at the database regardless of what the calling code intended.

**Consequence.** `AuditLog.ticket`'s foreign key is `ON DELETE SET NULL`, which looks like a Prisma default nobody thought about. It is load-bearing: it is what allows the retention purge's own audit record — written *before* the delete — to survive destruction of the ticket row it references. Do not tighten it to CASCADE or RESTRICT.
