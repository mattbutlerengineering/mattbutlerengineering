import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `main.tsx` bootstraps the app (calls `createRoot(...).render(...)` at module
 * scope), so it can't be imported directly in a test without a real `#root`
 * element and a full auth/router bootstrap. Instead this asserts on the
 * router source directly: a mistyped deep link under the catch-all route
 * (`path: "*"`) must render the 404 page, not silently redirect to
 * `/timeline` (issue #4972 — NO-DEAD-END).
 */
const mainTsxPath = join(process.cwd(), "src/main.tsx");
const mainTsxSource = readFileSync(mainTsxPath, "utf-8");

describe("hospitality catch-all route", () => {
  it("does not silently redirect unknown paths to /timeline", () => {
    expect(mainTsxSource).not.toMatch(/path:\s*"\*"[\s\S]{0,80}Navigate to="\/timeline"/);
  });

  it("renders NotFoundPage for the catch-all path", () => {
    const catchAllMatch = mainTsxSource.match(/path:\s*"\*",[\s\S]{0,200}/);
    expect(catchAllMatch).not.toBeNull();
    expect(catchAllMatch?.[0]).toContain("NotFoundPage");
  });

  it("lazily imports NotFoundPage", () => {
    expect(mainTsxSource).toMatch(/import\("\.\/pages\/NotFoundPage\.js"\)/);
  });
});

describe("hospitality rehearsal route", () => {
  it("lazily imports RehearsalPage", () => {
    expect(mainTsxSource).toMatch(/import\("\.\/pages\/RehearsalPage\.js"\)/);
  });

  it("registers /rehearsal inside DashboardLayout, before the catch-all", () => {
    const layoutAt = mainTsxSource.indexOf("<DashboardLayout />");
    const routeAt = mainTsxSource.search(/path:\s*"rehearsal"/);
    const catchAllAt = mainTsxSource.search(/path:\s*"\*"/);
    expect(layoutAt).toBeGreaterThan(-1);
    expect(routeAt).toBeGreaterThan(layoutAt);
    expect(routeAt).toBeLessThan(catchAllAt);
  });
});
