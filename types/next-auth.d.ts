import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/roles";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      entraObjectId: string;
      initials: string;
    } & DefaultSession["user"];
    /** Epoch ms of the last fresh (prompt=login) re-authentication, if any this session. See lib/step-up.ts. */
    stepUpAt?: number;
  }

  interface User {
    id: string;
    role: UserRole;
    entraObjectId: string;
    initials: string;
    /** Only ever set by the dev-mock provider's "simulate step-up" checkbox (Stages 1-3, §16). */
    mockStepUp?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: UserRole;
    entraObjectId: string;
    initials: string;
    stepUpAt?: number;
  }
}
