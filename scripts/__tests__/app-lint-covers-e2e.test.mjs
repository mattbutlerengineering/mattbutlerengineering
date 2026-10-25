import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, readFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every tracked Playwright spec under an app's `e2e/` must be linted by that
 * app's own `lint` script, and turbo's `lint` hash must respond when one of
 * those files changes.
 *
 * Why: `.claude/rules/gotchas.md` § Pre-push / typecheck records this as a
 * live hole under "Still uncovered" — app `lint` scripts were `eslint src/`,
 * so `e2e/**` was type-checked (root `turbo.json` lists `e2e/**` under
 * `tasks.typecheck.inputs`) but never linted. E2E specs are the exact surface
 * the `e2e-selector-drift-reviewer` subagent exists to police, and the class
 * it catches took the Hospitality suite from 31 -> 7 failing specs.
 *
 * The second assertion is not redundant with the first. Measured 2026-10-23
 * on `@mbe/hospitality#lint`: appending a line to `e2e/auth.spec.ts` left the
 * task hash byte-identical (2f35d7e2719d1877 before and after), because
 * `tasks.lint.inputs` listed `src/**` and not `e2e/**`. Widening the script
 * alone would have shipped a lint that a cached green result replays over —
 * the same trap gotchas already records for `tasks.typecheck.inputs`. So this
 * probes the REAL hashing pipeline (`turbo --dry-run=json`) rather than
 * turbo.json's text.
 *
 * Not asserted here, because it is already sound: an edit to the shared
 * preset `packages/config/eslint/react.js` DOES move the same hash
 * (31a5324d9fdfae78), since `@mbe/config` is a declared dependency and turbo
 * hashes a workspace dependency's own files.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TURBO_BIN = join(ROOT, "node_modules", ".bin", "turbo");

/** Tracked files, so untracked scratch files never fail the guard. */
function trackedFiles(pattern) {
  return execFileSync("git", ["ls-files", pattern], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/**
 * The paths an `eslint` invocation lints. Flags and their values are dropped;
 * everything else is a target. Throws on a script shape it cannot read, so an
 * unfamiliar `lint` script fails loudly instead of passing vacuously.
 *
 * @param {string} script
 * @returns {string[]} target paths, relative to the package directory
 */
export function eslintTargetsOf(script) {
  const segments = script.split(/&&|\|\||;/);
  const targets = [];
  let sawEslint = false;

  for (const segment of segments) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const start = tokens.findIndex((t) => t === "eslint" || t.endsWith("/eslint"));
    if (start === -1) continue;
    sawEslint = true;
    for (const token of tokens.slice(start + 1)) {
      if (token.startsWith("-")) continue;
      targets.push(token.replace(/\/$/, ""));
    }
  }

  if (!sawEslint) throw new Error(`lint script runs no eslint: ${script}`);
  return targets;
}

/** Apps that ship Playwright specs, as [packageName, appDir, specPaths]. */
function appsWithE2eSpecs() {
  const specs = trackedFiles("apps/*/e2e/**");
  const byApp = new Map();

  for (const spec of specs) {
    if (!/\.(ts|tsx)$/.test(spec)) continue;
    const appDir = spec.split("/").slice(0, 2).join("/");
    if (!byApp.has(appDir)) byApp.set(appDir, []);
    byApp.get(appDir).push(spec);
  }

  return [...byApp.entries()].map(([appDir, specPaths]) => {
    const manifest = JSON.parse(readFileSync(join(ROOT, appDir, "package.json"), "utf8"));
    return { name: manifest.name, appDir, specPaths, lint: manifest.scripts?.lint };
  });
}

/** One dry-run hash for an app's lint task; nothing executes and nothing caches. */
function lintHash(packageName) {
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: "1" };
  delete env.TURBO_TOKEN;
  delete env.TURBO_TEAM;
  const stdout = execFileSync(
    TURBO_BIN,
    ["run", "lint", `--filter=${packageName}`, "--dry-run=json"],
    { cwd: ROOT, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 }
  );
  const task = JSON.parse(stdout).tasks.find((t) => t.taskId === `${packageName}#lint`);
  if (!task) throw new Error(`dry-run has no task ${packageName}#lint`);
  return task.hash;
}

describe("app lint covers e2e", () => {
  const apps = appsWithE2eSpecs();

  it("finds the apps that ship Playwright specs", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  it.each(apps)("$name lints every tracked file under e2e/", ({ appDir, specPaths, lint }) => {
    expect(lint, `${appDir} declares no lint script`).toBeTruthy();
    const targets = eslintTargetsOf(lint);

    const uncovered = specPaths.filter((spec) => {
      const rel = spec.slice(`${appDir}/`.length);
      return !targets.some((target) => rel === target || rel.startsWith(`${target}/`));
    });

    expect(uncovered, `not linted by \`${lint}\``).toEqual([]);
  });

  it.each(apps)("$name lint hash responds to an e2e edit", ({ name, specPaths }) => {
    const probe = join(ROOT, specPaths[0]);
    const backup = `${probe}.lint-input-probe`;
    const before = lintHash(name);

    copyFileSync(probe, backup);
    try {
      appendFileSync(probe, "\n// turbo lint input probe\n");
      expect(lintHash(name), "turbo.json tasks.lint.inputs must include e2e/**").not.toBe(before);
    } finally {
      renameSync(backup, probe);
    }

    expect(lintHash(name)).toBe(before);
  });
});
