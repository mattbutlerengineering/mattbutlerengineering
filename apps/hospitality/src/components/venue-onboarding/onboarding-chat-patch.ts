import { localeRuntime } from "../../i18n/runtime.js";
import {
  isOfferedCurrency,
  isOfferedTimezone,
  validateLocationTime,
  type LocationTimeData,
} from "./LocationTimeStep.js";
import { validateSettings, type SettingsData } from "./SettingsStep.js";

/**
 * The gate a chat-proposed form patch passes before it reaches the onboarding wizard (#9381).
 * The model's tool call is untrusted output: it is shape-checked here, merged over the step's
 * current data, and run through that step's own validator. Only an `applied` result may be
 * dispatched as `SET_STEP_DATA`; a `rejected` one is shown to the owner, never applied. Pure —
 * no server write happens here, so nothing is saved before Launch.
 */

const PATCH_FIELDS = {
  locationTime: ["ianaTimezone", "currencyCode"],
  settings: ["defaultReservationDuration", "maxPartySize", "advanceBookingDays"],
} as const satisfies {
  locationTime: readonly (keyof LocationTimeData)[];
  settings: readonly (keyof SettingsData)[];
};

export interface OnboardingPatchTarget {
  locationTime: LocationTimeData;
  settings: SettingsData;
}

type PatchStep = keyof OnboardingPatchTarget;

export type OnboardingPatchResult =
  | { kind: "applied"; step: "locationTime"; data: LocationTimeData }
  | { kind: "applied"; step: "settings"; data: SettingsData }
  | { kind: "rejected"; step: PatchStep; errors: Partial<Record<string, string>> }
  | { kind: "malformed" };

const MALFORMED: OnboardingPatchResult = { kind: "malformed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPatchStep(value: unknown): value is PatchStep {
  return value === "locationTime" || value === "settings";
}

/** Returns the patch's fields when every key is known for the step and every value a string. */
function readFields(step: PatchStep, data: unknown): Record<string, string> | null {
  if (!isRecord(data)) return null;
  const allowed: readonly string[] = PATCH_FIELDS[step];
  const entries = Object.entries(data);
  const valid = entries.every(([key, value]) => allowed.includes(key) && typeof value === "string");
  return valid ? Object.fromEntries(entries as [string, string][]) : null;
}

/**
 * A value the form cannot show would render blank yet still be saved at Launch, so it is refused
 * here: the validator only checks a field is present, not that the form offers it.
 */
function notOfferedErrors(fields: Record<string, string>): Partial<Record<string, string>> {
  const t = localeRuntime.i18n.t;
  const errors: Partial<Record<string, string>> = {};
  const zone = fields.ianaTimezone;
  if (zone !== undefined && zone !== "" && !isOfferedTimezone(zone)) {
    errors.ianaTimezone = t("onboarding.chat.notOffered.ianaTimezone", { value: zone });
  }
  const currency = fields.currencyCode;
  if (currency !== undefined && currency !== "" && !isOfferedCurrency(currency)) {
    errors.currencyCode = t("onboarding.chat.notOffered.currencyCode", { value: currency });
  }
  return errors;
}

export function applyOnboardingPatch(
  current: OnboardingPatchTarget,
  patch: unknown
): OnboardingPatchResult {
  if (!isRecord(patch) || !isPatchStep(patch.step)) return MALFORMED;
  const fields = readFields(patch.step, patch.data);
  if (fields === null) return MALFORMED;

  if (patch.step === "locationTime") {
    const data: LocationTimeData = { ...current.locationTime, ...fields };
    const errors = { ...validateLocationTime(data), ...notOfferedErrors(fields) };
    return Object.keys(errors).length === 0
      ? { kind: "applied", step: "locationTime", data }
      : { kind: "rejected", step: "locationTime", errors };
  }

  const data: SettingsData = { ...current.settings, ...fields };
  const errors = validateSettings(data);
  return Object.keys(errors).length === 0
    ? { kind: "applied", step: "settings", data }
    : { kind: "rejected", step: "settings", errors };
}
