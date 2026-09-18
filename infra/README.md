# TASCO HR Ticketing — Stage 7 infrastructure

Bicep for everything build spec v1.4 §16 item 7 asks for. Deployed once (2026-09-16) to `rg-tasco-people-desk` (Australia East), following the naming convention already used by `rg-tasco-bsc` / `rg-tasco-depot-control`.

## What this deploys

| Resource | Purpose |
|---|---|
| `asp-tasco-people-desk` / `tasco-people-desk` | App Service Plan (Linux B1) + Site (Node 20, system-assigned managed identity) |
| `tasco-people-desk-db` | PostgreSQL Flexible Server, Burstable B1ms, 32GB, PG16, citext, **35-day geo-redundant backup** (§2.1 — deliberately stronger than sibling apps') |
| `tascopeopledeskstorage` | Blob Storage (GPv2, **HNS disabled** — required for §7.3.2's index-tag reconciliation path), containers `attachments`/`hr-archive`, 30-day soft delete on blobs+containers, versioning enabled, Defender for Storage with on-upload malware scanning |
| `kv-tasco-people-desk` | Key Vault (RBAC-authorized), holds every secret listed in `.env.example`'s "In Azure this is a Key Vault secret" comments |
| `appi-tasco-people-desk` / `log-tasco-people-desk` | Application Insights + Log Analytics |
| `alert-tasco-people-desk-ingestion-liveness` | §12.1's liveness alert — **provisioned disabled**, per spec, until the §7.0 Phase 2 cut-over |
| `egt-tasco-people-desk` | Event Grid system topic on the storage account (§7.3.2). The **event subscription is not yet created** — see "Event Grid subscription" below |
| `la-tasco-people-desk-*` (×7) | Consumption Logic Apps, one per `§12` job, calling `POST /api/jobs/{name}` with `X-Job-Key` |

## What's deliberately not here (§14, operator/IT-only)

- The resource group itself and spend approval (§14 Track A item 5) — already done, since you approved this deployment.
- DNS CNAME `hr.tascopetroleum.com.au` → this App Service, plus the managed certificate (§14 Track A item 6). Until then, the app is reachable at its default `*.azurewebsites.net` host — `NEXTAUTH_URL` is currently set to that placeholder.
- Entra app registration, admin consent, the `HR-Ticketing-*` security groups, and the mailbox migration (§14 Track B). Every corresponding app setting is deployed blank; the app already treats a blank value as "not configured yet" everywhere (see `.env.example`'s comments), not as a crash.

## Known gap: RBAC role assignments (`assignRoles` parameter)

The deploying account (`john.deluca@tascopetroleum.com.au`) has rights to create resources but **not** `Microsoft.Authorization/roleAssignments/write` on this subscription — likely Contributor without Owner/User Access Administrator at any scope above this resource group. `main.bicep`'s `assignRoles` parameter defaults to `true` but was deployed with `assignRoles=false` to avoid failing the whole template on this one permission gap.

**Consequence until this is fixed:** the App Service's managed identity cannot read Key Vault secrets (its Key Vault-reference app settings will show as unresolved) or write to Blob Storage (`lib/blob-store.ts`'s real Azure client will get 403s — attachments/archiving will fail).

**Fix — one of:**
1. If you're an Entra ID Global Administrator: Entra ID portal → your profile → **Azure AD roles and administrators**, or the subscription's **Access control (IAM)** → **Elevate access** (this is Entra ID's own "Global Administrator can grant themselves User Access Administrator at root scope" mechanism, used exactly for situations like this one). Then re-run:
   ```
   az deployment group create --name tpd-stage7-roles --resource-group rg-tasco-people-desk \
     --template-file infra/main.bicep --mode Incremental \
     --parameters @<same parameters as the original deploy, or a slimmer re-run> assignRoles=true
   ```
2. Or have whoever holds Owner on this subscription run just the two role assignments directly:
   ```
   az role assignment create --assignee <App Service principal ID, from `az webapp identity show`> \
     --role "Key Vault Secrets User" --scope <Key Vault resource ID>
   az role assignment create --assignee <same principal ID> \
     --role "Storage Blob Data Contributor" --scope <Storage Account resource ID>
   ```

## Event Grid subscription (deferred by design)

Event Grid validates a webhook subscription by calling it at creation time. `/api/scan/notifications` didn't exist on the very first deploy of this template (the App Service was still running whatever it starts with before code is deployed), so `createScanEventSubscription` defaults to `false` and the subscription resource is skipped.

Once the app code is live and `/api/scan/notifications` is confirmed reachable, redeploy with `createScanEventSubscription=true` to add it. **Done 2026-09-19** via a direct `az eventgrid system-topic event-subscription create` call (not a template redeploy — see the Blockers/parameters note in STATUS.md for why), validated live.

**No separate RBAC grant is needed for Defender for Storage to publish to this topic** — corrected 2026-09-19, previous text here was wrong. `EventGrid Data Sender` only applies to Event Grid *Namespace* resources (the newer MQTT/HTTP pub-sub resource type); it isn't assignable against a classic System Topic and doesn't show up in the Portal's role picker for one, which is what surfaced the mistake. A system topic tied to a storage account is published to by the Storage resource provider itself via its own built-in trust relationship — no discretionary RBAC grant exists in this model. Nothing further is needed here beyond the event subscription already created above.

## Database bootstrap (one-off, run once after first deploy)

`prisma/migrations/*_audit_log_grants` creates `app_role` inside the migration itself, but its **password** is never in a migration file (same reasoning as `scripts/db-bootstrap-local.sh` for local dev — a password has no business in version-controlled SQL). Against the real server:

```bash
# Temporarily allow this machine through the firewall (narrow, single IP -- never 0.0.0.0-255.255.255.255)
az postgres flexible-server firewall-rule create --resource-group rg-tasco-people-desk \
  --name tasco-people-desk-db --rule-name TempMigrationAccess \
  --start-ip-address <your public IP> --end-ip-address <your public IP>

DATABASE_URL="<migration role connection string, from Key Vault secret DATABASE-URL>" npx prisma migrate deploy
DATABASE_URL="<same>" npx prisma db seed

# Set app_role's real password (the one baked into Key Vault secret APP-DATABASE-URL)
psql "<migration role connection string>" -c "ALTER ROLE app_role WITH PASSWORD '<app role password>';"

# Remove the temporary rule -- the app's own runtime connection uses the
# AllowAllAzureServicesAndResourcesWithinAzureIps rule, already in place.
az postgres flexible-server firewall-rule delete --resource-group rg-tasco-people-desk \
  --name tasco-people-desk-db --rule-name TempMigrationAccess --yes
```

## Restore test (§2.1, a Stage 7 acceptance item)

"An untested backup is not a backup." Not yet run — do this once real data exists:
```bash
az postgres flexible-server restore --resource-group rg-tasco-people-desk \
  --name tasco-people-desk-db-restore-test --source-server tasco-people-desk-db \
  --restore-time <a timestamp from the last 35 days>
```
Confirm the restored server has the expected data, then delete it (`az postgres flexible-server delete`) — it's a one-off test, not a resource to keep running (it bills the same as the primary server while it exists).

## Redeploying

`main.bicep` is idempotent — re-running `az deployment group create` with the same parameters updates in place rather than duplicating resources. Regenerate the secure parameters fresh each time you redeploy secrets-bearing resources (Postgres passwords, `JOB_API_KEY`, etc.) — don't reuse a value from a previous run's shell history.
