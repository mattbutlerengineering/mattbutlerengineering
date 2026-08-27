import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

const TIMELINE_GRID_TESTID = "timeline-grid";
const MAX_TAB_PRESSES = 80;

/**
 * Reaches the element with the given data-testid using only real Tab key
 * presses — no `.click()` or `.focus()` anywhere in this spec. Bounded so a
 * layout regression fails loudly with a clear error instead of hanging.
 * Deliberately does not hardcode an exact Tab count: the number of
 * focusable elements before the Timeline grid (skip link, sidebar nav
 * items, header controls, date navigation) is an implementation detail
 * this spec should not pin.
 */
async function tabUntilFocused(
  page: Page,
  testId: string,
  maxTabs = MAX_TAB_PRESSES
): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const isFocused = await page.evaluate(
      (id) => document.activeElement?.getAttribute("data-testid") === id,
      testId
    );
    if (isFocused) return;
  }
  throw new Error(`Could not reach [data-testid="${testId}"] within ${maxTabs} Tab presses`);
}

test.describe("CF-2: Timeline keyboard accessibility", () => {
  test("keyboard-only user can navigate to and activate a reservation block", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("timeline");

    const grid = mockedPage.getByTestId(TIMELINE_GRID_TESTID);
    await expect(grid).toBeVisible();

    // Deterministic target from the stateful route mock: TimelineGrid sorts
    // tables by priority descending (useTimelineData.ts), so the keyboard
    // entry order is tbl_e2e_005 (no reservations) -> tbl_e2e_004
    // (res_e2e_004, Dave Wilson) -> tbl_e2e_003 (res_e2e_002, Bob Smith) ->
    // tbl_e2e_002 (res_e2e_003, Carol Davis) -> tbl_e2e_001 (res_e2e_001,
    // Alice Johnson). One ArrowRight (nothing focused) lands on the first
    // entry, Dave Wilson; two ArrowDowns walk down two more table rows to
    // Carol Davis. See e2e/fixtures/{tables,reservations}-list.json.
    const targetBlock = mockedPage.getByTestId("reservation-block-res_e2e_003");
    await expect(targetBlock).toBeVisible();

    // Tab (keyboard only) until the grid itself has focus.
    await tabUntilFocused(mockedPage, TIMELINE_GRID_TESTID);
    await expect(grid).toBeFocused();

    // Arrow keys move the roving focus across the grid.
    await mockedPage.keyboard.press("ArrowRight");
    await mockedPage.keyboard.press("ArrowDown");
    await mockedPage.keyboard.press("ArrowDown");

    // Enter activates the focused reservation block.
    await mockedPage.keyboard.press("Enter");

    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Carol Davis")).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/timeline-keyboard-nav-activated.png",
      fullPage: true,
    });
  });

  test("Space also activates the focused reservation block", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    const grid = mockedPage.getByTestId(TIMELINE_GRID_TESTID);
    await expect(grid).toBeVisible();

    // ArrowLeft with nothing focused jumps straight to the LAST keyboard
    // entry — res_e2e_001 (Alice Johnson, tbl_e2e_001), per the table order
    // documented in the test above.
    const targetBlock = mockedPage.getByTestId("reservation-block-res_e2e_001");
    await expect(targetBlock).toBeVisible();

    await tabUntilFocused(mockedPage, TIMELINE_GRID_TESTID);
    await expect(grid).toBeFocused();

    await mockedPage.keyboard.press("ArrowLeft");
    await mockedPage.keyboard.press(" ");

    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Alice Johnson")).toBeVisible();
  });
});
