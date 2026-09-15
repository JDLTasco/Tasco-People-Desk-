"use client";

import { SessionProvider } from "next-auth/react";

// Required by next-auth/react's client hooks (signIn/signOut/useSession) --
// wraps the whole app once, here in the root layout.
export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
