import { prisma } from "./lib/prisma";

async function main() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`Categories (${categories.length}):`, categories.map((c) => c.name).join(", "));

  const businessUnits = await prisma.businessUnit.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`Business units (${businessUnits.length}):`, businessUnits.map((b) => b.name).join(", "));
}

main().finally(() => prisma.$disconnect());
