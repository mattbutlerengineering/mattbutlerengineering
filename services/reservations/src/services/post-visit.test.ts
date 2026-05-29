import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotificationPort } from "@mbe/notifications";

const mockPrisma = vi.hoisted(() => ({
  reservation: {
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("./database.js", () => ({
  prisma: mockPrisma,
}));

const { sendPostVisitEmail } = await import("./post-visit.js");

const mockNotificationPort: NotificationPort = {
  sendBookingConfirmation: vi.fn(),
  sendBookingReminder: vi.fn(),
  sendBookingModified: vi.fn(),
  sendBookingCancelled: vi.fn(),
  sendPostVisitThankYou: vi.fn().mockResolvedValue(undefined),
};

const baseReservation = {
  id: "res_001",
  guestEmail: "guest@example.com",
  date: new Date("2026-05-29"),
  startTime: new Date("2026-05-29T19:00:00Z"),
  endTime: new Date("2026-05-29T21:00:00Z"),
  partySize: 2,
  status: "COMPLETED" as const,
  guestName: "Jane Doe",
  guestPhone: null,
  guestId: "guest_001",
  userId: null,
  tableId: "table_001",
  venueId: "venue_001",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  occasion: null,
  seatingPreference: null,
  emailStatus: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseGuest = {
  id: "guest_001",
  name: "Jane Doe",
  email: "guest@example.com",
  unsubscribed: false,
};

const baseVenue = {
  id: "venue_001",
  name: "The Oak Table",
  postVisitEmailEnabled: true,
};

describe("sendPostVisitEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockNotificationPort.sendPostVisitThankYou as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
  });

  it("sends thank-you email when postVisitEmailEnabled=true and guest not unsubscribed", async () => {
    await sendPostVisitEmail(baseReservation, baseGuest, baseVenue, mockNotificationPort);

    expect(mockNotificationPort.sendPostVisitThankYou).toHaveBeenCalledOnce();
    expect(mockNotificationPort.sendPostVisitThankYou).toHaveBeenCalledWith({
      guestEmail: "guest@example.com",
      guestFirstName: "Jane",
      venueName: "The Oak Table",
      reservationDate: "2026-05-29",
    });
  });

  it("skips email when postVisitEmailEnabled=false", async () => {
    const venue = { ...baseVenue, postVisitEmailEnabled: false };

    await sendPostVisitEmail(baseReservation, baseGuest, venue, mockNotificationPort);

    expect(mockNotificationPort.sendPostVisitThankYou).not.toHaveBeenCalled();
    expect(mockPrisma.reservation.update).not.toHaveBeenCalled();
  });

  it("skips email when guest.unsubscribed=true", async () => {
    const guest = { ...baseGuest, unsubscribed: true };

    await sendPostVisitEmail(baseReservation, guest, baseVenue, mockNotificationPort);

    expect(mockNotificationPort.sendPostVisitThankYou).not.toHaveBeenCalled();
    expect(mockPrisma.reservation.update).not.toHaveBeenCalled();
  });

  it("sets emailStatus=SENT on successful send", async () => {
    mockPrisma.reservation.update.mockResolvedValue({});

    await sendPostVisitEmail(baseReservation, baseGuest, baseVenue, mockNotificationPort);

    expect(mockPrisma.reservation.update).toHaveBeenCalledWith({
      where: { id: "res_001" },
      data: { emailStatus: "SENT" },
    });
  });

  it("sets emailStatus=FAILED on send error and does not throw", async () => {
    (mockNotificationPort.sendPostVisitThankYou as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("SMTP timeout")
    );
    mockPrisma.reservation.update.mockResolvedValue({});

    await expect(
      sendPostVisitEmail(baseReservation, baseGuest, baseVenue, mockNotificationPort)
    ).resolves.toBeUndefined();

    expect(mockPrisma.reservation.update).toHaveBeenCalledWith({
      where: { id: "res_001" },
      data: { emailStatus: "FAILED" },
    });
  });

  it("skips when reservation has no guest email", async () => {
    const reservation = { ...baseReservation, guestEmail: null };

    await sendPostVisitEmail(reservation, baseGuest, baseVenue, mockNotificationPort);

    expect(mockNotificationPort.sendPostVisitThankYou).not.toHaveBeenCalled();
  });
});
