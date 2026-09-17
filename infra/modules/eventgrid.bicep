// §7.3.2/§16 item 7. The event subscription is gated behind
// `createSubscription`, default false: Event Grid validates the webhook by
// calling it at subscription-creation time, so /api/scan/notifications
// must already be live at `scanNotificationsUrl` before this can succeed --
// impossible on the very first deploy, when the App Service is still
// running whatever default content it starts with. Redeploy this module
// alone with createSubscription=true once the app code is actually live.
param location string
param appName string
param storageAccountId string
@secure()
param scanNotificationsUrl string
param createSubscription bool = false

resource systemTopic 'Microsoft.EventGrid/systemTopics@2022-06-15' = {
  name: 'egt-${appName}'
  location: location
  properties: {
    source: storageAccountId
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}

// Filtered to the malware-scanning result event specifically -- this
// topic's other event types (blob created/deleted etc.) are not what
// /api/scan/notifications handles and would just be logged and skipped.
resource scanResultSubscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2022-06-15' = if (createSubscription) {
  parent: systemTopic
  name: 'sub-scan-results'
  properties: {
    destination: {
      endpointType: 'WebHook'
      properties: {
        endpointUrl: scanNotificationsUrl
      }
    }
    filter: {
      includedEventTypes: [
        'Microsoft.Security.MalwareScanningResult'
      ]
    }
    eventDeliverySchema: 'EventGridSchema'
  }
}

output systemTopicId string = systemTopic.id
output systemTopicName string = systemTopic.name
