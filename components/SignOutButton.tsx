"use client";

import { signOut } from "next-auth/react";

// §6: "Sign-out clears the session and redirects to the Entra logout
// endpoint." NextAuth's own signOut() only clears the local session/cookie
// -- the redirect to Entra's own end_session_endpoint has to be done here
// explicitly. Tenant ID isn't secret (every OAuth redirect already exposes
// it), so NEXT_PUBLIC_AZURE_AD_TENANT_ID is a deliberate, safe mirror of
// the server-only AZURE_AD_TENANT_ID -- see .env.example.
export default function SignOutButton() {
  async function handleSignOut() {
    await signOut({ redirect: false });
    const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
    if (tenantId) {
      const postLogoutRedirectUri = encodeURIComponent(`${window.location.origin}/sign-in`);
      window.location.href = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutRedirectUri}`;
    } else {
      // No real Entra tenant configured yet (§14 not done) / a mock-provider
      // session -- there is no Entra session to log out of.
      window.location.href = "/sign-in";
    }
  }

  return (
    <button type="button" onClick={() => void handleSignOut()}>
      Sign out
    </button>
  );
}
