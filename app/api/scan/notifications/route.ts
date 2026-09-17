import { NextResponse } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/correlation";
import { rateLimit } from "@/lib/rate-limit";
import { mapDefenderVerdict, applyScanVerdict } from "@/lib/scan/verdict";

// §7.3.2 primary path: Event Grid delivers Defender for Storage's malware
// scan verdicts here. **Completely unexercised against a real tenant** --
// infra/modules/eventgrid.bicep provisions the system topic but the event
// subscription (and the EventGrid Data Sender role assignment) are a
// follow-up once this route is confirmed reachable, same posture as
// lib/graph/client.ts's GraphApiClient. Field names below match Microsoft's
// documented malware-scanning event schema but have never been checked
// against a real delivered payload.
interface EventGridEnvelope {
  id: string;
  eventType: string;
  data: Record<string, unknown>;
}

function stringField(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** Absolute blob URL -> our `{container}/{blobName}` blob_path format (§5). */
function blobPathFromUri(blobUri: string): string | null {
  try {
    const url = new URL(blobUri);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const expectedSecret = process.env.SCAN_WEBHOOK_SECRET;
  const providedSecret = new URL(request.url).searchParams.get("code");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    console.error("Scan webhook: missing or mismatched shared secret -- request rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = (await request.json().catch(() => null)) as EventGridEnvelope[] | null;
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "Malformed event payload" }, { status: 400 });
  }

  // Event Grid's own one-time proof the endpoint is reachable, sent before
  // the real subscription is active -- same idea as Graph's validationToken
  // handshake (§7.1), different mechanics (§7.3.2).
  const validationEvent = events.find((e) => e.eventType === "Microsoft.EventGrid.SubscriptionValidationEvent");
  if (validationEvent) {
    const validationCode = stringField(validationEvent.data, "validationCode");
    return NextResponse.json({ validationResponse: validationCode });
  }

  const correlationId = getOrCreateCorrelationId(request.headers);

  for (const event of events) {
    const blobUri = stringField(event.data, "blobUri", "blobUrl");
    const rawResult = stringField(event.data, "scanResultType", "maliciousDetectionInfo", "resultType");
    if (!blobUri || !rawResult) {
      console.error("Scan webhook: event missing blobUri/scanResultType -- skipped", { correlationId, eventType: event.eventType });
      continue;
    }
    const verdict = mapDefenderVerdict(rawResult);
    const blobPath = blobPathFromUri(blobUri);
    if (!verdict || !blobPath) {
      console.error("Scan webhook: unrecognized verdict or blob URI -- skipped", { correlationId, rawResult, blobUri });
      continue;
    }
    try {
      await applyScanVerdict(blobPath, verdict, correlationId);
    } catch (err) {
      console.error("Scan webhook: failed to apply verdict", { correlationId, blobPath, error: err });
    }
  }

  return new NextResponse(null, { status: 200 });
}
