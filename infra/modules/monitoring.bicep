// Stage 7 (§16 item 7): Log Analytics + Application Insights, plus §12.1's
// ingestion liveness alert -- "fire to JDL if no successful
// mailbox-delta-poll run is recorded within 60 minutes." Provisioned
// **disabled**: "an enabled alert fires hourly from the day it is deployed
// [because Graph credentials don't exist yet] and staff learn to ignore
// the one alert that matters" (§12.1). Enable it as the final step of the
// §7.0 Phase 2 cut-over, not before.
param location string
param appName string
param alertEmail string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${appName}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${appName}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${appName}-jdl'
  location: 'global'
  properties: {
    groupShortName: 'hrTicketing'
    enabled: true
    emailReceivers: [
      { name: 'jdl', emailAddress: alertEmail, useCommonAlertSchema: true }
    ]
  }
}

// customEvents populated by lib/telemetry.ts's trackJobRunSucceeded(),
// called from the one shared job wrapper (lib/jobs/run.ts) every job
// already goes through -- see that file's own comment for why this is the
// only channel a scheduled Azure Monitor query can alert on.
resource livenessAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: 'alert-${appName}-ingestion-liveness'
  location: location
  properties: {
    displayName: 'HR Ticketing - mailbox-delta-poll liveness'
    description: '§12.1: nothing is missed if the poller is alive. A silently dead poller stops creating tickets while everyone assumes the system works.'
    severity: 1
    enabled: false // §12.1: enable only at the §7.0 Phase 2 cut-over, once Graph credentials are real.
    scopes: [appInsights.id]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    criteria: {
      allOf: [
        {
          query: 'customEvents | where name == "JobRunSucceeded" and tostring(customDimensions.jobName) == "mailbox-delta-poll"'
          timeAggregation: 'Count'
          operator: 'LessThan'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsId string = appInsights.id
output logAnalyticsWorkspaceId string = logAnalytics.id
