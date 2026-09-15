# TASCO HR Ticketing System — Build Specification

**Owner:** John De Luca (JDL), CFO & Company Secretary
**Audience:** Claude Code (build agent) + Tasco M365/Azure administrator
**Version:** 1.3 — 15 September 2026
**Supersedes:** v1.0, v1.1, v1.2. This document is complete and standalone. Do not refer to earlier versions.

**Scope is frozen at this version.** Section 17 lists features explicitly excluded from the initial build. They are non-goals. Do not scaffold, stub or implement them.

---

## 0. How to use this document

This is the authoritative build brief. Sections 1–13 define the system. Section 14 lists tenant-level work Claude Code **cannot** perform and that gates part of the build. Section 15 is the acceptance test set. Section 16 is the build order. Section 17 is out of scope. Section 18 records superseded decisions.

Do not attempt the whole build in one session. Work one stage at a time.

### 0.1 Claude Code operating rules

1. **Authoritative specification.** Treat this document as fixed architecture. Do not redesign schemas, introduce new dependencies, or substitute frameworks. The stack is Next.js 14, TypeScript, Prisma, PostgreSQL, Azure App Service. Deviations require explicit operator direction and must be recorded in `STATUS.md`.
2. **Strict stage scoping.** Work only on the single stage from §16 nominated by the operator. Do not draft, scaffold or implement later stages ahead of time. Do not implement anything listed in §17 under any circumstances.
3. **Pre-implementation declaration.** Before generating code or running commands, state the stage being implemented, the specific requirements being satisfied, and the files to be created or modified.
4. **Clarification stop.** If a requirement or edge case is ambiguous, stop and ask the operator. Never invent business logic. Never bypass or weaken security, RBAC or audit requirements to simplify an implementation.
5. **No tenant mutations.** Do not run CLI commands or write routines attempting production tenant operations — Graph admin consent, Entra group creation, Exchange cmdlets, DNS changes, Azure resource creation outside the Bicep templates. These are §14 operator tasks.
6. **Never weaken tests.** Do not disable, skip, comment out or loosen a failing test to make a suite pass. Report the failure and its cause.
7. **Migrations are forward-only.** Never reset, drop or recreate a database without explicit operator instruction. Every schema change is a new migration.
8. **No secrets in the repo.** No connection strings, client secrets or keys in source, committed `.env` files, or App Service application settings. Key Vault plus managed identity only.

### 0.2 Persistent state ledger

Create and maintain a root-level `STATUS.md`, updated at the conclusion of every stage:

```markdown
# TASCO HR Ticketing — Build Status
- Current stage: [number and name]
- Last completed stage: [number]
- Passing acceptance tests: [list from §15]
- Failing / pending acceptance tests: [list]
- Architecture deviations / clarifications: [None | list of operator-approved exceptions]
- Blockers / required operator actions: [list]
- Recommended next command or task: [text]
```

Every new session begins with: *"Read TASCO_HR_Ticketing_Build_Spec_v1.3.md and STATUS.md before executing commands."*

---

## 1. Purpose

Tasco Petroleum's HR department receives requests by email to `humanresources@tascopetroleum.com.au`. Requests are currently missed because there is no central record — the address is a distribution group, so each member holds their own copy and no one owns the queue.

This system converts every inbound email into a tracked ticket, allocates it to a named HR officer, tracks it through a defined lifecycle, notifies the requester at controlled points, and archives the completed record for seven years in a form readable without the application.

**Explicit non-goals:** self-service employee portal, HRIS integration, payroll integration, mobile app, external (non-Tasco) user access. See also §17.

---

## 2. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React Server Components | Consistent with Tasco's existing internal app suite |
| ORM | Prisma | |
| Database | Azure Database for PostgreSQL Flexible Server (B1ms, 32GB) | Postgres over Azure SQL for consistency with the existing app suite and Prisma tooling |
| Hosting | Azure App Service (Linux, Node 20, B1) | Australia East |
| Attachments & archive | Azure Blob Storage, private, containers `attachments` and `hr-archive` | Defender for Storage malware scanning enabled on `attachments` |
| Auth | Microsoft Entra ID via NextAuth Azure AD provider | No local passwords. See §6 |
| Email in/out | Microsoft Graph | No SendGrid. No MX changes. See §7 |
| Secrets | Azure Key Vault via App Service system-assigned managed identity | |
| Scheduling | Azure Logic App recurrence → authenticated HTTP call to `/api/jobs/*` | |
| Monitoring | Application Insights, with ingestion liveness alert (§12.1) | |
| CI/CD | GitHub Actions → App Service, OIDC federated credential | No publish profile secret |

**Portal access:** `https://hr.tascopetroleum.com.au`, a custom domain on App Service, linked from a tile on the HR SharePoint page. The app is **not** embedded in SharePoint.

### 2.1 Backup and durability — mandatory

This system is the sole record of HR requests for seven years. Platform defaults are insufficient and must be configured explicitly in Bicep:

- **PostgreSQL:** geo-redundant backup enabled, point-in-time retention set to **35 days** (default is 7).
- **Blob Storage:** soft delete for blobs and containers enabled, **30-day** retention. Without this, an accidental container deletion permanently destroys the archive, including records under legal hold.
- **Blob versioning** enabled on the `hr-archive` container.
- A restore test is part of the stage 7 acceptance criteria. An untested backup is not a backup.

**Indicative run cost:** approximately A$70–85 per month including backup and scanning.

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

### Permission matrix

| Action | ADMIN | HR_LEAD | HR_OFFICER |
|---|---|---|---|
| View open pool | ✔ | ✔ | ✔ |
| Self-assign a pooled ticket | ✔ | ✔ | ✔ |
| Reassign another user's ticket | ✔ | ✔ | Own tickets only |
| Edit ticket metadata (display subject, priority, CC list) | ✔ | ✔ | ✔ (assigned tickets) |
| Set or change category | ✔ | ✔ | ✔ (assigned tickets) |
| Set or change business unit / location | ✔ | ✔ | ✔ (assigned tickets) |
| Set or change target due date and reason | ✔ | ✔ | ✔ (assigned tickets) |
| Add internal notes | ✔ | ✔ | ✔ |
| Edit own note (creates revision) | ✔ | ✔ | ✔ |
| Draft and send outcome | ✔ | ✔ | ✔ (assigned tickets) |
| Close ticket | ✔ | ✔ | ✔ (assigned tickets) |
| "Not a request" close | ✔ | ✔ | ✔ |
| Set / clear confidential flag | ✔ | ✔ | ✘ |
| View confidential ticket | ✔ | ✔ | Only if granted |
| **Set / clear legal hold** | ✔ | ✘ | ✘ |
| Reverse a status transition | ✔ | ✘ | ✘ |
| Amend an archived ticket | ✔ | ✘ | ✘ |
| Soft-delete a ticket | ✔ | ✘ | ✘ |
| Manage users, roles, suppression rules, categories, business units | ✔ | ✘ | ✘ |
| View audit log | ✔ | ✔ | ✘ |
| Bulk export | ✔ | ✔ | ✘ |

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

- `NEW` — created by email ingestion, unassigned, sitting in the open pool.
- `ALLOCATED` — assigned to a named HR officer. First entry into this state sends the allocation email (§7.4).
- `IN_ACTION` — set manually by the assignee when work begins.
- `OUTCOME` — requester-facing resolution has been drafted, previewed and sent (§7.4).
- `CLOSED` — matter resolved. Sets `closed_at`.
- `ARCHIVED` — archive artefacts written to Blob (§10). Portal view becomes read-only except to ADMIN.

### Permitted transitions

| From | To | Actor | Guard |
|---|---|---|---|
| NEW | ALLOCATED | Any user (self-claim) or HR_LEAD/ADMIN (assign) | — |
| ALLOCATED | IN_ACTION | Assignee, HR_LEAD, ADMIN | **`category_id` must be set** |
| IN_ACTION | OUTCOME | Assignee, HR_LEAD, ADMIN | Only via the dispatch preview (§7.4) |
| OUTCOME | CLOSED | Assignee, HR_LEAD, ADMIN | — |
| CLOSED | ARCHIVED | Automated job only | — |

Any transition not in this table is rejected with HTTP 400 and an invalid-transition error. The state machine is enforced server-side; the UI must not be the only guard.

An attempt to move `ALLOCATED` → `IN_ACTION` without a category returns HTTP 400 with a message naming the missing field. Business unit is **never** a transition guard.

### Events that are not transitions

**First view.** Opening a ticket detail does not change status. On first open by any user, atomically set `first_viewed_at` and `first_viewed_by` if null.

**Reassignment.** `ALLOCATED` and `IN_ACTION` tickets may be reassigned without changing status. Records a row in `ticket_status_history` and `audit_log`. Does not re-send the allocation email to the requester; notifies the new assignee internally.

**"Not a request" close.** Available from `NEW`, `ALLOCATED` or `IN_ACTION`. Sets status directly to `CLOSED` with `close_reason = 'NOT_A_REQUEST'`, bypasses all requester notifications, requires no category, and is excluded from the default archive search view.

**Reversals.** ADMIN only. Any backward move (e.g. `CLOSED` → `IN_ACTION`) requires step-up re-authentication and a mandatory text reason, and writes to `audit_log`. An archived ticket must be reversed before it can be amended. A reversal into `IN_ACTION` still requires a category.

---

## 5. Data model

All timestamps `timestamptz`, stored UTC, displayed Australia/Melbourne.

### `categories` — administrator-maintained lookup

`id` (uuid PK), `name` (text unique), `sort_order` (int), `is_active` (boolean default true), `created_by`, `created_at`.

Seeded: Recruitment, Payroll, Leave, Workers Compensation, Return to Work, Employee Relations, Performance, Training, Compliance, Other.

**Not a database enum.** New categories are added through the admin UI with no migration. Categories are **deactivated, never deleted** — `is_active = false` removes them from selection lists but preserves them on historical tickets. The FK from `tickets` is `ON DELETE RESTRICT`. There is no delete path in the admin UI.

### `business_units` — administrator-maintained lookup

`id` (uuid PK), `name` (text unique), `sort_order` (int), `is_active` (boolean default true), `created_by`, `created_at`.

Seeded: Head Office, Retail, Transport, Depots, Other.

Same deactivate-never-delete rule and `ON DELETE RESTRICT` constraint as categories.

### `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ticket_no` | varchar(12) unique | `YYMMDDHHMM` plus 2-digit collision sequence. **Immutable — no UI or API path to edit** |
| `original_subject` | text | Immutable, as received. Denormalised from the first message for search |
| `subject` | text | Editable display subject, defaults to original |
| `requester_email` | citext | Immutable. Denormalised for indexing |
| `requester_name` | text | Immutable |
| `cc_recipients` | text[] | Editable — additional addresses for the outcome email |
| `received_at` | timestamptz | Immutable |
| `request_date` | date | Date component of `received_at` (Australia/Melbourne). **Drives archive path and retention clock** |
| `category_id` | uuid FK categories, nullable | Nullable on creation. Required to enter `IN_ACTION` |
| `business_unit_id` | uuid FK business_units, nullable | Optional throughout. Never blocks progression |
| `priority` | enum P1/P2/P3 | Editable |
| `sla_due_at` | timestamptz | Derived: `received_at` + priority hours. **Recalculated whenever `priority` changes** |
| `target_due_at` | timestamptz, nullable | Optional manual deadline |
| `target_due_reason` | text, nullable | **Mandatory whenever `target_due_at` is set.** Rejected with 400 if a date is supplied without one |
| `status` | enum | See §4 |
| `assigned_to` | uuid FK users, nullable | |
| `assigned_at` | timestamptz | |
| `first_viewed_at` | timestamptz, nullable | Set once |
| `first_viewed_by` | uuid FK users, nullable | Set once |
| `escalation_count` | integer default 0 | Capped at 3 by §8 |
| `last_escalated_at` | timestamptz, nullable | |
| `is_confidential` | boolean default false | |
| `confidential_set_by`, `confidential_set_at` | | |
| `is_legal_hold` | boolean default false | |
| `legal_hold_reason` | text, nullable | Mandatory when set |
| `legal_hold_set_by`, `legal_hold_set_at` | | |
| `legal_hold_cleared_by`, `legal_hold_cleared_at` | | |
| `outcome_for_requester` | text, nullable | The curated, requester-facing resolution. **The only ticket text ever emailed as an outcome** |
| `outcome_sent_at` | timestamptz | |
| `close_reason` | enum RESOLVED / NOT_A_REQUEST / REDIRECTED | |
| `closed_at`, `archived_at` | timestamptz | |
| `retention_purge_date` | date | `request_date + 7 years`, computed on insert |
| `is_deleted` | boolean default false | |
| `deleted_by`, `deleted_at`, `delete_reason` | | |
| `version` | integer not null default 0 | Optimistic lock. Incremented on every mutation |

Indexes: `status`, `assigned_to`, `request_date`, `retention_purge_date`, `requester_email`, `is_confidential`, `is_legal_hold`, `category_id`, `business_unit_id`, `sla_due_at`, `target_due_at`.

**Effective due date** is `LEAST(sla_due_at, COALESCE(target_due_at, sla_due_at))`. A target due date can therefore only bring a deadline **forward**, never extend it. This is intentional, not a defect: the SLA is a floor.

Email bodies do not live on `tickets`. The original email is the first row in `ticket_messages`.

### Concurrency control

**Self-assignment and pool claims** execute as a single atomic conditional update:

```sql
UPDATE tickets
   SET assigned_to = :userId,
       status = 'ALLOCATED',
       assigned_at = NOW(),
       version = version + 1
 WHERE id = :ticketId
   AND assigned_to IS NULL
   AND status = 'NEW'
```

Zero rows affected → **HTTP 409 Conflict**, forcing the UI to refresh ticket state. Never read-then-write.

**All other mutations** use optimistic locking: the client submits the `version` it loaded; the update includes `AND version = :version` and increments. Zero rows affected → **HTTP 409**, with current server state returned so the UI can show what changed.

### `ticket_messages` — the correspondence record

Every email in and out. This is what users see and what the archive contains.

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `ticket_id` | uuid FK tickets |
| `direction` | enum INBOUND / OUTBOUND |
| `message_type` | enum ORIGINAL / REPLY / ALLOCATION / OUTCOME / MANUAL |
| `graph_message_id` | text, unique nullable |
| `internet_message_id` | text, indexed, unique where not null |
| `conversation_id` | text, indexed |
| `from_address`, `from_name` | text |
| `to_recipients`, `cc_recipients` | text[] |
| `subject` | text |
| `body_text` | text |
| `body_html` | text — sanitised on render, never on store |
| `sent_by` | uuid FK users, nullable — outbound only |
| `received_at` / `sent_at` | timestamptz |
| `correlation_id` | uuid |

The original inbound email is `INBOUND` / `ORIGINAL`. Inbound replies on the same conversation append as `REPLY`. **Raw correspondence is never converted into internal notes.**

### `ticket_notes` — internal staff notes

`id`, `ticket_id`, `author_id`, `body`, `visibility` (enum INTERNAL / REQUESTER_VISIBLE, default INTERNAL), `created_at`, `is_current` (boolean), `supersedes_note_id` (nullable self-FK).

Append-only. Editing a note **inserts a new row** marked current, sets the prior row `is_current = false`, and links via `supersedes_note_id`. Nothing is ever UPDATEd or DELETEd. The UI shows the current version with an "edited — view history" affordance.

`visibility` is used in one place only: notes marked `REQUESTER_VISIBLE` appear as opt-in checkboxes in the outcome dispatch preview (§7.4). They are never sent automatically.

### `ticket_attachments`

`id`, `ticket_id`, `message_id` (uuid FK ticket_messages, nullable for staff uploads), `filename`, `declared_content_type`, `detected_content_type`, `size_bytes`, `blob_path`, `sha256`, `source` (EMAIL / UPLOAD), `scan_status` (PENDING / CLEAN / MALICIOUS / BLOCKED / SKIPPED), `block_reason` (nullable), `uploaded_by`, `created_at`.

### `ticket_status_history`

`id`, `ticket_id`, `from_status`, `to_status`, `from_assignee`, `to_assignee`, `actor_id`, `reason` (nullable, mandatory for reversals), `correlation_id`, `created_at`.

### `ticket_access` — confidential ACL

`ticket_id`, `user_id`, `granted_by`, `granted_at`. Composite PK.

### `audit_log`

`id`, `ticket_id` (nullable), `actor_id`, `action`, `entity`, `entity_id`, `before_json`, `after_json`, `access_basis` (nullable enum ASSIGNEE / ACL_GRANTED / HR_LEAD / ADMIN), `reason` (nullable), `correlation_id` (uuid, indexed), `ip`, `user_agent`, `created_at`.

**Append-only, enforced at the database.** The application's Postgres role holds INSERT and SELECT on this table only — no UPDATE, no DELETE grant. This is a migration concern, not a code concern. Retained 10 years.

Actions that must be audit-logged, at minimum: every status transition, reassignment, category change, business unit change, target due date change, priority change, note creation and revision, confidential flag set and clear, **legal hold set and clear**, soft-delete, archive amendment, bulk export, suppression rule change, user role change, outcome dispatch, and `CONFIDENTIAL_TICKET_VIEWED`.

### `email_log` — delivery telemetry only

`id`, `ticket_id`, `message_id` (uuid FK ticket_messages), `attempt_no`, `graph_response_code`, `status` (SENT / FAILED / RETRYING), `error`, `correlation_id`, `attempted_at`.

Never displayed to users. Never written to the archive. Purely for diagnosing send failures.

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

Every inbound API request and every background job run generates a `correlation_id` (uuid) at entry, or adopts one supplied in an `X-Correlation-Id` request header.

It propagates through: the request scope, all `audit_log` writes, `ticket_status_history`, `ticket_messages`, `email_log`, `suppression_log`, `job_runs`, Graph call logging, and every structured log line and exception sent to Application Insights (as `operation_Id` where the SDK permits).

The objective is that an administrator given one correlation ID can reconstruct every technical and user event for a single operation. An admin audit search by correlation ID is in scope.

**Not in scope:** persistent session tracking, distributed tracing infrastructure, or any correlation store beyond the columns above.

---

## 6. Authentication and authorisation

- NextAuth with the Azure AD provider, single tenant, restricted to the Tasco tenant ID.
- Session cookie `httpOnly`, `secure`, `sameSite=lax`, 8-hour expiry with sliding refresh.
- Middleware protects every route except `/api/graph/notifications` (validated by `clientState`), `/api/jobs/*` (validated by `X-Job-Key`), and the health endpoint.
- Every API route re-checks role server-side. Never trust a client-supplied role.
- **Step-up re-authentication** — a fresh Entra prompt (`prompt=login`) within the last 5 minutes, or reject — is required for: archive amendment, soft-delete, confidential flag clear, status reversal, user role change, **legal hold set**, and **legal hold clear**.
- Viewing a confidential ticket does **not** require step-up re-authentication or a stated reason for any role. It is audit-logged (§9).
- Direct GET on a confidential ticket by an unauthorised user returns 404 with no metadata in the body. Not 403 — a 403 confirms the ticket exists.
- Sign-out clears the session and redirects to the Entra logout endpoint.

**No local password store exists anywhere in this system.** If access for a non-Tasco user is ever required, use an Entra B2B guest invitation.

---

## 7. Email

### 7.0 Mailbox — migration from distribution group

**Ingestion address: `humanresources@tascopetroleum.com.au`.** No new public address is created. Recruiters, insurers, super funds, WorkCover, training providers, Fair Work and every historical signature block will keep using it regardless of what else is published.

`humanresources@` is currently a **distribution group**. A distribution group has no mailbox, so there is nothing for Graph to subscribe to, and it cannot be converted — it must be replaced. Three phases, because a direct swap creates a bounce window and an unrecoverable address gap.

**Phase 1 — parallel run (do first, zero risk)**
1. Create shared mailbox `hrtickets@tascopetroleum.com.au`.
2. Add it as a **member of the existing `humanresources@` distribution group**.
3. Mail to `humanresources@` now lands in the shared mailbox and continues to reach RJ, LF and DN exactly as today. Nothing changes for anyone.
4. Build and test ingestion against real live traffic. Rollback is removing one group member.

**Phase 2 — remove personal delivery (at go-live)**
1. Remove the individual staff members from the distribution group, leaving the shared mailbox as the only member.
2. HR now receives requests only through the portal.
3. Rollback is re-adding the members.

**Phase 3 — address consolidation (at or shortly after go-live, out of hours)**
1. Delete the now single-member distribution group.
2. Set `humanresources@tascopetroleum.com.au` as the **primary SMTP address** on the shared mailbox, retaining `hrtickets@` as an alias.
3. Required, not cosmetic: until this is done, outbound replies come from `hrtickets@`, which looks wrong to requesters and breaks reply-threading expectations.
4. Schedule out of hours — there is a short window between deleting the group and assigning the address where mail will bounce.
5. Warn staff that Outlook autocomplete caches the old group object; the cached entry must be cleared or replies will misroute for days.

**Historical mail.** Because the address has been a distribution group, there is no central mailbox history — each member holds their own copies. Nothing to migrate.

**Graph targets the shared mailbox**, not the group: `/users/{hrticketsMailboxId}/mailFolders/inbox/messages`.

### 7.0.1 Noise control

1. **Exchange inbox rules** move known noise senders to a `Not Tickets` folder before the Graph subscription (scoped to Inbox only) ever sees them. Maintained by HR in Outlook, no code change.
2. **Application suppression list** — sender addresses, domains, subject patterns, maintained by ADMIN in the portal. Matches are written to `suppression_log`, never silently dropped.
3. **"Not a request" close** for whatever slips through.

### 7.0.2 Cut-over and adoption

- Ingestion begins at a nominated go-live timestamp. **No message received before that timestamp is ingested.**
- From Phase 2, the mailbox is a transport layer, not a workspace. Removing individual members from the distribution group is what enforces this. No application logic is built to detect or police staff replying from Outlook — the architecture removes the opportunity rather than policing the behaviour. See §17.
- Outbound sends set `saveToSentItems: true` so the shared mailbox retains a complete correspondence trail independent of the application.

### 7.1 Inbound ingestion — webhook (primary)

- Graph change-notification subscription on `/users/{HR_MAILBOX_ID}/mailFolders/inbox/messages`, `changeType=created`.
- `notificationUrl` = `https://hr.tascopetroleum.com.au/api/graph/notifications`.
- Implement the validation handshake: echo `validationToken` as `text/plain`, HTTP 200, within 10 seconds.
- Validate `clientState` on every notification. Missing or mismatched → **HTTP 400**, log, do not process.
- Respond 202 immediately, process asynchronously.
- Rate-limit the endpoint. It is publicly reachable by necessity.
- Mail subscriptions expire at roughly 4230 minutes. The renewal job runs every 12 hours and recreates the subscription if renewal fails.

### 7.2 Inbound ingestion — delta poll (safety net)

Webhooks drop. This is not optional.

A poller runs **every 15 minutes** using a Graph delta query against the inbox, comparing `internet_message_id` against `ticket_messages`, and creating anything the webhook missed. Idempotency is enforced by the unique index.

### 7.3 Ticket creation rules

Evaluated in order:

1. **Suppression check** — match against `suppression_rules`. On match, write `suppression_log` and stop.
2. **Auto-reply check** — headers containing `Auto-Submitted: auto-*` or `X-Auto-Response-Suppress` create no ticket.
3. **Threading** — if `conversation_id` matches an existing non-archived ticket, append a `ticket_messages` row with `message_type = REPLY`, notify the assignee internally, and stop.
4. **Create ticket** —
   - `original_subject` ← email subject; empty → `(no subject)`.
   - `requester_email` / `requester_name` ← `from.emailAddress`.
   - Original email stored as the first `ticket_messages` row (`INBOUND` / `ORIGINAL`).
   - HTML stored raw; sanitised with a strict allowlist **at render time**. This is untrusted input from anyone who can email the address.
   - `category_id` and `business_unit_id` are left null. Neither is inferred or guessed from subject content.
   - **Priority:** subject contains "urgent" (case-insensitive) → P1; contains "action" → P2; otherwise P3. `sla_due_at` computed from `received_at` plus the priority hours in §8.
   - **Ticket number:** `YYMMDDHHMM` from `received_at` in Australia/Melbourne plus a 2-digit sequence starting `01` for same-minute collisions. Generated inside the insert transaction with a unique-constraint retry.

### 7.3.1 Attachment handling

**Defender for Storage malware scanning is the primary control.** Extension and content-type checks are supporting controls, not the security boundary.

| Rule | Behaviour |
|---|---|
| Size | Reject over 25MB |
| **Executable extensions** — `.exe .dll .bat .cmd .com .ps1 .js .vbs .scr .jar .msi .hta .lnk` | Blocked outright. `scan_status = BLOCKED`, `block_reason` recorded, system note added to the ticket so nothing is silently lost |
| **Container formats with no legitimate HR use** — `.iso .img .vhd .vhdx .rar .7z .cab .ace` | Blocked outright, same treatment. These are standard malware delivery containers |
| **`.zip`** | **Accepted.** Law firms, recruiters, insurers and payroll providers routinely send zipped document packs; blocking them would create daily friction. Stored and quarantined until Defender returns `CLEAN` |
| Content sniffing | Record `declared_content_type` and detect actual type from magic bytes. A mismatch between extension, declared type and detected type sets `scan_status = BLOCKED` with reason `TYPE_MISMATCH` |
| Inline images under 10KB | Ignored (signature logos) |

**Server-side unpacking of archives is explicitly forbidden.** Zip bombs and path traversal in archive extraction are a larger exposure than the threat being addressed. Archives are stored, scanned by Defender, and downloaded whole.

**No attachment is downloadable while `scan_status` is `PENDING`.** The UI shows a "scanning" state. `MALICIOUS` and `BLOCKED` attachments are never downloadable and display the reason.

### 7.4 Outbound communications

All outbound mail sends **from the shared mailbox** via Graph `sendMail`, with `In-Reply-To` and `References` headers set to the original ingestion message. Every send writes a `ticket_messages` row (`OUTBOUND`) and one or more `email_log` rows, both carrying the request's `correlation_id`.

| Trigger | Recipients | Content |
|---|---|---|
| Allocation | Requester | Ticket number, display subject, assigned officer display name, expected response timeframe |
| Outcome | Requester + `cc_recipients` | Ticket number, display subject, the curated `outcome_for_requester` text, plus any notes the officer explicitly ticked. **Internal staff notes are never dumped or sent automatically** |
| SLA escalation | Assignee, CC the HR mailbox | Ticket number, elapsed hours, priority, **which deadline was breached (SLA or target due)**, direct portal URL |

Failed sends retry three times with backoff, then surface as a banner on the ticket and an entry in the ADMIN failed-sends view.

#### Outcome dispatch preview — mandatory

The `IN_ACTION` → `OUTCOME` transition and the outcome email are a single user-confirmed action. There is no path to send an outcome without this step.

1. The officer drafts `outcome_for_requester` — free text, written for the requester.
2. The UI presents a **dispatch preview modal** showing: `To` address; `CC` addresses, editable; subject line; the final rendered body exactly as it will send; checkboxes for any `REQUESTER_VISIBLE` notes, unticked by default; and the list of attachments to be included.
3. The email dispatches and the status transitions only on explicit confirmation: **"Approve & Send Outcome"**.

No autosave of the draft is implemented (§17). A navigation-away warning is shown if the draft is non-empty.

This exists because HR notes routinely name other employees, record manager commentary, and sometimes contain legal advice. Automatic inclusion of note history in requester-facing email is a privacy breach, not a convenience.

---

## 8. SLA, target due dates and escalation

### SLA — elapsed hours

| Priority | Threshold from `received_at` |
|---|---|
| P1 | 48 elapsed hours |
| P2 | 168 elapsed hours (7 days) |
| P3 | 336 elapsed hours (14 days) |

**Elapsed clock time only.** No weekends, public holidays or business-calendar logic (§17). `sla_due_at` is recalculated whenever `priority` changes.

### Target due date

`target_due_at` is an optional manual deadline set by the assignee, HR_LEAD or ADMIN, for matters with a specific external deadline — a Fair Work response date, a WorkCover deadline, a return-to-work review. `target_due_reason` is mandatory whenever a date is set.

Both `target_due_at` and `target_due_reason` changes are audit-logged with before and after values.

### Overdue determination

A ticket is overdue when **either** `sla_due_at` **or** `target_due_at` has passed, whichever comes first, and the status is not `CLOSED` or `ARCHIVED`. A target due date can only bring the effective deadline forward. It cannot extend an SLA.

### Escalation

Runs daily at **06:00 Australia/Melbourne**. Overdue tickets generate one escalation email per day, incrementing `escalation_count`, capped at **3 in total per ticket** regardless of which deadline breached or whether both did. After the cap, the ticket appears on the "Overdue — escalated" view for the HR Lead and no further email is sent. Unallocated overdue tickets escalate to the HR Lead directly.

The escalation email states which deadline was breached and by how long.

---

## 9. Confidential tickets

Default is an **open pool**: all users see all tickets and may self-assign. The confidential flag is a deliberate exception, not the norm.

- Settable by HR_LEAD or ADMIN only, at any point in the lifecycle.
- When set, visible only to: the user who set it, all ADMINs, the current assignee, and anyone explicitly granted via `ticket_access`.
- Hidden entirely from pool, list and search views for everyone else — not greyed out, not a redacted stub. Direct API access returns 404.
- Excluded from bulk exports unless the exporter is an ADMIN; that export is audit-logged.
- Clearing the flag requires ADMIN with step-up re-authentication.

### 9.1 Confidential access logging

Every view of a confidential ticket writes an `audit_log` row with `action = CONFIDENTIAL_TICKET_VIEWED` and `access_basis` set to one of:

- `ASSIGNEE` — the viewer is the current assignee
- `ACL_GRANTED` — the viewer holds an explicit `ticket_access` grant
- `HR_LEAD` — the viewer holds the HR_LEAD role
- `ADMIN` — the viewer holds the ADMIN role

Where more than one basis applies, record the most specific (assignee over ACL over role).

**No break-glass mechanism is implemented.** JDL and RGL are authorised ADMIN users with legitimate access under the governance decision in §9.2. They are not required to enter a reason, acknowledge a warning, or perform step-up re-authentication merely to view a confidential ticket. The audit record is the control.

### 9.2 Admin exclusion — decision: vetoed

An option to exclude a named ADMIN from an individual confidential ticket was proposed and **rejected by the operator**. Both ADMINs retain full visibility of every ticket without exception. Tasco is a private company and the stated position is full transparency.

Basis: whistleblower disclosures are directed to a separate dedicated address under Tasco's whistleblower policy and do not route through this system.

**Required operational control.** Statutory whistleblower protections attach to a disclosure made to an eligible recipient — directors, Company Secretary, senior managers — regardless of the address it arrives at. A misdirected disclosure landing in the HR mailbox is still protected, and will sit where both admins can read it. Document this procedure and include it in portal user guidance:

1. Any user identifying an inbound message as a whistleblower disclosure stops immediately and does not open, forward or discuss it further.
2. The Company Secretary redirects it to the designated whistleblower channel.
3. The ticket is soft-deleted with `close_reason = REDIRECTED` and reason "Redirected — whistleblower channel". Content leaves portal views; the fact of receipt survives in `audit_log`.
4. Confirm the whistleblower policy names the separate address and that it is published where employees will find it under stress.

---

## 10. Archive, legal hold and retention

### Archive trigger
On transition to `CLOSED`, a nightly job (plus on-demand for ADMIN) writes the archive artefacts and sets status `ARCHIVED`.

**Transactional requirement:** the ticket is marked `ARCHIVED` only after all blob writes succeed. A failed or partial blob write leaves the ticket `CLOSED` for retry on the next run, and logs the failure. Never mark archived optimistically.

### Archive location
Container `hr-archive`, path derived from **`request_date`, not closure date**:

```
hr-archive/{YYYY}/{MM}/{ticket_no}/
    ticket.txt
    ticket.xml
    attachments/{original filenames}
```

`ticket.txt` — the complete human-readable record:
- Header: ticket number, subject, requester, **category**, **business unit / location**, dates, priority, `sla_due_at`, `target_due_at` and reason where set, assignee, first viewed, final status and close reason, **legal hold status and reason where applicable**
- **Correspondence and internal notes interleaved in chronological order**, each entry labelled `[EMAIL IN]`, `[EMAIL OUT]` or `[INTERNAL NOTE]`, with author or sender and timestamp
- Edited notes carry an `(edited)` marker; current versions only
- Outcome text as sent
- Full status history with timestamps and actors
- Attachment manifest with SHA-256 hashes and scan status

`ticket.xml` — the same content in a structured schema, with an XSD committed to the repo. Correspondence and notes are distinct element types. Category, business unit, both due dates and legal hold state are discrete elements, not free text, so archived records remain machine-analysable after purge from the database.

### Legal hold

Prevents automatic destruction of records potentially relevant to litigation, Fair Work proceedings, WorkCover matters, regulatory investigation or another formal dispute.

- **ADMIN only.** Setting and clearing both require step-up re-authentication and a mandatory text reason, and are audit-logged with before and after state.
- While `is_legal_hold = true`:
  - The retention purge **excludes the ticket entirely** — database rows and blob artefacts both.
  - **Soft-delete is blocked** and returns HTTP 409 with an explanatory message. Deleting a record under hold is the precise act a hold exists to prevent.
  - Archive amendment remains available to ADMIN, using the existing versioned-alongside mechanism in which originals are never overwritten.
  - The ticket displays a prominent banner: **`LEGAL HOLD — RETENTION PURGE SUSPENDED`**, with the reason and the setting user and date.
- Clearing a hold records `legal_hold_cleared_by` and `legal_hold_cleared_at` and restores normal retention. A ticket already past its `retention_purge_date` when the hold is cleared is purged on the next nightly run.
- A hold may be placed on a ticket at any lifecycle stage, including `ARCHIVED`.

**Admin legal holds view.** A dedicated view lists every ticket with an active hold, showing ticket number, subject, who set it, when, the reason, and the age of the hold. A hold nobody reviews becomes indefinite retention of personal data, which is a records-management problem in its own right. The view sorts oldest first and flags holds over 12 months old for review.

### Retention
- `retention_purge_date = request_date + 7 years`.
- Nightly purge hard-deletes database rows and blob artefacts where `retention_purge_date < today` **AND `is_legal_hold = false`**, writing one purge record per ticket to `audit_log` (ticket number, subject hash, category, purge timestamp, correlation ID) so destruction is provable.
- `audit_log` is retained 10 years.
- Soft-deleted tickets are **still purged on the same schedule** unless under legal hold. Soft delete is not a retention override; legal hold is.
- "Not a request" closures are archived and retained identically, but excluded from the default archive search view.

### Amendments to archived tickets
ADMIN only, step-up re-authentication, mandatory reason. Original artefacts are **never overwritten**: write a new versioned set alongside (`ticket.txt`, `ticket.v2.txt`, …) and record before and after state in `audit_log`. An archived ticket must first be reversed out of `ARCHIVED` to amend ticket data; the artefact rewrite occurs on re-archive.

### Deletion
Soft delete only. Sets `is_deleted`, actor, timestamp and mandatory reason. Removed from all views except an ADMIN "Deleted" view. **Blob artefacts are not removed.** There is no hard-delete path in the application — hard deletion occurs only via the retention job. Blocked entirely while legal hold is active.

---

## 11. Export

- **Per-ticket:** any user with access exports a ticket as `.txt` (same format as the archive artefact, including category, business unit, both due dates and legal hold status). Checkbox to include attachments, producing a `.zip`. Attachments not in `CLEAN` status are excluded from the zip with a note in the manifest.
- **Bulk (ADMIN / HR_LEAD):** CSV of ticket metadata over a date range, including category, business unit, priority, both due dates, overdue flag, assignee, first-view and closure timestamps. Confidential tickets excluded unless ADMIN. Every bulk export is audit-logged with the filter criteria used.
- **Archive search:** full-text over archived tickets by ticket number, requester, subject, category, business unit, date range, assignee, legal hold status. "Not a request" closures excluded by default, with a toggle to include.
- **Audit search (ADMIN):** by ticket, actor, action, date range, and **correlation ID**.

---

## 12. Scheduled jobs

Exposed as `POST /api/jobs/{name}`, authenticated by a Key Vault–stored shared secret in an `X-Job-Key` header, invoked by Azure Logic App recurrence triggers. A missing or invalid key returns **401**. Each job is idempotent, generates a `correlation_id` at entry, and writes a `job_runs` row.

| Job | Schedule |
|---|---|
| `graph-subscription-renew` | Every 12 hours |
| `mailbox-delta-poll` | Every 15 minutes |
| `sla-escalation` | Daily 06:00 Australia/Melbourne |
| `archive-closed` | Daily 01:00 |
| `retention-purge` | Daily 02:00 |
| `sync-users` | Daily 03:00 |

### 12.1 Ingestion liveness alert

One Application Insights alert rule, not a dashboard: fire to JDL if no successful `mailbox-delta-poll` run has been recorded in `job_runs` within 60 minutes.

The entire business case is that nothing is missed. A silently dead poller does not fail loudly — it simply stops creating tickets while everyone assumes the system is working.

---

## 13. UI

Views: **Pool** (unassigned, default landing), **My tickets**, **All open**, **Overdue**, **Archive search**, **Admin** (users, categories, business units, suppression rules, suppression log, failed sends, **legal holds**, deleted, audit log).

Ticket detail:
- Header: ticket number (visually locked, non-editable), status chip, priority, category, business unit, confidential badge, first-viewed stamp
- **`LEGAL HOLD — RETENTION PURGE SUSPENDED`** banner, prominent and above the fold, where active, showing reason, who set it and when
- **Deadlines panel** showing both `sla_due_at` and `target_due_at` where set, each labelled, with the effective (earlier) deadline visually emphasised and time remaining or overdue duration
- **Correspondence thread** — inbound and outbound messages chronologically, sanitised HTML render with raw text toggle, clearly distinguished from notes
- **Internal notes** — separate panel, chronological, author and timestamp, `(edited)` marker with revision history modal, visibility selector on each note
- Metadata panel — editable per role, including category (with a visible "required before starting work" hint while null) and business unit (marked optional)
- Status timeline with timestamps and actors
- Attachments — download, scan status (`scanning` / `clean` / `blocked` with reason), staff upload
- Audit tab (ADMIN / HR_LEAD)
- Actions: claim, reassign, start action, draft outcome, close, "not a request" close, export, flag confidential, set/clear legal hold (ADMIN)

Requirements: A4 print stylesheet for ticket detail; keyboard navigable; Tasco colour palette; 409 conflicts surface as a clear "this ticket changed — reloading" state, never a silent overwrite; attempting to start action without a category shows an inline field error, not a generic failure; no client-side storage of ticket content beyond the session.

---

## 14. Manual tenant work — Claude Code cannot do these

These gate the build.

0. **Mailbox migration (§7.0).** Longest lead item. Phase 1 — create `hrtickets@tascopetroleum.com.au` as a shared mailbox and add it as a member of the `humanresources@` distribution group — should be done first. Identify and remove any auto-forwarding rules on member mailboxes.
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
5. **Azure subscription, resource group and spend approval** (Australia East). Enable Defender for Storage on the storage account.
6. **DNS:** CNAME `hr.tascopetroleum.com.au` → App Service, plus managed certificate. No MX changes.
7. **SharePoint tile** on the HR site linking to the portal.
8. **Sign-off** by JDL as Company Secretary on: the 7-year retention rule, the legal hold procedure and who may request a hold, the whistleblower redirection procedure (§9.2), and the privacy and records position.

---

## 15. Acceptance tests

**Ingestion**
- [ ] Email to the HR address creates a ticket within 60 seconds, with attachments
- [ ] Webhook deliberately broken → delta poller still creates the ticket within 15 minutes
- [ ] Duplicate delivery of the same message creates exactly one ticket
- [ ] A reply on an existing thread appends a `ticket_messages` row, does not create a second ticket, and does not become an internal note
- [ ] Inbound webhook with invalid or missing `clientState` is rejected with HTTP 400
- [ ] A sender matching a suppression rule creates no ticket but does appear in `suppression_log`
- [ ] No message received before the go-live timestamp is ingested
- [ ] Mail addressed to `humanresources@` reaches the shared mailbox during Phase 1 parallel run

**Classification**
- [ ] `ALLOCATED` → `IN_ACTION` without a category fails with HTTP 400 naming the missing field
- [ ] `ALLOCATED` → `IN_ACTION` succeeds with a category and no business unit
- [ ] A new category added through the admin UI is immediately selectable with no migration or restart
- [ ] A category in use cannot be deleted; deactivating it removes it from selection but leaves existing tickets intact and correctly displayed
- [ ] Category and business unit changes appear in `audit_log` with before and after values

**Identity and state**
- [ ] Ticket number is unique, correctly formatted, and has no edit path in UI or API
- [ ] Two users simultaneously claiming an unassigned ticket → exactly one success, one HTTP 409
- [ ] A stale-version update is rejected with HTTP 409 and current state returned
- [ ] Patching status from `NEW` directly to `CLOSED` fails with HTTP 400 invalid transition
- [ ] First view sets `first_viewed_at` / `first_viewed_by` once and does not change status
- [ ] Reassignment does not re-send the allocation email to the requester

**Deadlines**
- [ ] Setting `target_due_at` without `target_due_reason` is rejected with HTTP 400
- [ ] A ticket with a target due date earlier than its SLA deadline becomes overdue on the target date
- [ ] A ticket with a target due date later than its SLA deadline still becomes overdue on the SLA deadline
- [ ] Changing priority recalculates `sla_due_at`
- [ ] Escalation emails cap at three per ticket even when both deadlines breach
- [ ] The escalation email names which deadline was breached
- [ ] Target due date changes appear in `audit_log`

**Communications**
- [ ] Allocation email sends on first entry to `ALLOCATED`
- [ ] Outcome cannot be sent without passing through the dispatch preview and explicit confirmation
- [ ] Outbound outcome contains strictly `outcome_for_requester` plus any explicitly ticked notes, and never any unticked `ticket_notes` row
- [ ] Reply to an outbound notification threads back onto the same ticket
- [ ] Outbound messages appear in the shared mailbox Sent Items
- [ ] "Not a request" close sends no requester notification and requires no category

**Security**
- [ ] Attempt to UPDATE or DELETE `audit_log` as the app role fails at the database level
- [ ] Confidential ticket is invisible to a non-granted HR_OFFICER in pool, list, search and export
- [ ] Direct GET on a confidential ticket by an unauthorised user returns 404 with no metadata disclosure
- [ ] Every confidential ticket view writes `CONFIDENTIAL_TICKET_VIEWED` with the correct `access_basis`
- [ ] An ADMIN viewing a confidential ticket is not prompted for a reason or step-up re-authentication
- [ ] Non-admin calling an admin API route directly receives 403
- [ ] Step-up re-authentication is enforced on all seven destructive actions, including legal hold set and clear
- [ ] Any `/api/jobs/*` call without a valid `X-Job-Key` returns 401
- [ ] A disabled Entra account cannot sign in

**Attachments**
- [ ] A `.exe` attachment is blocked, a system note is added, and nothing is silently lost
- [ ] An `.iso` attachment is blocked
- [ ] A `.zip` attachment is accepted, quarantined, and downloadable only once `scan_status = CLEAN`
- [ ] An attachment in `PENDING` status cannot be downloaded
- [ ] An attachment flagged `MALICIOUS` cannot be downloaded and displays the reason
- [ ] A file renamed `.pdf` but containing an executable is blocked with reason `TYPE_MISMATCH`
- [ ] No server-side archive extraction occurs anywhere in the codebase

**Legal hold**
- [ ] Only ADMIN can set or clear legal hold; HR_LEAD receives 403
- [ ] Setting legal hold without a reason is rejected
- [ ] **A ticket with `request_date` 7 years and 1 day ago and `is_legal_hold = true` is NOT purged by the retention job**
- [ ] The same ticket, after the hold is cleared, IS purged on the next run
- [ ] Soft-delete of a ticket under legal hold returns HTTP 409
- [ ] The legal hold banner renders on the ticket with reason, actor and date
- [ ] Legal hold set and clear both appear in `audit_log` with reasons

**Audit and correlation**
- [ ] A single API request produces `audit_log`, `ticket_status_history` and `email_log` rows sharing one `correlation_id`
- [ ] A background job run produces `job_runs` and downstream rows sharing one `correlation_id`
- [ ] Admin audit search by correlation ID returns the complete event set for that operation

**Archive and retention**
- [ ] Archive writes `ticket.txt`, `ticket.xml` and attachments to `{request_date YYYY}/{MM}/`
- [ ] `ticket.txt` interleaves correspondence and internal notes chronologically with correct labels
- [ ] `ticket.txt` and `ticket.xml` include category, business unit, both due dates and legal hold status
- [ ] `ticket.xml` validates against the supplied XSD
- [ ] A simulated Blob write failure during archiving leaves the ticket `CLOSED`, not `ARCHIVED`
- [ ] Note edit creates a revision; original remains retrievable
- [ ] Soft-deleted ticket disappears from views, remains in Blob, remains on the purge schedule
- [ ] Retention purge removes a seeded ticket dated 7 years + 1 day ago and logs it
- [ ] Ticket detail prints cleanly to A4

**Durability**
- [ ] Blob soft delete is enabled and a deleted archive blob is recoverable within the retention window
- [ ] A point-in-time database restore to a timestamp 30 days prior succeeds in a test resource group

---

## 16. Build order

1. **Scaffold and data layer** — repo, Prisma schema including `categories` and `business_units` with seed data, migrations (including the `audit_log` grant restriction and FK RESTRICT constraints), local Postgres via Docker, `STATUS.md`
2. **Auth and RBAC** — NextAuth Azure AD, middleware, role derivation, permission helpers, step-up re-auth, 403/404 handling, correlation ID middleware
3. **Core UI and state machine** — pool, lists, ticket detail, correspondence and notes panels, category and business unit selection, transition enforcement including the category guard, optimistic locking, atomic claim, audit writes
4. **Graph ingestion** — webhook with `clientState` validation, delta poller, suppression, threading, attachment handling, content sniffing and scan status
5. **Outbound and SLA** — Graph sendMail, templates, threading headers, dispatch preview modal, target due dates, escalation job with cap
6. **Confidential, legal hold, export, archive, retention** — ACL enforcement, `CONFIDENTIAL_TICKET_VIEWED` logging with access basis, legal hold set/clear and purge exclusion, transactional archive writer, XSD, purge job
7. **Infrastructure** — Bicep for all Azure resources, Key Vault, managed identity, Logic App timers, Defender for Storage, backup and blob soft-delete configuration per §2.1, liveness alert, restore test
8. **CI/CD and hardening** — GitHub Actions with OIDC, CSP headers, webhook rate limiting, Application Insights correlation propagation
9. **Full acceptance pass against §15**

Stages 1–3 proceed before §14 completes, using seeded data and a mocked auth provider. Stage 4 onward requires §14 items 0–3.

---

## 17. Future enhancements — explicitly outside initial build scope

**Claude Code must treat every item below as a non-goal.** Do not implement, scaffold, stub, add placeholder routes or database columns, or "prepare for" any of them unless explicitly instructed in a future version of this specification.

| Item | Status |
|---|---|
| KPI / management dashboard | Deferred to Phase 2 |
| Advanced reporting and analytics | Deferred to Phase 2 |
| Ticket watchers / followers | Deferred — notification, confidentiality and permission complexity not justified at five users |
| Outcome draft autosave | Deferred — usability enhancement only |
| Business-hours / public-holiday SLA engine | Rejected — elapsed-hours SLA plus optional target due date is sufficient |
| Outlook reply detection | Rejected — solved structurally by the mailbox migration (§7.0.2), not worth policing in code |
| Break-glass confidential access | Rejected — see §9.1 |
| Admin exclusion on confidential tickets | Rejected — see §9.2 |
| HRIS or payroll integration | Out of scope |
| Self-service employee portal | Out of scope |
| Mobile application | Out of scope |
| External / non-Tasco user access | Out of scope |

### Data sufficiency for deferred reporting

The dashboard is deferred deliberately: collect clean operational data first, then determine which measures HR actually uses. The schema in §5 already supports, without further change:

| Measure | Source |
|---|---|
| Open / closed / overdue counts | `tickets.status`, `sla_due_at`, `target_due_at` |
| Average time to first view | `first_viewed_at` − `received_at` |
| Average time to first response | earliest `OUTBOUND` `ticket_messages.sent_at` − `received_at` |
| Average resolution time | `closed_at` − `received_at` |
| Tickets by assignee | `tickets.assigned_to` |
| Tickets by category | `tickets.category_id` |
| Tickets by business unit / location | `tickets.business_unit_id` |
| Confidential ticket counts | `tickets.is_confidential` |
| Reassignment frequency | `ticket_status_history` |

No additional columns are required to build the dashboard later. Note that time to first view and time to first response are distinct measures; both are available.

---

## 18. Superseded decisions

Recorded so they are not reintroduced:

- Render.com hosting → Azure App Service (data residency and governance)
- SendGrid inbound parse and MX redirection → Microsoft Graph
- Local username/password accounts with an administrator-managed user list → Entra ID SSO with group-derived roles
- Shared administrator password → named ADMIN role with step-up re-authentication
- Editable ticket number → immutable
- Ticket number format `YYYYMMDDHHSS` (malformed — hours then seconds, no minutes) → `YYMMDDHHMM` plus 2-digit sequence
- Freely rewritable notes → append-only with revision history
- Hard delete → soft delete, hard purge only via the retention job, blocked under legal hold
- `humanresources@` as a distribution group → shared mailbox via the three-phase migration in §7.0
- Admin exclusion on confidential tickets → vetoed (§9.2)
- `VIEWED` as a lifecycle status → `first_viewed_at` / `first_viewed_by` event stamps
- Inbound replies appended as internal notes → separate `ticket_messages` correspondence ledger
- Outcome email containing full note history → curated `outcome_for_requester` with mandatory dispatch preview
- Email bodies stored on `tickets` → stored in `ticket_messages`
- Category as a database enum → administrator-maintained `categories` lookup table
- Blanket blocking of all archive formats → `.zip` accepted and quarantined; `.iso .img .vhd .rar .7z .cab` blocked; no server-side extraction
- Platform-default backup retention → explicit 35-day PITR, geo-redundancy, blob soft delete and versioning (§2.1)
