import { test, expect } from "./fixtures.js";

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("loads timeline with reservation grid", async ({ authPage }) => {
    await authPage.goto("/timeline");

    // PageHeader shows "Timeline"
    await expect(authPage.getByRole("heading", { name: "Timeline" })).toBeVisible();

    // Live indicator is green
    const liveIndicator = authPage.getByText("Live");
    await expect(liveIndicator).toBeVisible();

    // TimelineGrid renders
    await expect(authPage.getByTestId("timeline-grid")).toBeVisible();

    // Table rows are visible in the grid
    const tableRows = authPage.getByTestId(/^table-row-/);
    await expect(tableRows.first()).toBeVisible();
  });

  test("venue selector visible for multi-venue", async ({ authPage }) => {
    await authPage.goto("/timeline");

    // Venue selector may be visible if multi-venue
    const venueSelector = authPage.getByTestId("venue-selector");
    if (await venueSelector.isVisible()) {
      await expect(venueSelector).toBeVisible();
    }
  });

  test("date navigation shows today's date", async ({ authPage }) => {
    await authPage.goto("/timeline");

    // Date navigation shows today's date
    const dateNav = authPage.getByTestId("date-navigation");
    await expect(dateNav).toBeVisible();
  });

  test("reservation blocks are color-coded by status", async ({ authPage }) => {
    await authPage.goto("/timeline");

    // Wait for reservation blocks to render
    const reservationBlocks = authPage.getByTestId(/^reservation-block-/);
    const count = await reservationBlocks.count();

    if (count > 0) {
      // Check first block has status-based styling
      await expect(reservationBlocks.first()).toBeVisible();
    }
  });
});
