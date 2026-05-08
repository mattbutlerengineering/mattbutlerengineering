import { defineConfig } from "vitest/config";

/**
 * Root vitest workspace config for monorepo-wide test execution.
 *
 * Each package/service/app owns its own vitest.config.ts with
 * environment, coverage thresholds, and include patterns.
 * This file simply aggregates them so `vitest --workspace` or
 * the ACMM prereq-test-suite check can discover them.
 */
export default defineConfig({
  workspace: [
    "packages/*/vitest.config.ts",
    "services/*/vitest.config.ts",
    "apps/*/vitest.config.ts",
    "tools/*/vitest.config.ts",
    "scripts/vitest.config.mjs",
  ],
});
