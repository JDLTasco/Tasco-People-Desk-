"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

interface MockUser {
  id: string;
  displayName: string;
  role: string;
}

export default function SignInForm({
  azureAdConfigured,
  mockUsers,
  error,
  callbackUrl,
}: {
  azureAdConfigured: boolean;
  mockUsers: MockUser[];
  error?: string;
  callbackUrl: string;
}) {
  const [selectedUserId, setSelectedUserId] = useState(mockUsers[0]?.id ?? "");
  const [simulateStepUp, setSimulateStepUp] = useState(false);

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Tasco People Desk</h1>

      {error && (
        <p role="alert" style={{ color: "#b00020" }}>
          {error === "AccessDenied"
            ? "Your account isn't a member of any HR Ticketing security group. Contact IT if you believe this is an error."
            : `Sign-in failed: ${error}`}
        </p>
      )}

      {azureAdConfigured && (
        <button type="button" onClick={() => signIn("azure-ad", { callbackUrl })}>
          Sign in with Microsoft
        </button>
      )}

      {mockUsers.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn("dev-mock", {
              userId: selectedUserId,
              simulateStepUp: simulateStepUp ? "true" : "false",
              callbackUrl,
            });
          }}
          style={{ marginTop: "2rem", borderTop: "1px solid #ccc", paddingTop: "1rem" }}
        >
          <p>
            <strong>Dev sign-in</strong> -- mock provider, Stages 1-3 only (build spec §16). Never available in a
            production build.
          </p>
          <label htmlFor="mock-user">Sign in as</label>
          <br />
          <select
            id="mock-user"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            {mockUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.role})
              </option>
            ))}
          </select>
          <br />
          <label style={{ display: "block", marginTop: "0.5rem" }}>
            <input
              type="checkbox"
              checked={simulateStepUp}
              onChange={(e) => setSimulateStepUp(e.target.checked)}
            />{" "}
            Simulate step-up re-authentication (§6)
          </label>
          <button type="submit" style={{ marginTop: "1rem" }}>
            Sign in
          </button>
        </form>
      )}
    </main>
  );
}
