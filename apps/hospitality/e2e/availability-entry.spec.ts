import { test, expect } from "./fixtures.js";
import { mockAvailability } from "./availability-draft-mock.js";
import { weekPanel } from "./helpers/first-paint.js";

/**
 * The Availability entry contract: `/availability?tab=`, the old `?closeSection=` (now
 * `?close=section:<id>`, availability-hub C2.4) and `?from=setup` open
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

  test("?closeSection= becomes ?close=section:, keeping from=setup and the back-link", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.goto("availability?from=setup&closeSection=sec-1");
    await expect.poll(() => new URL(page.url()).searchParams.get("close")).toBe("section:sec-1");
    expect(new URL(page.url()).searchParams.has("closeSection")).toBe(false);
    // The hub hosts the Close dialog (C2.4); a section this venue lacks opens it on the venue.
    const dialog = page.getByRole("dialog", { name: /^Close / });
    await expect(dialog.getByText("Whole venue", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Venue Setup" })).toBeVisible();
    expect(new URL(page.url()).search).toBe("?from=setup");
  });
});
