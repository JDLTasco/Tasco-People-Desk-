import type { Session } from "next-auth";
import { getSession } from "./session";
import { getOrCreateCorrelationId } from "./correlation";
import { unauthorized } from "./http-errors";

export interface ApiContext {
  session: Session;
  correlationId: string;
}

/**
 * Every ticket route handler's first line. Returns either the resolved
 * context or a ready-to-return 401 response -- §6: "Every API route
 * re-checks role server-side," starting with "is there a session at all."
 */
export async function requireApiContext(request: Request): Promise<ApiContext | Response> {
  const session = await getSession();
  if (!session?.user) {
    return unauthorized();
  }
  const correlationId = getOrCreateCorrelationId(request.headers);
  return { session, correlationId };
}
