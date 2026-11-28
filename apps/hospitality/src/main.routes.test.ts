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

describe("the retired Availability map route (#10032)", () => {
  it("keeps map under availability as a replace redirect to the hub, so old links never 404", () => {
    const availability = mainTsxSource.match(/path:\s*"availability",[\s\S]*?\n {14}\],/);
    expect(availability?.[0]).toMatch(
      /path:\s*"map",\s*element:\s*<Navigate to=\{availabilityPath\(\{ view: "hub" \}\)\} replace \/>/
    );
  });

  it("no longer imports the map page", () => {
    expect(mainTsxSource).not.toMatch(/AvailabilityMapPage/);
  });

  it("mounts /setup as a redirect, not as a page", () => {
    expect(mainTsxSource).toMatch(/path:\s*"setup",\s*element:\s*<SetupRedirect \/>/);
  });
});

describe("the How availability works guide route (#10034)", () => {
  it("mounts help/availability inside the signed-in layout, lazily", () => {
    expect(mainTsxSource).toMatch(
      /path:\s*"help\/availability",[\s\S]{0,200}AvailabilityGuidePage/
    );
    expect(mainTsxSource).toMatch(/import\("\.\/pages\/AvailabilityGuidePage\.js"\)/);
  });

  it("keeps the guide path out of the /availability tree a peer owns", () => {
    expect(mainTsxSource).not.toMatch(/path:\s*"availability\/guide"/);
  });
});

describe("hospitality router basename (#7709)", () => {
  it("derives the basename from the serving host rather than a literal /hospitality", () => {
    expect(mainTsxSource).not.toMatch(/basename:\s*"\/hospitality"/);
    expect(mainTsxSource).toMatch(/basename:\s*HOST\.basename/);
  });

  it("rewrites legacy /hospitality/* URLs before the router reads the location", () => {
    const rewrite = mainTsxSource.indexOf("legacyPathRedirect(");
    const router = mainTsxSource.indexOf("createBrowserRouter(");
    expect(rewrite).toBeGreaterThan(-1);
    expect(rewrite).toBeLessThan(router);
  });
});
