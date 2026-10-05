// A distinct colour per staff member (John, 2026-10-03), so it's obvious at
// a glance whose ticket is whose. Each user gets a fixed slot from their
// position in the user list (oldest account first), so colours never
// shuffle when tickets change, and a new user simply takes the next slot.
// An admin can instead pick a user's colour on Admin -> Users (2026-10-05,
// users.colour_slot), which wins over the automatic slot.
// The colours themselves live in globals.css (.assignee-colour-N, light
// and dark variants); with more users than slots, colours repeat.
import { prisma } from "../prisma";
import { ASSIGNEE_COLOUR_NAMES } from "./colour-names";

export const ASSIGNEE_COLOUR_COUNT = ASSIGNEE_COLOUR_NAMES.length;

/** Pure: user ids in a stable order -> colour slot; an admin-chosen slot wins. */
export function colourSlots(orderedUserIds: string[], chosen: Map<string, number> = new Map()): Map<string, number> {
  return new Map(orderedUserIds.map((id, i) => [id, chosen.get(id) ?? i % ASSIGNEE_COLOUR_COUNT]));
}

export async function getAssigneeColourMap(): Promise<Map<string, number>> {
  const users = await prisma.user.findMany({
    // "system" = the seeded automated actor (SYSTEM_ENTRA_OBJECT_ID in
    // lib/ingestion/process-message.ts), not imported to keep this module light.
    where: { entraObjectId: { not: "system" } },
    select: { id: true, colourSlot: true },
    orderBy: [{ firstSeenAt: "asc" }, { id: "asc" }],
  });
  const chosen = new Map(users.filter((u) => u.colourSlot !== null).map((u) => [u.id, u.colourSlot as number]));
  return colourSlots(
    users.map((u) => u.id),
    chosen,
  );
}
