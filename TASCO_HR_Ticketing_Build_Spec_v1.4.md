# TASCO HR Ticketing System — Build Specification

**Owner:** John De Luca (JDL), CFO & Company Secretary
**Audience:** Claude Code (build agent) + Tasco M365/Azure administrator
**Version:** 1.4 — 16 September 2026
**Supersedes:** v1.0–v1.3. This document is complete and standalone. Do not refer to earlier versions.

**Build state at issue:** Stages 1–6 complete. Stage 7 (Infrastructure) is next. §14 items 0–8 all still outstanding.

**Purpose of this revision.** Stages 4–6 shipped a number of capabilities agreed directly with the operator that were never written back into the specification, and two of them amended the specification's own text. This version reconciles the document with the system that exists. Where v1.3 and the running build disagreed, the build is described here as the authoritative behaviour.

**Scope remains frozen.** §17 lists what is out of scope. Do not implement, scaffold or prepare for anything in it.

---

## 0. How to use this document

Sections 1–13 define the system. Section 14 lists tenant-level work Claude Code **cannot** perform. Section 15 is the acceptance test set. Section 16 is the build order. Section 17 is out of scope. Section 18 records superseded decisions.

Work one stage at a time.

### 0.1 Claude Code operating rules

1. **Authoritative specification.** Treat this document as fixed architecture. Do not redesign schemas, introduce new dependencies, or substitute frameworks. The stack is Next.js 14, TypeScript, Prisma, PostgreSQL, Azure App Service. Deviations require explicit operator direction and must be recorded in `STATUS.md`.
2. **Strict stage scoping.** Work only on the single stage from §16 nominated by the operator. Do not draft, scaffold or implement later stages ahead of time. Do not implement anything in §17.
3. **Pre-implementation declaration.** Before generating code or running commands, state the stage being implemented, the requirements being satisfied, and the files to be created or modified.
4. **Clarification stop.** If a requirement or edge case is ambiguous, stop and ask the operator. Never invent business logic. Never bypass or weaken security, RBAC or audit requirements to simplify an implementation.
5. **No tenant mutations.** Do not run CLI commands or write routines attempting production tenant operations — Graph admin consent, Entra group creation, Exchange cmdlets, DNS changes, Azure resource creation outside the Bicep templates. These are §14 operator tasks.
6. **Never weaken tests.** Do not disable, skip, comment out or loosen a failing test to make a suite pass. Report the failure and its cause.
7. **Migrations are forward-only.** Never reset, drop or recreate a database without explicit operator instruction.
8. **No secrets in the repo.** Key Vault plus managed identity only.
9. **Ad hoc work is recorded, then reconciled.** Capabilities agreed directly with the operator mid-stage are legitimate, but `STATUS.md` is a build log, not the specification. Any ad hoc change that alters behaviour described in this document must be flagged for a specification revision. A spec that no longer describes the system will cause a future session to "correct" working behaviour back out.

### 0.2 Persistent state ledger

Maintain a root-level `STATUS.md`, updated at the conclusion of every stage:

```markdown
# TASCO HR Ticketing — Build Status
- Current stage: [number and name]
- Last completed stage: [number]
- Passing acceptance tests: [list from §15]
- Failing / pending acceptance tests: [list]
- Architecture deviations / clarifications: [None | list of operator-approved exceptions]
- Spec reconciliation needed: [None | behaviour now differing from this document]
- Blockers / required operator actions: [list]
- Recommended next command or task: [text]
```

Every new session begins with: *"Read TASCO_HR_Ticketing_Build_Spec_v1.4.md and STATUS.md before executing commands."*

---

## 1. Purpose

Tasco Petroleum's HR department receives requests by email to `humanresources@tascopetroleum.com.au`. Requests are currently missed because there is no central record — the address is a distribution group, so each member holds their own copy and no one owns the queue.

This system converts every inbound email into a tracked ticket, allows staff to raise tickets directly for requests received by phone or in person, allocates each to a named HR officer, tracks it through a defined lifecycle, notifies the requester at controlled points, and archives the completed record for seven years in a form readable without the application.

**Explicit non-goals:** self-service employee portal, HRIS integration, payroll integration, mobile app, external (non-Tasco) user access. See §17.

---

## 2. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React Server Components | |
| ORM | Prisma 6.19.3 — **pinned** | See §2.2 |
| Database | Azure Database for PostgreSQL Flexible Server (B1ms, 32GB) | `citext` extension required |
| Hosting | Azure App Service (Linux, Node 20, B1) | Australia East |
| Attachments & archive | Azure Blob Storage, private, containers `attachments` and `hr-archive` | **Standard general-purpose v2, hierarchical namespace disabled.** See §7.3.2 |
| Malware scanning | Defender for Storage on `attachments`, results via Event Grid | §7.3.2 |
| Auth | Microsoft Entra ID via NextAuth Azure AD provider | No local passwords. §6 |
| Email in/out | Microsoft Graph | No SendGrid. No MX changes. §7 |
| Secrets | Azure Key Vault via App Service system-assigned managed identity | |
| Scheduling | Azure Logic App recurrence → authenticated HTTP call to `/api/jobs/*` | |
| Monitoring | Application Insights, with ingestion liveness alert (§12.1) | |
| CI/CD | GitHub Actions → App Service, OIDC federated credential | |

**Portal access:** `https://hr.tascopetroleum.com.au`, a custom domain on App Service, linked from a tile on the HR SharePoint page. The app is **not** embedded in SharePoint.

### 2.1 Backup and durability — mandatory

This system is the sole record of HR requests for seven years. Platform defaults are insufficient and must be configured explicitly in Bicep:

- **PostgreSQL:** geo-redundant backup enabled, point-in-time retention **35 days** (default is 7).
- **Blob Storage:** soft delete for blobs and containers, **30-day** retention. Without this, an accidental container deletion permanently destroys the archive, including records under legal hold.
- **Blob versioning** enabled on `hr-archive`.
- A restore test is part of Stage 7 acceptance. An untested backup is not a backup.

**Indicative run cost:** approximately A$70–85 per month.

### 2.2 Known environment constraints

Recorded because they are load-bearing and non-obvious:

- **Prisma is pinned to 6.19.3.** Tasco's network gateway blocks executable downloads, so the Prisma CLI cannot fetch its engine binaries. The local development machine uses binaries copied from a sibling project with `PRISMA_QUERY_ENGINE_LIBRARY` / `PRISMA_SCHEMA_ENGINE_BINARY` pointing at them. **Upgrading Prisma breaks the local toolchain** — the engine commit hash will not match and a fresh download will hit the same block. Any upgrade requires sourcing matching binaries off-network first.
- **Node's built-in test runner via `tsx`**, not Vitest. Vitest's Rollup dependency needs a native binary blocked by the same gateway rule. `vitest.config.ts` remains in the repo as an inert placeholder; do not resurrect it without re-solving the binary problem.
- **`NODE_EXTRA_CA_CERTS`** must point at the local Sophos CA PEM, which TLS-inspects HTTPS and otherwise breaks Node certificate verification. Machine-specific, untracked.
- **Local Postgres runs on host port 5433**, not 5432.
- **`archiver` is pinned to 6.0.2.** Version 8 is ESM-only with a conditional exports map that Next.js 14's webpack cannot resolve, and the failure takes down every route in the dev server, not only the export route.

GitHub Actions runners are outside Tasco's network and have none of these constraints. CI is therefore the environment where portability is genuinely proven.

---

## 3. Users and roles

Provisioned by the administrator through Entra ID security group membership.

| Initial | Role | Notes |
|---|---|---|
| RJ | HR_LEAD | Lead HR. Allocates to others; sets and clears the confidential flag |
| LF | HR_OFFICER | |
| DN | HR_OFFICER | |
| JDL | ADMIN | |
| RGL | ADMIN | Managing Director — full visibility and amendment rights |

Display names are seeded as initials only. An ADMIN sets real names through Admin → Users (§13); the system never invents them.

### Permission matrix

| Action | ADMIN | HR_LEAD | HR_OFFICER |
|---|---|---|---|
| View open pool | ✔ | ✔ | ✔ |
| **Create a ticket manually** | ✔ | ✔ | ✔ |
| Self-assign a pooled ticket | ✔ | ✔ | ✔ |
| Reassign another user's ticket | ✔ | ✔ | Own tickets only |
| Edit ticket metadata (display subject, priority, category, business unit, CC list) | ✔ | ✔ | ✔ (assigned tickets) |
| **Set or change target due date and reason** | ✔ | ✔ | **✔ (any ticket)** |
| Add internal notes | ✔ | ✔ | ✔ |
| Edit own note (creates revision) | ✔ | ✔ | ✔ |
| Draft and send outcome | ✔ | ✔ | ✔ (assigned tickets) |
| Close ticket | ✔ | ✔ | ✔ (assigned tickets) |
| "Not a request" close | ✔ | ✔ | ✔ |
| **Autoclose** | ✔ | ✔ | ✔ |
| **Merge tickets** | ✔ | ✔ | Assignee of either ticket |
| Set / clear confidential flag | ✔ | ✔ | ✘ |
| View confidential ticket | ✔ | ✔ | Only if granted |
| Set / clear legal hold | ✔ | ✘ | ✘ |
| Reverse a status transition | ✔ | ✘ | ✘ |
| Amend an archived ticket | ✔ | ✘ | ✘ |
| Soft-delete a ticket | ✔ | ✘ | ✘ |
| Manage users, roles, display names, suppression rules, categories, business units | ✔ | ✘ | ✘ |
| View audit log | ✔ | ✔ | ✘ |
| Bulk export | ✔ | ✔ | ✘ |
| View Instructions page | ✔ | ✔ | ✔ |

**Target due date is deliberately open to all staff**, unlike every other metadata field. Every signed-in user of this app is Tasco HR staff — there is no requester portal (§17) — and a deadline someone else knows about is more useful recorded than withheld. Permission is checked per field group: subject, priority, category, business unit and CC require `canActOnAssignedTicket`; target due fields require only a valid session.

Roles derive from Entra ID security group membership, resolved at sign-in and cached for the session:

- `HR-Ticketing-Admins` → ADMIN
- `HR-Ticketing-Leads` → HR_LEAD
- `HR-Ticketing-Users` → HR_OFFICER

A user in multiple groups receives the highest role. A user in no group is denied access with a clear message, not a 500.

---

## 4. Ticket lifecycle

```
NEW → ALLOCATED → IN_ACTION → OUTCOME → CLOSED → ARCHIVED
```

- `NEW` — **created either by email ingestion (§7.3) or manually by a staff member (§7.5)**, unassigned, in the open pool.
- `ALLOCATED` — assigned to a named HR officer. First entry sends the allocation email (§7.4).
- `IN_ACTION` — set manually by the assignee when work begins.
- `OUTCOME` — requester-facing resolution drafted, previewed and sent (§7.4).
- `CLOSED` — terminal working status. Sets `closed_at` and a `close_reason`. Still fully visible and ADMIN-reversible.
- `ARCHIVED` — archive artefacts written to Blob (§10). Portal view read-only except to ADMIN.

`CLOSED` and `ARCHIVED` are distinct and frequently confused. `CLOSED` is a live row that has finished its working life. `ARCHIVED` happens later, via the nightly job or ADMIN on demand, and is the point at which the durable seven-year artefacts exist.

### Permitted transitions

| From | To | Actor | Guard |
|---|---|---|---|
| NEW | ALLOCATED | Any user (self-claim) or HR_LEAD/ADMIN (assign) | — |
| ALLOCATED | IN_ACTION | Assignee, HR_LEAD, ADMIN | **`category_id` must be set** |
| IN_ACTION | OUTCOME | Assignee, HR_LEAD, ADMIN | Only via the dispatch preview (§7.4) |
| OUTCOME | CLOSED | Assignee, HR_LEAD, ADMIN | — |
| CLOSED | ARCHIVED | Automated job or ADMIN on demand | — |

Any transition not in this table is rejected with HTTP 400. The state machine is enforced server-side; the UI must not be the only guard.

### Close reasons

| Value | Meaning | Requester notified | Category required |
|---|---|---|---|
| `RESOLVED` | Normal completion via OUTCOME | Yes, at OUTCOME | Yes |
| `NOT_A_REQUEST` | Not an HR matter | No | No |
| `AUTOCLOSE` | Spam, or no action needed | No | No |
| `MERGED` | Content moved to another ticket (§7.6) | No | No |
| `REDIRECTED` | Whistleblower redirection (§9.2) | No | No |

`NOT_A_REQUEST` and `AUTOCLOSE` are available from `NEW`, `ALLOCATED` or `IN_ACTION`, set status directly to `CLOSED`, bypass all requester notification, and require no category. They are deliberately separate values rather than one: "spam" and "genuinely not an HR matter" are different things to count.

### Events that are not transitions

**First view.** Opening a ticket detail does not change status. On first open by any user, atomically set `first_viewed_at` and `first_viewed_by` if null.

**Reassignment.** `ALLOCATED` and `IN_ACTION` tickets may be reassigned without changing status. Writes `ticket_status_history` and `audit_log`. Does not re-send the allocation email to the requester; notifies the new assignee internally.

**Reversals.** ADMIN only. Any backward move requires step-up re-authentication and a mandatory reason, and writes to `audit_log`. An archived ticket must be reversed before its data can be amended. A reversal into `IN_ACTION` still requires a category.

---

## 5. Data model

All timestamps `timestamptz`, stored UTC, displayed Australia/Melbourne.

### `categories` — administrator-maintained lookup

`id` (uuid PK), `name` (text unique), `sort_order` (int), `is_active` (boolean default true), `created_by`, `created_at`.

Seeded: Recruitment, Payroll, Leave, Workers Compensation, Return to Work, Employee Relations, Performance, Training, Compliance, Other.

**Not a database enum.** Created and renamed through the admin UI (§13) with no migration. New entries take `max(sort_order) + 1`. Categories are **deactivated, never deleted** — `is_active = false` removes them from selection but preserves them on historical tickets. FK from `tickets` is `ON DELETE RESTRICT`; there is no delete path in the UI. Renaming updates the row in place, so historical tickets show the new name without migration.

### `business_units` — administrator-maintained lookup

Same shape and rules. Seeded: Admin, Retail, Carriers, Depots, Other.

### `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ticket_no` | varchar(12) unique | `YYMMDDHHMM` plus 2-digit collision sequence. **Immutable** |
| `original_subject` | text | Immutable, as received or as typed at manual creation |
| `subject` | text | Editable display subject |
| `requester_email` | citext | Immutable |
| `requester_name` | text | Immutable |
| `cc_recipients` | text[] | Editable |
| `received_at` | timestamptz | Immutable. `now()` for manually created tickets |
| `request_date` | date | Date component of `received_at` (Australia/Melbourne). **Drives archive path and retention clock** |
| `category_id` | uuid FK categories, nullable | Required to enter `IN_ACTION` |
| `business_unit_id` | uuid FK business_units, nullable | Optional throughout. Never blocks progression |
| `priority` | enum P1/P2/P3, not null | See §7.3 and §8 |
| `sla_due_at` | timestamptz, not null | Derived from `received_at` + priority hours. **Recalculated whenever `priority` changes** |
| `target_due_at` | timestamptz, nullable | Optional manual deadline |
| `target_due_reason` | text, nullable | **Mandatory whenever `target_due_at` is set** |
| `status` | enum | §4 |
| `assigned_to` | uuid FK users, nullable | |
| `assigned_at` | timestamptz | |
| `first_viewed_at`, `first_viewed_by` | | Set once |
| `escalation_count` | integer default 0 | Capped at 3 by §8 |
| `last_escalated_at` | timestamptz, nullable | |
| `is_confidential` | boolean default false | |
| `confidential_set_by`, `confidential_set_at` | | |
| `is_legal_hold` | boolean default false | |
| `legal_hold_reason` | text, nullable | Mandatory when set |
| `legal_hold_set_by`, `legal_hold_set_at` | | |
| `legal_hold_cleared_by`, `legal_hold_cleared_at` | | |
| `merged_into_ticket_id` | uuid FK tickets, nullable, `ON DELETE SET NULL` | Self-relation. §7.6 |
| `outcome_for_requester` | text, nullable | **The only ticket text ever emailed as an outcome** |
| `outcome_sent_at` | timestamptz | |
| `close_reason` | enum RESOLVED / NOT_A_REQUEST / AUTOCLOSE / MERGED / REDIRECTED | |
| `closed_at`, `archived_at` | timestamptz | |
| `retention_purge_date` | date | `request_date + 7 years`, computed on insert |
| `is_deleted`, `deleted_by`, `deleted_at`, `delete_reason` | | |
| `version` | integer not null default 0 | Optimistic lock |

Indexes: `status`, `assigned_to`, `request_date`, `retention_purge_date`, `requester_email`, `is_confidential`, `is_legal_hold`, `category_id`, `business_unit_id`, `sla_due_at`, `target_due_at`, `merged_into_ticket_id`.

**Effective due date** is `LEAST(sla_due_at, COALESCE(target_due_at, sla_due_at))`. A target due date can only bring a deadline **forward**, never extend it.

Email bodies do not live on `tickets`. The original is the first row in `ticket_messages`.

### Concurrency control

**Self-assignment and pool claims** execute as a single atomic conditional update:

```sql
UPDATE tickets
   SET assigned_to = :userId, status = 'ALLOCATED',
       assigned_at = NOW(), version = version + 1
 WHERE id = :ticketId AND assigned_to IS NULL AND status = 'NEW'
```

Zero rows affected → **HTTP 409**, forcing a UI refresh. Never read-then-write.

**All other mutations** use optimistic locking on `version`. Zero rows affected → **HTTP 409** with current server state returned. A merge (§7.6) version-checks **both** tickets inside one transaction and reports which one conflicted.

### `ticket_messages` — the correspondence record

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `ticket_id` | uuid FK tickets |
| `direction` | enum INBOUND / OUTBOUND |
| `message_type` | enum ORIGINAL / REPLY / ALLOCATION / OUTCOME / MANUAL |
| `graph_message_id` | text, unique nullable |
| `internet_message_id` | text, unique where not null |
| `conversation_id` | text, indexed |
| `from_address`, `from_name` | text |
| `to_recipients`, `cc_recipients` | text[] |
| `subject` | text |
| `body_text` | text |
| `body_html` | text — sanitised on render, never on store |
| `sent_by` | uuid FK users, nullable — outbound only |
| `received_at` / `sent_at` | timestamptz |
| `correlation_id` | uuid |

`message_type = MANUAL` serves two distinct cases: the first message of a manually created ticket (§7.5), and an officer composing correspondence outside the three automated triggers on an existing ticket.

**Chronological ordering.** Inbound messages populate `received_at`; outbound populate `sent_at`. A database-level `ORDER BY received_at ASC` therefore sorts every outbound message to the end (Postgres sorts nulls last), burying allocation emails beneath later replies. Ordering **must** use the shared per-direction helper — `(direction === INBOUND ? received_at : sent_at)` — applied consistently in the live detail view, the API and the archive writer. This is a fixed defect; do not reintroduce a DB-level sort on one timestamp.

### `ticket_notes` — internal staff notes

`id`, `ticket_id`, `author_id`, `body`, `visibility` (enum INTERNAL / REQUESTER_VISIBLE, default INTERNAL), `created_at`, `is_current`, `supersedes_note_id`.

Append-only. Editing inserts a new row marked current, sets the prior row `is_current = false`, and links via `supersedes_note_id`. Nothing is ever UPDATEd or DELETEd. `visibility` is used in one place only: `REQUESTER_VISIBLE` notes appear as opt-in checkboxes in the outcome dispatch preview (§7.4). They are never sent automatically.

### `ticket_attachments`

`id`, `ticket_id`, `message_id` (nullable), `filename`, `declared_content_type`, `detected_content_type`, `size_bytes`, `blob_path`, `sha256`, `source` (EMAIL / UPLOAD), `scan_status` (PENDING / CLEAN / MALICIOUS / BLOCKED / SKIPPED), `block_reason`, `uploaded_by`, `created_at`.

### `ticket_status_history`

`id`, `ticket_id`, `from_status`, `to_status`, `from_assignee`, `to_assignee`, `actor_id`, `reason`, `correlation_id`, `created_at`.

### `ticket_access` — confidential ACL

`ticket_id`, `user_id`, `granted_by`, `granted_at`. Composite PK.

### `audit_log`

`id`, `ticket_id` (nullable, **`ON DELETE SET NULL`**), `actor_id`, `action`, `entity`, `entity_id`, `before_json`, `after_json`, `access_basis` (nullable enum ASSIGNEE / ACL_GRANTED / HR_LEAD / ADMIN), `reason`, `correlation_id`, `ip`, `user_agent`, `created_at`.

The `SET NULL` behaviour on `ticket_id` is load-bearing, not incidental: it is what allows the retention purge's own audit record — written before the delete — to survive destruction of the ticket row.

**Append-only, enforced at the database.** The application's Postgres role holds INSERT and SELECT only on this table. Retained 10 years.

Auditable actions include, at minimum: every status transition, reassignment, manual ticket creation, merge, category change, business unit change, target due date change, priority change, note creation and revision, confidential set and clear, legal hold set and clear, soft-delete, archive amendment, bulk export, suppression rule change, category and business unit create/rename/activation change, user role change, user display name change, outcome dispatch, and `CONFIDENTIAL_TICKET_VIEWED`.

### `email_log` — delivery telemetry only

`id`, `ticket_id`, `message_id`, `attempt_no`, `graph_response_code`, `status`, `error`, `correlation_id`, `attempted_at`. Never displayed to users, never written to the archive.

### `suppression_rules` / `suppression_log`

`suppression_rules`: `id`, `type` (SENDER / DOMAIN / SUBJECT_PATTERN), `value`, `created_by`, `created_at`, `is_active`.
`suppression_log`: `id`, `rule_id`, `from_address`, `subject`, `internet_message_id`, `received_at`, `correlation_id`.

### `users`

`id`, `entra_object_id` (unique), `upn`, `display_name`, `initials`, `role`, `is_active`, `first_seen_at`, `last_login_at`.

### `graph_subscriptions`

`id`, `subscription_id`, `resource`, `expires_at`, `client_state`, `created_at`.

### `job_runs`

`id`, `job_name`, `correlation_id`, `started_at`, `completed_at`, `status`, `items_processed`, `error`. Read by the liveness alert (§12.1).

### 5.1 Correlation IDs

Every inbound API request and background job run generates a `correlation_id` at entry, or adopts one supplied in an `X-Correlation-Id` header. Server Components obtain the same ID a concurrent API call for that request would, via the value middleware forwards onto every request including page loads.

It propagates through: `audit_log`, `ticket_status_history`, `ticket_messages`, `email_log`, `suppression_log`, `job_runs`, Graph call logging, and every structured log line and exception in Application Insights. An administrator given one correlation ID can reconstruct every event for one operation.

**Not in scope:** persistent session tracking, distributed tracing infrastructure, any correlation store beyond these columns.

---

## 6. Authentication and authorisation

- NextAuth with the Azure AD provider, single tenant, restricted to the Tasco tenant ID. Roles are read from the `groups` claim in the ID token; this is the standard approach but is **unverified against a real tenant** until §14 items 1 and 4 land, and may need adjustment if Entra's token configuration does not emit the claim as assumed.
- Session cookie `httpOnly`, `secure`, `sameSite=lax`, 8-hour expiry with sliding refresh.
- Middleware protects every route except `/api/graph/notifications` (validated by `clientState`), `/api/scan/notifications` (validated per §7.3.2), `/api/jobs/*` (validated by `X-Job-Key`), and the health endpoint.
- Every API route re-checks role server-side. Never trust a client-supplied role.
- **Step-up re-authentication** — a fresh Entra prompt within the last 5 minutes — is required for: archive amendment, soft-delete, confidential flag clear, status reversal, user role change, legal hold set, legal hold clear.
- Viewing a confidential ticket requires **no** step-up and **no** stated reason for any role. It is audit-logged (§9.1).
- Direct GET on a confidential ticket by an unauthorised user returns **404** with no metadata. Not 403 — a 403 confirms the ticket exists.

**No local password store exists anywhere in this system.** For a non-Tasco user, use an Entra B2B guest invitation.

---

## 7. Email and ticket intake

### 7.0 Mailbox — migration from distribution group

**Ingestion address: `humanresources@tascopetroleum.com.au`.** No new public address is created.

The address is currently a **distribution group**. A distribution group has no mailbox, so there is nothing for Graph to subscribe to, and it cannot be converted — it must be replaced. Three phases, because a direct swap creates a bounce window and an unrecoverable address gap.

**Phase 1 — parallel run (zero risk)**
1. Create shared mailbox `hrtickets@tascopetroleum.com.au`.
2. Add it as a **member of the existing `humanresources@` distribution group**.
3. Mail now lands in the shared mailbox and continues to reach RJ, LF and DN exactly as today.
4. Build and test ingestion against real live traffic. Rollback is removing one group member.

**Phase 2 — remove personal delivery (at go-live)**
1. Remove the individual staff members from the group, leaving the shared mailbox as the only member.
2. HR now receives requests only through the portal. Rollback is re-adding the members.

**Phase 3 — address consolidation (out of hours)**
1. Delete the now single-member distribution group.
2. Set `humanresources@tascopetroleum.com.au` as the **primary SMTP address** on the shared mailbox, keeping `hrtickets@` as an alias.
3. Required, not cosmetic: until then, outbound replies come from `hrtickets@`.
4. Short bounce window between the two steps — schedule out of hours.
5. Outlook autocomplete caches the old group object; the cached entry must be cleared or replies misroute for days.

**Ordering note.** The Graph subscription needs a publicly reachable HTTPS `notificationUrl` to complete its validation handshake, which does not exist until Stage 7 deploys the app with DNS. Phase 1 can be done at any time, but ingestion cannot be end-to-end tested until Stage 7 is complete.

**Historical mail.** No central history exists — each group member holds their own copies. Nothing to migrate.

**Graph targets the shared mailbox**: `/users/{hrticketsMailboxId}/mailFolders/inbox/messages`.

### 7.0.1 Noise control

1. **Exchange inbox rules** move known noise senders to a `Not Tickets` folder before the subscription (scoped to Inbox only) sees them.
2. **Application suppression list** — maintained by ADMIN. Matches are written to `suppression_log`, never silently dropped.
3. **"Not a request" and Autoclose** for whatever slips through. Autoclose is deliberately **manual only** and is not wired into suppression rules.

### 7.0.2 Cut-over and adoption

- Ingestion begins at a nominated go-live timestamp. **No message received before it is ingested.**
- From Phase 2, the mailbox is a transport layer, not a workspace. No application logic detects or polices staff replying from Outlook — the architecture removes the opportunity (§17).
- Outbound sends set `saveToSentItems: true` so the mailbox retains a complete correspondence trail independent of the application.

### 7.1 Inbound ingestion — webhook (primary)

- Graph change-notification subscription on the inbox, `changeType=created`.
- `notificationUrl` = `https://hr.tascopetroleum.com.au/api/graph/notifications`.
- Validation handshake: echo `validationToken` as `text/plain`, HTTP 200, within 10 seconds.
- Validate `clientState` on every notification. Missing or mismatched → **HTTP 400**, log, do not process.
- Respond 202 immediately, process asynchronously. Rate-limit the endpoint; it is publicly reachable by necessity.
- Subscriptions expire at roughly 4230 minutes. The renewal job runs every 12 hours and recreates the subscription if renewal fails.

### 7.2 Inbound ingestion — delta poll (safety net)

Webhooks drop. This is not optional. A poller runs **every 15 minutes** using a Graph delta query, comparing `internet_message_id` against `ticket_messages` and creating anything the webhook missed. Idempotency is enforced by the unique index.

### 7.3 Ticket creation from email

Evaluated in order:

1. **Suppression check** — on match, write `suppression_log` and stop.
2. **Auto-reply check** — `Auto-Submitted: auto-*` or `X-Auto-Response-Suppress` create no ticket.
3. **Threading, two mechanisms in order:**
   - **Primary — `conversation_id`.** If it matches an existing non-archived ticket, append a `ticket_messages` row with `message_type = REPLY`, notify the assignee, stop.
   - **Fallback — subject ticket number.** Only when the primary finds no match: extract a bracketed 12-digit ticket number from the subject (`[TICKETNO]`, the format every outbound email uses) and thread onto that ticket if it exists and is not `ARCHIVED`.

   **Accepted risk, recorded deliberately.** Subject matching is **not** restricted to the ticket's own requester or CC list. Any sender whose subject carries a live ticket number is threaded onto it. The ticket number is a predictable string, so it is a de facto write key into that ticket's correspondence. This grants no additional *view* access — §9's ACL still gates who can read the result — so the exposure is data integrity, not confidentiality. The operator chose this explicitly over a sender restriction; it is not an oversight. Revisit if spurious threading occurs in practice.

4. **Create ticket** —
   - `original_subject` ← email subject; empty → `(no subject)`.
   - `requester_email` / `requester_name` ← `from.emailAddress`.
   - Original email stored as the first `ticket_messages` row (`INBOUND` / `ORIGINAL`).
   - HTML stored raw, sanitised with a strict allowlist **at render time**. Untrusted input from anyone who can email the address.
   - `category_id` and `business_unit_id` left null. Never inferred from subject content.
   - **Priority classification:** subject contains "urgent" (case-insensitive) → **P1**. Everything else → **P3**.
   - **Ticket number:** `YYMMDDHHMM` from `received_at` in Australia/Melbourne plus a 2-digit sequence starting `01` for same-minute collisions, generated inside the insert transaction with a unique-constraint retry.

**On the priority rule.** An earlier version classified subjects containing "action" as P2. That rule is removed: a non-urgent ticket's real priority is determined by the officer who picks it up, not guessed from a keyword. Because `priority` and `sla_due_at` are both NOT NULL and every overdue and escalation calculation depends on `sla_due_at` existing, P3 — the most generous clock — is the provisional default, corrected via the priority selector on the ticket. The practical consequence, stated plainly: **P2 is now only reachable by manual amendment, and the default escalation clock for almost every ticket is 30 days.** The SLA safety net is correspondingly looser than it was, and depends on officers setting priority at allocation.

The ticket numbering, SLA and retention-date derivation logic is shared by the email and manual creation paths from a single module. Do not duplicate it.

### 7.3.1 Attachment handling

**Defender for Storage malware scanning is the primary control.** Extension and content-type checks are supporting controls, not the security boundary.

| Rule | Behaviour |
|---|---|
| Size | Reject over 25MB |
| **Executable extensions** — `.exe .dll .bat .cmd .com .ps1 .js .vbs .scr .jar .msi .hta .lnk` | Blocked outright. `scan_status = BLOCKED`, `block_reason` recorded, system note added so nothing is silently lost |
| **Container formats with no legitimate HR use** — `.iso .img .vhd .vhdx .rar .7z .cab .ace` | Blocked outright, same treatment |
| **`.zip`** | **Accepted.** Law firms, recruiters, insurers and payroll providers routinely send zipped packs. Stored and quarantined until Defender returns CLEAN |
| Content sniffing | Record `declared_content_type`, detect actual type from magic bytes. Mismatch → `BLOCKED`, reason `TYPE_MISMATCH` |
| Inline images under 10KB | Ignored (signature logos) |

**Server-side unpacking of archives is forbidden.** Zip bombs and path traversal in extraction are a larger exposure than the threat addressed.

**No attachment is downloadable while `scan_status` is `PENDING`.** `MALICIOUS` and `BLOCKED` are never downloadable and display the reason. `BLOCKED` and `MALICIOUS` bytes are never copied into a permanent archive or an export zip; the manifest records their existence, SHA-256 and status regardless.

### 7.3.2 Scan verdict ingestion

Defender publishes malware scan results to an **Event Grid custom topic**. Two paths, primary and reconciliation, for the same reason the Graph ingestion has two.

**Primary — Event Grid webhook.** An Event Grid subscription delivers to `POST /api/scan/notifications`, which must handle the Event Grid subscription-validation handshake (echo `validationCode`) exactly as the Graph endpoint does, and authenticate delivery with a shared secret from Key Vault. The handler maps the event's blob URL to `ticket_attachments.blob_path`, sets `scan_status`, and writes `audit_log` with the request correlation ID.

**Reconciliation — `attachment-scan-reconcile`, every 15 minutes.** For any attachment PENDING longer than 15 minutes, read the blob's `Malware Scanning scan result` index tag directly. Tag values map: `No threats found` → CLEAN; `Malicious` → MALICIOUS; `Error` or `Not scanned` → BLOCKED with reason `SCAN_UNAVAILABLE`. Anything still PENDING after 60 minutes → BLOCKED, reason `SCAN_TIMEOUT`, raising an Application Insights alert.

**Fail closed.** No verdict, an error verdict, or a timeout all mean not downloadable. Never default to CLEAN.

Three infrastructure constraints that silently break this if missed, all of which belong in Stage 7's Bicep:

- The storage account must be **standard general-purpose v2 with hierarchical namespace disabled**. Index tags are not supported on accounts with hierarchical namespaces enabled, so enabling ADLS Gen2 removes the reconciliation path entirely.
- The Event Grid topic must **allow public network access**. Topics reachable only via private endpoint are not supported for scan-result delivery.
- The Defender for Storage service principal needs the **EventGrid Data Sender** role on the topic.

One operational rule: **set all blob metadata in the write options at upload time.** Updating a blob's metadata shortly after upload can cause the on-upload scan to fail.

### 7.4 Outbound communications

All outbound mail sends **from the shared mailbox** via Graph `sendMail`, with `In-Reply-To` and `References` headers set to the original ingestion message. Every send writes a `ticket_messages` row (`OUTBOUND`) and one or more `email_log` rows, both carrying the request's `correlation_id`.

| Trigger | Recipients | Content |
|---|---|---|
| Allocation | Requester | Ticket number, display subject, assigned officer display name, expected response timeframe, **tracking-number note** |
| Outcome | Requester + `cc_recipients` | Ticket number, display subject, the curated `outcome_for_requester` text, plus any notes the officer explicitly ticked, **tracking-number note**. **Internal staff notes are never dumped or sent automatically** |
| SLA escalation | Assignee, CC the HR mailbox | Ticket number, elapsed hours, priority, which deadline was breached, direct portal URL |

**Tracking-number note.** Allocation and Outcome emails include: "When replying, please keep the ticket number in the subject line so your response can be tracked against this ticket." Escalation deliberately omits it — it goes to internal staff, not the requester.

Failed sends retry three times with backoff, then surface as a banner on the ticket and in the ADMIN failed-sends view.

#### Outcome dispatch preview — mandatory

The `IN_ACTION` → `OUTCOME` transition and the outcome email are a single user-confirmed action. There is no path to send an outcome without it.

1. The officer drafts `outcome_for_requester`, written for the requester.
2. The UI presents a **dispatch preview modal** showing: `To`; editable `CC`; subject; the final rendered body exactly as it will send; checkboxes for any `REQUESTER_VISIBLE` notes, unticked by default; the attachments to be included.
3. The email dispatches and the status transitions only on explicit confirmation: **"Approve & Send Outcome"**.

No autosave (§17). A navigation-away warning is shown if the draft is non-empty.

This exists because HR notes routinely name other employees, record manager commentary, and sometimes contain legal advice.

### 7.5 Manual ticket creation

Not every HR request arrives by email. Walk-ins, phone calls and corridor conversations are real intake channels, and a system that can only ingest email would be worked around within a month.

`POST /api/tickets` and the `/tickets/new` page. **Any signed-in staff member**, no role gate — the same posture as self-claiming from the Pool.

- Fields: requester name, requester email, subject, description, priority.
- **Priority is chosen explicitly by the creator**, defaulting to P3. It is not keyword-classified: someone describing a request directly knows its urgency better than a subject-line heuristic.
- Lands as `NEW`, unassigned, in the Pool. `received_at = now()`. First message stored as `direction: INBOUND`, `message_type: MANUAL`.
- `TICKET_CREATED` audit-logged with the **real creator** as actor. Ingestion's equivalent uses the seeded system user; a manual entry has a human to attribute.
- Ticket numbering, SLA and retention derivation use the same shared module as ingestion.

**Requester email confirmation.** The address is typed by staff and becomes the destination for every subsequent allocation and outcome email about a real employee matter. A transposed character sends HR correspondence to a stranger. The create form must show the entered address back for explicit confirmation before submission.

A "+ New ticket" entry point sits on the Pool page, the app's default landing view.

### 7.6 Ticket merging

Duplicate requests arrive — the same person emails twice, or emails after phoning. Merging consolidates them.

`POST /api/tickets/[id]/merge`. Permission: **assignee of either ticket, or HR_LEAD or ADMIN**.

- Both tickets are `version`-checked atomically inside one Prisma transaction; a conflict reports which ticket caused it.
- `ticket_messages`, `ticket_notes` and `ticket_attachments` are re-parented from source to target. Their own timestamps and correlation IDs are untouched, so the existing chronological ordering interleaves them correctly with no new sorting logic.
- `cc_recipients` are unioned onto the target.
- The source ticket's `ticket_status_history` and `audit_log` rows **stay on the source** — they are the record of what happened to that ticket, including its own merge event. Only user-facing content moves.
- The source is set `CLOSED` with `close_reason = MERGED` and `merged_into_ticket_id` populated. Banners appear both directions on the ticket detail pages.

**Refusals, both permanent:**

- **Confidential tickets may not be merged**, as either source or target. Merging relocates content across two different ACL positions and there is no correct union of them. Refused with 400.
- **Tickets under legal hold may not be merged**, as either source or target. Moving content off a held ticket defeats the hold. Refused with 409, consistent with the soft-delete refusal.

**Retention of merged content.** Content that moves to the target is retained on the target's clock, derived from the target's `request_date`. The source archives with its own history and merge pointer but little content. This is stated so nobody is surprised to find a merged conversation purging on a different date from the ticket it arrived on.

---

## 8. SLA, target due dates and escalation

### SLA — elapsed hours

| Priority | Threshold from `received_at` |
|---|---|
| P1 | 48 elapsed hours (2 days) |
| P2 | 168 elapsed hours (7 days) |
| P3 | **720 elapsed hours (30 days)** |

**Elapsed clock time only.** No weekends, public holidays or business-calendar logic (§17). `sla_due_at` is recalculated whenever `priority` changes.

The SLA hours table exists in **exactly one module**. It was previously duplicated in four places, including a presentational copy in the email templates, and the copies drifted. Any change updates the one table and the label mapping it feeds.

### Target due date

`target_due_at` is an optional manual deadline for matters with a specific external date — a Fair Work response, a WorkCover deadline, a return-to-work review. `target_due_reason` is mandatory whenever a date is set. Both are settable by any signed-in staff member (§3) and both changes are audit-logged with before and after values.

### Overdue determination

A ticket is overdue when **either** `sla_due_at` **or** `target_due_at` has passed, whichever is first, and status is not `CLOSED` or `ARCHIVED`. A target due date brings the effective deadline forward only; it cannot extend an SLA.

### Escalation

Daily at **06:00 Australia/Melbourne**. Overdue tickets generate one escalation email per day, incrementing `escalation_count`, capped at **3 per ticket in total** regardless of which deadline breached or whether both did. After the cap the ticket appears on the "Overdue — escalated" view for the HR Lead and no further email is sent. Unallocated overdue tickets escalate to the HR Lead directly. The email states which deadline was breached and by how long.

---

## 9. Confidential tickets

Default is an **open pool**: all users see all tickets and may self-assign. The confidential flag is a deliberate exception.

- Settable by HR_LEAD or ADMIN only, at any lifecycle stage. Clearing requires ADMIN with step-up re-authentication.
- When set, visible only to: the user who set it, all ADMINs, the current assignee, and anyone explicitly granted via `ticket_access`.
- Hidden entirely from pool, list and search views for everyone else. Direct API access returns 404.
- Excluded from bulk exports unless the exporter is an ADMIN; that export is audit-logged.
- **Cannot be merged** (§7.6).

### 9.1 Confidential access logging

Every view writes `audit_log` with `action = CONFIDENTIAL_TICKET_VIEWED` and `access_basis`: `ASSIGNEE`, `ACL_GRANTED`, `HR_LEAD` or `ADMIN`. Where more than one applies, record the most specific (assignee over ACL over role). Logging is wired into the ticket loader itself, not behind any UI action, so it cannot be bypassed by reaching the record another way.

**No break-glass mechanism.** JDL and RGL are authorised ADMIN users with legitimate access under §9.2. They enter no reason, acknowledge no warning, and perform no step-up merely to view. The audit record is the control.

### 9.2 Admin exclusion — decision: vetoed

An option to exclude a named ADMIN from an individual confidential ticket was proposed and **rejected by the operator**. Both ADMINs retain full visibility without exception. Tasco is a private company and the stated position is full transparency. Basis: whistleblower disclosures go to a separate dedicated address under Tasco's whistleblower policy and do not route through this system.

**Required operational control.** Statutory whistleblower protections attach to a disclosure made to an eligible recipient — directors, Company Secretary, senior managers — regardless of the address it arrives at. A misdirected disclosure landing in the HR mailbox is still protected and will sit where both admins can read it. Documented procedure, included in the Instructions page:

1. Any user identifying an inbound message as a whistleblower disclosure stops immediately and does not open, forward or discuss it further.
2. The Company Secretary redirects it to the designated whistleblower channel.
3. The ticket is soft-deleted with `close_reason = REDIRECTED` and reason "Redirected — whistleblower channel". Content leaves portal views; the fact of receipt survives in `audit_log`.
4. Confirm the whistleblower policy names the separate address and that it is published where employees will find it under stress.

---

## 10. Archive, legal hold and retention

### Archive trigger
On transition to `CLOSED`, a nightly job (plus ADMIN on demand, sharing the identical routine) writes the artefacts and sets status `ARCHIVED`.

**Transactional requirement:** blob writes happen first; the `ARCHIVED` status update is the last operation. A failed or partial blob write leaves the ticket `CLOSED` for retry on the next run and logs the failure. Never mark archived optimistically.

### Archive location
Container `hr-archive`, path derived from **`request_date`, not closure date**:

```
hr-archive/{YYYY}/{MM}/{ticket_no}/
    ticket.txt
    ticket.xml
    attachments/{original filenames}
```

`ticket.txt` — the complete human-readable record:
- Header: ticket number, subject, requester, category, business unit, dates, priority, `sla_due_at`, `target_due_at` and reason where set, assignee, first viewed, final status, close reason, merge pointer where applicable, legal hold status and reason where applicable
- **Correspondence and internal notes interleaved chronologically** using the per-direction timestamp rule (§5), each labelled:
  - `[EMAIL IN]` — inbound email
  - `[EMAIL OUT]` — outbound email
  - **`[MANUAL ENTRY]`** — a message with `message_type = MANUAL`
  - `[INTERNAL NOTE]` — a staff note
- Edited notes carry an `(edited)` marker; current versions only
- Outcome text as sent
- Full status history with timestamps and actors
- Attachment manifest with SHA-256 hashes and scan status

**On `[MANUAL ENTRY]`.** Labelling a manually created ticket's first message `[EMAIL IN]` was an interim display choice, and it is wrong in the one document where being wrong is expensive. These artefacts are the seven-year record, potentially produced in a Fair Work or WorkCover matter. A record asserting that a staff member's write-up of a phone call was an email from the employee misstates the provenance of evidence. The distinct label is required in **both** the live correspondence panel and the archive writer, which must stay consistent with each other.

`ticket.xml` — the same content in a structured schema, with an XSD committed to the repo. Correspondence and notes are distinct element types, and a manual entry is a distinct correspondence type, not an inbound email. Category, business unit, both due dates, close reason, merge pointer and legal hold state are discrete elements, not free text, so archived records remain machine-analysable after purge from the database.

**XSD validation.** `ticket.xml` must be validated against the committed XSD, not merely checked for well-formedness — the two are not the same, and a balanced-tag check proves neither structure nor types. No XSD validator is available in the local development environment (see §2.2). **Validation runs in CI**, where GitHub-hosted runners provide `xmllint` and Tasco's gateway does not apply. This is a Stage 8 deliverable and closes the §15 acceptance test that cannot otherwise pass.

### Legal hold

Prevents automatic destruction of records potentially relevant to litigation, Fair Work proceedings, WorkCover matters, regulatory investigation or another formal dispute.

- **ADMIN only.** Setting and clearing both require step-up re-authentication and a mandatory reason, both audit-logged with before and after state. May be placed at any lifecycle stage, including `ARCHIVED` — there is no status guard.
- While `is_legal_hold = true`:
  - The retention purge **excludes the ticket entirely**, database rows and blob artefacts both.
  - **Soft-delete is blocked**, HTTP 409.
  - **Merging is blocked**, either direction, HTTP 409 (§7.6).
  - Archive amendment remains available to ADMIN via the versioned-alongside mechanism, in which originals are never overwritten.
  - A prominent banner reads **`LEGAL HOLD — RETENTION PURGE SUSPENDED`**, showing the reason, who set it and when.
- Clearing records `legal_hold_cleared_by` / `legal_hold_cleared_at` and restores normal retention. A ticket already past `retention_purge_date` when the hold clears is purged on the next nightly run.

**Admin legal holds view.** Lists every active hold with ticket number, subject, who set it, when, reason and age, sorted oldest first, flagging holds over 12 months for review. A hold nobody reviews becomes indefinite retention of personal data, which is a records problem in its own right.

### Retention
- `retention_purge_date = request_date + 7 years`.
- Nightly purge hard-deletes database rows and blob artefacts where `retention_purge_date < today` **AND `is_legal_hold = false`**, writing one purge record per ticket to `audit_log` — ticket number, SHA-256 subject hash, category, timestamp, correlation ID — **before** the delete, so it survives it via the `SET NULL` FK.
- Cascading FKs remove messages, notes, attachments, status history, access grants and email log rows.
- The purge **deliberately ignores `is_deleted`**: soft delete is not a retention override. Legal hold is.
- `audit_log` is retained 10 years.
- "Not a request", `AUTOCLOSE` and `MERGED` closures are archived and retained identically but excluded from the default archive search view.

### Amendments to archived tickets
ADMIN only, step-up re-authentication, mandatory reason. Originals are **never overwritten**: a new versioned set is written alongside (`ticket.v2.txt`, `ticket.v2.xml`), with before and after state in `audit_log`. A ticket must be reversed out of `ARCHIVED` to amend its data; the artefact rewrite occurs on re-archive.

### Deletion
Soft delete only. Sets `is_deleted`, actor, timestamp and mandatory reason. Removed from every view except the ADMIN "Deleted" view — which is a list, not a drill-down, since the ticket loader excludes deleted tickets everywhere including there. **Blob artefacts are not removed.** There is no hard-delete path in the application. Blocked entirely under legal hold.

---

## 11. Export and search

- **Per-ticket:** any user with access exports `.txt`, or `.zip` with attachments. Only `CLEAN` attachment bytes are included; the manifest documents the rest.
- **Bulk (ADMIN / HR_LEAD):** CSV of ticket metadata over a date range — category, business unit, priority, both due dates, overdue flag, close reason, assignee, first-view and closure timestamps. Confidential rows excluded unless ADMIN. Audit-logged with filter criteria.
- **Archive search:** full-text over archived tickets by ticket number, requester, subject, category, business unit, date range, assignee, legal hold status. `NOT_A_REQUEST` and `AUTOCLOSE` closures are each excluded by default with their **own separate toggle** — an operator may want either independently.
- **Audit search (ADMIN / HR_LEAD** — the §3 matrix is authoritative**):** by ticket number, actor, action, date range and correlation ID. Ticket number resolves to the internal id server-side; a number that does not resolve returns an empty result set, never an error. Results display the ticket number, not a raw uuid.
- **List filtering:** ticket-number search is available in the shared filter bar across Pool, My tickets, All open, Overdue and Closed, operating client-side over each view's already-authorised set.

---

## 12. Scheduled jobs

`POST /api/jobs/{name}`, authenticated by a Key Vault–stored secret in an `X-Job-Key` header, invoked by Azure Logic App recurrence triggers. Missing or invalid key → **401**. Each job is idempotent, generates a `correlation_id` at entry, and writes a `job_runs` row.

| Job | Schedule |
|---|---|
| `graph-subscription-renew` | Every 12 hours |
| `mailbox-delta-poll` | Every 15 minutes |
| `attachment-scan-reconcile` | Every 15 minutes |
| `sla-escalation` | Daily 06:00 Australia/Melbourne |
| `archive-closed` | Daily 01:00 |
| `retention-purge` | Daily 02:00 |
| `sync-users` | Daily 03:00 |

### 12.1 Ingestion liveness alert

One Application Insights alert rule: fire to JDL if no successful `mailbox-delta-poll` run is recorded in `job_runs` within 60 minutes.

The business case is that nothing is missed. A silently dead poller does not fail loudly — it stops creating tickets while everyone assumes the system works.

**Provision this alert disabled at Stage 7 and enable it as the final step of the §7.0 Phase 2 cut-over.** Until Graph credentials exist the job can never succeed, so an enabled alert fires hourly from the day it is deployed and staff learn to ignore the one alert that matters.

---

## 13. UI

Views: **Pool** (unassigned, default landing, with "+ New ticket"), **My tickets**, **All open**, **Overdue**, **Closed** (both CLOSED and ARCHIVED, all officers), **Archive search**, **Instructions**, and **Admin** — users, categories, business units, suppression rules, suppression log, failed sends, legal holds, deleted, audit log.

**Admin lookup screens.** Categories and business units each have a list with inline rename, activate/deactivate, and an add form. ADMIN only. Every create, rename and activation change is audit-logged with before and after values. There is no delete control anywhere.

**Instructions page.** Accessible to all three roles, not role-gated, linked unconditionally in the nav bar. Static content only — no live data reads, so it cannot drift into displaying stale state. Covers the lifecycle, priority and SLA rules, replying and threading, the §3 permission matrix, the CLOSED versus ARCHIVED distinction, a ticket-handling walkthrough, and a summary of what the ADMIN-only screens do (visible to everyone for awareness). It must state the current §14 limitation plainly while no real mailbox exists, so it does not read as documentation of a live mail connection.

Ticket detail:
- Header: ticket number (visually locked), status chip, priority, category, business unit, confidential badge, first-viewed stamp
- **`LEGAL HOLD — RETENTION PURGE SUSPENDED`** banner above the fold where active, with reason, setter and date
- Merge banners both directions where applicable
- **Deadlines panel** showing `sla_due_at` and `target_due_at` where set, each labelled, the effective deadline emphasised, with time remaining or overdue duration
- **Correspondence thread** — chronological by the per-direction timestamp rule, labelled `[EMAIL IN]` / `[EMAIL OUT]` / `[MANUAL ENTRY]`, sanitised HTML with raw text toggle, visually distinct from notes
- **Internal notes** — separate panel, author and timestamp, `(edited)` marker with revision history, visibility selector
- Metadata panel — per-role editable, including a priority selector, category (with a "required before starting work" hint while null) and business unit (marked optional)
- Status timeline with timestamps and actors
- Attachments — download, scan status (`scanning` / `clean` / `blocked` with reason), staff upload
- Audit tab (ADMIN / HR_LEAD)
- Actions: claim, reassign, start action, draft outcome, close, "not a request" close, autoclose, merge, export, flag confidential, set/clear legal hold (ADMIN)

Requirements: A4 print stylesheet; keyboard navigable; Tasco colour palette; 409 conflicts surface as a clear "this ticket changed — reloading" state, never a silent overwrite; missing-category on start-action shows an inline field error, not a generic failure; global CSS must preserve list markers and paragraph spacing (Tailwind Preflight strips both); no client-side storage of ticket content beyond the session.

---

## 14. Manual tenant work — Claude Code cannot do these

These gate the build. They fall into two **independent** tracks.

### Track A — gates Stage 7 (infrastructure)
5. **Azure subscription, resource group and spend approval** (Australia East). Enable Defender for Storage on the storage account. Storage account must be GPv2 with hierarchical namespace **disabled** (§7.3.2).
6. **DNS:** CNAME `hr.tascopetroleum.com.au` → App Service, plus managed certificate. No MX changes.

### Track B — gates the pending ingestion and communications acceptance tests
0. **Mailbox migration (§7.0).** Phase 1 — create `hrtickets@tascopetroleum.com.au` as a shared mailbox and add it as a member of the `humanresources@` distribution group. Identify and remove any auto-forwarding rules on member mailboxes.
1. **Entra app registration** — single tenant, redirect URI `https://hr.tascopetroleum.com.au/api/auth/callback/azure-ad`, federated credential preferred over client secret. Requires a Global Administrator.
2. **Graph application permissions with admin consent:** `Mail.Read`, `Mail.Send`, `User.Read.All`, `GroupMember.Read.All`.
3. **Scope the mail permission to the HR mailbox only.** IT will correctly refuse tenant-wide mailbox read. Pre-empt it:
   ```powershell
   New-ApplicationAccessPolicy -AppId <app-id> `
     -PolicyScopeGroupId HRTicketingMailboxScope@tascopetroleum.com.au `
     -AccessRight RestrictAccess `
     -Description "Restrict HR Ticketing app to the HR shared mailbox"
   ```
   The scope group contains only the `hrtickets@` shared mailbox. Verify with `Test-ApplicationAccessPolicy`.
4. **Entra security groups:** `HR-Ticketing-Admins` (JDL, RGL), `HR-Ticketing-Leads` (RJ), `HR-Ticketing-Users` (LF, DN).

### Both tracks
7. **SharePoint tile** on the HR site linking to the portal.
8. **Sign-off** by JDL as Company Secretary on: the 7-year retention rule; the legal hold procedure and who may request a hold; the whistleblower redirection procedure (§9.2); and the privacy and records position.

**Ordering.** Track A and Track B do not depend on each other and should be pursued in parallel. Stage 7 needs only Track A. Track B cannot be fully exercised until Stage 7 is deployed, because the Graph subscription requires a publicly reachable `notificationUrl`.

---

## 15. Acceptance tests

**Ingestion**
- [ ] Email to the HR address creates a ticket within 60 seconds, with attachments
- [ ] Webhook deliberately broken → delta poller still creates the ticket within 15 minutes
- [ ] Duplicate delivery of the same message creates exactly one ticket
- [ ] A reply on an existing conversation appends a `ticket_messages` row, does not create a second ticket, and does not become an internal note
- [ ] An email with no matching `conversation_id` but a bracketed ticket number in the subject threads onto that ticket
- [ ] An email with neither a matching conversation nor a ticket number creates a new ticket
- [ ] A subject ticket number matching an `ARCHIVED` ticket does not thread; a new ticket is created
- [ ] Inbound webhook with invalid or missing `clientState` is rejected with HTTP 400
- [ ] A sender matching a suppression rule creates no ticket but does appear in `suppression_log`
- [ ] No message received before the go-live timestamp is ingested
- [ ] Mail addressed to `humanresources@` reaches the shared mailbox during Phase 1 parallel run

**Priority and SLA**
- [ ] A subject containing "urgent" creates a P1 ticket with `sla_due_at` exactly 48h after `received_at`
- [ ] A subject containing "action" creates a **P3** ticket with `sla_due_at` exactly 720h after `received_at`
- [ ] Changing priority P1 → P2 recalculates `sla_due_at` to 168h after `received_at`
- [ ] The SLA hours table exists in exactly one module; the allocation email's timeframe label matches it

**Manual creation**
- [ ] An HR_OFFICER with no elevated role can create a ticket; it lands `NEW`, unassigned, in the Pool
- [ ] The first message is `direction: INBOUND`, `message_type: MANUAL`
- [ ] `TICKET_CREATED` is audit-logged with the creating user as actor, not the system user
- [ ] A different officer can claim a manually created ticket exactly like an ingested one
- [ ] Incomplete submission is rejected with a field-level error
- [ ] The requester email is shown back for explicit confirmation before submission
- [ ] Ticket numbering and SLA derivation are identical between the manual and ingestion paths

**Merging**
- [ ] Merge moves messages, notes and attachments to the target and leaves status history and audit rows on the source
- [ ] Source is `CLOSED` with `close_reason = MERGED` and `merged_into_ticket_id` set
- [ ] Merged content interleaves chronologically on the target with no special-case sorting
- [ ] A confidential ticket is refused as source and as target
- [ ] A ticket under legal hold is refused as source and as target, HTTP 409
- [ ] A concurrent modification of either ticket during merge returns 409 naming the conflicting ticket

**Identity and state**
- [ ] Ticket number is unique, correctly formatted, and has no edit path in UI or API
- [ ] Two users simultaneously claiming an unassigned ticket → exactly one success, one HTTP 409
- [ ] A stale-version update is rejected with HTTP 409 and current state returned
- [ ] Patching status from `NEW` directly to `CLOSED` fails with HTTP 400 invalid transition
- [ ] `ALLOCATED` → `IN_ACTION` without a category fails with HTTP 400 naming the missing field
- [ ] First view sets `first_viewed_at` / `first_viewed_by` once and does not change status
- [ ] Reassignment does not re-send the allocation email to the requester
- [ ] Autoclose and "not a request" both close without notification and without a category, and record distinct close reasons

**Classification and admin**
- [ ] A new category added through the admin UI is immediately selectable with no migration or restart
- [ ] A category in use cannot be deleted; deactivating removes it from selection but leaves existing tickets intact
- [ ] Renaming a business unit updates historical tickets' displayed name with no migration
- [ ] A duplicate category or business unit name is refused with 400
- [ ] A non-ADMIN attempting a lookup-table change receives 403
- [ ] An ADMIN can change an existing user's display name; the change is audit-logged
- [ ] Audit search by a ticket number that does not exist returns 200 with zero entries, not a 500

**Deadlines**
- [ ] Setting `target_due_at` without `target_due_reason` is rejected with HTTP 400
- [ ] An HR_OFFICER who is not the assignee can set a target due date but cannot change that ticket's priority
- [ ] A target due date earlier than the SLA deadline makes the ticket overdue on the target date
- [ ] A target due date later than the SLA deadline does not extend it
- [ ] Escalation emails cap at three per ticket even when both deadlines breach, and name which breached

**Communications**
- [ ] Allocation email sends on first entry to `ALLOCATED` and contains the tracking-number note
- [ ] Outcome cannot be sent without the dispatch preview and explicit confirmation
- [ ] Outbound outcome contains strictly `outcome_for_requester` plus explicitly ticked notes, never an unticked note
- [ ] Escalation email does **not** contain the tracking-number note
- [ ] Reply to an outbound notification threads back onto the same ticket
- [ ] Outbound messages appear in the shared mailbox Sent Items
- [ ] An allocation email sent before a later inbound reply sorts **before** it in both the live view and the archive

**Security**
- [ ] Attempt to UPDATE or DELETE `audit_log` as the app role fails at the database level
- [ ] Confidential ticket is invisible to a non-granted HR_OFFICER in pool, list, search and export
- [ ] Direct GET on a confidential ticket by an unauthorised user returns 404 with no metadata disclosure
- [ ] Every confidential ticket view writes `CONFIDENTIAL_TICKET_VIEWED` with the correct `access_basis`
- [ ] An ADMIN viewing a confidential ticket is not prompted for a reason or step-up
- [ ] Non-admin calling an admin API route directly receives 403
- [ ] Step-up is enforced on all seven destructive actions, including legal hold set and clear
- [ ] Any `/api/jobs/*` call without a valid `X-Job-Key` returns 401
- [ ] A disabled Entra account cannot sign in

**Attachments**
- [ ] A `.exe` attachment is blocked, a system note is added, nothing silently lost
- [ ] An `.iso` attachment is blocked
- [ ] A `.zip` attachment is accepted, quarantined, and downloadable only once `CLEAN`
- [ ] An attachment in `PENDING` cannot be downloaded
- [ ] A `MALICIOUS` attachment cannot be downloaded and displays the reason
- [ ] A file renamed `.pdf` containing an executable is blocked with reason `TYPE_MISMATCH`
- [ ] No server-side archive extraction occurs anywhere in the codebase
- [ ] An Event Grid scan-result notification moves an attachment from PENDING to CLEAN
- [ ] With Event Grid delivery suppressed, `attachment-scan-reconcile` resolves the verdict from the blob index tag within 15 minutes
- [ ] An attachment with no verdict after 60 minutes is set BLOCKED with reason `SCAN_TIMEOUT` and raises an alert
- [ ] `/api/scan/notifications` completes the Event Grid validation handshake and rejects an unauthenticated call

**Legal hold**
- [ ] Only ADMIN can set or clear; HR_LEAD receives 403
- [ ] Setting without a reason is rejected
- [ ] **A ticket with `request_date` 7 years and 1 day ago and `is_legal_hold = true` is NOT purged**
- [ ] The same ticket, after the hold is cleared, IS purged on the next run
- [ ] Soft-delete of a held ticket returns HTTP 409
- [ ] Merge of a held ticket returns HTTP 409
- [ ] The banner renders with reason, actor and date
- [ ] Set and clear both appear in `audit_log` with reasons

**Audit and correlation**
- [ ] A single API request produces `audit_log`, `ticket_status_history` and `email_log` rows sharing one `correlation_id`
- [ ] A background job run produces `job_runs` and downstream rows sharing one `correlation_id`
- [ ] Admin audit search by correlation ID returns the complete event set

**Archive and retention**
- [ ] Archive writes `ticket.txt`, `ticket.xml` and attachments to `{request_date YYYY}/{MM}/`
- [ ] `ticket.txt` interleaves correspondence and notes chronologically with correct labels
- [ ] A manually created ticket's first message is labelled `[MANUAL ENTRY]`, not `[EMAIL IN]`, in both the live view and the archive
- [ ] `ticket.txt` and `ticket.xml` include category, business unit, both due dates, close reason and legal hold status
- [ ] **`ticket.xml` validates against the committed XSD using a real validator in CI**, not a well-formedness check
- [ ] A simulated Blob write failure during archiving leaves the ticket `CLOSED`, not `ARCHIVED`
- [ ] `BLOCKED` and `MALICIOUS` attachment bytes are absent from the archive but present in the manifest
- [ ] An amendment writes `ticket.v2.*` alongside an untouched original
- [ ] Note edit creates a revision; original remains retrievable
- [ ] Soft-deleted ticket disappears from views, remains in Blob, remains on the purge schedule
- [ ] Retention purge removes a seeded ticket dated 7 years + 1 day ago and logs it, with the audit record surviving the ticket row

**Durability**
- [ ] Blob soft delete is enabled and a deleted archive blob is recoverable within the retention window
- [ ] A point-in-time database restore to a timestamp 30 days prior succeeds in a test resource group

---

## 16. Build order

1. ~~**Scaffold and data layer**~~ — complete
2. ~~**Auth and RBAC**~~ — complete
3. ~~**Core UI and state machine**~~ — complete
4. ~~**Graph ingestion**~~ — complete (untestable end-to-end until §14 Track B)
5. ~~**Outbound and SLA**~~ — complete (untestable end-to-end until §14 Track B)
6. ~~**Confidential, legal hold, export, archive, retention**~~ — complete against a local filesystem blob stand-in
7. **Infrastructure** — Bicep for all Azure resources, Key Vault, managed identity, Logic App timers, Defender for Storage, **Event Grid topic, subscription and EventGrid Data Sender role assignment (§7.3.2)**, storage account constraints, backup and blob soft-delete per §2.1, liveness alert **provisioned disabled**, restore test. Requires §14 Track A only.
8. **CI/CD and hardening** — GitHub Actions with OIDC, **XSD validation with `xmllint` in CI (§10)**, CSP headers, webhook rate limiting, Application Insights correlation propagation, npm audit remediation
9. **Full acceptance pass against §15**

Outstanding items carried into Stages 7–9 from earlier stages:
- The `[MANUAL ENTRY]` label, in both the live correspondence panel and the archive writer (§10)
- The requester email confirmation on the manual create form (§7.5)
- The legal hold refusal on merge (§7.6)
- XSD validation in CI (§10)
- npm audit: 8 transitive vulnerabilities from the Next.js 14 scaffold, unreviewed since Stage 1

---

## 17. Future enhancements — explicitly outside initial build scope

**Claude Code must treat every item below as a non-goal.** Do not implement, scaffold, stub, add placeholder routes or columns, or "prepare for" any of them unless instructed in a future version.

| Item | Status |
|---|---|
| KPI / management dashboard | Deferred to Phase 2 |
| Advanced reporting and analytics | Deferred to Phase 2 |
| Ticket watchers / followers | Deferred — complexity not justified at five users |
| Outcome draft autosave | Deferred — usability only |
| Autoclose wired into suppression rules | Deferred — Autoclose stays manual |
| Business-hours / public-holiday SLA engine | Rejected — elapsed hours plus target due date is sufficient |
| Outlook reply detection | Rejected — solved structurally by §7.0.2 |
| Break-glass confidential access | Rejected — §9.1 |
| Admin exclusion on confidential tickets | Rejected — §9.2 |
| Merging confidential or legal-hold tickets | Rejected — §7.6 |
| Sender restriction on subject-based threading | Rejected by the operator — §7.3 |
| HRIS or payroll integration | Out of scope |
| Self-service employee portal | Out of scope |
| Mobile application | Out of scope |
| External / non-Tasco user access | Out of scope |

### Data sufficiency for deferred reporting

The dashboard is deferred deliberately: collect clean operational data first, then determine which measures HR uses. The schema already supports, without change:

| Measure | Source |
|---|---|
| Open / closed / overdue counts | `tickets.status`, `sla_due_at`, `target_due_at` |
| Average time to first view | `first_viewed_at` − `received_at` |
| Average time to first response | earliest `OUTBOUND` `ticket_messages.sent_at` − `received_at` |
| Average resolution time | `closed_at` − `received_at` |
| Tickets by assignee / category / business unit | the respective FK columns |
| Confidential ticket counts | `tickets.is_confidential` |
| Closure mix (resolved / not-a-request / autoclose / merged) | `close_reason` |
| Intake channel mix (email vs manual) | first `ticket_messages.message_type` |
| Reassignment and merge frequency | `ticket_status_history`, `merged_into_ticket_id` |

No additional columns are required to build the dashboard later. Time to first view and time to first response are distinct measures; both are available.

---

## 18. Superseded decisions

Recorded so they are not reintroduced:

- Render.com hosting → Azure App Service (data residency and governance)
- SendGrid inbound parse and MX redirection → Microsoft Graph
- Local username/password accounts → Entra ID SSO with group-derived roles
- Shared administrator password → named ADMIN role with step-up re-authentication
- Editable ticket number → immutable
- Ticket number format `YYYYMMDDHHSS` (malformed) → `YYMMDDHHMM` plus 2-digit sequence
- Freely rewritable notes → append-only with revision history
- Hard delete → soft delete; hard purge only via the retention job; blocked under legal hold
- `humanresources@` as a distribution group → shared mailbox via the three-phase migration
- Admin exclusion on confidential tickets → vetoed
- `VIEWED` as a lifecycle status → `first_viewed_at` / `first_viewed_by` event stamps
- Inbound replies appended as internal notes → separate `ticket_messages` ledger
- Outcome email containing full note history → curated `outcome_for_requester` with mandatory dispatch preview
- Email bodies stored on `tickets` → stored in `ticket_messages`
- Category as a database enum → administrator-maintained lookup table
- Blanket blocking of all archive formats → `.zip` accepted and quarantined; `.iso .img .vhd .rar .7z .cab` blocked; no server-side extraction
- Platform-default backup retention → explicit 35-day PITR, geo-redundancy, blob soft delete and versioning
- **Subject containing "action" → P2** → removed; everything not "urgent" is provisionally P3, corrected at allocation
- **P3 SLA of 336 hours (14 days)** → **720 hours (30 days)**
- **Target due date restricted to assignee / HR_LEAD / ADMIN** → open to all signed-in staff
- **Tickets created only by email ingestion** → also created manually by any staff member (§7.5)
- **Close reasons limited to RESOLVED / NOT_A_REQUEST / REDIRECTED** → adds `AUTOCLOSE` and `MERGED`
- **Threading by `conversation_id` only** → subject ticket-number fallback, with no sender restriction, accepted as a deliberate risk
- **Four duplicated copies of the SLA hours table** → one shared module
- **Correspondence ordered by `received_at` at the database level** → shared per-direction timestamp sort; outbound messages no longer sink to the bottom of every thread
- **`[EMAIL IN]` label on manually created tickets** → `[MANUAL ENTRY]`, in both the live view and the archive
- **XSD checked for well-formedness only** → validated against the committed XSD by `xmllint` in CI
