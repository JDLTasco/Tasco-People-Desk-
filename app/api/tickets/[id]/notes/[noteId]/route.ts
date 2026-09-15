import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden, notFound } from "@/lib/http-errors";
import { canEditNote } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

interface EditNoteBody {
  body: string;
}

// §5: "Editing a note inserts a new row marked current, sets the prior row
// is_current = false, and links via supersedes_note_id. Nothing is ever
// UPDATEd or DELETEd." §3: gated on ownership ("Edit own note"), not role.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; noteId: string } },
) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const existing = await prisma.ticketNote.findUnique({ where: { id: params.noteId } });
  if (!existing || existing.ticketId !== params.id || !existing.isCurrent) {
    return notFound();
  }

  if (!canEditNote(session.user.role, existing.authorId === session.user.id)) {
    return forbidden("You can only edit your own notes");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<EditNoteBody>;
  if (!body.body || !body.body.trim()) return badRequest("body is required");

  const [, newNote] = await prisma.$transaction([
    prisma.ticketNote.update({ where: { id: existing.id }, data: { isCurrent: false } }),
    prisma.ticketNote.create({
      data: {
        ticketId: existing.ticketId,
        authorId: existing.authorId,
        body: body.body,
        visibility: existing.visibility,
        supersedesNoteId: existing.id,
      },
      include: { author: { select: { id: true, displayName: true, initials: true } } },
    }),
  ]);

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_NOTE_REVISED",
    entity: "ticket_note",
    entityId: newNote.id,
    ticketId: existing.ticketId,
    beforeJson: { noteId: existing.id, body: existing.body },
    afterJson: { noteId: newNote.id, body: newNote.body },
  });

  return NextResponse.json({ note: newNote });
}
