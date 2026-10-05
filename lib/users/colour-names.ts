// Names for the 10 staff colour slots (.assignee-colour-N in globals.css),
// shown on Admin -> Users when an admin picks someone's colour (John,
// 2026-10-05). Kept apart from colours.ts so client components can import it
// without pulling in Prisma.
export const ASSIGNEE_COLOUR_NAMES = [
  "Blue",
  "Green",
  "Pink",
  "Orange",
  "Purple",
  "Teal",
  "Yellow",
  "Red",
  "Indigo",
  "Lime",
] as const;

export function isColourSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < ASSIGNEE_COLOUR_NAMES.length;
}
