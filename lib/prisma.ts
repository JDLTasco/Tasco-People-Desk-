import { PrismaClient } from "@prisma/client";

// The app connects as app_role (least-privilege -- notably no UPDATE/DELETE
// on audit_log, enforced at the database by prisma/migrations/*_audit_log_grants),
// never as the migration role DATABASE_URL points at. See .env.example.
//
// The client is created on first use, not at import: `next build` and the
// unit tests import modules that import this file without ever querying,
// and the GitHub Actions build/test run (Stage 8) deliberately has no
// database settings. The missing-URL check still fires -- with the same
// clear error, and still never falling back to DATABASE_URL -- the moment
// anything actually touches the database.
function createClient(): PrismaClient {
  const url = process.env.APP_DATABASE_URL;
  if (!url) {
    throw new Error(
      "APP_DATABASE_URL is not set. The app must not fall back to DATABASE_URL " +
        "(the migration role) -- see .env.example.",
    );
  }
  return new PrismaClient({ datasourceUrl: url });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Cached on globalThis in production too: one client per process,
    // created lazily, rather than one per import.
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
