import { test, expect } from "./fixtures.js";
import { mockAvailability } from "./availability-draft-mock.js";
import { weekPanel } from "./helpers/first-paint.js";

/**
 * The Availability entry contract: `/availability?tab=`, `?closeSection=` and `?from=setup` open
 * the page where another page means it to, and never error.
 */
test.describe("availability deep links", () => {
  test("?tab=schedules opens the week form, at Regular hours", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.goto("availability?tab=schedules");
    await expect(page).toHaveURL(/\/availability\/hours$/);
    await expect(page.getByRole("heading", { level: 1, name: "Regular hours" })).toBeVisible();
    await expect(weekPanel(page)).toBeVisible();
  });

  test("?tab=calendar opens the Calendar layer", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.goto("availability?tab=calendar");
    await expect(page.getByRole("radio", { name: "Calendar" })).toBeChecked();
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(weekPanel(page)).toHaveCount(0);
  });

  test("?action=addSchedule opens the seeded schedule editor once, then leaves the URL", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.goto("availability?tab=schedules&action=addSchedule");
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: /Schedule name/ })
    ).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("action")).toBe(false);
  });

  test("garbage params render the landing page: the hub", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.goto("availability?tab=nope&closeSection=&from=elsewhere&x=1");
    await expect(page.getByRole("heading", { level: 2, name: "Your rules" })).toBeVisible();
    await expect(weekPanel(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Venue Setup" })).toHaveCount(0);
  });

  test("?from=setup shows the Venue Setup back-link and ?closeSection is removed", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.goto("availability?from=setup&closeSection=sec-1");
    await expect(page.getByRole("link", { name: "Venue Setup" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("closeSection")).toBe(false);
    expect(new URL(page.url()).searchParams.get("from")).toBe("setup");
  });
});
