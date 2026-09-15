import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { getGraphClient, isGraphConfigured } from "@/lib/graph/client";

// §7.1: "Mail subscriptions expire at roughly 4230 minutes. The renewal
// job runs every 12 hours and recreates the subscription if renewal
// fails." Runs against a Graph client that is inert until §14 items 1-3
// exist -- see getGraphClient()'s own doc comment.
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("graph-subscription-renew", async () => {
    if (!isGraphConfigured()) {
      throw new Error("Graph is not configured (§14 items 1-3 not done yet)");
    }
    const client = getGraphClient();
    const existing = await prisma.graphSubscription.findFirst({ orderBy: { createdAt: "desc" } });

    if (existing) {
      try {
        const { expiresAt } = await client.renewSubscription(existing.subscriptionId);
        await prisma.graphSubscription.update({ where: { id: existing.id }, data: { expiresAt } });
        return { action: "RENEWED", subscriptionId: existing.subscriptionId };
      } catch {
        // "recreates the subscription if renewal fails"
      }
    }

    const clientState = process.env.GRAPH_WEBHOOK_CLIENT_STATE;
    if (!clientState) throw new Error("GRAPH_WEBHOOK_CLIENT_STATE is not set");
    const notificationUrl = `${process.env.NEXTAUTH_URL}/api/graph/notifications`;
    const created = await client.createSubscription(notificationUrl, clientState);
    await prisma.graphSubscription.create({
      data: {
        subscriptionId: created.subscriptionId,
        resource: "inbox/messages",
        expiresAt: created.expiresAt,
        clientState,
      },
    });
    return { action: "CREATED", subscriptionId: created.subscriptionId };
  });

  return NextResponse.json(outcome);
}
