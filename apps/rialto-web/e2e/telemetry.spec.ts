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

test.describe("response latency", () => {
  /**
   * The PRD's headline criterion — "a visible state change within 100 ms" — is
   * a property of the resolved CSS, not of any one interaction, so it is
   * measured across every element the HUD renders rather than by driving one
   * control. Two things can break it: a `transition-delay`, which defers the
   * change outright, and a duration over budget. Both are read from computed
   * style, so a literal that skipped tokenization is caught the same as a
   * mis-set token — that is how this test found `SegmentedControl`'s
   * hardcoded 150ms, which no vibe could retime.
   */
  test("no element on the route defers or overruns the 100ms budget", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    const worst = await page.evaluate(() => {
      const ms = (value: string) =>
        value
          .split(",")
          .map((part) => (part.trim().endsWith("ms") ? parseFloat(part) : parseFloat(part) * 1000))
          .filter((n) => !Number.isNaN(n));

      const delays: number[] = [];
      const durations: number[] = [];
      for (const el of Array.from(document.querySelectorAll("[data-feed-state] *"))) {
        const style = getComputedStyle(el);
        delays.push(...ms(style.transitionDelay));
        durations.push(...ms(style.transitionDuration));
      }
      return { maxDelay: Math.max(0, ...delays), maxDuration: Math.max(0, ...durations) };
    });

    expect(worst.maxDelay).toBe(0);
    expect(worst.maxDuration).toBeLessThanOrEqual(100);
  });
});

test.describe("announcements", () => {
  /**
   * The status is carried by visible text, so the LED beside it is decoration.
   * A `StatusLED` given a `label` takes `role="img"` with that label as its
   * accessible name, which puts the same word in the tree twice — a screen
   * reader reads "LIVE LIVE", and in the stale state "STALE, STALE captured
   * 00:00". axe cannot catch it: both nodes are individually valid.
   */
  test("announces the feed status once, not twice", async ({ page }) => {
    await page.goto("demos/telemetry?feed=stale");
    await page.waitForLoadState("networkidle");

    const strip = page.getByRole("region", { name: "Session status" });

    await expect(strip.getByText(/STALE/)).toHaveCount(1);
    await expect(strip.getByRole("img")).toHaveCount(0);
  });
});
