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

  describe("domInclude", () => {
    const split = () =>
      defineVitestConfig({
        include: ["src/**/*.test.{ts,tsx}"],
        domInclude: ["src/**/*.test.tsx", "src/needs-dom.test.ts"],
        coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 70 } },
        extend: {
          resolve: { alias: { "@": "/src" } },
          test: { testTimeout: 15000, setupFiles: ["./src/test/setup.ts"] },
        },
      });
    const project = (name: string) => {
      const found = split().test?.projects?.find(
        (entry) => typeof entry === "object" && "test" in entry && entry.test?.name === name
      );
      if (!found || typeof found !== "object" || !("test" in found)) {
        throw new Error(`no inline project named ${name}`);
      }
      return found;
    };

    it("leaves the config unsplit when omitted", () => {
      const config = defineVitestConfig({
        coverage: { include: ["src/**/*.tsx"], exclude: [], thresholds: { lines: 70 } },
      });

      expect(config.test?.projects).toBeUndefined();
    });

    it("runs the domInclude files under jsdom with the setup files", () => {
      const dom = project("dom");

      expect(dom.test?.environment).toBe("jsdom");
      expect(dom.test?.setupFiles).toEqual(["./src/test/setup.ts"]);
      expect(dom.test?.include).toEqual(["src/**/*.test.tsx", "src/needs-dom.test.ts"]);
    });

    it("runs every other included file under node with no setup files", () => {
      const node = project("node");

      expect(node.test?.environment).toBe("node");
      expect(node.test?.setupFiles).toBeUndefined();
      expect(node.test?.include).toEqual(["src/**/*.test.{ts,tsx}"]);
      expect(node.test?.exclude).toEqual(
        expect.arrayContaining(["src/**/*.test.tsx", "src/needs-dom.test.ts"])
      );
    });

    it("gives both projects the shared test options, plugins and aliases", () => {
      for (const name of ["dom", "node"]) {
        const entry = project(name);

        // Extending the root would concatenate its include and setupFiles into the project.
        expect(entry.extends).toBe(false);
        expect(entry.test?.testTimeout).toBe(15000);
        expect(entry.test?.globals).toBe(true);
        expect(entry.plugins?.length).toBeGreaterThan(0);
        expect(entry.resolve?.alias).toEqual({ "@": "/src" });
      }
    });

    it("keeps coverage and reporters at the root, where vitest reads them", () => {
      const config = split();

      expect(config.test?.coverage?.thresholds).toEqual({ lines: 70 });
      expect(config.test?.reporters).toEqual(["default", "junit"]);
      expect(config.test?.outputFile).toEqual({ junit: "test-results/junit.xml" });
    });
  });
});
