import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sections } from "./sections.js";
import { SIDENAV_CONTRACT } from "./types.js";

/**
 * ux.md: "every link matches a route", as a remote test. The router lives in hospitality's
 * `main.tsx`; its route `path:` literals are the manifest this test reads. A nav item whose
 * route is missing would land on the not-found page.
 */
const MAIN_TSX = join(process.cwd(), "../../apps/hospitality/src/main.tsx");
const source = readFileSync(MAIN_TSX, "utf-8");
const routeSegments = new Set(
  [...source.matchAll(/path:\s*"([^"*]+)"/g)].map((m) => m[1] as string)
);

const noop = (): void => undefined;
const allSections = [
  ...sections({
    contract: SIDENAV_CONTRACT,
    pathname: "/",
    locale: "en-US",
    direction: "ltr",
    flags: { isAdmin: true },
    readiness: { status: "operational", steps: [] },
    isMobileOpen: false,
    onAction: noop,
    onMobileClose: noop,
  }),
  ...sections({
    contract: SIDENAV_CONTRACT,
    pathname: "/",
    locale: "en-US",
    direction: "ltr",
    flags: { isAdmin: true },
    readiness: { status: "setup", steps: [] },
    isMobileOpen: false,
    onAction: noop,
    onMobileClose: noop,
  }),
];
const routePaths = [
  ...new Set(
    allSections.flatMap((s) =>
      s.items.flatMap((i) => (i.action.type === "route" ? [i.action.path] : []))
    )
  ),
];

describe("every route item matches a hospitality route", () => {
  it("found the router's route table", () => {
    expect(routeSegments.has("timeline")).toBe(true);
    expect(routePaths.length).toBeGreaterThan(8);
  });

  it.each(routePaths)("%s is routed by hospitality", (path) => {
    expect(path.startsWith("/")).toBe(true);
    const segments = path.slice(1).split("/");
    // Top-level route (`timeline`, `menus`), or a nested one named by its last segment
    // under a routed parent (`availability` > `map`).
    expect(routeSegments.has(segments[0] as string)).toBe(true);
    if (segments.length > 1) {
      expect(routeSegments.has(segments.slice(1).join("/"))).toBe(true);
    }
  });
});
