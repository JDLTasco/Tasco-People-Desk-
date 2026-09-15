import { NextResponse } from "next/server";
import { getSession, hasFreshStepUp } from "@/lib/session";
import { unauthorized } from "@/lib/http-errors";
import { CORRELATION_ID_HEADER, getOrCreateCorrelationId } from "@/lib/correlation";

// Demo / smoke-test route for Stage 2's auth+RBAC pipeline: proves the
// server-side session re-check, correlation-ID propagation, and step-up
// freshness all work end-to-end, ahead of any real ticket routes (Stage 3+).
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return unauthorized();
  }

  const correlationId = getOrCreateCorrelationId(request.headers);

  return NextResponse.json(
    {
      userId: session.user.id,
      role: session.user.role,
      initials: session.user.initials,
      hasFreshStepUp: hasFreshStepUp(session),
      correlationId,
    },
    { headers: { [CORRELATION_ID_HEADER]: correlationId } },
  );
}
