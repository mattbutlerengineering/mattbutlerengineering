import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Reservation } from "@mbe/types";
import { OfflineBanner } from "./components/OfflineBanner.js";
import { ReservationList } from "./components/dashboard/ReservationList.js";
import { ReservationBlock } from "./components/timeline/ReservationBlock.js";
import { formatReservationTime } from "./utils/reservation-display.js";

const venueState = vi.hoisted(() => ({
  venue: null as { ianaTimezone: string; currencyCode: string } | null,
}));

vi.mock("./contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => (venueState.venue ? { selectedVenue: venueState.venue } : null),
}));

const TOKYO = { ianaTimezone: "Asia/Tokyo", currencyCode: "JPY" } as const;
const INSTANT = "2026-05-14T18:00:00.000Z"; // 3:00 AM next day in Tokyo

function makeReservation(): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime: INSTANT,
    endTime: "2026-05-14T20:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table-1",
    venueId: null,
    createdAt: INSTANT,
    updatedAt: INSTANT,
  };
}

describe("staff time uses the venue timezone, not the device's", () => {
  beforeEach(() => {
    venueState.venue = TOKYO;
  });

  it("ReservationBlock", () => {
    render(<ReservationBlock reservation={makeReservation()} style={{ left: 0, width: 100 }} />);
    expect(screen.getByText(/3:00 AM/)).toBeDefined();
  });

  it("ReservationList", () => {
    render(<ReservationList reservations={[makeReservation()]} isLoading={false} />);
    expect(screen.getByText("3:00 AM")).toBeDefined();
  });

  it("OfflineBanner", () => {
    render(<OfflineBanner lastSyncedAt={Date.parse(INSTANT)} />);
    expect(screen.getByText(/last synced 3:00 AM/)).toBeDefined();
  });
});

describe("en-US output is unchanged without a venue (device zone)", () => {
  beforeEach(() => {
    venueState.venue = null;
  });

  const legacyTime = () =>
    new Date(INSTANT).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  it("ReservationList matches the legacy toLocaleTimeString output", () => {
    render(<ReservationList reservations={[makeReservation()]} isLoading={false} />);
    expect(screen.getByText(legacyTime())).toBeDefined();
  });

  it("OfflineBanner matches the legacy output", () => {
    render(<OfflineBanner lastSyncedAt={Date.parse(INSTANT)} />);
    expect(screen.getByText(new RegExp(`last synced ${legacyTime()}`))).toBeDefined();
  });

  it("formatReservationTime keeps the 2-digit hour shape", () => {
    const legacy = new Date(INSTANT).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(formatReservationTime(INSTANT, "en-US")).toBe(legacy);
  });
});
