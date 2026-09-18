// §2: "Azure App Service (Linux, Node 20, B1)." System-assigned managed
// identity is the only way this app authenticates to Key Vault (secrets)
// and Blob Storage (attachments/archive) -- §0.1.8: "No secrets in the
// repo. Key Vault plus managed identity only."
param location string
param appName string
param keyVaultUri string
param storageAccountName string
param appInsightsConnectionString string
param nextAuthUrl string

@secure()
param azureAdClientId string
@secure()
param azureAdTenantId string

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'asp-${appName}'
  location: location
  kind: 'linux'
  sku: { name: 'B1', tier: 'Basic' }
  properties: { reserved: true }
}

// Key Vault reference syntax -- App Service resolves these into the real
// secret value at runtime via its own managed identity, so the literal
// values here are never secrets themselves, just pointers (§0.1.8). A
// user-defined function, not a variable holding a lambda -- Bicep only
// allows a lambda expression as a direct argument to another function.
func keyVaultRef(vaultUri string, secretName string) string => '@Microsoft.KeyVault(SecretUri=${vaultUri}secrets/${secretName}/)'

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      // Built-in Linux stacks always probe port 8080 regardless of
      // package.json's own `start` script (which stays on 3002 for local
      // dev, to avoid colliding with sibling Tasco apps) -- WEBSITES_PORT
      // is silently ineffective for non-container stacks, this is the
      // real mechanism. Declared here so a template redeploy can't
      // silently drop it and take the live site back to serving Azure's
      // default page (found live, Stage 7, 2026-09-16).
      appCommandLine: 'next start -p 8080'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'NEXTAUTH_URL', value: nextAuthUrl }
        { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storageAccountName }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        // Non-secret Entra values (§0.1.8: tenant ID "isn't secret, it's
        // already visible in every OAuth redirect URL"). Client ID is not
        // secret either -- only the client *secret* is, and that one
        // comes from Key Vault below.
        { name: 'AZURE_AD_CLIENT_ID', value: azureAdClientId }
        { name: 'AZURE_AD_TENANT_ID', value: azureAdTenantId }
        { name: 'NEXT_PUBLIC_AZURE_AD_TENANT_ID', value: azureAdTenantId }
        // §14 Track A/B items not done yet -- blank, same "not configured"
        // posture lib/auth.ts, lib/graph/client.ts and lib/roles.ts already
        // handle without crashing. Set by the operator once real, via the
        // Azure Portal or `az webapp config appsettings set` -- not by
        // redeploying this template every time.
        { name: 'HR_MAILBOX_ID', value: '' }
        { name: 'AZURE_AD_GROUP_ADMINS_ID', value: '' }
        { name: 'AZURE_AD_GROUP_LEADS_ID', value: '' }
        { name: 'AZURE_AD_GROUP_USERS_ID', value: '' }
        // Secrets, resolved from Key Vault at runtime (§0.1.8).
        { name: 'APP_DATABASE_URL', value: keyVaultRef(keyVaultUri, 'APP-DATABASE-URL') }
        { name: 'DATABASE_URL', value: keyVaultRef(keyVaultUri, 'DATABASE-URL') }
        { name: 'NEXTAUTH_SECRET', value: keyVaultRef(keyVaultUri, 'NEXTAUTH-SECRET') }
        { name: 'JOB_API_KEY', value: keyVaultRef(keyVaultUri, 'JOB-API-KEY') }
        { name: 'GRAPH_WEBHOOK_CLIENT_STATE', value: keyVaultRef(keyVaultUri, 'GRAPH-WEBHOOK-CLIENT-STATE') }
        { name: 'SCAN_WEBHOOK_SECRET', value: keyVaultRef(keyVaultUri, 'SCAN-WEBHOOK-SECRET') }
        { name: 'AZURE_AD_CLIENT_SECRET', value: keyVaultRef(keyVaultUri, 'AZURE-AD-CLIENT-SECRET') }
      ]
    }
  }
}

output principalId string = appService.identity.principalId
output defaultHostName string = appService.properties.defaultHostName
output name string = appService.name
