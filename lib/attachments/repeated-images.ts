// Ignored images (John, 2026-10-05): suggestions for Admin -> Ignored images.
// An image that turns up, byte-for-byte identical, on several different
// tickets is almost always someone's email signature or a Tasco footer logo.
import { prisma } from "../prisma";

export const REPEATED_IMAGE_MIN_TICKETS = 3;

export interface RepeatedImage {
  sha256: string;
  tickets: number;
  bytes: number;
  names: string[];
  exampleTicketId: string;
  exampleTicketNo: string;
}

export async function findRepeatedImages(limit = 25): Promise<RepeatedImage[]> {
  const rows = await prisma.$queryRaw<
    { sha256: string; tickets: bigint; bytes: number; names: string[]; example_ticket_id: string; example_ticket_no: string }[]
  >`
    SELECT a.sha256,
           COUNT(DISTINCT a.ticket_id) AS tickets,
           MAX(a.size_bytes) AS bytes,
           (ARRAY_AGG(DISTINCT a.filename))[1:5] AS names,
           (ARRAY_AGG(t.id::text ORDER BY a.created_at DESC))[1] AS example_ticket_id,
           (ARRAY_AGG(t.ticket_no ORDER BY a.created_at DESC))[1] AS example_ticket_no
    FROM ticket_attachments a
    JOIN tickets t ON t.id = a.ticket_id AND NOT t.is_deleted
    WHERE a.removed_at IS NULL
      AND LOWER(COALESCE(a.detected_content_type, a.declared_content_type, '')) LIKE 'image/%'
      AND NOT EXISTS (SELECT 1 FROM ignored_images i WHERE i.sha256 = a.sha256 AND i.is_active)
    GROUP BY a.sha256
    HAVING COUNT(DISTINCT a.ticket_id) >= ${REPEATED_IMAGE_MIN_TICKETS}
    ORDER BY COUNT(DISTINCT a.ticket_id) DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    sha256: r.sha256,
    tickets: Number(r.tickets),
    bytes: Number(r.bytes),
    names: r.names,
    exampleTicketId: r.example_ticket_id,
    exampleTicketNo: r.example_ticket_no,
  }));
}
