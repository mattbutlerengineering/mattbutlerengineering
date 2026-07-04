import { describe, it, expect } from "vitest";
import { escapeHtml, escapeIcalText, sanitizeUrl, buildBookingEmail } from "./email-content.js";
import type { BookingEmailTemplateInput } from "./email-content.js";

describe("email-content shared helpers", () => {
  it("exposes escapeHtml", () => {
    expect(escapeHtml(`<b>"x"</b>`)).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  });

  it("exposes escapeIcalText", () => {
    expect(escapeIcalText("a;b,c")).toBe("a\\;b\\,c");
  });

  it("exposes sanitizeUrl", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("round-trip safety of escaping", () => {
  it("escapeHtml output decodes back to the original string", () => {
    const original = `Tom & Jerry's "Diner" <3>`;
    const escaped = escapeHtml(original);
    const decoded = escaped
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    expect(decoded).toBe(original);
  });

  it("escapeIcalText output decodes back to the original string", () => {
    const original = "Meeting; lunch, notes\nline2\\ done";
    const escaped = escapeIcalText(original);
    const decoded = escaped
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
    expect(decoded).toBe(original);
  });

  it("encodeURIComponent(manageToken) decodes back to the original token", () => {
    const token = `tok&"><script>x</script>`;
    const encoded = encodeURIComponent(token);
    expect(decodeURIComponent(encoded)).toBe(token);
  });
});

describe("buildBookingEmail", () => {
  const baseInput: BookingEmailTemplateInput = {
    reservationId: "res_abc123",
    date: "2026-06-15",
    startTime: "19:00",
    endTime: "21:00",
    partySize: 4,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: "+1555123456",
    specialRequests: null,
    venueName: "The Oak Table",
    venueTimezone: "America/Los_Angeles",
    venueAddress: "123 Main St, Portland OR",
    manageToken: "tok_abc123",
    manageBaseUrl: "https://app.mbe.dev/reservations/manage",
  };

  it("confirmation: builds subject, heading, address, and manage link", () => {
    const { subject, html } = buildBookingEmail(baseInput, "confirmation");
    expect(subject).toBe("Reservation Confirmed — The Oak Table");
    expect(html).toContain("Your reservation is confirmed");
    expect(html).toContain("The Oak Table");
    expect(html).toContain("123 Main St, Portland OR");
    expect(html).toContain(`${baseInput.manageBaseUrl}?token=tok_abc123`);
  });

  it("reminder: builds subject, heading, address, and manage link", () => {
    const { subject, html } = buildBookingEmail(baseInput, "reminder");
    expect(subject).toBe("Reminder: Reservation at The Oak Table");
    expect(html).toContain("Your reservation is tomorrow");
    expect(html).toContain(`${baseInput.manageBaseUrl}?token=tok_abc123`);
  });

  it("modified: builds subject, heading, address, and manage link", () => {
    const { subject, html } = buildBookingEmail(baseInput, "modified");
    expect(subject).toBe("Updated: Reservation at The Oak Table");
    expect(html).toContain("Your reservation has been updated");
    expect(html).toContain(`${baseInput.manageBaseUrl}?token=tok_abc123`);
  });

  it("cancelled: builds subject and heading, but omits address and manage link", () => {
    const { subject, html } = buildBookingEmail(baseInput, "cancelled");
    expect(subject).toBe("Cancelled: Reservation at The Oak Table");
    expect(html).toContain("Your reservation has been cancelled");
    expect(html).not.toContain("123 Main St, Portland OR");
    expect(html).not.toContain("Modify or Cancel");
  });

  it("escapes HTML special characters in venueName across all branches", () => {
    const input = { ...baseInput, venueName: `<script>alert("xss")</script>` };
    for (const event of ["confirmation", "reminder", "modified", "cancelled"] as const) {
      const { html } = buildBookingEmail(input, event);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("URL-encodes the manage token so an injected token cannot break out of the href", () => {
    const input = { ...baseInput, manageToken: `tok&"><script>x</script>` };
    const { html } = buildBookingEmail(input, "confirmation");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain(encodeURIComponent(input.manageToken));
  });

  it("drops the manage link (rather than rendering an unsafe href) when manageBaseUrl has a dangerous scheme", () => {
    const input = { ...baseInput, manageBaseUrl: "javascript:alert(1)" };
    const { html } = buildBookingEmail(input, "confirmation");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Modify or Cancel");
  });

  it("omits the venue address line when null", () => {
    const input = { ...baseInput, venueAddress: null };
    const { html } = buildBookingEmail(input, "confirmation");
    expect(html).not.toContain("null");
  });
});
