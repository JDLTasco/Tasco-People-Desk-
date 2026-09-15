import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { SYSTEM_ENTRA_OBJECT_ID } from "@/lib/ingestion/process-message";

// §3: "Manage users, roles, ..." -- ADMIN only. §13's Admin "users" screen.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const users = await prisma.user.findMany({
    where: { entraObjectId: { not: SYSTEM_ENTRA_OBJECT_ID } },
    orderBy: { displayName: "asc" },
  });
  return NextResponse.json({ users });
}

interface CreateUserBody {
  displayName: string;
  initials: string;
  upn: string;
  role: "ADMIN" | "HR_LEAD" | "HR_OFFICER";
  entraObjectId?: string;
}

// Real accounts are normally created automatically at first Entra sign-in
// (lib/auth.ts's jwt callback, keyed on the real entraObjectId) -- this
// manual path exists because §3's permission matrix explicitly lists
// "manage users" as an ADMIN capability, and because §14 isn't done yet
// (nothing signs in via real Entra to auto-create a row). If entraObjectId
// isn't supplied (the normal case until §14), a placeholder is generated
// so it can never collide with a real one -- if that person later signs
// in for real, their real Entra sign-in creates a SEPARATE row (matched
// by the real entraObjectId, which won't match this placeholder), and an
// admin needs to reconcile/deactivate the placeholder manually. Known,
// documented limitation, not hidden.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as Partial<CreateUserBody> | null;
  if (!body?.displayName || !body.initials || !body.upn || !body.role) {
    return badRequest("displayName, initials, upn, and role are all required");
  }

  const entraObjectId = body.entraObjectId?.trim() || `manual-${crypto.randomUUID()}`;

  const user = await prisma.user.create({
    data: {
      entraObjectId,
      upn: body.upn,
      displayName: body.displayName,
      initials: body.initials,
      role: body.role,
    },
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "USER_CREATED",
    entity: "user",
    entityId: user.id,
    afterJson: { displayName: user.displayName, upn: user.upn, role: user.role },
  });

  return NextResponse.json({ user }, { status: 201 });
}
