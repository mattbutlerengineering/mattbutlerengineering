/**
 * Vitest config used only by Stryker (stryker.reservations.config.mjs, #9616).
 *
 * Stryker runs the whole suite once per mutant (`coverageAnalysis: "off"`), and
 * the full reservations suite takes minutes, so the weekly run could not fit its
 * 30-minute window. The mutated files are the transition logic and the deposit
 * services, so only the tests that exercise them run here.
 */
import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "src/transitions/**/*.test.ts",
      "src/services/deposit.test.ts",
      "src/services/deposit-state-machine.test.ts",
    ],
  },
});
