// §7.4: "All outbound mail sends ... with In-Reply-To and References
// headers set to the original ingestion message" -- one shared lookup for
// every send site (allocation, outcome, SLA escalation) rather than three
// copies of the same query.
import { prisma } from "../prisma";
import type { ThreadingContext } from "./send";

export async function threadingForTicket(ticketId: string): Promise<ThreadingContext | undefined> {
  const original = await prisma.ticketMessage.findFirst({
    where: { ticketId, messageType: "ORIGINAL" },
    orderBy: { receivedAt: "asc" },
  });
  if (!original?.internetMessageId) return undefined;
  return {
    inReplyToInternetMessageId: original.internetMessageId,
    referencesInternetMessageIds: [original.internetMessageId],
  };
}
