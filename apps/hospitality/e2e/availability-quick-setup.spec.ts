import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";

/**
 * F1 (docs/features/venue-availability/ux.md): a Manager at a venue with no hours sets the
 * bistro week from the quick-setup card, bookings open, and the Setup checklist marks hours as
 * done. The config and venue endpoints are stateful: they answer "empty" until the PUT lands.
 */

const EMPTY_CONFIG = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

async function mockEmptyVenue(page: Page) {
  let saved: Record<string, unknown> | null = null;
  let version = 3;

  const venues = JSON.parse(loadFixture("venues-list")) as {
    data: Array<Record<string, unknown>>;
    pagination: Record<string, unknown>;
  };
  const venueId = String(venues.data[0]?.id);

  await page.route("**/api/v1/venues?*", (route) => {
    const [venue] = venues.data;
    const data = [
      { ...venue, operatingHours: saved ? { monday: { open: "17:00", close: "22:00" } } : null },
    ];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, pagination: venues.pagination }),
    });
  });
  // No floor plan yet, so the hours step is the only one the save can complete.
  await page.route("**/api/v1/floor-plans?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      }),
    })
  );
  await page.route(`**/api/v1/venues/${venueId}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      version += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { version, changeId: "change-1" } }),
      });
    }
    const upsert = (saved?.changes as { upsert?: Record<string, unknown[]> } | undefined)?.upsert;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: saved
          ? {
              config: {
                ...EMPTY_CONFIG,
                schedules: upsert?.schedules ?? [],
                venueServices: upsert?.venueServices ?? [],
                scheduleServices: upsert?.scheduleServices ?? [],
                assignments: upsert?.assignments ?? [],
              },
              version,
              source: "rows",
            }
          : { config: EMPTY_CONFIG, version, source: "empty" },
      }),
    });
  });
  await page.route(`**/api/v1/venues/${venueId}/availability/days*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    })
  );
  return { savedBody: () => saved };
}

test.describe("Availability quick setup (F1)", () => {
  test("a Manager sets the bistro week from an empty venue and the checklist marks hours done", async ({
    mockedPage,
  }) => {
    const state = await mockEmptyVenue(mockedPage);

    // The old entry point still lands on the new page.
    await mockedPage.goto("setup/hours");
    await expect(mockedPage).toHaveURL(/\/availability$/);
    await expect(mockedPage.getByRole("heading", { name: "Set your regular week" })).toBeVisible();

    await mockedPage.getByRole("button", { name: "Dinner" }).click();
    await mockedPage.getByRole("button", { name: "Weekdays" }).click();
    await expect(mockedPage.getByText(/Last seating 9:15 PM, 45 min before close/)).toBeVisible();
    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();

    await expect(mockedPage.getByText(/Bookings are open Mon, Tue/)).toBeVisible();
    await expect(mockedPage.getByRole("grid")).toBeVisible();
    expect(state.savedBody()).toMatchObject({ expectedVersion: 3 });

    await mockedPage.goto("setup");
    await expect(
      mockedPage.getByRole("listitem", { name: /Set Operating Hours — Completed/ })
    ).toBeVisible();
  });

  test("invalid input sends nothing and names the problem", async ({ mockedPage }) => {
    const state = await mockEmptyVenue(mockedPage);
    await mockedPage.goto("availability");

    await mockedPage.getByRole("button", { name: "Save and open bookings" }).click();
    await expect(mockedPage.getByText("Give this service a name.")).toBeVisible();
    await expect(mockedPage.getByText("Choose at least one day.")).toBeVisible();
    expect(state.savedBody()).toBeNull();
  });
});
