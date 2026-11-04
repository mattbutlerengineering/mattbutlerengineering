import type { Page } from "@playwright/test";
import { loadFixture } from "../api-mocks.js";

const EMPTY_CONFIG = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

export async function mockEmptyVenue(page: Page) {
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
