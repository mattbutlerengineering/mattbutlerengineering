import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TimeSlot, ReservationHold, Reservation, DepositConfig } from "@mbe/types";
import { useBookingFlow } from "./useBookingFlow.js";

const mockSlot: TimeSlot = { time: "2026-05-20T18:00:00", available: true };
const mockSlot2: TimeSlot = { time: "2026-05-20T19:00:00", available: true };

const mockHold: ReservationHold = {
  id: "hold-1",
  venueId: "v1",
  tableId: "t1",
  date: "2026-05-20",
  startTime: "2026-05-20T18:00:00",
  endTime: "2026-05-20T20:00:00",
  partySize: 2,
  sessionId: "s1",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  createdAt: new Date().toISOString(),
};

const mockReservation: Reservation = {
  id: "res-123",
  date: "2026-05-20",
  startTime: "18:00",
  endTime: "20:00",
  partySize: 2,
  status: "CONFIRMED",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestName: "John Doe",
  guestEmail: "john@example.com",
  guestPhone: null,
  guestId: null,
  userId: null,
  occasion: null,
  seatingPreference: null,
  tableId: "t1",
  venueId: "v1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockDepositConfig: DepositConfig = {
  enabled: true,
  depositType: "flat",
  amountCents: 2500,
  currency: "usd",
  freeCancellationHours: 24,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
};

describe("useBookingFlow", () => {
  describe("initial state", () => {
    it("starts on date-party step", () => {
      const { result } = renderHook(() => useBookingFlow());
      expect(result.current.state).toBe("date-party");
    });

    it("has empty initial data", () => {
      const { result } = renderHook(() => useBookingFlow());
      const { data } = result.current;
      expect(data.selectedDate).toBeNull();
      expect(data.selectedEndDate).toBeNull();
      expect(data.partySize).toBe(2);
      expect(data.slots).toEqual([]);
      expect(data.selectedSlot).toBeNull();
      expect(data.hold).toBeNull();
      expect(data.reservation).toBeNull();
      expect(data.depositConfig).toBeNull();
      expect(data.depositPaymentIntentId).toBeNull();
    });

    it("has no loading or error state initially", () => {
      const { result } = renderHook(() => useBookingFlow());
      const { data } = result.current;
      expect(data.slotsLoading).toBe(false);
      expect(data.slotsError).toBeNull();
      expect(data.holdLoading).toBe(false);
      expect(data.holdError).toBeNull();
      expect(data.confirmLoading).toBe(false);
      expect(data.confirmError).toBeNull();
    });
  });

  describe("date and party selection", () => {
    it("updates selectedDate", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      expect(result.current.data.selectedDate).toBe("2026-05-20");
    });

    it("updates selectedEndDate", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedEndDate("2026-05-22"));
      expect(result.current.data.selectedEndDate).toBe("2026-05-22");
    });

    it("updates partySize", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setPartySize(4));
      expect(result.current.data.partySize).toBe(4);
    });
  });

  describe("transition: date-party -> time-slot", () => {
    it("goToTimeSlot transitions step when date is set", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.goToTimeSlot());
      expect(result.current.state).toBe("time-slot");
    });

    it("goToTimeSlot sets slotsLoading true then resolves slots", async () => {
      const { result } = renderHook(() => useBookingFlow());
      // Never-resolving fetch — captures the loading state
      const fetchSlots = vi.fn().mockReturnValue(new Promise<TimeSlot[]>(() => {}));
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.goToTimeSlot(fetchSlots));
      expect(result.current.data.slotsLoading).toBe(true);
    });

    it("goToTimeSlot with resolved fetch populates slots", async () => {
      const { result } = renderHook(() => useBookingFlow());
      const fetchSlots = vi.fn().mockResolvedValue([mockSlot]);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot(fetchSlots));
      expect(result.current.data.slots).toEqual([mockSlot]);
      expect(result.current.data.slotsLoading).toBe(false);
    });

    it("goToTimeSlot clears selectedSlot", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.setSlots([mockSlot]));
      act(() => result.current.actions.goToTimeSlot());
      expect(result.current.data.selectedSlot).toBeNull();
    });
  });

  describe("slot list management", () => {
    it("setSlots updates slots list", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSlots([mockSlot, mockSlot2]));
      expect(result.current.data.slots).toEqual([mockSlot, mockSlot2]);
      expect(result.current.data.slotsLoading).toBe(false);
      expect(result.current.data.slotsError).toBeNull();
    });

    it("setSlotsError sets error and clears loading", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSlotsError("Failed to load"));
      expect(result.current.data.slotsError).toBe("Failed to load");
      expect(result.current.data.slotsLoading).toBe(false);
    });
  });

  describe("transition: time-slot -> guest-details (hold)", () => {
    it("createHold sets holdLoading true while hold is pending", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.goToTimeSlot());
      // Never-resolving promise — HOLD_START dispatched, HOLD_SUCCESS never dispatched
      const holdPromise = new Promise<ReservationHold>(() => {});
      // Do not await — we want to catch the intermediate loading state
      void act(() => {
        result.current.actions.selectSlotAndHold(mockSlot, holdPromise);
      });
      expect(result.current.data.holdLoading).toBe(true);
    });

    it("selectSlotAndHold resolves: sets hold, slot, transitions to guest-details", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.goToTimeSlot());
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      expect(result.current.data.hold).toEqual(mockHold);
      expect(result.current.data.selectedSlot).toEqual(mockSlot);
      expect(result.current.state).toBe("guest-details");
      expect(result.current.data.holdLoading).toBe(false);
      expect(result.current.data.holdError).toBeNull();
    });

    it("selectSlotAndHold rejects: sets holdError, stays on time-slot", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.goToTimeSlot());
      await act(async () => {
        await result.current.actions.selectSlotAndHold(
          mockSlot,
          Promise.reject(new Error("Slot taken"))
        );
      });
      expect(result.current.data.holdError).toBe("Slot taken");
      expect(result.current.state).toBe("time-slot");
      expect(result.current.data.holdLoading).toBe(false);
    });
  });

  describe("transition: guest-details -> confirmation (no deposit)", () => {
    it("confirmReservation sets confirmLoading true while pending", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      const neverResolve = new Promise<Reservation>(() => {});
      // Do not await — we want to catch the intermediate loading state
      void act(() => {
        result.current.actions.confirmReservation(neverResolve, null);
      });
      expect(result.current.data.confirmLoading).toBe(true);
    });

    it("confirmReservation resolves without deposit: goes to confirmation", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      await act(async () => {
        await result.current.actions.confirmReservation(Promise.resolve(mockReservation), null);
      });
      expect(result.current.data.reservation).toEqual(mockReservation);
      expect(result.current.state).toBe("confirmation");
      expect(result.current.data.confirmLoading).toBe(false);
      expect(result.current.data.confirmError).toBeNull();
    });

    it("confirmReservation rejects: sets confirmError, stays on guest-details", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      await act(async () => {
        await result.current.actions.confirmReservation(
          Promise.reject(new Error("Confirm failed")),
          null
        );
      });
      expect(result.current.data.confirmError).toBe("Confirm failed");
      expect(result.current.state).toBe("guest-details");
      expect(result.current.data.confirmLoading).toBe(false);
    });
  });

  describe("deposit branch", () => {
    it("confirmReservation with deposit config goes to payment step", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      await act(async () => {
        await result.current.actions.confirmReservation(
          Promise.resolve(mockReservation),
          mockDepositConfig
        );
      });
      expect(result.current.state).toBe("payment");
      expect(result.current.data.reservation).toEqual(mockReservation);
    });

    it("handleDepositSuccess sets paymentIntentId and goes to confirmation", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      await act(async () => {
        await result.current.actions.confirmReservation(
          Promise.resolve(mockReservation),
          mockDepositConfig
        );
      });
      act(() => result.current.actions.handleDepositSuccess("pi_test_123"));
      expect(result.current.data.depositPaymentIntentId).toBe("pi_test_123");
      expect(result.current.state).toBe("confirmation");
    });

    it("goBackToGuestDetails from payment goes to guest-details", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      await act(async () => {
        await result.current.actions.confirmReservation(
          Promise.resolve(mockReservation),
          mockDepositConfig
        );
      });
      act(() => result.current.actions.goBackToGuestDetails());
      expect(result.current.state).toBe("guest-details");
    });
  });

  describe("backward navigation and hold release", () => {
    it("goToDateParty from time-slot clears slot and slots", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.setSlots([mockSlot]));
      const releaseHold = vi.fn().mockResolvedValue(undefined);
      act(() => result.current.actions.goToDateParty(releaseHold));
      expect(result.current.state).toBe("date-party");
      expect(result.current.data.selectedSlot).toBeNull();
      expect(result.current.data.slots).toEqual([]);
    });

    it("goToDateParty calls releaseHold when hold exists", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      const releaseHold = vi.fn().mockResolvedValue(undefined);
      act(() => result.current.actions.goToDateParty(releaseHold));
      expect(releaseHold).toHaveBeenCalledWith("hold-1");
      expect(result.current.data.hold).toBeNull();
    });

    it("goToTimeSlot from guest-details releases hold", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      const releaseHold = vi.fn().mockResolvedValue(undefined);
      act(() => result.current.actions.goToTimeSlot(undefined, releaseHold));
      expect(releaseHold).toHaveBeenCalledWith("hold-1");
      expect(result.current.state).toBe("time-slot");
    });
  });

  describe("hold expiry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("expireHold clears hold and goes to time-slot with error", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      act(() => result.current.actions.expireHold());
      expect(result.current.data.hold).toBeNull();
      expect(result.current.state).toBe("time-slot");
      expect(result.current.data.holdError).toBe(
        "Your hold has expired. Please select a new time."
      );
    });
  });

  describe("new booking reset", () => {
    it("resetFlow resets all state to initial", async () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.setPartySize(4));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot, Promise.resolve(mockHold));
      });
      await act(async () => {
        await result.current.actions.confirmReservation(Promise.resolve(mockReservation), null);
      });
      act(() => result.current.actions.resetFlow());
      expect(result.current.state).toBe("date-party");
      expect(result.current.data.selectedDate).toBeNull();
      expect(result.current.data.selectedEndDate).toBeNull();
      expect(result.current.data.partySize).toBe(2);
      expect(result.current.data.slots).toEqual([]);
      expect(result.current.data.selectedSlot).toBeNull();
      expect(result.current.data.hold).toBeNull();
      expect(result.current.data.reservation).toBeNull();
      expect(result.current.data.slotsError).toBeNull();
      expect(result.current.data.holdError).toBeNull();
      expect(result.current.data.confirmError).toBeNull();
      expect(result.current.data.depositPaymentIntentId).toBeNull();
    });
  });

  describe("depositConfig management", () => {
    it("setDepositConfig stores deposit config", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));
      expect(result.current.data.depositConfig).toEqual(mockDepositConfig);
    });

    it("setDepositConfig can be cleared with null", () => {
      const { result } = renderHook(() => useBookingFlow());
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));
      act(() => result.current.actions.setDepositConfig(null));
      expect(result.current.data.depositConfig).toBeNull();
    });
  });
});
