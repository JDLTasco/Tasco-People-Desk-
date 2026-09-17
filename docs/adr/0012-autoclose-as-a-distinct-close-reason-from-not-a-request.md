# ADR-0012 — Autoclose as a distinct close reason from "Not a request"

**Status:** Accepted · 2026-09-15

**Context.** `close-autoclose` is near-identical to `close-not-a-request` — same status set, same permissions, same no-notification and no-category shape. It looks like duplicated code.

**Decision.** Keep both as separate routes with separate `close_reason` values and separate audit action names.

**Why.** "Spam" and "genuinely not an HR matter" are different things to count. Collapsing them loses the ability to distinguish inbox noise from misdirected but real correspondence, which is exactly the signal needed to tune the suppression rules in §7.0.1. Archive search gives each its own independent exclusion toggle for the same reason — an operator may want either without the other.

**Rejected:** one shared route with a reason parameter. Marginally less code, materially worse reporting.

**Explicitly deferred:** wiring Autoclose into suppression rules automatically. Autoclose stays manual-only.
