import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";

// Placeholder landing page -- Stage 3 ("Core UI and state machine", §16)
// replaces this with the real Pool/My tickets/etc. views (§13). This exists
// only to prove Stage 2's auth pipeline end-to-end: middleware already
// guarantees a session exists by the time this renders.
export default async function Home() {
  const session = await getSession();

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Tasco People Desk</h1>
      <p>
        Signed in as <strong>{session?.user.name}</strong> ({session?.user.role})
      </p>
      <SignOutButton />
    </main>
  );
}
