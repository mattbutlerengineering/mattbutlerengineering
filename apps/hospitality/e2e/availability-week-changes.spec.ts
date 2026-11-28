import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { test, expect } from "./fixtures.js";
import { buildAvailabilityConfigFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";
import { firstPaint, layerOption, pinToday } from "./helpers/scenario-fixtures.js";

/**
 * #9933: "Next 7 days" sits under the page header on every layer. A Manager lands on Schedules,
 * sees a venue closure three days out listed there, and tapping it opens that day's drawer on
 * Calendar. The config is F-one (`mockApi`) plus that one closure.
 */

/** A `YYYY-MM-DD` as the app writes it, read as a civil date (never through the runner's zone). */
function calendarDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** `GET …/availability/config` for F-one with the venue closed all day on `date`. */
function withClosure(date: string) {
  const fixture = buildAvailabilityConfigFixture();
  const closure = {
    id: "dr-week-closure",
    kind: "closure",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    window: null,
  } as DateRule;
  const config: AvailabilityConfig = {
    ...(fixture.config as AvailabilityConfig),
    dateRules: [closure],
  };
  return { ...fixture, config };
}

test.describe("Next 7 days (#9933)", () => {
  test("lists a closure 3 days out, and tapping it opens that day's drawer", async ({
    mockedPage: page,
  }) => {
    await pinToday(page);
    const closed = localDay(3);
    // Registered after `mockApi`'s config route, so it answers first.
    await page.route(/\/api\/v1\/venues\/[^/?]+\/availability\/config$/, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: withClosure(closed) }),
          })
        : route.fallback()
    );

    await firstPaint(page);
    await expect(layerOption(page, "Schedules")).toBeChecked();

    const week = page.getByRole("region", { name: "Next 7 days" });
    const short = calendarDate(closed, { weekday: "short", month: "short", day: "numeric" });
    const row = week.getByRole("button", { name: `${short} · Closed, show the day`, exact: true });
    await expect(row).toBeVisible();
    await row.click();

    await expect(layerOption(page, "Calendar")).toBeChecked();
    const long = calendarDate(closed, { weekday: "long", month: "long", day: "numeric" });
    await expect(page.getByRole("dialog", { name: long, exact: true })).toBeVisible();
  });
});
