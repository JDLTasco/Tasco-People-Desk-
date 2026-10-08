import { prisma } from "@/lib/prisma";
import SignInForm from "./sign-in-form";

// Where to go after signing in (John, 2026-10-08): always the Dashboard,
// except a link to one particular ticket (e.g. from an email), which still
// opens that ticket. Before this, signing in from any page -- such as a
// browser tab reopened on My tickets -- went back to that page.
function afterSignIn(callbackUrl: string | undefined): string {
  if (callbackUrl && /^\/tickets\/[0-9a-f-]{36}$/i.test(callbackUrl)) return callbackUrl;
  return "/";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; callbackUrl?: string };
}) {
  const azureAdConfigured = Boolean(process.env.AZURE_AD_CLIENT_ID);
  const isProduction = process.env.NODE_ENV === "production";

  // Dev-mock sign-in list only ever queried outside production -- see
  // lib/auth.ts's own isProduction gate on registering the provider at all.
  const mockUsers = isProduction
    ? []
    : await prisma.user.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true, role: true },
      });

  return (
    <SignInForm
      azureAdConfigured={azureAdConfigured}
      mockUsers={mockUsers}
      error={searchParams.error}
      callbackUrl={afterSignIn(searchParams.callbackUrl)}
    />
  );
}
