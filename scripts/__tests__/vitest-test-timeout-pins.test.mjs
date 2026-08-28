import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * Pins the explicit `testTimeout` declarations in the three packages that have
 * each been observed tipping over vitest's 5000ms default under cold-cache,
 * fully-parallel `pnpm test` runs (the pnpm-lock.yaml turbo globalDependencies
 * cache-bust class — see .claude/rules/gotchas.md "Any pnpm-lock.yaml change
 * forces a cold, fully parallel CI run").
 *
 * This test does NOT reproduce the flake — the defect is load-dependent and
 * has no deterministic failing-test shape. What it pins is the fix itself:
 * each config must keep declaring a timeout above the 5s default, so a silent
 * removal (the real regression risk) goes red instead of resurfacing as
 * unreproducible CI flake months later.
 *
 * Parsed textually rather than by importing the configs, matching the
 * precedent in pulumi-cli-pin.test.mjs: the configs are TypeScript and pull in
 * workspace presets (@mbe/config/vitest/*) plus @vitejs/plugin-react, none of
 * which the scripts package should grow a dependency on just to read a scalar.
 */
const PINNED_CONFIGS = [
  "packages/rialto/vitest.config.ts",
  "packages/service-bootstrap/vitest.config.ts",
  "apps/marketing/vitest.config.ts",
];

const VITEST_DEFAULT_TIMEOUT_MS = 5000;

describe("testTimeout pins for parallel-load-sensitive packages", () => {
  for (const configPath of PINNED_CONFIGS) {
    it(`${configPath} declares an explicit testTimeout above the ${VITEST_DEFAULT_TIMEOUT_MS}ms default`, () => {
      const source = readFileSync(resolve(ROOT, configPath), "utf8");
      const declarations = [...source.matchAll(/testTimeout:\s*(\d+)/g)].map((m) => Number(m[1]));

      expect(declarations.length).toBeGreaterThanOrEqual(1);
      for (const value of declarations) {
        expect(value).toBeGreaterThan(VITEST_DEFAULT_TIMEOUT_MS);
      }
    });
  }
});
