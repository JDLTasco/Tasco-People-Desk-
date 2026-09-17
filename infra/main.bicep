// TASCO HR Ticketing -- Stage 7 infrastructure (build spec v1.4 §16 item 7).
// Resource-group-scoped. Requires §14 Track A only (subscription, resource
// group and spend approval; DNS). Naming follows the convention already
// used by rg-tasco-bsc / rg-tasco-depot-control (asp-tasco-*, tasco-*-db).
//
// Deliberately NOT in this template (§14, operator/IT-only, outside what
// Claude Code may do per operating rule 5): the resource group itself, the
// Entra app registration and admin consent, the HR-Ticketing-* security
// groups, the mailbox migration, and the DNS CNAME + managed certificate
// for hr.tascopetroleum.com.au. Until the DNS/cert step is done, reach the
// app at its default *.azurewebsites.net host.
targetScope = 'resourceGroup'

param location string = resourceGroup().location
param appName string = 'tasco-people-desk'
param alertEmail string

param postgresAdminLogin string = 'pgadmin'
@secure()
param postgresAdminPassword string
@secure()
param appRolePassword string
param deployerClientIp string = ''

@secure()
param nextAuthSecret string
@secure()
param jobApiKey string
@secure()
param graphWebhookClientState string
@secure()
param scanWebhookSecret string

// §14 Track B items -- blank until the operator has done them. Not
// `@secure()`: the client ID isn't a secret (§0.1.8), but keeping the
// param optional-and-blank-by-default here matches how every app-settings
// value downstream already treats "not configured yet."
param azureAdClientId string = ''
param azureAdTenantId string = ''
@secure()
param azureAdClientSecret string = ''

// Set true on a second, later deployment of this same template once the
// app code is actually live and /api/scan/notifications is reachable --
// see infra/modules/eventgrid.bicep's own comment for why it can't be true
// on the first deploy.
param createScanEventSubscription bool = false

// Set true once the deploying principal has (or has been granted)
// Microsoft.Authorization/roleAssignments/write on this resource group --
// Contributor alone does not include it. Without these two assignments,
// the App Service's managed identity can reach neither Key Vault (so its
// Key Vault-reference app settings resolve to nothing) nor Blob Storage
// (so lib/blob-store.ts's real Azure client gets 403s) -- infra/README.md
// has the exact commands to grant them, and to run this template again
// with this flag true.
param assignRoles bool = true

var storageAccountName = toLower('${replace(appName, '-', '')}storage')
var keyVaultName = 'kv-${appName}'
var postgresServerName = '${appName}-db'

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    appName: appName
    alertEmail: alertEmail
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    storageAccountName: storageAccountName
  }
}

module database 'modules/database.bicep' = {
  name: 'database'
  params: {
    location: location
    serverName: postgresServerName
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
    allowedClientIp: deployerClientIp
  }
}

// §5's app_role (least-privilege, no UPDATE/DELETE on audit_log) is what
// the running app connects as; postgresAdminLogin/-Password (the
// migration role, DATABASE_URL) is only ever used to run `prisma migrate
// deploy` and the one-off `ALTER ROLE app_role WITH PASSWORD ...` step
// this project's local dev already does via scripts/db-bootstrap-local.sh
// -- see infra/README.md for the equivalent one-off command against this
// real server.
var migrationDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${database.outputs.fqdn}:5432/tasco_people_desk?sslmode=require&schema=public'
var appDatabaseUrl = 'postgresql://app_role:${appRolePassword}@${database.outputs.fqdn}:5432/tasco_people_desk?sslmode=require&schema=public'

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVault'
  params: {
    location: location
    keyVaultName: keyVaultName
    tenantId: subscription().tenantId
    appDatabaseUrl: appDatabaseUrl
    migrationDatabaseUrl: migrationDatabaseUrl
    nextAuthSecret: nextAuthSecret
    jobApiKey: jobApiKey
    graphWebhookClientState: graphWebhookClientState
    scanWebhookSecret: scanWebhookSecret
    azureAdClientSecret: azureAdClientSecret
  }
}

module appService 'modules/appservice.bicep' = {
  name: 'appService'
  params: {
    location: location
    appName: appName
    keyVaultUri: keyVault.outputs.keyVaultUri
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    // Placeholder until §14 Track A item 6 (DNS CNAME + managed cert)
    // lands -- see this file's own header comment.
    nextAuthUrl: 'https://${appName}.azurewebsites.net'
    azureAdClientId: azureAdClientId
    azureAdTenantId: azureAdTenantId
  }
}

module eventGrid 'modules/eventgrid.bicep' = {
  name: 'eventGrid'
  params: {
    location: location
    appName: appName
    storageAccountId: storage.outputs.storageAccountId
    scanNotificationsUrl: 'https://${appService.outputs.defaultHostName}/api/scan/notifications?code=${scanWebhookSecret}'
    createSubscription: createScanEventSubscription
  }
}

module jobs 'modules/jobs.bicep' = {
  name: 'jobs'
  params: {
    location: location
    appName: appName
    appHostName: appService.outputs.defaultHostName
    jobApiKey: jobApiKey
  }
}

// Role assignments live here, not inside the keyvault/storage modules
// themselves, specifically to avoid a module dependency cycle: appService
// needs keyVault's/storage's outputs for its app settings, and these
// assignments need appService's principalId -- putting them in a third
// place (this file) lets both directions resolve.
resource keyVaultExisting 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  dependsOn: [keyVault]
}

resource storageAccountExisting 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
  dependsOn: [storage]
}

var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource appServiceKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignRoles) {
  // Seeded from appName, not appService.outputs.principalId: a role
  // assignment's `name` must be computable before deployment starts (BCP120),
  // but a system-assigned identity's principalId is only known once that
  // resource actually exists. A fixed, deterministic seed is standard
  // practice here -- the assignment is still unique per (vault, app, role).
  name: guid(keyVaultExisting.id, appName, keyVaultSecretsUserRoleId)
  scope: keyVaultExisting
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: appService.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appServiceStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignRoles) {
  name: guid(storageAccountExisting.id, appName, storageBlobDataContributorRoleId)
  scope: storageAccountExisting
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: appService.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

output appServiceName string = appService.outputs.name
output appServiceHostName string = appService.outputs.defaultHostName
output postgresFqdn string = database.outputs.fqdn
output storageAccountName string = storage.outputs.storageAccountName
output keyVaultName string = keyVault.outputs.keyVaultName
output eventGridSystemTopicName string = eventGrid.outputs.systemTopicName
