# ADR-0003 — Microsoft Graph rather than SendGrid, and the distribution group migration

**Status:** Accepted · 2026-09-15

**Context.** The original design used SendGrid inbound parse, which requires redirecting MX records for the domain. `humanresources@tascopetroleum.com.au` turned out to be a distribution group, not a mailbox.

**Decision.** Ingestion and outbound both use Microsoft Graph against a shared mailbox. No MX changes. The distribution group is replaced by a shared mailbox in three phases: (1) create `hrtickets@` and add it as a member of the existing group; (2) remove the individual members at go-live; (3) move the `humanresources@` address onto the shared mailbox out of hours.

**Why Graph.** Mail stays in Exchange as an independent system of record, attachments arrive natively, replies send from the real address and thread correctly, and no DNS surgery is required. A third-party relay for HR correspondence also reopens the data-residency question settled in ADR-0001.

**Why three phases.** A distribution group has no mailbox and cannot be converted — it must be replaced. A direct swap creates a bounce window and an unrecoverable address gap. Phase 1 is zero-risk and reversible by removing one group member; phase 2 is what actually forces adoption; phase 3 is required, not cosmetic, because until it happens outbound replies come from the wrong address.

**Rejected:** SendGrid with MX redirection; creating a new public address and retraining senders. The second fails because recruiters, insurers, super funds, WorkCover and every historical signature block will keep using the old address regardless.

**Consequence.** Phase 2 is the adoption mechanism. Removing personal delivery is what stops staff working the queue from Outlook — see ADR-0009's cousin, the explicit decision *not* to police that behaviour in code.
