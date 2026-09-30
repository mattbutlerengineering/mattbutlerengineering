/**
 * ui-quality capture for hospitality — one manifest row per planned (public)
 * route (docs/features/ui-quality-loop/architecture.md § Interfaces "Capture
 * spec"). Run only through playwright.ui-quality.config.ts; the `.capture.ts`
 * suffix keeps it out of every other config's default testMatch.
 *
 * The public booking routes are only meaningful with the API mocked — without
 * them they render error states that would file false P1s — so each capture
 * installs `mockApi` and a fixed clock first (the timeline.spec.ts pattern).
 */
import { test } from "@playwright/test";
import {
  appendManifestRow,
  capturePage,
  loadCapturePlan,
  resetManifest,
} from "@mbe/test-fixtures/ui-quality-capture";
import { mockApi } from "./api-mocks.js";
import { localDay } from "./local-day.js";

const plan = loadCapturePlan("hospitality");

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  resetManifest(plan, testInfo.workerIndex);
});

if (plan.entries.length === 0) {
  test("no hospitality routes planned", () => {
    test.skip(true, "UI_QUALITY_PLAN names no hospitality routes");
  });
}

for (const entry of plan.entries) {
  test(`capture ${entry.route}`, async ({ page, baseURL }) => {
    await mockApi(page);
    // Local noon today: the mocks re-date fixtures to the runner's local day,
    // and a fixed instant keeps clocks and "today" labels stable in the pixels.
    await page.clock.setFixedTime(new Date(`${localDay()}T12:00:00`));
    const row = await capturePage(page, entry.route, {
      baseUrl: baseURL ?? "",
      path: entry.path,
      outDir: plan.outDir,
      viewports: entry.viewports,
    });
    await page.unrouteAll({ behavior: "ignoreErrors" });
    appendManifestRow(plan, row);
  });
}
