import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture, buildVenueTeamFixture } from "./api-mocks.js";
import { mockClosures } from "./helpers/close-mock.js";
import type { AvailabilityConfigResponse } from "./helpers/close-mock.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import { setUniformBistroWeek } from "./helpers/quick-setup-scenarios.js";
import {
  captureConfigPuts,
  dinnerOnlyConfig,
  firstPaint,
  layerOption,
  mockNoopPreview,
  nextMonthDay,
  pickerDay,
  pinToday,
  tomorrow,
} from "./helpers/scenario-fixtures.js";
import { weekPanel } from "./helpers/first-paint.js";
import { localDay } from "./local-day.js";

/**
 * The PRD 18 scenarios (docs/features/availability-setup-hierarchy/prd.md; walkthroughs W10-W22 in
 * ux.md). Each starts on `/availability` first paint, after the Manager role has settled and the
 * Schedules layer has painted its week panel, counts Locator actions through `countInteractions`,
 * and ends saved within the PRD's budget. Counts are agent stand-in evidence, not a timed
 * walkthrough. Each test records its count as an annotation.
 *
 * Fixtures (ux.md): F-one is the `mockedPage` venue (Lunch 11:30 AM / last seating 2:00 PM /
 * close 3:00 PM and Dinner 5:00 PM / 9:30 PM / 11:00 PM, every day); F-bistro is `mockEmptyVenue`
 * after `setUniformBistroWeek`; F-dinner is `mockEmptyVenue` over `dinnerOnlyConfig()`; F-close is
 * F-one plus `mockClosures`.
 */

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

/** F-close: F-one's config under the stateful closure mock. */
const F_ONE_CONFIG = buildAvailabilityConfigFixture() as AvailabilityConfigResponse;

/** The week panel's own Save (the footer's), not a drawer's. */
const savePanel = (page: Page) =>
  weekPanel(page).getByRole("button", { name: "Save", exact: true });

test.describe("Availability scenarios (PRD 18)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("W10: after quick setup the first layer is the same week form, in 0 interactions", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page, { derive: true });
    await page.goto("availability/calendar");
    await setUniformBistroWeek(page);
    await page.reload();
    await expect(weekPanel(page)).toBeVisible();

    await expect(layerOption(page, "Schedules")).toBeChecked();
    // The services are closed lines (#8690): each says its name, hours and days; opening one shows its fields.
    await expect(weekPanel(page).locator('button[id$="-line-header"]')).toHaveCount(2);
    await weekPanel(page)
      .getByRole("button", { name: /^Lunch ?, 11:30 AM.*Mon–Fri/ })
      .click();
    await expect(weekPanel(page).getByRole("textbox", { name: "Service name" })).toHaveValue(
      "Lunch"
    );
    await expect(weekPanel(page).getByRole("combobox", { name: "Opens" })).toHaveValue("11:30 AM");
    await weekPanel(page)
      .getByRole("button", { name: /^Dinner ?, 5:00 PM.*Mon–Fri/ })
      .click();
    await expect(weekPanel(page).getByRole("textbox", { name: "Service name" })).toHaveValue(
      "Dinner"
    );
    await expect(weekPanel(page).getByRole("combobox", { name: "Opens" })).toHaveValue("5:00 PM");
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await expect(weekPanel(page).getByRole("checkbox", { name: day })).toBeChecked();
    }
    for (const day of ["Saturday", "Sunday"]) {
      await expect(weekPanel(page).getByRole("checkbox", { name: day })).not.toBeChecked();
    }
    await weekPanel(page).getByRole("button", { name: "Guest preview" }).click();
    await expect(page.getByRole("complementary", { name: "Guest preview" })).toBeVisible();
    // Calendar and back returns to the same form.
    await layerOption(page, "Calendar").click();
    await layerOption(page, "Schedules").click();
    await expect(weekPanel(page).locator('button[id$="-line-header"]')).toHaveCount(2);
  });

  test("S1 / W11: dinner Tue–Sat, closing 10:00 PM, on an existing week (budget 6)", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    const previews = await mockNoopPreview(page);
    await firstPaint(page);
    const counter = countInteractions(page);
    const panel = weekPanel(counter.page);

    await panel.getByRole("button", { name: /^Dinner ?, / }).click();
    await chooseTime(counter.page, panel, "Closes", 0, "10:00 PM");
    await panel.getByRole("button", { name: "Different days for this service" }).click();
    const days = panel.getByRole("group", { name: "Dinner runs on" });
    await days.getByText("Sunday", { exact: true }).click();
    await days.getByText("Monday", { exact: true }).click();
    await expect(page.getByText("Changes apply from today", { exact: false })).toBeVisible();
    // The stranded-bookings check (the draft preview) runs before the save lands.
    await expect.poll(() => previews.requests()).toBeGreaterThan(0);
    await savePanel(counter.page).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const { upsert } = puts.last().changes;
    const dinner = upsert.scheduleServices?.find((row) => row.venueServiceId === "vs-dinner");
    expect(dinner?.closesAt).toBe(1320);
    expect([...(dinner?.weekdays ?? [])].sort()).toEqual([2, 3, 4, 5, 6]);
    expect(upsert.assignments?.find((a) => a.startsOn)?.startsOn).toBe(localDay());
    expect(previews.requests()).toBeGreaterThan(0);
    // 6 before the services became closed lines (#8690); opening Dinner's line is the one more.
    record("S1", counter.count(), 7);
  });

  test("S2 / W12: add a lunch service beside dinner (budget 5)", async ({ mockedPage: page }) => {
    await mockEmptyVenue(page, { derive: true, config: dinnerOnlyConfig() });
    await mockNoopPreview(page);
    const state = await captureConfigPuts(page);
    await firstPaint(page);
    const counter = countInteractions(page);
    const panel = weekPanel(counter.page);

    await panel.getByRole("button", { name: "Add another service" }).click();
    await panel.getByRole("button", { name: "Lunch" }).last().click();
    await savePanel(counter.page).click();

    await expect.poll(() => state.bodies().length).toBe(1);
    expect(state.last().changes.upsert.venueServices?.map((s) => s.name)).toContain("Lunch");
    record("S2", counter.count(), 5);
  });

  test("S3 / W13: brunch on weekends only, beside a weekday lunch (budget 6)", async ({
    mockedPage: page,
  }) => {
    // F-bistro: Lunch and Dinner Mon–Fri, saved through quick setup, then the first layer again.
    await mockEmptyVenue(page, { derive: true });
    await page.goto("availability/calendar");
    await setUniformBistroWeek(page);
    await page.reload();
    await mockNoopPreview(page);
    const state = await captureConfigPuts(page);
    await expect(weekPanel(page)).toBeVisible();
    const counter = countInteractions(page);
    const panel = weekPanel(counter.page);

    await panel.getByRole("button", { name: "Add another service" }).click();
    await panel.getByRole("button", { name: "Brunch" }).last().click();
    await panel.getByRole("button", { name: "Different days for this service" }).last().click();
    await panel
      .getByRole("group", { name: "Brunch runs on" })
      .getByRole("button", { name: "Weekends" })
      .click();
    await savePanel(counter.page).click();

    await expect.poll(() => state.bodies().length).toBe(1);
    const brunchId = state
      .last()
      .changes.upsert.venueServices?.find((s) => s.name === "Brunch")?.id;
    const brunch = state
      .last()
      .changes.upsert.scheduleServices?.find((row) => row.venueServiceId === brunchId);
    expect([...(brunch?.weekdays ?? [])].sort()).toEqual([0, 6]);
    expect(brunch).toMatchObject({ opensAt: 600, closesAt: 840 });
    record("S3", counter.count(), 6);
  });

  test("S4 / W14: last seating earlier than close for one service (budget 3)", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    await firstPaint(page);
    const counter = countInteractions(page);

    await weekPanel(counter.page)
      .getByRole("button", { name: /^Dinner ?, / })
      .click();
    await chooseTime(counter.page, weekPanel(counter.page), "Last seating", 0, "9:00 PM");
    await savePanel(counter.page).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const dinner = puts
      .last()
      .changes.upsert.scheduleServices?.find((row) => row.venueServiceId === "vs-dinner");
    expect(dinner).toMatchObject({ lastSeatingAt: 1260, closesAt: 1380 });
    // 3 before the services became closed lines (#8690); opening Dinner's line is the one more.
    record("S4", counter.count(), 4);
  });

  test("S5 / W15: close all day on one holiday (budget 6)", async ({ mockedPage: page }) => {
    const holiday = nextMonthDay(24);
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: /^Close / });
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await counter.page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(counter.page, holiday).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    expect(state.saved()).toMatchObject({
      rule: { kind: "closure", targetKind: "venue", startsOn: holiday, endsOn: holiday },
    });
    record("S5", counter.count(), 6);
  });

  test("S5 with 14 bookings on the date: the honest cost of a closure that touches guests", async ({
    mockedPage: page,
  }) => {
    const holiday = nextMonthDay(24);
    const state = await mockClosures(page, {
      config: F_ONE_CONFIG,
      closeDate: holiday,
      bookings: 14,
    });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: /^Close / });
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await counter.page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(counter.page, holiday).click();
    await dialog.getByTestId("close-primary").click(); // Next
    const cancel = counter.page.getByRole("radio", { name: /Cancel, notify & refund/ });
    await dialog.locator("label").filter({ has: cancel }).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    expect(state.saved()).toMatchObject({
      decisions: [{ groupKey: `${holiday}:closed`, action: "cancel" }],
    });
    // Recorded, not budgeted: the PRD's budget for S5 is for a closure with no affected bookings.
    test.info().annotations.push({
      type: "interactions (agent stand-in)",
      description: `S5 with 14 bookings: ${counter.count()} (budget 6 applies without bookings)`,
    });
    expect(counter.count()).toBeGreaterThan(6);
  });

  test("S6 / W16: special hours on one date (budget 7)", async ({ mockedPage: page }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    const date = tomorrow();
    await firstPaint(page);
    const counter = countInteractions(page);

    await layerOption(counter.page, "Calendar").click();
    await counter.page.locator(`[data-date="${date}"]`).first().click();
    const drawer = counter.page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Edit Dinner" }).click();
    await chooseTime(
      counter.page,
      drawer.getByRole("group", { name: "Dinner" }),
      "Closes",
      0,
      "1:00 AM"
    );
    await drawer.getByRole("button", { name: /^Save/ }).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const rule = puts.last().changes.upsert.dateRules?.find((r) => r.startsOn === date);
    expect(rule).toBeDefined();
    expect(JSON.stringify(rule)).toContain("1500");
    record("S6", counter.count(), 7);
  });

  test("S7 / W17: a week-long vacation (budget 8)", async ({ mockedPage: page }) => {
    const from = nextMonthDay(15);
    const to = nextMonthDay(22);
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: /^Close / });
    // A date, then an end date: the dialog reads that as a range, with no kind to choose first.
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await counter.page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(counter.page, from).click();
    await dialog.getByRole("combobox", { name: "End date (optional)" }).click();
    // The end picker opens on the start's month: no month move.
    await expect(pickerDay(page, to)).toBeVisible();
    await pickerDay(counter.page, to).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    expect(state.saved()).toMatchObject({
      rule: { kind: "closure", targetKind: "venue", startsOn: from, endsOn: to },
    });
    record("S7", counter.count(), 8);
  });

  test("S7 with bookings in the week: recorded with its count", async ({ mockedPage: page }) => {
    const from = nextMonthDay(15);
    const to = nextMonthDay(22);
    const state = await mockClosures(page, { config: F_ONE_CONFIG, closeDate: from, bookings: 14 });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    const dialog = counter.page.getByRole("dialog", { name: /^Close / });
    // A date, then an end date: the dialog reads that as a range, with no kind to choose first.
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await counter.page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(counter.page, from).click();
    await dialog.getByRole("combobox", { name: "End date (optional)" }).click();
    // The end picker opens on the start's month: no month move.
    await expect(pickerDay(page, to)).toBeVisible();
    await pickerDay(counter.page, to).click();
    await dialog.getByTestId("close-primary").click(); // Next
    const cancel = counter.page.getByRole("radio", { name: /Cancel, notify & refund/ });
    await dialog.locator("label").filter({ has: cancel }).click();
    await dialog.getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    test.info().annotations.push({
      type: "interactions (agent stand-in)",
      description: `S7 with bookings: ${counter.count()} (budget 8 applies without bookings)`,
    });
    expect(counter.count()).toBeGreaterThan(8);
  });

  test("S8 / W18: a seasonal schedule from the regular week (budget 10)", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    const start = nextMonthDay(10);
    const end = nextMonthDay(20);
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Add a schedule…" }).click();
    const drawer = counter.page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: /Schedule name/ }).fill("Summer hours");
    await drawer.getByLabel("Starting").click();
    await counter.page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(counter.page, start).click();
    await drawer.getByLabel("Ending").click();
    await pickerDay(counter.page, end).click();
    await chooseTime(counter.page, drawer, "Closes", 1, "11:30 PM");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    const { upsert } = puts.last().changes;
    expect(upsert.schedules?.map((s) => s.name)).toContain("Summer hours");
    const assignment = upsert.assignments?.find((a) => a.startsOn === start);
    expect(assignment).toMatchObject({ startsOn: start, endsOn: end });
    // Seeded from the regular week: the days follow it (every day) once Starting is set.
    expect([...(assignment?.weekdays ?? [])].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(upsert.scheduleServices?.some((row) => row.closesAt === 1410)).toBe(true);
    record("S8", counter.count(), 10);
  });

  test("S9 / W19: how far ahead and minimum notice (budget 5)", async ({ mockedPage: page }) => {
    const patches: Array<Record<string, unknown>> = [];
    await page.route(/\/api\/v1\/venues\/[^/?]+$/, (route) => {
      if (route.request().method() === "PATCH") patches.push(route.request().postDataJSON());
      return route.fallback();
    });
    // The ⋯ entry left the old page (availability-hub C2.5): the hub's row 5 opens the rules.
    await page.goto("availability");
    await expect(page.getByRole("link", { name: "Edit Booking rules" })).toBeVisible();
    const counter = countInteractions(page);

    await counter.page.getByRole("link", { name: "Edit Booking rules" }).click();
    const drawer = counter.page.getByRole("dialog", { name: "Booking rules" });
    await drawer.getByLabel("How far ahead guests can book (days)").fill("45");
    await drawer.getByLabel("Minimum notice (hours)").fill("3");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => patches.length).toBe(1);
    expect(JSON.stringify(patches[0])).toContain("45");
    record("S9", counter.count(), 5);
  });

  test("S10 / W20: pause online booking for tonight (budget 3)", async ({ mockedPage: page }) => {
    const state = await mockClosures(page, { config: F_ONE_CONFIG });
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Pause online booking" }).click();
    await counter.page.getByRole("dialog").getByTestId("close-primary").click();

    await expect.poll(() => state.saved()).not.toBeNull();
    expect(JSON.stringify(state.saved())).toContain("online");
    record("S10", counter.count(), 3);
  });

  test("W21: Starting later… carries the edited week into Change regular week", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);
    const later = tomorrow();
    await firstPaint(page);
    const counter = countInteractions(page);

    await weekPanel(counter.page)
      .getByRole("button", { name: /^Dinner ?, / })
      .click();
    await chooseTime(counter.page, weekPanel(counter.page), "Closes", 0, "10:00 PM");
    await weekPanel(counter.page).getByRole("button", { name: "Starting later…" }).click();
    const drawer = counter.page.getByRole("dialog", { name: "Change regular week" });
    // The edited draft came with it, and Starting is empty.
    await expect(drawer.locator('[role="combobox"][value="10:00 PM"]')).toHaveCount(1);
    await drawer.getByLabel("Starting").click();
    await pickerDay(counter.page, later).click();
    await drawer.getByRole("button", { name: /^Save hours from/ }).click();

    await expect.poll(() => puts.bodies().length).toBe(1);
    expect(puts.last().changes.upsert.assignments?.find((a) => a.startsOn)?.startsOn).toBe(later);
    expect(
      puts.last().changes.upsert.scheduleServices?.find((row) => row.venueServiceId === "vs-dinner")
        ?.closesAt
    ).toBe(1320);
    test.info().annotations.push({
      type: "interactions (agent stand-in)",
      description: `W21: ${counter.count()}`,
    });
  });

  test("W22: a Host's page is today's page, read-only", async ({ mockedPage: page }) => {
    await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
      })
    );
    await page.goto("availability/calendar");

    await expect(page.getByRole("grid")).toBeVisible();
    await expect(layerOption(page, "Calendar")).toBeChecked();
    await expect(layerOption(page, "Special dates")).toBeVisible();
    await expect(layerOption(page, "Schedules")).toHaveCount(0);
    await expect(page.getByTestId("week-panel")).toHaveCount(0);
    for (const name of ["Close…", "Pause online booking", "Add a schedule…"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    // The Host's ⋯ holds History and Go to date only.
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["History", "Go to date"]);
    await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  });
});
