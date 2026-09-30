/**
 * Visual regression floor for hospitality
 * (docs/features/ui-quality-loop/architecture.md § Components "VR floor").
 *
 * One full-page screenshot per (ledger `page` row × viewport), public and
 * `auth0` rows alike — the `setup` project's stored Auth0 session covers the
 * gated ones. The route set is read from `metrics/ui-quality-ledger.jsonl` at
 * test time — data, not an import — so a route added to the app fails here
 * with a missing snapshot instead of going silently uncovered. Parameterised
 * routes resolve through `scripts/ui-quality/route-fixtures.json`.
 *
 * Every page runs against `mockedPage` (api-mocks.ts) under a fixed clock. The
 * instant is a constant, not `localDay()`: a baseline that renders "today"
 * would change every day it is compared, so a stable empty day beats a
 * populated one that drifts.
 *
 * Baselines live in e2e/screenshots/ and are Linux-only: committed from the
 * noise-floor workflow's `visual-actuals-replica-a` artifact, never from macOS.
 * Run only through playwright.visual.config.ts.
 */
import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.js";

const APP = "hospitality";

const REPO_ROOT = new URL("../../../", import.meta.url);
const LEDGER = new URL("metrics/ui-quality-ledger.jsonl", REPO_ROOT);
const FIXTURES = new URL("scripts/ui-quality/route-fixtures.json", REPO_ROOT);

/** The ui-quality VIEWPORTS (scripts/ui-quality/config.mjs). */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
] as const;

const FIXED_NOW = new Date("2026-06-15T12:00:00");

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

/**
 * The ledger's path rule (scripts/ui-quality/ledger-audit.mjs `resolvePath`),
 * made relative so it resolves under the `/hospitality/` baseURL.
 */
function pathOf(route: string): string | null {
  const path =
    route.includes(":") || route.includes("*")
      ? (fixtures[APP]?.[route] ?? null)
      : route === "/"
        ? "/"
        : `/${route}`;
  return path === null ? null : path.replace(/^\//, "");
}

const slug = (route: string) => (route === "/" ? "home" : route.replace(/\W+/g, "_"));

for (const { route } of pages) {
  for (const { width, height } of VIEWPORTS) {
    test(`${route} @ ${width}x${height}`, async ({ mockedPage: page }) => {
      const path = pathOf(route);
      expect(path, `${route} has no fixture in route-fixtures.json`).not.toBeNull();
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto(path ?? "");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${slug(route)}@${width}x${height}.png`, {
        fullPage: true,
        timeout: 15_000,
      });
    });
  }
}
