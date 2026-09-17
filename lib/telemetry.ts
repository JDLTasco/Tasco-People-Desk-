import * as appInsights from "applicationinsights";

// Stage 7: §12.1's liveness alert ("fire to JDL if no successful
// mailbox-delta-poll run is recorded within 60 minutes") is a Log
// Analytics scheduled query over Application Insights custom events --
// there's no other channel an Azure Monitor alert rule can query on a
// schedule. `runJob` (the one place "every job does this identically",
// §12) is the only call site; nothing else needs to know App Insights
// exists. A no-op locally and everywhere else APPLICATIONINSIGHTS_CONNECTION_STRING
// isn't set (App Service application setting, wired from Key Vault via
// infra/modules/monitoring.bicep).
let client: appInsights.TelemetryClient | null | undefined;

function getClient(): appInsights.TelemetryClient | null {
  if (client !== undefined) return client;
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    client = null;
    return client;
  }
  appInsights.setup().setAutoCollectConsole(false).setAutoCollectExceptions(true).start();
  client = appInsights.defaultClient;
  return client;
}

export function trackJobRunSucceeded(jobName: string): void {
  try {
    getClient()?.trackEvent({ name: "JobRunSucceeded", properties: { jobName } });
  } catch (err) {
    // Telemetry must never be the reason a job fails.
    console.error("trackJobRunSucceeded failed", err);
  }
}
