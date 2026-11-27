import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture } from "./api-mocks.js";
import type { AvailabilityConfig } from "@mbe/types";
import { countInteractions } from "./helpers/interaction-counter.js";
import { createSharedConfig, serveSharedConfig } from "./helpers/shared-config-mock.js";
import { dayOfNextMonth, pinMidMonth } from "./mid-month-clock.js";

/**
 * The Seasonal hours editor (availability-hub breakdown E4.6): `availability/seasonal/new`
 * (`?copy=`) and `availability/seasonal/:scheduleId`, a page of its own where today's page had a
 * drawer. Walkthrough 2 is ux.md's: summer hours over three dates that already have special hours.
 */

const DESKTOP = { width: 1280, height: 800 };

/** The demo venue's config with Weeknights (Mon-Thu) added, and a special date inside next month. */
async function serveVenue(page: Page, specialDate: string) {
  const demo = buildAvailabilityConfigFixture().config as AvailabilityConfig;
  const copies = demo.scheduleServices.map((s) => ({ ...s, id: `${s.id}-wk`, scheduleId: "wk" }));
  const config: AvailabilityConfig = {
    ...demo,
    schedules: [
      ...demo.schedules,
      { id: "wk", name: "Weeknights", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [...demo.scheduleServices, ...copies],
    assignments: [
      ...demo.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
    ],
    dateRules: [
      ...demo.dateRules,
      {
        id: "dr-special",
        kind: "special_hours",
        targetKind: "venue",
        startsOn: specialDate,
        endsOn: specialDate,
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
      },
    ],
  };
  const store = createSharedConfig(config);
  await serveSharedConfig(page, store);
  return store;
}

async function viewAsHost(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

test.describe("Availability hub: Seasonal hours editor (E4.6)", () => {
  test("a Host sent to either editor address lands on the hub", async ({ mockedPage: page }) => {
    await serveVenue(page, dayOfNextMonth(10));
    await viewAsHost(page);
    await page.setViewportSize(DESKTOP);
    for (const address of ["availability/seasonal/new", "availability/seasonal/wk"]) {
      await page.goto(address);
      await expect(page).toHaveURL(/\/availability$/);
      await expect(page.getByRole("heading", { level: 2, name: "Your rules" })).toBeVisible();
    }
  });

  test("walkthrough 2: summer hours over a special date in at most 10 steps, with Keep theirs preselected", async ({
    mockedPage: page,
  }) => {
    const store = await serveVenue(page, dayOfNextMonth(10));
    await pinMidMonth(page);
    await page.setViewportSize(DESKTOP);
    await page.goto("availability/seasonal/new");
    await expect(page.getByRole("heading", { level: 1, name: "New seasonal hours" })).toBeVisible();

    // Step 1 of the walkthrough is hub row 2's Add, which opens this address.
    const steps = countInteractions(page);
    const starting = steps.page.getByRole("combobox", { name: "Starting" });
    await starting.fill(dayOfNextMonth(1));
    await starting.press("Enter");
    const ending = steps.page.getByRole("combobox", { name: "Ending" });
    await ending.fill(dayOfNextMonth(15));
    await ending.press("Enter");
    await steps.page.getByRole("button", { name: /^Use / }).click();
    await steps.page.getByRole("combobox", { name: "Closes" }).click();
    // The open service is Lunch (3:00 PM close); 4:00 PM still ends before Dinner opens at 5:00 PM,
    // so the draft is valid. Count: Add (1) + start (2) + end (2) + suggestion (1) + close (2)
    // + Save (1) = 9.
    await steps.page.getByRole("option", { name: "4:00 PM", exact: true }).click();

    const bar = page.getByTestId("editor-save-bar");
    await expect(bar.getByText(/already ha(s|ve) special hours/)).toBeVisible();
    await expect(bar.getByRole("radio", { name: "Keep theirs" })).toBeChecked();
    await steps.page
      .getByTestId("editor-save-bar")
      .getByRole("button", { name: /^Save for / })
      .click();
    await expect.poll(() => store.configPuts.length).toBe(1);
    // 1 for the hub's Add, then the steps above: target at most 10.
    expect(1 + steps.count()).toBeLessThanOrEqual(10);
    expect(store.configPuts[0]?.changes).toBeDefined();
    await expect(page).toHaveURL(/\/availability\/seasonal$/);
  });

  test("Duplicate starts as a copy of that set, at ?copy=", async ({ mockedPage: page }) => {
    await serveVenue(page, dayOfNextMonth(10));
    await page.setViewportSize(DESKTOP);
    await page.goto("availability/seasonal");
    await page.getByRole("link", { name: "Duplicate Weeknights" }).click();
    await expect(page).toHaveURL(/\/availability\/seasonal\/new\?copy=wk$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Duplicate seasonal hours" })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Schedule name/ })).toHaveValue(
      "Weeknights (copy)"
    );
  });

  test("an edit offers Also apply to under a changed service, and has no date fields", async ({
    mockedPage: page,
  }) => {
    await serveVenue(page, dayOfNextMonth(10));
    await page.setViewportSize(DESKTOP);
    await page.goto("availability/seasonal");
    await page.getByRole("link", { name: "Edit Weeknights" }).click();
    await expect(page).toHaveURL(/\/availability\/seasonal\/wk$/);
    await expect(page.getByRole("heading", { level: 1, name: "Edit Weeknights" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Starting" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: /^Also apply to / })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Closes" }).click();
    // Lunch is the open service; closing it at 4:00 PM stays clear of Dinner at 5:00 PM.
    await page.getByRole("option", { name: "4:00 PM", exact: true }).click();
    await expect(page.getByRole("group", { name: /^Also apply to .* in:$/ })).toBeVisible();
  });

  test("has no axe violations on a new set", async ({ mockedPage: page }) => {
    await serveVenue(page, dayOfNextMonth(10));
    await page.setViewportSize(DESKTOP);
    await page.goto("availability/seasonal/new");
    await expect(page.getByRole("heading", { level: 1, name: "New seasonal hours" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
