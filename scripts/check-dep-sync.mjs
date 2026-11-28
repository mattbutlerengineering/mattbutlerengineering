#!/usr/bin/env node

/**
 * Dependency Sync Audit — the `Dependency Sync` CI gate (ci.yml job
 * `repo-checks`, step `Dependency Sync`).
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

import { execFile } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
 * How many packages are audited at once.
 *
 * One `npx depcheck` per package, in series, measured 149s over this
 * workspace's 28 packages locally and 1m52s as ci.yml's `Dependency Sync`
 * step — nearly the whole of the `repo-checks` job, and ~6% of a PR run's
 * runner minutes, which is what the fan-out wave's queue wait is drawn from
 * (#10009). Each invocation spends most of its time waiting (npx resolution,
 * then walking and parsing one package's files), so the bound sits above the
 * runner's 2 cores. Measured locally over the same 28 packages: 149s serial,
 * 83s at 2, 48s at 4, 50s at 6, 49s at 8 — it plateaus at 4, so raising it
 * further only adds concurrent node processes. It is a bound, not a target:
 * fewer packages than this simply run all at once.
 */
export const AUDIT_CONCURRENCY = 4;

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

const execFileAsync = promisify(execFile);

/**
 * Audit `items` through `audit`, at most `concurrency` at a time, returning
 * one result per item at the item's own index. Order is by index, not by
 * completion, so a slow package cannot be credited with a fast one's outcome.
 *
 * @template T, R
 * @param {readonly T[]} items
 * @param {(item: T) => Promise<R>} audit
 * @param {number} concurrency
 * @returns {Promise<R[]>}
 */
export async function auditPackages(items, audit, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await audit(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker)
  );
  return results;
}

/**
 * Run depcheck for one package and classify it. depcheck with `--json` writes
 * its result to stdout even when it finds missing deps (its own exit code is
 * non-zero then), and execFile rejects on a non-zero exit — so stdout is read
 * off the rejection too, keeping classification on stdout exactly as the
 * serial version did.
 *
 * @param {{ label: string, path: string }} pkg
 */
async function auditPackage(pkg) {
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await execFileAsync("npx", [DEPCHECK_SPEC, pkg.path, "--json"], {
      encoding: "utf8",
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (error) {
    stdout = error?.stdout ?? "";
    stderr = error?.stderr ?? "";
  }
  return { pkg, stdout, stderr, result: classifyDepcheckResult(stdout) };
}

/**
 * Resolve depcheck once, serially, before the concurrent audits start (#10226).
 * On a cold runner the `~/.npm/_npx` cache has no depcheck, so concurrent
 * `npx` processes install it into the same directory at once and one reads a
 * package.json another is still writing (ERR_INVALID_PACKAGE_CONFIG). After
 * this call every audit is a cache hit.
 *
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function primeDepcheck() {
  try {
    await execFileAsync("npx", [DEPCHECK_SPEC, "--version"], {
      encoding: "utf8",
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true };
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "").trim();
    return { ok: false, reason: detail };
  }
}

async function run() {
  const root = resolve(process.cwd());
  console.log("🔍 Starting Dependency Sync Audit...");

  const primed = await primeDepcheck();
  if (!primed.ok) {
    console.error(`❌ Could not resolve ${DEPCHECK_SPEC} before auditing — failing closed.`);
    if (primed.reason) console.error(`   ${primed.reason}`);
    process.exit(1);
  }

  const packages = discoverPackages(root);
  // Reported after the fan-out, in discovery order: interleaving 28 concurrent
  // audits' lines would make the log unreadable.
  const audited = await auditPackages(packages, auditPackage, AUDIT_CONCURRENCY);
  const outcomes = audited.map((entry) => entry.result);

  for (const { pkg, stdout, stderr, result } of audited) {
    console.log(`\n📦 Auditing ${pkg.label}...`);
    if (result.outcome === "clean") {
      console.log(`   ✅ All imports matched in package.json`);
    } else if (result.outcome === "gaps") {
      console.error(`❌ ERROR: Missing dependencies in ${pkg.label}/package.json:`);
      result.missing.forEach((dep) => console.error(`   - ${dep}`));
    } else {
      console.error(`   ⚠️  Audit failed for ${pkg.label}: ${result.reason}`);
      if (stderr) console.error(`   Stderr: ${stderr.trim()}`);
      if (stdout) console.error(`   Stdout: ${stdout.trim()}`);
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
  await run();
}
