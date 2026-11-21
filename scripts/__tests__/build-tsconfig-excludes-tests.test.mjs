/**
 * A package whose build tsconfig already excludes `src/**\/*.test.ts` means to
 * keep tests out of `dist/`. Pin that intent for every other test-file shape
 * its `src/` actually holds: `*.test.tsx` (packages/auth emitted
 * `dist/react/hooks.test.js`) and non-test helpers under `__tests__/`
 * (packages/agent-core emitted `dist/__tests__/fake-phase-deps.js`).
 *
 * Packages that exclude nothing at all are out of scope here (a separate
 * decision: services and sentry emit their tests today). Seeded in
 * docs/backlog.md (from: maintenance:test-typecheck-coverage).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function trackedUnder(dir) {
  return execFileSync("git", ["ls-files", "--", `${dir}/src`], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function emittingPackagesThatExcludeTests() {
  const dir = join(ROOT, "packages");
  return readdirSync(dir)
    .map((name) => `packages/${name}`)
    .filter((pkg) => existsSync(join(ROOT, pkg, "tsconfig.json")))
    .map((pkg) => ({
      pkg,
      config: JSON.parse(readFileSync(join(ROOT, pkg, "tsconfig.json"), "utf8")),
    }))
    .filter(
      ({ config }) =>
        config.compilerOptions?.outDir &&
        !config.compilerOptions?.noEmit &&
        (config.exclude ?? []).includes("src/**/*.test.ts")
    );
}

const CASES = emittingPackagesThatExcludeTests();

describe("build tsconfigs keep every test-file shape out of dist", () => {
  it("finds the packages it guards", () => {
    expect(CASES.map((c) => c.pkg)).toEqual(
      expect.arrayContaining(["packages/auth", "packages/agent-core"])
    );
  });

  it.each(CASES.map((c) => [c.pkg, c.config]))("%s", (pkg, config) => {
    const exclude = config.exclude ?? [];
    const files = trackedUnder(pkg);
    if (files.some((f) => f.endsWith(".test.tsx"))) {
      expect(exclude, `${pkg} has *.test.tsx files`).toContain("src/**/*.test.tsx");
    }
    if (files.some((f) => f.includes("/__tests__/") && !/\.test\.tsx?$/.test(f))) {
      expect(exclude, `${pkg} has non-test helpers under __tests__/`).toContain(
        "src/**/__tests__/**"
      );
    }
  });
});
