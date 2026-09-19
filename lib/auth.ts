import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { deriveRole, roleGroupMappingFromEnv, type UserRole } from "./roles";

// §16 build order, Stages 1-3 note: "proceed... using seeded data and a
// mocked auth provider." The mock provider below is never registered in a
// production build, regardless of any stray env var -- see NODE_ENV check.
const isProduction = process.env.NODE_ENV === "production";

const azureAdConfigured = Boolean(
  process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID,
);

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // §6: 8-hour expiry
const SESSION_UPDATE_AGE_SECONDS = 15 * 60; // recompute the cookie's expiry this often -> the "sliding" half of §6

const providers: NextAuthOptions["providers"] = [];

if (azureAdConfigured) {
  const sharedConfig = {
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    tenantId: process.env.AZURE_AD_TENANT_ID!,
  };

  // Everyday sign-in. Entra may satisfy this silently via an existing
  // browser SSO session -- it is NOT proof of a just-now credential entry,
  // so it must never set stepUpAt (see the jwt callback below).
  providers.push(
    AzureADProvider({
      ...sharedConfig,
      id: "azure-ad",
      name: "Microsoft (Tasco account)",
    }),
  );

  // Step-up sign-in (§6): a second, separately-registered provider whose
  // only difference is prompt=login, which forces Entra to re-challenge
  // for credentials even with a live SSO session. A distinct provider id
  // (rather than a dynamic per-call param) is what lets the jwt callback
  // reliably tell the two apart via account.provider.
  providers.push(
    AzureADProvider({
      ...sharedConfig,
      id: "azure-ad-step-up",
      name: "Microsoft (re-authenticate)",
      authorization: {
        params: { prompt: "login" },
      },
    }),
  );
}

if (!isProduction) {
  providers.push(
    CredentialsProvider({
      id: "dev-mock",
      name: "Dev sign-in (mock -- Stages 1-3 only, build spec §16)",
      credentials: {
        userId: { label: "User", type: "text" },
        simulateStepUp: { label: "Simulate step-up", type: "checkbox" },
      },
      async authorize(credentials) {
        if (!credentials?.userId) return null;
        const user = await prisma.user.findUnique({ where: { id: credentials.userId } });
        if (!user || !user.isActive) return null;
        return {
          id: user.id,
          name: user.displayName,
          email: user.upn,
          role: user.role as UserRole,
          entraObjectId: user.entraObjectId,
          initials: user.initials,
          mockStepUp: credentials.simulateStepUp === "true" || credentials.simulateStepUp === "on",
        };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  // §6: httpOnly, secure, sameSite=lax. Set explicitly rather than relying
  // on NextAuth's own defaults, which vary by version.
  cookies: {
    sessionToken: {
      name: isProduction ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "azure-ad" || account?.provider === "azure-ad-step-up") {
        // Real Entra sign-in: role comes from group membership, never from
        // anything client-supplied. "A user in no group is denied access
        // with a clear message, not a 500" (§3) -- redirect, don't throw.
        const groups = ((profile as { groups?: string[] } | undefined)?.groups) ?? [];
        const role = deriveRole(groups, roleGroupMappingFromEnv());
        if (!role) {
          return "/auth/no-access";
        }
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (user && account) {
        const u = user as typeof user & { entraObjectId: string; initials: string; mockStepUp?: boolean };

        if (account.provider === "azure-ad" || account.provider === "azure-ad-step-up") {
          // profile is its own callback parameter, not a property of
          // account -- NextAuth's Account type has no .profile field.
          // Real bug, not just a type-cast smell: account.profile was
          // always undefined, so groups was always [], deriveRole always
          // returned null, and this callback always silently no-opped
          // without ever setting token.role/userId/entraObjectId for a
          // real Azure AD sign-in. Never caught before because every
          // prior test used the dev-mock provider, which doesn't go
          // through this branch at all -- found via the first-ever real
          // Azure AD sign-in, 2026-09-19.
          const groups = ((profile as { groups?: string[] } | undefined)?.groups) ?? [];
          const role = deriveRole(groups, roleGroupMappingFromEnv());
          // signIn callback above already redirected away when role is
          // null -- this should be unreachable, but never fabricate a role.
          if (!role) return token;

          const dbUser = await prisma.user.upsert({
            where: { entraObjectId: u.entraObjectId },
            update: {
              upn: u.email ?? "",
              displayName: u.name ?? u.email ?? "",
              role,
            },
            create: {
              entraObjectId: u.entraObjectId,
              upn: u.email ?? "",
              displayName: u.name ?? u.email ?? "",
              initials: (u.name ?? "??").slice(0, 2).toUpperCase(),
              role,
            },
          });

          token.userId = dbUser.id;
          token.role = dbUser.role as UserRole;
          token.entraObjectId = dbUser.entraObjectId;
          token.initials = dbUser.initials;
          if (account.provider === "azure-ad-step-up") {
            token.stepUpAt = Date.now();
          }
        } else {
          // dev-mock provider: authorize() already resolved a real seeded user.
          token.userId = u.id;
          token.role = u.role;
          token.entraObjectId = u.entraObjectId;
          token.initials = u.initials;
          if (u.mockStepUp) {
            token.stepUpAt = Date.now();
          }
        }

        await prisma.user.update({
          where: { id: token.userId },
          data: { lastLoginAt: new Date() },
        });
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.entraObjectId = token.entraObjectId;
      session.user.initials = token.initials;
      session.stepUpAt = token.stepUpAt;
      return session;
    },
  },
};
