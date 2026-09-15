import { NextResponse } from "next/server";

// Consistent JSON error shapes for API routes. §9: a confidential ticket
// unauthorized viewers must get 404 with NO metadata in the body -- notFound()
// deliberately takes no detail beyond a generic message so a route can never
// accidentally leak something in the body while returning the right status.

export function unauthorized(message = "Authentication required"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Not permitted"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Deliberately generic -- never pass ticket/entity detail here (§9: a 404 must not confirm the resource exists). */
export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function conflict(message: string, currentState?: unknown): NextResponse {
  return NextResponse.json({ error: message, currentState }, { status: 409 });
}
