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

    await expect(mockedPage.getByTestId("timeline-skeleton")).toBeVisible({
      timeout: SKELETON_DEADLINE_MS,
    });
    const stats = mockedPage.getByTestId("timeline-stats");
    await expect(
      stats.getByRole("group", { name: "Reservations, unavailable", exact: true })
    ).toBeVisible();
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
    const walkIn = mockedPage.getByRole("button", { name: "Walk-in", exact: true });
    await expect(walkIn).toBeDisabled();
    await expect(walkIn).toHaveAccessibleDescription(
      "Walk-ins need the tables loaded — Retry above."
    );
    await expect(mockedPage.getByTestId("timeline-grid")).toHaveCount(0);
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
    await expect(mockedPage.getByRole("button", { name: "Walk-in", exact: true })).toBeEnabled();
    await expect(mockedPage.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await expect(
      mockedPage.getByRole("heading", { name: "Couldn't load tonight.", exact: true })
    ).toHaveCount(0);
  });
});
