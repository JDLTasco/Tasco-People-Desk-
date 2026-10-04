import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import { formatAuDateTime } from "@/lib/format-date";
import { IGNORED_IMAGE_REMOVE_REASON } from "@/lib/ingestion/ignored-images";
import { findRepeatedImages, REPEATED_IMAGE_MIN_TICKETS } from "@/lib/attachments/repeated-images";
import { IgnoreImageForm, IgnoredImageToggle } from "./ignored-images-panel";

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Ignored images (John, 2026-10-05) -- ADMIN only. Suggestions (images
// repeated across tickets) + the ignore list itself.
export default async function IgnoredImagesPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage ignored images.</p>
      </main>
    );
  }

  const [images, tidied, repeated] = await Promise.all([
    prisma.ignoredImage.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    prisma.ticketAttachment.groupBy({
      by: ["sha256"],
      where: { removedAt: { not: null }, removeReason: IGNORED_IMAGE_REMOVE_REASON },
      _count: { _all: true },
    }),
    findRepeatedImages(),
  ]);
  const tidiedBySha = new Map(tidied.map((t) => [t.sha256, t._count._all]));

  return (
    <main>
      <h1>Admin -- Ignored images</h1>
      <p>
        Email signature and footer images (the Tasco logos and the like) that are skipped when emails come in, so they
        don&apos;t clutter tickets. Only an image with exactly the same contents is skipped -- a screenshot someone
        pastes into an email still comes through.
      </p>
      <p>
        Ignoring an image also takes the copies already on tickets off them (recorded, reversible -- not on tickets
        under legal hold or already archived). Switching it off puts those copies back.
      </p>

      <section className="section-card">
        <h2>Images repeated across tickets</h2>
        <p>
          The same image on {REPEATED_IMAGE_MIN_TICKETS} or more different tickets -- almost always a signature or logo.
          Open the example ticket to check before ignoring it.
        </p>
        {repeated.length === 0 ? (
          <p>None at the moment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File names seen</th>
                <th>Tickets</th>
                <th>Size</th>
                <th>Example</th>
                <th>Ignore as</th>
              </tr>
            </thead>
            <tbody>
              {repeated.map((r) => (
                <tr key={r.sha256}>
                  <td style={{ wordBreak: "break-word" }}>{r.names.join(", ")}</td>
                  <td>{r.tickets}</td>
                  <td>{kb(r.bytes)}</td>
                  <td>
                    <Link href={`/tickets/${r.exampleTicketId}`}>{r.exampleTicketNo}</Link>
                  </td>
                  <td>
                    <IgnoreImageForm sha256={r.sha256} defaultLabel={r.names[0] ?? ""} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <h2>Ignore list</h2>
      {images.length === 0 ? (
        <p>Nothing ignored yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Example file</th>
              <th>Copies taken off tickets</th>
              <th>Added</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {images.map((i) => (
              <tr key={i.id}>
                <td>{i.label}</td>
                <td style={{ wordBreak: "break-word" }}>{i.exampleFilename ?? "--"}</td>
                <td>{tidiedBySha.get(i.sha256) ?? 0}</td>
                <td>{formatAuDateTime(i.createdAt)}</td>
                <td>
                  <span className={i.isActive ? "chip chip-status-ALLOCATED" : "chip chip-status-CLOSED"}>
                    {i.isActive ? "Ignored" : "Switched off"}
                  </span>
                </td>
                <td>
                  <IgnoredImageToggle id={i.id} isActive={i.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
