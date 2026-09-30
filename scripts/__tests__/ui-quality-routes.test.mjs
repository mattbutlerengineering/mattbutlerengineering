import { describe, it, expect } from "vitest";
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
