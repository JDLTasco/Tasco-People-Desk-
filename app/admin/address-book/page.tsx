import { getSession } from "@/lib/session";
import { canViewAuditLog } from "@/lib/rbac";
import { loadAddressBook } from "@/lib/address-book";
import AddressBookTable from "./address-book-table";

// Admin -> Address book (John, 2026-10-03): every address the People Desk
// knows, where it came from and when HR last emailed it -- the same list the
// To/CC boxes suggest from. ADMIN / HR_LEAD, same as the audit log. Read-only:
// it's derived from tickets and correspondence, nothing to edit.
export default async function AddressBookPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canViewAuditLog(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only HR Leads and Admins can view the address book.</p>
      </main>
    );
  }

  const entries = await loadAddressBook(session.user.id, session.user.role);

  return (
    <main>
      <h1>Admin -- Address book</h1>
      <p>
        Every email address the People Desk has seen: requesters, people CC&apos;d, anyone who emailed HR, and anyone HR
        emailed. These are the addresses suggested when you type in a To or CC box. It is built from the tickets
        themselves, so it is always up to date. Every email HR sends is also recorded, with its To and CC, in the{" "}
        <a href="/admin/audit-log">Audit log</a> and on the ticket itself.
      </p>
      <AddressBookTable
        entries={entries.map((e) => ({
          ...e,
          firstSeen: e.firstSeen?.toISOString() ?? null,
          lastSeen: e.lastSeen?.toISOString() ?? null,
          lastEmailedByHrAt: e.lastEmailedByHrAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
