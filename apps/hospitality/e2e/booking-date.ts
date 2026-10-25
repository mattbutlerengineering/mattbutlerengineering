import type { Page } from "@playwright/test";

const MAX_MONTH_STEPS = 3;

/**
 * Picks `isoDate` in the booking widget's date step. The step is a rialto
 * `Calendar` grid, so there is no input to fill: find the day's cell,
 * paging forward a month at a time until it is on screen.
 */
export async function pickBookingDate(page: Page, isoDate: string): Promise<void> {
  const cell = page.locator(`[role="gridcell"][data-date="${isoDate}"]`);
  for (let step = 0; step < MAX_MONTH_STEPS && (await cell.count()) === 0; step++) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await cell.click();
}
