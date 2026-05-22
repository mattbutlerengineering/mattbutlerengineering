import { describe, it, expect } from "vitest";
import { buildBookingEmailContent } from "./booking-email-content.js";
import type { BookingNotificationInput } from "./port.js";

const defaultInput: BookingNotificationInput = {
  reservationId: "res_abc123",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+1555123456",
  specialRequests: "Window seat please",
  venueName: "The Oak Table",
  venueTimezone: "America/Los_Angeles",
  venueAddress: "123 Main St, Portland OR",
  manageToken: "tok_abc123",
};

const manageBaseUrl = "https://app.mbe.dev/reservations/manage";

describe("buildBookingEmailContent", () => {
  describe("confirmation", () => {
    it("returns correct subject", () => {
      const result = buildBookingEmailContent(defaultInput, "confirmation", manageBaseUrl);
      expect(result.subject).toBe("Reservation Confirmed — The Oak Table");
    });

    it("HTML contains venue name and booking details", () => {
      const result = buildBookingEmailContent(defaultInput, "confirmation", manageBaseUrl);
      expect(result.html).toContain("The Oak Table");
      expect(result.html).toContain("2026-06-15");
      expect(result.html).toContain("19:00");
      expect(result.html).toContain("4");
    });

    it("HTML contains manage link with token", () => {
      const result = buildBookingEmailContent(defaultInput, "confirmation", manageBaseUrl);
      expect(result.html).toContain(`${manageBaseUrl}?token=tok_abc123`);
    });

    it("includes iCal with METHOD REQUEST", () => {
      const result = buildBookingEmailContent(defaultInput, "confirmation", manageBaseUrl);
      expect(result.ical).toBeDefined();
      expect(result.ical).toContain("BEGIN:VCALENDAR");
      expect(result.ical).toContain("METHOD:REQUEST");
      expect(result.icalMethod).toBe("REQUEST");
    });

    it("HTML includes venue address when present", () => {
      const result = buildBookingEmailContent(defaultInput, "confirmation", manageBaseUrl);
      expect(result.html).toContain("123 Main St, Portland OR");
    });

    it("HTML omits venue address when null", () => {
      const input = { ...defaultInput, venueAddress: null };
      const result = buildBookingEmailContent(input, "confirmation", manageBaseUrl);
      expect(result.html).not.toContain("null");
    });
  });

  describe("reminder", () => {
    it("returns correct subject", () => {
      const result = buildBookingEmailContent(defaultInput, "reminder", manageBaseUrl);
      expect(result.subject).toBe("Reminder: Reservation at The Oak Table");
    });

    it("HTML contains booking details", () => {
      const result = buildBookingEmailContent(defaultInput, "reminder", manageBaseUrl);
      expect(result.html).toContain("The Oak Table");
      expect(result.html).toContain("2026-06-15");
      expect(result.html).toContain("19:00");
    });

    it("HTML contains manage link", () => {
      const result = buildBookingEmailContent(defaultInput, "reminder", manageBaseUrl);
      expect(result.html).toContain(`${manageBaseUrl}?token=tok_abc123`);
    });

    it("iCal is absent (no ical attachment for reminders)", () => {
      const result = buildBookingEmailContent(defaultInput, "reminder", manageBaseUrl);
      expect(result.ical).toBeUndefined();
      expect(result.icalMethod).toBeUndefined();
    });
  });

  describe("modified", () => {
    it("returns correct subject", () => {
      const result = buildBookingEmailContent(defaultInput, "modified", manageBaseUrl);
      expect(result.subject).toBe("Updated: Reservation at The Oak Table");
    });

    it("HTML contains booking details", () => {
      const result = buildBookingEmailContent(defaultInput, "modified", manageBaseUrl);
      expect(result.html).toContain("The Oak Table");
      expect(result.html).toContain("2026-06-15");
    });

    it("HTML contains manage link", () => {
      const result = buildBookingEmailContent(defaultInput, "modified", manageBaseUrl);
      expect(result.html).toContain(`${manageBaseUrl}?token=tok_abc123`);
    });

    it("includes iCal with METHOD REQUEST", () => {
      const result = buildBookingEmailContent(defaultInput, "modified", manageBaseUrl);
      expect(result.ical).toBeDefined();
      expect(result.ical).toContain("METHOD:REQUEST");
      expect(result.icalMethod).toBe("REQUEST");
    });

    it("iCal uses provided sequence number", () => {
      const input = { ...defaultInput, sequence: 3 };
      const result = buildBookingEmailContent(input, "modified", manageBaseUrl);
      expect(result.ical).toContain("SEQUENCE:3");
    });

    it("iCal defaults sequence to 1 when not provided", () => {
      const { sequence: _, ...inputWithoutSeq } = defaultInput;
      const result = buildBookingEmailContent(
        inputWithoutSeq as BookingNotificationInput,
        "modified",
        manageBaseUrl
      );
      expect(result.ical).toContain("SEQUENCE:1");
    });
  });

  describe("cancelled", () => {
    it("returns correct subject", () => {
      const result = buildBookingEmailContent(defaultInput, "cancelled", manageBaseUrl);
      expect(result.subject).toBe("Cancelled: Reservation at The Oak Table");
    });

    it("HTML contains booking details", () => {
      const result = buildBookingEmailContent(defaultInput, "cancelled", manageBaseUrl);
      expect(result.html).toContain("The Oak Table");
      expect(result.html).toContain("2026-06-15");
    });

    it("includes iCal with METHOD CANCEL", () => {
      const result = buildBookingEmailContent(defaultInput, "cancelled", manageBaseUrl);
      expect(result.ical).toBeDefined();
      expect(result.ical).toContain("METHOD:CANCEL");
      expect(result.icalMethod).toBe("CANCEL");
    });

    it("HTML does NOT contain manage link (cancelled bookings)", () => {
      const result = buildBookingEmailContent(defaultInput, "cancelled", manageBaseUrl);
      // Cancelled HTML doesn't include manage link per original implementation
      expect(result.html).not.toContain("Modify or Cancel");
    });
  });
});
