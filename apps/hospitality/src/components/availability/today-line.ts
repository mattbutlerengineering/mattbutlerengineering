import type { AvailabilityDaySummary, DateRule } from "@mbe/types";
import { activeTonightChanges, type TonightChange } from "./tonight-state.js";

type Closure = AvailabilityDaySummary["closures"][number];
type DayService = NonNullable<AvailabilityDaySummary["services"]>[number];

export type BookingChannel = NonNullable<DateRule["bookingTypes"]>[number];

/** One thing in force today, beyond the hours (ux.md F1's item table). */
export type TodayItem =
  | { readonly kind: "serviceClosed"; readonly name: string }
  | { readonly kind: "closingEarly"; readonly at: number; readonly name: string | null }
  | {
      readonly kind: "closedBetween";
      readonly name: string | null;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: "paused";
      readonly channels: readonly BookingChannel[];
      readonly from: number | null;
    }
  | {
      readonly kind: "pausedBetween";
      readonly channels: readonly BookingChannel[];
      readonly from: number;
      readonly to: number;
    }
  | { readonly kind: "tonight"; readonly change: TonightChange };

export interface TodayLineModel {
  readonly serviceDate: string;
  /** No service is open that day. */
  readonly closed: boolean;
  readonly hours: readonly { name: string; opensAt: number; closesAt: number }[];
  readonly items: readonly TodayItem[];
}

export interface TodayLineInput {
  readonly serviceDate: string;
  readonly summary: AvailabilityDaySummary;
  /** All the venue's date rules: Tonight rules for the day become items. */
  readonly rules: readonly DateRule[];
  readonly now: Date;
  /** `venueServiceId` to name. */
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly sectionNames: ReadonlyMap<string, string>;
  /** The online-pause banner is up, so the line does not say it again. */
  readonly bannerShowsOnline: boolean;
}

/** The API's label for a day with no hours (`dayLabel` in the reservations service). */
const CLOSED_LABEL = "Closed";
/** Item order from ux.md F1's table. */
const RANK = {
  serviceClosed: 0,
  venueEarly: 1,
  namedEarly: 2,
  closedBetween: 3,
  paused: 4,
  pausedBetween: 5,
  tonight: 6,
} as const;

interface Ranked {
  readonly rank: number;
  readonly item: TodayItem;
}

/** The band reaches the end of the day's service, so it reads "from a time", not a window. */
function reachesClose(band: Closure, closesAt: number): boolean {
  return band.to >= closesAt;
}

function closureItem(
  band: Closure,
  names: Pick<TodayLineInput, "serviceNames" | "sectionNames">,
  services: readonly DayService[],
  span: { opensAt: number; closesAt: number }
): Ranked | null {
  if (band.targetKind === "venue") {
    // A whole-day venue band is handled as a closed day by the caller.
    return reachesClose(band, span.closesAt)
      ? { rank: RANK.venueEarly, item: { kind: "closingEarly", at: band.from, name: null } }
      : {
          rank: RANK.closedBetween,
          item: { kind: "closedBetween", name: null, from: band.from, to: band.to },
        };
  }
  if (band.targetKind === "booking") {
    const channels = band.bookingTypes ?? [];
    if (channels.length === 0) return null;
    if (!reachesClose(band, span.closesAt)) {
      return {
        rank: RANK.pausedBetween,
        item: { kind: "pausedBetween", channels, from: band.from, to: band.to },
      };
    }
    return {
      rank: RANK.paused,
      item: {
        kind: "paused",
        channels,
        from: band.from > span.opensAt ? band.from : null,
      },
    };
  }
  const own = band.venueServiceId
    ? services.find((s) => s.venueServiceId === band.venueServiceId)
    : undefined;
  const name =
    band.targetKind === "service"
      ? ((band.venueServiceId ? names.serviceNames.get(band.venueServiceId) : undefined) ??
        own?.name)
      : band.sectionId
        ? names.sectionNames.get(band.sectionId)
        : undefined;
  if (name === undefined) return null;
  // A service reads against its own hours; a section against the whole day's. A service the
  // day no longer lists was closed whole-day by the engine, so only a whole-day band names it.
  const against = band.targetKind === "service" && own ? own : span;
  if (!reachesClose(band, against.closesAt)) {
    if (band.targetKind === "service" && !own) return null;
    return {
      rank: RANK.closedBetween,
      item: { kind: "closedBetween", name, from: band.from, to: band.to },
    };
  }
  if (band.from <= against.opensAt)
    return { rank: RANK.serviceClosed, item: { kind: "serviceClosed", name } };
  return { rank: RANK.namedEarly, item: { kind: "closingEarly", at: band.from, name } };
}

function isWholeDayServiceBand(band: Closure, services: readonly DayService[]): boolean {
  if (band.targetKind !== "service") return false;
  const own = services.find((s) => s.venueServiceId === band.venueServiceId);
  return own !== undefined && band.from <= own.opensAt && band.to >= own.closesAt;
}

/**
 * What is in force on the service day, as the Today line says it (architecture.md A1). Band
 * shapes follow `resolveDay`: a whole-day closure is 0 to 2880 and drops its service (or, for
 * the venue, every service) from `summary.services`; a from-time closure keeps the services and
 * runs to 2880; a Tonight rule leaves a band for a stop window or a booking pause but none for
 * a close-early, so those bands are read from the rules, not as closures.
 */
export function todayLine(input: TodayLineInput): TodayLineModel {
  const { serviceDate, summary, rules, now, bannerShowsOnline } = input;
  const tonightIds = new Set(rules.filter((r) => r.kind === "tonight").map((r) => r.id));
  const bands = summary.closures.filter((band) => !tonightIds.has(band.ruleId));
  const services = summary.services ?? [];
  const span = {
    opensAt: services.length ? Math.min(...services.map((s) => s.opensAt)) : 0,
    closesAt: services.length ? Math.max(...services.map((s) => s.closesAt)) : 0,
  };
  const venueClosed = bands.some(
    (band) => band.targetKind === "venue" && band.from <= span.opensAt && band.to >= span.closesAt
  );
  const hours = services
    .filter((s) => !bands.some((band) => isWholeDayServiceBand(band, [s])))
    .map(({ name, opensAt, closesAt }) => ({ name, opensAt, closesAt }))
    .sort((a, b) => a.opensAt - b.opensAt);
  const closed =
    venueClosed ||
    summary.label === CLOSED_LABEL ||
    (summary.services !== undefined ? hours.length === 0 : summary.serviceCount === 0);

  const fromClosures: readonly Ranked[] = closed
    ? []
    : bands.flatMap((band) => {
        const ranked = closureItem(band, input, services, span);
        if (ranked === null) return [];
        const { item } = ranked;
        if ((item.kind !== "paused" && item.kind !== "pausedBetween") || !bannerShowsOnline) {
          return [ranked];
        }
        const channels = item.channels.filter((channel) => channel !== "online");
        return channels.length > 0 ? [{ rank: ranked.rank, item: { ...item, channels } }] : [];
      });
  const fromTonight: readonly Ranked[] = activeTonightChanges(rules, serviceDate, now)
    .filter((change) => !(bannerShowsOnline && change.kind === "pause_online"))
    .map((change) => ({ rank: RANK.tonight, item: { kind: "tonight", change } }));

  return {
    serviceDate,
    closed,
    hours: closed ? [] : hours,
    items: [...fromClosures, ...fromTonight].sort((a, b) => a.rank - b.rank).map((r) => r.item),
  };
}
