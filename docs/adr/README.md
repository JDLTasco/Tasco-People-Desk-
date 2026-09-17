# TASCO HR Ticketing — Architecture Decision Records

**Issued:** 16 September 2026, alongside Build Specification v1.4

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
| [0001](0001-azure-hosting-rather-than-render.md) | Azure hosting rather than Render | Accepted |
| [0002](0002-entra-id-sso-no-local-password-store.md) | Entra ID SSO, no local password store | Accepted |
| [0003](0003-microsoft-graph-rather-than-sendgrid-and-the-distribution-group-migration.md) | Microsoft Graph rather than SendGrid, and the distribution group migration | Accepted |
| [0004](0004-correspondence-ledger-separate-from-internal-notes.md) | Correspondence ledger separate from internal notes | Accepted |
| [0005](0005-curated-outcome-text-with-mandatory-dispatch-preview.md) | Curated outcome text with mandatory dispatch preview | Accepted |
| [0006](0006-full-admin-visibility-of-confidential-tickets-no-break-glass-no-exclusion.md) | Full ADMIN visibility of confidential tickets; no break-glass, no exclusion | Accepted |
| [0007](0007-legal-hold-overrides-retention-and-blocks-content-movement.md) | Legal hold overrides retention and blocks content movement | Accepted |
| [0008](0008-priority-methodology-urgent-p1-everything-else-provisionally-p3.md) | Priority methodology: urgent → P1, everything else provisionally P3 | Accepted |
| [0009](0009-subject-ticket-number-threading-with-no-sender-restriction.md) | Subject ticket-number threading with no sender restriction | Accepted — known risk |
| [0010](0010-manual-ticket-creation-open-to-all-staff.md) | Manual ticket creation, open to all staff | Accepted |
| [0011](0011-ticket-merging-scope-permissions-and-permanent-refusals.md) | Ticket merging: scope, permissions and permanent refusals | Accepted |
| [0012](0012-autoclose-as-a-distinct-close-reason-from-not-a-request.md) | Autoclose as a distinct close reason from "Not a request" | Accepted |
| [0013](0013-target-due-date-editable-by-all-staff.md) | Target due date editable by all staff | Accepted |
| [0014](0014-attachment-policy-zip-accepted-other-containers-blocked-fail-closed.md) | Attachment policy: `.zip` accepted, other containers blocked, fail closed | Accepted |
| [0015](0015-scan-verdicts-via-event-grid-with-blob-index-tag-reconciliation.md) | Scan verdicts via Event Grid with blob index tag reconciliation | Accepted |
| [0016](0016-append-only-audit-enforced-by-database-grant-not-application-code.md) | Append-only audit enforced by database grant, not application code | Accepted |
| [0017](0017-soft-delete-only-no-hard-delete-path-in-the-application.md) | Soft delete only; no hard delete path in the application | Accepted |
| [0018](0018-xsd-validation-in-ci-rather-than-locally.md) | XSD validation in CI rather than locally | Accepted |
| [0019](0019-pinned-dependency-versions-as-a-network-constraint-not-a-preference.md) | Pinned dependency versions as a network constraint, not a preference | Accepted |
| [0020](0020-404-rather-than-403-for-unauthorised-confidential-ticket-access.md) | 404 rather than 403 for unauthorised confidential ticket access | Accepted |
