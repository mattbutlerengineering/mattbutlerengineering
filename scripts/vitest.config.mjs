import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    testTimeout: 15000,
    include: ["scripts/__tests__/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reportsDirectory: "scripts/coverage",
      reporter: ["text", "json", "html"],
      include: ["scripts/**/*.mjs", "scripts/**/*.js"],
      exclude: ["scripts/__tests__/**", "scripts/coverage/**"],
    },
  },
});
