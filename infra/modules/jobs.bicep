// §12: seven scheduled jobs, each a Consumption Logic App with a
// Recurrence trigger calling POST /api/jobs/{name} with X-Job-Key. Daily
// jobs use the "AUS Eastern Standard Time" Windows time zone ID (Logic
// Apps' recurrence trigger takes Windows IDs, not IANA) so 06:00/01:00/
// 02:00/03:00 mean Melbourne wall-clock time across the AEST/AEDT
// transition, not a fixed UTC offset -- the same Melbourne-timezone class
// of bug already found and fixed once on a sibling Tasco project (People
// Desk memory), worth naming so it isn't reintroduced here.
//
// Known, accepted tradeoff: the job key is embedded in each workflow's
// definition (visible to anyone with Reader access to these resources) --
// simpler than wiring a Key Vault connector for a Consumption Logic App,
// and its blast radius is limited to POSTing to this app's own internal
// job endpoints.
param location string
param appName string
param appHostName string
@secure()
param jobApiKey string

var jobs = [
  { name: 'graph-subscription-renew', frequency: 'Hour', interval: 12, hour: 0, minute: 0 }
  { name: 'mailbox-delta-poll', frequency: 'Minute', interval: 15, hour: 0, minute: 0 }
  { name: 'attachment-scan-reconcile', frequency: 'Minute', interval: 15, hour: 0, minute: 0 }
  { name: 'sla-escalation', frequency: 'Day', interval: 1, hour: 6, minute: 0 }
  { name: 'archive-closed', frequency: 'Day', interval: 1, hour: 1, minute: 0 }
  { name: 'retention-purge', frequency: 'Day', interval: 1, hour: 2, minute: 0 }
  { name: 'sync-users', frequency: 'Day', interval: 1, hour: 3, minute: 0 }
]

resource logicApps 'Microsoft.Logic/workflows@2019-05-01' = [for job in jobs: {
  name: 'la-${appName}-${job.name}'
  location: location
  properties: {
    state: 'Enabled'
    definition: {
      '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
      contentVersion: '1.0.0.0'
      triggers: {
        Recurrence: {
          type: 'Recurrence'
          recurrence: union(
            { frequency: job.frequency, interval: job.interval },
            job.frequency == 'Day'
              ? { timeZone: 'AUS Eastern Standard Time', schedule: { hours: [job.hour], minutes: [job.minute] } }
              : {}
          )
        }
      }
      actions: {
        CallJobEndpoint: {
          type: 'Http'
          inputs: {
            method: 'POST'
            uri: 'https://${appHostName}/api/jobs/${job.name}'
            headers: { 'X-Job-Key': jobApiKey }
          }
        }
      }
    }
  }
}]
