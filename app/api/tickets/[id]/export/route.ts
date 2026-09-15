import { PassThrough } from "stream";
import archiver from "archiver";
import { requireApiContext } from "@/lib/api-context";
import { notFound } from "@/lib/http-errors";
import { loadTicketForViewer } from "@/lib/tickets/detail";
import { loadTicketForArchive } from "@/lib/archive/load";
import { renderTicketTxt } from "@/lib/archive/render";
import { blobStore } from "@/lib/blob-store";

// §11 "Per-ticket": "any user with access exports a ticket as .txt (same
// format as the archive artefact) ... Checkbox to include attachments,
// producing a .zip. Attachments not in CLEAN status are excluded from
// the zip with a note in the manifest" -- ticket.txt already lists every
// attachment's scan status regardless (lib/archive/render.ts), which IS
// that note; the zip's attachments/ folder just doesn't include their
// bytes. Access is the same confidential gate as viewing the ticket
// (loadTicketForViewer -- 404, not 403, and this also logs
// CONFIDENTIAL_TICKET_VIEWED per §9.1, since exporting necessarily reads
// the full content).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const viewable = await loadTicketForViewer(params.id, session.user.id, session.user.role);
  if (!viewable) return notFound();

  const ticket = await loadTicketForArchive(params.id);
  if (!ticket) return notFound();

  const includeAttachments = new URL(request.url).searchParams.get("attachments") === "true";
  const txt = renderTicketTxt(ticket);

  if (!includeAttachments) {
    return new Response(txt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${ticket.ticketNo}.txt"`,
      },
    });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  const ended = new Promise((resolve) => stream.on("end", resolve));
  archive.pipe(stream);

  archive.append(txt, { name: `${ticket.ticketNo}.txt` });
  for (const a of ticket.attachments) {
    if (a.scanStatus !== "CLEAN") continue;
    try {
      const content = await blobStore.read(a.blobPath);
      archive.append(content, { name: `attachments/${a.filename}` });
    } catch (err) {
      console.error(`Export: could not read attachment ${a.filename} for ${ticket.ticketNo}:`, err instanceof Error ? err.message : err);
    }
  }
  await archive.finalize();
  await ended;

  return new Response(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ticket.ticketNo}.zip"`,
    },
  });
}
