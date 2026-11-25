import type { Page } from "@playwright/test";

/**
 * A fixed mid-month day (a Monday), so a spec that walks into "next month" does not depend on
 * the date CI runs on (#9573). Late in a month the visible range holds no future Tuesday and a
 * typed next-month range falls outside what the pickers offer; on the 15th neither can happen.
 */
export const MID_MONTH_DAY = "2026-06-15";

/** Pins the page's clock to noon on `MID_MONTH_DAY`; call it before the navigation under test. */
export async function pinMidMonth(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(`${MID_MONTH_DAY}T12:00:00`));
}

/** A day of the month after `MID_MONTH_DAY`'s, as `YYYY-MM-DD`: one "Next" away on the calendar. */
export function dayOfNextMonth(day: number): string {
  const [year, month] = MID_MONTH_DAY.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, day));
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${next.getUTCFullYear()}-${mm}-${dd}`;
}
