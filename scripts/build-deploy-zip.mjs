// One-off deploy zip builder -- Oryx's remote build requires forward-slash
// zip entry paths (Windows backslash paths silently produce a flat,
// unusable extraction on the Linux build agent, see STATUS.md's
// "Stage 7 continued" entry). archiver is already a project dependency
// (Stage 6, ticket export) so this needs no new install.
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";

const IGNORE = [
  "node_modules/**",
  "node_modules",
  ".git/**",
  ".git",
  ".next/**",
  ".next",
  "certs/**",
  "certs",
  ".local-blob-store/**",
  ".local-blob-store",
  ".vercel/**",
  ".vercel",
  ".env",
  ".env.*",
  "**/*.pem",
  "**/*.tsbuildinfo",
  "deploy.zip",
  "weblogs.zip",
  "scratch_deploy_log.txt",
];

const outPath = resolve(process.argv[2] ?? "deploy.zip");
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

archive.glob("**/*", {
  cwd: process.cwd(),
  dot: true,
  ignore: IGNORE,
  nodir: true,
});

await archive.finalize();
