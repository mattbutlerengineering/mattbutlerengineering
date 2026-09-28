#!/usr/bin/env node

/**
 * Merges a stale, still-open `automation/acmm-regression` branch's
 * `issuesCreated` dedup ledger into the current `.claude/acmm/state.json`
 * *before* `plugins/acmm/scripts/audit.js --apply` runs.
 *
 * `issuesCreated` (criterion id -> issue number) is how `--apply` avoids
 * filing a duplicate issue for a gap it already filed one for. That ledger
 * only reaches `main` when a daily automation PR actually merges. #5854
 * review: acmm-regression.yml's own daily PR touched only
 * `.claude/acmm/state.json` (and, after this fix, `apps/marketing/public/
 * acmm-report.json`), which matched no `tier-classifier.yml` rule and
 * defaulted to `tier:standard` — blocking auto-merge on every run. Prior
 * `automation/acmm-regression` PRs (#5497, #5305, #5056, #4461) all closed
 * unmerged, so each carried a ledger entry `main` never saw — the NEXT
 * day's audit read a ledger missing that entry and could refile the same
 * issue. (The tier-classifier fix in the same PR as this file closes the
 * root cause going forward; this merge step covers whatever branches are
 * already stuck open from before that fix landed.)
 *
 * `mergeIssuesCreated()` is pure and unit-tested. The CLI section wires it
 * to the filesystem: reads the current `.claude/acmm/state.json`, unions its
 * `issuesCreated` with the ledger from a branch-state file the caller
 * supplies (via `git show <ref>:.claude/acmm/state.json > file`), and writes
 * the merged ledger back. No-op (and no error) when no branch-state file is
 * given — that is the normal case once no `automation/acmm-regression`
 * branch is open. Silent by design: the caller (the workflow step) owns
 * user-facing status output via its own `echo` lines around this call.
 *
 * Usage: node scripts/acmm-merge-issues-created.mjs --branch-state-file <path>
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STATE_PATH = resolve(ROOT, ".claude", "acmm", "state.json");

/**
 * Union two `issuesCreated` ledgers (criterion id -> issue number). The
 * branch ledger wins on a conflicting key — it is the more recent write, and
 * an already-open issue number from the branch is what `--apply` needs to
 * recognize as "already filed" rather than reopen or duplicate. Pure: never
 * mutates either input.
 *
 * @param {Record<string, number>} [current]
 * @param {Record<string, number>} [branch]
 * @returns {Record<string, number>}
 */
export function mergeIssuesCreated(current, branch) {
  return { ...(current ?? {}), ...(branch ?? {}) };
}

// ---------------------------------------------------------------------------
// CLI: filesystem wiring (not unit-tested; the logic above is).
// ---------------------------------------------------------------------------

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function main() {
  const branchStatePath = readFlag(process.argv.slice(2), "--branch-state-file");
  if (!branchStatePath || !existsSync(branchStatePath)) return;

  const current = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const branch = JSON.parse(readFileSync(branchStatePath, "utf8"));
  const merged = mergeIssuesCreated(current.issuesCreated, branch.issuesCreated);

  writeFileSync(STATE_PATH, JSON.stringify({ ...current, issuesCreated: merged }, null, 2) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
