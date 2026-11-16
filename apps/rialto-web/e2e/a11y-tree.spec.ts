import { test, expect } from "@playwright/test";

/**
 * Accessibility-tree guards for the telemetry demo (#8883).
 *
 * axe, unit tests, typecheck and lint all missed two majors that only showed
 * in the tree of the running page: the status strip announcing its feed state
 * twice, and meters reporting a definite `aria-valuenow="0"` with no data.
 * These specs pin both so a regression fails the rialto-web functional e2e job.
 */

test.describe("a11y tree: telemetry demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("status strip announces the feed status exactly once", async ({ page }) => {
    // Relative navigation keeps the /rialto/ base from playwright.config.ts.
    await page.goto("demos/telemetry?frozen=1");
    const strip = page.getByRole("region", { name: "Session status" });
    await expect(strip).toBeVisible();

    // A labelled StatusLED beside the visible text would add an `img "LIVE"`
    // node and a second "LIVE" to the tree. Partial template: numbers vary.
    await expect(strip).toMatchAriaSnapshot(`
      - region "Session status":
        - text: /LIVE LAP .*/
        - meter "SYS"
    `);

    // Belt and braces: no image-role node repeats the status word.
    await expect(strip.getByRole("img", { name: "LIVE" })).toHaveCount(0);
    await expect(strip.getByText("LIVE", { exact: true })).toHaveCount(1);
  });

  test("every meter has a name and names are unique within a region", async ({ page }) => {
    await page.goto("demos/telemetry?frozen=1");
    const meters = page.getByRole("meter");
    await expect(meters.first()).toBeVisible();

    const regions = page.getByRole("region");
    const regionCount = await regions.count();
    expect(regionCount).toBeGreaterThan(0);

    let totalMeters = 0;
    for (let i = 0; i < regionCount; i++) {
      const regionMeters = regions.nth(i).getByRole("meter");
      const names: string[] = [];
      for (let j = 0; j < (await regionMeters.count()); j++) {
        const name = await regionMeters.nth(j).evaluate((el) => {
          const labelledBy = el.getAttribute("aria-labelledby");
          const byId = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? "")
                .join(" ")
            : "";
          return (el.getAttribute("aria-label") ?? byId).trim();
        });
        expect(name, `meter ${j} in region ${i} has no accessible name`).not.toBe("");
        names.push(name);
      }
      expect(new Set(names).size, `duplicate meter names in region ${i}: ${names.join(", ")}`).toBe(
        names.length
      );
      totalMeters += names.length;
    }
    expect(totalMeters).toBeGreaterThan(0);
  });

  test("no-data meters expose no definite aria-valuenow of 0", async ({ page }) => {
    await page.goto("demos/telemetry?feed=empty");
    await expect(page.getByRole("region", { name: "Session status" })).toBeVisible();

    // Meter renders no-data as role="progressbar" with no aria-valuenow
    // (indeterminate, #4332/#4347) — never a meter reading a definite 0.
    const indeterminate = page.getByRole("progressbar");
    expect(await indeterminate.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await indeterminate.count()); i++) {
      await expect(indeterminate.nth(i)).not.toHaveAttribute("aria-valuenow", /.*/);
    }
    const meters = page.getByRole("meter");
    for (let i = 0; i < (await meters.count()); i++) {
      await expect(meters.nth(i)).not.toHaveAttribute("aria-valuenow", "0");
    }
  });
});
