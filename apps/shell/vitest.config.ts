import { defineVitestConfig } from "@mbe/config/vitest/node";

// The conformance specs (e2e/*.spec.ts) belong to Playwright. Only the
// `*.test.ts` files beside them are vitest: they pin the harness contract.
export default defineVitestConfig({
  include: ["e2e/**/*.test.ts"],
  coverage: {
    include: ["e2e/support/**/*.ts"],
    // harness.ts and reporter.ts only run inside Playwright (a browser, a target); the pure
    // logic they lean on is in the files that stay covered.
    exclude: ["e2e/**/*.test.ts", "e2e/support/harness.ts", "e2e/support/reporter.ts"],
    thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
  },
});
