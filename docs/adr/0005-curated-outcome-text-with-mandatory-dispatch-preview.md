# ADR-0005 — Curated outcome text with mandatory dispatch preview

**Status:** Accepted · 2026-09-15

**Context.** An earlier specification had the outcome email include the full non-confidential note history automatically.

**Decision.** The outcome email contains only `outcome_for_requester`, written deliberately for the requester, plus any `REQUESTER_VISIBLE` notes the officer explicitly ticks. Sending requires passing through a preview modal showing the exact rendered message and confirming "Approve & Send Outcome". There is no path to send an outcome without it.

**Why.** HR notes routinely name other employees, record manager commentary, and sometimes contain legal advice. Automatically emailing them to a requester is a privacy breach, not a convenience — and it would have shipped.

**Rejected:** automatic note inclusion; a "send without preview" option for speed.

**Consequence.** Outcome dispatch has deliberate friction. This is the point. The `visibility` field on notes exists solely to feed the preview's checkboxes; it never triggers automatic sending.
