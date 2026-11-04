export type Season = "spring" | "summer" | "autumn" | "winter";

export type NameSuggestion =
  | { readonly kind: "season"; readonly season: Season }
  | { readonly kind: "from"; readonly from: string }
  | { readonly kind: "range"; readonly from: string; readonly to: string };

/** Longer than this and no season names the period. */
const SEASON_MAX_DAYS = 124;
const DAY_MS = 86_400_000;

/** By the calendar of the northern hemisphere; the Manager can still type any name. */
const SEASON_OF_MONTH: readonly Season[] = [
  "winter",
  "winter",
  "spring",
  "spring",
  "spring",
  "summer",
  "summer",
  "summer",
  "autumn",
  "autumn",
  "autumn",
  "winter",
];

const days = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * A name for a schedule that runs from `startsOn` to `endsOn` (ux.md F-UW): the season for a
 * period of a few months ("Summer hours"), otherwise the dates. Dates are venue calendar dates,
 * so nothing here depends on the device's time zone. `null` until a start date is chosen.
 */
export function suggestName(startsOn: string | null, endsOn: string | null): NameSuggestion | null {
  if (!startsOn) return null;
  if (!endsOn) return { kind: "from", from: startsOn };
  if (days(startsOn, endsOn) > SEASON_MAX_DAYS)
    return { kind: "range", from: startsOn, to: endsOn };
  const season = SEASON_OF_MONTH[Number(startsOn.slice(5, 7)) - 1];
  return { kind: "season", season: season ?? "winter" };
}
