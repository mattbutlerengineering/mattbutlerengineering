import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(REPO_ROOT, path), "utf8");

/**
 * Regression guard for the #3955 failure class — a real, assertion-bearing
 * spec that CI silently never invokes (see rialto-web's and hospitality's
 * e2e/workflow-coverage.test.ts).
 *
 * Marketing has two suites with two wirings, so this guards both:
 *   1. e2e.yml runs the bare `test:e2e` script, which auto-discovers every
 *      functional spec in e2e/ — a narrowed invocation would silently drop
 *      every spec it does not list;
 *   2. visual.spec.ts, which the base config ignores, is named by full path in
 *      apps-visual.yml — the only place it runs.
 *
 * vitest-only: apps/marketing/vitest.config.ts includes this one e2e/ file,
 * and playwright.config.ts testIgnores it by exact name.
 */
describe("marketing e2e workflow coverage", () => {
  it("e2e.yml runs the bare test:e2e script, not a narrowed file list", () => {
    const lines = read(".github/workflows/e2e.yml")
      .split("\n")
      .filter((line) => line.includes("apps/marketing test:e2e"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.trim()).toMatch(/^run:\s*pnpm --dir apps\/marketing test:e2e\s*$/);
    }
  });

  it("apps-visual.yml names visual.spec.ts by its full path", () => {
    expect(read(".github/workflows/apps-visual.yml")).toContain(
      "apps/marketing/e2e/visual.spec.ts"
    );
  });
});
