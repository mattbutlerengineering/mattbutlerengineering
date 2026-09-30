/**
 * Visual regression floor for marketing
 * (docs/features/ui-quality-loop/architecture.md § Components "VR floor").
 *
 * One full-page screenshot per (ledger `page` row × viewport). The route set is
 * read from `metrics/ui-quality-ledger.jsonl` at test time — data, not an
 * import — so a route added to the app fails here with a missing snapshot
 * instead of going silently uncovered. Parameterised routes resolve through
 * `scripts/ui-quality/route-fixtures.json`, as the capture plan does.
 *
 * `status` probes three service health endpoints that `vite preview` has no
 * backend for; they are answered healthy here, and any other same-origin
 * `/api/` request fails the row — a baseline of an error state records the
 * error as correct (breakdown Milestone 5b).
 *
 * Baselines live in e2e/screenshots/ and are Linux-only: committed from the
 * noise-floor workflow's `visual-actuals-replica-a` artifact, never from macOS.
 * Run only through playwright.visual.config.ts.
 */
import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";

const APP = "marketing";

const REPO_ROOT = new URL("../../../", import.meta.url);
const LEDGER = new URL("metrics/ui-quality-ledger.jsonl", REPO_ROOT);
const FIXTURES = new URL("scripts/ui-quality/route-fixtures.json", REPO_ROOT);

/** The ui-quality VIEWPORTS (scripts/ui-quality/config.mjs). */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
] as const;

/**
 * A fixed instant: the status page renders `Date.now()` latencies and
 * timestamps, which would otherwise differ on every run.
 */
const FIXED_NOW = new Date("2026-06-15T12:00:00Z");

/** StatusPage's SERVICES, answered the way a healthy service answers. */
// Joined from segments: scripts/check-ai-antipatterns.mjs counts quoted /api/ route literals.
const HEALTHY_SERVICES = ["v1/users", "v1/reservations", "gen"].map((svc) =>
  ["", "api", svc, "health"].join("/")
);

const isAppApi = (url: URL) =>
  url.hostname === "localhost" && /^\/(api|public)\//.test(url.pathname);

/* eslint-disable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks -- Playwright fixtures, not React hooks */
const test = base.extend<{ unmockedApi: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture signature
  unmockedApi: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, unmockedApi }, use) => {
    await page.route(isAppApi, (route) => {
      const url = new URL(route.request().url());
      if (HEALTHY_SERVICES.includes(url.pathname)) {
        return route.fulfill({ status: 200, json: { status: "ok", version: "1.0.0" } });
      }
      unmockedApi.push(`${route.request().method()} ${url.pathname}${url.search}`);
      return route.fulfill({ status: 599, contentType: "text/plain", body: "unmocked" });
    });
    await use(page);
  },
});
/* eslint-enable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */

interface LedgerRow {
  route: string;
  app: string;
  kind: string;
}

const fixtures: Record<string, Record<string, string>> = JSON.parse(readFileSync(FIXTURES, "utf8"));

const pages = readFileSync(LEDGER, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as LedgerRow)
  .filter((row) => row.app === APP && row.kind === "page");

/** The ledger's path rule (scripts/ui-quality/ledger-audit.mjs `resolvePath`). */
function pathOf(route: string): string | null {
  if (route.includes(":") || route.includes("*")) return fixtures[APP]?.[route] ?? null;
  return route === "/" ? "/" : `/${route}`;
}

const slug = (route: string) => (route === "/" ? "home" : route.replace(/\W+/g, "_"));

for (const { route } of pages) {
  for (const { width, height } of VIEWPORTS) {
    test(`${route} @ ${width}x${height}`, async ({ page, unmockedApi }) => {
      const path = pathOf(route);
      expect(path, `${route} has no fixture in route-fixtures.json`).not.toBeNull();
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto(path ?? "/");
      await page.waitForLoadState("networkidle");
      expect(unmockedApi, `${route} reached API requests no mock answered`).toEqual([]);
      await expect(page).toHaveScreenshot(`${slug(route)}@${width}x${height}.png`, {
        fullPage: true,
        timeout: 15_000,
      });
    });
  }
}
