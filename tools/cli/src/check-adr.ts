#!/usr/bin/env node
// Standalone `check-adr` entry for the pre-commit hook. src/index.ts loads
// every command, and through them workspace packages whose gitignored dist/
// a fresh worktree lacks; this graph has none
// (scripts/__tests__/precommit-check-adr.test.mjs).
import { checkAdrCommand } from "./commands/adr.js";

checkAdrCommand.parseAsync().catch((err) => {
  console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
