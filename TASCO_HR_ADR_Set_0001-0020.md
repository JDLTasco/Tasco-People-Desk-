# TASCO HR Ticketing — Architecture Decision Records

**Issued:** 16 September 2026, alongside Build Specification v1.4
**Instruction:** split this file into `/docs/adr/NNNN-slug.md`, one file per record, preserving the content exactly. Add `/docs/adr/README.md` containing the index below and the governance rules.

---

## Governance

Three documents, three jobs. Confusing them is how they drift.

| Document | Role | Binding on Claude Code? |
|---|---|---|
| `TASCO_HR_Ticketing_Build_Spec_v1.x.md` | **Normative.** What the system does and must do | **Yes — the only binding document** |
| `/docs/adr/` | **Rationale.** Why a decision was made, what was rejected | No. Explanatory only |
| `STATUS.md` | **Build log.** Chronological record of what was built when | No |

Rules:

1. **An ADR never introduces a requirement.** If a decision needs to change system behaviour, the specification changes and the ADR explains why. An ADR that contains a requirement not in the spec is a defect in the ADR.
2. **ADRs are immutable once accepted.** Do not edit an accepted record. Supersede it with a new one and mark the old `Superseded by ADR-NNNN`.
3. **An ADR earns its place when the decision looks like a defect to someone reading the code cold.** Obvious decisions do not need one.
4. Every ADR states what was **rejected**, not only what was chosen. The rejected option is usually the one someone will later propose as an improvement.

## Index

| ADR | Title | Status |
|---|---|---|
| 0001 | Azure hosting rather than Render | Accepted |
| 0002 | Entra ID SSO, no local password store | Accepted |
| 0003 | Microsoft Graph rather than SendGrid, and the distribution group migration | Accepted |
| 0004 | Correspondence ledger separate from internal notes | Accepted |
| 0005 | Curated outcome text with mandatory dispatch preview | Accepted |
| 0006 | Full ADMIN visibility of confidential tickets; no break-glass, no exclusion | Accepted |
| 0007 | Legal hold overrides retention and blocks content movement | Accepted |
| 0008 | Priority methodology: urgent → P1, everything else provisionally P3 | Accepted |
| 0009 | Subject ticket-number threading with no sender restriction | Accepted — known risk |
| 0010 | Manual ticket creation, open to all staff | Accepted |
| 0011 | Ticket merging: scope, permissions and permanent refusals | Accepted |
| 0012 | Autoclose as a distinct close reason from "Not a request" | Accepted |
| 0013 | Target due date editable by all staff | Accepted |
| 0014 | Attachment policy: `.zip` accepted, other containers blocked, fail closed | Accepted |
| 0015 | Scan verdicts via Event Grid with blob index tag reconciliation | Accepted |
| 0016 | Append-only audit enforced by database grant, not application code | Accepted |
| 0017 | Soft delete only; no hard delete path in the application | Accepted |
| 0018 | XSD validation in CI rather than locally | Accepted |
| 0019 | Pinned dependency versions as a network constraint, not a preference | Accepted |
| 0020 | 404 rather than 403 for unauthorised confidential ticket access | Accepted |

---

# ADR-0001 — Azure hosting rather than Render

**Status:** Accepted · 2026-09-15

**Context.** Tasco's other internal applications (BSC, Depot Control, Carriers fleet, FMI) run on Next.js + PostgreSQL + Render.com. The HR ticketing system was originally scaffolded for the same stack. Consistency across the suite has real value: one deployment model, one set of habits, one thing to maintain.

**Decision.** HR ticketing hosts on Azure App Service inside Tasco's own tenant, breaking stack consistency with the rest of the suite.

**Why.** HR tickets contain grievances, disciplinary matters, pay disputes and medical-related leave. Hosting that on a US-based third-party PaaS with a third-party mail relay fails any serious internal privacy review and is awkward to defend if breached or subpoenaed. The data-residency and governance argument outweighs suite consistency for this application specifically.

**Rejected:** keeping Render for consistency. Rejected on data classification, not on technical merit — Render is fine for tank dips and fleet records.

**Consequence.** This application diverges from the rest of the suite. That is intentional and is not a reason to migrate it back or to migrate the others to Azure.

---

# ADR-0002 — Entra ID SSO, no local password store

**Status:** Accepted · 2026-09-15

**Context.** The original request was for per-user portal passwords with an administrator who adds and removes users.

**Decision.** Authentication is Microsoft Entra ID SSO. Roles derive from Entra security group membership. There is no local credential store anywhere in the system.

**Why.** A second credential store next to one that already exists is strictly worse: it lacks MFA, conditional access, password reset and lockout, and — critically — offboarding. When someone leaves Tasco, IT disables their Entra account and they lose email, Teams and SharePoint immediately. A local password would still work until someone remembered the HR portal existed. Storing password hashes also transfers breach liability to this application for no gain. The administrative workflow the operator wanted is unchanged: adding a user is adding them to a security group.

**Rejected:** local usernames and passwords; a hybrid with local fallback. For a non-Tasco user, the answer is an Entra B2B guest invitation, never a local account.

**Consequence.** The system cannot be used by anyone without a Tasco Entra identity. Accepted — there is no requester portal by design.

---

# ADR-0003 — Microsoft Graph rather than SendGrid, and the distribution group migration

**Status:** Accepted · 2026-09-15

**Context.** The original design used SendGrid inbound parse, which requires redirecting MX records for the domain. `humanresources@tascopetroleum.com.au` turned out to be a distribution group, not a mailbox.

**Decision.** Ingestion and outbound both use Microsoft Graph against a shared mailbox. No MX changes. The distribution group is replaced by a shared mailbox in three phases: (1) create `hrtickets@` and add it as a member of the existing group; (2) remove the individual members at go-live; (3) move the `humanresources@` address onto the shared mailbox out of hours.

**Why Graph.** Mail stays in Exchange as an independent system of record, attachments arrive natively, replies send from the real address and thread correctly, and no DNS surgery is required. A third-party relay for HR correspondence also reopens the data-residency question settled in ADR-0001.

**Why three phases.** A distribution group has no mailbox and cannot be converted — it must be replaced. A direct swap creates a bounce window and an unrecoverable address gap. Phase 1 is zero-risk and reversible by removing one group member; phase 2 is what actually forces adoption; phase 3 is required, not cosmetic, because until it happens outbound replies come from the wrong address.

**Rejected:** SendGrid with MX redirection; creating a new public address and retraining senders. The second fails because recruiters, insurers, super funds, WorkCover and every historical signature block will keep using the old address regardless.

**Consequence.** Phase 2 is the adoption mechanism. Removing personal delivery is what stops staff working the queue from Outlook — see ADR-0009's cousin, the explicit decision *not* to police that behaviour in code.

---

# ADR-0004 — Correspondence ledger separate from internal notes

**Status:** Accepted · 2026-09-15

**Context.** An earlier design appended inbound email replies to `ticket_notes`, the same table holding staff commentary.

**Decision.** `ticket_messages` holds all correspondence, inbound and outbound. `ticket_notes` holds internal staff notes only. `email_log` is demoted to delivery telemetry, never displayed and never archived.

**Why.** Conflating a requester's own words with internal staff assessment corrupts the seven-year record and makes the privacy problem in ADR-0005 much harder to solve safely. They are different things with different audiences and different disclosure risk.

**Consequence.** The archive writer must interleave two sources chronologically, using the per-direction timestamp rule. Do not reintroduce a database-level `ORDER BY received_at` — outbound messages have no `received_at`, Postgres sorts nulls last, and every automated email sinks to the bottom of the thread. This was a real fielded defect.

---

# ADR-0005 — Curated outcome text with mandatory dispatch preview

**Status:** Accepted · 2026-09-15

**Context.** An earlier specification had the outcome email include the full non-confidential note history automatically.

**Decision.** The outcome email contains only `outcome_for_requester`, written deliberately for the requester, plus any `REQUESTER_VISIBLE` notes the officer explicitly ticks. Sending requires passing through a preview modal showing the exact rendered message and confirming "Approve & Send Outcome". There is no path to send an outcome without it.

**Why.** HR notes routinely name other employees, record manager commentary, and sometimes contain legal advice. Automatically emailing them to a requester is a privacy breach, not a convenience — and it would have shipped.

**Rejected:** automatic note inclusion; a "send without preview" option for speed.

**Consequence.** Outcome dispatch has deliberate friction. This is the point. The `visibility` field on notes exists solely to feed the preview's checkboxes; it never triggers automatic sending.

---

# ADR-0006 — Full ADMIN visibility of confidential tickets; no break-glass, no exclusion

**Status:** Accepted · 2026-09-16

**Context.** Two related proposals were put to the operator: excluding a named ADMIN from an individual confidential ticket, and a break-glass mechanism requiring a stated reason before an ADMIN views one.

**Decision.** Both rejected. JDL and RGL have unrestricted visibility of every ticket. No reason, no warning, no step-up re-authentication merely to view. Every view writes `CONFIDENTIAL_TICKET_VIEWED` with an `access_basis` of ASSIGNEE, ACL_GRANTED, HR_LEAD or ADMIN.

**Why.** Tasco is a private company and the operator's stated governance position is full transparency — "warts and all". Break-glass friction for users who are legitimately authorised is theatre: it does not prevent access, it just produces a worse audit trail and trains people to click through warnings. The audit record is the control.

**The condition attached.** Whistleblower disclosures go to a separate dedicated address under Tasco's whistleblower policy. Statutory protections attach to a disclosure made to an eligible recipient regardless of which address it arrives at, so a misdirected disclosure landing in the HR mailbox is still protected and will sit where both ADMINs can read it. §9.2 of the spec defines the mandatory redirection procedure. This decision is only sound while that separate channel exists and is published where employees will find it.

**Consequence.** Access logging is wired into the ticket loader itself, not behind a UI action, so it cannot be bypassed by reaching the record another way.

---

# ADR-0007 — Legal hold overrides retention and blocks content movement

**Status:** Accepted · 2026-09-16

**Context.** Records are purged at seven years from request date. Some records become relevant to litigation, Fair Work, WorkCover or regulatory matters and must not be destroyed on schedule.

**Decision.** ADMIN-only legal hold, step-up re-authentication and mandatory reason both ways, audit-logged. While active: the retention purge excludes the ticket entirely; soft-delete is blocked (409); merging is blocked in either direction (409). Archive amendment remains available, because the versioned-alongside mechanism never overwrites an original.

**Why the merge block.** Merging moves messages, notes and attachments off the source ticket. Doing that to a held ticket empties the held record — the precise outcome a hold exists to prevent, reached through a side door the soft-delete block does not cover. This was a real gap between the merge feature and the legal hold feature, neither of which was wrong in isolation.

**Why soft-delete is blocked but amendment is not.** Deleting a record under hold is spoliation. Amending it, with the original preserved as a separate versioned artefact and both states in the audit log, is correction with a full trail.

**Consequence.** A hold that nobody reviews becomes indefinite retention of personal data, which is a records problem in its own right. The Admin legal holds view sorts oldest first and flags holds over twelve months for review. That view is not decoration.

---

# ADR-0008 — Priority methodology: urgent → P1, everything else provisionally P3

**Status:** Accepted · 2026-09-16 · Supersedes the rule in Spec v1.3 §7.3

**Context.** The original classifier read the subject line: "urgent" → P1, "action" → P2, otherwise P3. The operator asked that a non-urgent ticket's real priority be determined at allocation by the officer picking it up, rather than guessed from a keyword. P3's SLA was separately changed from 336 hours (14 days) to 720 hours (30 days).

**Decision.** Subject contains "urgent" (case-insensitive) → P1. Everything else → P3. The "action" → P2 rule is removed. P2 is reachable only by manual amendment via the priority selector on the ticket.

**Why P3 and not null.** `priority` and `sla_due_at` are both NOT NULL, and every overdue, escalation and list calculation depends on `sla_due_at` existing from the moment of creation. "Determined at allocation" cannot mean the column stays empty until then. P3 — the most generous clock — is the safe provisional default.

**Rejected:** P2 as the provisional default; a nullable priority with allocation blocked until it is set.

**Consequence, stated plainly.** The default escalation clock for almost every ticket is now 30 days, and nothing auto-classifies as P2. The SLA safety net is materially looser than it was and depends on officers setting priority at allocation rather than on the system catching neglect. If that proves wrong in practice, the fix is P2 as the provisional default, not a return to keyword classification.

**Related.** The SLA hours table previously existed in four places, including a presentational copy in the email templates, and the copies drifted. It now exists in exactly one module.

---

# ADR-0009 — Subject ticket-number threading with no sender restriction

**Status:** Accepted · 2026-09-16 · **Known and accepted risk**

**Context.** Graph's `conversation_id` is the primary threading mechanism, but it fails when a requester composes a fresh email rather than replying, or when their client breaks the conversation chain. Outbound emails already carry the ticket number in the subject as `[TICKETNO]`.

**Decision.** When `conversation_id` finds no match, fall back to extracting a bracketed 12-digit ticket number from the subject and threading onto that ticket if it exists and is not ARCHIVED. **Matching is not restricted to the ticket's own requester or CC list.** Any sender whose subject carries a live ticket number is threaded onto it.

**Why this is recorded rather than fixed.** The question was put to the operator explicitly before any code was written, and the unrestricted option was chosen deliberately. It is not an oversight, and it should not be "corrected" by a future session that notices it.

**The actual exposure.** The ticket number is a predictable `YYMMDDHHMM`+sequence string, so it is a de facto write key into any live ticket's correspondence. This grants **no additional view access** — §9's confidential ACL still gates who can read the result. The exposure is data integrity (wrong content attributed to a thread), not confidentiality.

**Rejected:** restricting subject matching to the ticket's requester and CC recipients. Rejected because it would break the common legitimate case of a colleague or third party (a payroll provider, an insurer) replying into an existing matter.

**Consequence.** Revisit if spurious threading occurs in practice. The mitigation, if needed, is a sender allowlist per ticket rather than abandoning the fallback.

---

# ADR-0010 — Manual ticket creation, open to all staff

**Status:** Accepted · 2026-09-16

**Context.** The specification described tickets as created by email ingestion only. HR receives requests by phone, in person and in corridor conversations.

**Decision.** `POST /api/tickets` and `/tickets/new`, available to **any signed-in staff member with no role gate** — the same posture as self-claiming from the Pool. Lands as NEW, unassigned, in the Pool. First message stored `direction: INBOUND`, `message_type: MANUAL`. Priority is chosen explicitly by the creator, defaulting to P3, not keyword-classified. `TICKET_CREATED` is audit-logged with the real creator as actor, unlike ingestion which uses the seeded system user.

**Why no role gate.** Every signed-in user of this application is Tasco HR staff; there is no requester portal. A role gate would mean an officer who takes a phone call has to ask someone else to record it, which guarantees it gets recorded nowhere.

**Why explicit priority rather than classification.** Someone describing a request they have just heard knows its urgency better than a subject-line heuristic does.

**Consequence and required control.** The requester email address is typed by staff and becomes the destination for every subsequent allocation and outcome email about a real employee matter. A transposed character sends HR correspondence to a stranger. The create form must show the entered address back for explicit confirmation.

**Related.** Ticket numbering, SLA and retention derivation are shared with the ingestion path from a single module, so the two cannot drift.

---

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

---

# ADR-0012 — Autoclose as a distinct close reason from "Not a request"

**Status:** Accepted · 2026-09-15

**Context.** `close-autoclose` is near-identical to `close-not-a-request` — same status set, same permissions, same no-notification and no-category shape. It looks like duplicated code.

**Decision.** Keep both as separate routes with separate `close_reason` values and separate audit action names.

**Why.** "Spam" and "genuinely not an HR matter" are different things to count. Collapsing them loses the ability to distinguish inbox noise from misdirected but real correspondence, which is exactly the signal needed to tune the suppression rules in §7.0.1. Archive search gives each its own independent exclusion toggle for the same reason — an operator may want either without the other.

**Rejected:** one shared route with a reason parameter. Marginally less code, materially worse reporting.

**Explicitly deferred:** wiring Autoclose into suppression rules automatically. Autoclose stays manual-only.

---

# ADR-0013 — Target due date editable by all staff

**Status:** Accepted · 2026-09-16 · Amends Spec v1.3 §5

**Context.** The specification named "the assignee, HR_LEAD or ADMIN" for target due dates, matching every other metadata field. The operator asked that it be open to all staff.

**Decision.** `PATCH /api/tickets/[id]` checks permission **per field group**. Subject, priority, category, business unit and CC require `canActOnAssignedTicket`. `target_due_at` and `target_due_reason` require only a valid session.

**Why.** A deadline someone else knows about is more useful recorded than withheld — if a colleague knows a WorkCover response is due Friday, the system should capture it without a permission negotiation. Every signed-in user is HR staff; there is no requester portal, so "all staff" is a bounded and trusted set.

**Consequence.** This is the only split-permission field group in the application, and it will look like an authorisation bug to someone reading the route. It is not. `target_due_reason` remains mandatory whenever a date is set, and both changes are audit-logged.

---

# ADR-0014 — Attachment policy: `.zip` accepted, other containers blocked, fail closed

**Status:** Accepted · 2026-09-16

**Context.** A proposal was made to treat `.zip`, `.rar`, `.iso` and `.img` conservatively as a group.

**Decision.** Executable extensions are blocked outright. `.iso .img .vhd .vhdx .rar .7z .cab .ace` are blocked outright. **`.zip` is accepted**, stored and quarantined until Defender returns CLEAN. Extension checks are backed by magic-byte content sniffing; a mismatch is `BLOCKED` with reason `TYPE_MISMATCH`. Server-side archive extraction is forbidden anywhere in the codebase.

**Why `.zip` is different.** Law firms, recruiters, insurers and payroll providers routinely send zipped document packs. Blocking them would generate daily friction and push correspondence back to personal inboxes, defeating the whole system. The other container formats have essentially no legitimate HR use and are standard malware delivery vehicles.

**Why no server-side extraction.** Zip bombs and path traversal during extraction are a larger exposure than the threat being addressed. Archives are stored whole, scanned whole, downloaded whole.

**Fail closed.** PENDING, BLOCKED, MALICIOUS and scan timeout all mean not downloadable. The default is never CLEAN. Defender is the primary control; extension and type checks are supporting controls, not the security boundary.

---

# ADR-0015 — Scan verdicts via Event Grid with blob index tag reconciliation

**Status:** Accepted · 2026-09-16

**Context.** Attachments are written `PENDING`. Nothing in the original design ever cleared that status, which would have left every attachment permanently undownloadable in production. Defender surfaces verdicts four ways: blob index tag, Event Grid message, Log Analytics entry, or a security alert.

**Decision.** Event Grid webhook to `/api/scan/notifications` as primary, with `attachment-scan-reconcile` reading the blob index tag every 15 minutes as a safety net. Anything PENDING beyond 60 minutes becomes BLOCKED with reason `SCAN_TIMEOUT` and raises an alert.

**Why two mechanisms.** The same reason Graph ingestion has a webhook and a delta poller: event delivery drops, and a silently stuck attachment fails invisibly. The duplication is deliberate, not redundant.

**Rejected:** Log Analytics (higher latency, designed for audit rather than automation); security alerts alone (only fire on malicious verdicts, so nothing ever clears to CLEAN).

**Three infrastructure constraints that break this silently.** The storage account must be standard GPv2 with **hierarchical namespace disabled** — index tags are unsupported with HNS enabled, so turning on ADLS Gen2 removes the reconciliation path. The Event Grid topic must allow public network access; topics reachable only via private endpoint are unsupported for scan-result delivery. The Defender service principal needs EventGrid Data Sender on the topic.

**One operational rule.** Set all blob metadata in the write options at upload time. Updating metadata shortly after upload can cause the on-upload scan to fail.

---

# ADR-0016 — Append-only audit enforced by database grant, not application code

**Status:** Accepted · 2026-09-15

**Context.** `audit_log` must be append-only. The obvious implementation is to simply never write update or delete code.

**Decision.** The application's Postgres role (`app_role`) holds INSERT and SELECT on `audit_log` and nothing else. No UPDATE grant, no DELETE grant. Enforced in a migration.

**Why.** Application-level discipline fails the moment someone writes a well-meaning cleanup script, or an ORM helper does something clever. A missing grant fails loudly at the database regardless of what the calling code intended.

**Consequence.** `AuditLog.ticket`'s foreign key is `ON DELETE SET NULL`, which looks like a Prisma default nobody thought about. It is load-bearing: it is what allows the retention purge's own audit record — written *before* the delete — to survive destruction of the ticket row it references. Do not tighten it to CASCADE or RESTRICT.

---

# ADR-0017 — Soft delete only; no hard delete path in the application

**Status:** Accepted · 2026-09-16

**Context.** The original request was for an administrator password permitting archive amendments and deletions.

**Decision.** Soft delete only — ADMIN, step-up re-authentication, mandatory reason. Removed from every view except the ADMIN Deleted list. Blob artefacts are never removed. **There is no hard-delete path in the application at all.** Hard deletion happens only via the scheduled retention purge at seven years.

**Why.** A seven-year retention obligation and an administrator who can empty the archive on demand are in direct tension. If the archive can be destroyed at will, it is not an archive. Soft delete gives the practical ability to fix mistakes without creating a "someone deleted the file" scenario nobody can answer for.

**Why the Deleted view is a list, not a drill-down.** The ticket loader excludes deleted tickets from every view, including that one. The spec asks for a list of what was deleted, by whom, when and why — not a working way to read deleted content.

**Consequence.** Soft-deleted tickets are **still purged on the normal schedule** unless under legal hold. Soft delete is not a retention override; legal hold is. Do not "fix" the purge job to skip soft-deleted rows.

---

# ADR-0018 — XSD validation in CI rather than locally

**Status:** Accepted · 2026-09-16

**Context.** The acceptance test requires `ticket.xml` to validate against the committed XSD. The local development environment has no XSD validator — no `xmllint`, no `lxml` — and Tasco's network gateway blocks the binaries needed to install one. The interim check was a hand-written balanced-tag test.

**Decision.** Real XSD validation runs in the GitHub Actions pipeline, where hosted runners provide `xmllint` and Tasco's gateway does not apply. Delivered at Stage 8.

**Why this matters.** Well-formed and valid are not the same thing, and a balanced-tag check proves neither structure nor types. Until CI validation exists, that acceptance test is not passing regardless of what the local suite reports.

**Rejected:** adding a JavaScript XSD validator as a dependency (none is credible and it would be a second new dependency); dropping the XSD (the archive's machine-readability after database purge is the reason it exists).

---

# ADR-0019 — Pinned dependency versions as a network constraint, not a preference

**Status:** Accepted · 2026-09-15

**Context.** Several dependencies are pinned to versions that look stale.

**Decision and reasons, individually:**

- **Prisma 6.19.3.** Tasco's gateway blocks executable downloads, so the Prisma CLI cannot fetch its engine binaries. The local machine uses binaries copied from a sibling project, with environment variables pointing at them. **Upgrading breaks the local toolchain** — the new version's engine commit hash will not match the cache and a fresh download hits the same block. Any upgrade requires sourcing matching binaries off-network first.
- **`archiver` 6.0.2, not 8.x.** Version 8 is ESM-only with a conditional exports map Next.js 14's webpack cannot resolve. The failure takes down every route in the dev server, not just the export route.
- **Node's built-in test runner via `tsx`, not Vitest.** Vitest's Rollup dependency needs a native binary blocked by the same gateway rule. `vitest.config.ts` remains in the repo as an inert placeholder; do not resurrect it without solving the binary problem first.

**Consequence.** These are environment workarounds, not engineering preferences, and they are machine-specific rather than portable. GitHub Actions runners sit outside Tasco's network and have none of these constraints, which makes CI the only place portability is genuinely proven. Do not "modernise" any of the above without reading this record.

---

# ADR-0020 — 404 rather than 403 for unauthorised confidential ticket access

**Status:** Accepted · 2026-09-15

**Context.** A direct API request for a confidential ticket by a user without access needs a response.

**Decision.** Return **404** with no metadata in the body. Not 403.

**Why.** A 403 confirms the ticket exists. Given ticket numbers are predictable `YYMMDDHHMM` strings, an unauthorised user could enumerate them and learn which matters are confidential and roughly when they were raised — which is itself disclosure, and in a small HR team is often enough to infer who and what. A 404 reveals nothing.

**Consequence.** This will look like a bug to someone testing authorisation and expecting 403. It is not. Every other unauthorised access in the application correctly returns 403; confidential tickets are the deliberate exception.
