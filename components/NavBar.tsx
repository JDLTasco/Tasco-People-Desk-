import Link from "next/link";
import { getSession } from "@/lib/session";
import SignOutButton from "./SignOutButton";

// §13's view list, the four this stage builds. Archive search/Admin
// (also listed in §13) depend on Stage 6 and aren't linked yet.
export default async function NavBar() {
  const session = await getSession();
  if (!session?.user) return null;

  return (
    <nav
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "center",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid #ccc",
        flexWrap: "wrap",
      }}
    >
      <strong>Tasco People Desk</strong>
      <Link href="/pool">Pool</Link>
      <Link href="/my-tickets">My tickets</Link>
      <Link href="/all-open">All open</Link>
      <Link href="/overdue">Overdue</Link>
      <span style={{ marginLeft: "auto" }}>
        {session.user.name} ({session.user.role})
      </span>
      <SignOutButton />
    </nav>
  );
}
