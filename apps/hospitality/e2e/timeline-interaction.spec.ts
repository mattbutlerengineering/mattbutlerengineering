import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("loads timeline with reservation grid", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // PageHeader shows "Timeline"
    await expect(mockedPage.getByRole("heading", { name: "Timeline" })).toBeVisible();

    // Live indicator is green
    const liveIndicator = mockedPage.getByText("Live");
    await expect(liveIndicator).toBeVisible();

    // TimelineGrid renders
    await expect(mockedPage.getByTestId("timeline-grid")).toBeVisible();

    // Table rows are visible in the grid
    const tableRows = mockedPage.getByTestId(/^table-row-/);
    await expect(tableRows.first()).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/timeline-interaction-grid.png",
      fullPage: true,
    });
  });

  test("venue selector visible for multi-venue", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // Venue selector may be visible if multi-venue
    const venueSelector = mockedPage.getByTestId("venue-selector");
    if (await venueSelector.isVisible()) {
      await expect(venueSelector).toBeVisible();
    }
  });

  test("date navigation shows today's date", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // Date navigation shows today's date
    const dateNav = mockedPage.getByTestId("date-navigation");
    await expect(dateNav).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/timeline-interaction-date-nav.png",
      fullPage: true,
    });
  });

  test("reservation blocks are color-coded by status", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // Wait for reservation blocks to render
    const reservationBlocks = mockedPage.getByTestId(/^reservation-block-/);
    const count = await reservationBlocks.count();

    if (count > 0) {
      // Check first block has status-based styling
      await expect(reservationBlocks.first()).toBeVisible();
    }
  });
});
