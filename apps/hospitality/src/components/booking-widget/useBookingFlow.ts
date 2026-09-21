import { useReducer, useCallback, useEffect, useRef } from "react";
import type {
  TimeSlot,
  ReservationHold,
  Reservation,
  DepositConfig,
  PublicVenueConfig,
} from "@mbe/types";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import type { GuestDetails } from "./GuestDetailsForm.js";
import {
  provisionalDepositRequired,
  effectiveDepositPolicy,
  guestRiskMatters,
} from "./effectiveDepositPolicy.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { todayInTimezone } from "./todayInTimezone.js";

export type BookingStep =
  | "date-party"
  | "time-slot"
  | "guest-details"
  | "payment"
  | "confirmation"
  | "waitlist-join"
  | "waitlist-confirmation";

export interface WaitlistResult {
  position: number;
  estimatedWaitMinutes: number;
}

export interface BookingFlowData {
  selectedDate: string | null;
  selectedEndDate: string | null;
  partySize: number;
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  slotsLoading: boolean;
  slotsError: string | null;
  hold: ReservationHold | null;
  holdLoading: boolean;
  holdError: string | null;
  reservation: Reservation | null;
  /**
   * Self-service manage/cancel token returned alongside the confirmed
   * reservation — threaded through to ConfirmationView so guests get a
   * working "Cancel Reservation" link instead of a dead-end button (#4978).
   */
  manageToken: string | null;
  confirmLoading: boolean;
  confirmError: string | null;
  depositConfig: DepositConfig | null;
  /**
   * Whether a deposit is required for this flow. Before confirmation this is
   * a provisional guess derived from the venue's general policy alone (risk
   * is not yet known); `CONFIRM_SUCCESS_WITH_DEPOSIT` / `_NO_DEPOSIT`
   * overwrite it with the final, risk-aware outcome — the single source of
   * truth the step set and indicator derive from.
   */
  depositRequired: boolean;
  depositPaymentIntentId: string | null;
  waitlistResult: WaitlistResult | null;
  /**
   * The venue's full public config (name + ianaTimezone, among other fields),
   * fetched once alongside the deposit config when `venueSlug` is present.
   * Threaded down to `ConfirmationView` for the "Add to calendar" actions —
   * null until the fetch resolves, or if `venueSlug` was never provided.
   */
  venueConfig: PublicVenueConfig | null;
  /**
   * The guest details form's fields, lifted here (not owned by
   * `GuestDetailsForm`'s local state) so `EXPIRE_HOLD` doesn't wipe what the
   * guest already typed — the form unmounts when the step falls back to
   * "time-slot", but this survives and re-seeds the form once a new hold
   * succeeds.
   */
  guestDetails: GuestDetails;
}

interface BookingFlowState {
  step: BookingStep;
  data: BookingFlowData;
}

type BookingFlowAction =
  | { type: "SET_DATE"; date: string | null }
  | { type: "SET_END_DATE"; date: string | null }
  | { type: "SET_PARTY_SIZE"; size: number }
  | { type: "GO_TO_TIME_SLOT" }
  | { type: "GO_TO_DATE_PARTY" }
  | { type: "SET_SLOTS"; slots: TimeSlot[] }
  | { type: "SET_SLOTS_ERROR"; error: string }
  | { type: "HOLD_START"; slot: TimeSlot }
  | { type: "HOLD_SUCCESS"; hold: ReservationHold; slot: TimeSlot }
  | { type: "HOLD_ERROR"; error: string }
  | { type: "CONFIRM_START" }
  | { type: "CONFIRM_SUCCESS_NO_DEPOSIT"; reservation: Reservation; manageToken: string | null }
  | { type: "CONFIRM_SUCCESS_WITH_DEPOSIT"; reservation: Reservation; manageToken: string | null }
  | { type: "CONFIRM_ERROR"; error: string }
  | { type: "DEPOSIT_SUCCESS"; paymentIntentId: string }
  | { type: "GO_BACK_TO_GUEST_DETAILS" }
  | { type: "EXPIRE_HOLD" }
  | { type: "RESET"; selectedDate: string }
  | { type: "SET_DEPOSIT_CONFIG"; config: DepositConfig | null; depositRequired: boolean }
  | { type: "SET_VENUE_CONFIG"; config: PublicVenueConfig }
  | { type: "GO_TO_WAITLIST_JOIN" }
  | { type: "WAITLIST_JOINED"; result: WaitlistResult }
  | { type: "SET_GUEST_DETAILS"; details: GuestDetails };

const INITIAL_DATA: BookingFlowData = {
  selectedDate: null,
  selectedEndDate: null,
  partySize: 2,
  slots: [],
  selectedSlot: null,
  slotsLoading: false,
  slotsError: null,
  hold: null,
  holdLoading: false,
  holdError: null,
  reservation: null,
  manageToken: null,
  confirmLoading: false,
  confirmError: null,
  depositConfig: null,
  depositRequired: false,
  depositPaymentIntentId: null,
  waitlistResult: null,
  venueConfig: null,
  guestDetails: { name: "", email: "", phone: "", notes: "" },
};

/**
 * Builds the initial (or reset) flow state with `selectedDate` defaulted to
 * "today" in the venue's timezone (#4981) — the guest's first screen used to
 * show an empty date input and a disabled CTA with no explanation. Falls
 * back to `toDateString` (UTC-based) when `venueTimezone` isn't known yet;
 * see `todayInTimezone`.
 */
function createInitialState(venueTimezone?: string): BookingFlowState {
  return {
    step: "date-party",
    data: { ...INITIAL_DATA, selectedDate: todayInTimezone(new Date(), venueTimezone) },
  };
}

/**
 * Shown when the widget is embedded without a `venueSlug` (#4487). Holding
 * requires the slug-scoped public route, so there is nothing to fall back to —
 * the guest gets an honest dead end instead of a 401 from the staff route.
 */
export const MISSING_VENUE_SLUG_ERROR =
  "Online booking isn't available here. Please contact the venue directly to reserve.";

/** Step keys when no deposit is required — single source of truth for step-set derivation. */
export const STEP_KEYS_NO_DEPOSIT: BookingStep[] = ["date-party", "time-slot", "guest-details"];
/** Step keys when a deposit is required — appends the "payment" step. */
export const STEP_KEYS_WITH_DEPOSIT: BookingStep[] = [
  "date-party",
  "time-slot",
  "guest-details",
  "payment",
];

/**
 * Derives the step set from the deposit verdict alone — a plain function,
 * directly unit-testable without rendering the hook or a component.
 */
export function deriveStepKeys(depositRequired: boolean): BookingStep[] {
  return depositRequired ? STEP_KEYS_WITH_DEPOSIT : STEP_KEYS_NO_DEPOSIT;
}

function reducer(state: BookingFlowState, action: BookingFlowAction): BookingFlowState {
  switch (action.type) {
    case "SET_DATE":
      return { ...state, data: { ...state.data, selectedDate: action.date } };

    case "SET_END_DATE":
      return { ...state, data: { ...state.data, selectedEndDate: action.date } };

    case "SET_PARTY_SIZE":
      return { ...state, data: { ...state.data, partySize: action.size } };

    case "GO_TO_TIME_SLOT":
      return {
        step: "time-slot",
        data: {
          ...state.data,
          selectedSlot: null,
          hold: null,
          slotsLoading: true,
          slotsError: null,
          holdError: null,
        },
      };

    case "GO_TO_DATE_PARTY":
      return {
        step: "date-party",
        data: {
          ...state.data,
          selectedSlot: null,
          slots: [],
          hold: null,
        },
      };

    case "SET_SLOTS":
      return {
        ...state,
        data: { ...state.data, slots: action.slots, slotsLoading: false, slotsError: null },
      };

    case "SET_SLOTS_ERROR":
      return {
        ...state,
        data: { ...state.data, slotsError: action.error, slotsLoading: false },
      };

    case "HOLD_START":
      return {
        ...state,
        data: { ...state.data, holdLoading: true, holdError: null },
      };

    case "HOLD_SUCCESS":
      return {
        step: "guest-details",
        data: {
          ...state.data,
          hold: action.hold,
          selectedSlot: action.slot,
          holdLoading: false,
          holdError: null,
        },
      };

    case "HOLD_ERROR":
      return {
        ...state,
        data: { ...state.data, holdError: action.error, holdLoading: false },
      };

    case "CONFIRM_START":
      return {
        ...state,
        data: { ...state.data, confirmLoading: true, confirmError: null },
      };

    case "CONFIRM_SUCCESS_NO_DEPOSIT":
      return {
        step: "confirmation",
        data: {
          ...state.data,
          reservation: action.reservation,
          manageToken: action.manageToken,
          confirmLoading: false,
          confirmError: null,
          depositRequired: false,
        },
      };

    case "CONFIRM_SUCCESS_WITH_DEPOSIT":
      return {
        step: "payment",
        data: {
          ...state.data,
          reservation: action.reservation,
          manageToken: action.manageToken,
          confirmLoading: false,
          confirmError: null,
          depositRequired: true,
        },
      };

    case "CONFIRM_ERROR":
      return {
        ...state,
        data: { ...state.data, confirmError: action.error, confirmLoading: false },
      };

    case "DEPOSIT_SUCCESS":
      return {
        step: "confirmation",
        data: { ...state.data, depositPaymentIntentId: action.paymentIntentId },
      };

    case "GO_BACK_TO_GUEST_DETAILS":
      return { ...state, step: "guest-details" };

    case "EXPIRE_HOLD":
      return {
        step: "time-slot",
        data: {
          ...state.data,
          hold: null,
          holdError: "Your hold has expired. Please select a new time.",
          slotsLoading: true,
        },
      };

    case "RESET":
      return { step: "date-party", data: { ...INITIAL_DATA, selectedDate: action.selectedDate } };

    case "SET_DEPOSIT_CONFIG":
      // Provisional pre-confirm guess (risk isn't known yet); CONFIRM_SUCCESS_*
      // overwrites this with the final, risk-aware outcome. `depositRequired`
      // is computed by the caller via `provisionalDepositRequired` — the
      // shared deposit-verdict module — so it can never independently drift
      // from it, and it agrees with the confirm-time verdict on whether
      // Stripe is configured for this venue.
      return {
        ...state,
        data: {
          ...state.data,
          depositConfig: action.config,
          depositRequired: action.depositRequired,
        },
      };

    case "SET_VENUE_CONFIG":
      return {
        ...state,
        data: { ...state.data, venueConfig: action.config },
      };

    case "GO_TO_WAITLIST_JOIN":
      return { ...state, step: "waitlist-join" };

    case "WAITLIST_JOINED":
      return {
        step: "waitlist-confirmation",
        data: { ...state.data, waitlistResult: action.result },
      };

    case "SET_GUEST_DETAILS":
      return {
        ...state,
        data: { ...state.data, guestDetails: action.details },
      };

    default:
      return state;
  }
}

export interface BookingFlowActions {
  setSelectedDate: (date: string | null) => void;
  setSelectedEndDate: (date: string | null) => void;
  setPartySize: (size: number) => void;
  goToTimeSlot: () => void;
  goToDateParty: () => void;
  setSlots: (slots: TimeSlot[]) => void;
  setSlotsError: (error: string) => void;
  selectSlotAndHold: (slot: TimeSlot) => Promise<void>;
  confirmReservation: (details: GuestDetails) => Promise<void>;
  handleDepositSuccess: (paymentIntentId: string) => void;
  goBackToGuestDetails: () => void;
  resetFlow: () => void;
  setDepositConfig: (config: DepositConfig | null) => void;
  goToWaitlistJoin: () => void;
  handleWaitlistJoined: (result: WaitlistResult) => void;
  setGuestDetails: (details: GuestDetails) => void;
}

export interface BookingFlowResult {
  state: BookingStep;
  data: BookingFlowData;
  actions: BookingFlowActions;
  /** The step set for this flow, derived from `data.depositRequired` — the single source of truth. */
  stepKeys: BookingStep[];
  /** Index of the current step within `stepKeys`; always valid since both step sets share it. */
  currentStepIndex: number;
}

export interface UseBookingFlowDeps {
  /** The public (unauthenticated) api client — the injected seam for the whole flow's effects. */
  api: BookingWidgetApiClient;
  venueId: string;
  /**
   * Slug backing every public endpoint this flow calls — venue config, guest
   * risk, and (since #4487) the whole hold lifecycle, which now goes through
   * `/public/v1/venues/:slug/holds` instead of the authenticated staff hold
   * routes. Omitting it skips deposit config and risk gating as before, and
   * additionally makes holding impossible: `selectSlotAndHold` reports an
   * error rather than calling a route that would 401.
   */
  venueSlug?: string;
  /** Present when the venue's Stripe integration is configured; required (with venueSlug) for a deposit to ever be required. */
  stripePublishableKey?: string;
  /**
   * Notified whenever the flow's active (unconfirmed) hold changes —
   * created, released, expired, or consumed by a successful confirm. Lets
   * the embedding page track the hold so it can release it if the guest
   * closes the tab before confirming (#4978). `sessionId` travels alongside
   * the hold id because releasing a hold requires the same `x-session-id`
   * used to create it, which lives inside `api.holds`, not component state.
   */
  onHoldChange?: (info: { holdId: string; sessionId: string | null } | null) => void;
  /**
   * IANA timezone the venue operates in — used to default `selectedDate` to
   * "today" on the venue's clock rather than a UTC midnight boundary
   * (#4981). Omit only when unknown; falls back to UTC-based `toDateString`.
   */
  venueTimezone?: string;
}

export function useBookingFlow({
  api,
  venueId,
  venueSlug,
  stripePublishableKey,
  onHoldChange,
  venueTimezone,
}: UseBookingFlowDeps): BookingFlowResult {
  const [flowState, dispatch] = useReducer(reducer, venueTimezone, createInitialState);

  // Ref pattern (see hospitality app conventions) — onHoldChange is commonly
  // passed as a fresh inline arrow on every render; reading it through a ref
  // keeps the notify-effect below from re-firing on unrelated re-renders.
  const onHoldChangeRef = useRef(onHoldChange);
  useEffect(() => {
    onHoldChangeRef.current = onHoldChange;
  }, [onHoldChange]);

  const setSelectedDate = useCallback((date: string | null) => {
    dispatch({ type: "SET_DATE", date });
  }, []);

  const setSelectedEndDate = useCallback((date: string | null) => {
    dispatch({ type: "SET_END_DATE", date });
  }, []);

  const setPartySize = useCallback((size: number) => {
    dispatch({ type: "SET_PARTY_SIZE", size });
  }, []);

  // Fetch available time slots for the currently selected date/party size.
  // Owned here (not the component) so it can be driven headlessly and reused
  // by both goToTimeSlot and the hold-expiry timer below.
  const fetchSlots = useCallback(async (): Promise<TimeSlot[]> => {
    if (!flowState.data.selectedDate) return [];
    const response = await api.availability.getTimeSlots({
      venueId,
      date: flowState.data.selectedDate,
      partySize: flowState.data.partySize,
    });
    return response.filter((slot) => slot.available);
  }, [api, venueId, flowState.data.selectedDate, flowState.data.partySize]);

  // Release a hold by ID — errors are ignored, the hold expires anyway.
  // Goes through the slug-scoped public route (#4487); a hold can only exist
  // when venueSlug is set, so the guard is just for the type.
  const releaseHold = useCallback(
    async (holdId: string) => {
      if (!venueSlug) return;
      try {
        await api.holds.releaseForVenue(venueSlug, holdId);
      } catch {
        // Ignore — hold expires anyway
      }
    },
    [api, venueSlug]
  );

  // Guest-risk lookup — owned here (not the component) so the risk-gated
  // deposit override is exercisable headlessly through this hook alone.
  const fetchGuestRisk = useCallback(
    async (email?: string, phone?: string): Promise<boolean> => {
      if (!venueSlug || (!email && !phone)) return false;
      try {
        const result = await api.publicVenue.guestRisk(venueSlug, email ? { email } : { phone });
        return result.requiresDeposit;
      } catch {
        return false;
      }
    },
    [api, venueSlug]
  );

  // Fetch the venue's public deposit config once, when venueSlug is present.
  // Owned here (not the component) so it's exercisable headlessly.
  useEffect(() => {
    if (!venueSlug) return;

    const fetchDepositConfig = async () => {
      try {
        const venueConfig = await api.venues.getPublicConfig(venueSlug);
        // Stored in full (not just the deposit portion) so ConfirmationView
        // can thread name/ianaTimezone through for "Add to calendar" — set
        // unconditionally, unlike the deposit config below.
        dispatch({ type: "SET_VENUE_CONFIG", config: venueConfig });
        // Gate on whether a deposit was ever configured (amountCents
        // present), not on the venue's general `.enabled` flag — a venue
        // that configured then disabled its general policy must still
        // surface its deposit terms so the risky-guest override in
        // effectiveDepositPolicy can apply them. A venue that never
        // configured a deposit at all (amountCents null) leaves
        // depositConfig null, same as before.
        if (venueConfig.deposit.amountCents != null) {
          const config: DepositConfig = {
            enabled: venueConfig.deposit.enabled,
            depositType: venueConfig.deposit.depositType ?? "flat",
            amountCents: venueConfig.deposit.amountCents,
            currency: venueConfig.currencyCode.toLowerCase(),
            freeCancellationHours: venueConfig.deposit.freeCancellationHours,
            lateCancellationFeePercent: venueConfig.deposit.lateCancellationFeePercent,
            noShowFeePercent: venueConfig.deposit.noShowFeePercent,
          };
          dispatch({
            type: "SET_DEPOSIT_CONFIG",
            config,
            depositRequired: provisionalDepositRequired(config, venueSlug, stripePublishableKey),
          });
        }
      } catch {
        // Non-fatal — proceed without deposit
      }
    };

    fetchDepositConfig();
  }, [venueSlug, stripePublishableKey, api]);

  const goToTimeSlot = useCallback(() => {
    const holdId = flowState.data.hold?.id;
    if (holdId) {
      releaseHold(holdId);
    }
    dispatch({ type: "GO_TO_TIME_SLOT" });
    fetchSlots()
      .then((slots) => dispatch({ type: "SET_SLOTS", slots }))
      .catch((err: unknown) => {
        dispatch({ type: "SET_SLOTS_ERROR", error: describeApiError(err).detail });
      });
  }, [flowState.data.hold, releaseHold, fetchSlots]);

  const goToDateParty = useCallback(() => {
    const holdId = flowState.data.hold?.id;
    if (holdId) {
      releaseHold(holdId);
    }
    dispatch({ type: "GO_TO_DATE_PARTY" });
  }, [flowState.data.hold, releaseHold]);

  const setSlots = useCallback((slots: TimeSlot[]) => {
    dispatch({ type: "SET_SLOTS", slots });
  }, []);

  const setSlotsError = useCallback((error: string) => {
    dispatch({ type: "SET_SLOTS_ERROR", error });
  }, []);

  const selectSlotAndHold = useCallback(
    async (slot: TimeSlot): Promise<void> => {
      if (!flowState.data.selectedDate) return;
      dispatch({ type: "HOLD_START", slot });
      if (!venueSlug) {
        dispatch({ type: "HOLD_ERROR", error: MISSING_VENUE_SLUG_ERROR });
        return;
      }
      try {
        // Slug-scoped public route (#4487): the server resolves the venue from
        // the slug and derives the hold's end time and duration from the
        // venue's own settings, so neither is sent from here.
        const { hold } = await api.holds.createForVenue(venueSlug, {
          date: flowState.data.selectedDate,
          startTime: slot.time,
          partySize: flowState.data.partySize,
        });
        dispatch({ type: "HOLD_SUCCESS", hold, slot });
      } catch (err) {
        dispatch({ type: "HOLD_ERROR", error: describeApiError(err).detail });
      }
    },
    [api, venueSlug, flowState.data.selectedDate, flowState.data.partySize]
  );

  const confirmReservation = useCallback(
    async (details: GuestDetails): Promise<void> => {
      // A hold can only exist when venueSlug is set (selectSlotAndHold refuses
      // otherwise), so the slug guard here is just for the type.
      if (!flowState.data.hold || !venueSlug) return;

      // Only check guest risk when it could actually change the verdict
      // (guestRiskMatters — the shared deposit-verdict module's own gating)
      // — avoids an unnecessary lookup, and avoids sending guest PII
      // (email/phone) when there's no deposit flow to gate.
      const guestIsRisky = guestRiskMatters(
        flowState.data.depositConfig,
        venueSlug,
        stripePublishableKey
      )
        ? await fetchGuestRisk(details.email || undefined, details.phone || undefined)
        : false;

      const depositConfig = effectiveDepositPolicy({
        depositConfig: flowState.data.depositConfig,
        venueSlug,
        stripePublishableKey,
        guestIsRisky,
      });

      dispatch({ type: "CONFIRM_START" });
      try {
        const { reservation, manageToken } = await api.holds.confirmForVenue(
          venueSlug,
          flowState.data.hold.id,
          {
            guestName: details.name,
            guestEmail: details.email || undefined,
            guestPhone: details.phone || undefined,
            notes: details.notes || undefined,
          }
        );
        // `depositConfig` is the resolved output of effectiveDepositPolicy —
        // per its contract, a non-null result (which may itself carry
        // `enabled: false` on the risky-guest override path) means a deposit
        // is required. Checking `.enabled` here would silently drop that
        // override.
        if (depositConfig) {
          dispatch({
            type: "CONFIRM_SUCCESS_WITH_DEPOSIT",
            reservation,
            manageToken: manageToken ?? null,
          });
        } else {
          dispatch({
            type: "CONFIRM_SUCCESS_NO_DEPOSIT",
            reservation,
            manageToken: manageToken ?? null,
          });
        }
      } catch (err) {
        dispatch({ type: "CONFIRM_ERROR", error: describeApiError(err).detail });
      }
    },
    [
      api,
      flowState.data.hold,
      flowState.data.depositConfig,
      venueSlug,
      stripePublishableKey,
      fetchGuestRisk,
    ]
  );

  const handleDepositSuccess = useCallback((paymentIntentId: string) => {
    dispatch({ type: "DEPOSIT_SUCCESS", paymentIntentId });
  }, []);

  const goBackToGuestDetails = useCallback(() => {
    dispatch({ type: "GO_BACK_TO_GUEST_DETAILS" });
  }, []);

  const resetFlow = useCallback(() => {
    dispatch({ type: "RESET", selectedDate: todayInTimezone(new Date(), venueTimezone) });
  }, [venueTimezone]);

  const setDepositConfig = useCallback(
    (config: DepositConfig | null) => {
      dispatch({
        type: "SET_DEPOSIT_CONFIG",
        config,
        depositRequired: provisionalDepositRequired(config, venueSlug, stripePublishableKey),
      });
    },
    [venueSlug, stripePublishableKey]
  );

  const goToWaitlistJoin = useCallback(() => {
    dispatch({ type: "GO_TO_WAITLIST_JOIN" });
  }, []);

  const handleWaitlistJoined = useCallback((result: WaitlistResult) => {
    dispatch({ type: "WAITLIST_JOINED", result });
  }, []);

  const setGuestDetails = useCallback((details: GuestDetails) => {
    dispatch({ type: "SET_GUEST_DETAILS", details });
  }, []);

  // Hold-expiry timer — captured hold in closure; effect restarts on every
  // hold change. Owned here (not the component) so expiry + availability
  // reload are exercisable headlessly through this hook alone.
  useEffect(() => {
    if (!flowState.data.hold) return undefined;
    const capturedHold = flowState.data.hold;

    const interval = setInterval(() => {
      if (new Date() >= new Date(capturedHold.expiresAt)) {
        dispatch({ type: "EXPIRE_HOLD" });
        fetchSlots()
          .then((slots) => dispatch({ type: "SET_SLOTS", slots }))
          .catch(() =>
            dispatch({ type: "SET_SLOTS_ERROR", error: "Failed to reload availability" })
          );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [flowState.data.hold, fetchSlots]);

  // Notifies onHoldChange whenever the "releasable" hold changes. Once the
  // flow reaches "confirmation" the hold has been consumed into a real
  // reservation — nothing left to release — even though `data.hold` itself
  // is never cleared by the reducer.
  const activeHoldId = flowState.step === "confirmation" ? null : (flowState.data.hold?.id ?? null);
  useEffect(() => {
    onHoldChangeRef.current?.(
      activeHoldId ? { holdId: activeHoldId, sessionId: api.holds.getSessionId() } : null
    );
  }, [activeHoldId, api]);

  // Render-time derivation — single source of truth for the step set and
  // indicator. Both step sets share the same indices for every step before
  // "payment", so the index is always valid regardless of which set is active.
  const stepKeys = deriveStepKeys(flowState.data.depositRequired);
  const currentStepIndex = stepKeys.indexOf(flowState.step);

  return {
    state: flowState.step,
    data: flowState.data,
    stepKeys,
    currentStepIndex,
    actions: {
      setSelectedDate,
      setSelectedEndDate,
      setPartySize,
      goToTimeSlot,
      goToDateParty,
      setSlots,
      setSlotsError,
      selectSlotAndHold,
      confirmReservation,
      handleDepositSuccess,
      goBackToGuestDetails,
      resetFlow,
      setDepositConfig,
      goToWaitlistJoin,
      handleWaitlistJoined,
      setGuestDetails,
    },
  };
}
