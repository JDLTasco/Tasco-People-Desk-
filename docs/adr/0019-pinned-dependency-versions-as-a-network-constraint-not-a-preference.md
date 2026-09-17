# ADR-0019 — Pinned dependency versions as a network constraint, not a preference

**Status:** Accepted · 2026-09-15

**Context.** Several dependencies are pinned to versions that look stale.

**Decision and reasons, individually:**

- **Prisma 6.19.3.** Tasco's gateway blocks executable downloads, so the Prisma CLI cannot fetch its engine binaries. The local machine uses binaries copied from a sibling project, with environment variables pointing at them. **Upgrading breaks the local toolchain** — the new version's engine commit hash will not match the cache and a fresh download hits the same block. Any upgrade requires sourcing matching binaries off-network first.
- **`archiver` 6.0.2, not 8.x.** Version 8 is ESM-only with a conditional exports map Next.js 14's webpack cannot resolve. The failure takes down every route in the dev server, not just the export route.
- **Node's built-in test runner via `tsx`, not Vitest.** Vitest's Rollup dependency needs a native binary blocked by the same gateway rule. `vitest.config.ts` remains in the repo as an inert placeholder; do not resurrect it without solving the binary problem first.

**Consequence.** These are environment workarounds, not engineering preferences, and they are machine-specific rather than portable. GitHub Actions runners sit outside Tasco's network and have none of these constraints, which makes CI the only place portability is genuinely proven. Do not "modernise" any of the above without reading this record.
