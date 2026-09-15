import { NextResponse } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/correlation";
import { getGraphClient, isGraphConfigured } from "@/lib/graph/client";
import { processInboundMessage } from "@/lib/ingestion/process-message";
import { rateLimit } from "@/lib/rate-limit";

interface GraphNotification {
  subscriptionId: string;
  clientState?: string;
  resourceData: { id: string };
}

async function processNotifications(notifications: GraphNotification[], correlationId: string): Promise<void> {
  if (!isGraphConfigured()) {
    // §14 items 1-3 not done -- there's no way to fetch the actual
    // message content yet. Logged, not thrown: the HTTP response has
    // already gone out (202), throwing here would only produce an
    // unhandled rejection with nothing to catch it.
    console.error("Graph webhook: notification received but Graph is not configured (§14 not done)", {
      correlationId,
      count: notifications.length,
    });
    return;
  }
  const client = getGraphClient();
  for (const notification of notifications) {
    try {
      const message = await client.getMessage(notification.resourceData.id);
      await processInboundMessage(message, correlationId);
    } catch (err) {
      console.error("Graph webhook: failed to process notification", { correlationId, error: err });
    }
  }
}

// §7.1. Middleware (Stage 2) already exempts this path from the session
// gate -- clientState is this route's own authentication.
export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken !== null) {
    // "Implement the validation handshake: echo validationToken as
    // text/plain, HTTP 200, within 10 seconds." No auth on this leg --
    // it's Graph's one-time proof the endpoint is reachable, before any
    // subscription (and thus any clientState) exists yet.
    return new NextResponse(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const body = (await request.json().catch(() => null)) as { value?: GraphNotification[] } | null;
  if (!body?.value || body.value.length === 0) {
    return NextResponse.json({ error: "Malformed notification payload" }, { status: 400 });
  }

  const expectedClientState = process.env.GRAPH_WEBHOOK_CLIENT_STATE;
  const invalid = body.value.some((n) => !expectedClientState || n.clientState !== expectedClientState);
  if (invalid) {
    console.error("Graph webhook: missing or mismatched clientState -- notification dropped, not processed");
    return NextResponse.json({ error: "Invalid clientState" }, { status: 400 });
  }

  // "Respond 202 immediately, process asynchronously." No message queue
  // exists to hand this off to, so this is a genuine fire-and-forget --
  // failures inside processNotifications are logged, not surfaced to Graph.
  const correlationId = getOrCreateCorrelationId(request.headers);
  void processNotifications(body.value, correlationId);

  return new NextResponse(null, { status: 202 });
}
