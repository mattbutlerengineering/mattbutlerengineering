import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  environment: "node",
  include: ["src/**/*.test.{ts,tsx}"],
  coverage: {
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/index.ts"],
    thresholds: {
      lines: 85,
      branches: 70,
      functions: 85,
      statements: 85,
    },
  },
});
