import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { describe, it, expect } from "vitest";
import usersConfig from "../../stryker.config.mjs";
import reservationsConfig from "../../stryker.reservations.config.mjs";

describe("stryker.reservations.config.mjs (#9333)", () => {
  it("mutates transitions and deposit services only, never test files", () => {
    expect(reservationsConfig.mutate).toEqual([
      "services/reservations/src/services/deposit.ts",
      "services/reservations/src/services/deposit-state-machine.ts",
      "services/reservations/src/transitions/*.ts",
      "!services/reservations/src/transitions/*.test.ts",
    ]);
  });

  it("points vitest at the reservations config with related mode off", () => {
    expect(reservationsConfig.vitest).toEqual({
      configFile: "services/reservations/vitest.stryker.config.ts",
      related: false,
      dir: "services/reservations",
    });
  });

  it("runs the stryker vitest config with the same absolute setup file (#9616)", async () => {
    const { default: base } = await import("../../services/reservations/vitest.config.ts");
    const { default: narrowed } =
      await import("../../services/reservations/vitest.stryker.config.ts");
    expect(narrowed.test?.setupFiles).toEqual(base.test?.setupFiles);
    expect(narrowed.test?.include?.length).toBeGreaterThan(0);
    expect(narrowed.test?.include).not.toContain("src/**/*.test.ts");
  });

  it("gives vitest an absolute setupFiles path that exists (#9616)", async () => {
    const { default: vitestConfig } = await import("../../services/reservations/vitest.config.ts");
    const setupFiles = vitestConfig.test?.setupFiles ?? [];
    expect(setupFiles).toHaveLength(1);
    for (const file of setupFiles) {
      expect(isAbsolute(file)).toBe(true);
      expect(existsSync(file)).toBe(true);
    }
  });

  it("does not ignore the reservations tree it needs in the sandbox", () => {
    expect(reservationsConfig.ignorePatterns).not.toContain("services/reservations/**");
    expect(reservationsConfig.ignorePatterns).toContain("services/users/**");
  });

  it("reuses the users pilot's runner, plugin, mutator exclusions and thresholds", () => {
    expect(reservationsConfig.testRunner).toBe(usersConfig.testRunner);
    expect(reservationsConfig.plugins).toEqual(usersConfig.plugins);
    expect(reservationsConfig.mutator).toEqual(usersConfig.mutator);
    expect(reservationsConfig.thresholds).toEqual(usersConfig.thresholds);
    expect(reservationsConfig.coverageAnalysis).toBe("off");
  });

  it("writes its report where the users run does not, so one cannot overwrite the other", () => {
    expect(reservationsConfig.jsonReporter?.fileName).toBe(
      "reports/mutation-reservations/mutation.json"
    );
    expect(reservationsConfig.htmlReporter?.fileName).toBe(
      "reports/mutation-reservations/mutation.html"
    );
  });
});
