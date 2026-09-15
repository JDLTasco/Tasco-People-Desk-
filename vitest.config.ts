// Unused -- this project's test runner is Node's built-in test runner via
// tsx (see package.json's "test" script), not Vitest. Vitest was tried
// first but dropped: its Rollup dependency needs a native binary this
// network's executable-download gateway blocks (see STATUS.md). This file
// is left as an inert placeholder because the tool used to create it
// cannot delete files in this environment; do not restore it as real
// config without first re-solving that native-binary problem.
export {};
