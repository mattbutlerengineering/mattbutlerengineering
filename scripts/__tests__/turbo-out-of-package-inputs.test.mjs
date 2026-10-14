import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #6567: turbo hashes only the package's own files (plus declared inputs).
 * rialto-web imports scripts/ui-quality/derive-path.mjs; marketing's contract
 * test imports scripts/build-sensor-report.mjs. An edit to those files alone
 * replayed a cached green build/test. This reads turbo's resolved inputs
 * (dry-run) and asserts every file a package's source or test imports from
 * OUTSIDE the package (relative specifier, or a "scripts/…" literal resolved
 * from the repo root), plus everything those files import relatively in turn,
 * is in the relevant task's input set.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGES = ["apps/rialto-web", "apps/marketing"];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const REL_IMPORT = /(?:from|import\()\s*["'](\.{1,2}\/[^"']+?)(?:\?[a-z]+)?["']/g;
const SCRIPT_LITERAL = /["'](scripts\/[A-Za-z0-9_./-]+\.m?[jt]s)["']/g;

function turboInputs(task) {
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: "1" };
  delete env.TURBO_TOKEN;
  delete env.TURBO_TEAM;
  const out = execFileSync(
    resolve(ROOT, "node_modules/.bin/turbo"),
    ["run", task, "--dry-run=json"],
    { cwd: ROOT, encoding: "utf8", env, maxBuffer: 256 * 1024 * 1024 }
  );
  return JSON.parse(out).tasks.filter((t) => t.task === task);
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const relImports = (file, text) =>
  [...text.matchAll(REL_IMPORT)].map((m) => relative(ROOT, resolve(ROOT, dirname(file), m[1])));

/**
 * Repo-relative files outside `dir` that `file` imports, followed transitively:
 * an out-of-package file's own relative imports must be hashed too (e.g.
 * build-sensor-report.mjs -> sensors-registry.mjs -> … -> lib/fitness-check.mjs).
 */
function outsideImports(dir, file) {
  const text = readFileSync(resolve(ROOT, file), "utf8");
  const isOutside = (f) => !f.startsWith(`${dir}/`) && tracked.includes(f);
  const literals = [...text.matchAll(SCRIPT_LITERAL)].map((m) => m[1]);
  const queue = [...relImports(file, text), ...literals].filter(isOutside);
  const found = new Set();
  while (queue.length > 0) {
    const next = queue.shift();
    if (found.has(next)) continue;
    found.add(next);
    queue.push(...relImports(next, readFileSync(resolve(ROOT, next), "utf8")).filter(isOutside));
  }
  return [...found];
}

/** Turbo reports inputs relative to the package ("../../scripts/x"); make them repo-relative. */
const repoRelative = (dir, inputs) =>
  new Set(Object.keys(inputs).map((k) => relative(ROOT, resolve(ROOT, dir, k))));

const tasksBy = { test: turboInputs("test"), build: turboInputs("build") };

describe.each(PACKAGES)("%s declares out-of-package imports as turbo inputs", (dir) => {
  const files = tracked.filter((f) => f.startsWith(`${dir}/src/`) && SOURCE_FILE.test(f));
  const testImports = new Set(files.flatMap((f) => outsideImports(dir, f)));
  const buildImports = new Set(
    files.filter((f) => !TEST_FILE.test(f)).flatMap((f) => outsideImports(dir, f))
  );

  it("test inputs", () => {
    const inputs = repoRelative(dir, tasksBy.test.find((t) => t.directory === dir).inputs);
    expect([...testImports].filter((f) => !inputs.has(f))).toEqual([]);
  });

  it("build inputs", () => {
    const inputs = repoRelative(dir, tasksBy.build.find((t) => t.directory === dir).inputs);
    expect([...buildImports].filter((f) => !inputs.has(f))).toEqual([]);
  });
});

it("the scanner finds the known imports (the probe itself works)", () => {
  const file = "apps/rialto-web/src/data/page-registry.ts";
  expect(outsideImports("apps/rialto-web", file)).toContain("scripts/ui-quality/derive-path.mjs");
  expect(
    outsideImports("apps/marketing", "apps/marketing/src/data/ai-health-reader-contract.test.ts")
  ).toContain("scripts/build-sensor-report.mjs");
});

it("the scanner follows out-of-package imports transitively", () => {
  const found = outsideImports(
    "apps/marketing",
    "apps/marketing/src/data/ai-health-reader-contract.test.ts"
  );
  expect(found).toContain("scripts/lib/fitness-check.mjs");
  expect(found).toContain("plugins/acmm/scripts/agent-pr.js");
});
