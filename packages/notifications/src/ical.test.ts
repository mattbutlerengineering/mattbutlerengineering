import { describe, it, expect } from "vitest";
import { generateBookingIcal, type IcalEventInput } from "./ical.js";

function validateRfc5545(ical: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!ical.includes("\r\n")) errors.push("missing CRLF line endings");
  const lines = ical.split("\r\n").filter(Boolean);

  if (lines[0] !== "BEGIN:VCALENDAR") errors.push("must start with BEGIN:VCALENDAR");
  if (lines[lines.length - 1] !== "END:VCALENDAR") errors.push("must end with END:VCALENDAR");

  const required = ["VERSION:2.0", "PRODID:", "METHOD:", "BEGIN:VEVENT", "END:VEVENT"];
  for (const prop of required) {
    if (!lines.some((l) => l.startsWith(prop))) errors.push(`missing ${prop}`);
  }

  const veventRequired = ["UID:", "DTSTAMP:", "DTSTART", "DTEND", "SUMMARY:"];
  for (const prop of veventRequired) {
    if (!lines.some((l) => l.startsWith(prop))) errors.push(`VEVENT missing ${prop}`);
  }

  const beginCount = lines.filter((l) => l === "BEGIN:VEVENT").length;
  const endCount = lines.filter((l) => l === "END:VEVENT").length;
  if (beginCount !== endCount) errors.push("mismatched BEGIN:VEVENT / END:VEVENT");

  return { valid: errors.length === 0, errors };
}

const defaultInput: IcalEventInput = {
  reservationId: "res_abc123",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  venueName: "The Oak Table",
  venueTimezone: "America/Los_Angeles",
};

describe("generateBookingIcal", () => {
  it("produces a valid VCALENDAR with METHOD:REQUEST", () => {
    const result = generateBookingIcal(defaultInput, "REQUEST");

    expect(result).toContain("BEGIN:VCALENDAR");
    expect(result).toContain("END:VCALENDAR");
    expect(result).toContain("METHOD:REQUEST");
    expect(result).toContain("VERSION:2.0");
    expect(result).toContain("BEGIN:VEVENT");
    expect(result).toContain("END:VEVENT");
  });

  it("generates a deterministic UID from reservationId", () => {
    const result1 = generateBookingIcal(defaultInput, "REQUEST");
    const result2 = generateBookingIcal(defaultInput, "REQUEST");

    const uid1 = result1.match(/UID:(.+)/)?.[1];
    const uid2 = result2.match(/UID:(.+)/)?.[1];

    expect(uid1).toBeDefined();
    expect(uid1).toBe(uid2);
    expect(uid1).toContain("res_abc123");
  });

  it("different reservationIds produce different UIDs", () => {
    const other = { ...defaultInput, reservationId: "res_xyz789" };
    const result1 = generateBookingIcal(defaultInput, "REQUEST");
    const result2 = generateBookingIcal(other, "REQUEST");

    const uid1 = result1.match(/UID:(.+)/)?.[1];
    const uid2 = result2.match(/UID:(.+)/)?.[1];

    expect(uid1).not.toBe(uid2);
  });

  it("DTSTART and DTEND use venue timezone", () => {
    const result = generateBookingIcal(defaultInput, "REQUEST");

    expect(result).toContain("DTSTART;TZID=America/Los_Angeles:20260615T190000");
    expect(result).toContain("DTEND;TZID=America/Los_Angeles:20260615T210000");
  });

  it("METHOD:REQUEST includes SUMMARY, LOCATION, STATUS:CONFIRMED", () => {
    const result = generateBookingIcal(defaultInput, "REQUEST");

    expect(result).toContain("SUMMARY:Reservation at The Oak Table");
    expect(result).toContain("LOCATION:The Oak Table");
    expect(result).toContain("STATUS:CONFIRMED");
  });

  it("METHOD:CANCEL uses same UID and sets STATUS:CANCELLED", () => {
    const request = generateBookingIcal(defaultInput, "REQUEST");
    const cancel = generateBookingIcal(defaultInput, "CANCEL");

    const requestUid = request.match(/UID:(.+)/)?.[1];
    const cancelUid = cancel.match(/UID:(.+)/)?.[1];

    expect(requestUid).toBe(cancelUid);
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
    expect(cancel).toContain("CANCELLED: Reservation at The Oak Table");
  });

  it("SEQUENCE defaults to 0 and can be overridden", () => {
    const result0 = generateBookingIcal(defaultInput, "REQUEST");
    const result3 = generateBookingIcal({ ...defaultInput, sequence: 3 }, "REQUEST");

    expect(result0).toContain("SEQUENCE:0");
    expect(result3).toContain("SEQUENCE:3");
  });

  it("includes PRODID and DTSTAMP", () => {
    const result = generateBookingIcal(defaultInput, "REQUEST");

    expect(result).toContain("PRODID:-//MBE//Booking//EN");
    expect(result).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it("handles null guestName and guestEmail gracefully", () => {
    const input = { ...defaultInput, guestName: null, guestEmail: null };
    const result = generateBookingIcal(input, "REQUEST");

    expect(result).toContain("DESCRIPTION:Party of 4");
    expect(result).not.toContain("ATTENDEE");
    expect(result).not.toContain("ORGANIZER");
  });

  it("passes RFC 5545 structural validation for METHOD:REQUEST", () => {
    const result = generateBookingIcal(defaultInput, "REQUEST");
    const { valid, errors } = validateRfc5545(result);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("passes RFC 5545 structural validation for METHOD:CANCEL", () => {
    const result = generateBookingIcal(defaultInput, "CANCEL");
    const { valid, errors } = validateRfc5545(result);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });
});
