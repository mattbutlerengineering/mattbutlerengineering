import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";
import type { PublicVenueConfig } from "@mbe/types";
import { buildReservationIcs } from "./ics.js";

const FIXED_NOW = new Date("2026-01-10T12:00:00.000Z");

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_12345678",
    date: "2026-02-14",
    // 7:00 PM / 9:00 PM America/New_York on 2026-02-14 (EST, UTC-5)
    startTime: "2026-02-15T00:00:00.000Z",
    endTime: "2026-02-15T02:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table_1",
    venueId: "venue_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeVenue(overrides: Partial<PublicVenueConfig> = {}): PublicVenueConfig {
  return {
    name: "The Rialto Grill",
    slug: "the-rialto-grill",
    ianaTimezone: "America/New_York",
    currencyCode: "usd",
    operatingHours: null,
    settings: {},
    deposit: {
      enabled: false,
      depositType: null,
      amountCents: null,
      freeCancellationHours: null,
      lateCancellationFeePercent: null,
      noShowFeePercent: null,
    },
    ...overrides,
  };
}

/** Split ICS output into unfolded logical lines (reverses RFC 5545 folding). */
function unfold(ics: string): string[] {
  return ics.split("\r\n").reduce<string[]>((lines, rawLine) => {
    if (rawLine.startsWith(" ") && lines.length > 0) {
      const last = lines[lines.length - 1] as string;
      return [...lines.slice(0, -1), last + rawLine.slice(1)];
    }
    return [...lines, rawLine];
  }, []);
}

describe("buildReservationIcs", () => {
  it("returns a string starting with BEGIN:VCALENDAR and ending with END:VCALENDAR", () => {
    const ics = buildReservationIcs(makeReservation(), makeVenue(), { now: FIXED_NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });

  it("uses CRLF line endings throughout, including the final line", () => {
    const ics = buildReservationIcs(makeReservation(), makeVenue(), { now: FIXED_NOW });
    expect(ics).not.toMatch(/(?<!\r)\n/); // no bare LF
    const lines = ics.split("\r\n");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("keeps every physical line at or under 75 octets", () => {
    const reservation = makeReservation({
      guestName: "Jane Doe with a Very Long Name That Keeps On Going and Going",
    });
    const venue = makeVenue({ name: "The Rialto Grill & Wine Bar Downtown Location" });
    const ics = buildReservationIcs(reservation, venue, {
      now: FIXED_NOW,
      cancellationUrl:
        "https://mattbutlerengineering.com/cancel/res_12345678?token=placeholder-token",
    });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("folds long lines with a single leading space and no split mid-codepoint", () => {
    const venue = makeVenue({ name: "Café Résumé ".repeat(6).trim() }); // multi-byte chars
    const ics = buildReservationIcs(makeReservation(), venue, { now: FIXED_NOW });
    const lines = ics.split("\r\n");
    const continuationLines = lines.filter((line) => line.startsWith(" "));
    expect(continuationLines.length).toBeGreaterThan(0);
    for (const line of continuationLines) {
      // Every byte in the folded segment must decode cleanly (no lone continuation byte cut off)
      const bytes = new TextEncoder().encode(line);
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).not.toThrow();
    }
    // Unfolding SUMMARY should reproduce the (escaped) venue name intact
    const unfolded = unfold(ics);
    const summaryLine = unfolded.find((line) => line.startsWith("SUMMARY:"));
    expect(summaryLine).toContain("Café Résumé");
  });

  it("sets DTSTART/DTEND with TZID=<ianaTimezone> and no trailing Z, matching local time", () => {
    const ics = buildReservationIcs(makeReservation(), makeVenue(), { now: FIXED_NOW });
    const lines = unfold(ics);
    const dtstart = lines.find((line) => line.startsWith("DTSTART"));
    const dtend = lines.find((line) => line.startsWith("DTEND"));
    expect(dtstart).toBe("DTSTART;TZID=America/New_York:20260214T190000");
    expect(dtend).toBe("DTEND;TZID=America/New_York:20260214T210000");
    expect(dtstart).not.toMatch(/Z$/);
    expect(dtend).not.toMatch(/Z$/);
  });

  it("includes party size and the cancellation link in DESCRIPTION", () => {
    const ics = buildReservationIcs(makeReservation({ partySize: 6 }), makeVenue(), {
      now: FIXED_NOW,
      cancellationUrl: "https://mattbutlerengineering.com/cancel/res_12345678",
    });
    const lines = unfold(ics);
    const description = lines.find((line) => line.startsWith("DESCRIPTION:"));
    expect(description).toContain("6");
    expect(description).toContain("https://mattbutlerengineering.com/cancel/res_12345678");
  });

  it("escapes commas, semicolons, and backslashes in TEXT values", () => {
    const venue = makeVenue({ name: "Smith, Jones & Co." });
    const reservation = makeReservation({ guestName: "O'Brien; The \\Test\\" });
    const ics = buildReservationIcs(reservation, venue, {
      now: FIXED_NOW,
      cancellationUrl: "https://example.com/cancel?a=1,2;b=3",
    });
    const lines = unfold(ics);
    const summary = lines.find((line) => line.startsWith("SUMMARY:"));
    const description = lines.find((line) => line.startsWith("DESCRIPTION:"));
    expect(summary).toContain("Smith\\, Jones & Co.");
    expect(description).toContain("a=1\\,2\\;b=3");
  });

  it("is deterministic given the same now/uid inputs (no Date.now() leakage)", () => {
    const reservation = makeReservation();
    const venue = makeVenue();
    const first = buildReservationIcs(reservation, venue, { now: FIXED_NOW });
    const second = buildReservationIcs(reservation, venue, { now: FIXED_NOW });
    expect(first).toBe(second);
  });

  it("emits DTSTAMP and UID lines", () => {
    const ics = buildReservationIcs(makeReservation(), makeVenue(), { now: FIXED_NOW });
    const lines = unfold(ics);
    expect(lines.some((line) => line.startsWith("DTSTAMP:20260110T120000Z"))).toBe(true);
    expect(lines.some((line) => line.startsWith("UID:"))).toBe(true);
  });

  describe("DST and timezone edge cases", () => {
    it("reports the correct post-transition local time for a 'spring forward gap' instant (2026-03-08 America/New_York)", () => {
      // 07:30 UTC on 2026-03-08 is the instant that a naive fixed EST
      // (UTC-5) offset would render as 02:30 local — but US clocks jump
      // from 01:59:59 EST straight to 03:00:00 EDT at 07:00 UTC, so local
      // 02:00-02:59 never exists that day. Documented behavior: the
      // builder derives wall-clock time from the real per-instant offset
      // (via Intl), so it must never emit the impossible 02:30 — it
      // reports the correct post-transition 03:30 EDT.
      const reservation = makeReservation({
        startTime: "2026-03-08T07:30:00.000Z",
        endTime: "2026-03-08T09:30:00.000Z",
      });
      const ics = buildReservationIcs(reservation, makeVenue(), { now: FIXED_NOW });
      const lines = unfold(ics);
      const dtstart = lines.find((line) => line.startsWith("DTSTART"));
      const dtend = lines.find((line) => line.startsWith("DTEND"));
      expect(dtstart).toBe("DTSTART;TZID=America/New_York:20260308T033000");
      expect(dtend).toBe("DTEND;TZID=America/New_York:20260308T053000");
    });

    it("does not throw and renders wall-clock time for a reservation starting in the 'fall back' ambiguous hour (2026-11-01 01:30 America/New_York)", () => {
      // 2026-11-01 01:30 local occurs twice: once as EDT (05:30 UTC) and
      // once as EST (06:30 UTC). Documented behavior: RFC 5545's
      // TZID form encodes wall-clock only — it has no offset field to
      // disambiguate — so consuming calendar apps resolve the ambiguity
      // using the IANA tz database's transition rules. That's expected,
      // not a bug; Outlook's explicit-offset deep-link (calendarLinks.test.ts)
      // does disambiguate the same instant.
      const reservation = makeReservation({
        startTime: "2026-11-01T05:30:00.000Z", // 01:30 EDT (first occurrence)
        endTime: "2026-11-01T07:30:00.000Z", // 02:30 EST (post-transition)
      });
      expect(() => buildReservationIcs(reservation, makeVenue(), { now: FIXED_NOW })).not.toThrow();
      const lines = unfold(buildReservationIcs(reservation, makeVenue(), { now: FIXED_NOW }));
      const dtstart = lines.find((line) => line.startsWith("DTSTART"));
      const dtend = lines.find((line) => line.startsWith("DTEND"));
      expect(dtstart).toBe("DTSTART;TZID=America/New_York:20261101T013000");
      expect(dtend).toBe("DTEND;TZID=America/New_York:20261101T023000");
    });

    it("produces a DTEND on the following calendar day for a midnight-crossing reservation", () => {
      const reservation = makeReservation({
        startTime: "2026-06-11T03:00:00.000Z", // 23:00 EDT on 2026-06-10
        endTime: "2026-06-11T05:00:00.000Z", // 01:00 EDT on 2026-06-11
      });
      const ics = buildReservationIcs(reservation, makeVenue(), { now: FIXED_NOW });
      const lines = unfold(ics);
      const dtstart = lines.find((line) => line.startsWith("DTSTART"));
      const dtend = lines.find((line) => line.startsWith("DTEND"));
      expect(dtstart).toBe("DTSTART;TZID=America/New_York:20260610T230000");
      expect(dtend).toBe("DTEND;TZID=America/New_York:20260611T010000");
    });

    it("reflects venue-local time regardless of the test runner's TZ env var", () => {
      // Explicit-timeZone Intl calls (formatIcsLocalDateTime) ignore
      // process.env.TZ entirely — asserting against a far-away runner TZ
      // (UTC+14) rather than the default proves the output is
      // deterministic in CI regardless of runner locale/TZ config.
      const originalTz = process.env.TZ;
      process.env.TZ = "Pacific/Kiritimati";
      try {
        const ics = buildReservationIcs(makeReservation(), makeVenue(), { now: FIXED_NOW });
        const lines = unfold(ics);
        const dtstart = lines.find((line) => line.startsWith("DTSTART"));
        expect(dtstart).toBe("DTSTART;TZID=America/New_York:20260214T190000");
      } finally {
        process.env.TZ = originalTz;
      }
    });
  });
});
