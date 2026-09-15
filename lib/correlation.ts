// Correlation IDs (§5.1): every inbound API request and every background
// job run generates one at entry, or adopts one supplied via
// X-Correlation-Id. It then propagates through audit_log, ticket_status_
// history, ticket_messages, email_log, suppression_log, job_runs, and
// every structured log line for that operation -- the objective being that
// an administrator given one correlation ID can reconstruct every event
// for a single operation (admin audit search by correlation ID, §11).

export const CORRELATION_ID_HEADER = "x-correlation-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A fresh correlation ID for a background job run (§12) or any entry point with no incoming request headers. */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Adopts the caller-supplied X-Correlation-Id if present and a well-formed
 * UUID, otherwise mints a new one. A malformed header is never trusted
 * as-is -- silently accepting garbage here would corrupt every downstream
 * table this ID gets written into.
 */
export function getOrCreateCorrelationId(headers: Headers): string {
  const supplied = headers.get(CORRELATION_ID_HEADER);
  if (supplied && UUID_PATTERN.test(supplied)) {
    return supplied;
  }
  return newCorrelationId();
}

/**
 * Stage 6: the confidential-ticket-view audit log (§9.1) needs a
 * correlation ID from Server Components too (the ticket detail page,
 * which calls loadTicketForViewer() directly -- not every viewer of a
 * confidential ticket necessarily goes through the GET API route first).
 * middleware.ts forwards X-Correlation-Id onto every request it lets
 * through, page requests included, so next/headers' headers() sees the
 * same ID a concurrent API call for the same request would.
 */
export async function getRequestCorrelationId(): Promise<string> {
  const { headers } = await import("next/headers");
  return getOrCreateCorrelationId(headers());
}
