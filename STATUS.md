# TASCO HR Ticketing — Build Status
- Current stage: 4 — Graph ingestion (complete, within what §14's absence allows -- see below)
- Last completed stage: 4
- Passing acceptance tests: the whole **Ingestion** block of §15 now passes live via the dev-only fixture endpoint (duplicate delivery, threading, invalid clientState -> 400, suppression) except the two rows that need a real mailbox (webhook against real live traffic, delta-poll safety net against a broken real webhook) and the go-live-timestamp row (no cutover date exists yet). Most of **Attachments** passes too (`.exe` blocked, `.iso` blocked, `.zip` accepted+quarantined, TYPE_MISMATCH, no server-side extraction) except the CLEAN-status row, which depends on the undefined Defender-verdict mechanism (see below).
- Failing / pending acceptance tests: **Communications**, **Legal hold**, **Audit-and-correlation**'s admin-search row, **Archive-and-retention**, **Durability** (Stages 5-7). The two live-mailbox Ingestion rows and the CLEAN-status Attachments row noted above stay pending on §14 + the Defender-verdict mechanism regardless of stage.
- Architecture deviations / clarifications: None from the spec itself. Same local-environment workarounds as before, plus a real gap found and fixed this stage (a new table Stage 1's grant migration didn't cover -- see "Stage 4 deliverables" below), and one genuine spec gap flagged rather than guessed at (Defender's scan-verdict delivery mechanism, undefined in §7.3.1 -- see "Open question for Stage 7").
- Blockers / required operator actions: §14 items 0-8 — still none started. **Confirmed this session: Stage 4 could only be built against mocked/synthetic data, exactly as anticipated** -- real Graph ingestion needs §14 items 0-3 before any of the built-but-inert real-Graph code path can be exercised or trusted.
- Recommended next command or task: nominate Stage 5 ("Outbound and SLA"), OR prioritize getting §14 items 0-3 done operator-side so Stage 4's real-Graph code path can finally be tested for real.

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

## Open question for Stage 7, not guessed at

**The spec never specifies how the app learns Defender for Storage's malware-scan verdict** (§7.3.1 says Defender is enabled and is "the primary control," but nowhere says whether the app is notified via a webhook, an Event Grid subscription, polling blob index tags, or something else). Everything up to and including `scan_status = PENDING`/`BLOCKED` is built and deterministic; the `PENDING -> CLEAN`/`MALICIOUS` transition has no code path at all, on purpose -- inventing one would be exactly the kind of unspecified business logic §0.1.4 says to stop and ask about, and there's nothing to test it against until Stage 7 actually provisions Defender for Storage anyway. **Needs an explicit operator decision before Stage 7's Bicep work can be complete.**

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
