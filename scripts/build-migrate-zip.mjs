// One-off migration-only zip builder, same forward-slash-path reasoning as
// build-deploy-zip.mjs -- just prisma/schema.prisma + migrations/, small
// enough to run `npx prisma migrate deploy` from Cloud Shell without the
// full app (see STATUS.md's established Cloud Shell migration pattern).
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve("prisma-migrate.zip");
const output = createWriteStream(outPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`Wrote ${outPath} (${archive.pointer()} bytes)`);
});
archive.on("warning", (err) => {
  throw err;
});
archive.on("error", (err) => {
  throw err;
});
archive.pipe(output);

archive.file("prisma/schema.prisma", { name: "prisma/schema.prisma" });
archive.directory("prisma/migrations", "prisma/migrations");

await archive.finalize();
