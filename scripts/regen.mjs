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
import { FAMILIES, llmsPackages } from "./regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command (as an argument array) from repo root. Returns the exit code. */
function spawn(cmd, args, { silent = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: silent ? "pipe" : "inherit",
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

// ---------------------------------------------------------------------------
// Family-specific generators
// ---------------------------------------------------------------------------

/**
 * Regenerate all llms.txt files by calling `mbe pack <pkg>` for each package.
 * Reuses the existing CLI pack command rather than reimplementing it, which
 * ensures cross-platform deterministic output (sorted globs, sorted sections).
 */
function regenLlms() {
  console.log("\n[llms-txt] Regenerating llms.txt context files...");
  const packages = llmsPackages();
  let failed = 0;
  for (const pkg of packages) {
    const code = spawn("pnpm", ["--filter", "@mbe/cli", "start", "pack", pkg], { silent: false });
    if (code !== 0) {
      console.error(`  ✗ pack failed for: ${pkg}`);
      failed++;
    }
  }
  if (failed > 0) {
    throw new Error(`llms.txt: ${failed} package(s) failed to regenerate`);
  }
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

// ---------------------------------------------------------------------------
// Check mode
// ---------------------------------------------------------------------------

function runCheck() {
  const stale = FAMILIES.filter((f) => !isClean(f.outputs));
  if (stale.length === 0) {
    console.log("All generated artifacts are up to date.");
    process.exit(0);
  }
  console.error(`\nStale artifacts detected (${stale.length}):\n`);
  for (const f of stale) {
    console.error(`  [${f.id}]  ${f.label}`);
    console.error(`          fix: ${f.command}\n`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Regen mode
// ---------------------------------------------------------------------------

function runRegen() {
  console.log("Regenerating all generated artifacts...\n");
  for (const family of FAMILIES) {
    if (family.id === "llms-txt") {
      regenLlms();
    } else {
      regenFamily(family);
    }
  }
  console.log("\nDone. All artifacts regenerated.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const checkMode = process.argv.includes("--check");
if (checkMode) {
  runCheck();
} else {
  runRegen();
}
