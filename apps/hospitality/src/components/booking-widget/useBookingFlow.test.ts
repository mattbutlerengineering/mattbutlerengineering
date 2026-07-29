import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type {
  TimeSlot,
  ReservationHold,
  Reservation,
  DepositConfig,
  PublicVenueConfig,
} from "@mbe/types";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import { useBookingFlow, deriveStepKeys } from "./useBookingFlow.js";

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

const guestDetails = { name: "John Doe", email: "john@example.com", phone: "", notes: "" };

/** A venue's public config with no deposit ever configured — the harmless default. */
function makePublicVenueConfig(overrides?: Partial<PublicVenueConfig>): PublicVenueConfig {
  return {
    name: "The Oak Table",
    slug: "the-oak-table",
    ianaTimezone: "America/New_York",
    currencyCode: "USD",
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

/** A fake public api client — the injected seam. Defaults resolve harmlessly; override per test. */
function makeFakeApi() {
  return {
    availability: {
      getTimeSlots: vi.fn().mockResolvedValue([]),
    },
    holds: {
      create: vi.fn().mockResolvedValue({ hold: mockHold, sessionId: "s1" }),
      confirm: vi.fn().mockResolvedValue(mockReservation),
      release: vi.fn().mockResolvedValue(undefined),
    },
    venues: {
      getPublicConfig: vi.fn().mockResolvedValue(makePublicVenueConfig()),
    },
    publicVenue: {
      guestRisk: vi
        .fn()
        .mockResolvedValue({ riskScore: "trusted", noShowCount: 0, requiresDeposit: false }),
    },
  };
}

type FakeApi = ReturnType<typeof makeFakeApi>;

interface RenderBookingFlowOptions {
  venueId?: string;
  venueSlug?: string;
  stripePublishableKey?: string;
}

function renderBookingFlow(fakeApi: FakeApi, options: RenderBookingFlowOptions = {}) {
  const { venueId = "v1", venueSlug, stripePublishableKey } = options;
  return renderHook(() =>
    useBookingFlow({
      api: fakeApi as unknown as BookingWidgetApiClient,
      venueId,
      venueSlug,
      stripePublishableKey,
    })
  );
}

describe("useBookingFlow", () => {
  describe("initial state", () => {
    it("starts on date-party step", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      expect(result.current.state).toBe("date-party");
    });

    it("has empty initial data", () => {
      const { result } = renderBookingFlow(makeFakeApi());
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
      const { result } = renderBookingFlow(makeFakeApi());
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
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      expect(result.current.data.selectedDate).toBe("2026-05-20");
    });

    it("updates selectedEndDate", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setSelectedEndDate("2026-05-22"));
      expect(result.current.data.selectedEndDate).toBe("2026-05-22");
    });

    it("updates partySize", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setPartySize(4));
      expect(result.current.data.partySize).toBe(4);
    });
  });

  describe("transition: date-party -> time-slot (slot fetch owned by the hook)", () => {
    it("goToTimeSlot transitions step and fetches slots via the injected api client", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.availability.getTimeSlots.mockResolvedValue([mockSlot, mockSlot2]);
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot());

      expect(result.current.state).toBe("time-slot");
      expect(fakeApi.availability.getTimeSlots).toHaveBeenCalledWith({
        venueId: "v1",
        date: "2026-05-20",
        partySize: 2,
      });
      expect(result.current.data.slots).toEqual([mockSlot, mockSlot2]);
      expect(result.current.data.slotsLoading).toBe(false);
    });

    it("goToTimeSlot sets slotsLoading true while the fetch is pending", () => {
      const fakeApi = makeFakeApi();
      fakeApi.availability.getTimeSlots.mockReturnValue(new Promise<TimeSlot[]>(() => {}));
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.goToTimeSlot());

      expect(result.current.data.slotsLoading).toBe(true);
    });

    it("goToTimeSlot filters out unavailable slots", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.availability.getTimeSlots.mockResolvedValue([
        mockSlot,
        { time: "2026-05-20T20:00:00", available: false },
      ]);
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot());

      expect(result.current.data.slots).toEqual([mockSlot]);
    });

    it("goToTimeSlot sets slotsError when the fetch rejects", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.availability.getTimeSlots.mockRejectedValue(new Error("API Down"));
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot());

      expect(result.current.data.slotsError).toBe("API Down");
      expect(result.current.data.slotsLoading).toBe(false);
    });

    it("goToTimeSlot clears selectedSlot", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.setSlots([mockSlot]));
      await act(async () => result.current.actions.goToTimeSlot());
      expect(result.current.data.selectedSlot).toBeNull();
    });
  });

  describe("slot list management", () => {
    it("setSlots updates slots list", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setSlots([mockSlot, mockSlot2]));
      expect(result.current.data.slots).toEqual([mockSlot, mockSlot2]);
      expect(result.current.data.slotsLoading).toBe(false);
      expect(result.current.data.slotsError).toBeNull();
    });

    it("setSlotsError sets error and clears loading", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setSlotsError("Failed to load"));
      expect(result.current.data.slotsError).toBe("Failed to load");
      expect(result.current.data.slotsLoading).toBe(false);
    });
  });

  describe("transition: time-slot -> guest-details (Hold create owned by the hook)", () => {
    it("selectSlotAndHold sets holdLoading true while the create is pending", () => {
      const fakeApi = makeFakeApi();
      fakeApi.holds.create.mockReturnValue(new Promise(() => {}));
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      void act(() => {
        result.current.actions.selectSlotAndHold(mockSlot);
      });
      expect(result.current.data.holdLoading).toBe(true);
    });

    it("selectSlotAndHold resolves: creates the hold via the api client, transitions to guest-details", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });

      expect(fakeApi.holds.create).toHaveBeenCalledWith({
        venueId: "v1",
        date: "2026-05-20",
        time: mockSlot.time,
        partySize: 2,
        holdDurationMinutes: 10,
      });
      expect(result.current.data.hold).toEqual(mockHold);
      expect(result.current.data.selectedSlot).toEqual(mockSlot);
      expect(result.current.state).toBe("guest-details");
      expect(result.current.data.holdLoading).toBe(false);
      expect(result.current.data.holdError).toBeNull();
    });

    it("selectSlotAndHold rejects: sets holdError, stays on time-slot", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.holds.create.mockRejectedValue(new Error("Slot taken"));
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot());
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });

      expect(result.current.data.holdError).toBe("Slot taken");
      expect(result.current.state).toBe("time-slot");
      expect(result.current.data.holdLoading).toBe(false);
    });
  });

  describe("transition: guest-details -> confirmation (Hold confirm owned by the hook)", () => {
    it("confirmReservation sets confirmLoading true while pending", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.holds.confirm.mockReturnValue(new Promise(() => {}));
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      void act(() => {
        result.current.actions.confirmReservation(guestDetails);
      });
      expect(result.current.data.confirmLoading).toBe(true);
    });

    it("confirmReservation resolves without deposit: confirms the hold via the api client, goes to confirmation", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });

      expect(fakeApi.holds.confirm).toHaveBeenCalledWith(mockHold.id, {
        guestName: guestDetails.name,
        guestEmail: guestDetails.email,
        guestPhone: undefined,
        notes: undefined,
      });
      expect(result.current.data.reservation).toEqual(mockReservation);
      expect(result.current.state).toBe("confirmation");
      expect(result.current.data.confirmLoading).toBe(false);
      expect(result.current.data.confirmError).toBeNull();
    });

    it("confirmReservation rejects: sets confirmError, stays on guest-details", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.holds.confirm.mockRejectedValue(new Error("Confirm failed"));
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });

      expect(result.current.data.confirmError).toBe("Confirm failed");
      expect(result.current.state).toBe("guest-details");
      expect(result.current.data.confirmLoading).toBe(false);
    });
  });

  describe("deposit-config fetch (owned by the hook)", () => {
    it("fetches and maps the venue's public config to DepositConfig when venueSlug is provided", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.venues.getPublicConfig.mockResolvedValue(
        makePublicVenueConfig({
          currencyCode: "USD",
          deposit: {
            enabled: true,
            depositType: "flat",
            amountCents: 5000,
            freeCancellationHours: 24,
            lateCancellationFeePercent: 50,
            noShowFeePercent: 100,
          },
        })
      );

      const { result } = renderBookingFlow(fakeApi, { venueSlug: "the-oak-table" });

      await waitFor(() => expect(result.current.data.depositConfig).not.toBeNull());

      expect(fakeApi.venues.getPublicConfig).toHaveBeenCalledWith("the-oak-table");
      expect(result.current.data.depositConfig).toEqual({
        enabled: true,
        depositType: "flat",
        amountCents: 5000,
        currency: "usd",
        freeCancellationHours: 24,
        lateCancellationFeePercent: 50,
        noShowFeePercent: 100,
      });
    });

    it("does not fetch deposit config when venueSlug is omitted", () => {
      const fakeApi = makeFakeApi();
      renderBookingFlow(fakeApi);
      expect(fakeApi.venues.getPublicConfig).not.toHaveBeenCalled();
    });

    it("leaves depositConfig null when the venue never configured a deposit", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.venues.getPublicConfig.mockResolvedValue(makePublicVenueConfig());

      const { result } = renderBookingFlow(fakeApi, { venueSlug: "the-oak-table" });

      await waitFor(() => expect(fakeApi.venues.getPublicConfig).toHaveBeenCalled());
      expect(result.current.data.depositConfig).toBeNull();
    });
  });

  describe("deposit branch (venue's general policy — no risk check needed when already enabled)", () => {
    it("confirmReservation with a deposit config goes to payment step", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi, {
        venueSlug: "the-oak-table",
        stripePublishableKey: "pk_test_abc",
      });
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });

      expect(fakeApi.publicVenue.guestRisk).not.toHaveBeenCalled();
      expect(result.current.state).toBe("payment");
      expect(result.current.data.reservation).toEqual(mockReservation);
    });

    it("handleDepositSuccess sets paymentIntentId and goes to confirmation", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi, {
        venueSlug: "the-oak-table",
        stripePublishableKey: "pk_test_abc",
      });
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });
      act(() => result.current.actions.handleDepositSuccess("pi_test_123"));

      expect(result.current.data.depositPaymentIntentId).toBe("pi_test_123");
      expect(result.current.state).toBe("confirmation");
    });

    it("goBackToGuestDetails from payment goes to guest-details", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi, {
        venueSlug: "the-oak-table",
        stripePublishableKey: "pk_test_abc",
      });
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });
      act(() => result.current.actions.goBackToGuestDetails());

      expect(result.current.state).toBe("guest-details");
    });
  });

  describe("confirmReservation guest-risk gate (owned by the hook)", () => {
    it("risky guest overrides a disabled venue deposit policy: stepKeys resolves to include payment", async () => {
      // The venue's general deposit policy is disabled (enabled: false), but
      // the guest is flagged risky by the injected api client's guest-risk
      // endpoint at confirm time — effectiveDepositPolicy overrides the
      // disabled policy and the reducer keys off the non-null result, not
      // the config's own `enabled` flag.
      const fakeApi = makeFakeApi();
      fakeApi.publicVenue.guestRisk.mockResolvedValue({
        riskScore: "risky",
        noShowCount: 3,
        requiresDeposit: true,
      });
      const disabledPolicyConfig: DepositConfig = { ...mockDepositConfig, enabled: false };

      const { result } = renderBookingFlow(fakeApi, {
        venueSlug: "the-oak-table",
        stripePublishableKey: "pk_test_abc",
      });
      act(() => result.current.actions.setDepositConfig(disabledPolicyConfig));
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });

      expect(fakeApi.publicVenue.guestRisk).toHaveBeenCalledWith("the-oak-table", {
        email: guestDetails.email,
      });
      expect(result.current.state).toBe("payment");
      expect(result.current.stepKeys).toContain("payment");
      const index = result.current.currentStepIndex;
      expect(index).toBeGreaterThanOrEqual(0);
      expect(result.current.stepKeys[index]).toBe("payment");
    });

    it("non-risky guest at a venue with a disabled deposit policy: stepKeys stays deposit-free", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.publicVenue.guestRisk.mockResolvedValue({
        riskScore: "trusted",
        noShowCount: 0,
        requiresDeposit: false,
      });
      const disabledPolicyConfig: DepositConfig = { ...mockDepositConfig, enabled: false };

      const { result } = renderBookingFlow(fakeApi, {
        venueSlug: "the-oak-table",
        stripePublishableKey: "pk_test_abc",
      });
      act(() => result.current.actions.setDepositConfig(disabledPolicyConfig));
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });

      expect(fakeApi.publicVenue.guestRisk).toHaveBeenCalled();
      expect(result.current.state).toBe("confirmation");
      expect(result.current.stepKeys).not.toContain("payment");
    });

    it("never checks guest risk when Stripe is not configured, even at a venue with a deposit policy", async () => {
      const fakeApi = makeFakeApi();
      const disabledPolicyConfig: DepositConfig = { ...mockDepositConfig, enabled: false };

      // venueSlug is set but stripePublishableKey is omitted — Stripe isn't
      // configured for this venue, so the risk lookup must never fire
      // (matches effectiveDepositPolicy/guestRiskMatters' own gating).
      const { result } = renderBookingFlow(fakeApi, { venueSlug: "the-oak-table" });
      act(() => result.current.actions.setDepositConfig(disabledPolicyConfig));
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });

      expect(fakeApi.publicVenue.guestRisk).not.toHaveBeenCalled();
      expect(result.current.state).toBe("confirmation");
      expect(result.current.stepKeys).not.toContain("payment");
    });
  });

  describe("step-set derivation (single source of truth)", () => {
    it("stepKeys excludes payment and currentStepIndex is valid before any deposit is resolved", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      expect(result.current.stepKeys).not.toContain("payment");
      expect(result.current.currentStepIndex).toBe(result.current.stepKeys.indexOf("date-party"));
    });

    it("confirmReservation with a deposit config resolves stepKeys to include payment with a valid index", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi, {
        venueSlug: "the-oak-table",
        stripePublishableKey: "pk_test_abc",
      });
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });
      expect(result.current.state).toBe("payment");
      expect(result.current.stepKeys).toContain("payment");
      expect(result.current.currentStepIndex).toBe(result.current.stepKeys.indexOf("payment"));
      expect(result.current.currentStepIndex).toBeGreaterThanOrEqual(0);
    });

    it("confirmReservation without a deposit keeps stepKeys deposit-free", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });
      expect(result.current.state).toBe("confirmation");
      expect(result.current.stepKeys).not.toContain("payment");
      // "confirmation" itself isn't a step-indicator entry (the widget hides
      // the indicator on that screen) — -1 here is expected, not a bug.
      expect(result.current.currentStepIndex).toBe(-1);
    });
  });

  describe("backward navigation and Hold release (owned by the hook)", () => {
    it("goToDateParty from time-slot clears slot and slots", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.setSlots([mockSlot]));
      act(() => result.current.actions.goToDateParty());
      expect(result.current.state).toBe("date-party");
      expect(result.current.data.selectedSlot).toBeNull();
      expect(result.current.data.slots).toEqual([]);
    });

    it("goToDateParty releases the hold via the api client when a hold exists", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      act(() => result.current.actions.goToDateParty());
      expect(fakeApi.holds.release).toHaveBeenCalledWith("hold-1");
      expect(result.current.data.hold).toBeNull();
    });

    it("goToTimeSlot from guest-details releases the hold via the api client", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.goToTimeSlot();
      });
      expect(fakeApi.holds.release).toHaveBeenCalledWith("hold-1");
      expect(result.current.state).toBe("time-slot");
    });
  });

  describe("hold-expiry timer (owned by the hook, not the component)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("expires the hold and reloads availability via the api client once the timer passes expiresAt", async () => {
      const fakeApi = makeFakeApi();
      const soonToExpireHold: ReservationHold = {
        ...mockHold,
        expiresAt: new Date(Date.now() + 5_000).toISOString(),
      };
      fakeApi.holds.create.mockResolvedValue({ hold: soonToExpireHold, sessionId: "s1" });
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      expect(result.current.data.hold).toEqual(soonToExpireHold);

      fakeApi.availability.getTimeSlots.mockResolvedValue([mockSlot2]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });

      expect(result.current.data.hold).toBeNull();
      expect(result.current.state).toBe("time-slot");
      expect(result.current.data.holdError).toBe(
        "Your hold has expired. Please select a new time."
      );
      expect(result.current.data.slots).toEqual([mockSlot2]);
    });

    it("does not run the expiry timer when no hold is held", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(fakeApi.availability.getTimeSlots).not.toHaveBeenCalled();
      expect(result.current.state).toBe("date-party");
    });
  });

  describe("headless orchestration: slots -> Hold -> confirm through the hook (no component render)", () => {
    it("drives the full guest flow via a fake api client injected as a dependency", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.availability.getTimeSlots.mockResolvedValue([mockSlot]);
      const { result } = renderBookingFlow(fakeApi, { venueId: "venue-headless" });

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot());
      expect(result.current.state).toBe("time-slot");
      expect(result.current.data.slots).toEqual([mockSlot]);

      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      expect(result.current.state).toBe("guest-details");
      expect(result.current.data.hold).toEqual(mockHold);

      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
      });
      expect(result.current.state).toBe("confirmation");
      expect(result.current.data.reservation).toEqual(mockReservation);
    });

    it("Waitlist branch: no slot available routes to waitlist-join, still driven headlessly", async () => {
      const fakeApi = makeFakeApi();
      fakeApi.availability.getTimeSlots.mockResolvedValue([]);
      const { result } = renderBookingFlow(fakeApi);

      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      await act(async () => result.current.actions.goToTimeSlot());
      expect(result.current.data.slots).toEqual([]);

      act(() => result.current.actions.goToWaitlistJoin());
      expect(result.current.state).toBe("waitlist-join");

      act(() =>
        result.current.actions.handleWaitlistJoined({ position: 3, estimatedWaitMinutes: 20 })
      );
      expect(result.current.state).toBe("waitlist-confirmation");
      expect(result.current.data.waitlistResult).toEqual({
        position: 3,
        estimatedWaitMinutes: 20,
      });
    });
  });

  describe("new booking reset", () => {
    it("resetFlow resets all state to initial", async () => {
      const fakeApi = makeFakeApi();
      const { result } = renderBookingFlow(fakeApi);
      act(() => result.current.actions.setSelectedDate("2026-05-20"));
      act(() => result.current.actions.setPartySize(4));
      await act(async () => {
        await result.current.actions.selectSlotAndHold(mockSlot);
      });
      await act(async () => {
        await result.current.actions.confirmReservation(guestDetails);
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

  describe("deriveStepKeys (pure, testable without full render)", () => {
    it("excludes payment when no deposit is required", () => {
      expect(deriveStepKeys(false)).not.toContain("payment");
    });

    it("includes payment when a deposit is required", () => {
      expect(deriveStepKeys(true)).toContain("payment");
    });
  });

  describe("depositConfig management", () => {
    it("setDepositConfig stores deposit config", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));
      expect(result.current.data.depositConfig).toEqual(mockDepositConfig);
    });

    it("setDepositConfig can be cleared with null", () => {
      const { result } = renderBookingFlow(makeFakeApi());
      act(() => result.current.actions.setDepositConfig(mockDepositConfig));
      act(() => result.current.actions.setDepositConfig(null));
      expect(result.current.data.depositConfig).toBeNull();
    });
  });
});
