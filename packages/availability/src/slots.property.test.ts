import type { AvailabilityConfig, DateRule, ScheduleAssignment, ScheduleService } from "@mbe/types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, weekdayIndexOf } from "./civil-date.js";
import { formatMinute } from "./format-minute.js";
import { serviceDayInstant } from "./instant.js";
import { validateConfig } from "./validate-config.js";
import { resolveDay } from "./resolve-day.js";
import { judge, listSlots, type BookingChannel, type BookingSnapshot } from "./slots.js";

/**
 * SC Correctness, engine half (#7499): over generated configurations, no
 * listed slot falls outside `resolveDay`, and `judge` is hard for every
 * instant inside a closure. The generated rows include ones scoped to some
 * weekdays and ones with other hours on some weekdays (ADR-031), and for
 * configs whose rows are all unscoped `resolveDay` and `validateConfig` are
 * compared with the pre-change functions kept in this file as the oracle.
 */

// Sunday, Friday, Monday, Saturday, Sunday, Tuesday: the weekdays the scoped rows pick from.
const DATES = [
  "2026-11-01",
  "2026-11-06",
  "2026-11-02",
  "2026-11-07",
  "2027-03-14",
  "2027-06-15",
] as const;
const ZONES = ["UTC", "America/Los_Angeles", "Australia/Lord_Howe"] as const;
const CHANNELS: BookingChannel[] = ["online", "phone"];
const NOW = new Date("2026-01-01T00:00:00Z");

/** 1–3 non-overlapping unscoped services; the last may run past midnight. */
const unscopedServicesArb = fc
  .array(
    fc.record({
      // Quarter-hour grid, so closes, last seatings and Tonight changes land
      // exactly on seatings — where off-by-one bugs live.
      gap: fc.integer({ min: 0, max: 16 }).map((q) => q * 15),
      length: fc.integer({ min: 2, max: 24 }).map((q) => q * 15),
      seatingShare: fc.oneof(fc.constant(1), fc.double({ min: 0, max: 1, noNaN: true })),
      interval: fc.constantFrom(15, 30, 45, 60),
      fixed: fc.boolean(),
      bookingTypes: fc.subarray(["online", "phone"] as const),
    }),
    { minLength: 1, maxLength: 3 }
  )
  .map((specs) =>
    specs.reduce<ScheduleService[]>((acc, spec, i) => {
      const previousClose = acc.at(-1)?.closesAt ?? 360;
      const opensAt = previousClose + spec.gap;
      // A service must open within its own day; a spec that can't is dropped,
      // never clamped (clamping would overlap the previous service).
      if (opensAt > 1439) return acc;
      const closesAt = opensAt + spec.length;
      const lastSeatingAt =
        opensAt + Math.floor(((closesAt - opensAt) * spec.seatingShare) / 15) * 15;
      return [
        ...acc,
        {
          id: `ss-${i}`,
          scheduleId: "regular",
          venueServiceId: `vs-${i}`,
          opensAt,
          lastSeatingAt,
          closesAt,
          seating: spec.fixed
            ? { version: 1, fixed: [opensAt, Math.floor((opensAt + lastSeatingAt) / 2)] }
            : { version: 1, interval: spec.interval },
          bookingTypes: [...spec.bookingTypes],
          weekdays: [],
          dayHours: { version: 1, sets: [] },
        },
      ];
    }, [])
  );

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

/**
 * The same services, some scoped to a few weekdays and some with an earlier close on others. A set
 * only ever closes earlier than the base and keeps its opening, so it cannot overlap a later
 * service; `validateConfig` still filters whatever else comes out invalid.
 */
const servicesArb = unscopedServicesArb.chain((services) =>
  fc
    .array(
      fc.record({
        weekdays: fc.oneof(
          { weight: 3, arbitrary: fc.constant<number[]>([]) },
          { weight: 1, arbitrary: fc.subarray(WEEKDAY_INDEXES, { minLength: 1 }) }
        ),
        set: fc.option(
          fc.record({
            weekdays: fc.subarray(WEEKDAY_INDEXES, { minLength: 1 }),
            shortenBy: fc.integer({ min: 1, max: 4 }).map((q) => q * 15),
          }),
          { nil: null, freq: 2 }
        ),
      }),
      { minLength: services.length, maxLength: services.length }
    )
    .map((specs) =>
      services.map((service, i): ScheduleService => {
        const spec = specs[i];
        if (!spec) return service;
        const closesAt = service.closesAt - (spec.set?.shortenBy ?? 0);
        return {
          ...service,
          weekdays: spec.weekdays,
          dayHours: {
            version: 1,
            sets: spec.set
              ? [
                  {
                    weekdays: spec.set.weekdays,
                    opensAt: service.opensAt,
                    lastSeatingAt: Math.min(service.lastSeatingAt, closesAt),
                    closesAt,
                    seating: { version: 1, interval: 15 },
                    bookingTypes: service.bookingTypes,
                  },
                ]
              : [],
          },
        };
      })
    )
);

const ruleArb = (date: string) =>
  fc
    .record({
      targetKind: fc.constantFrom("venue", "service", "booking", "tables"),
      service: fc.integer({ min: 0, max: 2 }),
      bookingTypes: fc.subarray(["online", "phone", "waitlist"] as const, { minLength: 1 }),
      windowed: fc.boolean(),
      from: fc.integer({ min: 0, max: 1800 }),
      span: fc.integer({ min: 15, max: 600 }),
    })
    .map((r): Omit<DateRule, "id"> => ({
      kind: "closure",
      targetKind: r.targetKind,
      startsOn: date,
      ...(r.targetKind === "service" ? { venueServiceId: `vs-${r.service}` } : {}),
      ...(r.targetKind === "booking" ? { bookingTypes: [...r.bookingTypes] } : {}),
      ...(r.targetKind === "tables" ? { tableIds: ["t-1"] } : {}),
      ...(r.windowed ? { window: { version: 1, from: r.from, to: r.from + r.span } } : {}),
    }));

const tonightArb = (date: string) =>
  fc
    .record({
      targetKind: fc.constantFrom("venue", "service", "booking"),
      service: fc.integer({ min: 0, max: 2 }),
      change: fc.oneof(
        fc.record({ closeAt: fc.integer({ min: 0, max: 130 }).map((q) => q * 15) }),
        fc
          .record({
            from: fc.integer({ min: 0, max: 1800 }),
            span: fc.integer({ min: 15, max: 300 }),
          })
          .map(({ from, span }) => ({ stop: { from, to: from + span } })),
        fc.record({ pacing: fc.record({ covers: fc.integer({ min: 1, max: 6 }) }) })
      ),
    })
    .map(
      (r): Omit<DateRule, "id"> =>
        ({
          kind: "tonight",
          targetKind: r.targetKind,
          startsOn: date,
          ...(r.targetKind === "service" ? { venueServiceId: `vs-${r.service}` } : {}),
          ...(r.targetKind === "booking" ? { bookingTypes: ["online"] } : {}),
          payload: { version: 1, ...r.change },
        }) as Omit<DateRule, "id">
    );

const scenarioArb = fc
  .record({ date: fc.constantFrom(...DATES), timezone: fc.constantFrom(...ZONES) })
  .chain(({ date, timezone }) =>
    fc.record({
      date: fc.constant(date),
      timezone: fc.constant(timezone),
      services: servicesArb,
      rules: fc.array(fc.oneof(ruleArb(date), tonightArb(date)), { maxLength: 3 }),
    })
  )
  .map(({ date, timezone, services, rules }) => {
    const config: AvailabilityConfig = {
      schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
      venueServices: services.map((s, i) => ({ id: s.venueServiceId, name: `S${i}`, position: i })),
      scheduleServices: services,
      assignments: [
        { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
      ],
      dateRules: rules.map((r, i) => ({ ...r, id: `dr-${i}` }) as DateRule),
    };
    const snapshot: BookingSnapshot = {
      timezone,
      config,
      tables: [
        {
          id: "t-1",
          name: "T1",
          capacity: 4,
          minCovers: 1,
          maxCovers: 4,
          isActive: true,
          priority: 1,
        },
        {
          id: "t-2",
          name: "T2",
          capacity: 4,
          minCovers: 1,
          maxCovers: 4,
          isActive: true,
          priority: 2,
        },
      ],
      reservations: [],
      holds: [],
      settings: null,
    };
    return { date, snapshot };
  })
  // The engine's contract is over configurations the store accepts.
  .filter(({ snapshot }) => validateConfig(snapshot.config).length === 0);

describe("engine correctness (property)", () => {
  it("never lists a slot outside the resolved day", () => {
    fc.assert(
      fc.property(scenarioArb, ({ date, snapshot }) => {
        const day = resolveDay(snapshot, date);
        for (const channel of CHANNELS) {
          for (const slot of listSlots(snapshot, date, 2, channel, NOW)) {
            expect(day.bookingOpen[channel]).toBe(true);
            const service = day.services.find(
              (s) =>
                s.venueServiceId === slot.venueServiceId &&
                s.opensAt <= slot.minute &&
                slot.minute <= s.lastSeatingAt
            );
            expect(service?.bookingTypes).toContain(channel);
            const closedBand = day.closures.find(
              (b) =>
                b.from <= slot.minute &&
                slot.minute < b.to &&
                (b.targetKind === "venue" ||
                  (b.targetKind === "service" && b.venueServiceId === slot.venueServiceId) ||
                  (b.targetKind === "booking" && (b.bookingTypes ?? []).includes(channel)))
            );
            expect(closedBand).toBeUndefined();
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("never lists an available slot that judge rejects", () => {
    fc.assert(
      fc.property(scenarioArb, ({ date, snapshot }) => {
        for (const channel of CHANNELS) {
          for (const slot of listSlots(snapshot, date, 2, channel, NOW)) {
            if (!slot.available) continue;
            const verdict = judge(snapshot, { start: slot.start, partySize: 2, channel }, NOW);
            expect(verdict.kind, `${slot.start.toISOString()} ${channel}`).not.toBe("hard");
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("never accepts an online start the listing does not offer", () => {
    fc.assert(
      fc.property(scenarioArb, ({ date, snapshot }) => {
        // Instants before this date's midnight+24h belong to this date's services
        // or to the previous date's past-midnight service.
        const listed = new Set(
          [addDays(date, -1), date].flatMap((d) =>
            listSlots(snapshot, d, 2, "online", NOW).map((s) => s.start.getTime())
          )
        );
        // Absolute 5-minute steps (so a repeated fall-back hour is probed twice), each
        // also nudged by a millisecond and by 30 s: none of those may be accepted unless listed.
        const base = serviceDayInstant(date, 0, snapshot.timezone)?.getTime();
        if (base === undefined) return;
        for (let step = 0; step < 288; step++) {
          for (const nudge of [0, 1, 30_000]) {
            const start = new Date(base + step * 300_000 + nudge);
            const verdict = judge(snapshot, { start, partySize: 2, channel: "online" }, NOW);
            if (verdict.kind === "ok") {
              expect(listed.has(start.getTime()), `${start.toISOString()}`).toBe(true);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  }, 30_000);

  it("judges every instant inside a closure as hard", () => {
    fc.assert(
      fc.property(scenarioArb, ({ date, snapshot }) => {
        const planned = snapshot.config.scheduleServices;
        for (const band of resolveDay(snapshot, date).closures) {
          if (band.targetKind === "tables") continue;
          const channels = CHANNELS.filter(
            (c) => band.targetKind !== "booking" || (band.bookingTypes ?? []).includes(c)
          );
          for (const service of planned) {
            if (band.targetKind === "service" && band.venueServiceId !== service.venueServiceId) {
              continue;
            }
            // Before midnight, so the instant's own date owns it.
            const to = Math.min(band.to, service.closesAt, 1440);
            for (let minute = Math.max(band.from, service.opensAt); minute < to; minute += 15) {
              const start = serviceDayInstant(date, minute, snapshot.timezone);
              if (!start) continue;
              for (const channel of channels) {
                const verdict = judge(snapshot, { start, partySize: 2, channel }, NOW);
                expect(verdict.kind).toBe("hard");
              }
            }
          }
        }
      }),
      { numRuns: 300 }
    );
  });
});

// ── Legacy configs: the pre-change functions as the oracle ─────────────────────────────────────

interface OracleIssue {
  path: string;
  code: string;
  message: string;
}

/** `validateConfig`'s schedule-service rules as they were before day scope: all rows, every day. */
function oracleScheduleServiceIssues(config: AvailabilityConfig): OracleIssue[] {
  type Hours = Pick<ScheduleService, "opensAt" | "lastSeatingAt" | "closesAt" | "seating">;
  const issue = (path: string, code: string, message: string) => ({ path, code, message });
  const hoursIssues = (path: string, h: Hours): OracleIssue[] => {
    if (h.closesAt <= h.opensAt) {
      return [
        issue(`${path}.closesAt`, "close_before_open", "Closing time must be after opening."),
      ];
    }
    if (h.lastSeatingAt > h.closesAt) {
      return [
        issue(
          `${path}.lastSeatingAt`,
          "last_seating_after_close",
          "Last seating can't be after closing."
        ),
      ];
    }
    if (h.lastSeatingAt < h.opensAt) {
      return [
        issue(
          `${path}.lastSeatingAt`,
          "last_seating_before_open",
          "Last seating can't be before opening."
        ),
      ];
    }
    if (!("fixed" in h.seating)) return [];
    return h.seating.fixed.flatMap((minute, k) =>
      minute < h.opensAt || minute > h.lastSeatingAt
        ? [
            issue(
              `${path}.seating.fixed[${k}]`,
              "seating_outside_service",
              "Seating times must fall between opening and last seating."
            ),
          ]
        : []
    );
  };
  const pathed = config.scheduleServices.map((row, i) => ({
    scheduleId: row.scheduleId,
    path: `scheduleServices[${i}]`,
    hours: row,
  }));
  return [...new Set(pathed.map((r) => r.scheduleId))].flatMap((id) => {
    const own = pathed.filter((r) => r.scheduleId === id);
    const sorted = own
      .filter(({ hours }) => hours.closesAt > hours.opensAt)
      .sort((a, b) => a.hours.opensAt - b.hours.opensAt);
    const overlaps = sorted.flatMap((later, i) => {
      const earlier = sorted.slice(0, i).find((e) => e.hours.closesAt > later.hours.opensAt);
      return earlier
        ? [
            issue(
              `${later.path}.opensAt`,
              "overlap",
              `Overlaps another service (${formatMinute(earlier.hours.opensAt)} – ${formatMinute(earlier.hours.closesAt)}).`
            ),
          ]
        : [];
    });
    return [...own.flatMap((r) => hoursIssues(r.path, r.hours)), ...overlaps];
  });
}

/** `resolveDay`'s service choice as it was before day scope: every row of the schedule in force, base hours. */
function oracleServices(config: AvailabilityConfig, date: string) {
  const live = new Set(config.schedules.filter((s) => !s.archivedAt).map((s) => s.id));
  const covering = config.assignments
    .filter(
      (a) =>
        live.has(a.scheduleId) &&
        a.weekdays.includes(weekdayIndexOf(date)) &&
        (a.startsOn == null || a.startsOn <= date) &&
        (a.endsOn == null || date <= a.endsOn)
    )
    .reduce<ScheduleAssignment | null>(
      (best, a) => (best === null || a.precedence > best.precedence ? a : best),
      null
    );
  const venueServices = new Map(
    config.venueServices.filter((v) => !v.archivedAt).map((v) => [v.id, v])
  );
  const services = config.scheduleServices
    .filter((s) => s.scheduleId === (covering?.scheduleId ?? null))
    .flatMap((s) => {
      const venueService = venueServices.get(s.venueServiceId);
      return venueService
        ? [
            {
              scheduleServiceId: s.id,
              venueServiceId: s.venueServiceId,
              name: venueService.name,
              opensAt: s.opensAt,
              lastSeatingAt: s.lastSeatingAt,
              closesAt: s.closesAt,
              seating: s.seating,
              bookingTypes: s.bookingTypes,
            },
          ]
        : [];
    })
    .sort((a, b) => a.opensAt - b.opensAt);
  return { scheduleId: covering?.scheduleId ?? null, services };
}

/** Configs whose rows are all unscoped: two schedules, random (not necessarily valid) hours, random assignments. */
const legacyConfigArb = fc
  .record({
    rows: fc.array(
      fc.record({
        schedule: fc.constantFrom("regular", "other"),
        service: fc.integer({ min: 0, max: 2 }),
        opensAt: fc.integer({ min: 0, max: 1439 }),
        lastSeatingAt: fc.integer({ min: 0, max: 1700 }),
        closesAt: fc.integer({ min: 0, max: 1800 }),
        fixed: fc.option(
          fc.array(fc.integer({ min: 0, max: 1700 }), { minLength: 1, maxLength: 3 }),
          {
            nil: null,
          }
        ),
      }),
      { maxLength: 5 }
    ),
    archivedService: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
    archivedSchedule: fc.boolean(),
    assignments: fc.array(
      fc.record({
        schedule: fc.constantFrom("regular", "other"),
        weekdays: fc.subarray(WEEKDAY_INDEXES, { minLength: 1 }),
        precedence: fc.integer({ min: 0, max: 2 }),
        dated: fc.boolean(),
      }),
      { maxLength: 3 }
    ),
  })
  .map(({ rows, archivedService, archivedSchedule, assignments }): AvailabilityConfig => ({
    schedules: [
      { id: "regular", name: "Regular", kind: "regular", isRegular: true },
      {
        id: "other",
        name: "Other",
        kind: "alternate",
        isRegular: false,
        ...(archivedSchedule ? { archivedAt: "2026-10-01T00:00:00.000Z" } : {}),
      },
    ],
    venueServices: [0, 1, 2].map((i) => ({
      id: `vs-${i}`,
      name: `S${i}`,
      position: i,
      ...(archivedService === i ? { archivedAt: "2026-10-01T00:00:00.000Z" } : {}),
    })),
    scheduleServices: rows.map((r, i) => ({
      id: `ss-${i}`,
      scheduleId: r.schedule,
      venueServiceId: `vs-${r.service}`,
      opensAt: r.opensAt,
      lastSeatingAt: r.lastSeatingAt,
      closesAt: r.closesAt,
      seating: r.fixed ? { version: 1, fixed: r.fixed } : { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    })),
    assignments: assignments.map((a, i) => ({
      id: `as-${i}`,
      scheduleId: a.schedule,
      weekdays: a.weekdays,
      precedence: a.precedence,
      ...(a.dated ? { startsOn: "2026-11-02", endsOn: "2026-11-30" } : {}),
    })),
    dateRules: [],
  }));

describe("legacy configs agree with the pre-change functions (oracle)", () => {
  it("resolves the same schedule and services on every date", () => {
    fc.assert(
      fc.property(legacyConfigArb, fc.constantFrom(...DATES), (config, date) => {
        const day = resolveDay({ timezone: "UTC", config }, date);
        const oracle = oracleServices(config, date);
        expect(day.scheduleId).toBe(oracle.scheduleId);
        expect(day.services).toEqual(oracle.services);
      }),
      { numRuns: 500 }
    );
  });

  it("reports the same schedule-service issues, in the same order", () => {
    fc.assert(
      fc.property(legacyConfigArb, (config) => {
        const issues = validateConfig(config)
          .filter((i) => i.path.startsWith("scheduleServices["))
          .map(({ path, code, message }) => ({ path, code, message }));
        expect(issues).toEqual(oracleScheduleServiceIssues(config));
      }),
      { numRuns: 500 }
    );
  });
});
