import { useReducer, useCallback } from "react";
import type { TimeSlot, ReservationHold, Reservation, DepositConfig } from "@mbe/types";

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
  confirmLoading: boolean;
  confirmError: string | null;
  depositConfig: DepositConfig | null;
  depositPaymentIntentId: string | null;
  waitlistResult: WaitlistResult | null;
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
  | { type: "CONFIRM_SUCCESS_NO_DEPOSIT"; reservation: Reservation }
  | { type: "CONFIRM_SUCCESS_WITH_DEPOSIT"; reservation: Reservation }
  | { type: "CONFIRM_ERROR"; error: string }
  | { type: "DEPOSIT_SUCCESS"; paymentIntentId: string }
  | { type: "GO_BACK_TO_GUEST_DETAILS" }
  | { type: "EXPIRE_HOLD" }
  | { type: "RESET" }
  | { type: "SET_DEPOSIT_CONFIG"; config: DepositConfig | null }
  | { type: "GO_TO_WAITLIST_JOIN" }
  | { type: "WAITLIST_JOINED"; result: WaitlistResult };

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
  confirmLoading: false,
  confirmError: null,
  depositConfig: null,
  depositPaymentIntentId: null,
  waitlistResult: null,
};

const INITIAL_STATE: BookingFlowState = {
  step: "date-party",
  data: INITIAL_DATA,
};

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
          confirmLoading: false,
          confirmError: null,
        },
      };

    case "CONFIRM_SUCCESS_WITH_DEPOSIT":
      return {
        step: "payment",
        data: {
          ...state.data,
          reservation: action.reservation,
          confirmLoading: false,
          confirmError: null,
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
      return INITIAL_STATE;

    case "SET_DEPOSIT_CONFIG":
      return { ...state, data: { ...state.data, depositConfig: action.config } };

    case "GO_TO_WAITLIST_JOIN":
      return { ...state, step: "waitlist-join" };

    case "WAITLIST_JOINED":
      return {
        step: "waitlist-confirmation",
        data: { ...state.data, waitlistResult: action.result },
      };

    default:
      return state;
  }
}

export interface BookingFlowActions {
  setSelectedDate: (date: string | null) => void;
  setSelectedEndDate: (date: string | null) => void;
  setPartySize: (size: number) => void;
  goToTimeSlot: (
    fetchSlots?: () => Promise<TimeSlot[]>,
    releaseHold?: (holdId: string) => Promise<void>
  ) => void;
  goToDateParty: (releaseHold?: (holdId: string) => Promise<void>) => void;
  setSlots: (slots: TimeSlot[]) => void;
  setSlotsError: (error: string) => void;
  selectSlotAndHold: (slot: TimeSlot, holdPromise: Promise<ReservationHold>) => Promise<void>;
  confirmReservation: (
    reservationPromise: Promise<Reservation>,
    depositConfig: DepositConfig | null
  ) => Promise<void>;
  handleDepositSuccess: (paymentIntentId: string) => void;
  goBackToGuestDetails: () => void;
  expireHold: () => void;
  resetFlow: () => void;
  setDepositConfig: (config: DepositConfig | null) => void;
  goToWaitlistJoin: () => void;
  handleWaitlistJoined: (result: WaitlistResult) => void;
}

export interface BookingFlowResult {
  state: BookingStep;
  data: BookingFlowData;
  actions: BookingFlowActions;
}

export function useBookingFlow(): BookingFlowResult {
  const [flowState, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setSelectedDate = useCallback((date: string | null) => {
    dispatch({ type: "SET_DATE", date });
  }, []);

  const setSelectedEndDate = useCallback((date: string | null) => {
    dispatch({ type: "SET_END_DATE", date });
  }, []);

  const setPartySize = useCallback((size: number) => {
    dispatch({ type: "SET_PARTY_SIZE", size });
  }, []);

  const goToTimeSlot = useCallback(
    (fetchSlots?: () => Promise<TimeSlot[]>, releaseHold?: (holdId: string) => Promise<void>) => {
      const holdId = flowState.data.hold?.id;
      if (holdId && releaseHold) {
        releaseHold(holdId).catch(() => {
          // Ignore — hold expires anyway
        });
      }
      dispatch({ type: "GO_TO_TIME_SLOT" });
      if (fetchSlots) {
        fetchSlots()
          .then((slots) => dispatch({ type: "SET_SLOTS", slots }))
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : "Failed to load availability";
            dispatch({ type: "SET_SLOTS_ERROR", error: msg });
          });
      }
    },
    [flowState.data.hold]
  );

  const goToDateParty = useCallback(
    (releaseHold?: (holdId: string) => Promise<void>) => {
      const holdId = flowState.data.hold?.id;
      if (holdId && releaseHold) {
        releaseHold(holdId).catch(() => {
          // Ignore — hold expires anyway
        });
      }
      dispatch({ type: "GO_TO_DATE_PARTY" });
    },
    [flowState.data.hold]
  );

  const setSlots = useCallback((slots: TimeSlot[]) => {
    dispatch({ type: "SET_SLOTS", slots });
  }, []);

  const setSlotsError = useCallback((error: string) => {
    dispatch({ type: "SET_SLOTS_ERROR", error });
  }, []);

  const selectSlotAndHold = useCallback(
    async (slot: TimeSlot, holdPromise: Promise<ReservationHold>): Promise<void> => {
      dispatch({ type: "HOLD_START", slot });
      try {
        const hold = await holdPromise;
        dispatch({ type: "HOLD_SUCCESS", hold, slot });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to hold time slot";
        dispatch({ type: "HOLD_ERROR", error: msg });
      }
    },
    []
  );

  const confirmReservation = useCallback(
    async (
      reservationPromise: Promise<Reservation>,
      depositConfig: DepositConfig | null
    ): Promise<void> => {
      dispatch({ type: "CONFIRM_START" });
      try {
        const reservation = await reservationPromise;
        if (depositConfig?.enabled) {
          dispatch({ type: "CONFIRM_SUCCESS_WITH_DEPOSIT", reservation });
        } else {
          dispatch({ type: "CONFIRM_SUCCESS_NO_DEPOSIT", reservation });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to confirm reservation";
        dispatch({ type: "CONFIRM_ERROR", error: msg });
      }
    },
    []
  );

  const handleDepositSuccess = useCallback((paymentIntentId: string) => {
    dispatch({ type: "DEPOSIT_SUCCESS", paymentIntentId });
  }, []);

  const goBackToGuestDetails = useCallback(() => {
    dispatch({ type: "GO_BACK_TO_GUEST_DETAILS" });
  }, []);

  const expireHold = useCallback(() => {
    dispatch({ type: "EXPIRE_HOLD" });
  }, []);

  const resetFlow = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const setDepositConfig = useCallback((config: DepositConfig | null) => {
    dispatch({ type: "SET_DEPOSIT_CONFIG", config });
  }, []);

  const goToWaitlistJoin = useCallback(() => {
    dispatch({ type: "GO_TO_WAITLIST_JOIN" });
  }, []);

  const handleWaitlistJoined = useCallback((result: WaitlistResult) => {
    dispatch({ type: "WAITLIST_JOINED", result });
  }, []);

  return {
    state: flowState.step,
    data: flowState.data,
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
      expireHold,
      resetFlow,
      setDepositConfig,
      goToWaitlistJoin,
      handleWaitlistJoined,
    },
  };
}
