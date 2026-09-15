import { PrismaClient } from "@prisma/client";

// The app connects as app_role (least-privilege -- notably no UPDATE/DELETE
// on audit_log, enforced at the database by prisma/migrations/*_audit_log_grants),
// never as the migration role DATABASE_URL points at. See .env.example.
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
if (!APP_DATABASE_URL) {
  throw new Error(
    "APP_DATABASE_URL is not set. The app must not fall back to DATABASE_URL " +
      "(the migration role) -- see .env.example.",
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: APP_DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
