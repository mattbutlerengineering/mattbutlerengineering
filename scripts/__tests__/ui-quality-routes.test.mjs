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

  it("yields 42 route templates (40 leaf paths + 3 index routes, one of which shares `onboarding`)", () => {
    expect(rows).toHaveLength(42);
    expect(new Set(rows.map((r) => r.route)).size).toBe(42);
  });

  it("reads the closing summary at `night` (#9483)", () => {
    expect(byRoute["night"].kind).toBe("page");
    expect(byRoute["night"].auth).toBe("auth0");
  });

  it("reads the children of `availability`: the hub at its index, booking rules and History over it, today's page at `calendar`, regular hours", () => {
    expect(byRoute["availability"].kind).toBe("page");
    expect(byRoute["availability"].source_files).toEqual([
      "apps/hospitality/src/pages/AvailabilityHubPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    // The drawer route renders the hub with the drawer inside it, so both modules are its source.
    expect(byRoute["availability/booking-rules"].kind).toBe("page");
    expect(byRoute["availability/booking-rules"].source_files).toEqual([
      "apps/hospitality/src/components/availability/BookingRulesRoute.tsx",
      "apps/hospitality/src/pages/AvailabilityHubPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    expect(byRoute["availability/history"].kind).toBe("page");
    expect(byRoute["availability/history"].source_files).toEqual([
      "apps/hospitality/src/components/availability/AvailabilityHistoryRoute.tsx",
      "apps/hospitality/src/pages/AvailabilityHubPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    expect(byRoute["availability/calendar"].kind).toBe("page");
    expect(byRoute["availability/calendar"].source_files).toEqual([
      "apps/hospitality/src/pages/AvailabilityPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    // Regular hours is an editor of its own, behind the Manager guard (availability-hub E4.4).
    expect(byRoute["availability/hours"].kind).toBe("page");
    expect(byRoute["availability/hours"].source_files).toEqual([
      "apps/hospitality/src/components/RequireManager.tsx",
      "apps/hospitality/src/pages/AvailabilityHoursPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    // The Seasonal hours list, behind the same guard (availability-hub E4.5).
    expect(byRoute["availability/seasonal"].kind).toBe("page");
    expect(byRoute["availability/seasonal"].source_files).toEqual([
      "apps/hospitality/src/components/RequireManager.tsx",
      "apps/hospitality/src/pages/AvailabilitySeasonalListPage.tsx",
      "apps/hospitality/src/main.tsx",
    ]);
    // The Seasonal hours editor, `new` (with `?copy=`) and `:scheduleId`, behind the same guard (E4.6).
    for (const route of ["availability/seasonal/new", "availability/seasonal/:scheduleId"]) {
      expect(byRoute[route].kind).toBe("page");
      expect(byRoute[route].source_files).toEqual([
        "apps/hospitality/src/components/RequireManager.tsx",
        "apps/hospitality/src/pages/AvailabilitySeasonalEditorPage.tsx",
        "apps/hospitality/src/main.tsx",
      ]);
    }
    // The Availability map is retired (#10032); the old path redirects to the hub.
    expect(byRoute["availability/map"].kind).toBe("redirect");
  });

  it("marks the two routes outside <App /> public and everything under it auth0", () => {
    expect(byRoute["book/:venueSlug"].auth).toBe("public");
    expect(byRoute["reservations/manage"].auth).toBe("public");
    expect(byRoute["timeline"].auth).toBe("auth0");
    expect(byRoute["/"].auth).toBe("auth0");
    expect(rows.filter((r) => r.auth === "auth0")).toHaveLength(37);
  });

  it("classifies callback as a redirect and * as not-found", () => {
    expect(byRoute["callback"].kind).toBe("redirect");
    expect(byRoute["*"].kind).toBe("not-found");
    expect(byRoute["timeline"].kind).toBe("page");
    // 33 since the Availability map became a redirect (#10032); 34 with Explain this day (#10047), 35 with Terminology (#10031); the floor-plan routes moved under Availability and the old two became redirects, still 35 (#9944 S3).
    expect(rows.filter((r) => r.kind === "page")).toHaveLength(35);
    // /setup/hours moved to the Availability page (#7513); the old path stays as a <Navigate>.
    expect(byRoute["setup/hours"].kind).toBe("redirect");
    // /setup moved to the Availability map (#8864), then the hub (#10032); it stays a redirect.
    expect(byRoute["setup"].kind).toBe("redirect");
  });

  it("names the page module and main.tsx in every row's source_files", () => {
    for (const row of rows) {
      expect(row.source_files.at(-1)).toBe("apps/hospitality/src/main.tsx");
      // A bare <Navigate> has no page module of its own.
      expect(row.source_files.length).toBeGreaterThanOrEqual(row.kind === "redirect" ? 1 : 2);
    }
    // Guest routes sit inside GuestSurface (#8835), a component of the leaf like the page itself.
    expect(byRoute["book/:venueSlug"].source_files).toEqual([
      "apps/hospitality/src/components/GuestSurface.tsx",
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

  it("yields 12 rows: 7 pages, 4 <Navigate> redirects (weekly retired, #8629; index.html, #8980), 1 not-found", () => {
    expect(rows).toHaveLength(12);
    expect(rows.filter((r) => r.kind === "redirect").map((r) => r.route)).toEqual([
      "hospitality/*",
      "index.html",
      "rialto/*",
      "weekly",
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

  it("yields every PAGE_REGISTRY path plus the 18 routeTree leaves (134 today)", () => {
    expect(registryRows).toHaveLength(116);
    expect(rows).toHaveLength(116 + 18);
    expect(new Set(rows.map((r) => r.route)).size).toBe(rows.length);
  });

  it("derives registry paths by the page-registry.ts convention", () => {
    expect(byRoute["components/button"]).toBeDefined();
    expect(byRoute["dashboard"]).toBeUndefined(); // no Dashboard category; demo lives at demos/dashboard
    expect(byRoute["examples/guest-profile"]).toBeDefined(); // example- prefix stripped
    expect(byRoute["examples/invoice"]).toBeDefined(); // no prefix to strip
  });

  it("carries the tree literals, visual-test included, and * as not-found", () => {
    for (const route of [
      "/",
      "privacy",
      "visual-test",
      "demos",
      "demos/login",
      "demos/visual-test",
      "demos/drivers",
      "demos/drivers/:id",
      "demos/drivers/:id/edit",
    ]) {
      expect(byRoute[route], route).toBeDefined();
    }
    expect(byRoute["demos"].kind).toBe("page"); // index route (DemosIndexPage) is a routed page, not a redirect
    expect(byRoute["*"].kind).toBe("not-found");
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
    expect(rows).toHaveLength(42 + 12 + 134);
    const keys = rows.map((r) => `${r.app}\u0000${r.route}`);
    expect(keys).toEqual([...keys].sort());
    expect([...new Set(rows.map((r) => r.app))]).toEqual([
      "hospitality",
      "marketing",
      "rialto-web",
    ]);
  });
});
