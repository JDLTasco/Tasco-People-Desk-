// §2/§2.1/§7.3.2. **Hierarchical namespace must stay disabled** -- blob
// index tags (the reconciliation path's only signal, §7.3.2) are not
// supported on ADLS Gen2 accounts, so enabling HNS silently removes that
// fallback entirely. Standard GPv2 only.
param location string
param storageAccountName string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    isHnsEnabled: false
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // §7.3.2: "The Event Grid topic must allow public network access --
    // topics reachable only via private endpoint are unsupported for
    // scan-result delivery." No VNet/private endpoints anywhere in this
    // architecture (§2), so this is the account's default posture already;
    // stated explicitly so a later "harden with private endpoints" pass
    // doesn't break malware-scan delivery without knowing why.
    networkAcls: { defaultAction: 'Allow' }
  }
}

// §2.1: "Blob Storage: soft delete for blobs and containers, 30-day
// retention... Blob versioning enabled on hr-archive." Versioning is an
// account-level setting; enabled account-wide since Azure has no
// per-container versioning toggle, which also protects `attachments`.
resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: 30 }
    containerDeleteRetentionPolicy: { enabled: true, days: 30 }
  }
}

resource attachmentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: 'attachments'
  properties: { publicAccess: 'None' }
}

resource archiveContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: 'hr-archive'
  properties: { publicAccess: 'None' }
}

// §7.3.2/§14 Track A item 5: Defender for Storage, scoped to this account
// specifically (not the subscription-wide default) so it doesn't affect
// other Tasco apps' storage accounts. On-upload malware scanning is what
// populates the blob index tag the reconciliation job reads and what
// publishes the Event Grid events the webhook receives.
resource defenderForStorage 'Microsoft.Security/DefenderForStorageSettings@2022-12-01-preview' = {
  scope: storageAccount
  name: 'current'
  properties: {
    isEnabled: true
    malwareScanning: {
      onUpload: {
        isEnabled: true
        capGBPerMonth: 5000
      }
    }
    sensitiveDataDiscovery: { isEnabled: false }
    overrideSubscriptionLevelSettings: true
  }
}

output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
