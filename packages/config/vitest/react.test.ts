import { describe, expect, it } from "vitest";
import { defineVitestConfig } from "./react.js";

describe("defineVitestConfig (react preset)", () => {
  it("defaults environment to jsdom", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 70 } },
    });

    expect(config.test?.environment).toBe("jsdom");
  });

  it("includes the react plugin", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 70 } },
    });

    expect(Array.isArray(config.plugins)).toBe(true);
    expect(config.plugins?.length).toBeGreaterThan(0);
  });

  it("allows overriding environment to node (e.g. for auth package)", () => {
    const config = defineVitestConfig({
      environment: "node",
      coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 85 } },
    });

    expect(config.test?.environment).toBe("node");
  });

  it("applies coverage thresholds like the node preset", () => {
    const config = defineVitestConfig({
      coverage: {
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}"],
        thresholds: { lines: 65, branches: 55, functions: 65, statements: 65 },
      },
    });

    expect(config.test?.coverage?.thresholds).toEqual({
      lines: 65,
      branches: 55,
      functions: 65,
      statements: 65,
    });
  });

  it("enables the default + junit reporters with a test-results.xml output file", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 70 } },
    });

    expect(config.test?.reporters).toEqual(["default", "junit"]);
    expect(config.test?.outputFile).toEqual({ junit: "test-results/junit.xml" });
  });

  it("deep-merges extend for top-level css config alongside the react plugin", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 70 } },
      extend: {
        css: { modules: { localsConvention: "camelCase" } },
        test: { css: { modules: { classNameStrategy: "non-scoped" } } },
      },
    });

    expect(config.css).toEqual({ modules: { localsConvention: "camelCase" } });
    expect(config.test?.css).toEqual({ modules: { classNameStrategy: "non-scoped" } });
    expect(config.plugins?.length).toBeGreaterThan(0);
  });
});
