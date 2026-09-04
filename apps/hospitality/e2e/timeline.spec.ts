import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

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
