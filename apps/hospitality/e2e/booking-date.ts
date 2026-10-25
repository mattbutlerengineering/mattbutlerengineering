import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Picks `isoDate` in the booking widget's date step. The step is a rialto
 * `Calendar` grid, so there is no input to fill: wait for the grid, then click
 * the day's cell. The grid always shows six weeks, so any date within the next
 * few days is on screen without paging (and paging buttons are localized).
 */
export async function pickBookingDate(page: Page, isoDate: string): Promise<void> {
  await expect(page.getByRole("grid")).toBeVisible();
  await page.locator(`[role="gridcell"][data-date="${isoDate}"]`).click();
}
