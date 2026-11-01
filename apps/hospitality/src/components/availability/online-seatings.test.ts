import { describe, expect, it } from "vitest";
import { listSlots } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { onlineSeatingLeft } from "./online-seatings.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const TZ = "America/Los_Angeles";
const FRIDAY = "2026-11-13";
const SATURDAY = "2026-11-14";

const closure = (patch: Partial<DateRule>): DateRule =>
  ({
    id: "c",
    kind: "closure",
    targetKind: "booking",
    bookingTypes: ["online"],
    startsOn: FRIDAY,
    endsOn: null,
    ...patch,
  }) as DateRule;
const from = (minute: number) => ({ version: 1, from: minute, to: 2880 }) as const;

/** What the engine really offers online, with no tables or bookings to judge. */
function engineSays(config: AvailabilityConfig, date: string, nowMinute: number): boolean {
  const snapshot = {
    timezone: TZ,
    config,
    tables: [],
    reservations: [],
    holds: [],
    settings: null,
  };
  return listSlots(snapshot, date, 1, "online", new Date(0)).some((s) => s.minute >= nowMinute);
}

describe("onlineSeatingLeft agrees with the engine's listSlots", () => {
  const fixed = fixtureConfig();
  const cases: readonly (readonly [string, AvailabilityConfig, string, number])[] = [
    ["an open day, in the morning", fixtureConfig(), FRIDAY, 9 * 60],
    ["an open day, after the last seating", fixtureConfig(), FRIDAY, 23 * 60],
    ["a day with no service", fixtureConfig(), SATURDAY, 9 * 60],
    [
      "an online pause from the first seating",
      fixtureConfig(closure({ window: from(60) })),
      FRIDAY,
      30,
    ],
    [
      "an online pause from 6 PM",
      fixtureConfig(closure({ window: from(18 * 60) })),
      FRIDAY,
      10 * 60,
    ],
    [
      "an online pause from 6 PM, after 5:45",
      fixtureConfig(closure({ window: from(18 * 60) })),
      FRIDAY,
      17 * 60 + 50,
    ],
    ["a whole-day online pause", fixtureConfig(closure({})), FRIDAY, 9 * 60],
    [
      "a phone pause from the first seating",
      fixtureConfig(closure({ bookingTypes: ["phone"], window: from(60) })),
      FRIDAY,
      30,
    ],
    [
      "a venue closure from the first seating",
      fixtureConfig(closure({ targetKind: "venue", bookingTypes: undefined, window: from(60) })),
      FRIDAY,
      30,
    ],
    [
      "a dinner closure, after lunch",
      fixtureConfig(
        closure({
          targetKind: "service",
          venueServiceId: "vs-dinner",
          bookingTypes: undefined,
          window: from(60),
        })
      ),
      FRIDAY,
      16 * 60,
    ],
    [
      "services that take no online booking",
      {
        ...fixed,
        scheduleServices: fixed.scheduleServices.map((s) => ({
          ...s,
          bookingTypes: ["phone" as const],
        })),
      },
      FRIDAY,
      9 * 60,
    ],
    [
      "fixed seatings",
      {
        ...fixed,
        scheduleServices: fixed.scheduleServices.map((s) => ({
          ...s,
          seating: { version: 1 as const, fixed: [s.opensAt] },
        })),
      },
      FRIDAY,
      23 * 60,
    ],
  ];

  it.each(cases)("%s", (_name, config, date, minute) => {
    expect(onlineSeatingLeft(config, TZ, date, minute)).toBe(engineSays(config, date, minute));
  });
});
