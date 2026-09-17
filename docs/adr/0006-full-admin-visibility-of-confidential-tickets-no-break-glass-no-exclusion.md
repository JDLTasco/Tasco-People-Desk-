# ADR-0006 — Full ADMIN visibility of confidential tickets; no break-glass, no exclusion

**Status:** Accepted · 2026-09-16

**Context.** Two related proposals were put to the operator: excluding a named ADMIN from an individual confidential ticket, and a break-glass mechanism requiring a stated reason before an ADMIN views one.

**Decision.** Both rejected. JDL and RGL have unrestricted visibility of every ticket. No reason, no warning, no step-up re-authentication merely to view. Every view writes `CONFIDENTIAL_TICKET_VIEWED` with an `access_basis` of ASSIGNEE, ACL_GRANTED, HR_LEAD or ADMIN.

**Why.** Tasco is a private company and the operator's stated governance position is full transparency — "warts and all". Break-glass friction for users who are legitimately authorised is theatre: it does not prevent access, it just produces a worse audit trail and trains people to click through warnings. The audit record is the control.

**The condition attached.** Whistleblower disclosures go to a separate dedicated address under Tasco's whistleblower policy. Statutory protections attach to a disclosure made to an eligible recipient regardless of which address it arrives at, so a misdirected disclosure landing in the HR mailbox is still protected and will sit where both ADMINs can read it. §9.2 of the spec defines the mandatory redirection procedure. This decision is only sound while that separate channel exists and is published where employees will find it.

**Consequence.** Access logging is wired into the ticket loader itself, not behind a UI action, so it cannot be bypassed by reaching the record another way.
