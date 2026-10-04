import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { normaliseSuppressionValue, type SuppressionRule } from "@/lib/ingestion/suppression";

const TYPES: SuppressionRule["type"][] = ["SENDER", "DOMAIN", "SUBJECT_PATTERN"];

// Block list (§7.0.1 "Application suppression list -- maintained by ADMIN";
// screen built John, 2026-10-05). ADMIN-only create. Adding a rule that
// already exists (same type + value) turns it back on instead of making a
// duplicate. Rules are switched off, never deleted, so the Blocked emails
// log always has the rule it points at.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as { type?: string; value?: string } | null;
  const type = body?.type as SuppressionRule["type"] | undefined;
  if (!type || !TYPES.includes(type)) return badRequest("type must be SENDER, DOMAIN or SUBJECT_PATTERN");
  const normalised = normaliseSuppressionValue(type, body?.value ?? "");
  if ("error" in normalised) return badRequest(normalised.error);

  const existing = await prisma.suppressionRule.findFirst({ where: { type, value: normalised.value } });
  if (existing) {
    if (!existing.isActive) {
      const rule = await prisma.suppressionRule.update({ where: { id: existing.id }, data: { isActive: true } });
      await writeAuditLog({
        correlationId,
        actorId: session.user.id,
        action: "SUPPRESSION_RULE_ACTIVATION_CHANGED",
        entity: "suppression_rule",
        entityId: rule.id,
        beforeJson: { isActive: false },
        afterJson: { isActive: true, type: rule.type, value: rule.value },
      });
      return NextResponse.json({ rule, reactivated: true });
    }
    return NextResponse.json({ rule: existing, alreadyActive: true });
  }

  const rule = await prisma.suppressionRule.create({
    data: { type, value: normalised.value, createdById: session.user.id },
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "SUPPRESSION_RULE_CREATED",
    entity: "suppression_rule",
    entityId: rule.id,
    afterJson: { type: rule.type, value: rule.value },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
