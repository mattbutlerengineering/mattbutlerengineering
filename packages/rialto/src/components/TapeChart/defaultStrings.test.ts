import { describe, it, expect } from "vitest";
import { DEFAULT_STRINGS, mergeStrings } from "./defaultStrings";
import type { TapeChartReservation, TapeChartFormattedParts } from "./types";

const baseReservation: TapeChartReservation = {
  id: "r1",
  roomId: "room1",
  start: "2025-01-10",
  end: "2025-01-12",
  status: "confirmed",
  guestName: "Ada Lovelace",
};

const baseFmt: TapeChartFormattedParts = {
  startLong: "January 10, 2025",
  endLong: "January 12, 2025",
  nights: 2,
  statusLabel: "Confirmed",
  roomName: "Room 101",
};

describe("DEFAULT_STRINGS", () => {
  describe("nightsLabel", () => {
    it("returns singular for 1 night", () => {
      expect(DEFAULT_STRINGS.nightsLabel(1)).toBe("1 night");
    });

    it("returns plural for 0 nights", () => {
      expect(DEFAULT_STRINGS.nightsLabel(0)).toBe("0 nights");
    });

    it("returns plural for 2+ nights", () => {
      expect(DEFAULT_STRINGS.nightsLabel(3)).toBe("3 nights");
    });
  });

  describe("partySizeLabel", () => {
    it("returns singular for 1 guest", () => {
      expect(DEFAULT_STRINGS.partySizeLabel(1)).toBe("1 guest");
    });

    it("returns plural for 0 guests", () => {
      expect(DEFAULT_STRINGS.partySizeLabel(0)).toBe("0 guests");
    });

    it("returns plural for 2+ guests", () => {
      expect(DEFAULT_STRINGS.partySizeLabel(4)).toBe("4 guests");
    });
  });

  describe("statusLabels", () => {
    it("has a label for every TapeChartStatus value", () => {
      const statuses = [
        "tentative",
        "confirmed",
        "checkedIn",
        "checkedOut",
        "cancelled",
        "noShow",
      ] as const;
      for (const s of statuses) {
        expect(DEFAULT_STRINGS.statusLabels[s]).toBeTruthy();
      }
    });
  });

  describe("roomStatusLabels", () => {
    it("has a label for every TapeChartRoomStatus value", () => {
      const roomStatuses = ["ready", "dirty", "outOfOrder", "occupied"] as const;
      for (const s of roomStatuses) {
        expect(DEFAULT_STRINGS.roomStatusLabels[s]).toBeTruthy();
      }
    });
  });

  describe("reservationAriaTemplate", () => {
    it("includes guest name, room, dates, nights, and status", () => {
      const result = DEFAULT_STRINGS.reservationAriaTemplate(baseReservation, baseFmt);
      expect(result).toContain("Ada Lovelace");
      expect(result).toContain("Room 101");
      expect(result).toContain("January 10, 2025");
      expect(result).toContain("January 12, 2025");
      expect(result).toContain("2 nights");
      expect(result).toContain("Confirmed");
    });

    it("falls back to 'Reservation' when guestName is absent", () => {
      const noName = { ...baseReservation, guestName: undefined };
      const result = DEFAULT_STRINGS.reservationAriaTemplate(noName, baseFmt);
      expect(result).toContain("Reservation");
    });

    it("includes partySize when provided in fmt", () => {
      const fmt = { ...baseFmt, partySize: "2 guests" };
      const result = DEFAULT_STRINGS.reservationAriaTemplate(baseReservation, fmt);
      expect(result).toContain("2 guests");
    });

    it("includes source when provided in reservation", () => {
      const r = { ...baseReservation, source: "Booking.com" };
      const result = DEFAULT_STRINGS.reservationAriaTemplate(r, baseFmt);
      expect(result).toContain("via Booking.com");
    });

    it("includes priceTotal when provided in fmt", () => {
      const fmt = { ...baseFmt, priceTotal: "$400.00" };
      const result = DEFAULT_STRINGS.reservationAriaTemplate(baseReservation, fmt);
      expect(result).toContain("$400.00");
    });

    it("includes blockedReason when provided", () => {
      const r = { ...baseReservation, blockedReason: "Maintenance" };
      const result = DEFAULT_STRINGS.reservationAriaTemplate(r, baseFmt);
      expect(result).toContain("reason: Maintenance");
    });
  });
});

describe("mergeStrings", () => {
  it("returns DEFAULT_STRINGS when no overrides provided", () => {
    expect(mergeStrings()).toBe(DEFAULT_STRINGS);
    expect(mergeStrings(undefined)).toBe(DEFAULT_STRINGS);
  });

  it("merges top-level string overrides", () => {
    const merged = mergeStrings({ todayLabel: "Hoy" });
    expect(merged.todayLabel).toBe("Hoy");
    expect(merged.regionLabel).toBe(DEFAULT_STRINGS.regionLabel);
  });

  it("deep-merges statusLabels", () => {
    const merged = mergeStrings({ statusLabels: { tentative: "Maybe" } });
    expect(merged.statusLabels.tentative).toBe("Maybe");
    // Other status labels remain from defaults
    expect(merged.statusLabels.confirmed).toBe(DEFAULT_STRINGS.statusLabels.confirmed);
  });

  it("deep-merges roomStatusLabels", () => {
    const merged = mergeStrings({ roomStatusLabels: { dirty: "Needs cleaning" } });
    expect(merged.roomStatusLabels.dirty).toBe("Needs cleaning");
    expect(merged.roomStatusLabels.ready).toBe(DEFAULT_STRINGS.roomStatusLabels.ready);
  });

  it("uses custom nightsLabel when provided", () => {
    const nightsLabel = (n: number) => `${n}n`;
    const merged = mergeStrings({ nightsLabel });
    expect(merged.nightsLabel(2)).toBe("2n");
  });

  it("falls back to default nightsLabel when not overridden", () => {
    const merged = mergeStrings({ todayLabel: "Today" });
    expect(merged.nightsLabel(1)).toBe(DEFAULT_STRINGS.nightsLabel(1));
  });

  it("uses custom partySizeLabel when provided", () => {
    const partySizeLabel = (n: number) => `${n}p`;
    const merged = mergeStrings({ partySizeLabel });
    expect(merged.partySizeLabel(3)).toBe("3p");
  });

  it("uses custom reservationAriaTemplate when provided", () => {
    const template = () => "custom aria";
    const merged = mergeStrings({ reservationAriaTemplate: template });
    expect(merged.reservationAriaTemplate(baseReservation, baseFmt)).toBe("custom aria");
  });
});
