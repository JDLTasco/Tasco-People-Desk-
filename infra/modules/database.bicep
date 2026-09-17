// §2/§2.1: "PostgreSQL: geo-redundant backup enabled, point-in-time
// retention 35 days (default is 7)." This system is the sole record of HR
// requests for seven years -- platform defaults are insufficient, per
// §2.1's own heading ("mandatory"). Deliberately NOT matching the sibling
// Tasco apps' Postgres config (no geo-redundancy there) -- this app's
// retention obligation is materially different from a fuel-price or fleet
// tracking app's, and ADR-0001 already established this app diverges from
// suite consistency for exactly this kind of reason.
param location string
param serverName string
param administratorLogin string
@secure()
param administratorPassword string
param allowedClientIp string = ''

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 35
      geoRedundantBackup: 'Enabled'
    }
    highAvailability: { mode: 'Disabled' }
  }
}

// citext extension (§2, used by requester_email/name lookups) must be
// allow-listed on the server before `CREATE EXTENSION citext` succeeds.
resource allowExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2022-12-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    value: 'CITEXT'
    source: 'user-override'
  }
}

// No VNet anywhere in this architecture (§2) -- App Service reaches
// Postgres over the public endpoint, authenticated by password alone.
// This rule is Azure's documented way to allow that without naming every
// possible App Service outbound IP.
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgres
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Deploy-time-only: lets this machine reach the server directly to run
// `prisma migrate deploy`/seed. Remove after initial setup or after any
// one-off manual migration -- not needed for the app's own runtime
// connectivity, which goes through the Azure-services rule above.
resource allowDeployerIp 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = if (!empty(allowedClientIp)) {
  parent: postgres
  name: 'AllowDeployerIp'
  properties: {
    startIpAddress: allowedClientIp
    endIpAddress: allowedClientIp
  }
}

output fqdn string = postgres.properties.fullyQualifiedDomainName
output serverName string = postgres.name
