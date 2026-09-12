import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

/** ux.md Screen 2: the skeleton, never a spinner, inside a second of arriving. */
const SKELETON_DEADLINE_MS = 1_000;
/** Long enough that the skeleton is unmistakably the loading state, not a flash. */
const TABLES_DELAY_MS = 5_000;
const GRID_DEADLINE_MS = TABLES_DELAY_MS + 5_000;
const SERVER_ERROR_BODY = '{"error":"server error"}';

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("timeline page loads with grid", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    await expect(mockedPage.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(mockedPage.getByText("Live")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/timeline-loaded.png", fullPage: true });
  });

  test("timeline shows date navigation", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    await expect(mockedPage.getByRole("button", { name: /Previous day/i })).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: /Next day/i })).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/timeline-date-nav.png", fullPage: true });
  });

  test("late-evening clock (23:30 local) still shows today's fixture reservations", async ({
    mockedPage,
  }) => {
    // The mock re-dates fixtures to the runner's local day and the app filters on the
    // browser-local day; both must agree at 23:30, when the UTC date has already rolled
    // over west of Greenwich (P01 mock half, audit A1). Fix the browser clock before load.
    const localToday = new Date().toLocaleDateString("en-CA");
    await mockedPage.clock.setFixedTime(new Date(`${localToday}T23:30:00`));
    await mockedPage.goto("timeline");

    await expect(mockedPage.getByTestId("timeline-grid")).toBeVisible();
    await expect(mockedPage.getByTestId("reservation-block-res_e2e_001")).toBeVisible();
  });
});

// Item 15's load axis: the grid area is rendered by fetch state alone, and the stats row is
// honest about not knowing ("—", "<label>, unavailable") without moving.
test.describe("Timeline load axis: skeleton, fetch failure, and no tables are three different screens", () => {
  test("shows the skeleton within 1 s while /tables is slow, and the stats row does not move when the numbers arrive", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/api/v1/tables?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, TABLES_DELAY_MS));
      await route.fallback();
    });
    await mockedPage.goto("timeline");

    // The budget is the page's, not the chunk waterfall's: start it once the page has mounted.
    await expect(mockedPage.getByTestId("date-navigation")).toBeVisible();
    await expect(mockedPage.getByTestId("timeline-skeleton")).toBeVisible({
      timeout: SKELETON_DEADLINE_MS,
    });
    const stats = mockedPage.getByTestId("timeline-stats");
    await expect(
      stats.getByRole("group", { name: "Reservations, unavailable", exact: true })
    ).toBeVisible();
    // "Offline" → "Live" reflows the row once the SSE state settles; measure after it has.
    await expect(stats.getByText("Live", { exact: true })).toBeVisible();
    const before = await stats.boundingBox();

    await expect(mockedPage.getByTestId("timeline-grid")).toBeVisible({
      timeout: GRID_DEADLINE_MS,
    });
    await expect(mockedPage.getByTestId("timeline-skeleton")).toHaveCount(0);
    await expect(stats.getByRole("group", { name: "Reservations", exact: true })).toBeVisible();
    const after = await stats.boundingBox();
    expect(after).toEqual(before);
  });

  test('tables 500 → "Couldn\'t load tonight." with Retry, Walk-in disabled and described, no grid', async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/api/v1/tables?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: SERVER_ERROR_BODY })
    );
    await mockedPage.goto("timeline");

    await expect(
      mockedPage.getByRole("heading", { name: "Couldn't load tonight.", exact: true })
    ).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    const walkIn = mockedPage
      .getByTestId("date-navigation")
      .getByRole("button", { name: "Walk-in", exact: true });
    await expect(walkIn).toBeDisabled();
    await expect(walkIn).toHaveAccessibleDescription(
      "Walk-ins need the tables loaded — Retry above."
    );
    await expect(mockedPage.getByTestId("timeline-grid")).toHaveCount(0);
    await expect(mockedPage.getByTestId("timeline-empty-night")).toHaveCount(0);
    await expect(
      mockedPage.getByRole("heading", { name: "No tables yet.", exact: true })
    ).toHaveCount(0);
  });

  test('tables empty → "No tables yet." with the Floor plans link, Walk-in enabled, no error surface', async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/api/v1/tables?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: {
            page: 1,
            limit: 50,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        }),
      })
    );
    await mockedPage.goto("timeline");

    await expect(
      mockedPage.getByRole("heading", { name: "No tables yet.", exact: true })
    ).toBeVisible();
    await expect(mockedPage.getByRole("link", { name: "Floor plans", exact: true })).toBeVisible();
    await expect(
      mockedPage
        .getByTestId("date-navigation")
        .getByRole("button", { name: "Walk-in", exact: true })
    ).toBeEnabled();
    await expect(mockedPage.getByTestId("timeline-empty-night")).toHaveCount(0);
    await expect(mockedPage.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await expect(
      mockedPage.getByRole("heading", { name: "Couldn't load tonight.", exact: true })
    ).toHaveCount(0);
  });
});

// Item 16: the now-line is the browser's clock, the grid scrolls to it, and an empty book that
// loaded is a quiet night — never the same screen as a fetch that failed.
test.describe("Item 16: the now-line, scroll-to-now, and the quiet night", () => {
  const localToday = new Date().toLocaleDateString("en-CA");
  const nextDay = new Date(`${localToday}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const localTomorrow = nextDay.toLocaleDateString("en-CA");
  const EMPTY_RESERVATIONS_BODY = JSON.stringify({
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  });
  /** The grid's `scrollLeft` once scroll-to-now (ux.md Screen 5: a quarter of the way across) settles. */
  const expectedScrollLeft = (grid: Locator) =>
    grid.evaluate((el) => {
      const nowLine = el.querySelector<HTMLElement>('[data-testid="now-line"]');
      if (!nowLine) return null;
      const target = Math.max(0, parseFloat(nowLine.style.left) - el.clientWidth * 0.25);
      return Math.min(target, el.scrollWidth - el.clientWidth);
    });
  const expectScrolledToNow = async (grid: Locator) => {
    const expected = await expectedScrollLeft(grid);
    expect(expected).not.toBeNull();
    await expect
      .poll(async () =>
        Math.abs((await grid.evaluate((el) => el.scrollLeft)) - (expected as number))
      )
      .toBeLessThanOrEqual(1);
  };

  test("P01: at 20:00 local the now-line reads 8:00 PM and the grid scrolls to it", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(new Date(`${localToday}T20:00:00`));
    await mockedPage.goto("timeline");

    const nowLine = mockedPage.getByTestId("now-line");
    await expect(nowLine).toBeVisible();
    await expect(nowLine).toContainText("8:00 PM");
    // Still today's page: no Today button, the fixture's blocks in place.
    await expect(
      mockedPage.getByTestId("date-navigation").getByRole("button", { name: "Today", exact: true })
    ).toHaveCount(0);
    await expect(mockedPage.getByTestId("reservation-block-res_e2e_001")).toBeVisible();
    await expectScrolledToNow(mockedPage.getByTestId("timeline-grid"));
  });

  test("P01: at 14:00 local the now-line reads 2:00 PM, six hours to the left of 8:00 PM", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(new Date(`${localToday}T14:00:00`));
    await mockedPage.goto("timeline");

    const nowLine = mockedPage.getByTestId("now-line");
    await expect(nowLine).toBeVisible();
    await expect(nowLine).toContainText("2:00 PM");
    // Desktop grid: 120 px table column + 3 hours × 120 px since the 11 AM column.
    await expect(nowLine).toHaveCSS("left", "480px");
  });

  test("no now-line on another date; Today brings it back and re-scrolls to it", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(new Date(`${localToday}T20:00:00`));
    await mockedPage.goto(`timeline?date=${localTomorrow}`);

    const grid = mockedPage.getByTestId("timeline-grid");
    await expect(grid).toBeVisible();
    await expect(mockedPage.getByTestId("now-line")).toHaveCount(0);

    await mockedPage
      .getByTestId("date-navigation")
      .getByRole("button", { name: "Today", exact: true })
      .click();
    await expect(mockedPage).toHaveURL(new RegExp(`[?&]date=${localToday}`));
    await expect(mockedPage.getByTestId("now-line")).toBeVisible();
    await expectScrolledToNow(grid);
  });

  test("tonight with tables and no reservations: the quiet night over the rows, its Walk-in opens the dialog", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: EMPTY_RESERVATIONS_BODY })
    );
    await mockedPage.goto("timeline");

    const quietNight = mockedPage.getByTestId("timeline-empty-night");
    await expect(quietNight).toBeVisible();
    await expect(
      quietNight.getByRole("heading", { name: "Quiet so far.", exact: true })
    ).toBeVisible();
    // The rows stay underneath — the Host can still read the floor.
    await expect(mockedPage.getByTestId("table-row-tbl_e2e_001")).toBeVisible();
    await expect(mockedPage.getByRole("alert")).toHaveCount(0);

    await quietNight.getByRole("button", { name: "Walk-in", exact: true }).click();
    await expect(mockedPage.getByRole("dialog", { name: "Seat walk-in" })).toBeVisible();
  });

  test("another date with no reservations: the other-date quiet night, Back to today returns to today", async ({
    mockedPage,
  }) => {
    await mockedPage.goto(`timeline?date=${localTomorrow}`);

    const quietNight = mockedPage.getByTestId("timeline-empty-night");
    await expect(quietNight).toBeVisible();
    await expect(
      quietNight.getByRole("heading", { name: /^Nothing on the book for / })
    ).toBeVisible();
    await expect(quietNight.getByRole("button", { name: "Walk-in", exact: true })).toHaveCount(0);

    await quietNight.getByRole("button", { name: "Back to today", exact: true }).click();
    await expect(mockedPage).toHaveURL(new RegExp(`[?&]date=${localToday}`));
    await expect(mockedPage.getByTestId("reservation-block-res_e2e_001")).toBeVisible();
    await expect(quietNight).toHaveCount(0);
  });

  test("reservations 500 with tables loaded: the load banner beside the grid, never a quiet night", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: SERVER_ERROR_BODY })
    );
    await mockedPage.goto("timeline");

    await expect(mockedPage.getByTestId("timeline-grid")).toBeVisible();
    await expect(mockedPage.getByRole("alert")).toContainText(
      "Couldn't load tonight's reservations."
    );
    await expect(mockedPage.getByTestId("timeline-empty-night")).toHaveCount(0);
  });
});
