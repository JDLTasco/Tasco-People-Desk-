// §3: "A user in no group is denied access with a clear message, not a
// 500." This is that message -- reached when lib/auth.ts's signIn
// callback finds no matching HR-Ticketing-* group membership.
export default function NoAccessPage() {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>No access</h1>
      <p>
        Your account isn&apos;t a member of any HR Ticketing security group (<code>HR-Ticketing-Admins</code>,{" "}
        <code>HR-Ticketing-Leads</code>, or <code>HR-Ticketing-Users</code>). Tasco People Desk can&apos;t sign you
        in.
      </p>
      <p>If you believe this is an error, contact IT to check your group membership.</p>
    </main>
  );
}
