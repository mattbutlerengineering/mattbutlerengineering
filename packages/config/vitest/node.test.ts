import { describe, expect, it } from "vitest";
import { defineVitestConfig } from "./node.js";

describe("defineVitestConfig (node preset)", () => {
  it("applies the given coverage thresholds", () => {
    const config = defineVitestConfig({
      include: ["src/**/*.test.ts"],
      coverage: {
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts", "src/index.ts"],
        thresholds: { lines: 85, branches: 75, functions: 85, statements: 85 },
      },
    });

    expect(config.test?.coverage?.thresholds).toEqual({
      lines: 85,
      branches: 75,
      functions: 85,
      statements: 85,
    });
  });

  it("defaults environment to node and globals to true", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
    });

    expect(config.test?.environment).toBe("node");
    expect(config.test?.globals).toBe(true);
  });

  it("allows overriding globals to false", () => {
    const config = defineVitestConfig({
      globals: false,
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
    });

    expect(config.test?.globals).toBe(false);
  });

  it("omits test.include when not provided", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
    });

    expect(config.test?.include).toBeUndefined();
  });

  it("sets test.include when provided", () => {
    const config = defineVitestConfig({
      include: ["**/*.test.ts"],
      coverage: { include: ["**/*.ts"], exclude: [], thresholds: { lines: 80 } },
    });

    expect(config.test?.include).toEqual(["**/*.test.ts"]);
  });

  it("defaults coverage provider to v8 and reporter to text/json/html", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
    });

    expect(config.test?.coverage?.provider).toBe("v8");
    expect(config.test?.coverage?.reporter).toEqual(["text", "json", "html"]);
  });

  it("allows overriding the coverage reporter", () => {
    const config = defineVitestConfig({
      coverage: {
        include: ["src/**/*.ts"],
        exclude: [],
        thresholds: { lines: 80 },
        reporter: ["text", "json", "json-summary"],
      },
    });

    expect(config.test?.coverage?.reporter).toEqual(["text", "json", "json-summary"]);
  });

  it("preserves partial coverage thresholds (missing fields omitted)", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
    });

    expect(config.test?.coverage?.thresholds).toEqual({ lines: 80 });
  });

  it("deep-merges extend for extra test config (setupFiles, env)", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
      extend: {
        test: {
          setupFiles: ["./setup.ts"],
          env: { FOO: "bar" },
        },
      },
    });

    expect(config.test?.setupFiles).toEqual(["./setup.ts"]);
    expect(config.test?.env).toEqual({ FOO: "bar" });
    expect(config.test?.coverage?.thresholds).toEqual({ lines: 80 });
  });

  it("merges extend for vite-level config (resolve.alias)", () => {
    const config = defineVitestConfig({
      coverage: { include: ["src/**/*.ts"], exclude: [], thresholds: { lines: 80 } },
      extend: {
        resolve: { alias: { "@": "/abs/src" } },
      },
    });

    expect(config.resolve?.alias).toEqual({ "@": "/abs/src" });
  });
});
