import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { CORRELATION_ID_HEADER, getOrCreateCorrelationId } from "@/lib/correlation";

// §6 (v1.4): "Middleware protects every route except /api/graph/notifications
// (validated by clientState), /api/scan/notifications (validated per
// §7.3.2), /api/jobs/* (validated by X-Job-Key), and the health endpoint."
// NextAuth's own /api/auth/* must also stay open -- it IS the sign-in flow
// -- as must the sign-in and no-access pages themselves, or nobody could
// ever reach them to sign in.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/graph/notifications", "/api/scan/notifications", "/api/jobs", "/api/health"];
const PUBLIC_PAGES = new Set(["/sign-in", "/auth/no-access"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // §5.1: every inbound API request generates a correlation_id at entry,
  // or adopts one supplied via X-Correlation-Id. Threaded to route
  // handlers via a forwarded request header -- this is the one place that
  // guarantees every request gets one, so route handlers never have to.
  const correlationId = getOrCreateCorrelationId(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
  const forwarded = { request: { headers: requestHeaders } };

  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isPublicPage = PUBLIC_PAGES.has(pathname);

  if (isPublicApi || isPublicPage) {
    return NextResponse.next(forwarded);
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  const response = NextResponse.next(forwarded);
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
