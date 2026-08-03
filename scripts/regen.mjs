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

/**
 * Real staleness check for one llms.txt/llms-full.txt package: delegates to
 * `mbe pack <pkg> --check` (tools/cli/src/commands/pack.ts), which re-derives
 * the expected skeleton/full output from source and compares. Unlike a
 * `git diff` on the committed artifact, this catches an un-regenerated
 * source edit (or deletion) even when nobody has run `pnpm regen` yet — the
 * false negative this function replaces (#3635).
 */
function isLlmsPackageStale(pkg) {
  const code = spawn("pnpm", ["--filter", "@mbe/cli", "start", "pack", pkg, "--check"], {
    silent: true,
  });
  return code !== 0;
}

function runCheck() {
  const llmsFamily = FAMILIES.find((f) => f.id === "llms-txt");
  const otherFamilies = FAMILIES.filter((f) => f.id !== "llms-txt");

  // Non-llms families have no `--check` mode of their own, so this still
  // relies on a git-diff staleness check: it only catches drift already
  // materialised in the tree (e.g. the generator ran but the result wasn't
  // committed), not an un-regenerated source edit. Acceptable here — each of
  // these generators has a narrow, single-file source (a schema, design
  // tokens, a dependency manifest) that in practice changes in the same
  // commit as its output.
  const staleOther = otherFamilies.filter((f) => !isClean(f.outputs));

  // llms-txt: real source→output check per package (see isLlmsPackageStale).
  const stalePackages = llmsFamily ? llmsPackages().filter(isLlmsPackageStale) : [];

  if (staleOther.length === 0 && stalePackages.length === 0) {
    console.log("All generated artifacts are up to date.");
    process.exit(0);
    return;
  }

  const staleCount = staleOther.length + (stalePackages.length > 0 ? 1 : 0);
  console.error(`\nStale artifacts detected (${staleCount}):\n`);
  for (const f of staleOther) {
    console.error(`  [${f.id}]  ${f.label}`);
    console.error(`          fix: ${f.command}\n`);
  }
  if (stalePackages.length > 0 && llmsFamily) {
    console.error(`  [${llmsFamily.id}]  ${llmsFamily.label} (${stalePackages.join(", ")})`);
    console.error(`          fix: ${llmsFamily.command}\n`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Regen mode
// ---------------------------------------------------------------------------

function runRegen() {
  console.log("Regenerating all generated artifacts...\n");
  // Run all non-llms-txt families first so llms.txt embeds freshly-generated
  // artifacts (e.g. rialto-catalog-schemas / generated-schemas.ts). Running
  // llms-txt first caused ordering-induced drift: the schema was regenerated
  // after llms, so the committed llms embedded the pre-regen schema content
  // while CI regenerated llms with the post-regen schema → stale artifact.
  for (const family of FAMILIES) {
    if (family.id !== "llms-txt") {
      regenFamily(family);
    }
  }
  // Run llms-txt last so it reads the freshly-generated schema.
  regenLlms();
  console.log("\nDone. All artifacts regenerated.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checkMode = process.argv.includes("--check");
  if (checkMode) {
    runCheck();
  } else {
    runRegen();
  }
}

export { runCheck, runRegen, isClean };
