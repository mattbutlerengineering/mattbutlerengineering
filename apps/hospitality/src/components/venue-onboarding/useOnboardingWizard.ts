import { useReducer, useCallback, useMemo } from "react";
import type { OperatingHours, CreateVenueRequest, VenueSettings, Venue } from "@mbe/types";
import { validateBasicInfo, type BasicInfoData, type SlugStatus } from "./BasicInfoStep.js";
import { validateLocationTime, detectTimezone, type LocationTimeData } from "./LocationTimeStep.js";
import {
  validateOperatingHours,
  type OperatingHoursValidationErrors,
} from "./OperatingHoursStep.js";
import { validateSettings, RECOMMENDED_SETTINGS, type SettingsData } from "./SettingsStep.js";

export const TOTAL_STEPS = 5;

export interface OnboardingWizardData {
  basicInfo: BasicInfoData;
  locationTime: LocationTimeData;
  operatingHours: OperatingHours;
  settings: SettingsData;
}

export interface OnboardingWizardErrors {
  basicInfo: Partial<Record<keyof BasicInfoData, string>>;
  locationTime: Partial<Record<keyof LocationTimeData, string>>;
  operatingHours: OperatingHoursValidationErrors | null;
  settings: Partial<Record<keyof SettingsData, string>>;
}

interface OnboardingWizardState {
  step: number;
  data: OnboardingWizardData;
  errors: OnboardingWizardErrors;
  highestStepReached: number;
  slugStatus: SlugStatus;
  isSubmitting: boolean;
  submitError: string | null;
}

type OnboardingWizardAction =
  | { type: "SET_STEP_DATA"; step: "basicInfo"; data: BasicInfoData }
  | { type: "SET_STEP_DATA"; step: "locationTime"; data: LocationTimeData }
  | { type: "SET_STEP_DATA"; step: "operatingHours"; data: OperatingHours }
  | { type: "SET_STEP_DATA"; step: "settings"; data: SettingsData }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO_STEP"; step: number }
  | { type: "VALIDATE" }
  | { type: "SLUG_CHECK_START" }
  | { type: "SLUG_CHECK_RESULT"; status: "taken" | "available" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; error: string };

const INITIAL_BASIC_INFO: BasicInfoData = { name: "", slug: "", venueGroupId: "" };

const INITIAL_LOCATION_TIME: LocationTimeData = {
  ianaTimezone: detectTimezone(),
  currencyCode: "USD",
};

const INITIAL_OPERATING_HOURS: OperatingHours = {};

// Pre-fill the settings step with recommended values so the wizard opens
// ready to submit — the "Use recommended settings" one-click action in
// SettingsStep reuses this same constant as its single source of truth.
const INITIAL_SETTINGS: SettingsData = RECOMMENDED_SETTINGS;

const INITIAL_STATE: OnboardingWizardState = {
  step: 1,
  data: {
    basicInfo: INITIAL_BASIC_INFO,
    locationTime: INITIAL_LOCATION_TIME,
    operatingHours: INITIAL_OPERATING_HOURS,
    settings: INITIAL_SETTINGS,
  },
  errors: {
    basicInfo: {},
    locationTime: {},
    operatingHours: null,
    settings: {},
  },
  highestStepReached: 1,
  slugStatus: "idle",
  isSubmitting: false,
  submitError: null,
};

/** Recompute validation errors for the wizard's current step. Pure. */
function runStepValidation(state: OnboardingWizardState): {
  state: OnboardingWizardState;
  valid: boolean;
} {
  switch (state.step) {
    case 1: {
      const errors = validateBasicInfo(state.data.basicInfo, state.slugStatus);
      return {
        state: { ...state, errors: { ...state.errors, basicInfo: errors } },
        valid: Object.keys(errors).length === 0,
      };
    }
    case 2: {
      const errors = validateLocationTime(state.data.locationTime);
      return {
        state: { ...state, errors: { ...state.errors, locationTime: errors } },
        valid: Object.keys(errors).length === 0,
      };
    }
    case 3: {
      const errors = validateOperatingHours(state.data.operatingHours);
      return {
        state: { ...state, errors: { ...state.errors, operatingHours: errors } },
        valid: errors === null,
      };
    }
    case 4: {
      const errors = validateSettings(state.data.settings);
      return {
        state: { ...state, errors: { ...state.errors, settings: errors } },
        valid: Object.keys(errors).length === 0,
      };
    }
    default:
      return { state, valid: true };
  }
}

function reducer(
  state: OnboardingWizardState,
  action: OnboardingWizardAction
): OnboardingWizardState {
  switch (action.type) {
    case "SET_STEP_DATA":
      switch (action.step) {
        case "basicInfo": {
          const slugChanged = action.data.slug !== state.data.basicInfo.slug;
          return {
            ...state,
            data: { ...state.data, basicInfo: action.data },
            slugStatus: slugChanged ? "idle" : state.slugStatus,
          };
        }
        case "locationTime":
          return { ...state, data: { ...state.data, locationTime: action.data } };
        case "operatingHours":
          return {
            ...state,
            data: { ...state.data, operatingHours: action.data },
            errors: { ...state.errors, operatingHours: null },
          };
        case "settings":
          return { ...state, data: { ...state.data, settings: action.data } };
        default:
          return state;
      }

    case "NEXT": {
      const { state: validated, valid } = runStepValidation(state);
      if (!valid) return validated;
      const nextStep = Math.min(validated.step + 1, TOTAL_STEPS);
      return {
        ...validated,
        step: nextStep,
        highestStepReached: Math.max(validated.highestStepReached, nextStep),
      };
    }

    case "VALIDATE":
      // Recompute the current step's errors without advancing — restores the
      // on-blur field validation the step inputs wire to onValidate.
      return runStepValidation(state).state;

    case "BACK":
      return { ...state, step: Math.max(state.step - 1, 1) };

    case "GO_TO_STEP":
      if (action.step >= 1 && action.step <= state.highestStepReached) {
        return { ...state, step: action.step };
      }
      return state;

    case "SLUG_CHECK_START":
      return { ...state, slugStatus: "checking" };

    case "SLUG_CHECK_RESULT": {
      if (action.status === "taken") {
        return {
          ...state,
          slugStatus: "taken",
          errors: {
            ...state.errors,
            basicInfo: {
              ...state.errors.basicInfo,
              slug: "A venue with this slug already exists",
            },
          },
        };
      }
      const { slug: _removed, ...rest } = state.errors.basicInfo;
      return { ...state, slugStatus: "available", errors: { ...state.errors, basicInfo: rest } };
    }

    case "SUBMIT_START":
      return { ...state, isSubmitting: true, submitError: null };

    case "SUBMIT_SUCCESS":
      return { ...state, isSubmitting: false, submitError: null };

    case "SUBMIT_ERROR":
      return { ...state, isSubmitting: false, submitError: action.error };

    default:
      return state;
  }
}

export interface OnboardingWizardActions {
  setStepData: <K extends keyof OnboardingWizardData>(
    step: K,
    data: OnboardingWizardData[K]
  ) => void;
  next: () => void;
  back: () => void;
  goToStep: (step: number) => void;
  validateStep: () => void;
  checkSlugAvailability: (checkPromise: Promise<unknown>) => Promise<void>;
  submit: (venuePromise: Promise<Venue>) => Promise<Venue>;
}

export interface OnboardingWizardResult {
  step: number;
  data: OnboardingWizardData;
  errors: OnboardingWizardErrors;
  highestStepReached: number;
  slugStatus: SlugStatus;
  isSubmitting: boolean;
  submitError: string | null;
  actions: OnboardingWizardActions;
}

export function useOnboardingWizard(): OnboardingWizardResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setStepData = useCallback(
    <K extends keyof OnboardingWizardData>(step: K, data: OnboardingWizardData[K]) => {
      switch (step) {
        case "basicInfo":
          dispatch({ type: "SET_STEP_DATA", step: "basicInfo", data: data as BasicInfoData });
          return;
        case "locationTime":
          dispatch({
            type: "SET_STEP_DATA",
            step: "locationTime",
            data: data as LocationTimeData,
          });
          return;
        case "operatingHours":
          dispatch({
            type: "SET_STEP_DATA",
            step: "operatingHours",
            data: data as OperatingHours,
          });
          return;
        case "settings":
          dispatch({ type: "SET_STEP_DATA", step: "settings", data: data as SettingsData });
          return;
      }
    },
    []
  );

  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const goToStep = useCallback((step: number) => dispatch({ type: "GO_TO_STEP", step }), []);
  const validateStep = useCallback(() => dispatch({ type: "VALIDATE" }), []);

  const checkSlugAvailability = useCallback(
    async (checkPromise: Promise<unknown>): Promise<void> => {
      dispatch({ type: "SLUG_CHECK_START" });
      try {
        await checkPromise;
        dispatch({ type: "SLUG_CHECK_RESULT", status: "taken" });
      } catch {
        dispatch({ type: "SLUG_CHECK_RESULT", status: "available" });
      }
    },
    []
  );

  const submit = useCallback(async (venuePromise: Promise<Venue>): Promise<Venue> => {
    dispatch({ type: "SUBMIT_START" });
    try {
      const venue = await venuePromise;
      dispatch({ type: "SUBMIT_SUCCESS" });
      return venue;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create venue. Please try again.";
      dispatch({ type: "SUBMIT_ERROR", error: message });
      throw err;
    }
  }, []);

  // Stabilise the actions object identity across renders. Each callback is
  // already memoized, so this object never changes — consumers can safely list
  // `actions` in effect dependency arrays without re-running every render.
  const actions = useMemo<OnboardingWizardActions>(
    () => ({ setStepData, next, back, goToStep, validateStep, checkSlugAvailability, submit }),
    [setStepData, next, back, goToStep, validateStep, checkSlugAvailability, submit]
  );

  return {
    step: state.step,
    data: state.data,
    errors: state.errors,
    highestStepReached: state.highestStepReached,
    slugStatus: state.slugStatus,
    isSubmitting: state.isSubmitting,
    submitError: state.submitError,
    actions,
  };
}

/** Build the CreateVenueRequest payload from the wizard's collected data. Pure. */
export function buildOnboardingPayload(data: OnboardingWizardData): CreateVenueRequest {
  const payload: CreateVenueRequest = {
    name: data.basicInfo.name.trim(),
    slug: data.basicInfo.slug.trim(),
    ianaTimezone: data.locationTime.ianaTimezone,
    currencyCode: data.locationTime.currencyCode,
  };

  if (data.basicInfo.venueGroupId) {
    payload.venueGroupId = data.basicInfo.venueGroupId;
  }

  if (Object.keys(data.operatingHours).length > 0) {
    payload.operatingHours = data.operatingHours;
  }

  const venueSettings: VenueSettings = {};
  if (data.settings.defaultReservationDuration !== "") {
    venueSettings.defaultReservationDuration = Number(data.settings.defaultReservationDuration);
  }
  if (data.settings.maxPartySize !== "") {
    venueSettings.maxPartySize = Number(data.settings.maxPartySize);
  }
  if (data.settings.advanceBookingDays !== "") {
    venueSettings.maxAdvanceBooking = Number(data.settings.advanceBookingDays);
  }

  if (Object.keys(venueSettings).length > 0) {
    payload.settings = venueSettings;
  }

  return payload;
}
