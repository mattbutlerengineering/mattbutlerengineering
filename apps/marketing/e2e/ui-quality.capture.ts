/**
 * ui-quality capture for marketing — one manifest row per planned route
 * (docs/features/ui-quality-loop/architecture.md § Interfaces "Capture spec").
 * Run only through playwright.ui-quality.config.ts; the `.capture.ts` suffix
 * keeps it out of every other config's default testMatch.
 */
import { test } from "@playwright/test";
import {
  appendManifestRow,
  capturePage,
  loadCapturePlan,
  resetManifest,
} from "@mbe/ui-quality-capture";
import { statusProbeFixture } from "../src/data/status-probes.js";

const plan = loadCapturePlan("marketing");

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  resetManifest(plan, testInfo.workerIndex);
});

if (plan.entries.length === 0) {
  test("no marketing routes planned", () => {
    test.skip(true, "UI_QUALITY_PLAN names no marketing routes");
  });
}

for (const entry of plan.entries) {
  test(`capture ${entry.route}`, async ({ page, baseURL }) => {
    // /status probes same-origin health endpoints the preview server has no
    // backend for; answer them so the capture judges the page, not the absence.
    await page.route(
      (url) =>
        statusProbeFixture(url.pathname, "GET") !== undefined ||
        statusProbeFixture(url.pathname, "HEAD") !== undefined,
      (route) => {
        const req = route.request();
        const fixture = statusProbeFixture(new URL(req.url()).pathname, req.method());
        return fixture ? route.fulfill(fixture) : route.fallback();
      }
    );
    const row = await capturePage(page, entry.route, {
      baseUrl: baseURL ?? "",
      path: entry.path,
      outDir: plan.outDir,
      viewports: entry.viewports,
    });
    appendManifestRow(plan, row);
  });
}
