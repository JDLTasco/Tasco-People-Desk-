// Split out of lib/address-book.ts so client components can use the labels
// without pulling in the Prisma-backed loader.
export type AddressSource = "REQUESTER" | "CC" | "EMAILED_IN" | "EMAILED_BY_HR";

export const ADDRESS_SOURCE_LABELS: Record<AddressSource, string> = {
  REQUESTER: "Requester",
  CC: "CC'd",
  EMAILED_IN: "Emailed HR",
  EMAILED_BY_HR: "Emailed by HR",
};
