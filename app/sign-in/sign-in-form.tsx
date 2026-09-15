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
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Tasco People Desk</h1>
          <p>HR ticketing -- Tasco Petroleum</p>
        </div>
        <div className="auth-card-body">
          {error && (
            <p role="alert" className="banner banner-error">
              {error === "AccessDenied"
                ? "Your account isn't a member of any HR Ticketing security group. Contact IT if you believe this is an error."
                : `Sign-in failed: ${error}`}
            </p>
          )}

          {azureAdConfigured && (
            <button type="button" onClick={() => signIn("azure-ad", { callbackUrl })} style={{ width: "100%" }}>
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
              style={{ marginTop: azureAdConfigured ? "1.5rem" : 0, borderTop: azureAdConfigured ? "1px solid var(--border)" : "none", paddingTop: azureAdConfigured ? "1rem" : 0 }}
            >
              <p style={{ fontSize: "0.85rem", color: "#666" }}>
                <strong>Dev sign-in</strong> -- mock provider, Stages 1-3 only (build spec §16). Never available in a
                production build.
              </p>
              <label htmlFor="mock-user">Sign in as</label>
              <br />
              <select
                id="mock-user"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem" }}
              >
                {mockUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.role})
                  </option>
                ))}
              </select>
              <br />
              <label style={{ display: "block", marginTop: "0.6rem" }}>
                <input
                  type="checkbox"
                  checked={simulateStepUp}
                  onChange={(e) => setSimulateStepUp(e.target.checked)}
                  style={{ width: "auto", marginRight: "0.4rem" }}
                />
                Simulate step-up re-authentication (§6)
              </label>
              <button type="submit" style={{ marginTop: "1rem", width: "100%" }}>
                Sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
