// §0.1.8/§2: "No secrets in the repo. Key Vault plus managed identity
// only." RBAC authorization (not legacy access policies) so access is
// granted the same way as every other Azure resource in this app --
// role assignments -- rather than a second, parallel permission model.
param location string
param keyVaultName string
param tenantId string

@secure()
param appDatabaseUrl string
@secure()
param migrationDatabaseUrl string
@secure()
param nextAuthSecret string
@secure()
param jobApiKey string
@secure()
param graphWebhookClientState string
@secure()
param scanWebhookSecret string
@secure()
param azureAdClientSecret string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

// One secret resource per value. §14 items not yet done (AZURE_AD_CLIENT_SECRET,
// HR_MAILBOX_ID) get a placeholder empty-string secret now and a real value
// once the operator completes that item -- lib/auth.ts and lib/graph/client.ts
// already treat a blank value as "not configured yet," not a crash.
resource secretAppDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'APP-DATABASE-URL'
  properties: { value: appDatabaseUrl }
}

resource secretMigrationDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'DATABASE-URL'
  properties: { value: migrationDatabaseUrl }
}

resource secretNextAuthSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'NEXTAUTH-SECRET'
  properties: { value: nextAuthSecret }
}

resource secretJobApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'JOB-API-KEY'
  properties: { value: jobApiKey }
}

resource secretGraphWebhookClientState 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'GRAPH-WEBHOOK-CLIENT-STATE'
  properties: { value: graphWebhookClientState }
}

resource secretScanWebhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SCAN-WEBHOOK-SECRET'
  properties: { value: scanWebhookSecret }
}

// §14 Track B item 1 hasn't happened -- blank until the operator creates
// the real Entra app registration and updates this secret.
resource secretAzureAdClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-AD-CLIENT-SECRET'
  properties: { value: azureAdClientSecret }
}

output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultName string = keyVault.name
