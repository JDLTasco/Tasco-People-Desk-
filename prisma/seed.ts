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

  console.log(`Seeded ${CATEGORIES.length} categories and ${BUSINESS_UNITS.length} business units.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
