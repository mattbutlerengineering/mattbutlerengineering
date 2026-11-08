import type { Locator, Page } from "@playwright/test";
import type { AvailabilityConfig } from "@mbe/types";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { mockClosures } from "./helpers/close-mock.js";
import type { AvailabilityConfigResponse } from "./helpers/close-mock.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { weekPanel } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import {
  captureConfigPuts,
  firstPaint,
  layerOption,
  mockNoopPreview,
  pickerDay,
} from "./helpers/scenario-fixtures.js";

/**
 * The everyday scenario suite (docs/features/availability-scenario-ux: ux.md R1-R11, prd.md
 * criteria 3, 4, 10, 11). Each walkthrough starts on `/availability` first paint, after the
 * Manager role has settled and the Schedules layer has painted its week panel, counts Locator
 * actions through `countInteractions`, and ends saved within the PRD's budget. Counts are agent
 * stand-in evidence, not a timed walkthrough; each test records its count as an annotation.
 *
 * Today is pinned to Sun, Nov 8, 2026, 12:00 PM (6:00 PM for R6). Fixtures as in
 * `availability-scenarios.spec.ts`: F-one is the `mockedPage` venue, F-close is F-one plus
 * `mockClosures`.
 */

const DESKTOP = { width: 1280, height: 720 } as const;
const PHONE = { width: 375, height: 812 } as const;

const NOON = new Date("2026-11-08T12:00:00");
const SIX_PM = new Date("2026-11-08T18:00:00");

function record(name: string, count: number, budget: number): void {
  test.info().annotations.push({
    type: "interactions (agent stand-in)",
    description: `${name}: ${count} of ${budget}`,
  });
  expect(count, `${name} interactions`).toBeLessThanOrEqual(budget);
}

/** Choosing a time is two interactions: open the list, pick the option. */
async function chooseTime(
  page: Page,
  scope: Locator,
  label: string,
  index: number,
  time: string
): Promise<void> {
  await scope.getByRole("combobox", { name: label }).nth(index).click();
  await page
    .getByRole("listbox", { name: label })
    .getByRole("option", { name: time, exact: true })
    .click();
}

const F_ONE_CONFIG = buildAvailabilityConfigFixture() as AvailabilityConfigResponse;

/** The week panel's own Save (the footer's), not a drawer's. */
const savePanel = (page: Page) =>
  weekPanel(page).getByRole("button", { name: "Save", exact: true });

/** The Next button of the month calendar (desktop labels it "Next"). */
/** Where the page's toasts land (a closure that told no guest offers Undo there). */
const notifications = (page: Page) => page.getByRole("region", { name: "Notifications" });

const nextMonth = (page: Page) => page.getByRole("button", { name: /^Next( month)?$/ });

/** F-one with a "Weeknights" schedule, Mon–Thu, undated: Lunch and Dinner as the regular week. */
function weeknightsConfig(): AvailabilityConfig {
  const base = buildAvailabilityConfigFixture().config as AvailabilityConfig;
  const regular = base.scheduleServices.map((row) => ({
    ...row,
    id: `${row.id}-wn`,
    scheduleId: "sch-weeknights",
  }));
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "sch-weeknights", name: "Weeknights", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [...base.scheduleServices, ...regular],
    assignments: [
      ...base.assignments,
      { id: "as-weeknights", scheduleId: "sch-weeknights", weekdays: [1, 2, 3, 4], precedence: 1 },
    ],
  };
}

/**
 * `GET …/availability/days`: with `weeknights`, Mon–Thu read "Weeknights" and the rest the regular
 * week (every date the regular week without); `lunchClosed` dates carry a Lunch closure. Registered after the venue's other
 * mocks, so it answers first.
 */
async function serveDays(
  page: Page,
  options: { readonly weeknights: boolean; readonly lunchClosed: (date: string) => boolean }
): Promise<void> {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const venueId = String(venues.data[0]?.id);
  await page.route(`**/api/v1/venues/${venueId}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days: unknown[] = [];
    for (
      let d = new Date(`${url.searchParams.get("from")}T00:00:00Z`);
      d <= new Date(`${url.searchParams.get("to")}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const serviceDate = d.toISOString().slice(0, 10);
      const weeknight = options.weeknights && d.getUTCDay() >= 1 && d.getUTCDay() <= 4;
      const closed = options.lunchClosed(serviceDate);
      days.push({
        serviceDate,
        label: weeknight ? "Weeknights" : "Regular",
        scheduleId: weeknight ? "sch-weeknights" : "sch-regular",
        serviceCount: closed ? 1 : 2,
        closures: closed
          ? [
              {
                ruleId: "rule-1",
                targetKind: "service",
                venueServiceId: "vs-lunch",
                from: 0,
                to: 2880,
              },
            ]
          : [],
        bookingOpen: { online: true, phone: true, waitlist: true },
        services: [
          ...(closed
            ? []
            : [
                {
                  venueServiceId: "vs-lunch",
                  name: "Lunch",
                  opensAt: 690,
                  lastSeatingAt: 840,
                  closesAt: 900,
                },
              ]),
          {
            venueServiceId: "vs-dinner",
            name: "Dinner",
            opensAt: 1020,
            lastSeatingAt: 1290,
            closesAt: 1380,
          },
        ],
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: days }),
    });
  });
}

/** The December 2026 month view of the Weeknights venue, Lunch closed on Christmas Eve. */
async function openDecember(page: Page): Promise<void> {
  await page.goto("availability?tab=calendar");
  await expect(page.getByRole("grid")).toBeVisible();
  await nextMonth(page).click();
  await expect(page.locator('[data-date="2026-12-24"]').first()).toBeVisible();
}

test.describe("Availability, the everyday edits (R1-R11)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await mockedPage.clock.setFixedTime(NOON);
  });

  test("R1 / B10: Late service Fri–Sat beside Dinner closing 11 PM (budget 5)", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    await firstPaint(page);
    const counter = countInteractions(page);
    const panel = weekPanel(counter.page);

    await panel.getByRole("button", { name: "Add another service" }).click();
    await panel.getByRole("button", { name: "Late", exact: true }).last().click();
    await panel.getByRole("button", { name: "Different days for this service" }).last().click();
    await panel
      .getByRole("group", { name: "Late runs on" })
      .getByRole("button", { name: "Fri–Sat" })
      .click();
    await expect(panel.getByRole("combobox", { name: "Opens" }).last()).toHaveValue("11:00 PM");
    await expect(panel.getByRole("combobox", { name: "Closes" }).last()).toHaveValue("2:00 AM");
    await expect(page.getByText(/overlaps/)).toHaveCount(0);
    await savePanel(counter.page).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const late = puts
      .last()
      .changes.upsert.scheduleServices?.find(
        (row) => row.opensAt === 1380 && row.closesAt === 1560
      );
    expect([...(late?.weekdays ?? [])].sort()).toEqual([5, 6]);
    record("R1", counter.count(), 5);
  });

  test("R2 / C13: a Weeknights schedule Mon–Thu, undated (budget 5)", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Add a schedule…" }).click();
    const drawer = counter.page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: /Schedule name/ }).fill("Weeknights");
    await drawer.getByRole("button", { name: "Weekdays", exact: true }).click();
    await drawer.getByText("Friday", { exact: true }).click();
    // The chips stay in place: all seven day checkboxes are still there, Friday unticked.
    await expect(drawer.getByRole("checkbox")).toHaveCount(7);
    await expect(drawer.getByRole("checkbox", { name: "Friday" })).not.toBeChecked();
    await expect(drawer.getByText("Change days")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const { upsert } = puts.last().changes;
    expect(upsert.schedules?.map((s) => s.name)).toContain("Weeknights");
    const assignment = upsert.assignments?.find((a) => a.scheduleId !== "sch-regular");
    expect([...(assignment?.weekdays ?? [])].sort()).toEqual([1, 2, 3, 4]);
    expect(assignment?.startsOn ?? null).toBeNull();
    record("R2", counter.count(), 5);
  });

  test("R3 / C20: duplicate Weeknights as Mon–Thu with a later close (budget 7)", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page, { derive: true, config: weeknightsConfig() });
    await mockNoopPreview(page);
    const puts = await captureConfigPuts(page);
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: /^Duplicate/ }).click();
    const drawer = counter.page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: /Schedule name/ }).fill("Weeknights late");
    await drawer.getByRole("button", { name: "Weekdays", exact: true }).click();
    await drawer.getByText("Friday", { exact: true }).click();
    await chooseTime(counter.page, drawer, "Closes", 1, "11:30 PM");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const { upsert } = puts.last().changes;
    expect(upsert.schedules?.map((s) => s.name)).toContain("Weeknights late");
    const assignment = upsert.assignments?.find((a) => a.scheduleId !== "sch-weeknights");
    expect([...(assignment?.weekdays ?? [])].sort()).toEqual([1, 2, 3, 4]);
    expect(upsert.scheduleServices?.some((row) => row.closesAt === 1410)).toBe(true);
    record("R3", counter.count(), 7);
  });

  test("R4 / D22: no lunch on Christmas Eve (budget 5)", async ({ mockedPage: page }) => {
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: "Close", exact: true });
    await dialog.getByText("One service", { exact: true }).click();
    await dialog.getByRole("button", { name: "Christmas Eve · Thu, Dec 24" }).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    expect(state.saved()).toMatchObject({
      rule: {
        kind: "closure",
        targetKind: "service",
        venueServiceId: "vs-lunch",
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
      },
    });
    await expect(
      notifications(page).getByText("Lunch closed on Thu, Dec 24", { exact: true })
    ).toBeVisible();
    record("R4", counter.count(), 5);
  });

  test("R5 / E39: closed every Monday in January (budget 10)", async ({ mockedPage: page }) => {
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: "Close", exact: true });
    await dialog.getByText("Repeats", { exact: true }).click();
    await dialog.getByRole("combobox", { name: "From" }).click();
    await nextMonth(counter.page).click();
    await nextMonth(counter.page).click();
    await pickerDay(counter.page, "2027-01-04").click();
    await dialog.getByRole("combobox", { name: "To" }).click();
    // To starts empty, so its picker opens on From's month: no month move.
    await expect(pickerDay(page, "2027-01-31")).toBeVisible();
    await pickerDay(counter.page, "2027-01-31").click();
    await dialog.getByText("Mon", { exact: true }).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    expect(state.saved()).toMatchObject({
      rule: {
        kind: "closure",
        targetKind: "venue",
        startsOn: "2027-01-04",
        endsOn: "2027-01-31",
        repeat: { weekdays: [1] },
      },
    });
    record("R5", counter.count(), 10);
  });

  test("R6 / E41: close early tonight at 9:30 PM (budget 4, at most 12 options)", async ({
    mockedPage: page,
  }) => {
    await page.clock.setFixedTime(SIX_PM);
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: "Close", exact: true });
    await dialog.getByRole("combobox", { name: "Starting at" }).click();
    const options = counter.page.getByRole("listbox", { name: "Starting at" }).getByRole("option");
    const labels = await options.allTextContents();
    expect(labels.length).toBeLessThanOrEqual(12);
    expect(labels[0]).toBe("All day");
    expect(labels[1]).toBe("From 6:30 PM");
    expect(labels.at(-1)).toBe("From 10:30 PM");
    await options.filter({ hasText: "From 9:30 PM" }).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    await expect(
      notifications(page).getByText("Closed from 9:30 PM tonight", { exact: true })
    ).toBeVisible();
    test.info().annotations.push({
      type: "starting-at options",
      description: `${labels.length}: ${labels.join(" | ")}`,
    });
    record("R6", counter.count(), 4);
  });

  test("R7 / H72: change the largest online party from the Booking line (budget 3)", async ({
    mockedPage: page,
  }) => {
    const patches: Array<Record<string, unknown>> = [];
    await page.route(/\/api\/v1\/venues\/[^/?]+$/, (route) => {
      if (route.request().method() === "PATCH") patches.push(route.request().postDataJSON());
      return route.fallback();
    });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: /^Booking:/ }).click();
    const drawer = counter.page.getByRole("dialog", { name: "Booking rules" });
    await drawer.getByLabel("Largest party online").fill("8");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => patches.length).toBe(1);
    expect(JSON.stringify(patches[0])).toContain("8");
    record("R7", counter.count(), 3);
  });

  test("R8 / C19: which days differ this month, in 0 clicks", async ({ mockedPage: page }) => {
    await mockEmptyVenue(page, { derive: true, config: weeknightsConfig() });
    await serveDays(page, { weeknights: true, lunchClosed: (date) => date === "2026-12-24" });
    // The Calendar layer is one click away and is not counted: the question is asked there.
    await openDecember(page);
    const counter = countInteractions(page);

    const cell = (date: string) => counter.page.locator(`[data-date="${date}"]`).first();
    await expect(
      counter.page
        .getByRole("main")
        .getByRole("listitem")
        .filter({ hasText: "Weeknights · Mon–Thu" })
    ).toBeVisible();
    await expect(
      counter.page
        .getByRole("main")
        .getByRole("listitem")
        .filter({ hasText: "Lunch closed · 1 day" })
    ).toBeVisible();
    // Mon–Thu cells read Weeknights; Christmas Eve's closure outranks it.
    await expect(cell("2026-12-21")).toContainText("Weeknights");
    await expect(cell("2026-12-24")).toContainText("Lunch closed");
    await expect(cell("2026-12-24")).toContainText("+1");
    // Regular dates show only the date: no schedule or service text.
    for (const date of ["2026-12-05", "2026-12-06", "2026-12-11"]) {
      await expect(cell(date)).not.toContainText(/Regular|Lunch|Dinner|Weeknights/);
    }
    record("R8", counter.count(), 0);
    expect(counter.count()).toBe(0);
  });

  for (const [name, viewport] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    test(`R9 / PRD 3: Save stays in the viewport while the week form is dirty (${name})`, async ({
      mockedPage: page,
    }) => {
      await page.setViewportSize(viewport);
      const puts = await captureConfigPuts(page);
      await mockNoopPreview(page);
      await firstPaint(page);
      const counter = countInteractions(page);
      const panel = weekPanel(counter.page);

      await chooseTime(counter.page, panel, "Closes", 0, "2:30 PM");
      const footer = panel.locator("[data-pinned]");
      await expect(footer).toBeVisible();
      await expect(page.getByText("Changes apply from today, Sun, Nov 8.")).toBeVisible();

      // Scroll the page to the top of the form: the footer is still in reach.
      await page.evaluate(() => {
        for (let el: Element | null = document.querySelector('[data-testid="week-panel"]'); el;) {
          el.scrollTop = 0;
          el = el.parentElement;
        }
        window.scrollTo(0, 0);
      });
      const save = savePanel(page);
      await expect(save).toBeVisible();
      const box = await save.boundingBox();
      expect(box, "Save has a box").not.toBeNull();
      if (box === null) return;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      if (name === "phone") {
        // Mid-form: the footer is still pinned at the bottom of the screen.
        await page.evaluate(() => {
          for (let el: Element | null = document.querySelector('[data-testid="week-panel"]'); el;) {
            if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight / 3;
            el = el.parentElement;
          }
        });
        await expect(save).toBeInViewport();
      }

      await savePanel(counter.page).click();
      await expect.poll(() => puts.bodies().length).toBe(1);
      // Saved: no changes, so the footer returns to the flow.
      await expect(footer).toHaveCount(0);
      test.info().annotations.push({
        type: "interactions (agent stand-in)",
        description: `R9 ${name}: ${counter.count()}`,
      });
    });
  }

  test("R10: Pause online booking opens a Pause dialog with no step line", async ({
    mockedPage: page,
  }) => {
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);

    await page.getByRole("button", { name: "Pause online booking" }).click();
    const dialog = page.getByRole("dialog", { name: "Pause online booking", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Close", exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/Step \d of 2/)).toHaveCount(0);
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    await expect(page.getByRole("alert").getByText("Online booking paused")).toBeVisible();
  });

  test("R11: a Host sees the same quiet calendar and legend, and no editors", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page, { derive: true, config: weeknightsConfig() });
    await serveDays(page, { weeknights: true, lunchClosed: (date) => date === "2026-12-24" });
    await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
      })
    );
    await page.goto("availability");
    await expect(page.getByRole("grid")).toBeVisible();
    await nextMonth(page).click();
    await expect(page.locator('[data-date="2026-12-24"]').first()).toBeVisible();

    await expect(
      page.getByRole("main").getByRole("listitem").filter({ hasText: "Weeknights · Mon–Thu" })
    ).toBeVisible();
    await expect(page.locator('[data-date="2026-12-24"]').first()).toContainText("Lunch closed");
    await expect(page.locator('[data-date="2026-12-05"]').first()).not.toContainText(
      /Regular|Lunch|Dinner|Weeknights/
    );
    await expect(page.getByTestId("week-panel")).toHaveCount(0);
    for (const name of ["Close…", "Pause online booking", "Add a schedule…"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  });

  for (const [name, viewport] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    test(`PRD 10: the Calendar's Select… menu fits the viewport (${name})`, async ({
      mockedPage: page,
    }) => {
      await page.setViewportSize(viewport);
      await mockEmptyVenue(page, { derive: true, config: weeknightsConfig() });
      await page.goto("availability?tab=calendar");
      await expect(layerOption(page, "Calendar")).toBeChecked();
      await page.getByRole("main").getByRole("button", { name: "Select…" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem").first()).toBeVisible();
      // Menus animate in; wait for the box to settle before measuring.
      await expect
        .poll(async () => {
          const box = await menu.boundingBox();
          if (box === null) return false;
          return (
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= viewport.width &&
            box.y + box.height <= viewport.height
          );
        })
        .toBe(true);
    });
  }

  test("PRD 11 demo: Christmas Eve lunch in 4 steps, one chip on the quiet December calendar", async ({
    mockedPage: page,
  }) => {
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    // F-close has no Weeknights: every date is the regular week, except the closed Lunch.
    await serveDays(page, {
      weeknights: false,
      lunchClosed: (date) => state.saved() !== null && date === "2026-12-24",
    });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: "Close", exact: true });
    await dialog.getByText("One service", { exact: true }).click();
    await dialog.getByRole("button", { name: "Christmas Eve · Thu, Dec 24" }).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    await expect(
      notifications(page).getByText("Lunch closed on Thu, Dec 24", { exact: true })
    ).toBeVisible();
    expect(counter.count()).toBeLessThanOrEqual(5);
    record("PRD 11 demo", counter.count(), 5);

    await layerOption(page, "Calendar").click();
    await expect(page.getByRole("grid")).toBeVisible();
    await nextMonth(page).click();
    const eve = page.locator('[data-date="2026-12-24"]').first();
    await expect(eve).toContainText("Lunch closed");
    // Dates that are the regular week carry no schedule or service names.
    for (const date of ["2026-12-04", "2026-12-07", "2026-12-15", "2026-12-18"]) {
      await expect(page.locator(`[data-date="${date}"]`).first()).not.toContainText(
        /Regular|Lunch|Dinner/
      );
    }
  });
});
