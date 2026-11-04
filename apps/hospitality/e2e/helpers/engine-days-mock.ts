import type { Page } from "@playwright/test";
import {
  addDays,
  applyChanges,
  diffDays,
  resolveDay,
  type BookingSnapshot,
  type ResolvedDay,
} from "@mbe/availability";
import {
  PreviewAvailabilityBodySchema,
  type AvailabilityConfig,
  type AvailabilityDaySummary,
  type PreviewResult,
} from "@mbe/types";

/**
 * `GET …/availability/days` and `POST …/availability/preview` for a venue whose config the test
 * has saved, answered by the same pure engine the reservations service runs (`resolveDay`,
 * `diffDays`), so the calendar and the guest preview read the saved week the way production does.
 * The service's own summary and preview builders live behind Prisma and cannot run in a browser
 * test; `summarize` below mirrors `summarizeDay` in `availability-config-checks.ts`.
 */

const WHOLE_DAY_MINUTES = 2880;
const PREVIEW_WINDOW_DAYS = 30;

function isDayClosed(day: ResolvedDay): boolean {
  const closedAllDay = day.closures.some(
    (c) => c.targetKind === "venue" && c.from <= 0 && c.to >= WHOLE_DAY_MINUTES
  );
  return closedAllDay || day.services.length === 0;
}

function dayLabel(config: AvailabilityConfig, day: ResolvedDay): string {
  if (isDayClosed(day)) return "Closed";
  if (day.explanation.some((l) => l.kind === "special_hours")) return "Special hours";
  return config.schedules.find((s) => s.id === day.scheduleId)?.name ?? "Open";
}

function summarize(config: AvailabilityConfig, day: ResolvedDay): AvailabilityDaySummary {
  const names = new Map(config.venueServices.map((s) => [s.id, s.name]));
  return {
    serviceDate: day.serviceDate,
    label: dayLabel(config, day),
    scheduleId: day.scheduleId,
    serviceCount: day.services.length,
    closures: [],
    bookingOpen: day.bookingOpen,
    services: isDayClosed(day)
      ? []
      : day.services.map((s) => ({
          venueServiceId: s.venueServiceId,
          name: names.get(s.venueServiceId) ?? s.name,
          opensAt: s.opensAt,
          lastSeatingAt: s.lastSeatingAt,
          closesAt: s.closesAt,
        })),
  };
}

function between(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const json = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ data }),
});

export interface SavedConfig {
  config: AvailabilityConfig;
  version: number;
}

export async function serveDaysAndPreview(
  page: Page,
  venueBase: string,
  timezone: string,
  current: () => SavedConfig
) {
  await page.route(`${venueBase}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const { config } = current();
    const days = between(url.searchParams.get("from")!, url.searchParams.get("to")!).map((date) =>
      summarize(config, resolveDay({ timezone, config }, date))
    );
    return route.fulfill(json(days));
  });
  await page.route(`${venueBase}/availability/preview*`, (route) => {
    const body = PreviewAvailabilityBodySchema.parse(route.request().postDataJSON());
    const { config, version } = current();
    const now = new Date();
    const after = applyChanges(config, body.draft.changes, now.toISOString());
    const structural = (c: AvailabilityConfig): BookingSnapshot => ({
      timezone,
      config: c,
      tables: [],
      reservations: [],
      holds: [],
      settings: null,
    });
    const dates = Array.from({ length: PREVIEW_WINDOW_DAYS }, (_, i) => addDays(body.focusDate, i));
    const result: PreviewResult = {
      version,
      days: diffDays(structural(config), structural(after), dates, {
        partySize: body.partySize,
        channel: "online",
        now,
      }),
      focusDay: summarize(after, resolveDay({ timezone, config: after }, body.focusDate)),
      stranded: { total: 0, offset: 0, items: [] },
    };
    return route.fulfill(json(result));
  });
}
