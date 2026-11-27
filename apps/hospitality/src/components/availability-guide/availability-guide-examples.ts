import {
  expandSectionRules,
  listSlots,
  type BookingChannel,
  type BookingSnapshot,
  type EngineTable,
} from "@mbe/availability";
import type { AvailabilityConfig, DateRule, ScheduleService } from "@mbe/types";

/**
 * The worked examples on the "How availability works" page. This module is the one source: the
 * page renders what `runGuideCheck` returns, and `availability-guide-examples.test.ts` pins each
 * outcome, so the page and the engine (`@mbe/availability`) cannot drift apart. Times are minutes
 * past the service day's midnight.
 */

const TIMEZONE = "America/Los_Angeles";
/** A fixed "now" well before every example date, so no hold or booking window is in play. */
const NOW = new Date("2027-11-20T12:00:00Z");
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const BOTH_CHANNELS: ScheduleService["bookingTypes"] = ["online", "phone"];

const PM = (hour: number) => (hour + 12) * 60;

export interface GuideCheck {
  readonly id: string;
  /** Venue-local service date. */
  readonly date: string;
  readonly channel: BookingChannel;
  readonly partySize: number;
}

export interface GuideExample {
  readonly id: string;
  readonly snapshot: BookingSnapshot;
  readonly checks: readonly GuideCheck[];
}

export interface OfferedTime {
  readonly minute: number;
  readonly available: boolean;
  readonly reason?: "no_table" | "pacing";
}

export interface GuideOutcome {
  /** Every time the engine offers for the check, in order; an empty list means none. */
  readonly offered: readonly OfferedTime[];
}

const dinner = (
  opensAt: number,
  lastSeatingAt: number,
  closesAt: number
): Pick<
  ScheduleService,
  "opensAt" | "lastSeatingAt" | "closesAt" | "seating" | "bookingTypes"
> => ({
  opensAt,
  lastSeatingAt,
  closesAt,
  seating: { version: 1, interval: 60 },
  bookingTypes: [...BOTH_CHANNELS],
});

const scheduleService = (
  id: string,
  scheduleId: string,
  hours: ReturnType<typeof dinner>,
  rules?: ScheduleService["rules"]
): ScheduleService => ({
  id,
  scheduleId,
  venueServiceId: "vs-dinner",
  ...hours,
  weekdays: [],
  dayHours: { version: 1, sets: [] },
  ...(rules ? { rules } : {}),
});

/** Regular hours: dinner seats on the hour from 5 PM, last seating 8:30 PM. */
const REGULAR_HOURS = dinner(PM(5), PM(8) + 30, PM(9) + 30);

const BASE_CONFIG: AvailabilityConfig = {
  schedules: [
    { id: "regular", name: "Regular hours", kind: "regular", isRegular: true },
    { id: "december", name: "December hours", kind: "alternate", isRegular: false },
  ],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    scheduleService("regular-dinner", "regular", REGULAR_HOURS),
    // Seasonal hours: dinner starts an hour earlier and last seating is 8 PM.
    scheduleService("december-dinner", "december", dinner(PM(4), PM(8), PM(9))),
  ],
  assignments: [
    { id: "as-regular", scheduleId: "regular", weekdays: ALL_DAYS, precedence: 0 },
    {
      id: "as-december",
      scheduleId: "december",
      weekdays: ALL_DAYS,
      startsOn: "2027-12-01",
      endsOn: "2027-12-31",
      precedence: 10,
    },
  ],
  dateRules: [],
};

/** A special date: December 24 runs 4 PM to 6 PM, last seating 5 PM. */
const SPECIAL_DATE: DateRule = {
  id: "special-dec-24",
  kind: "special_hours",
  targetKind: "venue",
  startsOn: "2027-12-24",
  endsOn: "2027-12-24",
  payload: {
    version: 1,
    services: [{ venueServiceId: "vs-dinner", ...dinner(PM(4), PM(5), PM(6)) }],
  },
};

const wholeDay = (
  id: string,
  rule: Pick<DateRule, "targetKind"> & Partial<DateRule>,
  date: string
): DateRule => ({ id, kind: "closure", startsOn: date, endsOn: date, ...rule }) as DateRule;

const TABLES: EngineTable[] = [
  {
    id: "t-indoor",
    name: "Indoor two-top",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    isActive: true,
    priority: 1,
  },
  {
    id: "t-patio",
    name: "Patio four-top",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    isActive: true,
    priority: 2,
  },
];

function snapshotOf(
  config: AvailabilityConfig,
  extra: Partial<BookingSnapshot> = {}
): BookingSnapshot {
  return {
    timezone: TIMEZONE,
    config,
    tables: TABLES,
    reservations: [],
    holds: [],
    settings: null,
    ...extra,
  };
}

const withRules = (...dateRules: DateRule[]): AvailabilityConfig => ({
  ...BASE_CONFIG,
  dateRules,
});

const check = (
  id: string,
  date: string,
  channel: BookingChannel = "online",
  partySize = 2
): GuideCheck => ({ id, date, channel, partySize });

const PATIO_SECTION_TABLES = new Map([["sec-patio", ["t-patio"]]]);

/** Friday, November 26, 2027: regular hours only, no seasonal hours. */
const FRIDAY = "2027-11-26";
const SATURDAY = "2027-11-27";

const PACING_CAP = { version: 1 as const, pacing: { covers: 4, windowMinutes: 60 } };

export const GUIDE_EXAMPLES: readonly GuideExample[] = [
  {
    id: "seasonalAndSpecial",
    snapshot: snapshotOf(withRules(SPECIAL_DATE)),
    checks: [
      check("beforeSeason", "2027-11-30"),
      check("inSeason", "2027-12-23"),
      check("specialDate", "2027-12-24"),
    ],
  },
  {
    id: "closureBeatsSpecial",
    snapshot: snapshotOf(
      withRules(SPECIAL_DATE, wholeDay("closed-dec-24", { targetKind: "venue" }, "2027-12-24"))
    ),
    checks: [check("online", "2027-12-24", "online"), check("phone", "2027-12-24", "phone")],
  },
  {
    id: "pauseVersusClosure",
    snapshot: snapshotOf(
      withRules(
        wholeDay(
          "pause-online",
          { targetKind: "booking", bookingTypes: ["online"], origin: "pause" },
          FRIDAY
        ),
        wholeDay("closed-venue", { targetKind: "venue" }, SATURDAY)
      )
    ),
    checks: [
      check("pausedOnline", FRIDAY, "online"),
      check("pausedPhone", FRIDAY, "phone"),
      check("closedOnline", SATURDAY, "online"),
      check("closedPhone", SATURDAY, "phone"),
    ],
  },
  {
    id: "sectionClosed",
    snapshot: snapshotOf({
      ...BASE_CONFIG,
      // A section closure remembers the section; the engine reads its tables as of now.
      dateRules: expandSectionRules(
        [
          wholeDay(
            "patio-closed",
            { targetKind: "tables", sectionId: "sec-patio", tableIds: [] },
            FRIDAY
          ),
        ],
        PATIO_SECTION_TABLES
      ),
    }),
    checks: [check("partyOfFour", FRIDAY, "online", 4), check("partyOfTwo", FRIDAY, "online", 2)],
  },
  {
    id: "pacing",
    snapshot: snapshotOf(
      {
        ...BASE_CONFIG,
        scheduleServices: BASE_CONFIG.scheduleServices.map((s) =>
          s.id === "regular-dinner" ? { ...s, rules: PACING_CAP } : s
        ),
      },
      {
        // A party of four already holds the patio table from 6 PM.
        reservations: [
          {
            id: "booked-four",
            tableId: "t-patio",
            startTime: new Date(`${FRIDAY}T18:00:00-08:00`),
            endTime: new Date(`${FRIDAY}T19:30:00-08:00`),
            partySize: 4,
          },
        ],
      }
    ),
    checks: [check("partyOfTwo", FRIDAY, "online", 2)],
  },
];

/** Asks the engine what a guest would be offered for one check of an example. */
export function runGuideCheck(example: GuideExample, request: GuideCheck): GuideOutcome {
  const slots = listSlots(example.snapshot, request.date, request.partySize, request.channel, NOW);
  return {
    offered: slots.map(({ minute, available, reason }) => ({
      minute,
      available,
      ...(reason ? { reason } : {}),
    })),
  };
}
