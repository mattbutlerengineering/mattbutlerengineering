/**
 * Stryker Mutation Testing Configuration
 *
 * Validates test quality by introducing small code mutations and checking that
 * tests catch them. Periodic testing only (weekly or on-demand) — not per-commit
 * since mutation testing is computationally expensive.
 *
 * Pilot scope: services/users (route handlers + business logic)
 * Target mutation score: > 80%
 *
 * Note: This config targets services/users business logic and route handlers,
 * excluding schemas, test files, and generated code. The GitHub Actions workflow
 * .github/workflows/mutation-testing.yml handles weekly and on-demand runs.
 */

export default {
  // Test runner - auto-discovered from installed packages
  // The @stryker-mutator/vitest-runner must be installed as a devDependency
  testRunner: "vitest",

  // Files to mutate (services/users business logic and routes)
  // Using glob patterns relative to the directory containing stryker.config.mjs
  mutate: [
    "services/users/src/routes/*.ts",
    "services/users/src/services/*.ts",
  ],

  // Ignore patterns to exclude from mutation
  ignorePatterns: [
    "**/*.test.ts",
    "**/*.schema.ts",
    "**/schemas/**",
    "**/database.ts",
    "**/generated/**",
  ],

  // Report configuration
  reporters: ["html", "json", "progress"],

  // Timeouts
  timeoutMS: 5000,
  timeoutFactor: 1.25,
};
