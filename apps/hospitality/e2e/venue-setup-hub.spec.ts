import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { mockAvailability } from "./availability-draft-mock.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";

/**
 * Venue Setup (`/setup`): the standing hub of every resource type the venue is made of
 * (docs/features/availability-setup-hierarchy/ux.md S-Hub). Its actions open the editors that
 * already exist; it renders no editor of its own except the two drawers it hosts.
 */

const TEAM_ROUTE = /\/api\/v1\/venues\/[^/?]+\/team$/;

/** Registered after mockApi, so it wins: the viewer is a Host at the venue. */
async function viewAsHost(page: Page): Promise<void> {
  await page.route(TEAM_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

/** The fixture venue with no booking rules set, so every node of the empty venue is unset. */
async function withoutBookingRules(page: Page): Promise<void> {
  const venues = JSON.parse(loadFixture("venues-list")) as {
    data: Array<Record<string, unknown>>;
    pagination: Record<string, unknown>;
  };
  await page.route("**/api/v1/venues?*", (route) => {
    const data = venues.data.map((venue) => ({ ...venue, operatingHours: null, settings: null }));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, pagination: venues.pagination }),
    });
  });
}

test.describe("Venue Setup hub", () => {
  test("an empty venue lists every resource type as not set up, and says what each is", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page);
    await withoutBookingRules(page);
    await page.goto("setup");

    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    for (const [name, what] of [
      [/Regular week/, "The days and services guests can book."],
      [/Special dates/, /Closures and special hours/],
      [/^Booking/, /How far ahead, how much notice/],
      [/Floor plan/, /Where tables sit/],
    ] as const) {
      const node = page.getByRole("listitem", { name });
      await expect(node.getByText("Not set up")).toBeVisible();
      await expect(node.getByText(what)).toBeVisible();
    }
    await expect(
      page.getByText("Sections and tables appear here once you add a floor plan")
    ).toBeVisible();
  });

  test("before launch the first unset step is the primary button, and it opens the one editor", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page);
    await withoutBookingRules(page);
    await page.goto("setup");

    const strip = page.getByRole("region", { name: "Venue Setup progress" });
    await expect(strip.getByText("1 of 3")).toBeVisible();
    const primary = page.getByRole("button", { name: "Set up regular week" });
    await expect(primary).toHaveAttribute("data-primary", "true");

    await primary.click();
    await expect(page).toHaveURL(/\/availability\?from=setup$/);
    await expect(page.getByRole("heading", { name: "Set your regular week" })).toBeVisible();
    await page.getByRole("link", { name: "Venue Setup" }).click();
    await expect(page).toHaveURL(/\/setup$/);
  });

  test("Add floor plan opens the floor plan list, and Booking rules opens its editor in place", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page);
    await withoutBookingRules(page);
    await page.goto("setup");

    await page.getByRole("button", { name: "Booking rules…" }).click();
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/setup$/);

    await page.getByRole("button", { name: "Add floor plan" }).click();
    await expect(page).toHaveURL(/\/floor-plans$/);
  });

  test("an operational venue stays on /setup and sees its floor plan and schedule", async ({
    mockedPage: page,
  }) => {
    await page.goto("setup");

    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Venue Setup progress" })).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: /Schedules/ })).toContainText("1 schedule");
    const floor = page.getByRole("listitem", { name: /Main Floor/ });
    await expect(floor).toBeVisible();
    await expect(floor.getByRole("button", { name: "Open floor plan Main Floor" })).toBeVisible();
    await expect(floor.getByRole("button", { name: "Move to a section" })).toBeVisible();

    await floor.getByRole("button", { name: "Open floor plan Main Floor" }).click();
    await expect(page).toHaveURL(/\/floor-plans\/fp_e2e_001$/);
  });

  test("a section's Close for a date… opens the Close dialog on that section", async ({
    mockedPage: page,
  }) => {
    await mockAvailability(page);
    await page.route(/\/api\/v1\/floor-plan-sections(\?|$)/, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const at = "2026-01-01T00:00:00.000Z";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "sec-bar",
              venueId: "ven_e2e_001",
              floorPlanId: "fp_e2e_001",
              name: "Bar",
              color: "#8b7355",
              displayOrder: 0,
              createdAt: at,
              updatedAt: at,
            },
          ],
        }),
      });
    });
    await page.goto("setup");

    await page.getByRole("button", { name: "Close for a date… Bar" }).click();
    await expect(page).toHaveURL(/\/availability\?from=setup$/);
    const dialog = page.getByRole("dialog", { name: /^Close / });
    await expect(dialog.getByText("One section: Bar", { exact: true })).toBeVisible();
  });

  test("the Schedules actions open the Schedules tab on Availability", async ({
    mockedPage: page,
  }) => {
    await page.goto("setup");
    await page.getByRole("button", { name: "Compare services" }).click();
    await expect(page).toHaveURL(/\/availability\?tab=schedules&from=setup$/);
    await expect(page.getByRole("radio", { name: "Schedules" })).toBeChecked();
  });

  test("an unready venue is still sent to /setup from /timeline", async ({ mockedPage: page }) => {
    await mockEmptyVenue(page);
    await page.goto("timeline");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
  });

  test("/setup/hours still lands on /availability", async ({ mockedPage: page }) => {
    await page.goto("setup/hours");
    await expect(page).toHaveURL(/\/availability$/);
  });

  test("a Host sees the tree and no editor, save or set-up call to action", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page);
    await withoutBookingRules(page);
    await viewAsHost(page);
    await page.goto("setup");

    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    const week = page.getByRole("listitem", { name: /Regular week/ });
    await expect(week.getByText("Not set up")).toBeVisible();
    await expect(week.getByText("A manager sets this up.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Venue Setup progress" })).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("button", {
        name: /set up|edit|change|close|add|move|rules|compare|create|open/i,
      })
    ).toHaveCount(0);
  });
});
