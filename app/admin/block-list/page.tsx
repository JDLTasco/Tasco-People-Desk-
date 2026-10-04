import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import { formatAuDateTime } from "@/lib/format-date";
import BlockListPanel from "./block-list-panel";

// Block list (§7.0.1's application suppression list, screen built John,
// 2026-10-05) -- ADMIN only. Same list + add form shape as Action items.
export default async function BlockListPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage the block list.</p>
      </main>
    );
  }

  const [rules, counts] = await Promise.all([
    prisma.suppressionRule.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { displayName: true } } },
    }),
    prisma.suppressionLog.groupBy({ by: ["ruleId"], _count: { _all: true } }),
  ]);
  const blockedByRule = new Map(counts.map((c) => [c.ruleId, c._count._all]));

  return (
    <main>
      <h1>Admin -- Block list</h1>
      <p>
        Incoming emails that match an active rule don&apos;t become tickets -- this includes replies to existing
        tickets. Nothing is lost: each one is listed under Admin &rarr; Blocked emails and stays in the hrtickets@
        mailbox. Switch a rule off and anything it blocked comes in on the next import.
      </p>
      <ul>
        <li>
          <strong>Sender</strong> -- one exact email address (safest).
        </li>
        <li>
          <strong>Domain</strong> -- everything from that domain, e.g. a newsletter publisher. Use with care.
        </li>
        <li>
          <strong>Subject contains</strong> -- any email whose subject contains the words, anywhere, any case.
        </li>
      </ul>
      <BlockListPanel
        rules={rules.map((r) => ({
          id: r.id,
          type: r.type,
          value: r.value,
          isActive: r.isActive,
          addedBy: r.createdBy?.displayName ?? "System",
          addedAt: formatAuDateTime(r.createdAt),
          blocked: blockedByRule.get(r.id) ?? 0,
        }))}
      />
    </main>
  );
}
