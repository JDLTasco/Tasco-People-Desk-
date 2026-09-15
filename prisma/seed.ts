// Seeds the two administrator-maintained lookup tables (build spec §5).
// Categories/business units are never deleted, only deactivated -- this
// seed is safe to re-run (upsert by unique name).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  "Recruitment",
  "Payroll",
  "Leave",
  "Workers Compensation",
  "Return to Work",
  "Employee Relations",
  "Performance",
  "Training",
  "Compliance",
  "Other",
];

const BUSINESS_UNITS = ["Head Office", "Retail", "Transport", "Depots", "Other"];

// Mock users for the dev-mock auth provider (build spec §16: Stages 1-3
// "proceed... using seeded data and a mocked auth provider" -- §14's real
// Entra security groups don't exist yet). Only the initials and roles §3
// actually specifies are used here -- no full names are invented. Real
// accounts get created automatically from real Entra claims once §14
// lands (see lib/auth.ts's jwt callback); these rows exist for local/dev
// sign-in only, entraObjectId deliberately prefixed "mock-" so a real
// Entra object ID can never collide with one.
const MOCK_USERS = [
  { initials: "RJ", role: "HR_LEAD" as const },
  { initials: "LF", role: "HR_OFFICER" as const },
  { initials: "DN", role: "HR_OFFICER" as const },
  { initials: "JDL", role: "ADMIN" as const },
  { initials: "RGL", role: "ADMIN" as const },
];

async function main() {
  for (let index = 0; index < CATEGORIES.length; index++) {
    await prisma.category.upsert({
      where: { name: CATEGORIES[index] },
      update: {},
      create: { name: CATEGORIES[index], sortOrder: index },
    });
  }

  for (let index = 0; index < BUSINESS_UNITS.length; index++) {
    await prisma.businessUnit.upsert({
      where: { name: BUSINESS_UNITS[index] },
      update: {},
      create: { name: BUSINESS_UNITS[index], sortOrder: index },
    });
  }

  for (const mockUser of MOCK_USERS) {
    const entraObjectId = `mock-${mockUser.initials.toLowerCase()}`;
    await prisma.user.upsert({
      where: { entraObjectId },
      update: {},
      create: {
        entraObjectId,
        upn: `${mockUser.initials.toLowerCase()}@mock.local`,
        displayName: mockUser.initials,
        initials: mockUser.initials,
        role: mockUser.role,
      },
    });
  }

  console.log(
    `Seeded ${CATEGORIES.length} categories, ${BUSINESS_UNITS.length} business units, and ${MOCK_USERS.length} mock users.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
