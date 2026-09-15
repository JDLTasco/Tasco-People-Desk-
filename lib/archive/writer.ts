import { prisma } from "../prisma";
import { blobStore } from "../blob-store";
import { loadTicketForArchive, type ArchiveTicket } from "./load";
import { renderTicketTxt, renderTicketXml } from "./render";

/** §10 "Archive location": path derived from request_date (not closure date), never the closure timestamp. */
export function archiveDir(ticket: Pick<ArchiveTicket, "requestDate" | "ticketNo">): string {
  const y = ticket.requestDate.getUTCFullYear();
  const m = String(ticket.requestDate.getUTCMonth() + 1).padStart(2, "0");
  return `hr-archive/${y}/${m}/${ticket.ticketNo}`;
}

/**
 * §10 "Amendments to archived tickets": "Original artefacts are never
 * overwritten: write a new versioned set alongside (ticket.txt,
 * ticket.v2.txt, ...)." Probes sequentially rather than listing the
 * directory -- BlobStore has no list() (Azure Blob Storage's own
 * equivalent is a paginated API Stage 7 would need to wire up regardless,
 * and this runs at nightly-job/on-demand-admin frequency, never a hot
 * path), so a handful of existence checks is the simplest correct
 * approach without adding that surface area before it's needed.
 */
async function nextArtifactBaseName(dir: string): Promise<string> {
  if (!(await blobStore.exists(`${dir}/ticket.txt`))) return "ticket";
  let v = 2;
  while (await blobStore.exists(`${dir}/ticket.v${v}.txt`)) v++;
  return `ticket.v${v}`;
}

export interface ArchiveResult {
  ok: boolean;
  ticketId: string;
  ticketNo: string;
  error?: string;
}

/**
 * §10 "Archive trigger": writes the artefacts, then marks the ticket
 * ARCHIVED -- but only after every blob write succeeds. "A failed or
 * partial blob write leaves the ticket CLOSED for retry on the next run,
 * and logs the failure. Never mark archived optimistically" -- the
 * status update is deliberately the last statement in the try block, not
 * hoisted earlier for any reason.
 */
export async function archiveTicket(ticketId: string): Promise<ArchiveResult> {
  const ticket = await loadTicketForArchive(ticketId);
  if (!ticket) return { ok: false, ticketId, ticketNo: "?", error: "ticket not found" };
  if (ticket.status !== "CLOSED") {
    return { ok: false, ticketId, ticketNo: ticket.ticketNo, error: `ticket is ${ticket.status}, not CLOSED -- nothing to archive` };
  }

  const dir = archiveDir(ticket);
  try {
    const base = await nextArtifactBaseName(dir);
    await blobStore.save(`${dir}/${base}.txt`, Buffer.from(renderTicketTxt(ticket), "utf-8"));
    await blobStore.save(`${dir}/${base}.xml`, Buffer.from(renderTicketXml(ticket), "utf-8"));

    // Attachment files themselves don't change between archive/re-archive
    // passes -- only copied alongside on the first archive.
    if (base === "ticket") {
      for (const a of ticket.attachments) {
        // §10's manifest requirement (SHA-256 + scan status, already
        // written into ticket.txt/ticket.xml above) is satisfied either
        // way; a BLOCKED/MALICIOUS file's actual bytes are never copied
        // into the permanent legal record -- same caution §11's export
        // applies explicitly, applied here too even though §10 doesn't
        // say it in so many words.
        if (a.scanStatus === "BLOCKED" || a.scanStatus === "MALICIOUS") continue;
        const content = await blobStore.read(a.blobPath);
        await blobStore.save(`${dir}/attachments/${a.filename}`, content);
      }
    }

    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    return { ok: true, ticketId, ticketNo: ticket.ticketNo };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Archive writer failed for ${ticket.ticketNo} (${ticketId}): ${message}`);
    return { ok: false, ticketId, ticketNo: ticket.ticketNo, error: message };
  }
}
