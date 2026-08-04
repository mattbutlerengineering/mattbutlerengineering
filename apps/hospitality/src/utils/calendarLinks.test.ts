import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";
import type { PublicVenueConfig } from "@mbe/types";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from "./calendarLinks.js";

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

describe("buildGoogleCalendarUrl", () => {
  it("returns a well-formed calendar.google.com render URL", () => {
    const url = buildGoogleCalendarUrl(makeReservation(), makeVenue());
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(parsed.searchParams.get("action")).toBe("TEMPLATE");
  });

  it("sets dates=<start>/<end> in venue-local YYYYMMDDTHHmmSS form", () => {
    const url = buildGoogleCalendarUrl(makeReservation(), makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe("20260214T190000/20260214T210000");
  });

  it("sets ctz to the venue's IANA timezone", () => {
    const url = buildGoogleCalendarUrl(makeReservation(), makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ctz")).toBe("America/New_York");
  });

  it("URL-encodes special characters in guest/venue names without corrupting the URL", () => {
    const reservation = makeReservation({ guestName: "Jane & John O'Brien #1?" });
    const venue = makeVenue({ name: "Café & Bar, Ltd." });
    const url = buildGoogleCalendarUrl(reservation, venue, {
      cancellationUrl: "https://example.com/cancel?a=1&b=2",
    });
    // A valid, parseable URL with exactly one `?` (the query separator) proves no raw
    // `&`, `#`, `?`, or space leaked out of an encoded param value.
    expect(() => new URL(url)).not.toThrow();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("text")).toBe("Café & Bar, Ltd. Reservation");
    expect(parsed.searchParams.get("details")).toContain("https://example.com/cancel?a=1&b=2");
  });

  it("produces the correct venue-local wall clock across a DST transition", () => {
    // 2026-03-08 02:00 local is the US spring-forward instant (07:00 UTC); this
    // reservation straddles it, so start is EST (UTC-5) and end is EDT (UTC-4).
    const reservation = makeReservation({
      startTime: "2026-03-08T06:00:00.000Z", // 01:00 EST 2026-03-08 (pre-transition)
      endTime: "2026-03-08T09:00:00.000Z", // 05:00 EDT 2026-03-08 (post-transition)
    });
    const url = buildGoogleCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe("20260308T010000/20260308T050000");
  });

  it("reports the correct post-transition local time for a 'spring forward gap' instant (2026-03-08)", () => {
    // 07:30 UTC is the instant a naive fixed EST (UTC-5) offset would
    // render as the impossible 02:30 local. Documented behavior: derived
    // from the real per-instant offset, so it must report 03:30 EDT.
    const reservation = makeReservation({
      startTime: "2026-03-08T07:30:00.000Z",
      endTime: "2026-03-08T09:30:00.000Z",
    });
    const url = buildGoogleCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe("20260308T033000/20260308T053000");
  });

  it("does not throw for a reservation starting in the 'fall back' ambiguous hour (2026-11-01 01:30)", () => {
    // 01:30 local occurs twice (EDT then EST). Documented behavior: the
    // `dates=` param is wall-clock only (paired with `ctz`), so both
    // occurrences render identically — Google resolves the ambiguity via
    // its own IANA tz handling, same as ICS's TZID form.
    const reservation = makeReservation({
      startTime: "2026-11-01T05:30:00.000Z", // 01:30 EDT (first occurrence)
      endTime: "2026-11-01T07:30:00.000Z", // 02:30 EST (post-transition)
    });
    expect(() => buildGoogleCalendarUrl(reservation, makeVenue())).not.toThrow();
    const url = buildGoogleCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe("20261101T013000/20261101T023000");
  });

  it("produces an end date on the following calendar day for a midnight-crossing reservation", () => {
    const reservation = makeReservation({
      startTime: "2026-06-11T03:00:00.000Z", // 23:00 EDT on 2026-06-10
      endTime: "2026-06-11T05:00:00.000Z", // 01:00 EDT on 2026-06-11
    });
    const url = buildGoogleCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe("20260610T230000/20260611T010000");
  });

  it("reflects venue-local time regardless of the test runner's TZ env var", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      const url = buildGoogleCalendarUrl(makeReservation(), makeVenue());
      const parsed = new URL(url);
      expect(parsed.searchParams.get("dates")).toBe("20260214T190000/20260214T210000");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("buildOutlookCalendarUrl", () => {
  it("returns a well-formed outlook.live.com compose deep-link", () => {
    const url = buildOutlookCalendarUrl(makeReservation(), makeVenue());
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://outlook.live.com/calendar/0/deeplink/compose"
    );
  });

  it("sets startdt/enddt as ISO 8601 with an explicit timezone offset", () => {
    const url = buildOutlookCalendarUrl(makeReservation(), makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("startdt")).toBe("2026-02-14T19:00:00-05:00");
    expect(parsed.searchParams.get("enddt")).toBe("2026-02-14T21:00:00-05:00");
  });

  it("URL-encodes special characters in guest/venue names without corrupting the URL", () => {
    const reservation = makeReservation({ guestName: "Jane & John O'Brien #1?" });
    const venue = makeVenue({ name: "Café & Bar, Ltd." });
    const url = buildOutlookCalendarUrl(reservation, venue, {
      cancellationUrl: "https://example.com/cancel?a=1&b=2",
    });
    expect(() => new URL(url)).not.toThrow();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("subject")).toBe("Café & Bar, Ltd. Reservation");
    expect(parsed.searchParams.get("body")).toContain("https://example.com/cancel?a=1&b=2");
  });

  it("reflects the correct UTC offset across a DST transition", () => {
    const reservation = makeReservation({
      startTime: "2026-03-08T06:00:00.000Z", // pre-transition, EST (UTC-5)
      endTime: "2026-03-08T09:00:00.000Z", // post-transition, EDT (UTC-4)
    });
    const url = buildOutlookCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("startdt")).toBe("2026-03-08T01:00:00-05:00");
    expect(parsed.searchParams.get("enddt")).toBe("2026-03-08T05:00:00-04:00");
  });

  it("reports the correct post-transition offset for a 'spring forward gap' instant (2026-03-08)", () => {
    // 07:30 UTC is the instant a naive fixed EST (UTC-5) offset would
    // render as the impossible 02:30 local. Documented behavior: derived
    // from the real per-instant offset, so it must report 03:30-04:00 (EDT).
    const reservation = makeReservation({
      startTime: "2026-03-08T07:30:00.000Z",
      endTime: "2026-03-08T09:30:00.000Z",
    });
    const url = buildOutlookCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("startdt")).toBe("2026-03-08T03:30:00-04:00");
    expect(parsed.searchParams.get("enddt")).toBe("2026-03-08T05:30:00-04:00");
  });

  it("disambiguates the 'fall back' ambiguous hour (2026-11-01 01:30) via explicit UTC offset", () => {
    // Unlike ICS's TZID form and Google's wall-clock `dates=` param,
    // Outlook's explicit-offset ISO 8601 timestamps fully disambiguate the
    // repeated local hour: the first (EDT) and second (EST) occurrences of
    // 01:30 local get distinct offsets even though the wall-clock digits match.
    const reservation = makeReservation({
      startTime: "2026-11-01T05:30:00.000Z", // 01:30 EDT (first occurrence)
      endTime: "2026-11-01T06:30:00.000Z", // 01:30 EST (second occurrence)
    });
    const url = buildOutlookCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("startdt")).toBe("2026-11-01T01:30:00-04:00");
    expect(parsed.searchParams.get("enddt")).toBe("2026-11-01T01:30:00-05:00");
  });

  it("produces an end timestamp on the following calendar day for a midnight-crossing reservation", () => {
    const reservation = makeReservation({
      startTime: "2026-06-11T03:00:00.000Z", // 23:00 EDT on 2026-06-10
      endTime: "2026-06-11T05:00:00.000Z", // 01:00 EDT on 2026-06-11
    });
    const url = buildOutlookCalendarUrl(reservation, makeVenue());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("startdt")).toBe("2026-06-10T23:00:00-04:00");
    expect(parsed.searchParams.get("enddt")).toBe("2026-06-11T01:00:00-04:00");
  });

  it("reflects venue-local time regardless of the test runner's TZ env var", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      const url = buildOutlookCalendarUrl(makeReservation(), makeVenue());
      const parsed = new URL(url);
      expect(parsed.searchParams.get("startdt")).toBe("2026-02-14T19:00:00-05:00");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
