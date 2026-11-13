import type { Page } from "@playwright/test";
import { buildAvailabilityConfigFixture, loadFixture } from "../api-mocks.js";
import { localDay } from "../local-day.js";

/**
 * The Availability hub's demo venue (ux.md hub sketch): `mockApi`'s regular week (Lunch and
 * Dinner every day) plus one special date on the next Dec 24. Shared by the hub spec and the
 * availability launch-demo tour, so the tour shows exactly what the spec proves.
 */

const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;

/** The next Dec 24, today included: a year is always typed, so the answer is the same all year. */
export function nextChristmasEve(): string {
  const today = localDay();
  const thisYear = `${today.slice(0, 4)}-12-24`;
  return today <= thisYear ? thisYear : `${Number(today.slice(0, 4)) + 1}-12-24`;
}

/** The demo venue: the regular week `mockApi` serves, plus Dinner 4:00 PM to 8:00 PM on `dec24`. */
export async function mockDemoVenue(page: Page, dec24: string = nextChristmasEve()): Promise<void> {
  const fixture = buildAvailabilityConfigFixture();
  const special = {
    id: "dr-dec-24",
    kind: "special_hours",
    targetKind: "venue",
    startsOn: dec24,
    endsOn: dec24,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          opensAt: 960,
          lastSeatingAt: 1140,
          closesAt: 1200,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
    },
  };
  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { ...fixture, config: { ...fixture.config, dateRules: [special] } },
      }),
    });
  });
}
