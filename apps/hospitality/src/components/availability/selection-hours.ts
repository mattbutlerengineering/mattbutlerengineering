import type { ResolvedDay } from "@mbe/availability";

/** What a guest could book that day: two days with the same signature have the same hours. */
function hoursSignature(day: ResolvedDay): string {
  return JSON.stringify(
    day.services.map((s) => [
      s.venueServiceId,
      s.opensAt,
      s.lastSeatingAt,
      s.closesAt,
      s.seating,
      s.bookingTypes,
    ])
  );
}

/**
 * Which picked date the drawer's rows come from, and whether the others differ from it.
 * The first date that has a service wins, so a closed Monday picked beside an open Friday
 * cannot hide that Friday has a service; with none open, the first date.
 */
export function pickHoursSource(
  dates: readonly string[],
  resolve: (date: string) => ResolvedDay
): { readonly date: string | null; readonly differs: boolean } {
  const days = dates.map((date) => ({ date, day: resolve(date) }));
  const source = days.find((d) => d.day.services.length > 0) ?? days[0];
  if (!source) return { date: null, differs: false };
  const wanted = hoursSignature(source.day);
  return {
    date: source.date,
    differs: days.some((d) => hoursSignature(d.day) !== wanted),
  };
}
