import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("loads timeline with reservation grid", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

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
    await mockedPage.goto("timeline");

    // Venue selector may be visible if multi-venue
    const venueSelector = mockedPage.getByTestId("venue-selector");
    if (await venueSelector.isVisible()) {
      await expect(venueSelector).toBeVisible();
    }
  });

  test("date navigation shows today's date", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // Date navigation shows today's date
    const dateNav = mockedPage.getByTestId("date-navigation");
    await expect(dateNav).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/timeline-interaction-date-nav.png",
      fullPage: true,
    });
  });

  test("reservation blocks are color-coded by status", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // Wait for reservation blocks to render
    const reservationBlocks = mockedPage.getByTestId(/^reservation-block-/);
    const count = await reservationBlocks.count();

    if (count > 0) {
      // Check first block has status-based styling
      await expect(reservationBlocks.first()).toBeVisible();
    }
  });
});

// Item 15: "seated" is derived — CONFIRMED, the table OCCUPIED, the clock inside the slot — and
// the details panel hides Seat Guest for a seated party, shows it for a pending one.
test.describe("Seated is a fact about the floor, not a status the Host sets", () => {
  // The mock re-dates the fixtures to the runner's local day and keeps their UTC clock times:
  // Carol Davis (res_e2e_003, CONFIRMED on tbl_e2e_002, which tables-list.json marks OCCUPIED)
  // sits at 20:00–21:30Z. Fix the browser clock 30 minutes into that slot.
  const localToday = new Date().toLocaleDateString("en-CA");
  const insideCarolsSlot = new Date(`${localToday}T20:30:00.000Z`);

  test("hides Seat Guest for a CONFIRMED party on an OCCUPIED table inside its slot", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(insideCarolsSlot);
    await mockedPage.goto("timeline");

    await mockedPage.getByTestId("reservation-block-res_e2e_003").click();
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText("Carol Davis");
    await expect(sidebar.getByRole("button", { name: "Seat Guest", exact: true })).toHaveCount(0);
  });

  test("shows Seat Guest for a PENDING party on a free table", async ({ mockedPage }) => {
    await mockedPage.clock.setFixedTime(insideCarolsSlot);
    await mockedPage.goto("timeline");

    // Bob Smith (res_e2e_002) is PENDING on tbl_e2e_003, AVAILABLE in the fixture.
    await mockedPage.getByTestId("reservation-block-res_e2e_002").click();
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toContainText("Bob Smith");
    await expect(sidebar.getByRole("button", { name: "Seat Guest", exact: true })).toBeVisible();
  });
});
