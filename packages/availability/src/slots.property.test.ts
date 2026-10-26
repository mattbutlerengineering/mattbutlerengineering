import type { AvailabilityConfig, DateRule, ScheduleService } from "@mbe/types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays } from "./civil-date.js";
import { serviceDayInstant } from "./instant.js";
import { validateConfig } from "./validate-config.js";
import { resolveDay } from "./resolve-day.js";
import { judge, listSlots, type BookingChannel, type BookingSnapshot } from "./slots.js";

/**
 * SC Correctness, engine half (#7499): over generated configurations, no
 * listed slot falls outside `resolveDay`, and `judge` is hard for every
 * instant inside a closure.
 */

const DATES = ["2026-11-01", "2026-11-06", "2027-03-14", "2027-06-15"] as const;
const ZONES = ["UTC", "America/Los_Angeles", "Australia/Lord_Howe"] as const;
const CHANNELS: BookingChannel[] = ["online", "phone"];
const NOW = new Date("2026-01-01T00:00:00Z");

/** 1–3 non-overlapping services; the last may run past midnight. */
const servicesArb = fc
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
        },
      ];
    }, [])
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
        for (let minute = 0; minute < 1440; minute += 5) {
          const start = serviceDayInstant(date, minute, snapshot.timezone);
          if (!start) continue;
          const verdict = judge(snapshot, { start, partySize: 2, channel: "online" }, NOW);
          if (verdict.kind === "ok") {
            expect(listed.has(start.getTime()), `${start.toISOString()}`).toBe(true);
          }
        }
      }),
      { numRuns: 300 }
    );
  });

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
