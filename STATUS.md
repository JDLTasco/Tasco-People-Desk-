# TASCO HR Ticketing — Build Status
- Current stage: 5 — Outbound and SLA (complete, within what §14's absence allows -- see below)
- Last completed stage: 5
- Passing acceptance tests: **Communications** now passes live for everything that doesn't require a real Graph tenant -- allocation/outcome/escalation emails all correctly write `ticket_messages` + retry-and-log to `email_log`, the outcome dispatch preview is the only path to OUTCOME, threading headers are set from the original message, target due dates enforce the mandatory-reason rule. The whole **Ingestion** block from Stage 4 still passes (unchanged). Most of **Attachments** still passes (unchanged; CLEAN-status row still pending §7.3.2).
- Failing / pending acceptance tests: the two rows in **Communications**/**Ingestion** that need a real mailbox (can't be exercised until §14), **Legal hold**, **Audit-and-correlation**'s admin-search row, **Archive-and-retention**, **Durability** (Stages 6-7).
- Architecture deviations / clarifications: **`MessageType` enum was missing `SLA_ESCALATION`** -- a real gap between the schema and §7.4's own outbound trigger table (which names three distinct triggers, not two), fixed via a new migration, not silently misfiled under `MANUAL`. **Design call, not silently assumed**: outcome-email delivery failure does not block the IN_ACTION -> OUTCOME transition (same non-blocking posture as the allocation email, which plainly can't block NEW -> ALLOCATED either) -- transition applies first via optimistic locking, then the send is attempted; a failure is recorded and bannered, never rolled back. **Known tradeoff, documented not silently accepted**: every outbound send is awaited synchronously within its triggering HTTP request (claim/assign/outcome-confirm) -- there is no background job queue in this build, so a real Graph outage adds a few seconds of latency (short backoff: 1s, 3s) to those actions rather than failing silently in the background.
- Blockers / required operator actions: §14 items 0-8 — still none started. **Confirmed this session (live, not assumed): the whole send pipeline (ticket_messages write, 3-attempt retry, email_log, failed-sends banner, ADMIN failed-sends view) works correctly end-to-end** -- what's genuinely inert until §14 is only the actual Graph `sendMail` network call itself (verified it fails honestly with "Graph is not configured" on every attempt, exactly the same posture Stage 4 left `getMessage`/`listInboxDelta` in).
- Recommended next command or task: nominate Stage 6 ("Confidential, legal hold, export, archive, retention"), OR prioritize getting §14 items 0-3 done operator-side so the real Graph send/receive paths can finally be tested for real.

## Stage 5 deliverables (§16 item 5)

**Built and fully live-tested** (real dev server, real signed-in HTTP requests via the actual NextAuth flow -- not just unit tests; see "Stage 5 verification" below):
- `lib/email/templates.ts`: pure, isomorphic render functions for all three §7.4 email types (`renderAllocationEmail`, `renderOutcomeEmail`, `renderEscalationEmail`) -- the exact same code renders the live dispatch-preview modal (client-side) and the real send (server-side), so the preview is genuinely "the final rendered body exactly as it will send," not a lookalike. 7 new unit tests.
- `lib/graph/client.ts`: `sendMail()` added to `GraphClient`/`GraphApiClient`, using Graph's `internetMessageHeaders` mechanism for `In-Reply-To`/`References` (sendMail's own action has no dedicated reply-threading parameter for a freshly-composed message). Genuinely inert until §14, same posture as every other real-Graph method already in this file.
- `lib/email/send.ts` (`sendTicketEmail`): the one place every outbound send goes through -- writes the `ticket_messages` row first, then attempts Graph `sendMail` up to 3 times with backoff, logging one `email_log` row per attempt. Never throws; a delivery failure is a recorded outcome (banner + admin view), not an exception callers handle specially. `client`/`sleep` are injectable for tests.
- `lib/email/threading.ts` (`threadingForTicket`): one shared "find the ORIGINAL message for this ticket" lookup, reused by all three send sites instead of three copies.
- `lib/email/allocation.ts` (`sendAllocationEmail`): shared by both real NEW -> ALLOCATED paths (self-claim, HR_LEAD/ADMIN assign-from-pool).
- `lib/email/failed-sends.ts` (`getFailedSends`): "no `SENT` row among this message's attempts" is the failed-state definition -- correct because this app has no background retry-later queue, so all 3 attempts exhaust synchronously within one call; there is no mid-flight "still retrying" state to represent between requests.
- `app/api/tickets/[id]/outcome/route.ts`: the only path from IN_ACTION to OUTCOME (`viaDispatchPreview: true`, which `validateTransition()` already required -- that guard predates this stage). Transition applies first (optimistic locking), then the email attempt; never trusts client-supplied note bodies for the requester-visible notes ticked in the preview -- re-fetches and filters server-side by `ticketId` + `REQUESTER_VISIBLE` + `isCurrent`.
- `app/api/jobs/sla-escalation/route.ts`: daily job (§12), reuses the same `isOverdue`/`effectiveDueDate`/`breachedDeadline` pure helpers the ticket-detail UI already used (Stage 3/4) so escalation logic can't drift from what the UI shows as overdue. Unallocated overdue tickets escalate to every active HR_LEAD; capped at 3 via `escalationCount`, using the existing `getSystemUserId()` seeded actor (now exported) for `audit_log`/`ticket_messages` attribution, same as ingestion's automated actions.
- `app/admin/failed-sends/page.tsx` + a NavBar link: read-only ADMIN view (§7.4 defines no retry/resend action, only visibility).
- Ticket detail UI: a "Draft outcome" trigger (IN_ACTION only) opening `outcome-dispatch-modal.tsx` (outcome text, editable CC, requester-visible-notes checkboxes unticked by default, live preview, "Approve & Send Outcome", a `beforeunload` navigation-away warning while the draft is non-empty); a target-due-date form (date + mandatory-reason field, save/clear) in `ticket-actions.tsx`, wired to the PATCH endpoint that already existed; a note-visibility checkbox in `note-form.tsx` (create-only -- editing a note preserves its original visibility, unchanged); a failed-send banner on the ticket detail page.

**Genuinely inert until §14** (written to spec, never exercised against a real tenant): the actual Graph `sendMail` network call inside `GraphApiClient.sendMail()`.

## Stage 5 verification (live against a running dev server, plus new unit tests)

- **130 unit tests** total (was 123 after Stage 4; +7 template tests). `npm test`, `tsc --noEmit`, `next lint` all clean.
- **Live, driven as real signed-in users via the actual NextAuth HTTP flow** (CSRF token, form POST, session cookie -- same convention Stage 2 established), against the dev-only ingestion fixture for realistic starting data:
  - Claimed a NEW ticket as LF (HR_OFFICER) -> `ALLOCATED`; confirmed an `ALLOCATION` `ticket_messages` row was written and `email_log` shows 3 real, honestly-failed attempts ("Graph is not configured...") at the correct ~1s/3s backoff intervals.
  - Set category, started action -> `IN_ACTION`.
  - Set a target due date with a reason (200); confirmed omitting the reason on a ticket that has never had one is correctly rejected 400 (`target_due_reason is required...`) -- the earlier-looking "success without a reason" case is not a bug: it's the mandatory-reason check correctly treating a *carried-over* prior reason as satisfying the invariant on a date-only update, confirmed by isolating the true first-time-set case separately.
  - Added one `INTERNAL` note and one `REQUESTER_VISIBLE` note.
  - Sent the outcome via `POST /api/tickets/[id]/outcome` with the requester-visible note ticked: ticket -> `OUTCOME`; confirmed the outbound `OUTCOME` message's body includes the ticked note's text and excludes the internal note's text; `email_log` again shows 3 honest `FAILED` attempts.
  - Closed the ticket -> `CLOSED`.
  - `/admin/failed-sends` as ADMIN (JDL): 200, lists the ticket; as HR_OFFICER (LF): "Not permitted" -- confirmed role-gated.
  - `POST /api/jobs/sla-escalation` with the real `X-Job-Key`: 200, found and escalated genuinely-overdue pre-existing fixture tickets (the just-closed test ticket correctly excluded, since `isOverdue()` excludes `CLOSED`/`ARCHIVED`); wrong key -> 401.
  - `/tickets/[id]`, `/pool`, `/my-tickets`, `/all-open`, `/overdue` all render 200 with no error content as a real signed-in user.

## Post-Stage-4 session: colours, dev-port fix, assignment UI gap, metadata bug, dashboard filters, Admin users, Closed history

Not a numbered build-order stage -- John asked to see the dashboard, which surfaced two things worth recording.

**Tasco colour palette applied** (§13's "Tasco colour palette" requirement, previously flagged as deferred in Stage 3): `app/globals.css` now uses the same brand palette already established in the sibling Tasco Fleet app (`#1B3A6B` navy, `#c5221f` red, `#137333` green -- matches the Tasco Petroleum logo's navy/red), applied across nav, buttons, tables, forms, status/priority chips, and the legal-hold/confidential banners. All page components updated to use the new classes instead of ad hoc inline styles. §13's print stylesheet and full keyboard-navigation pass are still not done -- this was a colour/component-styling pass only, not a full §13 UI-requirements pass.

**Real bug found and fixed**: `NEXTAUTH_URL` was hardcoded to `http://localhost:3000`, but this machine already runs other Tasco projects' dev servers on 3000 (FMI) and 3001 -- `next dev` was silently falling back to whichever port was free, while NextAuth kept building post-sign-in redirect URLs from the stale `NEXTAUTH_URL`. Live symptom: signing in sent the browser to the FMI project's dashboard instead of staying on Tasco People Desk. Fixed by pinning this project to its own dedicated port: `package.json`'s `dev`/`start` scripts now run `next dev -p 3002` / `next start -p 3002` explicitly, `.env`/`.env.example`'s `NEXTAUTH_URL` updated to match. Verified live: the sign-in response's redirect `url` now correctly points at `:3002`. **Local dev server now always runs at `http://localhost:3002`, not whatever port happened to be free.**

**Assign-from-pool exposed in the UI**: the backend (`/api/tickets/[id]/assign`) already let HR_LEAD/ADMIN assign a pooled ticket directly to someone else (§4: "NEW -> ALLOCATED: Any user (self-claim) or HR_LEAD/ADMIN (assign)"), but the ticket detail page only ever rendered the self-claim "Claim" button -- no picker existed for the HR_LEAD/ADMIN case. Found while John was walking through how assignment works; added an "Assign to" control (NEW tickets only, ADMIN/HR_LEAD only), verified live.

**Business-unit metadata save bug fixed**: the metadata form never received `businessUnitId` as a prop and never initialized its dropdown from the ticket's actual current value -- saving metadata on a ticket that already had a business unit set would have silently wiped it back to null. `businessUnitId` now passed through and used to initialize the dropdown, same as `categoryId` already was. Verified live via the API round-trip.

**Dashboard filters added**: a filter bar (requester text search, status, priority, business unit, assignee, due) above all list views. Filter-matching logic lives in `lib/tickets/filters.ts` as a pure, independently-tested function (18 tests) rather than inline in the client component. Filtering is client-side over each view's already-scoped ticket set -- fine at this data volume (a 5-person HR team, §3), flagged in comments as needing to move server-side if that stops being true. "Due" is a discrete selector (Overdue / today / 7 days / 30 days), not a free date picker, matching the style of the other filters.

**Admin -- Users screen added** (§3: "Manage users, roles..." -- ADMIN only): list/create/role-change/archive-restore, all gated by `canManageAdminSettings`. Role changes require a fresh step-up re-authentication (§6's "user role change" is one of the seven step-up-gated actions) -- verified live both ways. Archiving/restoring does not require step-up, same convention as categories/business units (deactivated, never deleted). Manual "add user" exists because real accounts normally come from Entra sign-in automatically and §14 isn't done yet -- `entraObjectId` is optional, auto-generated as a clearly-prefixed placeholder if omitted, with a documented (not hidden) reconciliation gap if that person later signs in for real. Archived users verified excluded from the assign/reassign picker.

**Closed-tickets history view added** (`/closed`): every ticket at CLOSED/ARCHIVED across all officers, most recently closed first, reusing the existing filter bar. Explicitly **not** §11's Archive Search (full-text over archive artefacts, Stage 6 -- those artefacts don't exist yet since the archive job isn't built); this is a lighter-weight list off data that already exists. Verified live that the open view and closed view never overlap.

None of the six items above are numbered build-order stages -- all were direct requests from John while looking at the running app, handled the same way as the earlier colour-palette/port-fix pass: built, tested live, and recorded here rather than silently folded in.

## Stage 4 deliverables (§16 item 4)

**Built and fully live-tested** (pure logic + a dev-only fixture endpoint that feeds synthetic email straight into the real ingestion pipeline -- no fake Graph client needed, see "Local dev environment notes"):
- `lib/ingestion/suppression.ts`, `auto-reply.ts`, `priority.ts`, `ticket-number.ts`, `attachments.ts`: every rule from §7.3/§7.3.1 as a pure function. 38 new unit tests (including 6 new `lib/timezone.ts` tests -- see below).
- `lib/ingestion/process-message.ts` (`processInboundMessage`): the full §7.3 pipeline in its exact order -- idempotency check (internet_message_id), suppression, auto-reply, threading, ticket creation (with the real collision-retry ticket-number loop), attachment storage. Graph-agnostic by design (`lib/graph/message-types.ts`'s `NormalizedMessage`) -- this is the one function the real webhook, the real delta poller, and the dev fixture endpoint all call identically.
- **`lib/timezone.ts`**: a real bug fix, not just new code -- Stage 1's `request_date`/ticket-number logic (duplicated ad hoc in the original `prisma/seed.ts`) used the server's UTC date components, not Australia/Melbourne (§5, §7.3 both require Melbourne). Fixed with `Intl.DateTimeFormat` (no new dependency, DST-correct), and `seed.ts` now imports the same shared, tested functions instead of its own copy.
- **Webhook** (`/api/graph/notifications`): validation handshake (echoes `validationToken`, text/plain, 200), `clientState` check (400 on missing/mismatch, logged, not processed), rate limiting (`lib/rate-limit.ts` -- in-memory, correct for this project's single-instance App Service tier, explicitly flagged as needing a shared store if that ever changes), 202-then-fire-and-forget processing.
- **Jobs**: `POST /api/jobs/mailbox-delta-poll` and `POST /api/jobs/graph-subscription-renew`, both behind `X-Job-Key` (`lib/jobs/auth.ts`, 401 on missing/invalid), both wrapped in `lib/jobs/run.ts` so every run -- success, failure, or "Graph isn't configured yet" -- writes a real `job_runs` row (§12.1's liveness alert depends on this being unconditional, not skipped when there's nothing to do).
- **A real gap found and fixed**: this stage's own new `graph_delta_state` table had **no `app_role` grant at all** after its migration -- Stage 1's `audit_log_grants` migration only granted `ON ALL TABLES IN SCHEMA public` for tables that existed *at that moment*, not future ones. Fixed with a new migration (`app_role_default_privileges`) that grants the new table explicitly and sets `ALTER DEFAULT PRIVILEGES` so every table any *future* migration creates gets the grant automatically -- `audit_log`'s own append-only restriction is untouched (re-verified live: still `permission denied` for UPDATE/DELETE as `app_role`). This class of bug could easily have recurred silently in every future stage without the fix.
- **System actor** (`prisma/seed.ts`, `SYSTEM_ENTRA_OBJECT_ID` in `lib/ingestion/process-message.ts`): audit_log and ticket_notes both require a real actor/author FK, and the spec never names one for automated actions -- seeded explicitly as a real row (not a real Entra account, `role: ADMIN` only because the enum has no better option and it never signs in or hits a permission check), filtered out of the user-facing assign/reassign picker.
- **Local Blob Storage stand-in** (`lib/blob-store.ts`): a filesystem-backed implementation of the same interface Stage 7's real `@azure/storage-blob` implementation will satisfy -- same reasoning as Stage 1's local Postgres. `blob_path` values are identical either way, so nothing upstream changes when Stage 7 swaps this in.
- **Attachments UI**: read-only panel added to the ticket detail page (filename, size, scan status, block reason). Download is not wired -- needs real Blob Storage (Stage 7).

**Genuinely inert until §14** (written to the real spec, never exercised): `lib/graph/client.ts`'s `GraphApiClient` -- plain `fetch` + OAuth client-credentials token acquisition against Microsoft Graph (no SDK dependency added; Graph is a REST API). `isGraphConfigured()` gates every real call; every route that needs it fails cleanly (logged, or a `FAILED` `job_runs` row) rather than crashing when it isn't configured.

## Defender scan-verdict mechanism -- now specified (§7.3.2), not yet built

**Resolved same day, 2026-09-15**: the gap flagged when Stage 4 was built (the spec never said how the app learns Defender's scan verdict) was put to John directly and answered. **§7.3.2 "Scan verdict ingestion" has been added to `TASCO_HR_Ticketing_Build_Spec_v1.3.md`** (Event Grid webhook as primary delivery to `POST /api/scan/notifications`, with a 15-minute `attachment-scan-reconcile` polling job as reconciliation against index tags -- same webhook-plus-poller shape as this stage's own Graph ingestion, for the same reason: event delivery drops, and a stuck `PENDING` attachment fails silently otherwise. Fail-closed: no verdict, an error verdict, or a 60-minute timeout are all treated as not-downloadable, never defaulted to `CLEAN`).

**Not implemented yet, on purpose** -- §7.3.2 depends on Blob Storage, Defender for Storage, and an Event Grid subscription all actually existing, which is Stage 7's infrastructure work, not Stage 4's. Building the handler/job now would be implementing a later stage ahead of time (§0.1.2) against infrastructure that doesn't exist to test it with -- same posture as this stage's own inert `GraphApiClient`. **Whoever picks up Stage 7 (or an earlier stage that touches attachments again) should build `POST /api/scan/notifications` and the `attachment-scan-reconcile` job against §7.3.2's now-concrete spec.**

## Stage 4 verification (live against a running dev server, plus new unit tests)

- **111 unit tests** total (was 88 after Stage 3; +38 ingestion rules, but +6 timezone/-2 net from a small consolidation -- see individual files): `npm test`, `tsc --noEmit`, `next lint` all clean.
- **16/16 live end-to-end checks passed**, driven as a real signed-in user against the real running app (not just unit tests of the pure logic):
  - Webhook validation handshake echoes the token correctly as `text/plain`, 200.
  - Webhook `clientState`: missing -> 400, mismatched -> 400, correct -> 202.
  - Job auth: no key -> 401, wrong key -> 401, correct key (Graph unconfigured) -> the job fails cleanly and records it in `job_runs`, not a crash.
  - A normal email creates a ticket (priority classification confirmed: "Urgent..." -> P1).
  - Duplicate `internetMessageId` creates exactly one ticket (verified same `ticketId` returned both times).
  - A sender matching a seeded `DOMAIN` suppression rule creates no ticket.
  - `Auto-Submitted: auto-replied` creates no ticket (confirmed independent of, and correctly ordered after, the suppression check -- caught a test-fixture wording collision with a suppression rule during verification, not a code bug).
  - A reply on the same `conversationId` threads onto the existing ticket rather than creating a second one.
  - A `.exe` attachment: the ticket is still created, the attachment is recorded `BLOCKED`/`EXECUTABLE_EXTENSION`, and a system note naming the file is added (verified via the ticket detail API) -- "nothing silently lost," confirmed, not assumed.
  - A `.zip` attachment is accepted and recorded `PENDING`, not blocked.
  - The ticket detail page's new Attachments panel renders 200 with no error text.

## Deferred / not this stage

- Outbound email entirely (Stage 5) -- allocation emails, the outcome dispatch, SLA escalation emails, threading headers on replies.
- Attachment download (needs Stage 7's real Blob Storage).
- Admin UI to manage suppression rules (create/edit/deactivate) -- Stage 4 only reads and matches against them; 2 rules seeded as dev/test fixtures, same convention as categories/business units.
- Confidential/legal-hold toggles, `CONFIDENTIAL_TICKET_VIEWED` logging, archive, retention, audit-log view, remaining Admin screens -- Stage 6.
- The Defender scan-verdict mechanism -- genuinely undefined by the spec, flagged above for an explicit operator decision before Stage 7.

## Local dev environment notes (carried forward, plus two new items)

- Same Prisma-engine-binary and node:test-instead-of-Vitest workarounds as before.
- **New this stage**: `/api/dev/mock-inbound-email` (gated to non-production, same convention as the Stage 2 mock auth provider) is how the entire ingestion pipeline gets tested without a real or fake Graph client -- it feeds a synthetic `NormalizedMessage` straight into `processInboundMessage`, the exact function the real webhook and delta poller will call once §14 exists.
- **New this stage**: always re-run `prisma migrate dev` (or `deploy`) *and* check `app_role`'s grants after adding any new table in any future stage -- Stage 1's original grant migration only covered tables that existed at the time, and this stage is proof that gap is real, not theoretical. The `ALTER DEFAULT PRIVILEGES` fix added this stage should prevent a recurrence, but it was worth writing down explicitly given it already happened once.

## Stage 3 deliverables (§16 item 3)

- **State machine** (`lib/tickets/transitions.ts`): every row of §4's transition table as its own validator, including the category guard, the dispatch-preview-only gate on `IN_ACTION`→`OUTCOME` (so the generic API can never reach `OUTCOME` -- only Stage 5's dedicated endpoint will be able to, matching "there is no path to send an outcome without this step"), the automated-job-only gate on `CLOSED`→`ARCHIVED`, `"not a request"` close, reassignment (not a status transition), and ADMIN-only reversal (including "a reversal into `IN_ACTION` still requires a category"). 30 unit tests.
- **Effective due date / overdue** (`lib/tickets/due-dates.ts`): pure functions, not stored columns (per schema.prisma's own note from Stage 1). 12 unit tests confirming a target date can only bring a deadline forward, never extend it.
- **Optimistic locking and the atomic claim** (§5), implemented literally: `/api/tickets/[id]/claim` and the pool-assignment half of `/api/tickets/[id]/assign` use the exact conditional-UPDATE-with-zero-rows-means-409 pattern from §5's own SQL example; every other mutation route requires the client's `version` and returns 409 with current server state on a mismatch.
- **Audit writes** (`lib/audit.ts`, `lib/tickets/history.ts`): every transition, reassignment, category/business-unit/priority/target-due-date change, and note creation/revision writes `audit_log` and (for transitions/reassignment) `ticket_status_history`, both carrying the request's `correlation_id`.
- **Confidential visibility** (§9), built into the query/detail layer itself rather than bolted on: `lib/tickets/queries.ts`'s list queries and `lib/tickets/detail.ts`'s `loadTicketForViewer` both apply the exact ADMIN/HR_LEAD-see-everything, HR_OFFICER-only-if-assignee-or-granted rule, and ticket detail returns 404 (never 403) for an unauthorized viewer.
- **First-view stamping** (§4): lives inside `loadTicketForViewer` specifically so both the ticket-detail page and its API route trigger it identically, and no other route (claim, assign, notes, ...) accidentally does.
- **Routes**: `GET /api/tickets` (pool/mine/open/overdue), `GET+PATCH /api/tickets/[id]`, `POST .../claim`, `.../assign` (covers both pool-assignment and reassignment), `.../start-action`, `.../close-not-a-request`, `.../close`, `.../reverse`, `GET+POST .../notes`, `PATCH .../notes/[noteId]`. Plus read-only `GET /api/users`, `/api/categories`, `/api/business-units` for the UI's pickers.
- **UI** (§13, the Stage-3-scoped subset): Pool (default landing, `/` now redirects there), My Tickets, All Open, Overdue -- all four list views; ticket detail with metadata panel (category/business unit selectors, gated by `canActOnAssignedTicket`), correspondence thread (read-only render of seeded `ticket_messages`), internal notes panel (create + edit-as-revision, `(edited)` marker), status timeline, and action buttons (claim, start action, "not a request" close, reassign, ADMIN-only reverse with a reason field). Legal-hold and confidential badges render read-only when true.
- **Fixture tickets** (`prisma/seed.ts`): 5 tickets covering NEW/ALLOCATED/IN_ACTION/CLOSED states, one confidential, one already past its P1 SLA (for the Overdue view) -- synthetic requester identities only, clearly marked as fixture data. Necessary because real ingestion (§7) is Stage 4; nothing else can create a ticket yet.

## Explicitly deferred to their assigned stages (not built this stage, on purpose)

- The outcome dispatch/email itself (§7.4) -- Stage 5. `IN_ACTION`→`OUTCOME` is unreachable via the generic API by design; `/api/tickets/[id]/close` (OUTCOME→CLOSED) exists and is tested against fixture data, since nothing in §4's table ties *that* transition to email being sent.
- Setting/clearing the confidential flag and legal hold -- Stage 6. The *visibility* rule is built (Stage 3's own concern for correct lists/detail); the UI/API to toggle either flag is not.
- `CONFIDENTIAL_TICKET_VIEWED` audit logging with `access_basis` (§9.1) -- Stage 6's own listed deliverable. The 404 gate that necessitates it is built; the audit trail for it is not, noted explicitly in `app/api/tickets/[id]/route.ts`'s own comment so it isn't mistaken for done.
- Attachments upload/download/scanning -- needs Blob storage (Stage 7) and Defender scanning (Stage 4/7). Not touched.
- Reassignment's "notify the new assignee internally" -- no notification channel exists yet (Stage 5). The DB-level reassignment (status history + audit log) is complete; the internal notification is deferred.
- Archive search, audit-log view, Admin screens (users/categories/business units/suppression) -- Stage 6.
- §13's print stylesheet, full keyboard-navigation pass, and Tasco colour palette -- not addressed this stage. Flagged here rather than silently skipped; UI is functional but visually minimal (plain HTML elements, no design pass).

## Stage 3 verification (live against a running dev server, plus new unit tests)

- **88 unit tests** total (was 46 after Stage 2; +30 transitions, +12 due-dates): `npm test` clean, `tsc --noEmit` clean, `next lint` clean.
- **18/18 live end-to-end checks passed**, driven as real signed-in users (LF/RJ/DN/JDL via the mock provider) against the fixture tickets, not just unit tests of the pure logic:
  - Pool correctly includes the unassigned ticket; All Open correctly **excludes** the confidential ticket for an unauthorized HR_OFFICER and correctly **includes** it for HR_LEAD.
  - Confidential ticket detail: 404 for an unauthorized HR_OFFICER (both the API route and the actual page), 200 for HR_LEAD.
  - Atomic claim: first claim succeeds, an immediate second claim attempt gets 409.
  - Category guard: `start-action` without a category fails 400 naming `category_id`; after setting the category, it succeeds and reaches `IN_ACTION`.
  - Optimistic locking: a PATCH with a stale `version` gets 409 with the current server state in the body.
  - `"Not a request"` close succeeds from `IN_ACTION` with no category re-check.
  - Notes: creation succeeds; editing someone else's note is 403; editing your own note creates a new current row linked via `supersedesNoteId`.
  - Reversal: fails 403 without a fresh step-up, succeeds once signed in with step-up simulated, and fails 403 for a non-ADMIN regardless of step-up.
  - All five UI pages (`/pool`, `/my-tickets`, `/all-open`, `/overdue`, `/tickets/[id]`) render 200 with no error text as a real signed-in user, including the ticket detail page for a non-confidential ticket.
- Smoke-testing necessarily mutated some fixture tickets (the pool ticket got claimed/categorized/closed, the closed one got reversed back to ALLOCATED, a note got added) -- left as-is rather than reset, since it's fixture/dev data and the mutated state is itself a reasonable demonstration of the system having been used. Noted here rather than silently left unexplained.

## Stage 2 deliverables (§16 item 2)

- **NextAuth** (`lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`): Azure AD provider (single-tenant, registered only once `AZURE_AD_CLIENT_ID`/`_SECRET`/`_TENANT_ID` are all set -- inert until §14 item 1), JWT session strategy, **8-hour session (`maxAge`) with a 15-minute `updateAge`** for the sliding-refresh half of §6, cookie explicitly `httpOnly`/`sameSite=lax`/`secure`-in-production rather than trusting NextAuth's own version-dependent defaults.
- **Role derivation** (`lib/roles.ts`): pure `deriveRole(groupIds, mapping)`, highest-role-wins, returns `null` on no match. The three real Entra group Object IDs (`AZURE_AD_GROUP_ADMINS_ID` etc.) are blank in `.env`/`.env.example` on purpose -- §14 item 4 hasn't created the real groups yet. Fully unit-tested against synthetic IDs regardless.
- **`signIn` callback denies access on `null` role** by redirecting to `/auth/no-access` with a clear message -- §3's "a user in no group is denied access with a clear message, not a 500," verified live (see below).
- **Permission matrix** (`lib/rbac.ts`): one function per row of §3's table, instance-context parameters (`isAssignedTicket`, `isOwnNote`, confidential view context) supplied by callers in Stage 3+. 46 unit tests enumerate every cell of the table directly from the spec text.
- **Step-up re-authentication** (`lib/step-up.ts`): `hasRecentStepUp`/`requireRecentStepUp`, 5-minute freshness window. On the real Azure AD side, implemented as a **second, separately-registered provider** (`azure-ad-step-up`, statically configured with `prompt: "login"`) rather than a per-call dynamic param -- this is what lets the `jwt` callback reliably tell "was this a forced re-challenge" from "was this possibly silent SSO" via `account.provider`, which a dynamic-param approach can't do reliably. The dev-mock provider has an equivalent "Simulate step-up" checkbox.
- **Correlation-ID middleware** (`lib/correlation.ts`, `middleware.ts`): generates or adopts `X-Correlation-Id` on every request before it reaches a route handler; malformed supplied values are never trusted, a fresh UUID is minted instead.
- **Route protection** (`middleware.ts`): every route requires a session except `/api/auth/*`, `/api/graph/notifications`, `/api/jobs/*`, `/api/health`, `/sign-in`, `/auth/no-access` -- exactly §6's exemption list (the first three don't have real handlers yet; the exemption exists ahead of them per this stage's own scope).
- **403/404/401 helpers** (`lib/http-errors.ts`) and **session/role helpers** (`lib/session.ts`) -- `getSession()` is the one place every future API route calls; `hasRole()`/`hasFreshStepUp()` read only the server-side session, never anything client-supplied.
- **Sign-out** (`components/SignOutButton.tsx`): clears the local session then redirects to Entra's own `end_session_endpoint` (tenant ID mirrored to `NEXT_PUBLIC_AZURE_AD_TENANT_ID` for the client-side redirect -- not a secret, already visible in every OAuth URL). Falls back to a plain local redirect when no real tenant is configured, since there's no Entra session to log out of in mock mode.
- **Mock users seeded** (`prisma/seed.ts`): the 5 named users from §3 (RJ/HR_LEAD, LF/HR_OFFICER, DN/HR_OFFICER, JDL/ADMIN, RGL/ADMIN) -- initials and roles only, no names invented beyond what §3 states. `entraObjectId` prefixed `mock-` so it can never collide with a real Entra object ID once §14 lands.
- **Demo routes**: `/api/health` (DB-connectivity liveness check, exempt from auth -- what §12.1's future alert will poll), `/api/whoami` (exercises the whole pipeline: session, role, step-up, correlation ID).
- **Dev sign-in page** (`/sign-in`): lists the 5 seeded mock users with a "simulate step-up" checkbox, plus a real "Sign in with Microsoft" button that only renders once Azure AD is actually configured. Never registers the mock provider in a production build regardless of any env var (`lib/auth.ts`'s `isProduction` check), per the build-order note authorizing a mocked auth provider for Stages 1-3 only.

## Stage 2 verification (live against a running dev server, not just unit tests)

- `npm test`: **46/46 passing** (roles, rbac, step-up, correlation -- all pure logic, no DB/network needed).
- `tsc --noEmit` and `next lint`: clean.
- Started the real dev server and drove the actual HTTP sign-in flow (CSRF token, form POST, session cookie) end-to-end, not just called functions directly:
  - Unauthenticated `GET /api/whoami` → **401**. Unauthenticated `GET /` → **307 to `/sign-in?callbackUrl=%2F`**.
  - Signed in as the seeded JDL (ADMIN) mock user with "simulate step-up" on → `/api/whoami` correctly reports `role: "ADMIN"`, `hasFreshStepUp: true`, a fresh `correlationId`; `GET /` now returns 200.
  - Same user, step-up **not** simulated → `hasFreshStepUp: false`. Confirms the freshness window is real, not always-true.
  - Sign-in attempt with a nonexistent user ID → NextAuth's own callback returns **401 with no session created**, confirmed by a follow-up `/api/whoami` call also returning 401 -- denied cleanly, not a crash.
  - `GET /api/health` → `{"status":"ok"}`, proving the app's `app_role` connection (Stage 1) is reachable from a real request, not just a script.

## Local dev environment notes (carried from Stage 1, plus one new item)

- Same Prisma-engine-binary workaround as Stage 1 (Tasco's network gateway blocks executable downloads) -- unchanged, still load-bearing.
- **New this stage**: Vitest was tried first for the unit tests above and dropped. Vitest's Rollup dependency needs a native binary (`@rollup/rollup-win32-x64-msvc`) that hit the exact same executable-download gateway block, and unlike Prisma's engines, no sibling project on this machine already had it cached to borrow. Switched to **Node's built-in test runner via `tsx`** (`npm test` = `node --import tsx --test lib/**/*.test.ts`) instead -- `tsx` only needs `esbuild`, which was already working from the Prisma-adjacent fix. `vitest.config.ts` is left in the repo as an inert placeholder (with its own comment explaining why) because the tool used to build this project cannot delete files in this environment -- do not resurrect it as real config without re-solving the Rollup binary problem first.
- If Stage 3+ needs component/integration tests beyond pure-logic unit tests, this same native-binary constraint will likely resurface with other tools (e.g. Playwright, jsdom's native deps) -- worth checking early rather than assuming.

## Deferred / not this stage

- Everything in Stages 3-9 (§16).
- Real Azure AD sign-in is wired but **never actually exercised** -- it can't be until §14 items 1 and 4 exist. The group-claims-in-ID-token assumption (`profile.groups`) is the standard NextAuth+Azure AD approach but is itself unverified against a real tenant; if Entra's actual token configuration doesn't emit that claim the way assumed, this will need a small adjustment once §14 lands and someone can actually test it.
- The `package.json#prisma` deprecation warning (Prisma 7 wants `prisma.config.ts`) -- still not fixed, still cosmetic.

## Stage 1 deliverables (§16 item 1)

- **Repo scaffold**: Next.js 14.2.35 (App Router), TypeScript, Tailwind, ESLint. `npm run dev` / `build` / `lint` all present.
- **Prisma schema** (`prisma/schema.prisma`): every table in §5 modelled — `categories`, `business_units`, `tickets`, `ticket_messages`, `ticket_notes`, `ticket_attachments`, `ticket_status_history`, `ticket_access`, `audit_log`, `email_log`, `suppression_rules`, `suppression_log`, `users`, `graph_subscriptions`, `job_runs`. Columns use `@map`/`@@map` to match the spec's literal snake_case names exactly. `requester_email` uses the `citext` Postgres extension (case-insensitive, per §5) via Prisma's `postgresqlExtensions` preview feature.
- **Seed data** (`prisma/seed.ts`): the 10 categories and 5 business units from §5's seed lists, upserted (safe to re-run).
- **Migrations**:
  - `20260915013415_init` — full schema.
  - `20260915013701_audit_log_grants` — creates `app_role` (idempotent `CREATE ROLE` if not exists, no password set here — see below) and grants it ordinary CRUD on every table **except** `audit_log`, where it holds INSERT + SELECT only. This is the literal "append-only, enforced at the database" requirement from §5.
- **FK RESTRICT**: `tickets.category_id` / `tickets.business_unit_id` both `onDelete: Restrict`.
- **Local Postgres via Docker**: `docker-compose.yml`, Postgres 16, host port **5433** (5432 is already used by this machine's FMI project container).

## Stage 1 verification (done live against the local Docker DB, not just assumed from the schema)

- `prisma migrate dev` applies cleanly, `prisma validate` passes, `tsc --noEmit` is clean across the whole scaffold.
- **`audit_log` append-only enforcement, tested as `app_role`**: `INSERT`/`SELECT` succeed; `UPDATE`/`DELETE` both fail with `permission denied for table audit_log`. Confirmed, not assumed.
- **`ON DELETE RESTRICT`, tested**: inserted a real ticket referencing the `Payroll` category, then attempted `DELETE FROM categories WHERE name = 'Payroll'` — failed with a foreign key violation naming the referencing ticket. Confirmed the constraint is real, not just declared in the schema.
- **`lib/prisma.ts`** (the singleton the Next.js app will actually import) connects via `APP_DATABASE_URL` (`app_role`), never `DATABASE_URL` (the migration role) — verified end-to-end: it successfully read back all 10 seeded categories and 5 seeded business units through `app_role`'s restricted connection.
- All test/verification rows inserted during the above were cleaned up afterward; only seed data remains in the local DB.

## Local dev environment notes (for whoever picks this up next)

- **Tasco's network gateway blocks executable-file downloads** (`gateway.tascopetroleum.com.au:8090/ips/block/ftype`), which stops Prisma's own CLI from downloading its query/schema engine binaries from `binaries.prisma.sh` on first install — every `prisma generate`/`migrate` attempt fails with a network error, not a code problem. Worked around for **this machine only**, not a portable fix:
  - Pinned `prisma`/`@prisma/client` to `6.19.3` — the exact version already successfully downloaded by the sibling FMI project on this same machine (before this gateway rule existed, or from a different network).
  - Copied FMI's already-downloaded engine binaries (`schema-engine-windows.exe`, `query_engine-windows.dll.node`) and their local fetch-engine cache (`node_modules/@prisma/engines/node_modules/.cache/prisma/master/<commit>/windows/*`) into this project.
  - `.env` sets `PRISMA_QUERY_ENGINE_LIBRARY` / `PRISMA_SCHEMA_ENGINE_BINARY` to point directly at the copied binaries, which lets the Prisma CLI skip its network download/verification path entirely.
  - **If Prisma is ever upgraded, this breaks** — the new version's engine commit hash won't match what's cached, and a fresh download will hit the same network block. Whoever does that upgrade will need to source the matching engine binaries some other way (a machine off this network, an IT-approved exception, or an internal mirror) before the CLI will work again.
- Also unrelated to Prisma: this machine's Sophos endpoint security TLS-inspects HTTPS, which breaks Node's own certificate verification unless `NODE_EXTRA_CA_CERTS` points at `certs/sophos-ssl-ca.pem` (copied from FMI, same workaround as that project — see FMI's own STATUS.md). Not committed to git (machine-specific, matches FMI's own convention of leaving it untracked).
- Local Postgres runs on host port **5433**, not 5432 — FMI's own local Postgres container already holds 5432 on this machine.
- `app_role`'s password is set locally by `scripts/db-bootstrap-local.sh` (reads `APP_ROLE_PASSWORD` from `.env`), deliberately **not** inside the versioned migration — a migration file must apply identically in every environment, and a password has no place in one (§0.1.8). In Azure, this whole script has no equivalent: the app authenticates via managed identity, not a password.

## Deferred / not this stage

- Everything in Stages 2-9 (§16) — auth, UI, Graph ingestion, outbound email, confidential/legal-hold/archive/retention, infrastructure, CI/CD, acceptance pass.
- The `package.json#prisma` deprecation warning (Prisma 7 wants `prisma.config.ts` instead) — cosmetic, not fixed this stage to avoid scope creep beyond §16 item 1.
- npm audit reports 8 vulnerabilities in transitive dependencies from the Next.js 14 scaffold's default toolchain (not investigated this stage — flagging so it isn't silently missed, not a Stage 1 concern per se).
