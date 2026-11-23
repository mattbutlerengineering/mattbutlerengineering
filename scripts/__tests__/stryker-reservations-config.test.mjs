import { describe, it, expect } from "vitest";
import usersConfig from "../../stryker.config.mjs";
import reservationsConfig from "../../stryker.reservations.config.mjs";

describe("stryker.reservations.config.mjs (#9333)", () => {
  it("mutates reservations services and transitions, never test files", () => {
    expect(reservationsConfig.mutate).toEqual([
      "services/reservations/src/services/*.ts",
      "!services/reservations/src/services/*.test.ts",
      "services/reservations/src/transitions/*.ts",
      "!services/reservations/src/transitions/*.test.ts",
    ]);
  });

  it("points vitest at the reservations config with related mode off", () => {
    expect(reservationsConfig.vitest).toEqual({
      configFile: "services/reservations/vitest.config.ts",
      related: false,
      dir: "services/reservations",
    });
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
