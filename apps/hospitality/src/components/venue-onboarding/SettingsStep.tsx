import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Stack, Input, Button } from "@mattbutlerengineering/rialto";
import { localeRuntime } from "../../i18n/runtime.js";
import { invalidBookingRules } from "../availability/booking-rules.js";
import { SETTINGS_DEFAULTS as DEFAULTS } from "./settings-defaults.js";
import styles from "./venue-onboarding.module.css";

export interface SettingsData {
  defaultReservationDuration: string;
  maxPartySize: string;
  advanceBookingDays: string;
}

/**
 * Recommended settings for the "Use recommended settings" one-click action and
 * the wizard's initial pre-fill (see `INITIAL_SETTINGS` in useOnboardingWizard.ts).
 * Single source of truth — do not duplicate these values elsewhere.
 */
export const RECOMMENDED_SETTINGS: SettingsData = {
  defaultReservationDuration: "90",
  maxPartySize: "8",
  advanceBookingDays: "30",
};

interface SettingsStepProps {
  data: SettingsData;
  errors: Partial<Record<keyof SettingsData, string>>;
  onChange: (data: SettingsData) => void;
  onValidate?: () => void;
  /** Advances the wizard to the next step. Wired to the "Use recommended settings" action. */
  onAdvance: () => void;
}

/**
 * Validate settings step data. All fields are optional; only rejects invalid non-blank values.
 * Largest party and days ahead follow Availability → Booking rules, which edits them later: whole
 * numbers in the same ranges, 0 days meaning today only. Onboarding can't save what that refuses.
 */
export function validateSettings(
  data: SettingsData,
  t: TFunction = localeRuntime.i18n.t
): Partial<Record<keyof SettingsData, string>> {
  const errors: Partial<Record<keyof SettingsData, string>> = {};

  if (data.defaultReservationDuration !== "") {
    const val = Number(data.defaultReservationDuration);
    if (isNaN(val) || val <= 0) {
      errors.defaultReservationDuration = t("onboarding.settings.errors.durationInvalid");
    }
  }

  const invalid = invalidBookingRules({
    daysAhead: data.advanceBookingDays,
    noticeHours: "",
    largestParty: data.maxPartySize,
  });
  if (invalid.includes("largestParty")) {
    errors.maxPartySize = t("availability.bookingRules.invalid.largestParty");
  }
  if (invalid.includes("daysAhead")) {
    errors.advanceBookingDays = t("availability.bookingRules.invalid.daysAhead");
  }

  return errors;
}

export function SettingsStep({ data, errors, onChange, onValidate, onAdvance }: SettingsStepProps) {
  const { t } = useTranslation();
  const handleUseRecommended = () => {
    onChange(RECOMMENDED_SETTINGS);
    onAdvance();
  };

  return (
    <div className={styles.stepContainer}>
      <Button variant="primary" onClick={handleUseRecommended}>
        {t("onboarding.settings.useRecommended")}
      </Button>
      <Stack gap="md">
        <Input
          label={t("onboarding.settings.durationLabel")}
          type="number"
          value={data.defaultReservationDuration}
          onChange={(e) => onChange({ ...data, defaultReservationDuration: e.target.value })}
          onBlur={onValidate}
          placeholder={t("onboarding.settings.defaultPlaceholder", {
            value: DEFAULTS.defaultReservationDuration,
          })}
          error={errors.defaultReservationDuration !== undefined}
          hint={
            errors.defaultReservationDuration ??
            t("onboarding.settings.durationHint", { value: DEFAULTS.defaultReservationDuration })
          }
          showOptional
        />

        <Input
          label={t("availability.bookingRules.largestParty")}
          type="number"
          value={data.maxPartySize}
          onChange={(e) => onChange({ ...data, maxPartySize: e.target.value })}
          onBlur={onValidate}
          placeholder={t("onboarding.settings.defaultPlaceholder", {
            value: DEFAULTS.maxPartySize,
          })}
          error={errors.maxPartySize !== undefined}
          hint={
            errors.maxPartySize ??
            t("onboarding.settings.maxPartyHint", { value: DEFAULTS.maxPartySize })
          }
          showOptional
        />

        <Input
          label={t("availability.bookingRules.daysAhead")}
          type="number"
          value={data.advanceBookingDays}
          onChange={(e) => onChange({ ...data, advanceBookingDays: e.target.value })}
          onBlur={onValidate}
          // Blank sets no window: the service then lets guests book any date ahead.
          placeholder={t("onboarding.settings.advanceNoLimit")}
          error={errors.advanceBookingDays !== undefined}
          hint={errors.advanceBookingDays ?? t("onboarding.settings.advanceHint")}
          showOptional
        />
      </Stack>
    </div>
  );
}
