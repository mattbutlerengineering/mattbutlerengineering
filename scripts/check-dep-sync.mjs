#!/usr/bin/env node

/**
 * Dependency Sync Audit — the `Dependency Sync` CI gate (ci.yml job
 * `dependency-audit`).
 *
 * Fail-closed accounting: the original version only counted gaps found in the
 * success branch, so a run where depcheck failed for every package (registry
 * blip, npx resolution failure, non-zero exit with empty stdout) printed one
 * ⚠️ per package and then `✅ Workspace dependency sync verified.` with exit
 * 0 — a gate that audited zero packages was indistinguishable from one that
 * audited all of them and found nothing. Now every package resolves to an
 * explicit outcome (clean / gaps / failed-to-audit) and the exit code
 * reflects all three, plus a positive audited count: zero packages
 * discovered is a failure, never a pass.
 *
 * The decision layer is pure (`classifyDepcheckResult`, `evaluateDepSync`)
 * per the repo shape in ci-gate-status.mjs / agent-core-build-freshness.mjs;
 * the CLI below is a thin walker that shells out and prints.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIRS = ["apps", "packages", "services", "tools"];

/**
 * Exact-version pin — same class as the Pulumi CLI runner-image float
 * (gotchas.md § Pulumi / R2, pulumi-cli-pin.test.mjs): a bare `npx depcheck`
 * runs whatever the registry serves at run time, so a future major that
 * restructures its JSON output would flip this gate's meaning with a
 * zero-diff push. Bump deliberately, with the shape-drift test alongside.
 */
export const DEPCHECK_SPEC = "depcheck@1.4.7";

/**
 * Classify one depcheck invocation's stdout into an explicit outcome.
 *
 * A payload that parses but carries no `missing` object is `failed`, not
 * clean: a future depcheck major that renames or restructures its JSON would
 * otherwise make `Object.keys(undefined || {})` report every package as
 * matched — green, hollow, and permanently so, with no parse error to trip
 * anything.
 *
 * @param {string} stdout raw stdout from `npx depcheck <pkg> --json`
 * @returns {{ outcome: "clean" } | { outcome: "gaps", missing: string[] } | { outcome: "failed", reason: string }}
 */
export function classifyDepcheckResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { outcome: "failed", reason: "Could not parse JSON output." };
  }
  const missing = parsed?.missing;
  if (missing === null || typeof missing !== "object" || Array.isArray(missing)) {
    return {
      outcome: "failed",
      reason: "Payload has no `missing` object — depcheck output shape drift.",
    };
  }
  const names = Object.keys(missing);
  return names.length > 0 ? { outcome: "gaps", missing: names } : { outcome: "clean" };
}

/**
 * Reduce per-package outcomes to the gate verdict. Pure: the exit code and
 * final line derive entirely from this.
 *
 * @param {Array<{ outcome: "clean" | "gaps" | "failed", missing?: string[] }>} outcomes
 */
export function evaluateDepSync(outcomes) {
  const discovered = outcomes.length;
  const clean = outcomes.filter((o) => o.outcome === "clean").length;
  const failed = outcomes.filter((o) => o.outcome === "failed").length;
  const gaps = outcomes
    .filter((o) => o.outcome === "gaps")
    .reduce((total, o) => total + o.missing.length, 0);
  return {
    discovered,
    audited: discovered - failed,
    clean,
    failed,
    gaps,
    ok: discovered > 0 && failed === 0 && gaps === 0,
  };
}

/** Walk apps/packages/services/tools for directories with a package.json. */
function discoverPackages(root) {
  const found = [];
  for (const dir of DIRS) {
    const dirPath = join(root, dir);
    if (!existsSync(dirPath)) continue;
    for (const dirent of readdirSync(dirPath, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const pkgPath = join(dirPath, dirent.name);
      if (!existsSync(join(pkgPath, "package.json"))) continue;
      found.push({ label: `${dir}/${dirent.name}`, path: pkgPath });
    }
  }
  return found;
}

function run() {
  const root = resolve(process.cwd());
  console.log("🔍 Starting Dependency Sync Audit...");

  const outcomes = [];
  for (const pkg of discoverPackages(root)) {
    console.log(`\n📦 Auditing ${pkg.label}...`);

    const child = spawnSync("npx", [DEPCHECK_SPEC, pkg.path, "--json"], {
      encoding: "utf8",
      shell: true,
    });

    // depcheck with --json writes the result to stdout even when it finds
    // missing deps (its own exit code is non-zero then) — classify on stdout.
    const result = classifyDepcheckResult(child.stdout ?? "");
    outcomes.push(result);

    if (result.outcome === "clean") {
      console.log(`   ✅ All imports matched in package.json`);
    } else if (result.outcome === "gaps") {
      console.error(`❌ ERROR: Missing dependencies in ${pkg.label}/package.json:`);
      result.missing.forEach((dep) => console.error(`   - ${dep}`));
    } else {
      console.error(`   ⚠️  Audit failed for ${pkg.label}: ${result.reason}`);
      if (child.stderr) console.error(`   Stderr: ${child.stderr.trim()}`);
      if (child.stdout) console.error(`   Stdout: ${child.stdout.trim()}`);
    }
  }

  const verdict = evaluateDepSync(outcomes);
  console.log("\n--- Audit Results ---");
  console.log(`packages audited:  ${verdict.audited} of ${verdict.discovered}`);
  console.log(`✅ matched:        ${verdict.clean}`);
  console.log(`⚠️  audit failed:   ${verdict.failed}`);
  console.log(`❌ missing deps:   ${verdict.gaps}`);

  if (verdict.ok) {
    console.log("✅ Workspace dependency sync verified.");
    process.exit(0);
  }
  if (verdict.discovered === 0) {
    console.error("❌ No workspace packages discovered — the audit ran against nothing.");
  }
  if (verdict.failed > 0) {
    console.error(
      `❌ ${verdict.failed} of ${verdict.discovered} packages could not be audited — failing closed.`
    );
  }
  if (verdict.gaps > 0) {
    console.error(`❌ Total dependency gaps found: ${verdict.gaps}`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
