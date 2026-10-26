import type { TFunction } from "i18next";
import type {
  BookingOpen,
  ResolvedClosure,
  ResolvedDaySummary,
  ResolvedService,
} from "@mbe/availability";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { isWholeDay, minuteText } from "./closure-band.js";

type Channel = keyof BookingOpen;

/** One thing that would be different if a layer were removed. */
export type RemovalChange =
  | { kind: "serviceOpens"; name: string; opensAt: number; closesAt: number }
  | { kind: "serviceCloses"; name: string }
  | { kind: "opensAtChanges"; name: string; minute: number }
  | { kind: "closesAtChanges"; name: string; minute: number; later: boolean }
  | { kind: "lastSeatingChanges"; name: string; minute: number }
  | { kind: "closureLifted"; closure: ResolvedClosure; serviceName?: string }
  | { kind: "closureApplies"; closure: ResolvedClosure }
  | { kind: "bookingOn"; channel: Channel }
  | { kind: "bookingOff"; channel: Channel }
  | { kind: "pacingLifted" }
  | { kind: "pacingSet"; covers: number };

const CHANNELS: readonly Channel[] = ["online", "phone", "waitlist"];

function serviceChanges(
  current: readonly ResolvedService[],
  removed: readonly ResolvedService[]
): RemovalChange[] {
  const now = new Map(current.map((s) => [s.venueServiceId, s]));
  const then = new Map(removed.map((s) => [s.venueServiceId, s]));
  const opening = removed
    .filter((s) => !now.has(s.venueServiceId))
    .map((s): RemovalChange => ({
      kind: "serviceOpens",
      name: s.name,
      opensAt: s.opensAt,
      closesAt: s.closesAt,
    }));
  const closing = current
    .filter((s) => !then.has(s.venueServiceId))
    .map((s): RemovalChange => ({ kind: "serviceCloses", name: s.name }));
  const adjusted = removed.flatMap((after): RemovalChange[] => {
    const before = now.get(after.venueServiceId);
    if (!before) return [];
    return [
      ...(before.opensAt !== after.opensAt
        ? [{ kind: "opensAtChanges" as const, name: after.name, minute: after.opensAt }]
        : []),
      ...(before.closesAt !== after.closesAt
        ? [
            {
              kind: "closesAtChanges" as const,
              name: after.name,
              minute: after.closesAt,
              later: after.closesAt > before.closesAt,
            },
          ]
        : []),
      ...(before.lastSeatingAt !== after.lastSeatingAt
        ? [
            {
              kind: "lastSeatingChanges" as const,
              name: after.name,
              minute: after.lastSeatingAt,
            },
          ]
        : []),
    ];
  });
  return [...opening, ...closing, ...adjusted];
}

const sameClosure = (a: ResolvedClosure, b: ResolvedClosure) =>
  a.ruleId === b.ruleId && a.from === b.from && a.to === b.to;

function closureChanges(
  current: readonly ResolvedClosure[],
  removed: readonly ResolvedClosure[],
  services: readonly ResolvedService[]
): RemovalChange[] {
  const nameOf = (c: ResolvedClosure) =>
    c.targetKind === "service"
      ? services.find((s) => s.venueServiceId === c.venueServiceId)?.name
      : undefined;
  // A whole-day closure of services or booking channels already shows up as those changes.
  const worthSaying = (c: ResolvedClosure) => !isWholeDay(c) || c.targetKind === "tables";
  return [
    ...current
      .filter((c) => !removed.some((r) => sameClosure(r, c)) && worthSaying(c))
      .map((closure): RemovalChange => ({
        kind: "closureLifted",
        closure,
        serviceName: nameOf(closure),
      })),
    ...removed
      .filter((c) => !current.some((r) => sameClosure(r, c)) && worthSaying(c))
      .map((closure): RemovalChange => ({ kind: "closureApplies", closure })),
  ];
}

function bookingChanges(current: BookingOpen, removed: BookingOpen): RemovalChange[] {
  return CHANNELS.flatMap((channel): RemovalChange[] => {
    if (current[channel] === removed[channel]) return [];
    return [{ kind: removed[channel] ? "bookingOn" : "bookingOff", channel }];
  });
}

function pacingChanges(current: ResolvedDaySummary, removed: ResolvedDaySummary): RemovalChange[] {
  if (current.pacingCovers === removed.pacingCovers) return [];
  return removed.pacingCovers === undefined
    ? [{ kind: "pacingLifted" }]
    : [{ kind: "pacingSet", covers: removed.pacingCovers }];
}

/** The difference between the day as it is and as it would resolve with a layer removed. */
export function diffRemoval(
  current: ResolvedDaySummary,
  removed: ResolvedDaySummary
): RemovalChange[] {
  return [
    ...serviceChanges(current.services, removed.services),
    ...closureChanges(current.closures, removed.closures, current.services),
    ...bookingChanges(current.bookingOpen, removed.bookingOpen),
    ...pacingChanges(current, removed),
  ];
}

/** A lifted closure, phrased by what it closed: a channel, a named service, or the venue. */
function liftedText(
  change: Extract<RemovalChange, { kind: "closureLifted" }>,
  t: TFunction,
  format: VenueFormat
): string {
  const { closure } = change;
  if (isWholeDay(closure)) return t("availability.drawer.removal.reopensAllDay");
  const range = {
    from: minuteText(closure.from, t, format),
    to: minuteText(closure.to, t, format),
  };
  if (closure.targetKind === "booking") {
    const channels = (closure.bookingTypes ?? []).map((c) =>
      t(`availability.drawer.removal.channel.${c}`)
    );
    return t("availability.drawer.removal.channelBackOn", {
      ...range,
      channels: new Intl.ListFormat(format.locale, { type: "conjunction" }).format(channels),
    });
  }
  if (closure.targetKind === "service" && change.serviceName) {
    return t("availability.drawer.removal.serviceReopens", { ...range, name: change.serviceName });
  }
  return t("availability.drawer.removal.reopens", range);
}

/** One change as a short phrase: "reopens 10:00 PM – 11:00 PM", "Dinner back to 11:00 PM". */
export function removalChangeText(
  change: RemovalChange,
  t: TFunction,
  format: VenueFormat
): string {
  const at = (minute: number) => minuteText(minute, t, format);
  switch (change.kind) {
    case "serviceOpens":
      return t("availability.drawer.removal.serviceOpens", {
        name: change.name,
        from: at(change.opensAt),
        to: at(change.closesAt),
      });
    case "serviceCloses":
      return t("availability.drawer.removal.serviceCloses", { name: change.name });
    case "opensAtChanges":
      return t("availability.drawer.removal.opensAt", {
        name: change.name,
        time: at(change.minute),
      });
    case "closesAtChanges":
      return t(
        change.later
          ? "availability.drawer.removal.closesLater"
          : "availability.drawer.removal.closesEarlier",
        { name: change.name, time: at(change.minute) }
      );
    case "lastSeatingChanges":
      return t("availability.drawer.removal.lastSeating", {
        name: change.name,
        time: at(change.minute),
      });
    case "closureLifted":
      return liftedText(change, t, format);
    case "closureApplies":
      return isWholeDay(change.closure)
        ? t("availability.calendar.closedAllDayName")
        : t("availability.drawer.removal.closes", {
            from: at(change.closure.from),
            to: at(change.closure.to),
          });
    case "bookingOn":
      return t(`availability.drawer.removal.bookingOn.${change.channel}`);
    case "bookingOff":
      return t(`availability.drawer.removal.bookingOff.${change.channel}`);
    case "pacingLifted":
      return t("availability.drawer.removal.pacingLifted");
    case "pacingSet":
      return t("availability.drawer.removal.pacingSet", { covers: change.covers });
  }
}
