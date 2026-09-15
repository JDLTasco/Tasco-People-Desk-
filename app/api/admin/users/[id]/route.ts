import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden, notFound } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { hasFreshStepUp } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { SYSTEM_ENTRA_OBJECT_ID } from "@/lib/ingestion/process-message";

interface PatchBody {
  role?: "ADMIN" | "HR_LEAD" | "HR_OFFICER";
  isActive?: boolean;
  displayName?: string;
}

// §3: ADMIN only. Role changes are one of §6's seven step-up-gated
// destructive actions ("user role change"); archiving/restoring (isActive)
// is not in that list, so it isn't gated the same way -- same convention
// as categories/business units, deactivated rather than deleted.
// displayName (operator addition, not in v1.3 spec -- see STATUS.md) is
// even less sensitive than activation, so it isn't step-up gated either;
// this is how an admin gives a real Entra name to the dev-mock users
// (seeded with initials-only display names on purpose) without Claude
// inventing names on their behalf.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || target.entraObjectId === SYSTEM_ENTRA_OBJECT_ID) return notFound();

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || (body.role === undefined && body.isActive === undefined && body.displayName === undefined)) {
    return badRequest("role, isActive, and/or displayName is required");
  }
  if (body.displayName !== undefined && !body.displayName.trim()) {
    return badRequest("displayName cannot be blank");
  }

  if (body.role !== undefined && body.role !== target.role) {
    if (!hasFreshStepUp(session)) {
      return forbidden("Step-up re-authentication required for a user role change");
    }
  }

  const roleChanged = body.role !== undefined && body.role !== target.role;
  const activeChanged = body.isActive !== undefined && body.isActive !== target.isActive;
  const displayNameChanged = body.displayName !== undefined && body.displayName.trim() !== target.displayName;

  if (!roleChanged && !activeChanged && !displayNameChanged) {
    return NextResponse.json({ user: target });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      role: body.role,
      isActive: body.isActive,
      displayName: displayNameChanged ? body.displayName!.trim() : undefined,
    },
  });

  // One audit_log row per semantically distinct change, same convention as
  // ticket metadata updates -- a combined PATCH shouldn't blur different
  // actions (role change is step-up-gated; activation and name are not)
  // into one ambiguous log entry.
  if (roleChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "USER_ROLE_CHANGED",
      entity: "user",
      entityId: target.id,
      beforeJson: { role: target.role },
      afterJson: { role: body.role },
    });
  }
  if (activeChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "USER_ACTIVATION_CHANGED",
      entity: "user",
      entityId: target.id,
      beforeJson: { isActive: target.isActive },
      afterJson: { isActive: body.isActive },
    });
  }
  if (displayNameChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "USER_DISPLAY_NAME_CHANGED",
      entity: "user",
      entityId: target.id,
      beforeJson: { displayName: target.displayName },
      afterJson: { displayName: updated.displayName },
    });
  }

  return NextResponse.json({ user: updated });
}
