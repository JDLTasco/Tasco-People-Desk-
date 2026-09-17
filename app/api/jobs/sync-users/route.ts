import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { writeAuditLog } from "@/lib/audit";
import { getGraphClient, isGraphConfigured } from "@/lib/graph/client";
import { roleGroupMappingFromEnv } from "@/lib/roles";
import { computeDesiredUsers, deriveInitials } from "@/lib/jobs/sync-users-core";
import { SYSTEM_ENTRA_OBJECT_ID, getSystemUserId } from "@/lib/ingestion/process-message";

// §12 `sync-users`, daily 03:00: keeps `users.role`/`is_active` in sync with
// the three Entra security groups (§3) -- "adding a user is adding them to
// a security group" (ADR-0002) only holds if something actually reads
// group membership back into this table. **Completely unexercised** until
// §14 item 4 creates the real groups, same posture as Graph ingestion --
// guarded the same way (isGraphConfigured()) rather than guessed at.
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("sync-users", async (correlationId) => {
    const mapping = roleGroupMappingFromEnv();
    if (!isGraphConfigured() || !mapping.adminsGroupId || !mapping.leadsGroupId || !mapping.usersGroupId) {
      console.error("sync-users: Graph or role-group env vars not configured (§14 not done) -- skipped", { correlationId });
      return { processed: 0, created: 0, updated: 0, deactivated: 0, skipped: true };
    }

    const client = getGraphClient();
    const [admins, leads, users] = await Promise.all([
      client.listGroupMembers(mapping.adminsGroupId),
      client.listGroupMembers(mapping.leadsGroupId),
      client.listGroupMembers(mapping.usersGroupId),
    ]);
    const desired = computeDesiredUsers({ admins, leads, users }, mapping);
    const desiredIds = new Set(desired.map((d) => d.entraObjectId));

    const systemUserId = await getSystemUserId();
    let created = 0;
    let updated = 0;
    let deactivated = 0;

    for (const d of desired) {
      const existing = await prisma.user.findUnique({ where: { entraObjectId: d.entraObjectId } });
      if (!existing) {
        const user = await prisma.user.create({
          data: {
            entraObjectId: d.entraObjectId,
            upn: d.upn,
            displayName: d.displayName,
            initials: deriveInitials(d.displayName),
            role: d.role,
          },
        });
        await writeAuditLog({
          correlationId,
          actorId: systemUserId,
          action: "USER_CREATED",
          entity: "user",
          entityId: user.id,
          afterJson: { entraObjectId: d.entraObjectId, upn: d.upn, displayName: d.displayName, role: d.role },
        });
        created++;
        continue;
      }

      const roleChanged = existing.role !== d.role;
      const reactivated = !existing.isActive;
      const displayNameChanged = existing.displayName !== d.displayName && d.displayName.length > 0;
      if (!roleChanged && !reactivated && !displayNameChanged) continue;

      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: d.role,
          isActive: true,
          upn: d.upn || existing.upn,
          displayName: displayNameChanged ? d.displayName : existing.displayName,
        },
      });
      if (roleChanged) {
        await writeAuditLog({
          correlationId,
          actorId: systemUserId,
          action: "USER_ROLE_CHANGED",
          entity: "user",
          entityId: existing.id,
          beforeJson: { role: existing.role },
          afterJson: { role: d.role },
        });
      }
      if (reactivated) {
        await writeAuditLog({
          correlationId,
          actorId: systemUserId,
          action: "USER_ACTIVATION_CHANGED",
          entity: "user",
          entityId: existing.id,
          beforeJson: { isActive: false },
          afterJson: { isActive: true },
        });
      }
      if (displayNameChanged) {
        await writeAuditLog({
          correlationId,
          actorId: systemUserId,
          action: "USER_DISPLAY_NAME_CHANGED",
          entity: "user",
          entityId: existing.id,
          beforeJson: { displayName: existing.displayName },
          afterJson: { displayName: d.displayName },
        });
      }
      updated++;
    }

    // De-provisioning: an active user no longer in any of the three groups
    // loses portal access -- "a disabled Entra account cannot sign in" is
    // one direction of this; a *removed* group membership is the other,
    // and nothing else in the app currently notices that on its own.
    const toDeactivate = await prisma.user.findMany({
      where: { isActive: true, entraObjectId: { not: SYSTEM_ENTRA_OBJECT_ID } },
    });
    for (const u of toDeactivate) {
      if (desiredIds.has(u.entraObjectId)) continue;
      await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      await writeAuditLog({
        correlationId,
        actorId: systemUserId,
        action: "USER_ACTIVATION_CHANGED",
        entity: "user",
        entityId: u.id,
        beforeJson: { isActive: true },
        afterJson: { isActive: false },
        reason: "No longer a member of any HR-Ticketing- role group",
      });
      deactivated++;
    }

    return { processed: desired.length, created, updated, deactivated };
  });

  return NextResponse.json(outcome);
}
