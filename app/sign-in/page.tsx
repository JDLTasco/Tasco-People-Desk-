import { prisma } from "@/lib/prisma";
import SignInForm from "./sign-in-form";

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
      callbackUrl={searchParams.callbackUrl ?? "/"}
    />
  );
}
