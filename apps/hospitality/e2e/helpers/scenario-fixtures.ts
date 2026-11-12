import type { Locator, Page } from "@playwright/test";
import type { AvailabilityConfig } from "@mbe/types";
import { expect } from "../fixtures.js";
import { localDay } from "../local-day.js";
import { plusDays } from "./week-dates.js";

/**
 * Shared pieces of the PRD 18 scenario suite (ux.md fixtures F-one, F-bistro, F-dinner, F-close).
 * F-one is the `mockedPage` venue as `mockApi` serves it, F-bistro is `mockEmptyVenue` after
 * `setUniformBistroWeek`, F-close is F-one plus `mockClosures` (`close-mock.ts`), and F-dinner is
 * `dinnerOnlyConfig()` served through `mockEmptyVenue({ config })`.
 */

const SEATING = { version: 1, interval: 15 } as const;

/** F-dinner: the regular week with Dinner alone (5:00 PM, last seating 9:00 PM, close 10:00 PM), every day. */
export function dinnerOnlyConfig(): AvailabilityConfig {
  return {
    schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [
      {
        id: "ss-dinner",
        scheduleId: "regular",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1320,
        seating: SEATING,
        bookingTypes: ["online", "phone"],
        weekdays: [],
        dayHours: { version: 1, sets: [] },
      },
    ],
    assignments: [
      { id: "as-regular", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
    ],
    dateRules: [],
  };
}

/** The browser clock pinned to today's noon, so dates the scenario picks are stable all day. */
export async function pinToday(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(`${localDay()}T12:00:00`));
}

/** `day` (1-28) of next month as `YYYY-MM-DD`: one "Next month" from a picker that opens on today. */
export function nextMonthDay(day: number): string {
  const [year, month] = localDay().split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Tomorrow, as `YYYY-MM-DD`. */
export function tomorrow(): string {
  return plusDays(localDay(), 1);
}

/** The layer control's option (radio today; a tab is accepted too). */
export function layerOption(page: Page, name: "Schedules" | "Calendar" | "Special dates"): Locator {
  return page.getByRole("radio", { name }).or(page.getByRole("tab", { name }));
}

/**
 * Opens Availability as a Manager and waits until the role has settled and the Schedules layer
 * has painted its week panel: the point every scenario counts from.
 */
export async function firstPaint(page: Page): Promise<void> {
  await page.goto("availability/calendar");
  await expect(page.getByTestId("week-panel")).toBeVisible();
}

/**
 * A date picker's day cell. The page's own calendar has buttons with the same `data-date`, and a
 * picker just used may still be mounted, so the newest cell is the one a Manager would click.
 */
export function pickerDay(page: Page, date: string): Locator {
  return page.locator(`[role="gridcell"][data-date="${date}"]`).last();
}

/** The bodies a PUT of the availability config carried, newest last. */
export interface CapturedConfigPuts {
  readonly bodies: () => ReadonlyArray<ConfigPutBody>;
  readonly last: () => ConfigPutBody;
}

export interface ConfigPutBody {
  readonly expectedVersion: number;
  readonly changes: {
    readonly upsert: {
      readonly venueServices?: ReadonlyArray<{ id: string; name: string }>;
      readonly schedules?: ReadonlyArray<{ id: string; name: string }>;
      readonly scheduleServices?: ReadonlyArray<{
        id: string;
        scheduleId: string;
        venueServiceId: string;
        opensAt: number;
        lastSeatingAt: number;
        closesAt: number;
        weekdays: readonly number[];
      }>;
      readonly assignments?: ReadonlyArray<{
        scheduleId: string;
        weekdays: readonly number[];
        startsOn?: string;
        endsOn?: string;
      }>;
      readonly dateRules?: ReadonlyArray<{ startsOn?: string }>;
    };
  };
}

/**
 * Records every `PUT …/availability/config` body and lets it fall through to whichever mock
 * answers it (`mockApi`'s always-lands save, or `mockEmptyVenue`'s stateful one).
 */
export async function captureConfigPuts(page: Page): Promise<CapturedConfigPuts> {
  const bodies: ConfigPutBody[] = [];
  await page.route(/\/api\/v1\/venues\/[^/?]+\/availability\/config$/, (route) => {
    if (route.request().method() === "PUT") bodies.push(route.request().postDataJSON());
    return route.fallback();
  });
  return {
    bodies: () => bodies,
    last: () => {
      const body = bodies.at(-1);
      if (!body) throw new Error("no PUT of the availability config was sent");
      return body;
    },
  };
}

/**
 * The stranded-bookings check (`POST …/availability/preview`) answered as a no-op diff: nothing
 * added, removed or stranded. Counts the requests, so a spec can assert the check ran before a save.
 * `mockApi` serves no preview, and the draft preview asks for one whenever a draft differs.
 */
export async function mockNoopPreview(page: Page): Promise<{ readonly requests: () => number }> {
  let requests = 0;
  await page.route(/\/api\/v1\/venues\/[^/?]+\/availability\/preview/, (route) => {
    requests += 1;
    const { focusDate } = route.request().postDataJSON() as { focusDate: string };
    const days = Array.from({ length: 30 }, (_, i) => ({
      serviceDate: plusDays(focusDate, i),
      added: [] as number[],
      removed: [] as number[],
    }));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          version: 1,
          days,
          focusDay: {
            serviceDate: focusDate,
            label: "Regular",
            scheduleId: "sch-regular",
            serviceCount: 2,
            closures: [],
            bookingOpen: { online: true, phone: true, waitlist: true },
          },
          stranded: { total: 0, offset: 0, items: [] },
        },
      }),
    });
  });
  return { requests: () => requests };
}
