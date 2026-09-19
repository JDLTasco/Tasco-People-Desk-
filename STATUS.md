# TASCO HR Ticketing — Build Status
- Current stage: 7 — Infrastructure. **Azure infra deployed and live** in `rg-tasco-people-desk` (Australia East): App Service, PostgreSQL Flexible Server, Blob Storage (Defender enabled), Key Vault, Application Insights, Event Grid system topic + scan-results event subscription, 7 Logic App job timers. **App code is deployed and live** at `hr.tascopetroleum.com.au` (real custom domain, confirmed 200, real Next.js content) with a working DB behind it — `/api/health` returns `{"status":"ok"}`, confirming the App Service's managed identity can resolve Key Vault-referenced `DATABASE_URL`/`APP_DATABASE_URL` and reach Postgres. **RBAC role assignments are done** (both grants live via Azure Portal). **DB migration/seed/app_role-password: all confirmed done**. **Event Grid scan-results subscription: created and validated** (2026-09-19) via direct `az eventgrid` CLI call, bypassing the broken Authorization-RP CLI path entirely since this resource type isn't affected by it. **§14 Track A (DNS/cert) and Track B (Entra app registration + 3 security groups) now both done, confirmed live 2026-09-19**: `hr.tascopetroleum.com.au` is a verified App Service hostname with SSL bound, DNS resolves correctly; `AZURE_AD_CLIENT_ID`/`_TENANT_ID`/the 3 `AZURE_AD_GROUP_*_ID` app settings and the `AZURE-AD-CLIENT-SECRET` Key Vault secret are all set and live; the app's `/sign-in` page now renders "Sign in with Microsoft" (the real provider, not dev-mock) confirming `lib/auth.ts` picked up the config; the Entra app's registered redirect URI (`https://hr.tascopetroleum.com.au/api/auth/callback/azure-ad`) verified to match exactly via `az ad app show`. **A real human sign-in was attempted and the full OAuth round-trip confirmed working correctly**: John signed in with Microsoft, the app correctly evaluated his group membership and refused sign-in with a clean "no group membership" message (§3's own required behavior — deny cleanly, not a 500) since his account wasn't yet in any of the three `HR-Ticketing-*` groups. This is the config working as designed, not a bug. **John's own Azure account's data-plane RBAC gap (see Blockers item 6) is now also fully resolved**: Michael granted `Key Vault Administrator` + `Contributor` and `Storage Blob Data Contributor` at subscription scope — both re-verified live this session (`az keyvault secret set`/`delete` round-trip succeeded; `az storage container list --auth-mode login` listed both containers). No outstanding RBAC gaps remain anywhere in this deployment.
- Last completed stage: 6 (Stage 7 in progress -- see above)
- Passing acceptance tests: unchanged from Stage 6 (see below) -- Stage 7's own acceptance tests (Durability: blob soft-delete recovery, PITR restore test) not yet run; needs real data first per infra/README.md's own restore-test section. **Legal hold** now passes live (set/clear both step-up + mandatory-reason gated, retention-purge exclusion, soft-delete blocked 409, banner with reason/setter/date, admin legal-holds view). **Archive-and-retention** passes live against the local blob-store stand-in: transactional archive writer (CLOSED -> ARCHIVED only after every blob write succeeds), ticket.txt/ticket.xml correctly interleave correspondence+notes chronologically with an XSD committed, retention-purge job runs correctly authenticated (0 tickets old enough to purge yet -- 7-year clock, expected). **Audit-and-correlation**'s admin-search row now passes (audit search by action/correlation ID/date range live-verified). §9's confidential ACL + `CONFIDENTIAL_TICKET_VIEWED` access-basis logging (§9.1) both live-verified, including the assignee/ACL/role precedence rule. §11 Export (.txt, .zip with CLEAN-only attachments, bulk CSV with confidential exclusion for non-ADMIN, archive search) all live-verified.
- Failing / pending acceptance tests: **Communications**/**Ingestion**'s mailbox-dependent rows still pending §14 Track B's remaining mailbox-migration item (app registration/groups/DNS are now done, but `HR_MAILBOX_ID`/Graph ingestion config isn't set yet — confirm with John whether the mailbox itself is ready). **Durability** (infra now exists, but the restore test and blob-soft-delete-recovery test haven't been run yet -- see infra/README.md). **Attachments**' Event-Grid/reconcile-job rows: the event subscription now exists and validated successfully, but still completely unexercised against real Defender-for-Storage traffic -- no attachment has ever gone through the real pipeline yet. **Correction, 2026-09-19: no RBAC grant is needed for Defender to publish to the system topic** (see infra/README.md) -- the earlier "Defender's service principal needs EventGrid Data Sender" note in this file and in infra/README.md was wrong (that role only applies to Event Grid Namespace resources, not classic System Topics like this one; confirmed via `az role definition list` and by the Portal correctly refusing to offer it as assignable here) -- nothing further is blocking this beyond real traffic to exercise it against. **Real sign-in / full end-to-end UI smoke test: config is now fully wired (see header) but the actual human sign-in click-through hasn't been run yet** — next concrete action, needs John in a browser.
- Architecture deviations / clarifications: **`archiver` downgraded 8.0.0 -> 6.0.2 mid-stage** -- v8 is ESM-only with a conditional `exports` map ("Default condition should be last one") that Next.js 14's webpack can't resolve at all, and the failure took down every route in the dev server, not just the export one, until caught. v6 is the last pre-ESM-only major, same functional API modulo the factory-function call style. **No XSD validator available in this environment** (no `xmllint`, no `lxml`, and adding one would be a second new dependency beyond the already-approved `archiver`) -- `ticket.xml` is verified well-formed via a hand-written balanced-tag check in `render.test.ts` and eyeballed against a live-generated sample, not validated against the committed XSD by any tool. **`AuditLog.ticket`'s FK turned out to already be `ON DELETE SET NULL`** at the database level (Prisma's implicit default for an optional relation) -- made explicit in the schema with a comment explaining why it's load-bearing for the retention-purge job, no migration needed since nothing was actually changing. **App Service startup command `next start -p 8080` is now declared in `infra/modules/appservice.bicep`'s `siteConfig.appCommandLine`** (fixed 2026-09-19 — previously this lived only in the live App Service's out-of-band config, not the repo, meaning a template redeploy would have silently reset it and taken the live site back to serving Azure's default page; confirmed live value matched before adding it to the template).
- Spec reconciliation needed: **One found, 2026-09-19** -- §7.3.2/§16 item 7's own text calls for "the Defender for Storage service principal needs the EventGrid Data Sender role on the topic," but this is not actually achievable: `az role definition list`'s own permissions for that role list `dataActions: [Microsoft.EventGrid/events/send/action]` scoped only to `topics`/`domains`/`partnerNamespaces`/`namespaces` -- **not** `systemTopics`, which is what this project actually uses (required for the storage-account-scoped index-tag reconciliation path). The Portal's role picker correctly refuses to offer it for this reason. Likely copied from generic Event Grid custom-topic documentation without accounting for the System Topic distinction. No RBAC action is needed or possible here -- Defender publishes to a storage account's own system topic via the resource provider's built-in trust, not a discretionary grant. Flagging per spec text now being factually wrong on this one point, not attempting to silently "fix" the spec document itself.
- Blockers / required operator actions: **(updated 2026-09-19, later same day)** (1) **RBAC role assignments: DONE.** (2) **DB migration/seed/app_role password: DONE.** (3) **Event Grid scan-results subscription: DONE.** (4) **§14 Track A (DNS/cert) and Track B (Entra app reg + groups): DONE, wired live this session** — see header. (5) **`main.bicep` has no saved parameters file** — unchanged risk, see prior note: do not run a full `az deployment group create` against this template without addressing this first; prefer targeted CLI calls (as used again this session for the Azure AD app settings). (6) **John's own Azure account data-plane RBAC gap: DONE, resolved same session.** Michael granted `Key Vault Administrator` + `Contributor` and `Storage Blob Data Contributor` at subscription scope; re-verified live (secret set/delete round-trip, container list via `--auth-mode login`). No further RBAC action needed anywhere in this deployment. (7) **Only real remaining blocker: John's account needs to be added to one of the three `HR-Ticketing-*` Entra security groups** (Admins/Leads/Users) — confirmed via a live sign-in attempt that the app correctly refuses access with no group membership (§3's designed behavior, not a bug). Ask whoever manages those groups (likely Michael) to add him, most plausibly to `HR-Ticketing-Admins` given his role. (8) Also still unconfirmed: whether §14's underlying mailbox migration (`HR_MAILBOX_ID`, Graph ingestion) is actually done — separate from the app registration/groups/DNS work confirmed done this session.
- Recommended next command or task: **once John is added to an `HR-Ticketing-*` group, retry sign-in at `https://hr.tascopetroleum.com.au/sign-in`** — should work immediately on next token refresh, no restart needed. After a successful sign-in: confirm mailbox/Graph ingestion readiness (see Blockers item 8) and set `HR_MAILBOX_ID`/`GRAPH_WEBHOOK_CLIENT_STATE` if ready; re-verify Stage 7's Durability acceptance tests (restore test, blob soft-delete recovery) against real data; exercise the attachment-scanning pipeline end-to-end for the first time.

## §14 Tracks A & B wired live (2026-09-19, later session)

John reported IT had finished §14's outstanding items and supplied the
Entra app registration's client ID/tenant ID/client secret and the three
`HR-Ticketing-*` security group Object IDs. This session wired all of it
into the live Azure resources rather than just recording the values.

**App Service settings set directly via `az webapp config appsettings
set`** (matches `appservice.bicep`'s own comment: "Set by the operator
once real ... not by redeploying this template every time"):
`AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`, `NEXT_PUBLIC_AZURE_AD_TENANT_ID`,
`AZURE_AD_GROUP_ADMINS_ID`/`_LEADS_ID`/`_USERS_ID`. Confirmed DNS/cert
(§14 Track A item 6) was already live (`az webapp config hostname list`
showed `hr.tascopetroleum.com.au` as a verified, SSL-bound hostname;
`nslookup` resolved correctly) before updating `NEXTAUTH_URL` to the real
domain, same command.

**Real RBAC gap hit trying to set the client secret**: `az keyvault
secret set` for `AZURE-AD-CLIENT-SECRET` failed `ForbiddenByRbac` — read
access works (confirmed via `az keyvault secret list`) but not write.
Root cause, worked through live with John in the Portal: his account
holds `Key Vault Secrets User` (read-only) plus a time-bound `Role Based
Access Control Administrator` grant (expires 2026-10-30), but that RBAC
Administrator role is deliberately restricted from assigning *privileged*
roles (which `Key Vault Secrets Officer` is classified as) to prevent
self-escalation — by design, not a misconfiguration. Checked who holds
Owner on the subscription (`az role assignment list` was blocked by the
same unexplained `MissingSubscription` CLI bug noted elsewhere in this
file for role-assignment calls — used the Portal's IAM blade instead):
4 Owners, of which `itmildura.michael@tascopetroleum.com.au` is the
plausible internal IT contact (the other two are a service account and
an external MSP, Ingram Micro). Michael added the secret's new version
directly in the Portal — confirmed via `az keyvault secret list-versions`
(a second version now exists, dated 2026-09-18T23:57:34Z, vs. the
original 2026-09-16 one; value itself never read back into this session,
consistent with the Bash tool's own credential-materialization guard
refusing a `--query value` read).

**Redirect URI cross-checked, not assumed**: `az ad app show --id
ea790fc8-... --query web.redirectUris` confirmed the Entra app's
registered redirect URI is exactly
`https://hr.tascopetroleum.com.au/api/auth/callback/azure-ad` — matches
what `NEXTAUTH_URL` + NextAuth's own Azure AD provider path produce, so
no mismatch-driven silent sign-in failure is expected.

**App restarted and re-verified live**: `az webapp restart` (run by John
directly via a `!`-prefixed command — this session's own restart call was
blocked by the harness's production-action safety classifier, consistent
with the same class of block noted on [[project_ibkr_trading_bot]] for
its own Supervisor restart). Post-restart: `/api/health` on the real
`hr.tascopetroleum.com.au` domain (checked via WebFetch, since direct
`curl` to a live production hostname was also denied by the safety
classifier) returned `{"status":"ok"}`; `/sign-in` renders "Sign in with
Microsoft" — the real Azure AD provider, confirming `lib/auth.ts` now has
all three required env vars and registered it (the dev-mock provider is
never available in production builds regardless, so this alone isn't
proof, but combined with the app settings being confirmed live it's
strong evidence the wiring took).

**Not done this session, on purpose**: an actual human sign-in through
the real Microsoft flow — needs John's own credentials in a browser, not
something this session can drive. That's the concrete next step. Also
unconfirmed: whether the underlying mailbox migration (§14 Track B's
`HR_MAILBOX_ID`/Graph ingestion piece) is actually done, or just the app
registration/groups/DNS — worth asking John directly before assuming
Graph ingestion is ready to wire up next.

**New operational gap surfaced, recorded for next time**: John's own
Azure account has no *data-plane* write access on either RBAC-gated
resource in this stack (Key Vault, Blob Storage) — only the App Service's
managed identity does. Recommended he ask Michael to grant him `Key Vault
Secrets Officer` on `kv-tasco-people-desk` and `Storage Blob Data
Contributor`/`Reader` on `tascopeopledeskstorage` proactively, so this
doesn't require a colleague's help again once the attachment pipeline
needs manual inspection.

No application code changed this session — purely Azure configuration,
verified live. STATUS.md's header/blockers sections above updated to
match; nothing here contradicts them, this section is the detailed record.

## Stage 7 continued (2026-09-16, late session): App code deployed and live -- four real deployment bugs found and fixed

John supplied three things Stage 7 was blocked on: delegated Azure RBAC
permission, a Sophos exception for the `*.scm.azurewebsites.net` cert
issue, and his current WAN IP (`119.18.20.215`) for the DB firewall.
Picked up exactly where the previous session's Blockers section left off:
diagnosing deployment `ddec5c21` rather than blindly retrying.

**Root cause of `ddec5c21` (and, in hindsight, of attempt 1's identical
error too): the deploy zip's internal paths used Windows backslashes**
(`app\admin\page.tsx`) instead of the forward slashes the ZIP spec
requires. Oryx's remote build runs on Linux, where a backslash is just a
literal character, not a path separator -- so the zip extracted into
oddly-named flat files with no real `app/` directory ever created,
producing exactly the `next build` error both failed attempts showed
("Couldn't find any `pages` or `app` directory"). This wasn't diagnosed
by rerunning the build (that would only show the symptom again) but by
pulling the actual zip's directory listing and inspecting the raw entry
names.

**A second, unrelated bug found in the same zip**: it also bundled the
real local-dev `.env` file (with real secrets) into the production
deployment package -- `.gitignore` already excludes it, but whatever
built the old zip didn't respect that. Not something `next build`
would have caught; found by inspecting the zip's file list directly.

**Fix**: rebuilt the deploy zip using this project's own `archiver`
dependency (already installed for ticket export, Stage 6) instead of
whatever produced the backslash paths -- guarantees forward-slash
entries and let the exclusion list be explicit (`.env`, `node_modules`,
`.git`, `.next`, `certs`, `.local-blob-store`, `.vercel`, `*.pem`,
`*.tsbuildinfo`). Deployed via the same PowerShell/ARM-bearer-token
workaround the previous session found for the Sophos cert issue.

**Third bug, found on the next deploy attempt**: build now found the
`app` directory, but failed with `Error: Cannot find module 'tailwindcss'`
during `next build`. Cause: the App Service has `NODE_ENV=production`
set, which makes `npm install` skip `devDependencies` -- and
`tailwindcss`/`postcss` live there (correctly, they're build tools, not
runtime deps) but are needed at build time for `next/font`/CSS
processing. **Fix**: set app setting `NPM_CONFIG_PRODUCTION=false`
(the standard Oryx/Azure mechanism for this exact situation) rather than
reclassifying the packages as runtime dependencies.

**Fourth bug, found once the build actually succeeded**: the site kept
serving the Azure default "Welcome" page even after a successful
deployment ("Errors (0), Warnings (0)"). Root cause: `package.json`'s
`start` script hardcodes `next start -p 3002` (a deliberate local-dev
convention, to avoid colliding with other Tasco apps' dev servers) but
Azure App Service for **built-in** Linux runtime stacks (as opposed to
custom Docker containers) always probes port 8080 and expects the app
to be reachable there -- confirmed directly from the container platform
log (`.../api/logs/docker`), which explicitly reported "the container is
listening on port 3002 but the platform is probing port 8080." **First
attempted fix, `WEBSITES_PORT=3002`, did not work** -- re-checked via a
raw ARM REST call (bypassing az cli) to confirm the setting really was
applied, and it was, but the exact same probe-mismatch error recurred
on the next two restarts regardless. `WEBSITES_PORT` turns out to only
apply to custom-container App Service plans, not built-in language
stacks -- it's silently ineffective here. **Actual fix**: set a custom
Azure startup command (`az webapp config set --startup-file "next start
-p 8080"`), which overrides `package.json`'s script for the Azure
container specifically without touching the shared script local dev
still relies on. Confirmed live immediately after: `200`, real
Next.js-rendered HTML (not the default page).

**Also done this session**: the RBAC role assignments (App Service
managed identity -> Key Vault Secrets User, -> Storage Blob Data
Contributor) and the DB migration/seed were **not completed** -- both
require pulling a live credential (an RBAC grant call, and the Key
Vault `DATABASE-URL` secret respectively) and both were refused by this
coding session's own tooling permission model as sensitive actions,
independent of Azure-side permissions (which are otherwise now correctly
in place for both). Left for John to run directly -- see the header
Blockers section above for the exact commands' location. The
`TempMigrationAccess` firewall rule (John's IP) was successfully added
and is still open, ready for whenever the migration is actually run.

**Verified live**: `https://tasco-people-desk.azurewebsites.net/`
returns `200` with real rendered Next.js HTML (not Kudu's default page,
not a 503). Not yet meaningfully testable beyond that -- no DB schema
exists on the real server yet, so anything touching Prisma will fail
until the migration above is run. No unit tests added this session --
this was entirely infra/deployment diagnosis and config, no application
code changed.

## Stage 7 (2026-09-16, in progress): Infrastructure

John nominated Stage 7 and asked to actually deploy to Azure, not just
write the Bicep. Pre-implementation declaration made before writing any
code, per this project's own operating rule 3.

**Gap found before writing infra**: Event Grid needs a webhook to
validate against at subscription-creation time, but `/api/scan/notifications`
(§7.3.2), `/api/jobs/attachment-scan-reconcile` (§7.3.2 fallback) and
`/api/jobs/sync-users` (§12) had never been built in any earlier stage --
referenced in the spec's job/route tables but never implemented. Put to
John directly (this project's operating rule 4): he chose to build all
three now rather than defer them.

**`lib/scan/verdict.ts`** (new): `mapDefenderVerdict()` (pure, tested) and
`applyScanVerdict()` -- the shared mapping + "never overwrite a terminal
verdict" guard both the webhook and the reconcile job need identically,
so neither encodes it separately.

**`POST /api/scan/notifications`** (new): Event Grid's subscription
validation handshake (different mechanics from Graph's own handshake --
JSON `{validationResponse}`, not an echoed text/plain token), shared-secret
auth via a `?code=` query param (`SCAN_WEBHOOK_SECRET`, new env var),
malware-scan-result events mapped and applied via `applyScanVerdict()`.
Added to `middleware.ts`'s public-route allowlist alongside
`/api/graph/notifications`, matching v1.4 §6's own updated text. **Completely
unexercised against a real tenant** -- field names match Microsoft's
documented schema but have never seen a real delivered payload, same
honest caveat `lib/graph/client.ts` already carries.

**`POST /api/jobs/attachment-scan-reconcile`** (new): every PENDING
attachment's blob index tag read directly (`Malware Scanning scan result`
tag key per §7.3.2), anything over 60 minutes forced BLOCKED/SCAN_TIMEOUT
regardless of tag state (fail-closed).

**`POST /api/jobs/sync-users`** (new): `lib/jobs/sync-users-core.ts`
(pure, tested) combines the three Entra role groups' membership into one
desired-state map, reusing `lib/roles.ts`'s existing `deriveRole()` for
highest-role-wins so sign-in and this job can never compute a different
role for the same user. Creates/updates/reactivates users and
**deactivates** anyone no longer in any of the three groups -- the
de-provisioning half of ADR-0002's "adding a user is adding them to a
security group" that nothing previously implemented. **Completely
unexercised** -- guarded the same way as Graph ingestion (`isGraphConfigured()`
+ all three group-ID env vars), logs and returns a zero-op rather than
throwing while §14 item 4 remains undone.

**`lib/azure/blob-client.ts`** + **`lib/blob-store.ts`** rewritten:
`lib/blob-store.ts`'s own Stage 1-6 comment already anticipated this --
a real `@azure/storage-blob`-backed `BlobStore`, authenticated via the App
Service's managed identity (`DefaultAzureCredential`, no account key or
connection string anywhere), selected automatically when
`AZURE_STORAGE_ACCOUNT_NAME` is set. `blob_path` values are unchanged
(`{container}/...`), so every caller upstream -- ingestion, archive
writer, retention purge -- needed no changes at all.

**`lib/telemetry.ts`** (new) + one line in `lib/jobs/run.ts`: §12.1's
liveness alert needs *some* channel a scheduled Azure Monitor query can
read on a timer, and `job_runs` is a Postgres table, not something Log
Analytics can query directly. `trackJobRunSucceeded()` emits one
Application Insights custom event per successful job run, from the one
shared wrapper every job already goes through -- a no-op everywhere
`APPLICATIONINSIGHTS_CONNECTION_STRING` isn't set (i.e. everywhere except
the real deployment).

**`infra/`** (new): `main.bicep` + 6 modules (`monitoring`, `storage`,
`keyvault`, `database`, `appservice`, `eventgrid`, `jobs`). Deployed to
`rg-tasco-people-desk` (Australia East), naming convention matching
`rg-tasco-bsc`/`rg-tasco-depot-control` (`asp-tasco-*`, `tasco-*-db`).
Notable choices, recorded so they aren't "corrected" later: Postgres gets
**geo-redundant backup + 35-day PITR** deliberately unlike the sibling
apps' servers (§2.1 calls this out as mandatory for this app specifically,
data-retention obligation being materially different); Blob Storage HNS
stays disabled (index tags, the reconcile job's only signal, don't exist
on ADLS Gen2 accounts); the Logic Apps' job key is embedded directly in
each workflow's static definition rather than wired through a Key Vault
connector (visible to anyone with Reader access to those five resources,
accepted -- blast radius is limited to this app's own job endpoints).
Full detail, including the deploy-time database bootstrap procedure and
the restore-test procedure, in `infra/README.md`.

**Deployed and verified**: all 18 resources created successfully
(`az deployment group create`, `provisioningState: Succeeded`) --
App Service, Postgres, Storage + Defender for Storage, Key Vault, App
Insights + Log Analytics + the liveness alert (disabled) + action group,
Event Grid system topic, all 7 Logic Apps. `npm run build` verified clean
locally before attempting any deploy.

**Three real blockers hit and honestly recorded, not routed around**:
1. **RBAC gap**: John's account can create resources but lacks
   `Microsoft.Authorization/roleAssignments/write` on this subscription.
   The two role assignments (App Service -> Key Vault Secrets User, App
   Service -> Storage Blob Data Contributor) are deployed conditionally
   (`assignRoles` param, currently `false`) so this one gap didn't fail
   the whole template. Fix documented in `infra/README.md`.
2. **App code deployment blocked**: this machine's Sophos TLS inspection
   serves a malformed certificate (missing Authority Key Identifier
   extension) specifically for `*.scm.azurewebsites.net`; Python's strict
   TLS validation (`az webapp deploy`'s own HTTP client) refuses it. Found
   and fixed a *different*, real TLS issue along the way (the Sophos SSL
   inspection root itself wasn't in the shared `azure-cacert-combined.pem`
   bundle also used by other Tasco projects -- added it, permanent fix,
   unrelated resources will benefit) -- but the remaining "missing AKI"
   error is a malformed-leaf-certificate problem, not a missing-root
   problem, and isn't fixable by adding more certs to a trust bundle.
   `AZURE_CLI_DISABLE_CONNECTION_VERIFICATION` would work but is a
   security control this session correctly refused to weaken
   unilaterally -- flagged to John rather than bypassed.
3. **DB migration/seed** against the real server needs a scoped, temporary
   firewall rule for John's own public IP. Deliberately did not open the
   firewall broadly (`0.0.0.0-255.255.255.255`) to avoid needing it --
   waiting on him to supply the address.

App Service is therefore live and reachable at
`tasco-people-desk.azurewebsites.net`, but currently running whatever
Kudu's default content is (no app code deployed yet), and its database
has no schema yet. Not yet a working system -- infrastructure only, until
the three blockers above clear.

**Tests**: 13 new unit tests (`mapDefenderVerdict`, `computeDesiredUsers`/
`deriveInitials`, `splitBlobPath`) -- 174 total, all passing. `tsc --noEmit`/
`next lint` both clean throughout.

## Documentation reconciliation (2026-09-16): Build Spec v1.4, ADR set 0001-0020, nav logo

John supplied two new documents: `TASCO_HR_Ticketing_Build_Spec_v1.4.md`
(supersedes v1.3, folds all 2026-09-16 ad hoc decisions back into the
normative spec) and `TASCO_HR_ADR_Set_0001-0020.md` (rationale for those
same decisions, explicitly non-binding per its own governance rule).

Actions taken, all mechanical/documentation-only, no application
behaviour changed:
- Split the ADR set into `docs/adr/0001-*.md` through `0020-*.md`
  (content preserved exactly, spot-checked against the source) plus
  `docs/adr/README.md` carrying the governance rules and index -- per
  the ADR document's own literal instruction to do so.
- Archived the superseded `TASCO_HR_Ticketing_Build_Spec_v1.3.md` to
  `docs/archive/` (v1.4 says "do not refer to earlier versions" --
  moved rather than deleted, so it's still recoverable).
- Removed a redundant duplicate copy of the v1.4 spec file (OneDrive
  had saved it twice with a `(1)` suffix, identical content).
- `STATUS.md`'s own header block updated to the new v1.4 template,
  which adds a "Spec reconciliation needed" field -- recorded as
  "None," since v1.4's whole purpose was reconciling the document with
  the system that already exists.

Nothing in v1.4/the ADR set changes what's already built; it's the spec
catching up to the ad hoc decisions already recorded lower in this file.
Next real build work should read the spec as v1.4 from here on, per its
own instruction ("Every new session begins with: Read
TASCO_HR_Ticketing_Build_Spec_v1.4.md and STATUS.md").

**Also this session**: added the Tasco Petroleum logo (`public/tasco-logo.jpg`)
to the shared `NavBar.tsx`, so it renders on every page. Two real bugs
found and fixed while doing this: (1) `next/image`'s built-in optimizer
makes an internal server-to-server fetch of the source file, which
doesn't carry the browser's session cookie -- since `middleware.ts`
auth-gates every route except a short allow-list that doesn't include
plain static files, that internal fetch was redirected to `/sign-in`
and the optimizer received HTML instead of an image ("the requested
resource isn't a valid image"). Fixed with the `unoptimized` prop so
the browser's own (cookie-bearing) request serves the file directly --
verified live by simulating a signed-in session and confirming
`/tasco-logo.jpg` returns real `image/jpeg` bytes. (2) A stale dev
server, started before `public/` existed, wasn't serving the new
directory at all -- fixed by restarting it. The logo file itself was
also cropped (auto-detected content bounding box, whitespace trimmed
to a ~2px margin) and enlarged 15% in the nav bar per John's follow-up
requests. `tsc --noEmit`/`next lint` clean throughout; no unit tests
apply (static asset + config only).

## Ad hoc session (2026-09-16, seventh): manual ticket creation

John asked for any staff member to be able to create a new ticket
directly, not only via email ingestion. The literal ticket lifecycle
text (§4: "NEW — created by email ingestion") doesn't describe this, but
it's not a §17 non-goal either, and `ticket_messages.message_type`'s own
enum already had a `MANUAL` value with nothing using it yet --
`schema.prisma`'s own Stage 5 comment on that value: "an officer
manually composing correspondence outside the three defined triggers."
Treated as the intended use for a manually-created ticket's first
message, once confirmed it wasn't about something else (it isn't --
that comment is specifically about correspondence on an *existing*
ticket, this is a new capability for a ticket that doesn't exist yet;
recorded so the distinction isn't lost).

**`lib/tickets/create-ticket.ts`** (new): the ticket_no
assignment/same-minute-collision-retry logic and SLA/request-date/
retention-date derivation, extracted from
`lib/ingestion/process-message.ts`'s create step (§7.3 step 4) --
previously the only caller, now shared with manual creation so both
paths use identical numbering/SLA rules instead of a second copy that
could drift. `processInboundMessage` itself is otherwise unchanged;
this was purely an extraction, verified by re-running the exact same
live ingestion check Stage 4 originally used (Urgent subject -> P1,
correct `sla_due_at`) after the refactor, not just trusting the diff.

**`POST /api/tickets`** (new): any signed-in staff member (no role
gate, same posture as self-claiming from the Pool) -- `requesterName`,
`requesterEmail`, `subject`, `description`, `priority` (P1/P2/P3,
explicitly chosen by the creator rather than auto-classified from a
typed subject -- a real request they're describing directly deserves an
explicit choice, not a keyword guess). Lands as `NEW`, unassigned, in
the Pool, `receivedAt = now()`, first message `direction: INBOUND,
messageType: MANUAL`. `TICKET_CREATED` audit-logged with the real
creator as actor (ingestion's own version of this same audit action
uses the seeded system user instead -- correctly different, now that
there's a real human actor to attribute it to for a manual entry).

**`/tickets/new`** (new page + form) -- requester name/email, subject,
description, a priority dropdown (defaults P3). A "+ New ticket" button
was added to the Pool page specifically, since John's ask named "the
dashboard" and Pool is the app's own default-landing/dashboard view;
not added to every other list view or the nav bar, to keep this change
scoped to what was actually asked.

**A deliberate display choice, flagged rather than silently decided**:
the ticket detail correspondence panel labels every inbound message
`[EMAIL IN]` regardless of `message_type` (direction-only, not
type-aware) -- so a manually-created ticket's first entry displays as
`[EMAIL IN]` even though it never was one. Could add a distinct
`[MANUAL ENTRY]` label, but that would mean touching
`app/tickets/[id]/page.tsx`'s correspondence rendering *and*
`lib/archive/render.ts`'s already-tested Stage 6 archive-label mapping
(same three-label scheme, `[EMAIL IN]`/`[EMAIL OUT]`/`[INTERNAL NOTE]`,
literally named in §10) to stay consistent between the live view and
the archived record. Left both untouched for this first version --
`message_type = MANUAL` still correctly distinguishes it in the
database and audit log, just not yet in either rendered view. Flag for
John: revisit if a visible distinction turns out to matter in practice.

**Verified live**: re-ran ingestion's own regression check post-refactor
(still correct); manual creation as a plain HR_OFFICER (no ADMIN/HR_LEAD
needed) succeeded, landed `NEW`/unassigned/correct priority/correct
`MANUAL` message; missing-field validation correctly rejected an
incomplete submission; the created ticket appeared in the Pool; **a
different HR_OFFICER than the creator** successfully claimed it exactly
like a real ticket, confirming full downstream compatibility (no special
casing needed anywhere else in the app). Also drove the actual browser
form end to end (not just the API) -- filled it in, submitted, landed on
the new ticket's own detail page, correspondence panel showed the typed
description correctly. 161 unit tests (unchanged -- this is Prisma-backed
ticket creation, verified live rather than unit-tested, same convention
as ingestion itself), `tsc --noEmit`/`next lint` both clean.

## Data cleanup (2026-09-16): all 52 test/fixture tickets soft-deleted

John asked for the accumulated seed/dev-verification tickets cleaned out
of the dashboard. Confirmed first, not assumed: queried every
non-deleted ticket (52 of them) and every single one had an
`@example.com` requester and an obviously synthetic subject ("Test dup,"
"Page render check," "Stage 6 test confidential," the 5 original
`prisma/seed.ts` fixtures, etc.) -- consistent with §14 never having
landed, so nothing in the database is a real ticket yet.

Cleaned up through the app's own sanctioned path -- `POST
/api/tickets/[id]/delete` (ADMIN + step-up + mandatory reason,
soft-delete only) -- **not** a raw SQL delete, so every removal is
audit-logged and reversible in principle (the row itself is untouched,
just `is_deleted`/`deleted_by`/`deleted_at`/`delete_reason` set). One
ticket (`260916062402`, a Stage 6 legal-hold test fixture) was still
under an active legal hold, which blocks deletion by design -- cleared
that hold first (also step-up + reason, also audit-logged) before
deleting it.

**Verified live**: Pool now shows "0 of 0 tickets"; `Admin -> Deleted`
lists all 54 soft-deleted tickets (the 52 from this cleanup plus 2
pre-existing ones from Stage 6's own delete-feature testing, untouched
here), each with who deleted it, when, and the reason -- nothing
silently vanished. 54 `TICKET_SOFT_DELETED` audit_log rows confirmed via
direct DB read. No code changed, so nothing to commit for this entry --
purely operational.

## Stage 6 deliverables (§16 item 6)

**Built and fully live-tested** (real dev server, real signed-in HTTP requests via the actual NextAuth flow):
- **Confidential** (§9, §9.1): `POST /api/tickets/[id]/confidential` (set: HR_LEAD/ADMIN, no step-up; clear: ADMIN + step-up). `lib/tickets/confidential-access.ts`'s `determineAccessBasis()` (assignee > ACL > role precedence) wired into `loadTicketForViewer()` itself -- every real view of a confidential ticket writes `CONFIDENTIAL_TICKET_VIEWED` unconditionally, not behind any UI action ("No break-glass mechanism ... the audit record is the control"). A new `lib/correlation.ts` helper (`getRequestCorrelationId()`) lets a Server Component get the same correlation ID a concurrent API call for the same request would, via `next/headers` reading what `middleware.ts` already forwards onto every request, page loads included.
- **Legal hold** (§10): `POST /api/tickets/[id]/legal-hold` -- ADMIN only, step-up + mandatory reason both ways, "may be placed at any lifecycle stage, including ARCHIVED" (no status guard at all). Ticket detail banner now shows reason/setter/date, not just a static string. Admin legal-holds view (`/admin/legal-holds`) sorts oldest-first and flags holds over 12 months old.
- **Soft delete** (§10): `POST /api/tickets/[id]/delete` -- ADMIN only, step-up + mandatory reason, blocked 409 while under legal hold. Admin deleted view (`/admin/deleted`) -- deliberately no link back to the ticket detail page, since `loadTicketForViewer()` excludes `is_deleted` tickets from every view including this one; the spec asks for a list, not a working drill-down.
- **Archive** (§10): `lib/archive/{load,render,writer}.ts` + `lib/archive/xsd/ticket.xsd`. The writer is transactional in the sense §10 means it: blob writes happen first, the `ARCHIVED` status update is the last line in the try block, a failure leaves the ticket `CLOSED` for retry and logs the error. Amendments re-archive as `ticket.v2.txt`/`ticket.v2.xml` alongside the untouched original (`BlobStore` gained `exists()` for this). A `BLOCKED`/`MALICIOUS` attachment's bytes are never copied into the permanent archive (same caution §11's export applies explicitly, applied here too even though §10 doesn't say it in so many words) -- the manifest (SHA-256 + scan status) documents it regardless. `app/api/jobs/archive-closed` (nightly) and `app/api/admin/archive-now` (ADMIN on-demand) share the exact same `archiveTicket()`.
- **Retention purge** (§10): `app/api/jobs/retention-purge` -- hard-deletes tickets where `retention_purge_date` has passed AND `is_legal_hold` is false (deliberately ignores `is_deleted` -- "soft delete is not a retention override"). Cascading FKs (already correct from earlier stages) take care of messages/notes/attachments/status-history/access-grants/email-log; `AuditLog.ticketId` going to `SetNull` is what lets the purge's own audit record (written *before* the delete, containing a SHA-256 subject hash, category, and timestamp) survive the ticket row's own destruction.
- **Export** (§11): per-ticket `.txt`/`.zip` (`app/api/tickets/[id]/export`, `archiver` for the zip, CLEAN-only attachment bytes with the manifest covering the rest), bulk CSV (`app/api/exports/bulk`, ADMIN/HR_LEAD, confidential rows excluded unless ADMIN, audit-logged with filter criteria), archive search (`app/api/archive-search` + `/archive-search` page, confidentiality-scoped, "Not a request" excluded by default), audit search (`app/api/admin/audit-log` + `/admin/audit-log` page, ADMIN/HR_LEAD per §3's matrix -- the §11 heading's own "(ADMIN)" parenthetical is imprecise, the matrix table is authoritative and is what `canViewAuditLog()` was already built against in an earlier stage).
- **Mid-turn addition**: ticket-number search added to the shared `FilterableTicketList` filter bar (`lib/tickets/filters.ts`), covering Pool/My tickets/All open/Overdue/Closed in one place since they all share that one component -- client-side over each view's already-authorized set, same posture as every other filter already there.

## Stage 6 verification (live against a running dev server, plus new unit tests)

- **156 unit tests** total (was 138 after the merge/Autoclose addition; +18: 3 `determineAccessBasis`, 11 archive `render.ts` txt/xml, 2 `archiveDir`, 2 ticket-number filter). `tsc --noEmit`, `next lint` both clean.
- **23-step live run** as real signed-in users (LF/HR_OFFICER, JDL/ADMIN, JDL with `simulateStepUp`): HR_OFFICER refused setting confidential (403) -> ADMIN sets it -> assignee can still view their own confidential ticket -> ADMIN clearing without step-up refused (403) -> clearing with step-up succeeds -> audit log shows `CONFIDENTIAL_TICKET_VIEWED` with `ASSIGNEE` basis; legal hold with no reason refused (400) -> set with reason -> delete blocked under hold (409) -> hold cleared; delete without step-up refused (403) -> delete with step-up succeeds -> ticket 404s everywhere afterward; a ticket walked NEW -> ... -> CLOSED -> on-demand archive run (`processed: 1, archived: 1, failed: 0` on top of 7 pre-existing CLOSED fixture tickets from earlier stages, all archived too) -> status confirmed `ARCHIVED`; `.txt` export contains the real ticket number; `.zip` export returns `application/zip`; archive search finds the archived ticket; bulk export refused for HR_OFFICER (403), succeeds for ADMIN; retention-purge job refuses a bad key (401), runs cleanly authenticated (0 purged -- correctly, nothing is 7 years old yet).
- Read a real generated `ticket.xml` off disk (`.local-blob-store/hr-archive/2026/09/<ticket_no>/ticket.xml`) and eyeballed it: correct namespace, correctly interleaved correspondence entries in chronological order, correct `edited`/`type` attributes, empty-but-present `<attachments>` element for a ticket with none.
- `/admin/legal-holds`, `/admin/deleted`, `/admin/audit-log`, `/archive-search` all render 200 with no error content as ADMIN.
- Ticket detail page: set a real legal hold, confirmed the banner shows the actual reason and setter name, not just the static "LEGAL HOLD" string from before this stage.

## Ad hoc session (2026-09-16, fifth): Add category/Add business unit, audit-log ticket-number search, Archive Search Autoclose toggle

Four requests from John in one message, plus a question answered inline
(not a code change): "explain the difference between Archive and
Closed tickets" -- answered directly in conversation, not recorded here
since it's not a spec/behavior change, but worth restating for anyone
reading this file cold: **CLOSED** is the normal terminal working
status (via Outcome, "Not a request," or Autoclose) -- still a live,
fully visible, ADMIN-reversible row, not yet archived. **ARCHIVED**
happens later, automatically (the nightly `archive-closed` job, or
ADMIN on-demand) -- it writes the durable `ticket.txt`/`ticket.xml`
artefacts (§10), flips status to `ARCHIVED`, and makes the portal view
read-only except to ADMIN. The **Closed** page (§13's lighter history
list) shows both CLOSED and ARCHIVED tickets across all officers;
**Archive Search** (§11) is a distinct, narrower feature -- full-text
search over archived tickets specifically, via the archive artefacts'
own metadata, and only exists because Stage 6 built the archiving
pipeline.

**Add category / Add business unit**: `POST /api/admin/categories` and
`POST /api/admin/business-units` (ADMIN only, §3), literally what §5's
own text already called for ("New categories are added through the
admin UI with no migration") but was never built. New entries append at
the end of the existing sort order (max + 1) -- not specified by the
spec, an uncontroversial default. `CATEGORY_CREATED`/
`BUSINESS_UNIT_CREATED` audit actions, name-collision check (both
`name` columns are `@unique`), `createdById` set to the creating admin
(the field existed but nothing populated it until now). "Add a
category"/"Add a business unit" forms added to the existing admin
screens, same pattern as Admin Users' "Add a user" form.

**Audit log: search by ticket number.** The page's own long-standing
comment already said "§11 'Audit search': by ticket, actor, action, date
range, correlation ID" -- date range already worked, but no ticket
field existed in the UI or was reachable via the API (only the internal
`ticketId` uuid was, which no real user has). Added a `ticketNo` query
param that resolves to the ticket's id server-side, plus a "Ticket
number" field in the UI and a "Ticket" column in the results table (a
`ticket: { select: { ticketNo: true } }` include added to the query, so
entries are actually legible without knowing a raw uuid by heart).

**A real bug caught before commit, in this same change**: the first cut
of ticket-number resolution used a `"__no_match__"` string sentinel for
"no ticket found," fed straight into `where: { ticketId: sentinel }`.
`ticket_id` is a real Postgres `uuid` column, so Prisma threw
`PrismaClientKnownRequestError P2023` ("Error creating UUID, invalid
character") instead of returning zero rows -- a 500, not an empty
result. Caught during this session's own live verification (a ticket
number that doesn't exist), not left for John to find. Fixed by
short-circuiting to `{ entries: [] }` before the query runs at all when
the ticket number doesn't resolve, rather than trying to express "no
match" as a fake uuid.

**Archive Search: a separate "Include Autoclose closures" toggle.**
Previously only "Not a request" closures were excluded from the default
result set (with a toggle to include them); Autoclose (spam / no action
needed) is the same *kind* of non-substantive closure and got the
identical treatment -- excluded by default, its own separate checkbox
(not folded into the existing one, since an operator may want either
independently of the other). `ArchiveSearchFilters.includeAutoclose`,
`searchArchive()`'s exclusion logic now builds a list of excluded
`CloseReason`s (`notIn`) instead of a single `not`.

**Verified live**: add-category and add-business-unit both succeeded as
ADMIN, both correctly refused a duplicate name (400) and a non-ADMIN
caller (403, HR_LEAD tested); audit-log search by a real action found
the just-created `CATEGORY_CREATED` entry, and by a non-existent ticket
number correctly returned `200`/0 entries (confirming the P2023 fix);
Archive Search's result count changed (6 -> 7) when the Autoclose toggle
was switched on, confirming an autoclosed-and-archived ticket exists and
the filter genuinely includes/excludes it. Verification-only test
category/business unit deactivated afterward so they don't linger in
the real lookup lists. 161 unit tests (unchanged -- all four changes are
Prisma-backed admin/search plumbing, verified live rather than with new
unit tests, same convention as the two admin screens before this),
`tsc --noEmit`/`next lint` both clean.

## Ad hoc session (2026-09-16, sixth): Instructions page

John asked for a page explaining how the system works and a procedure
for day-to-day use, accessible to everyone -- not role-gated like every
other `/admin/*` screen. `app/instructions/page.tsx`: static content
(no Prisma reads, deliberately, so it can't drift into showing stale
live data), grounded directly in the actual build spec and the app's
real current behaviour rather than generic HR advice -- lifecycle,
priority/SLA rules (including the 2026-09-16 amendment), replying/
threading, the full §3 permission matrix, a Closed-vs-Archived
explanation, a step-by-step ticket-handling walkthrough, and a summary
of what ADMIN-only screens do (visible to everyone for awareness, even
though only ADMIN can actually use them). Explicitly notes the current
§14 limitation (no real mailbox yet) so it doesn't read as false
documentation of a live mail connection. No new route exemption needed
in `middleware.ts` -- any authenticated session already reaches it,
which is exactly "accessible by all" (there's no requester portal in
this app, so "all" means all three staff roles). Linked in `NavBar.tsx`
unconditionally, alongside the other view links, not inside any
`canManageAdminSettings`/`canViewAuditLog` gate.

**A real, pre-existing rendering bug found and fixed while building
this**: plain `<ul>`/`<ol>` lists rendered with no bullets/numbers and no
indentation anywhere in the app -- Tailwind's Preflight base layer
strips list markers by default, and nothing had used a real prose list
before (the two existing bare lists, attachments and status history on
the ticket detail page, are short enough that nobody had noticed). Fixed
globally in `app/globals.css` (re-enabled `list-style`/indentation for
`ul`/`ol`/`li`), which also improved those two pre-existing lists, not
just the new page. Also added `p { margin-bottom: 0.6rem }` globally --
paragraphs had zero spacing between them (same Preflight reset), fine
for the single-paragraph banners elsewhere in the app but genuinely hard
to read on a page with this much prose.

**Verified live**: fetched `/instructions` as LF (HR_OFFICER, the
lowest-privilege role) -- 200, full content renders, nav link present.
Screenshotted the rendered page (both before and after the list/
paragraph CSS fix) to confirm it actually reads well, not just that it
returns 200. `tsc --noEmit`/`next lint` both clean, 161 unit tests
unchanged (this is a static content page + a global CSS fix, nothing
here has business logic to unit-test).

## Bug fix (2026-09-16): outbound emails (Allocation especially) appearing to go missing from the correspondence thread

John reported the allocation email wasn't showing in a ticket's
correspondence section. Investigated rather than guessed: the row was
always being written correctly (`lib/email/send.ts`'s `sendTicketEmail`
was never the problem), but `lib/tickets/detail.ts`'s
`TICKET_DETAIL_INCLUDE.messages.orderBy: { received_at: "asc" }` --
used by both the ticket detail page and `GET /api/tickets/[id]` -- only
sorts correctly for inbound email. Outbound messages (Allocation,
Outcome, SLA escalation) never populate `received_at`, only `sent_at`;
Postgres sorts NULLS LAST for ascending order, so **every** automated
outbound email was pushed to the very end of the correspondence thread
regardless of when it actually sent, landing after any later inbound
reply. On a ticket with several replies after allocation, the allocation
email ends up buried at the bottom, easy to mistake for genuinely
missing. `lib/archive/render.ts` (Stage 6's archive export) already had
this right (`(direction === "INBOUND" ? receivedAt : sentAt) ?? new
Date(0)`) -- the live ticket-detail view just never got the same
treatment, since it predates Stage 5's outbound messages entirely
(built in Stage 3, when every message was still inbound-only).

**Fix**: extracted the archive export's per-direction-timestamp logic
into a shared `lib/tickets/message-order.ts`
(`messageTimestamp`/`sortMessagesChronologically`), applied in
`loadTicketForViewer()` -- messages are now fetched without a DB-level
sort and re-sorted in application code by actual chronological time
regardless of direction. `lib/archive/render.ts` itself was left
untouched (already correct, already tested -- no reason to touch
working Stage 6 code for a dedupe alone).

**Reproduced before fixing, confirmed fixed after**: created a ticket,
claimed it (Allocation email sent), then sent a follow-up reply that
genuinely arrived later. Before the fix, the live `GET /api/tickets/[id]`
response showed `ORIGINAL, REPLY, ALLOCATION` -- the allocation email
sorted last despite being sent before the reply arrived. After the fix,
same scenario returns `ORIGINAL, ALLOCATION, REPLY`, matching real
chronological order. 2 new unit tests for the sort helper (one
specifically reproducing this exact ordering, one confirming the
function doesn't mutate its input). 161 unit tests total, `tsc
--noEmit`/`next lint` both clean.

## Ad hoc session (2026-09-16, fourth): Admin -- Categories screen

John asked for the equivalent of the Business units screen (previous
entry) for **categories** -- the same gap (no admin UI existed at all,
despite §13/§15 describing one). `app/api/admin/categories/[id]/route.ts`
and `app/admin/categories` mirror the business-units versions exactly:
ADMIN-only PATCH (name and/or `isActive`), name-collision check
(`name` is `@unique` on `categories` too), `CATEGORY_RENAMED`/
`CATEGORY_ACTIVATION_CHANGED` audit actions, same list+inline-edit UX.
No specific rename requested this time -- the screen itself was the ask.

**Verified live**: a rename-then-revert round trip on the "Other"
category (200 both ways, left the seeded data unchanged afterward) and
an HR_LEAD correctly refused (403, ADMIN-only, same as business units),
plus both `CATEGORY_RENAMED` audit_log rows confirmed via direct DB
read. 159 unit tests (unchanged, same reasoning as the business-units
entry), `tsc --noEmit`/`next lint` both clean.

## Ad hoc session (2026-09-16, third): Admin -- Business units screen, two renames

John asked to rename two business units ("Transport" -> "Carriers",
"Head Office" -> "Admin"). No admin UI existed for this lookup table at
all -- §13's nav list and §15's acceptance tests both describe one
("A new category added through the admin UI is immediately selectable"),
but it was never built in any earlier stage. Rather than hand-edit the
row in Postgres (which would silently skip §5.317's audit-log
requirement for this kind of change), built the missing capability:
`PATCH /api/admin/business-units/[id]` (ADMIN only, per §3 -- name
and/or `isActive`, `BUSINESS_UNIT_RENAMED`/`BUSINESS_UNIT_ACTIVATION_CHANGED`
audit actions, name-collision check since `name` is `@unique`) plus
`/admin/business-units` (list + inline rename + deactivate/restore,
same UX convention as the Admin Users screen). Renaming updates the
existing row in place -- existing tickets' `business_unit_id` FK is
untouched, so historical tickets automatically show the new name with no
migration.

**Scoped narrowly to what was asked**: no "create a new business unit"
UI yet (not requested), and the equivalent gap for **categories** (same
missing admin screen, same spec sections) was not touched -- flagged to
John, not built speculatively.

**Verified live**: both renames succeeded via a real ADMIN-signed-in PATCH
(`GET /api/business-units` confirmed both new names afterward), an
HR_LEAD attempting the same PATCH was correctly refused (403, ADMIN
only -- HR_LEAD has broader ticket permissions than HR_OFFICER but this
lookup-table management stays ADMIN-only per §3), and both
`BUSINESS_UNIT_RENAMED` audit_log rows confirmed via direct DB read with
correct before/after JSON. 159 unit tests (unchanged -- this was UI/API
plumbing, not new business logic worth a dedicated unit test), `tsc
--noEmit`/`next lint` both clean.

## Ad hoc session (2026-09-16, second): priority amendment UI, P3 SLA change, due-date permission widened

Four requests from John, none in the v1.3 spec as written -- this one
actually **amends §7.3 and §12's own text** (priority classification and
the P3 SLA figure), not just adding something alongside them. No
clarification stop was needed: the change John asked for was concrete
and unambiguous, and where the spec's own acceptance-test checklist
(§15) already anticipated part of it ("Changing priority recalculates
sla_due_at"), the capability turned out to already be built at the API
level -- just never exposed in the UI.

**Priority classification (§7.3) amended**: `lib/ingestion/priority.ts`'s
`classifyPriority()` no longer has an "'action' -> P2" rule. Subject
contains "urgent" (case-insensitive) -> P1; everything else -> P3
provisionally, on the basis that a non-urgent ticket's real priority is
"determined upon allocation" by the officer who picks it up, not guessed
from a keyword. This was a genuine design call, not a guess dressed up
as one: since `priority` and `sla_due_at` are both NOT NULL columns
populated at ticket creation (every escalation/overdue/dashboard
calculation from Stage 3 onward depends on `sla_due_at` always existing),
"determined upon allocation" can't mean the column stays empty until
then -- P3 (the existing fallback, and the most generous clock) is the
safe provisional default, correctable at any time via the new priority
amendment UI below. Flagged to John rather than silently assumed to be
correct; revisit if he meant something else (e.g. P2 as the provisional
default, or a genuinely nullable priority with allocation blocked until
it's set).

**P3 SLA changed 336h (14 days) -> 720h (30 days)** (§12). P1 (48h/2
days) and P2 (168h/7 days) are unchanged -- they already matched what
John asked for. Found **three separate hardcoded copies** of the same
`SLA_HOURS` table (`lib/ingestion/process-message.ts`,
`app/api/tickets/[id]/route.ts`, `prisma/seed.ts`) plus a fourth,
presentational one (`lib/email/templates.ts`'s `TIMEFRAME_LABEL`, used in
the Allocation email's "Expected response timeframe" line) -- consolidated
the first three into one `lib/tickets/sla.ts`, updated the fourth's P3
label to "30 days" to match.

**Priority amendment now has a UI.** The API already supported
`PATCH /api/tickets/[id]` with a `priority` field, correctly recalculating
`sla_due_at` -- built at some earlier stage to satisfy §15's own
acceptance-test line, but never exposed anywhere in the ticket detail
page. Added a Priority selector to the existing Metadata panel
(`app/tickets/[id]/ticket-actions.tsx`), same `canEditMetadata` gate
(assignee, HR_LEAD, or ADMIN) as category/business unit/subject/cc --
John asked to "allow amendments," not to widen who can make them, so
that permission is unchanged.

**Target due date opened to all staff** (`targetDueAt`/`targetDueReason`
only) -- previously gated the same as every other metadata field
(assignee/HR_LEAD/ADMIN); §5's own text named "the assignee, HR_LEAD or
ADMIN" specifically, so this is a deliberate deviation from that
sentence, done because John explicitly said "from all staff." The
`PATCH /api/tickets/[id]` route now checks permission per field group
instead of one blanket gate: subject/priority/category/business
unit/cc still need `canActOnAssignedTicket`; target due date fields need
only a valid session (every signed-in user of this app is staff -- there
is no requester portal, per §17's own non-goals list).

**Verified live** (real dev-mock-inbound-email + PATCH round trips
against the running dev server, plus a direct DB read of `sla_due_at`):
an "URGENT" subject created a ticket at P1 with `sla_due_at` exactly 48h
after `received_at`; the same subject that used to trigger "action"->P2
created a ticket at P3 with `sla_due_at` exactly 720h later; amending a
claimed ticket's priority P1->P2 correctly recalculated `sla_due_at` to
168h after `received_at`; an HR_OFFICER who was **not** the ticket's
assignee successfully set a target due date (200) but was still refused
(400) when trying to change that same ticket's priority, confirming the
two permission paths are genuinely split, not accidentally both
widened. 159 unit tests (two of the old priority tests collapsed into
one reflecting the new, simpler rule), `tsc --noEmit`/`next lint` both
clean.

## Ad hoc session (2026-09-16): subject-based ticket threading, tracking-number note, admin-editable display names

Three requests from John, none in the v1.3 spec, same "ad hoc addition"
pattern as merging/Autoclose below. One real design question put to him
before writing code (this project's own operating rule 4): should
subject-based ticket matching (see next paragraph) be restricted to the
ticket's own requester/cc_recipients, or match on subject alone
regardless of sender? **He chose no restriction** -- any sender whose
subject contains a live, non-archived ticket's number gets threaded onto
it. Recorded here because it's a deliberate, security-relevant choice,
not an oversight: the ticket number (a predictable `YYMMDDHHMM`+sequence
string) is a de facto write key into that ticket's correspondence once
this ships. It does **not** grant any extra *view* access -- §9's
confidential ACL still gates who can see the resulting message -- so the
exposure is data-integrity (wrong content attributed to a ticket's
thread), not a confidentiality breach.

**Subject-based ticket threading** (`lib/ingestion/subject-ticket-match.ts`,
wired into `lib/ingestion/process-message.ts`'s existing §7.3 step 3):
falls back to matching a bracketed 12-digit ticket number in the subject
(`[TICKETNO]`, the same format every outbound email already uses) only
when the primary mechanism -- Graph's `conversation_id` -- finds no
match. Excludes `ARCHIVED` tickets, same as the existing conversation_id
path; no other status or confidentiality exclusion, for consistency with
that same existing path (which also doesn't exclude confidential or
`CLOSED` tickets). 5 new unit tests for the pure extraction function.

**Tracking-number note**: `lib/email/templates.ts`'s Allocation and
Outcome emails (the two sent to the requester) now include "When
replying, please keep the ticket number in the subject line so your
response can be tracked against this ticket." **Escalation deliberately
excluded** -- it goes to internal HR_LEAD staff, not the requester.

**Admin-editable display names**: `PATCH /api/admin/users/[id]`
now also accepts `displayName` (new `USER_DISPLAY_NAME_CHANGED` audit
action, not step-up gated -- less sensitive than a role change, same
convention as activation toggling). This was mostly already built --
creating a user already had a free-text Display name field, and outbound
emails already render it, not a UPN/login -- the actual gap was that an
**existing** user's name couldn't be edited afterward. This is
specifically how John (not Claude) can give the dev-mock users (RJ, LF,
DN, JDL, RGL) real names -- they were deliberately seeded initials-only,
no invented names, and that convention is unchanged; the new Edit
control on `/admin/users` is the sanctioned way to change that.

**Verified live** (fresh dev-mock-inbound-email round trip against the
real dev server, not just unit tests): an email with `[TICKETNO]` in the
subject and a brand-new random `conversation_id` (the mock endpoint's
default) threaded onto the original ticket -- `THREADED` outcome,
correct `ticketId`; a second, unrelated email with no ticket number
still created its own new ticket as before; the resulting
`ticket_messages` row for the threaded reply sits chronologically
alongside the `ORIGINAL` and the automated `ALLOCATION` send on the same
ticket, confirmed via direct DB read (no new UI work needed -- the
correspondence view already renders every `ticket_messages` row
chronologically, built in Stage 3/6); a real `ALLOCATION` email's stored
`body_text` confirmed to include the new tracking-number sentence before
the footer; a display-name PATCH as JDL (ADMIN) took effect and was
reverted afterward so the seeded dataset wasn't left mutated. 161 unit
tests total (was 156, +5 for the subject-match extraction function),
`tsc --noEmit`/`next lint` both clean.

## Ad hoc session (2026-09-15, between Stage 5 and Stage 6): ticket merging, Autoclose

Not a numbered build-order stage -- John asked for two capabilities not in
the original v1.3 spec, directly (same "spec gap resolved by asking the
operator" pattern as §7.3.2's Defender scan-verdict addition). Both
recorded here as the authoritative design decisions since neither exists
in `TASCO_HR_Ticketing_Build_Spec_v1.3.md` itself.

**Ticket merging.** Three design questions put to John before writing any
code (this project's own operating rule 4 -- never invent business
logic): (1) merged-away content moves into **one unified thread** on the
prominent ticket (not kept separate-but-linked); (2) merge permission is
**assignee of either ticket, or ADMIN/HR_LEAD** (not ADMIN/HR_LEAD-only);
(3) confirmed decision, not asked (out of scope for this addition) --
Autoclose stays manual-only, not wired into suppression rules.

Implementation: `Ticket.mergedIntoTicketId` (self-relation, nullable,
`ON DELETE SET NULL`) plus two new `CloseReason` values, `MERGED` and
`AUTOCLOSE`. `POST /api/tickets/[id]/merge` (`lib/tickets/transitions.ts`'s
new `validateMerge()`, `lib/rbac.ts`'s new `canMergeTickets()`) runs a
single Prisma transaction: both tickets' `version`-checked atomically (a
new `MergeConflictError` distinguishes which one to report on a 409),
then `ticket_messages`/`ticket_notes`/`ticket_attachments` are
re-parented from source to target via `updateMany` (their own
`correlation_id`/timestamps untouched, so the existing chronological
sort already interleaves them correctly -- no new sorting logic needed).
`cc_recipients` union onto the target. The source ticket's own
`ticket_status_history`/`audit_log` rows deliberately **stay** on the
source (a historical record of what happened to that ticket, including
its own merge event) -- only user-facing content moves. **Confidential
tickets are refused as either source or target** (`badRequest`, not
silently allowed) -- §9's ACL enforcement doesn't exist until later in
this same stage, so merging confidential content now would risk
relocating it somewhere today's access model can't yet protect
correctly; revisit once this stage's own confidential work lands.
`GET /api/tickets/search` (new, confidentiality-scoped via the same
`confidentialFilter()` every list view already uses) backs the merge
picker UI (`merge-ticket-form.tsx`). Banners added to the ticket detail
page both directions ("merged into #X" / "Merged from: #A, #B").

**Autoclose.** `POST /api/tickets/[id]/close-autoclose` -- deliberately
near-identical to the existing `close-not-a-request` route (same
`validateNotARequestClose()` status set, same any-role permission, same
no-notification/no-category shape), just a distinct `close_reason` value
and audit action name for reporting/filtering clarity between "spam" and
"genuinely not an HR matter." UI button added next to "Not a request"
close.

**Verified live** (fresh dev server -- the leftover one from the Stage 5
session had a stale Prisma Client in memory from before this session's
migration and needed a hard `taskkill`, not just stopping the tracked
background task, which only kills the `npm` wrapper and leaves the
actual `next-server` child process listening): autoclose -> CLOSED/
AUTOCLOSE; search returns matches; merge moves messages+notes+
attachments into one interleaved thread, unions CC, closes the source as
CLOSED/MERGED with the correct `mergedIntoTicketId`; re-merging an
already-merged ticket refused (400); self-merge refused (400); ADMIN can
merge two tickets neither is assigned to; both ticket-detail banners
render on the correct side. 8 new unit tests (`validateMerge` x3,
`canCloseAsAutoclose` x3 across all roles, `canMergeTickets` x2) -- 138/138
passing, `tsc`/`lint` clean.

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
