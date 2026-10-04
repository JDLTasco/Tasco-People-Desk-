// Ignored images (John, 2026-10-05): email signature / footer images such as
// the Tasco logos arrive on almost every email, often over §7.3.1's 10KB
// inline-skip limit or not flagged inline at all. Ingestion skips any image
// whose exact contents (SHA-256) are on Admin -> Ignored images. An exact
// hash match can't catch a pasted screenshot by accident.
import { prisma } from "../prisma";

export const IGNORED_IMAGE_REMOVE_REASON = "Ignored image (email signature / logo)";

export function isIgnoredImage(contentType: string | null | undefined, sha256: string, ignored: ReadonlySet<string>): boolean {
  return Boolean(contentType?.toLowerCase().startsWith("image/")) && ignored.has(sha256);
}

export async function loadIgnoredImageHashes(): Promise<Set<string>> {
  const rows = await prisma.ignoredImage.findMany({ where: { isActive: true }, select: { sha256: true } });
  return new Set(rows.map((r) => r.sha256));
}
