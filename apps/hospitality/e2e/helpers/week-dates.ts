import { expect, type Locator, type Page } from "@playwright/test";

/** Monday first: the order the strip and the calendar list a week in. */
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SERVICE_LINE = /^(Lunch|Brunch|Dinner) \d/;

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function plusDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday after the current week, so every date of the next week is in the future. */
export function nextMonday(today: string): string {
  const sinceMonday = (utc(today).getUTCDay() + 6) % 7;
  return plusDays(today, 7 - sinceMonday);
}

/** The service lines a strip row, a preview, a calendar cell or a drawer prints: "Dinner 5:00 PM – 9:15 PM". */
export async function serviceLines(scope: Locator): Promise<string[]> {
  const text = await scope.innerText();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => SERVICE_LINE.test(line));
}

/**
 * Each weekday of the week starting `monday`, as the calendar lists it in the week view. The day
 * list loads after the week renders, so each cell is polled until it shows a service or "Closed".
 */
export async function calendarWeek(page: Page, monday: string): Promise<Record<string, string[]>> {
  const week: Record<string, string[]> = {};
  for (const [offset, day] of WEEKDAYS.entries()) {
    const cell = page.locator(`[data-date="${plusDays(monday, offset)}"]`);
    await expect
      .poll(
        async () => (await serviceLines(cell)).length > 0 || /Closed/.test(await cell.innerText()),
        {
          message: `calendar, ${day}`,
        }
      )
      .toBe(true);
    week[day] = (await serviceLines(cell)).map((l) => l.replace("–", " – ").replace(/ +/g, " "));
  }
  return week;
}
