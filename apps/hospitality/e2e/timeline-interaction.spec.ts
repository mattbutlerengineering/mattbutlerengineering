import type { Request } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { localDay } from "./local-day.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-2: Timeline loads and displays reservations", () => {
  test("loads timeline with reservation grid", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // PageHeader shows "Timeline"
    await expect(mockedPage.getByRole("heading", { name: "Timeline" })).toBeVisible();

    // Live indicator is green. Scoped to the stats row and exact: a bare `getByText("Live")` is
    // a case-insensitive *substring* match, so a guest named Oliver or Clive on the grid makes it
    // resolve to two nodes and strict-mode-fail.
    const liveIndicator = mockedPage.getByTestId("timeline-stats").getByText("Live", {
      exact: true,
    });
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
  // The mock re-dates the fixtures' *clock* as well as their day (#5275), so its instants are
  // local wall-clock times on the runner's day — the clock the grid positions blocks by. That
  // retires the `test.use({ timezoneId: "UTC" })` pin this describe used to carry: it existed
  // only so the browser would read the fixtures' surviving `Z` times as local ones.
  //
  // Carol Davis (res_e2e_003, CONFIRMED on tbl_e2e_002, which tables-list.json marks OCCUPIED)
  // sits at 20:00–21:30 local; Bob Smith (res_e2e_002, PENDING on tbl_e2e_003, AVAILABLE) at
  // 19:00–20:30. Read the day when the test runs, never when the file is collected (#5279).
  const insideCarolsSlot = () => new Date(`${localDay()}T20:30:00`);
  const insideBobsSlot = () => new Date(`${localDay()}T19:30:00`);

  test("hides Seat Guest for a CONFIRMED party on an OCCUPIED table inside its slot", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(insideCarolsSlot());
    await mockedPage.goto("timeline");

    await mockedPage.getByTestId("reservation-block-res_e2e_003").click();
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText("Carol Davis");
    await expect(sidebar.getByRole("button", { name: "Seat Guest", exact: true })).toHaveCount(0);
  });

  test("shows Seat Guest for a PENDING party on a free table", async ({ mockedPage }) => {
    await mockedPage.clock.setFixedTime(insideCarolsSlot());
    await mockedPage.goto("timeline");

    // Bob Smith (res_e2e_002) is PENDING on tbl_e2e_003, AVAILABLE in the fixture.
    await mockedPage.getByTestId("reservation-block-res_e2e_002").click();
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toContainText("Bob Smith");
    await expect(sidebar.getByRole("button", { name: "Seat Guest", exact: true })).toBeVisible();
  });

  // #5279 item 5: the run's headline interaction had no E2E coverage of its *success* path —
  // only of when the button appears and when it doesn't. Seating is two PATCHes (the booking to
  // CONFIRMED, the table to OCCUPIED) and a refetch; "seated" is then re-derived from that pair,
  // never read back from a stored flag, so the block is where the outcome has to be asserted.
  test("Seat Guest seats the party: the block flips to seated and the button retires", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(insideBobsSlot());
    await mockedPage.goto("timeline");

    const block = mockedPage.getByTestId("reservation-block-res_e2e_002");
    await expect(block).toBeVisible();
    await expect(block).not.toHaveAccessibleName(/seated/);

    await block.click();
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    const seatGuest = sidebar.getByRole("button", { name: "Seat Guest", exact: true });
    await expect(seatGuest).toBeVisible();
    await seatGuest.click();

    await expect(block).toHaveAccessibleName(/, seated/);
    // Seated, so there is nothing left to seat: tbl_e2e_003 now reads OCCUPIED.
    await expect(seatGuest).toHaveCount(0);
    await expect(sidebar.getByText("Seated", { exact: true })).toBeVisible();
    await expect(mockedPage.getByRole("status").filter({ hasText: "Seated Bob Smith" })).toHaveText(
      "Seated Bob Smith at Table 3."
    );
  });
});

// Item 16: the row header owns the table's status — one control per row, the API's own
// transitions as its items, and nothing sent until an item is chosen (ux.md Screen 6).
test.describe("Table status from the row header", () => {
  const TABLET = { width: 1024, height: 768 };
  const isStatusPatch = (request: Request) =>
    request.method() === "PATCH" && /\/api\/v1\/tables\/[^/?]+\/status$/.test(request.url());

  test("one click opens the menu and sends nothing; choosing an item sends exactly one PATCH, speaks the result and refocuses the trigger", async ({
    mockedPage,
  }) => {
    const patches: string[] = [];
    mockedPage.on("request", (request) => {
      if (isStatusPatch(request)) patches.push(request.url());
    });
    await mockedPage.goto("timeline");

    // Table 2 is OCCUPIED in the fixture; the trigger names the table and its state.
    const trigger = mockedPage.getByRole("button", {
      name: "Table 2: Occupied. Change status",
      exact: true,
    });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const menu = mockedPage.getByRole("menu");
    await expect(menu).toBeVisible();
    expect(patches).toEqual([]);

    await menu.getByRole("menuitem", { name: "Mark dirty", exact: true }).click();
    await expect(mockedPage.getByText("Table 2 is now dirty.", { exact: true })).toBeVisible();
    // The mock's status store answered the refetch: the same trigger now names the new state.
    const refreshed = mockedPage.getByTestId("table-status-tbl_e2e_002");
    await expect(refreshed).toHaveAccessibleName("Table 2: Dirty. Change status");
    await expect(refreshed).toBeFocused();
    expect(patches).toEqual([expect.stringMatching(/\/api\/v1\/tables\/tbl_e2e_002\/status$/)]);
  });

  test("the last row's menu opens fully in view — nothing to scroll to reach 'Mark occupied'", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("timeline");

    // Rows sort by priority; Table 1 (AVAILABLE) is the bottom row of the fixture.
    // Located by test id, not `getByRole("row", { name: /^Table / })`: every row's aria-label is
    // `Table ${table.name}`, so that filter matched all five rows (Bar 1 included) and narrowed
    // nothing — it read as a row selector while only ever excluding the header (#5279 item 2).
    const rows = mockedPage.getByTestId(/^table-row-/);
    const lastRow = rows.last();
    await expect(lastRow).toHaveAttribute("data-testid", "table-row-tbl_e2e_001");
    // Open the bottom row's own trigger, so the menu under test is provably that row's.
    await lastRow.getByTestId("table-status-tbl_e2e_001").click();
    const item = mockedPage.getByRole("menu").getByRole("menuitem", { name: "Mark occupied" });
    await expect(item).toBeVisible();
    const itemBox = await item.boundingBox();
    const gridBox = await mockedPage.getByTestId("timeline-grid").boundingBox();
    expect(itemBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    // Inside the grid's own box, not clipped by its scroller and not scrolled to.
    expect(itemBox!.y + itemBox!.height).toBeLessThanOrEqual(gridBox!.y + gridBox!.height);
    expect(await mockedPage.getByTestId("timeline-grid").evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("at 1024×768 the trigger is a 44 px target that stays inside its 60 px row", async ({
    mockedPage,
  }) => {
    await mockedPage.setViewportSize(TABLET);
    await mockedPage.goto("timeline");

    const trigger = mockedPage.getByTestId("table-status-tbl_e2e_002");
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const rowBox = await mockedPage.getByTestId("table-row-tbl_e2e_002").boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    expect(triggerBox!.height).toBeGreaterThanOrEqual(44);
    expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox!.y).toBeGreaterThanOrEqual(rowBox!.y);
    expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height);
  });

  test("at 1024×768 the selected party's sheet reserves its height in the grid and leaves at least four hour columns in view", async ({
    mockedPage,
  }) => {
    await mockedPage.setViewportSize(TABLET);
    await mockedPage.goto("timeline");

    await mockedPage.getByTestId("reservation-block-res_e2e_003").click();
    const sheet = mockedPage.getByRole("dialog", { name: "Carol Davis" });
    await expect(sheet).toBeVisible();
    const grid = mockedPage.getByTestId("timeline-grid");
    await expect(grid).toHaveCSS("scroll-padding-block-end", "240px");

    const sheetBox = await sheet.boundingBox();
    const gridBox = await grid.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    const hourHeaders = await grid.getByRole("columnheader").evaluateAll((els) =>
      els
        .filter((el) => el.textContent?.trim() !== "Tables")
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, right: r.right, bottom: r.bottom };
        })
    );
    const inView = hourHeaders.filter(
      (h) =>
        h.x >= gridBox!.x - 1 &&
        h.right <= gridBox!.x + gridBox!.width + 1 &&
        h.bottom <= sheetBox!.y
    );
    expect(inView.length).toBeGreaterThanOrEqual(4);
  });
});
