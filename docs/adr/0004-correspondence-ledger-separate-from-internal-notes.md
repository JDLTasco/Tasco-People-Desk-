# ADR-0004 — Correspondence ledger separate from internal notes

**Status:** Accepted · 2026-09-15

**Context.** An earlier design appended inbound email replies to `ticket_notes`, the same table holding staff commentary.

**Decision.** `ticket_messages` holds all correspondence, inbound and outbound. `ticket_notes` holds internal staff notes only. `email_log` is demoted to delivery telemetry, never displayed and never archived.

**Why.** Conflating a requester's own words with internal staff assessment corrupts the seven-year record and makes the privacy problem in ADR-0005 much harder to solve safely. They are different things with different audiences and different disclosure risk.

**Consequence.** The archive writer must interleave two sources chronologically, using the per-direction timestamp rule. Do not reintroduce a database-level `ORDER BY received_at` — outbound messages have no `received_at`, Postgres sorts nulls last, and every automated email sinks to the bottom of the thread. This was a real fielded defect.
