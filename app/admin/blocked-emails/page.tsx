import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import { formatAuDateTime } from "@/lib/format-date";
import { RULE_TYPE_LABELS } from "../block-list/rule-labels";
import { RuleToggleButton } from "../block-list/block-list-panel";

const MAX_ROWS = 500;

// Blocked emails (§5 suppression_log, screen built John, 2026-10-05) --
// ADMIN only. Read-only log of what the Block list stopped, newest first,
// with the rule's switch on each row so a wrongly-caught email can be let
// through from here.
export default async function BlockedEmailsPage({ searchParams }: { searchParams: { rule?: string } }) {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can view blocked emails.</p>
      </main>
    );
  }

  const ruleFilter = /^[0-9a-f-]{36}$/i.test(searchParams.rule ?? "") ? searchParams.rule : undefined;
  const rows = await prisma.suppressionLog.findMany({
    where: ruleFilter ? { ruleId: ruleFilter } : undefined,
    orderBy: { receivedAt: "desc" },
    take: MAX_ROWS,
    include: { rule: true },
  });

  return (
    <main>
      <h1>Admin -- Blocked emails</h1>
      <p>
        Emails the <Link href="/admin/block-list">Block list</Link> stopped from becoming tickets, newest first. Each
        one is still in the hrtickets@ mailbox. If something here should have been a ticket, switch its rule off --
        it will come in on the next import (or create it with + New ticket).
      </p>
      {ruleFilter && (
        <p>
          Showing one rule only. <Link href="/admin/blocked-emails">Show all</Link>
        </p>
      )}
      {rows.length === 0 && <p>Nothing has been blocked.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>From</th>
              <th>Subject</th>
              <th>Blocked by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatAuDateTime(row.receivedAt)}</td>
                <td style={{ wordBreak: "break-word" }}>{row.fromAddress}</td>
                <td>{row.subject || "(no subject)"}</td>
                <td>
                  {RULE_TYPE_LABELS[row.rule.type] ?? row.rule.type}: {row.rule.value}
                  {!row.rule.isActive && (
                    <>
                      <br />
                      <small>(rule now switched off)</small>
                    </>
                  )}
                </td>
                <td>
                  <RuleToggleButton id={row.rule.id} isActive={row.rule.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length === MAX_ROWS && <p>Showing the latest {MAX_ROWS}.</p>}
    </main>
  );
}
