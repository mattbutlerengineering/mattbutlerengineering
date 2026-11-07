import type { Page } from "@playwright/test";
import { addDays, applyChanges, resolveDay } from "@mbe/availability";
import type {
  AvailabilityChangeEntry,
  AvailabilityConfig,
  AvailabilityConfigChanges,
} from "@mbe/types";
import { localDay } from "../local-day.js";
import { loadFixture } from "../api-mocks.js";
import { serveDaysAndPreview } from "./engine-days-mock.js";

const EMPTY_CONFIG: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

/** The weekdays (Sunday 0) whose resolved services differ between two configs, from `from` on. */
function changedWeekdays(
  before: AvailabilityConfig,
  after: AvailabilityConfig,
  timezone: string,
  from: string
): number[] {
  const services = (config: AvailabilityConfig, date: string) =>
    JSON.stringify(
      resolveDay({ timezone, config }, date).services.map((svc) => [
        svc.venueServiceId,
        svc.opensAt,
        svc.lastSeatingAt,
        svc.closesAt,
      ])
    );
  return Array.from({ length: 7 }, (_, i) => addDays(from, i))
    .filter((date) => services(before, date) !== services(after, date))
    .map((date) => new Date(`${date}T00:00:00Z`).getUTCDay());
}

/**
 * An empty venue that saves: the config answers "empty" until the PUT lands and then the saved rows.
 * Every later PUT is applied on top of the rows already saved, and each one adds a History entry
 * worded as the service words a regular-week change (`regular_week_changed` with the weekdays whose
 * hours moved, from the engine); the service's own audit writer sits behind Prisma.
 * With `config`, the venue starts with those stored rows instead (a venue that already has a
 * regular week). With `derive`, the calendar's day summaries and the guest preview are answered from the saved
 * week by the engine (`engine-days-mock.ts`); without it the day list stays empty.
 */
export async function mockEmptyVenue(
  page: Page,
  options: { derive?: boolean; config?: AvailabilityConfig } = {}
) {
  let saved: Record<string, unknown> | null = null;
  let version = 3;
  let config: AvailabilityConfig = options.config ?? EMPTY_CONFIG;
  const hasRows = () => saved !== null || options.config !== undefined;
  const history: AvailabilityChangeEntry[] = [];
  const appliedConfig = (): AvailabilityConfig => config;

  const venues = JSON.parse(loadFixture("venues-list")) as {
    data: Array<Record<string, unknown>>;
    pagination: Record<string, unknown>;
  };
  const venueId = String(venues.data[0]?.id);

  await page.route("**/api/v1/venues?*", (route) => {
    const [venue] = venues.data;
    const data = [
      {
        ...venue,
        operatingHours: hasRows() ? { monday: { open: "17:00", close: "22:00" } } : null,
      },
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
      const changes = saved.changes as AvailabilityConfigChanges;
      const before = config;
      const at = new Date().toISOString();
      config = applyChanges(before, changes, at);
      version += 1;
      const startsOn = changes.upsert.assignments?.find((a) => a.startsOn)?.startsOn ?? localDay();
      const weekdays = changedWeekdays(
        before,
        config,
        String(venues.data[0]?.ianaTimezone),
        startsOn
      );
      history.unshift({
        id: `change-${version}`,
        actorId: "auth0|local-e2e",
        at,
        kind: "config_saved",
        summary: "Regular week changed",
        detail: { code: "regular_week_changed", startsOn, weekdays },
        affectedFrom: null,
        affectedTo: null,
        notifiedGuests: false,
        revertedById: null,
        revertible: false,
        actorName: "E2E Manager",
      });
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
        data: hasRows()
          ? {
              config: appliedConfig(),
              version,
              source: "rows",
            }
          : { config: EMPTY_CONFIG, version, source: "empty" },
      }),
    });
  });
  await page.route(`**/api/v1/venues/${venueId}/availability/changes*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { total: history.length, offset: 0, items: history } }),
    })
  );
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
