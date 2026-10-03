import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { loadAddressBook, suggestAddresses } from "@/lib/address-book";

// Address suggestions for the To/CC boxes (John, 2026-10-03) -- any signed-in
// staff member; confidential-only addresses are filtered per viewer (§9).
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ suggestions: [] });
  const book = await loadAddressBook(session.user.id, session.user.role);
  return NextResponse.json({ suggestions: suggestAddresses(book, q) });
}
