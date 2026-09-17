# ADR-0010 — Manual ticket creation, open to all staff

**Status:** Accepted · 2026-09-16

**Context.** The specification described tickets as created by email ingestion only. HR receives requests by phone, in person and in corridor conversations.

**Decision.** `POST /api/tickets` and `/tickets/new`, available to **any signed-in staff member with no role gate** — the same posture as self-claiming from the Pool. Lands as NEW, unassigned, in the Pool. First message stored `direction: INBOUND`, `message_type: MANUAL`. Priority is chosen explicitly by the creator, defaulting to P3, not keyword-classified. `TICKET_CREATED` is audit-logged with the real creator as actor, unlike ingestion which uses the seeded system user.

**Why no role gate.** Every signed-in user of this application is Tasco HR staff; there is no requester portal. A role gate would mean an officer who takes a phone call has to ask someone else to record it, which guarantees it gets recorded nowhere.

**Why explicit priority rather than classification.** Someone describing a request they have just heard knows its urgency better than a subject-line heuristic does.

**Consequence and required control.** The requester email address is typed by staff and becomes the destination for every subsequent allocation and outcome email about a real employee matter. A transposed character sends HR correspondence to a stranger. The create form must show the entered address back for explicit confirmation.

**Related.** Ticket numbering, SLA and retention derivation are shared with the ingestion path from a single module, so the two cannot drift.
