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
}

// §3: ADMIN only. Role changes are one of §6's seven step-up-gated
// destructive actions ("user role change"); archiving/restoring (isActive)
// is not in that list, so it isn't gated the same way -- same convention
// as categories/business units, deactivated rather than deleted.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || target.entraObjectId === SYSTEM_ENTRA_OBJECT_ID) return notFound();

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || (body.role === undefined && body.isActive === undefined)) {
    return badRequest("role and/or isActive is required");
  }

  if (body.role !== undefined && body.role !== target.role) {
    if (!hasFreshStepUp(session)) {
      return forbidden("Step-up re-authentication required for a user role change");
    }
  }

  const roleChanged = body.role !== undefined && body.role !== target.role;
  const activeChanged = body.isActive !== undefined && body.isActive !== target.isActive;

  if (!roleChanged && !activeChanged) {
    return NextResponse.json({ user: target });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: body.role, isActive: body.isActive },
  });

  // One audit_log row per semantically distinct change, same convention as
  // ticket metadata updates -- a combined PATCH shouldn't blur two
  // different actions (role change is step-up-gated; activation isn't)
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

  return NextResponse.json({ user: updated });
}
