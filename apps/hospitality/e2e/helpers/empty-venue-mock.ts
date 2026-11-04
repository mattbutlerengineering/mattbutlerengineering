import type { Page } from "@playwright/test";
import { applyChanges } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";
import { loadFixture } from "../api-mocks.js";
import { serveDaysAndPreview } from "./engine-days-mock.js";

const EMPTY_CONFIG: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

/**
 * An empty venue that saves: the config answers "empty" until the PUT lands and then the saved rows.
 * With `derive`, the calendar's day summaries and the guest preview are answered from the saved
 * week by the engine (`engine-days-mock.ts`); without it the day list stays empty.
 */
export async function mockEmptyVenue(page: Page, options: { derive?: boolean } = {}) {
  let saved: Record<string, unknown> | null = null;
  let version = 3;
  const appliedConfig = (): AvailabilityConfig =>
    saved
      ? applyChanges(
          EMPTY_CONFIG,
          saved.changes as AvailabilityConfigChanges,
          new Date().toISOString()
        )
      : EMPTY_CONFIG;

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
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: saved
          ? {
              config: appliedConfig(),
              version,
              source: "rows",
            }
          : { config: EMPTY_CONFIG, version, source: "empty" },
      }),
    });
  });
  if (options.derive) {
    const timezone = String(venues.data[0]?.ianaTimezone);
    await serveDaysAndPreview(page, `**/api/v1/venues/${venueId}`, timezone, () => ({
      config: appliedConfig(),
      version,
    }));
  } else {
    await page.route(`**/api/v1/venues/${venueId}/availability/days*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      })
    );
  }
  return { savedBody: () => saved };
}
