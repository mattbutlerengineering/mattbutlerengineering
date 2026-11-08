import { test, expect } from "./fixtures.js";
import { mockAvailability } from "./availability-draft-mock.js";

/**
 * The Availability entry contract: `/availability?tab=`, `?closeSection=` and `?from=setup` open
 * the page where another page means it to, and never error.
 */
test.describe("availability deep links", () => {
  test("?tab=schedules opens the Schedules tab", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.goto("availability?tab=schedules");
    await expect(page.getByRole("radio", { name: "Schedules" })).toBeChecked();
    await expect(page.getByRole("heading", { name: "Schedules", level: 2 })).toBeVisible();
  });

  test("garbage params render the default page", async ({ mockedPage: page }) => {
    await mockAvailability(page);
    await page.goto("availability?tab=nope&closeSection=&from=elsewhere&x=1");
    await expect(page.getByRole("radio", { name: "Calendar" })).toBeChecked();
    await expect(page.getByRole("grid")).toBeVisible();
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
