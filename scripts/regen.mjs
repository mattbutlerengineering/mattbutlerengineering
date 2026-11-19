#!/usr/bin/env node
/**
 * regen.mjs — Regenerate all committed generated artifacts.
 *
 * Usage:
 *   node scripts/regen.mjs            # regenerate everything
 *   node scripts/regen.mjs --check    # exit non-zero if any artifact is stale
 *
 * Entry point for `pnpm regen` and `pnpm regen --check` (see root package.json).
 * Artifact definitions live in regen-manifest.mjs — add new families there.
 */

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES } from "./regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Run a command (as an argument array) from repo root. Returns the exit code. */
function spawn(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
    shell: false,
  });
  return result.status ?? 1;
}

/** Returns true when all listed paths are unmodified vs. the index. */
function isClean(paths) {
  const result = spawnSync("git", ["diff", "--quiet", "--", ...paths], {
    cwd: ROOT,
    stdio: "pipe",
    shell: false,
  });
  return result.status === 0;
}

/** Regenerate a single family by running its generator command via pnpm. */
function regenFamily(family) {
  console.log(`\n[${family.id}] ${family.label}...`);
  // The command strings in the manifest are `pnpm ...` invocations.
  // Split on whitespace so we can use spawnSync without a shell.
  const [cmd, ...args] = family.command.split(/\s+/);
  const code = spawn(cmd, args);
  if (code !== 0) {
    throw new Error(`[${family.id}] generator exited with code ${code}`);
  }
}

/**
 * These families have no `--check` mode of their own, so staleness is a
 * git-diff check: it catches drift already materialised in the tree (the
 * generator ran but the result wasn't committed), not an un-regenerated source
 * edit. Acceptable here — each generator has a narrow, single-file source (a
 * schema, design tokens, a dependency manifest) that in practice changes in the
 * same commit as its output.
 */
function runCheck() {
  const stale = FAMILIES.filter((f) => !isClean(f.outputs));

  if (stale.length === 0) {
    console.log("All generated artifacts are up to date.");
    process.exit(0);
    return;
  }

  console.error(`\nStale artifacts detected (${stale.length}):\n`);
  for (const f of stale) {
    console.error(`  [${f.id}]  ${f.label}`);
    console.error(`          fix: ${f.command}\n`);
  }
  process.exit(1);
}

function runRegen() {
  console.log("Regenerating all generated artifacts...\n");
  for (const family of FAMILIES) {
    regenFamily(family);
  }
  console.log("\nDone. All artifacts regenerated.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    runCheck();
  } else {
    try {
      runRegen();
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

export { runCheck, runRegen, isClean };
