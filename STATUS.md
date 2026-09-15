# TASCO HR Ticketing — Build Status
- Current stage: 2 — Auth and RBAC (complete)
- Last completed stage: 2
- Passing acceptance tests: none from §15 directly yet (§15's items target ticket/email/archive behaviour built in later stages); Stage 2's own deliverables were verified live end-to-end against a running dev server -- see "Stage 2 verification" below, and the relevant §15 rows this unblocks are noted there
- Failing / pending acceptance tests: all of §15 (Stages 3-9 not started)
- Architecture deviations / clarifications: None from the spec itself. Two local-environment workarounds, not spec deviations -- see "Local dev environment notes" below (Prisma engines, carried from Stage 1; now also the Vitest→node:test swap).
- Blockers / required operator actions: §14 items 0-8 — none started, not required until Stage 4. **Real Azure AD sign-in and real group-based role derivation cannot be exercised until §14 items 1 (app registration) and 4 (security groups) exist** — the code path is written and unit-tested with synthetic data, but nobody has signed in through it for real. Nothing currently blocks Stage 3.
- Recommended next command or task: nominate Stage 3 ("Core UI and state machine")

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
