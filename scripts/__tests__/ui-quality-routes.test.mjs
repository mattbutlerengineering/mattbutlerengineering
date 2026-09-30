import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepoIo, extractApp, renderRoutes, main } from "../ui-quality/routes.mjs";
import {
  AUDIT_TTL_DAYS,
  MAX_ROUTES_PER_FIRE,
  MAX_P2_ISSUES_PER_FIRE,
  P1_BURST_AGGREGATE_AT,
  TASTE_SAMPLE_ROUTES,
  TASTE_REFERENCES_PER_ROUTE,
  VIEWPORTS,
} from "../ui-quality/config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const io = createRepoIo(ROOT);

/** Capture what a `main()` call prints, without forking a process. */
function runMain(argv, deps) {
  const out = [];
  const err = [];
  const code = main(argv, {
    ...deps,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  });
  return { code, out: out.join(""), err: err.join("") };
}

describe("config.mjs", () => {
  it("declares the architecture's constants", () => {
    expect(AUDIT_TTL_DAYS).toBe(28);
    expect(MAX_ROUTES_PER_FIRE).toBe(40);
    expect(MAX_P2_ISSUES_PER_FIRE).toBe(3);
    expect(P1_BURST_AGGREGATE_AT).toBe(5);
    expect(TASTE_SAMPLE_ROUTES).toBe(3);
    expect(TASTE_REFERENCES_PER_ROUTE).toBe(2);
    expect(VIEWPORTS).toEqual([
      { width: 1280, height: 720 },
      { width: 375, height: 812 },
    ]);
  });
});

describe("hospitality adapter", () => {
  const rows = extractApp("hospitality", io);
  const byRoute = Object.fromEntries(rows.map((r) => [r.route, r]));

  it("yields 21 route templates (20 leaf paths + 2 index routes, one of which shares `onboarding`)", () => {
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r) => r.route)).size).toBe(21);
  });

  it("marks the two routes outside <App /> public and everything under it auth0", () => {
    expect(byRoute["book/:venueSlug"].auth).toBe("public");
    expect(byRoute["reservations/manage"].auth).toBe("public");
    expect(byRoute["timeline"].auth).toBe("auth0");
    expect(byRoute["/"].auth).toBe("auth0");
    expect(rows.filter((r) => r.auth === "auth0")).toHaveLength(19);
  });

  it("classifies callback as a redirect and * as not-found", () => {
    expect(byRoute["callback"].kind).toBe("redirect");
    expect(byRoute["*"].kind).toBe("not-found");
    expect(byRoute["timeline"].kind).toBe("page");
    expect(rows.filter((r) => r.kind === "page")).toHaveLength(19);
  });

  it("names the page module and main.tsx in every row's source_files", () => {
    for (const row of rows) {
      expect(row.source_files.at(-1)).toBe("apps/hospitality/src/main.tsx");
      expect(row.source_files.length).toBeGreaterThanOrEqual(2);
    }
    expect(byRoute["book/:venueSlug"].source_files).toEqual([
      "apps/hospitality/src/pages/PublicBookingPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    expect(byRoute["onboarding"].source_files).toEqual([
      "apps/hospitality/src/pages/VenueOnboardingPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    expect(byRoute["callback"].source_files).toEqual([
      "apps/hospitality/src/App.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
  });

  it("emits rows in the RouteTemplate shape, sorted by route", () => {
    expect(Object.keys(rows[0])).toEqual(["route", "app", "kind", "auth", "source_files"]);
    const routes = rows.map((r) => r.route);
    expect(routes).toEqual([...routes].sort());
  });

  it("is byte-identical across two runs on the same commit", () => {
    const a = runMain(["hospitality"], io);
    const b = runMain(["hospitality"], io);
    expect(a.code).toBe(0);
    expect(a.out).toBe(b.out);
    expect(a.out).toBe(renderRoutes(rows));
  });

  it("exits 2 when the router yields zero routes — a refactor must break loudly", () => {
    const empty = { ...io, readFile: () => "export const nothing = 1;\n" };
    const result = runMain(["hospitality"], empty);
    expect(result.code).toBe(2);
    expect(result.out).toBe("");
    expect(result.err).toMatch(/zero routes/);
  });
});

describe("marketing adapter", () => {
  const rows = extractApp("marketing", io);
  const byRoute = Object.fromEntries(rows.map((r) => [r.route, r]));

  it("yields 9 rows: 6 pages, 2 <Navigate> redirects, 1 not-found", () => {
    expect(rows).toHaveLength(9);
    expect(rows.filter((r) => r.kind === "redirect").map((r) => r.route)).toEqual([
      "hospitality/*",
      "rialto/*",
    ]);
    expect(rows.filter((r) => r.kind === "not-found").map((r) => r.route)).toEqual(["*"]);
    expect(rows.every((r) => r.auth === "public")).toBe(true);
  });

  it("names the page module and App.tsx in source_files", () => {
    expect(byRoute["/"].source_files).toEqual([
      "apps/marketing/src/pages/HomePage.tsx",
      "apps/marketing/src/App.tsx",
    ]);
    expect(byRoute["status"].source_files).toEqual([
      "apps/marketing/src/pages/StatusPage.tsx",
      "apps/marketing/src/App.tsx",
    ]);
    expect(byRoute["rialto/*"].source_files).toEqual(["apps/marketing/src/App.tsx"]);
  });
});

describe("rialto-web adapter", () => {
  const rows = extractApp("rialto-web", io);
  const byRoute = Object.fromEntries(rows.map((r) => [r.route, r]));
  const registryRows = rows.filter((r) => /^(components|examples)\/|^dashboard$/.test(r.route));

  it("yields every PAGE_REGISTRY path plus the 17 routeTree leaves (124 today)", () => {
    expect(registryRows).toHaveLength(107);
    expect(rows).toHaveLength(107 + 17);
    expect(new Set(rows.map((r) => r.route)).size).toBe(rows.length);
  });

  it("derives registry paths by the page-registry.ts convention", () => {
    expect(byRoute["components/button"]).toBeDefined();
    expect(byRoute["dashboard"]).toBeDefined(); // category Dashboard
    expect(byRoute["examples/guest-profile"]).toBeDefined(); // example- prefix stripped
    expect(byRoute["examples/invoice"]).toBeDefined(); // no prefix to strip
  });

  it("carries the tree literals, visual-test included, and * as a redirect", () => {
    for (const route of [
      "/",
      "privacy",
      "visual-test",
      "demos/login",
      "demos/visual-test",
      "demos/drivers",
      "demos/drivers/:id",
      "demos/drivers/:id/edit",
    ]) {
      expect(byRoute[route], route).toBeDefined();
    }
    expect(byRoute["demos"]).toBeUndefined(); // a layout with no index is not a row
    expect(byRoute["*"].kind).toBe("redirect");
    expect(rows.filter((r) => r.kind === "page")).toHaveLength(rows.length - 1);
    expect(rows.every((r) => r.auth === "public")).toBe(true);
  });

  it("resolves each registry row's page module (convention or explicit load)", () => {
    expect(byRoute["components/button"].source_files).toEqual([
      "apps/rialto-web/src/pages/forms/ButtonPage.tsx",
      "apps/rialto-web/src/routes.tsx",
      "apps/rialto-web/src/data/page-registry.ts",
    ]);
    expect(byRoute["examples/guest-profile"].source_files[0]).toBe(
      "apps/rialto-web/src/pages/examples/GuestDetailExamplePage.tsx"
    );
    expect(byRoute["demos/drivers/:id"].source_files).toEqual([
      "apps/rialto-web/src/pages/drivers/DriverRead.tsx",
      "apps/rialto-web/src/routes.tsx",
    ]);
    for (const row of registryRows) expect(row.source_files).toHaveLength(3);
  });
});

describe("routes.mjs all", () => {
  it("emits every app sorted by (app, route), byte-identical across two processes", () => {
    const script = resolve(ROOT, "scripts/ui-quality/routes.mjs");
    const a = execFileSync(process.execPath, [script, "all"], { encoding: "utf8" });
    const b = execFileSync(process.execPath, [script, "all"], { encoding: "utf8" });
    expect(a).toBe(b);
    const rows = a
      .trimEnd()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(21 + 9 + 124);
    const keys = rows.map((r) => `${r.app}\u0000${r.route}`);
    expect(keys).toEqual([...keys].sort());
    expect([...new Set(rows.map((r) => r.app))]).toEqual([
      "hospitality",
      "marketing",
      "rialto-web",
    ]);
  });
});
