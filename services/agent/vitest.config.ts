import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      AUTH_AUTHORITY: "https://test.auth0.com/",
      AUTH_AUDIENCE: "https://api.test.com",
      AUTH_BYPASS_IN_TESTS: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 60,
        branches: 40,
        functions: 60,
        statements: 60,
      },
    },
  },
});
