// A distinct colour per staff member (John, 2026-10-03), so it's obvious at
// a glance whose ticket is whose. Each user gets a fixed slot from their
// position in the user list (oldest account first), so colours never
// shuffle when tickets change, and a new user simply takes the next slot.
// The colours themselves live in globals.css (.assignee-colour-N, light
// and dark variants); with more users than slots, colours repeat.
import { prisma } from "../prisma";

export const ASSIGNEE_COLOUR_COUNT = 10;

/** Pure: user ids in a stable order -> colour slot. */
export function colourSlots(orderedUserIds: string[]): Map<string, number> {
  return new Map(orderedUserIds.map((id, i) => [id, i % ASSIGNEE_COLOUR_COUNT]));
}

export async function getAssigneeColourMap(): Promise<Map<string, number>> {
  const users = await prisma.user.findMany({
    // "system" = the seeded automated actor (SYSTEM_ENTRA_OBJECT_ID in
    // lib/ingestion/process-message.ts), not imported to keep this module light.
    where: { entraObjectId: { not: "system" } },
    select: { id: true },
    orderBy: [{ firstSeenAt: "asc" }, { id: "asc" }],
  });
  return colourSlots(users.map((u) => u.id));
}
