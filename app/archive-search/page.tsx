import { getSession } from "@/lib/session";
import { canBulkExport } from "@/lib/rbac";
import ArchiveSearchClient from "./archive-search-client";

// §11 "Archive search": full-text over archived tickets, available to
// every role (confidentiality-scoped the same as every other list/search
// view -- see lib/tickets/queries.ts's searchArchive()). Bulk export
// (ADMIN/HR_LEAD only) lives on the same page since both are date-range-
// driven exports over the same underlying ticket set.
export default async function ArchiveSearchPage() {
  const session = await getSession();
  if (!session?.user) return null;

  return (
    <main>
      <h1>Archive search</h1>
      <ArchiveSearchClient canBulkExport={canBulkExport(session.user.role)} />
    </main>
  );
}
