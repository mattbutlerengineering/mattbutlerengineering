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
});
