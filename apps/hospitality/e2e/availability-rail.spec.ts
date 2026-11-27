import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";

/**
 * The Availability rail (#9944): every Availability screen as one tree, nested under the sidebar's
 * Availability item beside the open page, so a Manager sees how the rules and the floor plans
 * relate while editing any of them, and reaches any screen in one click. The demo venue is `mockApi`'s.
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

  test("comes with the sidebar's drawer on a phone, which closes on a pick", async ({
    mockedPage: page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto("availability");
    // The page keeps its whole width: the rail is in the sidebar, not above the page.
    await expect(rail(page).getByRole("link", { name: "History" })).not.toBeInViewport();
    const toggle = page.getByRole("button", { name: "Open sidebar" });
    await toggle.click();
    // The drawer scrolls: the rail's first line shows on opening, its last one once scrolled to.
    await expect(rail(page).getByRole("link", { name: "Overview" })).toBeInViewport();
    const history = rail(page).getByRole("link", { name: "History" });
    await history.scrollIntoViewIfNeeded();
    await expect(history).toBeInViewport();
    await history.click();
    await expect(page).toHaveURL(/\/availability\/history$/);
    await expect(page.getByRole("button", { name: "Open sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("sits under the sidebar's Availability item, so the tree reads as part of it", async ({
    mockedPage: page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("availability");
    const item = page.getByRole("listitem").filter({ has: rail(page) });
    await expect(item.getByRole("button", { name: "Availability", exact: true })).toBeVisible();
  });
});
