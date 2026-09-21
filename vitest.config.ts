import { defineConfig } from "vitest/config";

/**
 * Root vitest config aggregating every package's own config as a project.
 *
 * Each package/service/app owns its own vitest.config.ts with environment,
 * coverage thresholds, and include patterns. This file only points at them.
 *
 * `test.projects` is the vitest 3.2+ name for what this file used to spell as a
 * top-level `workspace` key. That key was never a vitest option at the top level
 * (the 3.x option was `test.workspace`, removed in 4.0), so it had silently done
 * nothing: a root `vitest` run ignored it and fell back to bare root discovery,
 * collecting stray files with no per-package config. Measured against 5.0.1:
 * `vitest run --config vitest.config.ts --project @mbe/cancellation-policy
 * --project @mbe/edge-worker` resolves both by package name and reports the same
 * 18 files / 299 tests those packages report on their own — which also confirms
 * the `infrastructure/*` glob picks up `infrastructure/worker/vitest.config.mjs`.
 *
 * Note `pnpm test` does NOT use this file; it runs `turbo run test`, which
 * invokes each package's own config. This is for a root-level `vitest` run and
 * for the ACMM prereq-test-suite check.
 */
export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "services/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
      "tools/*/vitest.config.ts",
      "scripts/vitest.config.mjs",
      "infrastructure/*/vitest.config.*",
    ],
  },
});
