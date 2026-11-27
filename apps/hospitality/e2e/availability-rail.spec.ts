import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";

/**
 * The Availability rail (#9944): every Availability screen as one tree beside the open one, so a
 * Manager sees how the rules and the floor plans relate while editing any of them, and reaches any
 * screen in one click. The demo venue is `mockApi`'s.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

const rail = (page: Page) => page.getByRole("navigation", { name: "Availability sections" });

test.describe("Availability rail", () => {
  test("lists the rules, the floor plans and the views, and opens each where it is edited", async ({
    mockedPage: page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("availability");
    const nav = rail(page);
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    for (const name of [
      "Regular hours",
      "Seasonal hours",
      "Special dates",
      "Closures and pauses",
      "Booking rules",
      "Calendar",
      "History",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByText("Where guests sit")).toBeVisible();

    await nav.getByRole("link", { name: "Closures and pauses" }).click();
    await expect(page).toHaveURL(/\/availability\/closures$/);
    await expect(nav.getByRole("link", { name: "Closures and pauses" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await page.screenshot({ path: "test-results/availability-rail-desktop.png", fullPage: false });
    expect(
      (await new AxeBuilder({ page }).include("nav[aria-label='Availability sections']").analyze())
        .violations
    ).toEqual([]);
  });

  test("folds behind Jump to on a phone, and closes on a pick", async ({ mockedPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("availability");
    const toggle = rail(page).getByRole("button", { name: "Jump to" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(rail(page).getByRole("link", { name: "History" })).toBeHidden();
    await toggle.click();
    await page.screenshot({ path: "test-results/availability-rail-phone.png", fullPage: false });
    await rail(page).getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/availability\/history$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
