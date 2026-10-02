import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, notFound } from "@/lib/http-errors";
import { writeAuditLog } from "@/lib/audit";

interface CreateNoteBody {
  body: string;
  visibility?: string;
}

// §3: "Add internal notes -- ✔" for every role, on any ticket.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const body = (await request.json().catch(() => ({}))) as Partial<CreateNoteBody>;
  if (!body.body || !body.body.trim()) return badRequest("body is required");
  // Operator amendment (John, 2026-10-03): notes are internal documents only
  // and can never go to anyone outside -- the requester-visible option is gone.
  if (body.visibility !== undefined && body.visibility !== "INTERNAL") {
    return badRequest("Notes are internal only");
  }

  const note = await prisma.ticketNote.create({
    data: {
      ticketId: ticket.id,
      authorId: session.user.id,
      body: body.body,
      visibility: "INTERNAL",
    },
    include: { author: { select: { id: true, displayName: true, initials: true } } },
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_NOTE_CREATED",
    entity: "ticket_note",
    entityId: note.id,
    ticketId: ticket.id,
    afterJson: { body: note.body, visibility: note.visibility },
  });

  return NextResponse.json({ note }, { status: 201 });
}
