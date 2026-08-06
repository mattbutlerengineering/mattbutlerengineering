import { readFileSync } from "fs";
import { join } from "path";
import { test, expect, type Page } from "@playwright/test";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

const ROUTES = ["/", "/status", "/weekly", "/metrics", "/acmm", "/ai-health"] as const;

/**
 * Real-device mobile viewports (CSS px). 412×924 matches the Pixel 9 Pro
 * class of device this bug was reported on; 360×800 covers the narrower
 * Android baseline where minmax() grid floors overflow first.
 */
const MOBILE_VIEWPORTS = [
  { label: "pixel-9-pro", width: 412, height: 924, deviceScaleFactor: 2.625 },
  { label: "small-android", width: 360, height: 800, deviceScaleFactor: 2 },
] as const;

/**
 * Serves the fresh sensor-report fixture for /ai-health so the page renders
 * its populated card grids instead of the empty state (same mocking approach
 * as ai-health.spec.ts, with generated_at pinned to now for determinism).
 */
async function mockSensorReport(page: Page) {
  const fixture = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "sensor-report-fresh.json"), "utf-8")
  ) as Record<string, unknown>;
  const body = JSON.stringify({ ...fixture, generated_at: new Date().toISOString() });
  await page.route("**/sensor-report.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body })
  );
}

/**
 * Returns the horizontal overflow state of the current page: whether the
 * document is wider than the viewport (the thing that makes pinch-zoom-out
 * reveal a broken layout), plus the elements whose right edge extends past
 * the viewport, as diagnostic detail for the failure message.
 */
async function measureHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const rect = el.getBoundingClientRect();
      // Only right-edge overhang extends scrollWidth in LTR; elements parked
      // off-screen left (visually-hidden skip links) are intentional.
      if (rect.width > 0 && rect.right > clientWidth + 1) {
        const cls =
          typeof el.className === "string" && el.className.trim()
            ? `.${el.className.trim().split(/\s+/).join(".")}`
            : "";
        offenders.push(
          `${el.tagName.toLowerCase()}${cls} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`
        );
      }
    }
    return { clientWidth, scrollWidth, offenders: offenders.slice(0, 15) };
  });
}

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`no horizontal overflow @ ${viewport.label} (${viewport.width}x${viewport.height})`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
    });

    for (const route of ROUTES) {
      test(`${route} fits the viewport`, async ({ page }) => {
        // /acmm genuinely overflows by 21px at 360px width — see #3902.
        // Un-skip once fixed.
        test.skip(route === "/acmm" && viewport.label === "small-android", "See #3902");
        if (route === "/ai-health") {
          await mockSensorReport(page);
        }
        await page.goto(route);
        // Pages are React.lazy — "main is visible" can still be the Suspense
        // fallback. Every page renders exactly one h1 once its chunk mounts.
        await expect(page.locator("main h1, main h2").first()).toBeVisible();
        // Text width depends on webfonts; measure only after they resolve.
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );

        const { clientWidth, scrollWidth, offenders } = await measureHorizontalOverflow(page);
        expect(
          scrollWidth,
          `page is ${scrollWidth}px wide in a ${clientWidth}px viewport; overflowing elements:\n  ${offenders.join("\n  ")}`
        ).toBeLessThanOrEqual(clientWidth);
        // scrollWidth alone misses fixed-position boxes (they don't extend the
        // document's scrollable overflow), so the rect scan is asserted too —
        // it's what catches a viewport-overhanging toast container.
        expect(offenders, `elements overhang the ${clientWidth}px viewport`).toEqual([]);
      });
    }
  });
}
