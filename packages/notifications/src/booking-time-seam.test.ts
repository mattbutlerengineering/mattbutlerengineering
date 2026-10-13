import { describe, it, expect } from "vitest";
import { buildBookingEmailContent } from "./booking-email-content.js";
import { calendarSequence, toVenueLocalTime } from "./venue-time.js";
import type { BookingNotificationInput } from "./port.js";

// 2026-05-10T23:00Z is 7:00 PM in New York (EDT, UTC-4).
const input: BookingNotificationInput = {
  reservationId: "res_1",
  date: "2026-05-10",
  startTime: "2026-05-10T23:00:00.000Z",
  endTime: "2026-05-11T01:00:00.000Z",
  partySize: 2,
  guestName: "Jane",
  guestEmail: "jane@example.com",
  guestPhone: null,
  specialRequests: null,
  venueName: "The Oak Table",
  venueTimezone: "America/New_York",
  venueAddress: null,
  manageToken: "tok",
  updatedAt: "2026-05-01T10:00:00.000Z",
};
const base = "https://m.example.com/manage";

describe("venue-local booking time", () => {
  it("converts a UTC instant to venue-local values", () => {
    const t = toVenueLocalTime(input.startTime, "America/New_York", input.date);
    expect(t).toMatchObject({ date: "2026-05-10", time: "19:00", display: "7:00 PM" });
    expect(t.icalUtc).toBe("20260510T230000Z");
  });

  it("uses the venue-local date when UTC has already rolled over", () => {
    const t = toVenueLocalTime("2026-05-11T03:30:00.000Z", "America/Los_Angeles", "2026-05-11");
    expect(t.date).toBe("2026-05-10");
    expect(t.display).toBe("8:30 PM");
  });

  it("email shows the venue-local time, not the ISO instant", () => {
    const { html } = buildBookingEmailContent(input, "confirmation", base);
    expect(html).toContain("2026-05-10 at 7:00 PM");
    expect(html).not.toContain("T23:00");
  });

  it("ics emits valid DTSTART/DTEND", () => {
    const { ical } = buildBookingEmailContent(input, "confirmation", base);
    expect(ical).toMatch(/^DTSTART:20260510T230000Z$/m);
    expect(ical).toMatch(/^DTEND:20260511T010000Z$/m);
  });
});

describe("iCal SEQUENCE", () => {
  const seq = (event: "confirmation" | "modified" | "cancelled", updatedAt: string): number => {
    const { ical } = buildBookingEmailContent({ ...input, updatedAt }, event, base);
    return Number(/^SEQUENCE:(\d+)$/m.exec(ical ?? "")?.[1]);
  };

  it("strictly increases across confirm, modify, modify, cancel", () => {
    const values = [
      seq("confirmation", "2026-05-01T10:00:00.000Z"),
      seq("modified", "2026-05-01T10:05:00.000Z"),
      seq("modified", "2026-05-01T10:09:00.000Z"),
      seq("cancelled", "2026-05-01T11:00:00.000Z"),
    ];
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(4);
    expect(values[0]).toBe(calendarSequence("2026-05-01T10:00:00.000Z"));
  });
});
