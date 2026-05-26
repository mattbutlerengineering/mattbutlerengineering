import { describe, it, expect, vi, beforeEach } from "vitest";

// Declare mock instance at module scope so factory can reference it
const mockEmailSend = vi.fn();
const mockResendInstance = {
  emails: { send: mockEmailSend },
};

// Mock prisma before importing module under test
vi.mock("./database.js", () => ({
  prisma: {
    reservation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock resend at boundary — use hoistable factory
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return mockResendInstance;
  }),
}));

import { prisma } from "./database.js";
import { sendPostVisitEmail } from "./notification.js";

const baseReservation = {
  id: "res_1",
  date: new Date("2026-06-14"),
  startTime: new Date("2026-06-14T19:00:00Z"),
  guestId: "guest_1",
  emailStatus: null,
  guest: {
    id: "guest_1",
    email: "jane@example.com",
    name: "Jane Doe",
    unsubscribed: false,
  },
  venue: {
    id: "venue_1",
    name: "The Oak Table",
    settings: { postVisitEmailEnabled: true, feedbackUrl: "https://example.com/feedback" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  mockEmailSend.mockResolvedValue({ id: "email_id_1" });
});

describe("sendPostVisitEmail", () => {
  it("sends email when postVisitEmailEnabled, guest has email, not unsubscribed", async () => {
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(baseReservation as never);
    vi.mocked(prisma.reservation.update).mockResolvedValueOnce({ ...baseReservation, emailStatus: "SENT" } as never);

    await sendPostVisitEmail("res_1");

    expect(mockEmailSend).toHaveBeenCalledOnce();
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        from: "test@example.com",
        subject: expect.stringContaining("The Oak Table"),
        html: expect.stringContaining("Jane"),
      })
    );
  });

  it("sets emailStatus SENT on success", async () => {
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(baseReservation as never);
    vi.mocked(prisma.reservation.update).mockResolvedValueOnce({ ...baseReservation, emailStatus: "SENT" } as never);

    await sendPostVisitEmail("res_1");

    expect(prisma.reservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res_1" },
        data: { emailStatus: "SENT" },
      })
    );
  });

  it("skips when postVisitEmailEnabled is false", async () => {
    const reservation = {
      ...baseReservation,
      venue: { ...baseReservation.venue, settings: { postVisitEmailEnabled: false } },
    };
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(reservation as never);

    await sendPostVisitEmail("res_1");

    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(prisma.reservation.update).not.toHaveBeenCalled();
  });

  it("skips when venue settings is null", async () => {
    const reservation = {
      ...baseReservation,
      venue: { ...baseReservation.venue, settings: null },
    };
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(reservation as never);

    await sendPostVisitEmail("res_1");

    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it("skips when guest has no email", async () => {
    const reservation = {
      ...baseReservation,
      guest: { ...baseReservation.guest, email: null },
    };
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(reservation as never);

    await sendPostVisitEmail("res_1");

    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it("skips when guest is null (no linked guest)", async () => {
    const reservation = { ...baseReservation, guest: null };
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(reservation as never);

    await sendPostVisitEmail("res_1");

    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it("skips when guest.unsubscribed is true", async () => {
    const reservation = {
      ...baseReservation,
      guest: { ...baseReservation.guest, unsubscribed: true },
    };
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(reservation as never);

    await sendPostVisitEmail("res_1");

    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it("sets emailStatus FAILED when Resend throws", async () => {
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(baseReservation as never);
    mockEmailSend.mockRejectedValueOnce(new Error("Resend API error"));
    vi.mocked(prisma.reservation.update).mockResolvedValueOnce({ ...baseReservation, emailStatus: "FAILED" } as never);

    await sendPostVisitEmail("res_1");

    expect(prisma.reservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res_1" },
        data: { emailStatus: "FAILED" },
      })
    );
  });

  it("does nothing when reservation not found", async () => {
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(null);

    await sendPostVisitEmail("nonexistent");

    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(prisma.reservation.update).not.toHaveBeenCalled();
  });

  it("includes unsubscribe link in email html", async () => {
    vi.mocked(prisma.reservation.findUnique).mockResolvedValueOnce(baseReservation as never);
    vi.mocked(prisma.reservation.update).mockResolvedValueOnce({ ...baseReservation, emailStatus: "SENT" } as never);

    await sendPostVisitEmail("res_1");

    const call = mockEmailSend.mock.calls[0][0] as { html: string };
    expect(call.html).toContain("/public/v1/guests/unsubscribe?token=");
  });
});
