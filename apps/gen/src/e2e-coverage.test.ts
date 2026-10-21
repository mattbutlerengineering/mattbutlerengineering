import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guard for the #7063 class: apps/gen's Playwright specs sat unrun because no
// CI job invoked them. Specs are discovered by Playwright's default testMatch
// under testDir, so a spec is only guaranteed to run while three things hold:
// the config does not narrow discovery, the test:e2e script passes no file
// filter, and the CI job runs that script. This lives in src/ (not e2e/) so
// vitest runs it and Playwright's testDir never tries to execute it.
const APP_DIR = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(APP_DIR, "../..");
const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

const read = (path: string) => readFileSync(path, "utf8");

describe("apps/gen e2e CI coverage", () => {
  it("has specs to guard", () => {
    expect(
      readdirSync(resolve(APP_DIR, "e2e")).filter((f) => SPEC_FILE.test(f)).length
    ).toBeGreaterThan(0);
  });

  it("playwright discovers every spec in e2e/ (no testMatch/testIgnore narrowing)", () => {
    const config = read(resolve(APP_DIR, "playwright.config.ts"));
    expect(config).toMatch(/testDir:\s*"\.\/e2e"/);
    expect(config).not.toMatch(/testMatch|testIgnore/);
  });

  it("test:e2e runs the whole suite, not a named file", () => {
    const pkg = JSON.parse(read(resolve(APP_DIR, "package.json"))) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["test:e2e"]).toBe("playwright test --config playwright.config.ts");
  });

  it("the e2e workflow runs test:e2e for gen", () => {
    const workflow = read(resolve(REPO_ROOT, ".github/workflows/e2e.yml"));
    expect(workflow).toContain("pnpm --dir apps/gen test:e2e");
  });
});
