import { NextResponse } from "next/server";

// §7.1: "Rate-limit the endpoint. It is publicly reachable by necessity."
// A simple in-memory sliding window -- correct for a single App Service
// instance (this project's B1 tier, §2), but note explicitly: this
// resets per-instance and does NOT coordinate across multiple instances.
// If this app is ever scaled out, this needs a shared store (e.g. Redis)
// instead -- flagged here rather than silently wrong under scale-out.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

const hits = new Map<string, number[]>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export function rateLimit(request: Request): NextResponse | null {
  const key = clientKey(request);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  hits.set(key, timestamps);

  if (timestamps.length > MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return null;
}
