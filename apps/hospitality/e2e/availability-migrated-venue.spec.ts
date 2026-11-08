import { applyChanges, collapseDayNamedSchedules } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";

/**
 * A migrated venue (PRD: one regular week). The old migration wrote a day-named "Thu–Fri hours"
 * schedule beside the regular week; `collapseDayNamedSchedules` folds it into the regular week's
 * Dinner row as a set of different hours. The calendar must then read one regular week with no
 * day-named schedule, and its Schedules tab (always shown to a Manager) lists only the regular week.
 * A venue not yet collapsed is the contrast: its tab still lists the schedule.
 *
 * The collapsed config is built by the real engine function from the old shape, then served to
 * the page. Local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally).
 */

const SEATING = { version: 1, interval: 15 } as const;
const HOURS = { seating: SEATING, bookingTypes: ["online", "phone"] as ("online" | "phone")[] };
const NO_SCOPE = { weekdays: [], dayHours: { version: 1 as const, sets: [] } };

/** Regular week Mon–Wed, and an undated "Thu–Fri hours" schedule that closes later. */
function oldShapeMigrated(): AvailabilityConfig {
  return {
    schedules: [
      { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
      { id: "thu-fri", name: "Thu–Fri hours", kind: "alternate", isRegular: false },
    ],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [
      {
        id: "ss-regular",
        scheduleId: "regular",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1320,
        ...HOURS,
        ...NO_SCOPE,
      },
      {
        id: "ss-thu-fri",
        scheduleId: "thu-fri",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1320,
        closesAt: 1380,
        ...HOURS,
        ...NO_SCOPE,
      },
    ],
    assignments: [
      { id: "as-regular", scheduleId: "regular", weekdays: [1, 2, 3], precedence: 0 },
      { id: "as-thu-fri", scheduleId: "thu-fri", weekdays: [4, 5], precedence: 1 },
    ],
    dateRules: [],
  };
}

function collapsed(): AvailabilityConfig {
  const before = oldShapeMigrated();
  let n = 0;
  const changes = collapseDayNamedSchedules(before, () => `fold-${++n}`);
  if (changes === null) throw new Error("the old-shape fixture should collapse");
  return applyChanges(before, changes, new Date().toISOString());
}

test.describe("A migrated venue", () => {
  test("reads as one regular week, with no day-named schedule on the calendar or the Schedules tab", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page, { derive: true, config: collapsed() });
    await page.goto("availability");

    await expect(
      page.getByText("Regular week: Dinner 5:00 PM–9:00 PM Mon–Fri, Thu–Fri until 10:00 PM")
    ).toBeVisible();
    await expect(page.getByRole("grid")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/Thu–Fri hours/);
    await expect(page.getByRole("radio", { name: "Calendar" })).toBeVisible();
    await page.getByRole("radio", { name: "Schedules" }).click();
    await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/Thu–Fri hours/);
  });

  test("a venue not yet collapsed still has its Schedules tab", async ({ mockedPage: page }) => {
    await mockEmptyVenue(page, { derive: true, config: oldShapeMigrated() });
    await page.goto("availability");

    await expect(page.getByText("Regular week: Dinner 5:00 PM–9:00 PM Mon–Wed")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Schedules" })).toBeVisible();
    // The day-named schedule shows on the calendar, so its absence above is not an empty page.
    await expect(page.getByText("Thu–Fri hours").first()).toBeVisible();
  });
});
