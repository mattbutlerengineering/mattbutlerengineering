/**
 * Telemetry HUD — reduced motion and keyboard reachability.
 *
 * The PRD's reduced-motion criterion is deliberately not "animations are off".
 * A vibe that answers `prefers-reduced-motion` by deleting things fails the
 * user twice: once by removing the feedback, and again by making state
 * reachable only to people who can watch it move. These tests assert the
 * designed presentation — same regions, same values, zero duration — rather
 * than the absence of animation.
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "demos/telemetry?frozen=1";

const REGIONS = ["Session status", "Zones", "Vitals", "Event feed"];

async function zoneRows(page: Page): Promise<string[]> {
  return page.getByRole("region", { name: "Zones" }).getByRole("row").allInnerTexts();
}

test.describe("reduced motion", () => {
  test("renders the same regions and the same values", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");
    const fullMotionRows = await zoneRows(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    for (const region of REGIONS) {
      await expect(
        page.getByRole("region", { name: region }).or(page.getByLabel(region))
      ).toBeVisible();
    }
    // The frozen feed is deterministic, so identical values are a real
    // assertion: nothing is dropped, rounded, or re-derived under reduced motion.
    expect(await zoneRows(page)).toEqual(fullMotionRows);
  });

  test("collapses the duration scale to zero without removing anything", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    const durations = await page.evaluate(() => {
      const hud = document.querySelector("[data-feed-state]");
      if (!hud) return null;
      const style = getComputedStyle(hud);
      return {
        fast: style.getPropertyValue("--rialto-duration-fast").trim(),
        standard: style.getPropertyValue("--rialto-duration-standard").trim(),
        slow: style.getPropertyValue("--rialto-duration-slow").trim(),
      };
    });

    expect(durations).toEqual({ fast: "0s", standard: "0s", slow: "0s" });

    // Every event is still readable as text — the ticker is not the only way
    // to reach the feed, and a stopped ticker is not an empty one.
    const ticker = page.getByRole("region", { name: "Event feed" });
    await expect(ticker).not.toBeEmpty();
  });

  test("keeps the current-zone marker legible without motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    // The active zone is announced, not merely pulsed — a pulse alone would
    // be a state reachable only through motion.
    await expect(page.getByLabel(/is the current zone/)).toBeAttached();
  });
});

test.describe("keyboard", () => {
  test("reaches the vibe switch in reading order", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    // SegmentedControl spreads `aria-label` onto its wrapper, not onto the
    // element carrying `role="radiogroup"`, so the group itself has no
    // accessible name to assert on — see breakdown Notes, 2026-08-15.
    await expect(page.getByRole("radio", { name: "Game" })).toBeVisible();

    await page.getByRole("radio", { name: "Game" }).focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("radio", { name: "Default" })).toBeFocused();
  });

  test("offers reconnect as a real control when the feed is stale", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("demos/telemetry?feed=stale");
    await page.waitForLoadState("networkidle");

    const reconnect = page.getByRole("button", { name: /reconnect/i });
    await expect(reconnect).toBeVisible();

    await reconnect.press("Enter");

    await expect(page.locator('[data-feed-state="stale"]')).toHaveCount(0);
  });
});
